import logging
import asyncio
from fastapi import HTTPException

from PolyMind.pipeline.extractor import extract
from PolyMind.pipeline.chunker import chunk
from PolyMind.pipeline.embedder import Embedder
from PolyMind.pipeline.indexer import Indexer
from PolyMind.Database import db

logger = logging.getLogger(__name__)

_embedder: Embedder | None = None
_indexer: Indexer | None = None

SCORE_THRESHOLD = -0.1  # discard chunks below this similarity score


def get_embedder() -> Embedder:
    global _embedder
    if _embedder is None:
        _embedder = Embedder()
    return _embedder


def get_indexer() -> Indexer:
    global _indexer
    if _indexer is None:
        _indexer = Indexer()
    return _indexer


# ── Ingestion Pipeline ────────────────────────────────────────
async def run_injest_pipeline(
    file_path: str,
    doc_id: str,
    filename: str,
    user_id: str,
    size_bytes: int = 0,
    output_dir: str = "extracted",
):
    try:
        logger.info(f"[{doc_id}] Pipeline started: {filename} user: {user_id}")

        await db.insert_document(doc_id, user_id, filename, size_bytes)

        embedder = get_embedder()
        indexer = get_indexer()

        pages = extract(file_path)
        chunks = chunk(pages, doc_id)
        vectors = embedder.embed(chunks)
        embedding_ids = await indexer.add_and_persist(vectors)

        await db.save_chunks(chunks, embedding_ids, user_id)
        await db.update_status(doc_id, "ready")

        logger.info(f"[{doc_id}] Pipeline complete")

    except Exception as e:
        await db.update_status(doc_id, "error")
        logger.error(f"[{doc_id}] Pipeline failed: {e}")


# ── Prompt Builder ────────────────────────────────────────────
def build_rag_prompt(question: str, chunks: list[dict]) -> list[dict]:
    context_blocks = []
    for i, c in enumerate(chunks, 1):
        context_blocks.append(
            f"[{i}] {c['filename']} p.{c['page_number']}:\n{c['text']}"
        )
    context_str = "\n---\n".join(context_blocks)

    system_prompt = (
        "You are a helpful assistant. Answer the user's question using "
        "the context below.\n"
        "Rules:\n"
        "- Always write out the actual answer in plain words\n"
        "- Never return only a citation like [1 · p.1] without explanation\n"
        "- If you find the answer, state it clearly then cite: [filename · p.N]\n"
        "- If answer requires reasoning across facts, do it explicitly\n"
        "- Only say 'Not found' if topic is completely absent from context\n\n"
        f"CONTEXT:\n{context_str}"
    )

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": question},
    ]


# ── Query Pipeline ────────────────────────────────────────────
async def run_query_pipeline(
    question: str,
    document_ids: list[str],
    user_id: str,
    top_k: int = 3,
) -> tuple[list[dict], list[dict], list[dict]]:
    """
    Full RAG retrieval pipeline.

    Steps:
      1. Validate each doc_id exists, is ready, and belongs to user
      2. Fetch doc metadata + embed question (overlapped with asyncio)
      3. Search each doc's FAISS index for top-k chunks
      4. Global re-rank all results by similarity score
      5. Filter by score threshold — drop irrelevant chunks
      6. Build LLM prompt messages + citations

    Returns:
        messages  — list[dict]  ready to pass to LLM
        citations — list[dict]  {docName, page, chunk} for frontend
        chunks    — list[dict]  raw top chunks for debugging
    """

    # ── 1. Validate document IDs ──────────────────────────────
    valid_doc_ids = await db.get_ready_doc_ids(user_id)
    valid_set = set(valid_doc_ids)
    invalid = [d for d in document_ids if d not in valid_set]

    if invalid:
        raise HTTPException(
            status_code=404,
            detail=f"Document(s) not found or not ready: {invalid}",
        )

    # ── 2. Fetch doc metadata + embed question in parallel ────
    all_docs_task = asyncio.create_task(db.get_user_documents(user_id))

    embedder = get_embedder()
    query_vector = embedder.embed_query(question)  # sync — runs immediately

    all_docs = await all_docs_task  # await DB while embed runs
    doc_id_to_name = {d["id"]: d["filename"] for d in all_docs}

    logger.info(f"Query embedded — dim={query_vector.shape[0]}")

    # ── 3. Search FAISS index per document ────────────────────
    indexer = get_indexer()
    all_results = []

    for doc_id in document_ids:
        if not indexer.index_exists(doc_id):
            logger.warning(f"[{doc_id}] FAISS index missing — skipping.")
            continue

        results = indexer.search(query_vector, doc_id, top_k=top_k)
        filename = doc_id_to_name.get(doc_id, doc_id)

        for r in results:
            r["filename"] = filename

        all_results.extend(results)
        logger.info(f"[{doc_id}] {len(results)} chunk(s) retrieved.")

    if not all_results:
        raise HTTPException(
            status_code=404,
            detail="No relevant chunks found across the selected documents.",
        )

    # ── 4. Global re-rank by score ────────────────────────────
    all_results.sort(key=lambda x: x["score"], reverse=True)
    top_chunks = all_results[:top_k]

    # ── 5. Score threshold — drop weak chunks ─────────────────
    top_chunks = [c for c in top_chunks if c["score"] >= SCORE_THRESHOLD]

    if not top_chunks:
        raise HTTPException(
            status_code=404,
            detail="No relevant content found. Try rephrasing your question.",
        )

    logger.info(
        f"After threshold filter: {len(top_chunks)} chunk(s) remain "
        f"(scores: {[round(c['score'], 3) for c in top_chunks]})"
    )

    # ── 6. Build prompt + citations ───────────────────────────
    messages = build_rag_prompt(question, top_chunks)

    citations = [
        {
            "docName": c["filename"],
            "page": c["page_number"],
            "chunk": c["text"][:100],  # reduced from 200 → 100
        }
        for c in top_chunks
    ]

    logger.info(f"Query pipeline complete — {len(top_chunks)} chunk(s) → prompt ready.")
    return messages, citations, top_chunks

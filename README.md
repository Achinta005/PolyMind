# PolyMind — AI-Powered Multi-Document Research Assistant

> A production-grade RAG (Retrieval-Augmented Generation) pipeline built with FastAPI, SentenceBERT, FAISS, and Llama 3.2 — enabling semantic search and cited answers across your documents.

---

## Table of Contents

* [Overview](https://www.achintahazra.shop/#overview)
* [Tech Stack](https://www.achintahazra.shop/#tech-stack)
* [Architecture](https://www.achintahazra.shop/#architecture)
* [Phase 1 — Document Ingestion](https://www.achintahazra.shop/#phase-1-document-ingestion)
* [Phase 2 — Query & Chat](https://www.achintahazra.shop/#phase-2-query-chat)
* [API Reference](https://www.achintahazra.shop/#api-reference)
* [Project Structure](https://www.achintahazra.shop/#project-structure)
* [Setup & Installation](https://www.achintahazra.shop/#setup--installation)
* [Configuration](https://www.achintahazra.shop/#configuration)
* [Query Tracker & Stats Dashboard](https://www.achintahazra.shop/#query-tracker--stats-dashboard)
* [Performance & Optimization](https://www.achintahazra.shop/#performance--optimization)
* [Roadmap](https://www.achintahazra.shop/#roadmap)

---

## Overview

PolyMind lets users upload documents (PDF, TXT, DOCX) and ask natural language questions about them. The system uses a custom two-phase RAG pipeline:

1. **Ingestion Phase** — Documents are parsed, chunked, embedded, and indexed into a FAISS vector store
2. **Query Phase** — User questions are semantically matched against indexed chunks, assembled into a prompt, and streamed through a local LLM

Every query is tracked with start time, end time, duration, answer, and chunk scores — accessible via a live HTML dashboard.

---

## Tech Stack

| Layer         | Technology                                       |
| ------------- | ------------------------------------------------ |
| API Framework | FastAPI (Python)                                 |
| Embeddings    | SentenceBERT —`all-MiniLM-L6-v2`(384-dim)     |
| Vector Store  | FAISS —`IndexFlatIP`(exact cosine similarity) |
| LLM           | Llama 3.2 3B via Ollama (Q4_K_M quantized)       |
| LLM Fallback  | HuggingFace Inference API                        |
| Database      | PostgreSQL                                       |
| Streaming     | Server-Sent Events (SSE)                         |
| PDF Parsing   | PyMuPDF                                          |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     USER / FRONTEND                      │
└────────────────┬───────────────────────┬────────────────┘
                 │                       │
          POST /ingest             POST /query
                 │                       │
┌────────────────▼───────────────────────▼────────────────┐
│                   FastAPI ML Service                      │
│                                                           │
│  ┌─────────────────────┐   ┌─────────────────────────┐  │
│  │   INGESTION PHASE   │   │      QUERY PHASE        │  │
│  │                     │   │                         │  │
│  │ Extract → Chunk →   │   │ Embed → FAISS Search →  │  │
│  │ Embed → FAISS Index │   │ Fetch Chunks → Prompt → │  │
│  │ → Save to DB        │   │ LLM → SSE Stream        │  │
│  └─────────────────────┘   └─────────────────────────┘  │
│                                                           │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────────┐  │
│  │  PostgreSQL  │  │    FAISS    │  │  Query Tracker │  │
│  │  (chunks +   │  │  (vectors)  │  │  (JSON log)    │  │
│  │   doc meta)  │  │             │  │                │  │
│  └──────────────┘  └─────────────┘  └────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Phase 1 — Document Ingestion

### Flow

```
User uploads file
      │
      ▼
Validate (size limit, file type, per-user quota)
      │
      ▼
Store raw file to filesystem
      │
      ▼
┌─────────────────────────────────┐
│       INGESTION PIPELINE        │
│                                 │
│  1. extract(file_path)          │  ← PyMuPDF → list of Pages
│         │                       │
│  2. chunk(pages, doc_id)        │  ← sliding window, 512 tokens
│         │                       │     64-token overlap
│  3. embedder.embed(chunks)      │  ← SentenceBERT all-MiniLM-L6-v2
│         │                       │     normalized unit vectors
│  4. indexer.add_and_persist()   │  ← FAISS IndexFlatIP
│         │                       │     saved to faiss_indexes/<doc_id>.index
│  5. db.save_chunks()            │  ← chunk text + metadata → PostgreSQL
│  6. db.update_status("ready")   │
└─────────────────────────────────┘
```

### Chunking Strategy

* **Chunk size:** 512 whitespace-delimited tokens
* **Overlap:** 64 tokens between consecutive chunks
* **Cross-page:** chunks span page boundaries — no content is silently truncated
* **Page tracking:** each chunk records the page it started on for citations

### Database Tables

**`documents`** — one row per uploaded file

```
doc_id | user_id | filename | size_bytes | status | created_at
```

**`chunks`** — one row per text chunk

```
chunk_id | doc_id | user_id | page_number | chunk_index | text | embedding_id
```

### FAISS Index

Each document gets its own index file:

```
faiss_indexes/
  <doc_id>.index       ← FAISS binary index
  <doc_id>.meta.json   ← parallel metadata (chunk_id, text, page)
```

---

## Phase 2 — Query & Chat

### Flow

```
User sends question
      │
      ▼
Validate document IDs (must be "ready" and owned by user)
      │
      ▼
embedder.embed_query(question)
      │  SentenceBERT → 384-dim normalized vector
      ▼
FAISS search per document (top-k = 3 by default)
      │  IndexFlatIP cosine similarity
      ▼
Global re-rank all results by score
      │  sorted descending, keep top-k
      ▼
Score threshold filter (score >= -0.1)
      │  discard irrelevant chunks
      ▼
Build RAG prompt
      │
      │  System: "Answer using ONLY the context below.
      │           Cite as [filename · p.N]. ..."
      │  + Context chunks
      │  + User question
      ▼
Llama 3.2 3B via Ollama
      │  streams tokens via SSE
      ▼
Frontend receives token-by-token stream
      │
      ▼
tracker.finish() → saved to query_logs/query_tracker.json
```

### Similarity Scoring

Vectors are normalized at embed time → `IndexFlatIP` scores = cosine similarity:

| Score Range    | Meaning                           |
| -------------- | --------------------------------- |
| `0.5 – 1.0` | High relevance — direct match    |
| `0.2 – 0.5` | Good relevance — related content |
| `0.0 – 0.2` | Low relevance — loosely related  |
| `< 0.0`      | Irrelevant — filtered out        |

### SSE Event Stream

```
data: {"token": "Arjun"}
data: {"token": " currently"}
data: {"token": " works..."}
data: {"citations": [{"docName": "resume.pdf", "page": 1, "chunk": "..."}]}
data: {"done": true}
```

---

## API Reference

### `POST /ingest`

Upload and ingest a document.

**Request:** `multipart/form-data`

| Field       | Type   | Description           |
| ----------- | ------ | --------------------- |
| `file`    | File   | PDF, TXT, or DOCX     |
| `user_id` | string | Authenticated user ID |

**Response:**

```json
{
  "doc_id": "uuid",
  "filename": "resume.pdf",
  "status": "processing"
}
```

---

### `POST /query`

Ask a question against one or more documents.

**Request:** `application/json`

```json
{
  "question": "What are Arjun's main skills?",
  "document_ids": ["uuid-1", "uuid-2"],
  "user_id": "user-uuid",
  "top_k": 3
}
```

| Field            | Type     | Required | Default | Description                |
| ---------------- | -------- | -------- | ------- | -------------------------- |
| `question`     | string   | ✅       | —      | Natural language question  |
| `document_ids` | string[] | ✅       | —      | 1–5 document UUIDs        |
| `user_id`      | string   | ✅       | —      | Authenticated user ID      |
| `top_k`        | int      | ❌       | 3       | Chunks to retrieve (1–20) |

**Response:** SSE stream

```
data: {"token": "..."}        ← repeated for each token
data: {"citations": [...]}    ← after all tokens
data: {"done": true}          ← stream complete
data: {"error": "..."}        ← on failure
```

---

### `GET /query/health`

Check LLM backend status.

```json
{
  "status": "ok",
  "mode": "local",
  "ollama_url": "http://localhost:11434",
  "ollama_model": "llama-fast:latest",
  "environment": "development",
  "top_k": 3
}
```

---

### `GET /query/stats`

Live HTML dashboard showing all tracked queries with timing, scores, and answers.

### `GET /query/stats/json`

Raw JSON summary statistics:

```json
{
  "total": 42,
  "successful": 40,
  "failed": 2,
  "avg_duration_ms": 5200,
  "min_duration_ms": 1632,
  "max_duration_ms": 25581
}
```

---

## Project Structure

```
backend-ml/
├── PolyMind/
│   ├── pipeline/
│   │   ├── extractor.py       ← PyMuPDF text extraction
│   │   ├── chunker.py         ← sliding window chunker
│   │   ├── embedder.py        ← SentenceBERT wrapper
│   │   ├── indexer.py         ← FAISS index management
│   │   ├── pipeline.py        ← ingestion + query orchestration
│   │   └── tracker.py         ← query logging to JSON
│   ├── routes/
│   │   ├── ingest.py          ← POST /ingest endpoint
│   │   └── query.py           ← POST /query + stats endpoints
│   └── Database/
│       └── db.py              ← PostgreSQL queries
├── faiss_indexes/             ← persisted FAISS indexes
│   ├── <doc_id>.index
│   └── <doc_id>.meta.json
├── query_logs/
│   └── query_tracker.json     ← all query history
└── requirements.txt
```

---

## Setup & Installation

### Prerequisites

* Python 3.11+
* PostgreSQL running locally or via Docker
* [Ollama](https://ollama.ai/) installed

### 1. Clone & Install

```bash
git clone https://github.com/Achinta005/PolyMind.git
cd polymind/backend-ml
pip install -r requirements.txt
```

### 2. Set Up Ollama Model

```bash
# Pull the model
ollama pull llama3.2:3b

# Create optimized modelfile for CPU
cat > Modelfile << 'EOF'
FROM llama3.2:3b

PARAMETER num_ctx 1024
PARAMETER num_thread 8
PARAMETER num_predict 80
PARAMETER temperature 0.2
PARAMETER top_p 0.9

SYSTEM "You are a helpful assistant. Answer directly using the given context. Always write the actual answer explicitly — never return only a citation."
EOF

ollama create llama-fast -f Modelfile
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your values
```

### 4. Run Database Migrations

```bash
python -m PolyMind.Database.migrate
```

### 5. Start the Server

```bash
uvicorn PolyMind.main:app --reload --port 8000
```

---

## Configuration

| Variable         | Default                                   | Description                             |
| ---------------- | ----------------------------------------- | --------------------------------------- |
| `ENVIRONMENT`  | `development`                           | Set `production`to use HF cloud LLM   |
| `OLLAMA_URL`   | `http://localhost:11434`                | Ollama server address                   |
| `OLLAMA_MODEL` | `llama-fast:latest`                     | Ollama model name                       |
| `HF_TOKEN`     | —                                        | HuggingFace API token (production only) |
| `HF_MODEL_ID`  | `meta-llama/Meta-Llama-3.1-8B-Instruct` | HF model repo                           |
| `RAG_TOP_K`    | `3`                                     | Default chunks retrieved per query      |
| `DATABASE_URL` | —                                        | PostgreSQL connection string            |

---

## Query Tracker & Stats Dashboard

Every query is automatically tracked to `query_logs/query_tracker.json`:

```json
{
  "query_id": "uuid",
  "user_id": "user-uuid",
  "question": "Where does Arjun work?",
  "answer": "Arjun currently works at TechCorp India. [resume.pdf · p.1]",
  "start_time": "2026-03-06T14:22:10Z",
  "end_time": "2026-03-06T14:22:13Z",
  "duration_ms": 2952,
  "status": "success",
  "top_score": 0.3841,
  "chunks_used": [
    {
      "filename": "resume.pdf",
      "page_number": 1,
      "score": 0.3841,
      "text_preview": "Software Engineer — TechCorp India (2022 - Present)..."
    }
  ]
}
```

Visit `GET /query/stats` for the live HTML dashboard with filtering, search, and auto-refresh.

---

## Performance & Optimization

### Ollama CPU Settings

| Parameter       | Value  | Reason                                            |
| --------------- | ------ | ------------------------------------------------- |
| `num_ctx`     | 1024   | Matches RAG input size, reduces RAM usage         |
| `num_predict` | 80     | Caps output length, prevents slow list generation |
| `num_thread`  | 8      | Match your CPU logical core count                 |
| Quantization    | Q4_K_M | Best speed/quality balance for CPU                |

### RAG Settings

| Setting           | Value      | Reason                                  |
| ----------------- | ---------- | --------------------------------------- |
| Chunk size        | 512 tokens | Enough context per chunk                |
| Overlap           | 64 tokens  | Prevents boundary truncation            |
| Top-K             | 3          | Sufficient for cross-document reasoning |
| Score threshold   | -0.1       | Filters irrelevant chunks               |
| Ollama ping cache | 30s        | Avoids HTTP check on every request      |

### Typical Response Times (CPU, Llama 3.2 3B Q4)

| Query Type                   | Duration |
| ---------------------------- | -------- |
| Direct fact                  | 2–4s    |
| Multi-hop reasoning          | 5–8s    |
| Out-of-context (fast reject) | 1–2s    |

---

## Roadmap

* [X] Document ingestion pipeline (extract → chunk → embed → index)
* [X] FAISS semantic search with cosine similarity
* [X] RAG query pipeline with citations
* [X] SSE streaming responses
* [X] Query tracker with HTML dashboard
* [X] Ollama local LLM + HuggingFace cloud fallback
* [ ] Document summarization (BART/T5)
* [ ] Cross-document comparison endpoint
* [ ] UMAP topic cluster visualization
* [ ] Conversation history (multi-turn)
* [ ] React/Next.js frontend
* [ ] Docker Compose deployment
* [ ] Unit + integration tests

---

## License

MIT License — see [LICENSE](https://www.achintahazra.shop/LICENSE) for details.

import logging
import json
import os
import httpx
import asyncio

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, HTMLResponse
from pydantic import BaseModel, Field
from typing import List, AsyncGenerator, Annotated
from PolyMind.pipeline.tracker import QueryTracker
from PolyMind.pipeline.pipeline import run_query_pipeline

logger = logging.getLogger(__name__)
_tracker = QueryTracker()
router = APIRouter()

# ── Config ────────────────────────────────────────────────────
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama-fast:latest")
HF_TOKEN = os.getenv("HF_TOKEN", "")
HF_MODEL_ID = os.getenv("HF_MODEL_ID", "meta-llama/Meta-Llama-3.1-8B-Instruct")
HF_API_URL = f"https://api-inference.huggingface.co/models/{HF_MODEL_ID}"
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
TOP_K = int(os.getenv("RAG_TOP_K", "3"))

logger.info(f"[CONFIG] OLLAMA_URL={OLLAMA_URL}")
logger.info(f"[CONFIG] OLLAMA_MODEL={OLLAMA_MODEL}")
logger.info(f"[CONFIG] ENVIRONMENT={ENVIRONMENT}")
logger.info(f"[CONFIG] HF_MODEL_ID={HF_MODEL_ID}")
logger.info(f"[CONFIG] HF_TOKEN set={bool(HF_TOKEN)}")
logger.info(f"[CONFIG] RAG_TOP_K={TOP_K}")


# ── Schema ────────────────────────────────────────────────────
class QueryRequest(BaseModel):
    question: Annotated[str, Field(min_length=1)]
    document_ids: Annotated[List[str], Field(min_length=1, max_length=5)]
    user_id: str
    top_k: Annotated[int, Field(default=TOP_K, ge=1, le=20)]


# ── Ollama status cache ───────────────────────────────────────
_ollama_status: bool | None = None
_OLLAMA_CACHE_TTL = 30


async def is_ollama_running() -> bool:
    global _ollama_status

    if _ollama_status is not None:
        logger.debug("[OLLAMA] Using cached status")
        return _ollama_status

    url = f"{OLLAMA_URL}/api/tags"
    logger.debug(f"[OLLAMA] Pinging {url} ...")
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            r = await client.get(url)
            _ollama_status = r.status_code == 200
    except Exception as e:
        logger.warning(f"[OLLAMA] Ping failed: {type(e).__name__}: {e}")
        _ollama_status = False

    async def _reset_cache():
        global _ollama_status
        await asyncio.sleep(_OLLAMA_CACHE_TTL)
        _ollama_status = None
        logger.debug("[OLLAMA] Status cache expired")

    asyncio.create_task(_reset_cache())
    return _ollama_status


def resolve_mode() -> str:
    mode = "cloud" if ENVIRONMENT == "production" else "local"
    logger.debug(f"[MODE] resolve_mode() → {mode}")
    return mode


# ── Streaming backends ────────────────────────────────────────
async def stream_ollama(
    messages: list[dict],
    citations: list[dict],
) -> AsyncGenerator[str, None]:
    url = f"{OLLAMA_URL}/api/chat"
    logger.info(f"[OLLAMA] Starting stream → {url} model={OLLAMA_MODEL}")
    token_count = 0

    async with httpx.AsyncClient(timeout=300) as client:
        async with client.stream(
            "POST",
            url,
            json={
                "model": OLLAMA_MODEL,
                "messages": messages,
                "stream": True,
                "options": {
                    "temperature": 0.2,
                    "num_predict": 80,
                    "num_ctx": 1024,
                },
            },
        ) as response:
            logger.info(f"[OLLAMA] HTTP {response.status_code}")

            if response.status_code != 200:
                err = await response.aread()
                logger.error(f"[OLLAMA] Non-200: {err.decode()}")
                yield f"data: {json.dumps({'error': err.decode()})}\n\n"
                return

            async for line in response.aiter_lines():
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                except json.JSONDecodeError as e:
                    logger.warning(f"[OLLAMA] JSON decode error: {e}")
                    continue

                token = chunk.get("message", {}).get("content", "")
                if token:
                    token_count += 1
                    yield f"data: {json.dumps({'token': token})}\n\n"

                if chunk.get("done"):
                    logger.info(f"[OLLAMA] Stream done — tokens: {token_count}")
                    yield f"data: {json.dumps({'citations': citations})}\n\n"
                    yield f"data: {json.dumps({'done': True})}\n\n"
                    return

    logger.warning("[OLLAMA] Stream ended without 'done' chunk")


async def stream_hf(
    messages: list[dict],
    citations: list[dict],
) -> AsyncGenerator[str, None]:
    logger.info(f"[HF] Starting request → {HF_API_URL}")

    if not HF_TOKEN:
        yield f"data: {json.dumps({'error': 'HF_TOKEN not set.'})}\n\n"
        return

    prompt = ""
    for m in messages:
        role, content = m["role"], m["content"]
        if role == "system":
            prompt += f"System: {content}\n"
        elif role == "user":
            prompt += f"User: {content}\n"
        elif role == "assistant":
            prompt += f"Assistant: {content}\n"
    prompt += "Assistant:"

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                HF_API_URL,
                headers={
                    "Authorization": f"Bearer {HF_TOKEN}",
                    "Content-Type": "application/json",
                },
                json={
                    "inputs": prompt,
                    "parameters": {
                        "max_new_tokens": 256,
                        "temperature": 0.2,
                        "return_full_text": False,
                        "stop": ["User:", "System:"],
                    },
                },
            )

        result = response.json()

        if isinstance(result, dict) and "error" in result:
            yield f"data: {json.dumps({'error': result['error']})}\n\n"
            return

        if isinstance(result, list):
            text = result[0].get("generated_text", "").strip()
            yield f"data: {json.dumps({'token': text})}\n\n"
            yield f"data: {json.dumps({'citations': citations})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
            return

        yield f"data: {json.dumps({'error': 'Unexpected HF response format.'})}\n\n"

    except httpx.TimeoutException:
        yield f"data: {json.dumps({'error': 'HuggingFace API timed out.'})}\n\n"
    except Exception as e:
        logger.exception(f"[HF] Unexpected error: {e}")
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


# ── Tracked streaming wrappers ────────────────────────────────
async def stream_ollama_tracked(
    messages: list[dict],
    citations: list[dict],
    chunks: list[dict],
    entry: dict,
) -> AsyncGenerator[str, None]:
    full_answer = ""
    async for event in stream_ollama(messages, citations):
        yield event
        try:
            data = json.loads(event.removeprefix("data: "))
            if "token" in data:
                full_answer += data["token"]
            if data.get("done"):
                _tracker.finish(entry, answer=full_answer, chunks=chunks)
        except (json.JSONDecodeError, ValueError):
            pass


async def stream_hf_tracked(
    messages: list[dict],
    citations: list[dict],
    chunks: list[dict],
    entry: dict,
) -> AsyncGenerator[str, None]:
    full_answer = ""
    async for event in stream_hf(messages, citations):
        yield event
        try:
            data = json.loads(event.removeprefix("data: "))
            if "token" in data:
                full_answer += data["token"]
            if data.get("done"):
                _tracker.finish(entry, answer=full_answer, chunks=chunks)
        except (json.JSONDecodeError, ValueError):
            pass


# ── POST /query ───────────────────────────────────────────────
@router.post("/query")
async def query(request: QueryRequest):
    logger.info(
        f"[QUERY] Received — user={request.user_id} | "
        f"docs={request.document_ids} | top_k={request.top_k}"
    )

    entry = _tracker.start(
        question=request.question,
        user_id=request.user_id,
        document_ids=request.document_ids,
    )

    logger.debug(f"[QUERY] Question: {request.question[:120]}")
    logger.info("[QUERY] Running RAG pipeline ...")

    try:
        messages, citations, chunks = await run_query_pipeline(
            question=request.question,
            document_ids=request.document_ids,
            user_id=request.user_id,
            top_k=request.top_k,
        )
    except Exception as e:
        _tracker.finish_error(entry, error=str(e))
        logger.exception(f"[QUERY] Pipeline failed: {e}")
        raise

    logger.info(
        f"[QUERY] Pipeline complete — chunks={len(chunks)} citations={len(citations)}"
    )
    logger.debug(
        f"[QUERY] Top chunk scores: {[round(c.get('score', 0), 4) for c in chunks]}"
    )
    logger.debug(f"[QUERY] System prompt length: {len(messages[0]['content'])} chars")

    preferred_mode = resolve_mode()
    logger.info(f"[QUERY] Preferred mode: {preferred_mode}")

    if preferred_mode == "local":
        ollama_up = await is_ollama_running()
        logger.info(f"[QUERY] Ollama reachable: {ollama_up}")
        if not ollama_up:
            logger.warning("[QUERY] Ollama down — falling back to HF")
            preferred_mode = "cloud"

    logger.info(f"[QUERY] Final mode: {preferred_mode}")

    # ── Use TRACKED wrappers so tracker.finish() is always called ──
    stream = (
        stream_ollama_tracked(messages, citations, chunks, entry)
        if preferred_mode == "local"
        else stream_hf_tracked(messages, citations, chunks, entry)
    )

    logger.info(f"[QUERY] Returning StreamingResponse — mode={preferred_mode}")
    return StreamingResponse(
        stream,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── GET /query/stats (JSON) ───────────────────────────────────
@router.get("/stats/json")
async def stats_json():
    return _tracker.get_stats()


# ── GET /query/stats (HTML dashboard) ────────────────────────
@router.get("/stats", include_in_schema=False)
async def stats_html():
    entries = _tracker.get_all()
    s = _tracker.get_stats()

    # Build summary cards data
    avg_dur = f"{s.get('avg_duration_ms', 0):,}ms" if s.get("avg_duration_ms") else "—"
    min_dur = f"{s.get('min_duration_ms', 0):,}ms" if s.get("min_duration_ms") else "—"
    max_dur = f"{s.get('max_duration_ms', 0):,}ms" if s.get("max_duration_ms") else "—"

    # Build table rows
    rows_html = ""
    for e in reversed(entries):
        status_class = (
            "success"
            if e["status"] == "success"
            else ("progress" if e["status"] == "in_progress" else "error")
        )
        status_label = {
            "success": "✅ success",
            "error": "❌ error",
            "in_progress": "⏳ running",
        }.get(e["status"], e["status"])

        duration = f"{e['duration_ms']:,}ms" if e.get("duration_ms") else "—"
        top_score = f"{e['top_score']:.4f}" if e.get("top_score") is not None else "—"

        # Format start time nicely
        start_raw = e.get("start_time", "")
        try:
            from datetime import datetime

            dt = datetime.fromisoformat(start_raw)
            start_fmt = dt.strftime("%Y-%m-%d %H:%M:%S")
        except Exception:
            start_fmt = start_raw[:19].replace("T", " ")

        # Truncate long text
        question = e.get("question", "")[:80] + (
            "…" if len(e.get("question", "")) > 80 else ""
        )
        answer = (e.get("answer") or "")[:120] + (
            "…" if len(e.get("answer") or "") > 120 else ""
        )
        error = e.get("error") or ""

        chunks_count = len(e.get("chunks_used", []))

        rows_html += f"""
        <tr class="row-{status_class}">
          <td class="td-time">{start_fmt}</td>
          <td class="td-question" title="{e.get("question", "")}">{question}</td>
          <td class="td-answer" title="{e.get("answer", "") or error}">{answer or f'<span class="err">{error[:80]}</span>'}</td>
          <td class="td-center"><span class="badge-status {status_class}">{status_label}</span></td>
          <td class="td-center td-mono">{duration}</td>
          <td class="td-center td-mono">{top_score}</td>
          <td class="td-center">{chunks_count}</td>
          <td class="td-user td-mono">{e.get("user_id", "")[:8]}…</td>
        </tr>"""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>PolyMind — Query Stats</title>
  <style>
    *{{margin:0;padding:0;box-sizing:border-box}}
    body{{font-family:'Segoe UI',sans-serif;background:#0a0f1e;color:#e2e8f0;min-height:100vh}}

    /* Header */
    .header{{background:linear-gradient(135deg,#0d2137,#0a0f1e);padding:32px 40px;border-bottom:1px solid #1e3a5f}}
    .header h1{{font-size:1.7rem;color:#c8f04d;letter-spacing:-.5px}}
    .header p{{color:#64748b;margin-top:5px;font-size:.88rem}}
    .header-row{{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}}
    .refresh-btn{{padding:7px 18px;background:#1e3a5f;color:#93c5fd;border:1px solid #2d5a8e;border-radius:8px;cursor:pointer;font-size:.8rem;transition:background .15s}}
    .refresh-btn:hover{{background:#2d5a8e}}

    /* Summary cards */
    .cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px;padding:28px 40px 0}}
    .card{{background:#111827;border:1px solid #1e293b;border-radius:12px;padding:18px 20px}}
    .card-label{{font-size:.72rem;color:#64748b;text-transform:uppercase;letter-spacing:1.5px}}
    .card-value{{font-size:1.6rem;font-weight:700;margin-top:5px;color:#f1f5f9}}
    .card-value.green{{color:#6ee7b7}}
    .card-value.red{{color:#f87171}}
    .card-value.yellow{{color:#fbbf24}}
    .card-value.blue{{color:#93c5fd}}

    /* Table container */
    .table-wrap{{padding:28px 40px 40px;overflow-x:auto}}
    .table-title{{font-size:.78rem;color:#475569;text-transform:uppercase;letter-spacing:2px;margin-bottom:14px;padding-bottom:6px;border-bottom:1px solid #1e293b}}
    table{{width:100%;border-collapse:collapse;font-size:.82rem}}
    thead th{{text-align:left;padding:10px 14px;background:#070c18;color:#c8f04d;font-weight:600;font-size:.75rem;text-transform:uppercase;letter-spacing:.8px;border-bottom:2px solid #1e293b;white-space:nowrap}}
    tbody tr{{border-bottom:1px solid #111827;transition:background .12s}}
    tbody tr:hover{{background:#111827}}
    td{{padding:10px 14px;vertical-align:top;color:#cbd5e1;max-width:280px}}
    .td-center{{text-align:center}}
    .td-mono{{font-family:monospace;font-size:.8rem}}
    .td-time{{white-space:nowrap;color:#64748b;font-size:.78rem}}
    .td-question{{color:#f1f5f9;font-weight:500}}
    .td-answer{{color:#94a3b8;font-size:.8rem}}
    .td-user{{color:#64748b;font-size:.75rem}}
    .err{{color:#f87171}}

    /* Status badges */
    .badge-status{{padding:3px 10px;border-radius:20px;font-size:.72rem;font-weight:700;white-space:nowrap}}
    .badge-status.success{{background:#064e3b;color:#6ee7b7}}
    .badge-status.error{{background:#450a0a;color:#f87171}}
    .badge-status.progress{{background:#1e3a5f;color:#93c5fd}}

    /* Row tints */
    .row-error{{background:#0d0505}}
    .row-error:hover{{background:#150a0a}}

    /* Empty state */
    .empty{{text-align:center;padding:60px 20px;color:#475569}}
    .empty h3{{font-size:1.1rem;margin-bottom:8px;color:#64748b}}

    /* Filter bar */
    .filter-bar{{display:flex;gap:10px;padding:0 40px 20px;flex-wrap:wrap;align-items:center}}
    .filter-btn{{padding:5px 14px;border-radius:20px;font-size:.75rem;font-weight:600;cursor:pointer;border:1px solid #1e293b;background:#111827;color:#94a3b8;transition:all .15s}}
    .filter-btn:hover,.filter-btn.active{{background:#1e3a5f;color:#93c5fd;border-color:#2d5a8e}}
    .filter-btn.all.active{{background:#2d1b4e;color:#c4b5fd;border-color:#4c1d95}}
    .search-input{{padding:5px 14px;border-radius:20px;font-size:.78rem;background:#111827;border:1px solid #1e293b;color:#e2e8f0;outline:none;min-width:200px}}
    .search-input:focus{{border-color:#2d5a8e}}
  </style>
</head>
<body>

<div class="header">
  <div class="header-row">
    <div>
      <h1>PolyMind &mdash; Query Stats</h1>
      <p>Live query tracking — question, answer, timing, scores</p>
    </div>
    <button class="refresh-btn" onclick="location.reload()">⟳ Refresh</button>
  </div>
</div>

<!-- Summary Cards -->
<div class="cards">
  <div class="card">
    <div class="card-label">Total Queries</div>
    <div class="card-value blue">{s.get("total", 0)}</div>
  </div>
  <div class="card">
    <div class="card-label">Successful</div>
    <div class="card-value green">{s.get("successful", 0)}</div>
  </div>
  <div class="card">
    <div class="card-label">Failed</div>
    <div class="card-value red">{s.get("failed", 0)}</div>
  </div>
  <div class="card">
    <div class="card-label">Avg Duration</div>
    <div class="card-value yellow">{avg_dur}</div>
  </div>
  <div class="card">
    <div class="card-label">Fastest</div>
    <div class="card-value green">{min_dur}</div>
  </div>
  <div class="card">
    <div class="card-label">Slowest</div>
    <div class="card-value red">{max_dur}</div>
  </div>
</div>

<!-- Filter Bar -->
<div class="filter-bar" style="margin-top:24px">
  <button class="filter-btn all active" onclick="filterRows('all', this)">All</button>
  <button class="filter-btn" onclick="filterRows('success', this)">✅ Success</button>
  <button class="filter-btn" onclick="filterRows('error', this)">❌ Failed</button>
  <input class="search-input" id="searchInput" placeholder="🔍 Search question or answer..." oninput="searchRows(this.value)"/>
</div>

<!-- Table -->
<div class="table-wrap">
  <div class="table-title">Query History — {len(entries)} entries (newest first)</div>
  {
        '<div class="empty"><h3>No queries tracked yet</h3><p>Send a query to <code>/query</code> to see results here.</p></div>'
        if not entries
        else f'''
  <table id="mainTable">
    <thead>
      <tr>
        <th>Time</th>
        <th>Question</th>
        <th>Answer</th>
        <th>Status</th>
        <th>Duration</th>
        <th>Top Score</th>
        <th>Chunks</th>
        <th>User</th>
      </tr>
    </thead>
    <tbody id="tableBody">
      {rows_html}
    </tbody>
  </table>'''
    }
</div>

<script>
  function filterRows(status, btn) {{
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('#tableBody tr').forEach(row => {{
      if (status === 'all') {{
        row.style.display = '';
      }} else {{
        row.style.display = row.className.includes('row-' + status) ? '' : 'none';
      }}
    }});
  }}

  function searchRows(val) {{
    const q = val.toLowerCase();
    document.querySelectorAll('#tableBody tr').forEach(row => {{
      row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    }});
  }}

  // Auto-refresh every 30 seconds
  setTimeout(() => location.reload(), 30000);
</script>

</body>
</html>"""
    return HTMLResponse(content=html)


# ── GET /query/docs ───────────────────────────────────────────
@router.get("/docs", include_in_schema=False)
async def query_docs():
    html = """<!DOCTYPE html>
<html>
<head>
  <title>PolyMind - Query API</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',sans-serif;background:#0a0f1e;color:#e2e8f0}
    .header{background:linear-gradient(135deg,#0d2137,#0a0f1e);padding:40px;border-bottom:1px solid #1e3a5f}
    .header h1{font-size:1.9rem;color:#c8f04d;letter-spacing:-0.5px}
    .header p{color:#64748b;margin-top:6px;font-size:0.9rem}
    .badges{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}
    .badge{padding:4px 12px;border-radius:20px;font-size:0.72rem;font-weight:700;letter-spacing:.5px}
    .badge.post{background:#1e3a8a;color:#93c5fd}
    .badge.get{background:#064e3b;color:#6ee7b7}
    .badge.env{background:#2d1b4e;color:#c4b5fd}
    .container{max-width:920px;margin:36px auto;padding:0 24px}
    .section{margin-bottom:36px}
    .section-title{font-size:.8rem;color:#475569;text-transform:uppercase;letter-spacing:2px;margin-bottom:14px;padding-bottom:6px;border-bottom:1px solid #1e293b}
    .card{background:#111827;border:1px solid #1e293b;border-radius:12px;overflow:hidden;margin-bottom:14px}
    .card-header{display:flex;align-items:center;gap:12px;padding:15px 20px;cursor:pointer;transition:background .15s}
    .card-header:hover{background:#1a2540}
    .method{font-weight:800;font-size:.8rem;padding:3px 10px;border-radius:6px;min-width:50px;text-align:center}
    .method.POST{background:#1e3a8a;color:#93c5fd}
    .method.GET{background:#064e3b;color:#6ee7b7}
    .path{font-family:monospace;font-size:.95rem;color:#f1f5f9}
    .desc{color:#64748b;font-size:.83rem;margin-left:auto}
    .body{padding:20px;border-top:1px solid #1e293b;display:none}
    .body.open{display:block}
    .label{font-size:.75rem;color:#c8f04d;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:18px 0 8px}
    .label:first-child{margin-top:0}
    pre{background:#070c18;border:1px solid #1e293b;border-radius:8px;padding:16px;font-size:.82rem;overflow-x:auto;color:#a5f3fc;line-height:1.65}
    table{width:100%;border-collapse:collapse;font-size:.83rem}
    th{text-align:left;padding:9px 12px;background:#070c18;color:#c8f04d;font-weight:600;border-bottom:1px solid #1e293b}
    td{padding:9px 12px;border-bottom:1px solid #111827;color:#cbd5e1;vertical-align:top}
    td code{background:#070c18;padding:2px 6px;border-radius:4px;color:#a5f3fc;font-size:.78rem}
    .req{color:#f87171;font-size:.72rem}
    .opt{color:#64748b;font-size:.72rem}
    .mode-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:4px}
    .mode-card{background:#070c18;border:1px solid #1e293b;border-radius:8px;padding:14px}
    .mode-card h4{font-size:.85rem;margin-bottom:5px}
    .mode-card p{color:#64748b;font-size:.8rem;line-height:1.5}
    .mode-card.local h4{color:#6ee7b7}
    .mode-card.cloud h4{color:#93c5fd}
    .try-btn{margin-top:16px;padding:9px 20px;background:#c8f04d;color:#070c18;border:none;border-radius:8px;cursor:pointer;font-size:.83rem;font-weight:700;transition:background .15s}
    .try-btn:hover{background:#d4f86e}
    .res-box{margin-top:12px;background:#070c18;border:1px solid #1e293b;border-radius:8px;padding:16px;display:none;font-family:monospace;font-size:.82rem;white-space:pre-wrap;line-height:1.6;max-height:400px;overflow-y:auto}
    .res-box.show{display:block}
    textarea{width:100%;background:#070c18;border:1px solid #1e293b;border-radius:8px;padding:12px;color:#a5f3fc;font-family:monospace;font-size:.82rem;resize:vertical;margin-top:6px;outline:none}
    .flow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px}
    .step{background:#070c18;border:1px solid #1e293b;border-radius:6px;padding:6px 12px;font-size:.78rem;color:#94a3b8}
    .arrow{color:#c8f04d;font-size:.85rem}
    .sse-events{display:flex;flex-direction:column;gap:8px;margin-top:6px}
    .event{background:#070c18;border-left:3px solid #c8f04d;border-radius:0 6px 6px 0;padding:10px 14px}
    .event code{color:#a5f3fc;font-size:.82rem;display:block}
    .event p{color:#64748b;font-size:.78rem;margin-top:4px}
  </style>
</head>
<body>
<div class="header">
  <h1>PolyMind &mdash; Query API</h1>
  <p>RAG-powered document querying with SSE streaming &mdash; local Ollama or HuggingFace cloud</p>
  <div class="badges">
    <span class="badge post">POST /query</span>
    <span class="badge get">GET /query/health</span>
    <span class="badge get">GET /query/stats</span>
    <span class="badge env">ENVIRONMENT aware</span>
  </div>
</div>
<div class="container">
  <div class="section">
    <div class="section-title">Pipeline Flow</div>
    <div class="card" style="padding:20px">
      <div class="flow">
        <div class="step">Validate doc IDs</div><div class="arrow">&#8594;</div>
        <div class="step">Embed question (SBERT)</div><div class="arrow">&#8594;</div>
        <div class="step">FAISS search per doc</div><div class="arrow">&#8594;</div>
        <div class="step">Global re-rank top-k</div><div class="arrow">&#8594;</div>
        <div class="step">Score threshold filter</div><div class="arrow">&#8594;</div>
        <div class="step">Build RAG prompt</div><div class="arrow">&#8594;</div>
        <div class="step">Stream LLM response</div><div class="arrow">&#8594;</div>
        <div class="step">Track to JSON</div>
      </div>
      <div class="label" style="margin-top:18px">LLM Backend Selection</div>
      <div class="mode-grid">
        <div class="mode-card local">
          <h4>Development (local)</h4>
          <p>ENVIRONMENT=development &rarr; Ollama on localhost:11434. Auto-falls back to HF if unreachable.</p>
        </div>
        <div class="mode-card cloud">
          <h4>Production (cloud)</h4>
          <p>ENVIRONMENT=production &rarr; HuggingFace Inference API. Requires HF_TOKEN.</p>
        </div>
      </div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">Endpoints</div>
    <div class="card">
      <div class="card-header" onclick="toggle('query')">
        <span class="method POST">POST</span>
        <span class="path">/query</span>
        <span class="desc">Ask a question across selected documents</span>
      </div>
      <div class="body" id="query">
        <div class="label">Request Body</div>
        <table>
          <tr><th>Field</th><th>Type</th><th>Required</th><th>Default</th><th>Description</th></tr>
          <tr><td><code>question</code></td><td>string</td><td><span class="req">required</span></td><td>&mdash;</td><td>User question (min 1 char)</td></tr>
          <tr><td><code>document_ids</code></td><td>string[]</td><td><span class="req">required</span></td><td>&mdash;</td><td>1&ndash;5 document UUIDs</td></tr>
          <tr><td><code>user_id</code></td><td>string</td><td><span class="req">required</span></td><td>&mdash;</td><td>Authenticated user ID</td></tr>
          <tr><td><code>top_k</code></td><td>int</td><td><span class="opt">optional</span></td><td>3</td><td>Chunks to retrieve (1&ndash;20)</td></tr>
        </table>
        <div class="label">SSE Event Stream</div>
        <div class="sse-events">
          <div class="event"><code>data: {"token": "..."}</code><p>Incremental LLM text token</p></div>
          <div class="event"><code>data: {"citations": [{docName, page, chunk}, ...]}</code><p>Sent once after all tokens</p></div>
          <div class="event"><code>data: {"done": true}</code><p>Stream complete</p></div>
          <div class="event"><code>data: {"error": "message"}</code><p>Sent on failure</p></div>
        </div>
        <div class="label">Try it</div>
        <textarea id="query-body" rows="7">{
  "question": "Summarize the main findings.",
  "document_ids": ["PASTE-DOC-ID-HERE"],
  "user_id": "test-user",
  "top_k": 3
}</textarea>
        <button class="try-btn" onclick="tryQuery()">&#9654; Send Query</button>
        <div class="res-box" id="query-res"></div>
      </div>
    </div>
    <div class="card">
      <div class="card-header" onclick="toggle('health')">
        <span class="method GET">GET</span>
        <span class="path">/query/health</span>
        <span class="desc">Active LLM mode and connectivity</span>
      </div>
      <div class="body" id="health">
        <pre>{{"status":"ok","mode":"local","ollama_url":"http://localhost:11434","ollama_model":"llama-fast:latest","environment":"development","top_k":3}}</pre>
        <button class="try-btn" onclick="tryHealth()">&#9654; Check Health</button>
        <div class="res-box" id="health-res"></div>
      </div>
    </div>
    <div class="card">
      <div class="card-header" onclick="window.location='/llm/query/stats'">
        <span class="method GET">GET</span>
        <span class="path">/query/stats</span>
        <span class="desc">HTML dashboard — query history &amp; timing</span>
      </div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">Environment Variables</div>
    <div class="card" style="padding:0">
      <table>
        <tr><th>Variable</th><th>Default</th><th>Description</th></tr>
        <tr><td><code>ENVIRONMENT</code></td><td><code>development</code></td><td>Set to <code>production</code> for HF cloud mode</td></tr>
        <tr><td><code>OLLAMA_URL</code></td><td><code>http://localhost:11434</code></td><td>Ollama server address</td></tr>
        <tr><td><code>OLLAMA_MODEL</code></td><td><code>llama-fast:latest</code></td><td>Model in Ollama</td></tr>
        <tr><td><code>HF_TOKEN</code></td><td>&mdash;</td><td>HuggingFace API token</td></tr>
        <tr><td><code>HF_MODEL_ID</code></td><td><code>meta-llama/Meta-Llama-3.1-8B-Instruct</code></td><td>HF model repo ID</td></tr>
        <tr><td><code>RAG_TOP_K</code></td><td><code>3</code></td><td>Default chunks retrieved</td></tr>
      </table>
    </div>
  </div>
</div>
<script>
  function toggle(id) {{ document.getElementById(id).classList.toggle('open'); }}
  async function tryHealth() {{
    const box = document.getElementById('health-res');
    box.className = 'res-box show'; box.style.color = '#94a3b8'; box.textContent = 'Loading...';
    try {{
      const r = await fetch('/llm/query/health');
      const d = await r.json();
      box.style.color = '#6ee7b7';
      box.textContent = JSON.stringify(d, null, 2);
    }} catch(e) {{ box.style.color = '#f87171'; box.textContent = 'Error: ' + e.message; }}
  }}
  async function tryQuery() {{
    const box = document.getElementById('query-res');
    const body = document.getElementById('query-body').value;
    box.className = 'res-box show'; box.style.color = '#94a3b8'; box.textContent = 'Streaming...\\n';
    try {{
      const r = await fetch('/llm/query/query', {{
        method: 'POST',
        headers: {{ 'Content-Type': 'application/json' }},
        body: body
      }});
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let full = '';
      while (true) {{
        const {{ done, value }} = await reader.read();
        if (done) break;
        for (const line of dec.decode(value).split('\\n')) {{
          if (!line.startsWith('data: ')) continue;
          try {{
            const d = JSON.parse(line.slice(6));
            if (d.token)     {{ full += d.token; box.style.color = '#a5f3fc'; box.textContent = full; }}
            if (d.citations) {{ box.textContent += '\\n\\n-- Citations --\\n' + JSON.stringify(d.citations, null, 2); }}
            if (d.error)     {{ box.style.color = '#f87171'; box.textContent += '\\nError: ' + d.error; }}
          }} catch {{}}
        }}
      }}
    }} catch(e) {{ box.style.color = '#f87171'; box.textContent = 'Error: ' + e.message; }}
  }}
</script>
</body>
</html>"""
    return HTMLResponse(content=html)

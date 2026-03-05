import json
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

_DEFAULT_LOG_DIR  = "query_logs"
_DEFAULT_LOG_FILE = "query_tracker.json"


class QueryTracker:
    """
    Tracks every RAG query — question, answer, timing, chunks used.
    Persists to a JSON file for analysis and debugging.

    Usage:
        tracker = QueryTracker()

        # Start tracking
        entry = tracker.start(question="What is Arjun's skill?", user_id="abc")

        # ... run your pipeline ...

        # Finish tracking
        tracker.finish(entry, answer="Python, FastAPI...", chunks=top_chunks)
    """

    def __init__(
        self,
        log_dir:  str = _DEFAULT_LOG_DIR,
        log_file: str = _DEFAULT_LOG_FILE,
    ):
        self._log_path = Path(log_dir) / log_file
        self._log_path.parent.mkdir(parents=True, exist_ok=True)

        # Create empty log file if it doesn't exist
        if not self._log_path.exists():
            self._write_all([])
            logger.info(f"[TRACKER] Created new log file → {self._log_path}")
        else:
            count = len(self._read_all())
            logger.info(
                f"[TRACKER] Loaded existing log → {self._log_path} "
                f"({count} previous entries)"
            )

    # ── Public API ────────────────────────────────────────────

    def start(self, question: str, user_id: str, document_ids: list[str]) -> dict:
        """
        Call at the beginning of a query.
        Returns a tracking entry dict — pass this to finish() later.
        """
        now = datetime.now(timezone.utc)

        entry = {
            "query_id":     str(uuid.uuid4()),
            "user_id":      user_id,
            "document_ids": document_ids,
            "question":     question,
            "answer":       None,
            "start_time":   now.isoformat(),
            "end_time":     None,
            "duration_ms":  None,
            "status":       "in_progress",
            "chunks_used":  [],
            "top_score":    None,
            "error":        None,
        }

        logger.info(
            f"[TRACKER] Query started — "
            f"query_id={entry['query_id']} | "
            f"user={user_id}"
        )
        return entry

    def finish(
        self,
        entry:   dict,
        answer:  str,
        chunks:  list[dict],
        error:   str | None = None,
    ) -> dict:
        """
        Call when streaming is complete and full answer is assembled.
        Saves the completed entry to the JSON log file.

        Args:
            entry:   The dict returned by start()
            answer:  Full assembled answer string from LLM
            chunks:  top_chunks from run_query_pipeline()
            error:   Optional error message if something went wrong
        """
        now      = datetime.now(timezone.utc)
        start_dt = datetime.fromisoformat(entry["start_time"])

        duration_ms = int((now - start_dt).total_seconds() * 1000)

        entry["end_time"]    = now.isoformat()
        entry["duration_ms"] = duration_ms
        entry["answer"]      = answer.strip() if answer else None
        entry["status"]      = "error" if error else "success"
        entry["error"]       = error

        # Store lightweight chunk summary — not full text
        entry["chunks_used"] = [
            {
                "chunk_id":    c.get("chunk_id", ""),
                "filename":    c.get("filename", ""),
                "page_number": c.get("page_number", 0),
                "score":       round(c.get("score", 0.0), 4),
                "text_preview": c.get("text", "")[:100],
            }
            for c in chunks
        ]

        entry["top_score"] = (
            round(chunks[0]["score"], 4) if chunks else None
        )

        # Append to JSON log
        self._append(entry)

        logger.info(
            f"[TRACKER] Query finished — "
            f"query_id={entry['query_id']} | "
            f"duration={duration_ms}ms | "
            f"status={entry['status']} | "
            f"chunks={len(chunks)}"
        )
        return entry

    def finish_error(self, entry: dict, error: str) -> dict:
        """
        Call when pipeline fails entirely — no answer, no chunks.
        """
        return self.finish(entry, answer="", chunks=[], error=error)

    def get_all(self) -> list[dict]:
        """Return all tracked queries."""
        return self._read_all()

    def get_stats(self) -> dict:
        """
        Return summary statistics across all tracked queries.
        Useful for a /stats endpoint or debugging.
        """
        entries = self._read_all()

        if not entries:
            return {"total": 0}

        successful = [e for e in entries if e["status"] == "success"]
        failed     = [e for e in entries if e["status"] == "error"]
        durations  = [
            e["duration_ms"] for e in successful if e["duration_ms"] is not None
        ]

        return {
            "total":            len(entries),
            "successful":       len(successful),
            "failed":           len(failed),
            "avg_duration_ms":  int(sum(durations) / len(durations)) if durations else None,
            "min_duration_ms":  min(durations) if durations else None,
            "max_duration_ms":  max(durations) if durations else None,
            "log_file":         str(self._log_path),
        }

    # ── Internal ──────────────────────────────────────────────

    def _append(self, entry: dict) -> None:
        """Append one entry to the JSON array on disk."""
        all_entries = self._read_all()
        all_entries.append(entry)
        self._write_all(all_entries)

    def _read_all(self) -> list[dict]:
        try:
            return json.loads(self._log_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, FileNotFoundError):
            return []

    def _write_all(self, entries: list[dict]) -> None:
        self._log_path.write_text(
            json.dumps(entries, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
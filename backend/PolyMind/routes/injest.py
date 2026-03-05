import logging
import os
from uuid import uuid4
from fastapi import APIRouter, Form, UploadFile, File, HTTPException, BackgroundTasks
from PolyMind.Database import db
from PolyMind.pipeline.pipeline import run_injest_pipeline
from PolyMind.pipeline.pipeline import get_indexer

logger = logging.getLogger(__name__)

router = APIRouter()

UPLOAD_DIR = "uploaded_docs"
ALLOWED_EXTENSIONS = {".pdf", ".txt", ".docx"}
os.makedirs(UPLOAD_DIR, exist_ok=True)


MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB per file
MAX_USER_STORAGE_BYTES = 500 * 1024 * 1024  # 500 MB per user total


@router.post("/injest")
async def ingest_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user_id: str = Form(...),
):
    ext = os.path.splitext(file.filename)[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type '{ext}'.")

    # 1. Check single file size before reading
    contents = await file.read()
    file_size = len(contents)

    if file_size > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({file_size / 1024 / 1024:.1f} MB). Max allowed: {MAX_FILE_SIZE_BYTES // 1024 // 1024} MB.",
        )

    # 2. Check per-user total storage
    from PolyMind.Database import db

    user_total = await db.get_user_total_storage(user_id)
    if user_total + file_size > MAX_USER_STORAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Storage limit reached. Used: {user_total / 1024 / 1024:.1f} MB / {MAX_USER_STORAGE_BYTES // 1024 // 1024} MB.",
        )

    doc_id = str(uuid4())
    save_path = os.path.join(UPLOAD_DIR, f"{doc_id}{ext}")

    try:
        with open(save_path, "wb") as f:
            f.write(contents)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")

    background_tasks.add_task(
        run_injest_pipeline, save_path, doc_id, file.filename, user_id, size_bytes=file_size
    )

    return {
        "doc_id": doc_id,
        "filename": file.filename,
        "status": "processing",
        "size_bytes": file_size,
    }


@router.get("/documents/{doc_id}/status")
async def get_status(doc_id: str):
    doc = await db.get_document_status(doc_id)
    return {"status": doc["status"] if doc else "error"}


@router.get("/documents")
async def get_documents(user_id: str):
    docs = await db.get_user_documents(user_id)
    return docs


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, user_id: str):

    # 1. Delete from DB (cascades to chunks)
    deleted = await db.delete_document(doc_id, user_id)
    if not deleted:
        raise HTTPException(
            status_code=404, detail="Document not found or not owned by user"
        )

    # 2. Delete FAISS index files
    get_indexer().delete(doc_id)

    # 3. Delete uploaded file from disk
    for ext in (".pdf", ".txt", ".docx"):
        file_path = os.path.join(UPLOAD_DIR, f"{doc_id}{ext}")
        if os.path.exists(file_path):
            os.remove(file_path)
            logger.info(f"[{doc_id}] File deleted from disk.")
            break

    return {"doc_id": doc_id, "deleted": True}

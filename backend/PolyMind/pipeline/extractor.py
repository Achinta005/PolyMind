import logging
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)

# Minimum character count per page to consider it "text-bearing".
# Pages below this threshold are treated as image/scanned and sent to OCR.
_OCR_CHAR_THRESHOLD = 20

# DPI used when rasterising a PDF page for OCR (higher = better quality, slower).
_OCR_DPI = 300


@dataclass
class Page:
    """Represents a single page of extracted text."""
    page_number: int
    text: str
    source: str
    ocr_applied: bool = field(default=False)


def extract(file_path: str) -> list[Page]:
    """
    Extract raw text from a PDF, TXT, or DOCX file.

    For PDFs:
      - Uses PyMuPDF (fitz) for fast native text extraction.
      - Automatically falls back to Tesseract OCR for pages whose extracted
        text is too short (scanned / image-only pages).

    Args:
        file_path: Absolute or relative path to the file.

    Returns:
        List of Page objects, one per page (TXT files are treated as a single page).

    Raises:
        FileNotFoundError: If the file does not exist.
        ValueError: If the file extension is not supported.
        RuntimeError: If extraction fails.
    """
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    ext = path.suffix.lower()

    extractors = {
        ".pdf":  _extract_pdf,
        ".txt":  _extract_txt,
        ".docx": _extract_docx,
    }

    if ext not in extractors:
        raise ValueError(
            f"Unsupported file type '{ext}'. Supported types: {', '.join(extractors)}"
        )

    logger.info(f"Extracting text from {path.name} (type={ext})")

    try:
        pages = extractors[ext](path)
        ocr_count = sum(1 for p in pages if p.ocr_applied)
        logger.info(
            f"Extracted {len(pages)} page(s) from {path.name}"
            + (f" ({ocr_count} via OCR)" if ocr_count else "")
        )
        return pages
    except (FileNotFoundError, ValueError):
        raise
    except Exception as e:
        raise RuntimeError(f"Failed to extract text from '{file_path}': {e}") from e


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _extract_pdf(path: Path) -> list[Page]:
    """
    Extract text from a PDF with PyMuPDF.

    Strategy per page:
      1. Try native text extraction via PyMuPDF (fast, lossless).
      2. If the result is below _OCR_CHAR_THRESHOLD characters the page is
         likely a scanned image — rasterise it and run Tesseract OCR instead.
    """
    try:
        import fitz  # PyMuPDF
    except ImportError as e:
        raise ImportError(
            "PyMuPDF is required for PDF extraction. "
            "Install it with: pip install pymupdf"
        ) from e

    pages: list[Page] = []

    with fitz.open(str(path)) as doc:
        for i, fitz_page in enumerate(doc, start=1):
            text = fitz_page.get_text("text").strip()

            if len(text) >= _OCR_CHAR_THRESHOLD:
                pages.append(Page(page_number=i, text=text, source=str(path)))
            else:
                logger.debug(
                    f"{path.name} p{i}: only {len(text)} chars via PyMuPDF — "
                    "falling back to OCR"
                )
                ocr_text = _ocr_fitz_page(fitz_page)
                pages.append(
                    Page(page_number=i, text=ocr_text, source=str(path), ocr_applied=True)
                )

    return pages


def _ocr_fitz_page(fitz_page) -> str:
    """
    Rasterise a single PyMuPDF page and run Tesseract OCR on it.

    Requires:
      - pytesseract  (`pip install pytesseract`)
      - Pillow       (`pip install Pillow`)
      - Tesseract binary on PATH (https://github.com/tesseract-ocr/tesseract)
    """
    try:
        import pytesseract
        from PIL import Image
        import io
    except ImportError as e:
        raise ImportError(
            "pytesseract and Pillow are required for OCR fallback. "
            "Install them with: pip install pytesseract Pillow"
        ) from e

    # Render page to a pixmap at _OCR_DPI
    matrix = fitz_page.fitz_page.get_pixmap(dpi=_OCR_DPI) if hasattr(fitz_page, "fitz_page") \
        else fitz_page.get_pixmap(dpi=_OCR_DPI)

    img = Image.open(io.BytesIO(matrix.tobytes("png")))
    text = pytesseract.image_to_string(img, lang="eng")
    return text.strip()


def _extract_txt(path: Path) -> list[Page]:
    """Read a plain-text file as a single page, trying common encodings."""
    for encoding in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            text = path.read_text(encoding=encoding)
            return [Page(page_number=1, text=text.strip(), source=str(path))]
        except UnicodeDecodeError:
            continue

    raise RuntimeError(f"Could not decode '{path}' with supported encodings.")


def _extract_docx(path: Path) -> list[Page]:
    """
    Extract text from a DOCX file.

    Each paragraph is collected into a single logical page.
    Page breaks (rendered via `w:lastRenderedPageBreak` or `w:pageBreakBefore`)
    are used to split content into separate Page objects when present;
    otherwise the whole document is returned as one page.
    """
    try:
        from docx import Document
    except ImportError as e:
        raise ImportError(
            "python-docx is required for DOCX extraction. "
            "Install it with: pip install python-docx"
        ) from e

    doc = Document(str(path))

    current_lines: list[str] = []
    pages: list[Page] = []
    page_num = 1

    for para in doc.paragraphs:
        # Detect explicit page breaks inside any run of this paragraph
        has_page_break = any(
            run.contains_page_break for run in para.runs
        )

        if has_page_break and current_lines:
            pages.append(Page(
                page_number=page_num,
                text="\n".join(current_lines).strip(),
                source=str(path),
            ))
            page_num += 1
            current_lines = []

        if para.text.strip():
            current_lines.append(para.text)

    # Flush remaining lines
    if current_lines:
        pages.append(Page(
            page_number=page_num,
            text="\n".join(current_lines).strip(),
            source=str(path),
        ))

    # Guarantee at least one Page even for empty documents
    if not pages:
        pages.append(Page(page_number=1, text="", source=str(path)))

    return pages
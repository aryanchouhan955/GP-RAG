import logging
from typing import List
import fitz  # PyMuPDF
from app.ingestion.models import DocumentPage
from app.ingestion.cleaner import clean_text

logger = logging.getLogger(__name__)

def load_pdf(file_path: str, document_id: str = None) -> List[DocumentPage]:
    """
    Load a PDF and extract text page by page.
    """
    if not document_id:
        document_id = file_path.split("/")[-1].split("\\")[-1]

    pages = []
    try:
        doc = fitz.open(file_path)
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            raw_text = page.get_text()
            
            clean = clean_text(raw_text)
            if clean:  # Ignore empty pages after cleaning
                pages.append(DocumentPage(
                    document_id=document_id,
                    source=file_path,
                    page_number=page_num + 1,  # 1-indexed
                    text=clean,
                    metadata={"file_type": "pdf"}
                ))
            else:
                logger.debug(f"Skipping empty page {page_num + 1} in {file_path}")
                
        doc.close()
    except Exception as e:
        logger.error(f"Failed to load PDF {file_path}: {e}")
        
    return pages

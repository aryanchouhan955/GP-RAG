import logging
from typing import List
from docx import Document
from app.ingestion.models import DocumentPage
from app.ingestion.cleaner import clean_text

logger = logging.getLogger(__name__)

def load_docx(file_path: str, document_id: str = None) -> List[DocumentPage]:
    """
    Load a DOCX and extract text paragraph by paragraph.
    Uses paragraph index as page_number since DOCX lacks strict pages.
    """
    if not document_id:
        document_id = file_path.split("/")[-1].split("\\")[-1]

    pages = []
    try:
        doc = Document(file_path)
        paragraph_idx = 1
        for para in doc.paragraphs:
            raw_text = para.text
            clean = clean_text(raw_text)
            
            if clean: # Ignore empty paragraphs
                pages.append(DocumentPage(
                    document_id=document_id,
                    source=file_path,
                    page_number=paragraph_idx, 
                    text=clean,
                    metadata={"file_type": "docx"}
                ))
            else:
                logger.debug(f"Skipping empty paragraph at index {paragraph_idx} in {file_path}")
            paragraph_idx += 1
                
    except Exception as e:
        logger.error(f"Failed to load DOCX {file_path}: {e}")
        
    return pages

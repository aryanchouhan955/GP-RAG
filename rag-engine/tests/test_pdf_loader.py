import os
import pytest
import fitz
from app.ingestion.loaders.pdf_loader import load_pdf

@pytest.fixture
def sample_pdf(tmp_path):
    pdf_path = tmp_path / "sample.pdf"
    doc = fitz.open()
    
    # Page 1
    page = doc.new_page()
    page.insert_text(fitz.Point(50, 50), "This is page 1.")
    
    # Page 2 (Empty)
    doc.new_page()
    
    # Page 3
    page3 = doc.new_page()
    page3.insert_text(fitz.Point(50, 50), "This is page 3.")
    
    doc.save(str(pdf_path))
    doc.close()
    
    return str(pdf_path)

def test_load_pdf_valid(sample_pdf):
    pages = load_pdf(sample_pdf)
    
    # Page 2 was empty, so it should be skipped
    assert len(pages) == 2
    
    assert pages[0].page_number == 1
    assert "page 1" in pages[0].text.lower()
    assert pages[0].metadata["file_type"] == "pdf"
    
    assert pages[1].page_number == 3
    assert "page 3" in pages[1].text.lower()

def test_load_pdf_invalid(tmp_path):
    invalid_path = tmp_path / "nonexistent.pdf"
    pages = load_pdf(str(invalid_path))
    assert pages == []

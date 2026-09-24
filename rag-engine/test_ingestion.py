import argparse
import sys
import os
import logging
from app.ingestion.loaders.pdf_loader import load_pdf
from app.ingestion.loaders.docx_loader import load_docx

def main():
    parser = argparse.ArgumentParser(description="Test Document Ingestion")
    parser.add_argument("file_path", help="Path to PDF or DOCX file")
    args = parser.parse_args()

    file_path = args.file_path
    
    if not os.path.exists(file_path):
        print(f"Error: File '{file_path}' does not exist.")
        sys.exit(1)

    filename = os.path.basename(file_path)
    print(f"Document: {filename}")
    
    ext = file_path.lower().split('.')[-1]
    
    pages = []
    if ext == "pdf":
        print("Type: PDF\n")
        pages = load_pdf(file_path)
    elif ext == "docx":
        print("Type: DOCX\n")
        pages = load_docx(file_path)
    else:
        print(f"Error: Unsupported file extension '.{ext}'. Use PDF or DOCX.")
        sys.exit(1)

    if ext == "pdf":
        print(f"Pages extracted: {len(pages)}\n")
        for p in pages:
            print(f"Page {p.page_number}:")
            print(p.text[:200] + ("..." if len(p.text) > 200 else ""))
            print("-" * 40)
    else:
        print(f"Paragraphs extracted: {len(pages)}\n")
        for p in pages:
            print(f"Paragraph {p.page_number}:")
            print(p.text[:200] + ("..." if len(p.text) > 200 else ""))
            print("-" * 40)

if __name__ == "__main__":
    # Setup basic console logging for the script
    logging.basicConfig(level=logging.WARNING)
    main()

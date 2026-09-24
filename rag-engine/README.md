# GP-RAG (General Purpose RAG Chatbot)

RAG-first project implementation.

## Chunk 1 & 2
- Project Foundation
- Document Ingestion (PDF, DOCX)

### Usage

Install dependencies:
```bash
python -m venv venv
source venv/bin/activate  # Or .\venv\Scripts\activate on Windows
pip install -r requirements.txt
```

Run test ingestion script:
```bash
python test_ingestion.py path/to/document.pdf
```

Run unit tests:
```bash
pytest
```

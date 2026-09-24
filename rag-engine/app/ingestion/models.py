from typing import Dict, Any, Optional
from pydantic import BaseModel, Field, ConfigDict

class DocumentPage(BaseModel):
    """
    Common representation of a document page or section.
    This ensures downstream components do not need to know the source format (PDF, DOCX).
    """
    document_id: str
    source: str
    page_number: int = Field(
        ..., 
        description="The page number (1-indexed) or paragraph number for formats without strict pages."
    )
    text: str
    metadata: Dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra="allow")

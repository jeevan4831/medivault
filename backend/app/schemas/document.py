from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class DocumentResponse(BaseModel):
    id: int
    document_name: str
    original_filename: str
    mime_type: str
    file_type: str
    file_size: int
    category_id: int
    category_name: str | None = None
    description: str | None = None
    created_at: datetime
    updated_at: datetime
    security_status: str = "AES-256-GCM Encrypted"
    owner_name: str | None = None
    sharing_status: str = "Private (0 Shares)"
    active_shares_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class DocumentListResponse(BaseModel):
    documents: list[DocumentResponse]
    total: int


class MessageResponse(BaseModel):
    message: str

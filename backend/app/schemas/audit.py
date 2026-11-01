from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, ConfigDict

from app.models.enums import AuditAction, AuditResult


class AuditLogItemResponse(BaseModel):
    id: int
    timestamp: datetime
    action: AuditAction
    result: AuditResult
    user_id: int | None = None
    document_id: int | None = None
    document_name: str | None = None
    permission_id: int | None = None
    access_type: str
    ip_address: str | None = None
    user_agent: str | None = None
    details: str | None = None

    model_config = ConfigDict(from_attributes=True)

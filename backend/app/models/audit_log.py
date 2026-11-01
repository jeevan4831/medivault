from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.enums import AuditAction, AuditResult
from app.utils.time import utc_now


class AuditLog(Base):
    """Append-only history. Foreign keys use SET NULL so the record survives
    even if the user/document/permission is later deleted."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True
    )
    document_id: Mapped[int | None] = mapped_column(
        ForeignKey("documents.id", ondelete="SET NULL"), index=True, nullable=True
    )
    permission_id: Mapped[int | None] = mapped_column(
        ForeignKey("permissions.id", ondelete="SET NULL"), index=True, nullable=True
    )
    action: Mapped[AuditAction] = mapped_column(
        Enum(AuditAction, native_enum=False, length=30), index=True, nullable=False
    )
    result: Mapped[AuditResult] = mapped_column(
        Enum(AuditResult, native_enum=False, length=20), nullable=False
    )
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now, index=True, nullable=False
    )

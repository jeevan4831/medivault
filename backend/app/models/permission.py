from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import PermissionStatus, PermissionType
from app.utils.time import utc_now

if TYPE_CHECKING:
    from app.models.access_token import AccessToken
    from app.models.document import Document


class Permission(Base):
    """A consent grant from a document owner to a recipient."""

    __tablename__ = "permissions"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True, nullable=False
    )
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    recipient_identifier: Mapped[str] = mapped_column(String(255), nullable=False)
    permission_type: Mapped[PermissionType] = mapped_column(
        Enum(PermissionType, native_enum=False, length=30), nullable=False
    )
    can_view: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    can_download: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)
    status: Mapped[PermissionStatus] = mapped_column(
        Enum(PermissionStatus, native_enum=False, length=20),
        default=PermissionStatus.ACTIVE,
        index=True,
        nullable=False,
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    document: Mapped[Document] = relationship(back_populates="permissions")
    access_tokens: Mapped[list[AccessToken]] = relationship(
        back_populates="permission", cascade="all, delete-orphan", passive_deletes=True
    )

    def is_active_and_valid(self, current_time: datetime | None = None) -> bool:
        """A permission is valid only when current_time < expires_at and status = ACTIVE."""
        now = current_time or utc_now()
        return self.status == PermissionStatus.ACTIVE and now < self.expires_at

    def is_expired(self, current_time: datetime | None = None) -> bool:
        """A permission is expired when status is EXPIRED or current_time >= expires_at."""
        now = current_time or utc_now()
        return self.status == PermissionStatus.EXPIRED or now >= self.expires_at

    def is_revoked(self) -> bool:
        """Check if permission has been manually revoked."""
        return self.status == PermissionStatus.REVOKED or self.revoked_at is not None


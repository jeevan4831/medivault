from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.utils.time import utc_now

if TYPE_CHECKING:
    from app.models.permission import Permission


class AccessToken(Base):
    """Temporary share token. Only the SHA-256 hash is stored - the raw token
    exists only in the link/QR given to the recipient."""

    __tablename__ = "access_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    permission_id: Mapped[int] = mapped_column(
        ForeignKey("permissions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # 64 hex characters = SHA-256 digest. Unique + indexed for fast lookup.
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    permission: Mapped[Permission] = relationship(back_populates="access_tokens")

    def is_valid(self, current_time: datetime | None = None) -> bool:
        """A token is valid only when not revoked and current_time < expires_at."""
        now = current_time or utc_now()
        return (not self.revoked) and now < self.expires_at


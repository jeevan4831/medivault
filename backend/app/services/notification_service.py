from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.enums import NotificationType
from app.models.notification import Notification
from app.utils.time import utc_now


def create_notification(
    db: Session,
    user_id: int,
    title: str,
    message: str,
    notification_type: NotificationType = NotificationType.INFO,
) -> Notification:
    """Create an immutable in-app notification record for a designated user."""
    notif = Notification(
        user_id=user_id,
        title=title[:150],
        message=message[:500],
        notification_type=notification_type,
        is_read=False,
        created_at=utc_now(),
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif

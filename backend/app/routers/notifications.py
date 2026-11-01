from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.notification import Notification
from app.models.user import User
from app.schemas.dashboard import NotificationItemResponse
from app.security.deps import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


@router.get(
    "",
    response_model=list[NotificationItemResponse],
    summary="List in-app notifications for authenticated user",
    description="Returns notifications for the current user, optionally filtered to unread only, sorted newest first.",
)
def get_user_notifications(
    unread_only: bool = Query(False, description="Filter only unread notifications"),
    limit: int = Query(50, ge=1, le=200, description="Page limit"),
    offset: int = Query(0, ge=0, description="Page offset"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[NotificationItemResponse]:
    query = (
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
    )
    if unread_only:
        query = query.where(Notification.is_read.is_(False))

    query = query.offset(offset).limit(limit)
    notifs = db.scalars(query).all()

    return [
        NotificationItemResponse(
            id=n.id,
            title=n.title,
            message=n.message,
            notification_type=n.notification_type.value
            if hasattr(n.notification_type, "value")
            else str(n.notification_type),
            is_read=n.is_read,
            created_at=n.created_at,
        )
        for n in notifs
    ]


@router.get(
    "/unread-count",
    summary="Get unread notification count",
    description="Returns the total number of unread in-app notifications for the current user.",
)
def get_unread_notification_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, int]:
    count = (
        db.scalar(
            select(func.count(Notification.id)).where(
                Notification.user_id == current_user.id,
                Notification.is_read.is_(False),
            )
        )
        or 0
    )
    return {"unread_count": count}


@router.post(
    "/{id}/read",
    response_model=NotificationItemResponse,
    summary="Mark specific notification as read",
    description="Updates is_read to true for the specified notification if owned by the current user.",
)
def mark_notification_read(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NotificationItemResponse:
    notif = db.get(Notification, id)
    if not notif:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found.",
        )

    # Authorization Check: User may only update their own notifications
    if notif.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You can only modify your own notifications.",
        )

    notif.is_read = True
    db.commit()
    db.refresh(notif)

    return NotificationItemResponse(
        id=notif.id,
        title=notif.title,
        message=notif.message,
        notification_type=notif.notification_type.value
        if hasattr(notif.notification_type, "value")
        else str(notif.notification_type),
        is_read=notif.is_read,
        created_at=notif.created_at,
    )


@router.post(
    "/mark-all-read",
    summary="Mark all user notifications as read",
    description="Sets is_read to true on all unread notifications for current user.",
)
def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str | int]:
    notifs = db.scalars(
        select(Notification).where(
            Notification.user_id == current_user.id,
            Notification.is_read.is_(False),
        )
    ).all()
    count = len(notifs)
    for n in notifs:
        n.is_read = True
    db.commit()
    return {"message": "All notifications marked as read.", "count": count}


@router.delete(
    "/{id}",
    summary="Delete specific notification",
    description="Deletes a notification permanently if owned by the authenticated user.",
)
def delete_notification(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str | int]:
    notif = db.get(Notification, id)
    if not notif:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found.",
        )

    # Authorization Check: User may only delete their own notifications
    if notif.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You can only delete your own notifications.",
        )

    db.delete(notif)
    db.commit()
    return {"message": "Notification deleted successfully.", "id": id}


@router.delete(
    "",
    summary="Clear all notifications for user",
    description="Deletes all notifications permanently for the current authenticated user.",
)
def clear_all_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str | int]:
    notifs = db.scalars(
        select(Notification).where(Notification.user_id == current_user.id)
    ).all()
    count = len(notifs)
    for n in notifs:
        db.delete(n)
    db.commit()
    return {"message": "All notifications cleared successfully.", "count": count}


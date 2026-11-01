from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.category import Category
from app.models.document import Document
from app.models.enums import PermissionStatus
from app.models.notification import Notification
from app.models.permission import Permission
from app.models.user import User
from app.schemas.dashboard import (
    CategorySummary,
    DashboardStats,
    DashboardSummaryResponse,
    NotificationItemResponse,
    RecentActivityItem,
)
from app.security.deps import get_current_user
from app.utils.time import utc_now

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

DEFAULT_CATEGORY_NAMES = [
    ("Identity", "Aadhaar, PAN, driving licence, passport"),
    ("Healthcare", "Medical reports, prescriptions, health insurance"),
    ("Education", "Marks cards, degree and other certificates"),
    ("Vehicle", "Vehicle RC, vehicle insurance, PUC"),
    ("Insurance", "Insurance policies and related documents"),
    ("Employment", "Employment and experience documents"),
    ("Other", "Any other personal document"),
]


@router.get("/summary", response_model=DashboardSummaryResponse)
def get_dashboard_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DashboardSummaryResponse:
    """Fetch live dashboard statistics, category summaries, and recent activity for the authenticated user."""
    now = utc_now()
    expiring_window = now + timedelta(hours=48)

    # 1. Total Documents
    total_docs = (
        db.scalar(
            select(func.count(Document.id)).where(Document.owner_id == current_user.id)
        )
        or 0
    )

    # 2. Active Shares
    active_shares = (
        db.scalar(
            select(func.count(Permission.id)).where(
                Permission.owner_id == current_user.id,
                Permission.status == PermissionStatus.ACTIVE,
                Permission.expires_at > now,
            )
        )
        or 0
    )

    # 3. Expiring Soon (within 48 hours)
    expiring_soon = (
        db.scalar(
            select(func.count(Permission.id)).where(
                Permission.owner_id == current_user.id,
                Permission.status == PermissionStatus.ACTIVE,
                Permission.expires_at > now,
                Permission.expires_at <= expiring_window,
            )
        )
        or 0
    )

    # 4. Recent Access Activity
    recent_access = (
        db.scalar(
            select(func.count(AuditLog.id)).where(
                AuditLog.user_id == current_user.id
            )
        )
        or 0
    )

    # 5. Category Counts
    # Fetch all categories from DB or fallback to default
    categories_db = db.scalars(select(Category).order_by(Category.id)).all()
    category_summaries: list[CategorySummary] = []

    if categories_db:
        # Group doc counts by category
        doc_counts_query = (
            select(Document.category_id, func.count(Document.id))
            .where(Document.owner_id == current_user.id)
            .group_by(Document.category_id)
        )
        counts_dict = dict(db.execute(doc_counts_query).all())

        for cat in categories_db:
            category_summaries.append(
                CategorySummary(
                    id=cat.id,
                    name=cat.name,
                    description=cat.description,
                    document_count=counts_dict.get(cat.id, 0),
                )
            )
    else:
        # Fallback if categories haven't been seeded yet in DB
        for idx, (cat_name, cat_desc) in enumerate(DEFAULT_CATEGORY_NAMES, start=1):
            category_summaries.append(
                CategorySummary(
                    id=idx,
                    name=cat_name,
                    description=cat_desc,
                    document_count=0,
                )
            )

    # 6. Recent Activity Items
    activity_rows = (
        db.query(AuditLog, Document.document_name)
        .outerjoin(Document, AuditLog.document_id == Document.id)
        .filter(AuditLog.user_id == current_user.id)
        .order_by(AuditLog.timestamp.desc())
        .limit(10)
        .all()
    )

    recent_activity: list[RecentActivityItem] = []
    for log, doc_name in activity_rows:
        action_val = log.action.value if hasattr(log.action, "value") else str(log.action)
        result_val = log.result.value if hasattr(log.result, "value") else str(log.result)

        detail_text = None
        if action_val == "LOGIN":
            detail_text = "Signed in to secure session"
        elif action_val == "DOCUMENT_UPLOADED":
            detail_text = f"Encrypted and uploaded {doc_name or 'document'}"
        elif action_val == "SHARE_CREATED":
            detail_text = f"Generated temporary share grant for {doc_name or 'document'}"
        elif action_val == "SHARE_ACCESSED":
            detail_text = f"Share link accessed for {doc_name or 'document'}"
        elif action_val == "SHARE_REVOKED":
            detail_text = f"Revoked access to {doc_name or 'document'}"

        recent_activity.append(
            RecentActivityItem(
                id=log.id,
                action=action_val,
                result=result_val,
                document_name=doc_name,
                timestamp=log.timestamp,
                ip_address=log.ip_address,
                details=detail_text,
            )
        )

    # 7. Unread Notifications Count
    unread_notifications = (
        db.scalar(
            select(func.count(Notification.id)).where(
                Notification.user_id == current_user.id,
                Notification.is_read.is_(False),
            )
        )
        or 0
    )

    return DashboardSummaryResponse(
        stats=DashboardStats(
            total_documents=total_docs,
            active_shares=active_shares,
            expiring_soon=expiring_soon,
            recent_access=recent_access,
        ),
        categories=category_summaries,
        recent_activity=recent_activity,
        unread_notifications=unread_notifications,
    )


@router.get("/audit-logs", response_model=list[RecentActivityItem])
def get_audit_logs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[RecentActivityItem]:
    """Fetch complete append-only audit trail for current user and their owned documents."""
    query = (
        db.query(AuditLog, Document.document_name)
        .outerjoin(Document, AuditLog.document_id == Document.id)
        .filter(
            or_(
                AuditLog.user_id == current_user.id,
                Document.owner_id == current_user.id,
            )
        )
        .order_by(AuditLog.timestamp.desc())
        .limit(100)
    )

    results: list[RecentActivityItem] = []
    for log, doc_name in query.all():
        action_val = log.action.value if hasattr(log.action, "value") else str(log.action)
        result_val = log.result.value if hasattr(log.result, "value") else str(log.result)

        detail_text = None
        if action_val == "LOGIN":
            detail_text = "Signed in to secure session"
        elif action_val == "DOCUMENT_UPLOADED":
            detail_text = f"Encrypted and uploaded {doc_name or 'document'}"
        elif action_val == "DOCUMENT_VIEWED":
            detail_text = f"Decrypted and viewed {doc_name or 'document'}"
        elif action_val == "DOCUMENT_DOWNLOADED":
            detail_text = f"Decrypted and downloaded {doc_name or 'document'}"
        elif action_val == "SHARE_CREATED":
            detail_text = f"Generated temporary share grant for {doc_name or 'document'}"
        elif action_val == "SHARE_ACCESSED":
            detail_text = f"Temporary share link accessed for {doc_name or 'document'}"
        elif action_val == "SHARE_ACCESS_DENIED":
            detail_text = f"Share access rejected/denied for {doc_name or 'document'}"
        elif action_val == "SHARE_REVOKED":
            detail_text = f"Revoked share access to {doc_name or 'document'}"
        elif action_val == "SHARE_EXPIRED":
            detail_text = f"Share grant expired for {doc_name or 'document'}"

        results.append(
            RecentActivityItem(
                id=log.id,
                action=action_val,
                result=result_val,
                document_name=doc_name,
                timestamp=log.timestamp,
                ip_address=log.ip_address,
                details=detail_text,
            )
        )

    return results


@router.get("/notifications", response_model=list[NotificationItemResponse])
def get_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[NotificationItemResponse]:
    """Fetch notifications for the authenticated user."""
    notifs = db.scalars(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
    ).all()

    return [
        NotificationItemResponse(
            id=n.id,
            title=n.title,
            message=n.message,
            notification_type=n.notification_type.value if hasattr(n.notification_type, "value") else str(n.notification_type),
            is_read=n.is_read,
            created_at=n.created_at,
        )
        for n in notifs
    ]


@router.post("/notifications/mark-read")
def mark_notifications_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Mark all user's notifications as read."""
    notifs = db.scalars(
        select(Notification)
        .where(Notification.user_id == current_user.id, Notification.is_read.is_(False))
    ).all()
    for n in notifs:
        n.is_read = True
    db.commit()
    return {"message": "All notifications marked as read."}

from datetime import datetime
from pydantic import BaseModel, ConfigDict


class DashboardStats(BaseModel):
    total_documents: int
    active_shares: int
    expiring_soon: int
    recent_access: int


class CategorySummary(BaseModel):
    id: int
    name: str
    description: str | None = None
    document_count: int


class RecentActivityItem(BaseModel):
    id: int
    action: str
    result: str
    document_name: str | None = None
    timestamp: datetime
    ip_address: str | None = None
    details: str | None = None

    model_config = ConfigDict(from_attributes=True)


class DashboardSummaryResponse(BaseModel):
    stats: DashboardStats
    categories: list[CategorySummary]
    recent_activity: list[RecentActivityItem]
    unread_notifications: int


class NotificationItemResponse(BaseModel):
    id: int
    title: str
    message: str
    notification_type: str
    is_read: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


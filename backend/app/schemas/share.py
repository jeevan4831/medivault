from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import PermissionStatus, PermissionType


class ShareCreateRequest(BaseModel):
    document_id: int = Field(..., description="ID of the document to share")
    recipient_identifier: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Recipient identifier, name, email, or department (e.g. Dr. Sarah Jenkins, Hospital Lab)",
    )
    permission_type: PermissionType = Field(
        default=PermissionType.VIEW_ONLY,
        description="Access permission: VIEW_ONLY or VIEW_AND_DOWNLOAD",
    )
    expiry_hours: float = Field(
        default=24.0,
        gt=0,
        le=720,
        description="Lifespan of the temporary grant in hours (up to 30 days)",
    )
    expiry_minutes: float | None = Field(
        default=None,
        gt=0,
        le=43200,
        description="Optional lifespan of the temporary grant in minutes (up to 43,200 mins = 30 days)",
    )


class ShareCreatedResponse(BaseModel):
    permission_id: int
    document_id: int
    document_name: str
    recipient_identifier: str
    permission_type: PermissionType
    can_view: bool
    can_download: bool
    created_at: datetime
    expires_at: datetime
    status: PermissionStatus
    raw_token: str
    access_path: str
    token_hash_preview: str
    lan_ip: str | None = None

    model_config = ConfigDict(from_attributes=True)


class ShareItemResponse(BaseModel):
    permission_id: int
    document_id: int
    document_name: str
    original_filename: str
    category_name: str | None = None
    file_type: str
    recipient_identifier: str
    permission_type: PermissionType
    can_view: bool
    can_download: bool
    created_at: datetime
    expires_at: datetime
    status: PermissionStatus
    is_expired: bool
    revoked_at: datetime | None = None
    last_used_at: datetime | None = None
    time_remaining_seconds: int

    model_config = ConfigDict(from_attributes=True)


class ShareRevokeResponse(BaseModel):
    message: str
    permission_id: int
    status: PermissionStatus
    revoked_at: datetime


class SharedDocumentMetadata(BaseModel):
    document_name: str
    original_filename: str
    category_name: str | None = None
    file_type: str
    mime_type: str
    file_size: int
    permission_type: PermissionType
    can_view: bool
    can_download: bool
    created_at: datetime
    expires_at: datetime
    time_remaining_seconds: int
    recipient_identifier: str
    owner_name: str | None = None
    security_notice: str


class RecipientVerifyRequest(BaseModel):
    recipient_identifier: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Claimed recipient identifier, name, or clinic to verify against the share grant",
    )


class RecipientVerifyResponse(BaseModel):
    verified: bool
    recipient_identifier: str
    permission_type: PermissionType
    can_view: bool
    can_download: bool
    message: str

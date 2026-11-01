"""Enumerations shared by the ORM models."""
import enum


class PermissionType(str, enum.Enum):
    VIEW_ONLY = "VIEW_ONLY"
    VIEW_AND_DOWNLOAD = "VIEW_AND_DOWNLOAD"


class PermissionStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    EXPIRED = "EXPIRED"
    REVOKED = "REVOKED"


class AuditAction(str, enum.Enum):
    LOGIN = "LOGIN"
    LOGIN_FAILED = "LOGIN_FAILED"
    DOCUMENT_UPLOADED = "DOCUMENT_UPLOADED"
    DOCUMENT_VIEWED = "DOCUMENT_VIEWED"
    DOCUMENT_DOWNLOADED = "DOCUMENT_DOWNLOADED"
    DOCUMENT_DELETED = "DOCUMENT_DELETED"
    SHARE_CREATED = "SHARE_CREATED"
    SHARE_ACCESSED = "SHARE_ACCESSED"
    SHARE_ACCESS_DENIED = "SHARE_ACCESS_DENIED"
    SHARE_REVOKED = "SHARE_REVOKED"
    SHARE_EXPIRED = "SHARE_EXPIRED"


class AuditResult(str, enum.Enum):
    SUCCESS = "SUCCESS"
    DENIED = "DENIED"
    FAILURE = "FAILURE"


class NotificationType(str, enum.Enum):
    INFO = "INFO"
    SECURITY = "SECURITY"
    SHARING = "SHARING"
    DOCUMENT = "DOCUMENT"

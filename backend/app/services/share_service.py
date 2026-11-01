from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.access_token import AccessToken
from app.models.audit_log import AuditLog
from app.models.document import Document
from app.models.enums import (
    AuditAction,
    AuditResult,
    NotificationType,
    PermissionStatus,
    PermissionType,
)
from app.models.notification import Notification
from app.models.permission import Permission
from app.models.user import User
from app.schemas.share import ShareCreateRequest
from app.services.notification_service import create_notification
from app.utils.time import utc_now


def generate_cryptographic_token() -> str:
    """Generate a high-entropy, cryptographically secure random token (256-bit).

    Security rationale:
    secrets.token_urlsafe(32) uses os.urandom under the hood, producing 256 bits
    of cryptographic randomness. It is URL-safe and QR-code friendly.
    """
    return secrets.token_urlsafe(32)


def hash_token(raw_token: str) -> str:
    """Compute standard SHA-256 hex digest of the raw token.

    Security rationale:
    We NEVER store raw tokens in the database. Only this 64-character SHA-256
    digest is written to the database. If the database is compromised, an attacker
    cannot construct or use valid share URLs.
    """
    return hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()


def create_share_grant(
    req: ShareCreateRequest,
    current_user: User,
    db: Session,
    client_ip: str | None = None,
    user_agent: str | None = None,
) -> tuple[Permission, Document, str]:
    """Create a temporary document sharing permission, generate a random token,
    and store only its SHA-256 hash."""
    # 1. Authorize: Ensure document exists and is strictly owned by current user
    doc = db.get(Document, req.document_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )
    if doc.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You can only share documents you own.",
        )

    # 2. Expiry calculation (supports both hours and minutes)
    now = utc_now()
    if req.expiry_minutes is not None and req.expiry_minutes > 0:
        expires_at = now + timedelta(minutes=req.expiry_minutes)
        if req.expiry_minutes < 60:
            duration_str = f"{req.expiry_minutes:g}m"
        else:
            duration_str = f"{req.expiry_minutes / 60.0:g}h"
    else:
        expires_at = now + timedelta(hours=req.expiry_hours)
        if req.expiry_hours < 1:
            duration_str = f"{round(req.expiry_hours * 60):g}m"
        else:
            duration_str = f"{req.expiry_hours:g}h"

    # 3. Create Permission record
    can_download = req.permission_type == PermissionType.VIEW_AND_DOWNLOAD
    permission = Permission(
        document_id=doc.id,
        owner_id=current_user.id,
        recipient_identifier=req.recipient_identifier.strip(),
        permission_type=req.permission_type,
        can_view=True,
        can_download=can_download,
        created_at=now,
        expires_at=expires_at,
        status=PermissionStatus.ACTIVE,
    )
    db.add(permission)
    db.flush()  # assign permission.id

    # 4. Cryptographically generate token and store ONLY its hash
    raw_token = generate_cryptographic_token()
    token_digest = hash_token(raw_token)

    access_token = AccessToken(
        permission_id=permission.id,
        token_hash=token_digest,
        created_at=now,
        expires_at=expires_at,
        revoked=False,
    )
    db.add(access_token)

    # 5. Append immutable audit log
    audit = AuditLog(
        user_id=current_user.id,
        document_id=doc.id,
        permission_id=permission.id,
        action=AuditAction.SHARE_CREATED,
        result=AuditResult.SUCCESS,
        ip_address=client_ip,
        user_agent=user_agent,
        timestamp=now,
    )
    db.add(audit)

    # 6. Notify owner
    perm_label = "View & Download" if can_download else "View Only"
    notification = Notification(
        user_id=current_user.id,
        title="Document Shared Temporarily",
        message=(
            f"Created temporary {perm_label} access grant for '{doc.document_name}' "
            f"to {req.recipient_identifier} (expires in {duration_str})."
        ),
        notification_type=NotificationType.SHARING,
        is_read=False,
        created_at=now,
    )
    db.add(notification)

    db.commit()
    db.refresh(permission)
    db.refresh(doc)

    return permission, doc, raw_token


def revoke_share_grant(
    permission_id: int,
    current_user: User,
    db: Session,
    client_ip: str | None = None,
    user_agent: str | None = None,
) -> Permission:
    """Owner can revoke an active permission at any time.

    Revocation:
    - Immediately invalidate access.
    - Set status to REVOKED.
    - Record revoked_at.
    - Add audit log entry.
    """
    permission = db.get(Permission, permission_id)
    if not permission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share grant not found.",
        )

    if permission.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You can only revoke sharing permissions you created.",
        )

    now = utc_now()

    # Reject revoking an already revoked permission
    if permission.status == PermissionStatus.REVOKED or permission.is_revoked():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Share permission is already revoked.",
        )

    # Reject revoking an expired permission
    if permission.is_expired(now):
        if permission.status != PermissionStatus.EXPIRED:
            permission.status = PermissionStatus.EXPIRED
            db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot revoke an expired permission. The share has already expired.",
        )

    # 1. Immediately invalidate access
    permission.status = PermissionStatus.REVOKED
    permission.revoked_at = now

    tokens = db.scalars(
        select(AccessToken).where(AccessToken.permission_id == permission.id)
    ).all()
    for t in tokens:
        t.revoked = True

    # 2. Add audit log entry
    audit = AuditLog(
        user_id=current_user.id,
        document_id=permission.document_id,
        permission_id=permission.id,
        action=AuditAction.SHARE_REVOKED,
        result=AuditResult.SUCCESS,
        ip_address=client_ip,
        user_agent=user_agent,
        timestamp=now,
    )
    db.add(audit)

    # 3. Notification for document owner
    doc_name = permission.document.document_name if permission.document else "document"
    notification = Notification(
        user_id=current_user.id,
        title="Share Access Revoked",
        message=f"Revoked temporary share access for '{doc_name}' ({permission.recipient_identifier}).",
        notification_type=NotificationType.SHARING,
        is_read=False,
        created_at=now,
    )
    db.add(notification)

    db.commit()
    db.refresh(permission)
    return permission


def validate_shared_token(
    raw_token: str,
    db: Session,
    client_ip: str | None = None,
    user_agent: str | None = None,
) -> tuple[AccessToken, Permission, Document]:
    """Authenticate and authorize access using a raw temporary token.

    A permission is valid only when:
        current_time < expires_at
        AND status = ACTIVE
        AND token is valid (exists, not revoked, current_time < token.expires_at)
        AND authorization succeeds

    When current_time >= expires_at:
        - Treat permission as EXPIRED.
        - Deny access.
        - Update status when appropriate.
        - Record the expiration event.

    The authorization check must independently verify expiration on every access request,
    never relying solely on a background job for security.
    """
    token_digest = hash_token(raw_token)
    now = utc_now()

    token_record = db.scalar(
        select(AccessToken).where(AccessToken.token_hash == token_digest)
    )

    if not token_record:
        # Audit failed access attempt for non-existent / invalid token
        audit = AuditLog(
            user_id=None,
            document_id=None,
            permission_id=None,
            action=AuditAction.SHARE_ACCESS_DENIED,
            result=AuditResult.DENIED,
            ip_address=client_ip,
            user_agent=user_agent,
            timestamp=now,
        )
        db.add(audit)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid or unrecognized temporary share token.",
        )

    permission = token_record.permission
    if not permission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Associated sharing permission record not found.",
        )

    # 1. Check Revocation: If permission or token was revoked, deny immediately
    if token_record.revoked or permission.is_revoked():
        if permission.status != PermissionStatus.REVOKED:
            permission.status = PermissionStatus.REVOKED
            if not permission.revoked_at:
                permission.revoked_at = now
        token_record.revoked = True

        audit = AuditLog(
            user_id=None,
            document_id=permission.document_id,
            permission_id=permission.id,
            action=AuditAction.SHARE_ACCESS_DENIED,
            result=AuditResult.DENIED,
            ip_address=client_ip,
            user_agent=user_agent,
            timestamp=now,
        )
        db.add(audit)

        # Notify owner of access attempt on revoked share
        doc_title = permission.document.document_name if permission.document else "document"
        create_notification(
            db=db,
            user_id=permission.owner_id,
            title="Revoked Share Access Blocked",
            message=f"Access attempt blocked on revoked share for '{doc_title}' ({permission.recipient_identifier}).",
            notification_type=NotificationType.SECURITY,
        )

        db.commit()
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This share link has been revoked by the owner.",
        )

    # 2. Expiration Verification on every access request (current_time >= expires_at):
    # Treat permission as EXPIRED, deny access, update status, and record expiration event.
    if permission.is_expired(now) or not token_record.is_valid(now):
        if permission.status != PermissionStatus.EXPIRED:
            permission.status = PermissionStatus.EXPIRED
        token_record.revoked = True

        audit = AuditLog(
            user_id=None,
            document_id=permission.document_id,
            permission_id=permission.id,
            action=AuditAction.SHARE_EXPIRED,
            result=AuditResult.DENIED,
            ip_address=client_ip,
            user_agent=user_agent,
            timestamp=now,
        )
        db.add(audit)

        # Notify owner of expired share link
        doc_title = permission.document.document_name if permission.document else "document"
        create_notification(
            db=db,
            user_id=permission.owner_id,
            title="Share Grant Expired",
            message=f"Temporary share access for '{doc_title}' ({permission.recipient_identifier}) has expired.",
            notification_type=NotificationType.SHARING,
        )

        db.commit()
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This temporary share link has expired.",
        )

    # 3. Status Check: Must be strictly ACTIVE
    if permission.status != PermissionStatus.ACTIVE:
        audit = AuditLog(
            user_id=None,
            document_id=permission.document_id,
            permission_id=permission.id,
            action=AuditAction.SHARE_ACCESS_DENIED,
            result=AuditResult.DENIED,
            ip_address=client_ip,
            user_agent=user_agent,
            timestamp=now,
        )
        db.add(audit)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"This share permission is not active (current status: {permission.status.value}).",
        )

    doc = permission.document
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shared document not found.",
        )

    return token_record, permission, doc


def cleanup_expired_permissions(
    db: Session,
    reference_time: datetime | None = None,
) -> dict:
    """Identify expired permissions in the database and perform maintenance cleanup.

    Transitions ACTIVE permissions where current_time >= expires_at to EXPIRED,
    invalidates associated access tokens, and appends audit log entries.

    CRITICAL SECURITY INVARIANT:
    Never rely solely on this maintenance job for security.
    The authorization check independently verifies expiration on every access request.
    """
    now = reference_time or utc_now()

    # Find ACTIVE permissions where expires_at <= now
    stmt = (
        select(Permission)
        .where(
            Permission.status == PermissionStatus.ACTIVE,
            Permission.expires_at <= now,
        )
    )
    expired_permissions = list(db.scalars(stmt).all())
    expired_count = len(expired_permissions)
    expired_ids = []

    for perm in expired_permissions:
        perm.status = PermissionStatus.EXPIRED
        expired_ids.append(perm.id)

        # Invalidate access tokens
        tokens = db.scalars(
            select(AccessToken).where(AccessToken.permission_id == perm.id)
        ).all()
        for t in tokens:
            t.revoked = True

        # Append audit log entry for the expiration event
        audit = AuditLog(
            user_id=None,
            document_id=perm.document_id,
            permission_id=perm.id,
            action=AuditAction.SHARE_EXPIRED,
            result=AuditResult.SUCCESS,
            ip_address=None,
            user_agent="System-Maintenance-Worker",
            timestamp=now,
        )
        db.add(audit)

        # Notify document owner of expired grant
        perm_doc_name = perm.document.document_name if perm.document else "document"
        create_notification(
            db=db,
            user_id=perm.owner_id,
            title="Share Grant Expired",
            message=f"Temporary share grant for '{perm_doc_name}' ({perm.recipient_identifier}) has expired.",
            notification_type=NotificationType.SHARING,
        )

    # Clean up lingering non-revoked tokens whose expires_at <= now
    token_stmt = (
        select(AccessToken)
        .where(
            AccessToken.revoked.is_(False),
            AccessToken.expires_at <= now,
        )
    )
    lingering_tokens = list(db.scalars(token_stmt).all())
    for t in lingering_tokens:
        t.revoked = True

    db.commit()

    return {
        "checked_at": now.isoformat(),
        "expired_count": expired_count,
        "expired_permission_ids": expired_ids,
        "lingering_tokens_revoked": len(lingering_tokens),
    }


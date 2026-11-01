from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.enums import AuditAction, AuditResult, NotificationType
from app.schemas.share import (
    RecipientVerifyRequest,
    RecipientVerifyResponse,
    SharedDocumentMetadata,
)
from app.services.notification_service import create_notification
from app.services.share_service import validate_shared_token
from app.services.storage_service import decrypt_stored_document
from app.utils.time import utc_now

router = APIRouter(prefix="/api/shared-access", tags=["Shared Access"])


@router.get(
    "/{token}",
    response_model=SharedDocumentMetadata,
    summary="Validate temporary share token and retrieve document metadata",
    description="Public endpoint. Validates token hash, expiry, and revocation. Returns safe metadata without document contents or cryptographic keys.",
)
def get_shared_document_info(
    token: str,
    request: Request,
    db: Session = Depends(get_db),
) -> SharedDocumentMetadata:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    token_rec, perm, doc = validate_shared_token(
        raw_token=token,
        db=db,
        client_ip=client_ip,
        user_agent=user_agent,
    )

    now = utc_now()
    remaining = max(0, int((perm.expires_at - now).total_seconds()))

    file_type = "FILE"
    mime = (doc.mime_type or "").lower()
    orig = (doc.original_filename or "").lower()
    if "pdf" in mime or orig.endswith(".pdf"):
        file_type = "PDF"
    elif "jpeg" in mime or "jpg" in mime or orig.endswith((".jpg", ".jpeg")):
        file_type = "JPEG"
    elif "png" in mime or orig.endswith(".png"):
        file_type = "PNG"

    category_name = doc.category.name if doc.category else None
    owner_name = doc.owner.full_name if (doc.owner and hasattr(doc.owner, "full_name")) else None

    # Record successful share metadata access attempt
    audit = AuditLog(
        user_id=None,
        document_id=doc.id,
        permission_id=perm.id,
        action=AuditAction.SHARE_ACCESSED,
        result=AuditResult.SUCCESS,
        ip_address=client_ip,
        user_agent=user_agent,
        timestamp=now,
    )
    db.add(audit)
    db.commit()

    return SharedDocumentMetadata(
        document_name=doc.document_name,
        original_filename=doc.original_filename,
        category_name=category_name,
        file_type=file_type,
        mime_type=doc.mime_type,
        file_size=doc.file_size,
        permission_type=perm.permission_type,
        can_view=perm.can_view,
        can_download=perm.can_download,
        created_at=perm.created_at,
        expires_at=perm.expires_at,
        time_remaining_seconds=remaining,
        recipient_identifier=perm.recipient_identifier,
        owner_name=owner_name,
        security_notice="The QR code provides temporary access to the selected document. It does not contain the document itself.",
    )


@router.post(
    "/{token}/verify",
    response_model=RecipientVerifyResponse,
    summary="Verify recipient identity against temporary grant",
    description="Validates recipient identity against the share grant. Records audit events for success and failure.",
)
def verify_recipient_identity(
    token: str,
    payload: RecipientVerifyRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> RecipientVerifyResponse:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    token_rec, perm, doc = validate_shared_token(
        raw_token=token,
        db=db,
        client_ip=client_ip,
        user_agent=user_agent,
    )

    claimed = (payload.recipient_identifier or "").strip().lower()
    expected = (perm.recipient_identifier or "").strip().lower()

    # Verify recipient identifier matches or contains claimed name/id
    is_match = bool(claimed and (claimed in expected or expected in claimed))

    now = utc_now()
    if not is_match:
        audit = AuditLog(
            user_id=None,
            document_id=doc.id,
            permission_id=perm.id,
            action=AuditAction.SHARE_ACCESS_DENIED,
            result=AuditResult.DENIED,
            ip_address=client_ip,
            user_agent=user_agent,
            timestamp=now,
        )
        db.add(audit)

        # Notify owner of failed access attempt
        create_notification(
            db=db,
            user_id=doc.owner_id,
            title="Failed Access Attempt",
            message=f"Unauthorized recipient verification attempt on '{doc.document_name}'. Claimed: '{payload.recipient_identifier}'.",
            notification_type=NotificationType.SECURITY,
        )

        db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Recipient verification failed. Claimed identifier does not match authorized recipient.",
        )

    # Record verified access in audit trail
    audit = AuditLog(
        user_id=None,
        document_id=doc.id,
        permission_id=perm.id,
        action=AuditAction.SHARE_ACCESSED,
        result=AuditResult.SUCCESS,
        ip_address=client_ip,
        user_agent=user_agent,
        timestamp=now,
    )
    db.add(audit)
    db.commit()

    return RecipientVerifyResponse(
        verified=True,
        recipient_identifier=perm.recipient_identifier,
        permission_type=perm.permission_type,
        can_view=perm.can_view,
        can_download=perm.can_download,
        message="Recipient identity verified successfully.",
    )


@router.get(
    "/{token}/view",
    summary="View decrypted shared document inline",
    description="Public endpoint. Validates temporary token, decrypts file in-memory using AES-256-GCM, and streams inline.",
)
def view_shared_document(
    token: str,
    request: Request,
    db: Session = Depends(get_db),
) -> Response:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    token_rec, perm, doc = validate_shared_token(
        raw_token=token,
        db=db,
        client_ip=client_ip,
        user_agent=user_agent,
    )

    # In-memory decryption only
    raw_content = decrypt_stored_document(doc.file_path)

    # Mark token usage timestamp
    now = utc_now()
    token_rec.used_at = now

    # Record security audit log for the inline document viewing
    audit = AuditLog(
        user_id=None,
        document_id=doc.id,
        permission_id=perm.id,
        action=AuditAction.DOCUMENT_VIEWED,
        result=AuditResult.SUCCESS,
        ip_address=client_ip,
        user_agent=user_agent,
        timestamp=now,
    )
    db.add(audit)

    # In-app notification for document accessed
    create_notification(
        db=db,
        user_id=doc.owner_id,
        title="Shared Document Accessed",
        message=f"'{doc.document_name}' was viewed via temporary share link by {perm.recipient_identifier}.",
        notification_type=NotificationType.SHARING,
    )

    db.commit()

    return Response(
        content=raw_content,
        media_type=doc.mime_type,
        headers={
            "Content-Disposition": f'inline; filename="{doc.original_filename}"',
            "Cache-Control": "no-store, no-cache, must-revalidate, private",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get(
    "/{token}/download",
    summary="Download decrypted shared document",
    description="Public endpoint. Validates temporary token and checks download permission. Decrypts and streams attachment.",
)
def download_shared_document(
    token: str,
    request: Request,
    db: Session = Depends(get_db),
) -> Response:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    token_rec, perm, doc = validate_shared_token(
        raw_token=token,
        db=db,
        client_ip=client_ip,
        user_agent=user_agent,
    )

    # Strict authorization: Verify download permission was granted
    if not perm.can_download:
        audit = AuditLog(
            user_id=None,
            document_id=doc.id,
            permission_id=perm.id,
            action=AuditAction.SHARE_ACCESS_DENIED,
            result=AuditResult.DENIED,
            ip_address=client_ip,
            user_agent=user_agent,
            timestamp=utc_now(),
        )
        db.add(audit)

        # Notify owner of unauthorized download attempt
        create_notification(
            db=db,
            user_id=doc.owner_id,
            title="Unauthorized Download Attempt",
            message=f"Blocked unauthorized download attempt on view-only share for '{doc.document_name}'.",
            notification_type=NotificationType.SECURITY,
        )

        db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Download permission is not enabled for this view-only share.",
        )

    # In-memory decryption only
    raw_content = decrypt_stored_document(doc.file_path)

    now = utc_now()
    token_rec.used_at = now

    # Record download audit log
    audit = AuditLog(
        user_id=None,
        document_id=doc.id,
        permission_id=perm.id,
        action=AuditAction.DOCUMENT_DOWNLOADED,
        result=AuditResult.SUCCESS,
        ip_address=client_ip,
        user_agent=user_agent,
        timestamp=now,
    )
    db.add(audit)

    # In-app notification for document downloaded
    create_notification(
        db=db,
        user_id=doc.owner_id,
        title="Shared Document Downloaded",
        message=f"'{doc.document_name}' was downloaded via temporary share link by {perm.recipient_identifier}.",
        notification_type=NotificationType.SHARING,
    )

    db.commit()

    return Response(
        content=raw_content,
        media_type=doc.mime_type,
        headers={
            "Content-Disposition": f'attachment; filename="{doc.original_filename}"',
            "Cache-Control": "no-store, no-cache, must-revalidate, private",
            "X-Content-Type-Options": "nosniff",
        },
    )

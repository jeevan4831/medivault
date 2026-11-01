from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.access_token import AccessToken
from app.models.document import Document
from app.models.enums import PermissionStatus
from app.models.permission import Permission
from app.models.user import User
from app.schemas.share import (
    ShareCreateRequest,
    ShareCreatedResponse,
    ShareItemResponse,
    ShareRevokeResponse,
)
from app.security.deps import get_current_user
from app.services.share_service import (
    cleanup_expired_permissions,
    create_share_grant,
    revoke_share_grant,
)
from app.utils.time import utc_now

router = APIRouter(prefix="/api/shares", tags=["Shares"])


def serialize_share_item(perm: Permission) -> ShareItemResponse:
    now = utc_now()
    doc = perm.document
    category_name = doc.category.name if (doc and doc.category) else None
    doc_name = doc.document_name if doc else "Unknown"
    orig_name = doc.original_filename if doc else "document"

    file_type = "FILE"
    if doc:
        mime = (doc.mime_type or "").lower()
        orig = orig_name.lower()
        if "pdf" in mime or orig.endswith(".pdf"):
            file_type = "PDF"
        elif "jpeg" in mime or "jpg" in mime or orig.endswith((".jpg", ".jpeg")):
            file_type = "JPEG"
        elif "png" in mime or orig.endswith(".png"):
            file_type = "PNG"

    is_expired = perm.expires_at <= now or perm.status == PermissionStatus.EXPIRED
    computed_status = perm.status
    if perm.status == PermissionStatus.ACTIVE and is_expired:
        computed_status = PermissionStatus.EXPIRED

    remaining = max(0, int((perm.expires_at - now).total_seconds())) if not is_expired else 0

    # Get last used timestamp
    last_used = None
    if perm.access_tokens:
        for t in perm.access_tokens:
            if t.used_at and (last_used is None or t.used_at > last_used):
                last_used = t.used_at

    return ShareItemResponse(
        permission_id=perm.id,
        document_id=perm.document_id,
        document_name=doc_name,
        original_filename=orig_name,
        category_name=category_name,
        file_type=file_type,
        recipient_identifier=perm.recipient_identifier,
        permission_type=perm.permission_type,
        can_view=perm.can_view,
        can_download=perm.can_download,
        created_at=perm.created_at,
        expires_at=perm.expires_at,
        status=computed_status,
        is_expired=is_expired,
        revoked_at=perm.revoked_at,
        last_used_at=last_used,
        time_remaining_seconds=remaining,
    )


@router.post(
    "",
    response_model=ShareCreatedResponse,
    summary="Create temporary document share grant",
    description="Generates a cryptographically random token, computes SHA-256 hash for database storage, and returns the one-time raw token and access path for QR code encoding.",
)
def create_share(
    req: ShareCreateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ShareCreatedResponse:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    permission, doc, raw_token = create_share_grant(
        req=req,
        current_user=current_user,
        db=db,
        client_ip=client_ip,
        user_agent=user_agent,
    )

    token_rec = db.scalar(
        select(AccessToken).where(AccessToken.permission_id == permission.id)
    )
    token_preview = f"sha256:{token_rec.token_hash[:8]}..." if token_rec else "sha256:unknown"

    from app.routers.health import get_lan_ip

    return ShareCreatedResponse(
        permission_id=permission.id,
        document_id=doc.id,
        document_name=doc.document_name,
        recipient_identifier=permission.recipient_identifier,
        permission_type=permission.permission_type,
        can_view=permission.can_view,
        can_download=permission.can_download,
        created_at=permission.created_at,
        expires_at=permission.expires_at,
        status=permission.status,
        raw_token=raw_token,
        access_path=f"/shared-access/{raw_token}",
        token_hash_preview=token_preview,
        lan_ip=get_lan_ip(),
    )


@router.get(
    "",
    response_model=list[ShareItemResponse],
    summary="List authenticated user's shares",
    description="Returns list of temporary document shares created by the authenticated owner.",
)
def list_shares(
    document_id: int | None = Query(None, description="Filter by document ID"),
    status_filter: str | None = Query(None, description="Filter: active, expired, revoked, all"),
    search: str | None = Query(None, description="Search recipient or document name"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ShareItemResponse]:
    query = (
        select(Permission)
        .where(Permission.owner_id == current_user.id)
        .order_by(Permission.created_at.desc())
    )

    if document_id is not None:
        doc = db.get(Document, document_id)
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found.",
            )
        if doc.owner_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. You do not own this document.",
            )
        query = query.where(Permission.document_id == document_id)

    perms = db.scalars(query).all()
    now = utc_now()

    updated_any = False
    results: list[ShareItemResponse] = []
    for p in perms:
        # Update status in DB if active permission is expired
        if p.status == PermissionStatus.ACTIVE and p.is_expired(now):
            p.status = PermissionStatus.EXPIRED
            updated_any = True

        item = serialize_share_item(p)

        # Apply status filter
        if status_filter and status_filter.lower() != "all":
            sf = status_filter.upper()
            if sf == "ACTIVE" and (item.status != PermissionStatus.ACTIVE or item.is_expired):
                continue
            elif sf == "EXPIRED" and not item.is_expired:
                continue
            elif sf == "REVOKED" and item.status != PermissionStatus.REVOKED:
                continue

        # Apply search filter
        if search and search.strip():
            term = search.strip().lower()
            if (
                term not in item.recipient_identifier.lower()
                and term not in item.document_name.lower()
            ):
                continue

        results.append(item)

    if updated_any:
        db.commit()

    return results


@router.post(
    "/maintenance/cleanup",
    summary="Trigger maintenance cleanup of expired permissions",
    description="Identifies active permissions that have reached expires_at, sets them to EXPIRED, invalidates tokens, and records audit logs.",
)
def trigger_maintenance_cleanup(
    background_tasks: BackgroundTasks,
    run_immediately: bool = Query(
        True,
        description="Run synchronously and return results, or schedule in background task",
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if run_immediately:
        result = cleanup_expired_permissions(db)
        return {
            "message": "Permission cleanup completed successfully.",
            "data": result,
        }
    else:
        def _bg_task():
            from app.database import SessionLocal

            with SessionLocal() as s:
                cleanup_expired_permissions(s)

        background_tasks.add_task(_bg_task)
        return {
            "message": "Permission cleanup task queued in background.",
            "data": None,
        }


@router.post(
    "/{permission_id}/revoke",
    response_model=ShareRevokeResponse,
    summary="Revoke temporary share grant immediately",
    description="Sets permission to REVOKED and invalidates all associated access tokens.",
)
def revoke_share(
    permission_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ShareRevokeResponse:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    perm = revoke_share_grant(
        permission_id=permission_id,
        current_user=current_user,
        db=db,
        client_ip=client_ip,
        user_agent=user_agent,
    )

    return ShareRevokeResponse(
        message="Temporary document share revoked successfully. The access token and QR code are now invalid.",
        permission_id=perm.id,
        status=perm.status,
        revoked_at=perm.revoked_at or utc_now(),
    )

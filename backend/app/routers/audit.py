from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.document import Document
from app.models.enums import AuditAction, AuditResult
from app.models.permission import Permission
from app.models.user import User
from app.schemas.audit import AuditLogItemResponse
from app.security.deps import get_current_user

router = APIRouter(prefix="/api/audit", tags=["Audit Logging"])


def derive_access_type(action: AuditAction, perm: Permission | None, user_agent: str | None, doc: Document | None) -> str:
    """Derive a human-readable access type classification."""
    action_str = action.value if hasattr(action, "value") else str(action)
    if action_str in ("LOGIN", "LOGIN_FAILED"):
        return "Authentication"
    if user_agent and "System-Maintenance" in user_agent:
        return "System Maintenance"
    if perm is not None or action_str.startswith("SHARE_"):
        return "Temporary Shared Access"
    if doc is not None or action_str.startswith("DOCUMENT_"):
        return "Owner Direct Access"
    return "Account Security"


@router.get(
    "/my-history",
    response_model=list[AuditLogItemResponse],
    summary="Get authenticated user's audit and access history",
    description="Returns security audit records strictly authorized for the current user. Includes events initiated by the user and events occurring on documents/shares owned by the user.",
)
def get_my_audit_history(
    action: str | None = Query(None, description="Filter by AuditAction name"),
    result: str | None = Query(None, description="Filter by result: SUCCESS, DENIED, FAILURE"),
    search: str | None = Query(None, description="Search by document name, action, or IP address"),
    limit: int = Query(100, ge=1, le=500, description="Page limit"),
    offset: int = Query(0, ge=0, description="Page offset"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AuditLogItemResponse]:
    """Retrieve immutable audit history strictly authorized for the current user.

    Authorization Invariant:
    A user may only see audit logs where:
    1. They are the actor (AuditLog.user_id == current_user.id), OR
    2. The event concerns a document they own (Document.owner_id == current_user.id), OR
    3. The event concerns a share grant they created (Permission.owner_id == current_user.id).
    """
    # Build query joining Document and Permission to inspect ownership
    query = (
        db.query(AuditLog, Document.document_name, Permission.recipient_identifier)
        .outerjoin(Document, AuditLog.document_id == Document.id)
        .outerjoin(Permission, AuditLog.permission_id == Permission.id)
        .filter(
            or_(
                AuditLog.user_id == current_user.id,
                Document.owner_id == current_user.id,
                Permission.owner_id == current_user.id,
            )
        )
    )

    if action and action.strip():
        query = query.filter(AuditLog.action == action.strip().upper())

    if result and result.strip():
        query = query.filter(AuditLog.result == result.strip().upper())

    records = query.order_by(AuditLog.timestamp.desc()).all()

    results: list[AuditLogItemResponse] = []
    for log, doc_name, recip_ident in records:
        access_type = derive_access_type(log.action, log.permission_id, log.user_agent, log.document_id)

        # Generate descriptive detail text
        action_name = log.action.value if hasattr(log.action, "value") else str(log.action)
        detail_msg = None
        if action_name == "LOGIN":
            detail_msg = "User logged in to session"
        elif action_name == "LOGIN_FAILED":
            detail_msg = "Failed login attempt (invalid credentials or inactive account)"
        elif action_name == "DOCUMENT_UPLOADED":
            detail_msg = f"Encrypted and uploaded '{doc_name or 'document'}'"
        elif action_name == "DOCUMENT_VIEWED":
            detail_msg = f"Decrypted and viewed '{doc_name or 'document'}'"
        elif action_name == "DOCUMENT_DOWNLOADED":
            detail_msg = f"Decrypted and downloaded '{doc_name or 'document'}'"
        elif action_name == "DOCUMENT_DELETED":
            detail_msg = f"Permanently deleted '{doc_name or 'document'}'"
        elif action_name == "SHARE_CREATED":
            detail_msg = f"Created temporary share grant for '{doc_name or 'document'}' to {recip_ident or 'recipient'}"
        elif action_name == "SHARE_ACCESSED":
            detail_msg = f"Temporary share accessed for '{doc_name or 'document'}'"
        elif action_name == "SHARE_ACCESS_DENIED":
            detail_msg = f"Share access denied or rejected for '{doc_name or 'document'}'"
        elif action_name == "SHARE_REVOKED":
            detail_msg = f"Revoked share access to '{doc_name or 'document'}'"
        elif action_name == "SHARE_EXPIRED":
            detail_msg = f"Share grant expired for '{doc_name or 'document'}'"

        if search and search.strip():
            term = search.strip().lower()
            haystack = f"{action_name} {doc_name or ''} {recip_ident or ''} {access_type} {log.ip_address or ''} {detail_msg or ''}".lower()
            if term not in haystack:
                continue

        results.append(
            AuditLogItemResponse(
                id=log.id,
                timestamp=log.timestamp,
                action=log.action,
                result=log.result,
                user_id=log.user_id,
                document_id=log.document_id,
                document_name=doc_name,
                permission_id=log.permission_id,
                access_type=access_type,
                ip_address=log.ip_address,
                user_agent=log.user_agent,
                details=detail_msg,
            )
        )

    return results[offset : offset + limit]


# ==============================================================================
# Tamper Resistance: Normal users are strictly forbidden from altering or deleting audit logs
# ==============================================================================
@router.delete(
    "/{log_id}",
    summary="Delete audit log (Forbidden)",
    description="Audit logs are immutable append-only legal records and cannot be deleted.",
)
def delete_audit_log(
    log_id: int,
    current_user: User = Depends(get_current_user),
) -> None:
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Security violation: Audit logs are append-only and cannot be modified or deleted.",
    )


@router.put(
    "/{log_id}",
    summary="Modify audit log (Forbidden)",
    description="Audit logs are immutable append-only legal records and cannot be modified.",
)
def modify_audit_log(
    log_id: int,
    current_user: User = Depends(get_current_user),
) -> None:
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Security violation: Audit logs are immutable and cannot be modified.",
    )

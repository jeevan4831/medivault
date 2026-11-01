from pathlib import Path
import re

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.category import Category
from app.models.document import Document
from app.models.enums import AuditAction, AuditResult, NotificationType, PermissionStatus
from app.models.user import User
from app.schemas.document import DocumentResponse, MessageResponse
from app.security.deps import get_current_user
from app.services.notification_service import create_notification
from app.services.storage_service import (
    decrypt_stored_document,
    read_and_validate_file_content,
    securely_delete_file,
    securely_store_file,
    validate_file_metadata,
)
from app.utils.time import utc_now

router = APIRouter(prefix="/api/documents", tags=["Documents"])


def serialize_document_response(doc: Document) -> DocumentResponse:
    """Safely convert a Document ORM model to a response.

    Security rationale:
    Internal storage paths (`file_path`), server-side random filenames (`stored_filename`),
    and cryptographic keys are explicitly omitted from the response to prevent path traversal
    probing or architecture fingerprinting by clients.
    """
    category_name = doc.category.name if doc.category else None

    # Determine canonical file type label
    file_type = "FILE"
    orig_lower = (doc.original_filename or "").lower()
    if doc.mime_type == "application/pdf" or orig_lower.endswith(".pdf"):
        file_type = "PDF"
    elif doc.mime_type == "image/jpeg" or orig_lower.endswith((".jpg", ".jpeg")):
        file_type = "JPEG"
    elif doc.mime_type == "image/png" or orig_lower.endswith(".png"):
        file_type = "PNG"

    # Compute active shares
    now = utc_now()
    active_shares = 0
    if hasattr(doc, "permissions") and doc.permissions:
        for p in doc.permissions:
            if p.status == PermissionStatus.ACTIVE and p.expires_at > now:
                active_shares += 1

    sharing_status = f"Active ({active_shares} Shares)" if active_shares > 0 else "Private (0 Shares)"
    owner_name = doc.owner.full_name if hasattr(doc, "owner") and doc.owner else None

    return DocumentResponse(
        id=doc.id,
        document_name=doc.document_name,
        original_filename=doc.original_filename,
        mime_type=doc.mime_type,
        file_type=file_type,
        file_size=doc.file_size,
        category_id=doc.category_id,
        category_name=category_name,
        description=doc.description,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        security_status="AES-256-GCM Encrypted",
        owner_name=owner_name,
        sharing_status=sharing_status,
        active_shares_count=active_shares,
    )


@router.get(
    "/categories",
    summary="List available document categories",
    description="Returns list of all predefined categories.",
)
def get_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    cats = db.scalars(select(Category).order_by(Category.id)).all()
    return [{"id": c.id, "name": c.name, "description": c.description} for c in cats]


@router.post(
    "/upload",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a secure personal document",
    description="Validates file size (max 10MB), extension, and MIME type. Encrypts with AES-256-GCM before disk storage. Assigns ownership to authenticated user.",
)
async def upload_document(
    request: Request,
    document_name: str = Form(..., min_length=1, max_length=255),
    category_id: int = Form(...),
    file: UploadFile = File(...),
    description: str | None = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DocumentResponse:
    # 1. Validate Category exists
    category = db.get(Category, category_id)
    if not category:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Specified category ID does not exist.",
        )

    # 2. Validate file extension and MIME type
    ext = validate_file_metadata(file)

    # 3. Read and validate file content (max 10 MB, check magic bytes)
    content = await read_and_validate_file_content(file, ext)

    # Determine canonical MIME type
    canonical_mime = "application/pdf"
    if ext in (".jpg", ".jpeg"):
        canonical_mime = "image/jpeg"
    elif ext == ".png":
        canonical_mime = "image/png"

    # 4. Server-Side Encryption (AES-256-GCM):
    # - Generates a fresh 96-bit nonce using os.urandom.
    # - Computes ciphertext and 128-bit authentication tag.
    # - Generates a random server-side filename (never uses original user filename on disk).
    # - Writes ciphertext to private server storage outside web roots.
    # Clean and sanitize original filename against path traversal and header splitting
    raw_filename = file.filename or "document"
    clean_filename = Path(raw_filename).name.strip()
    clean_filename = re.sub(r'[\r\n"\0]', '', clean_filename)
    if not clean_filename:
        clean_filename = f"document{ext}"

    stored_filename, file_path, enc_metadata = securely_store_file(content, clean_filename)

    # 5. Create Document record in DB associated strictly with authenticated owner
    new_doc = Document(
        owner_id=current_user.id,
        category_id=category.id,
        document_name=document_name.strip(),
        original_filename=clean_filename,
        stored_filename=stored_filename,
        file_path=file_path,
        mime_type=canonical_mime,
        file_size=len(content),
        encryption_metadata=enc_metadata,
        description=description.strip() if description else None,
    )
    db.add(new_doc)
    db.flush()

    # 6. Record immutable security audit log
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    audit = AuditLog(
        user_id=current_user.id,
        document_id=new_doc.id,
        action=AuditAction.DOCUMENT_UPLOADED,
        result=AuditResult.SUCCESS,
        ip_address=client_ip,
        user_agent=user_agent,
    )
    db.add(audit)

    # In-app notification for new document upload
    create_notification(
        db=db,
        user_id=current_user.id,
        title="Document Uploaded",
        message=f"'{new_doc.document_name}' was encrypted with AES-256-GCM and stored securely.",
        notification_type=NotificationType.DOCUMENT,
    )

    db.commit()
    db.refresh(new_doc)

    return serialize_document_response(new_doc)


@router.get(
    "",
    response_model=list[DocumentResponse],
    summary="List authenticated user's documents",
    description="Returns documents owned by the authenticated user. Strictly filters by owner.",
)
def list_documents(
    category_id: int | None = Query(None, description="Filter by category ID"),
    category_name: str | None = Query(None, description="Filter by category name"),
    search: str | None = Query(None, description="Search document name"),
    sort_by: str = Query("date_desc", description="Sort by: date_desc, date_asc, name_asc, name_desc, size_desc, size_asc"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[DocumentResponse]:
    # Security requirement: Strictly scope to authenticated user's documents
    query = select(Document).where(Document.owner_id == current_user.id)

    if category_id:
        query = query.where(Document.category_id == category_id)
    if category_name and category_name.strip().lower() != "all":
        query = query.join(Category).where(Category.name.ilike(category_name.strip()))
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.where(
            (Document.document_name.ilike(term))
            | (Document.original_filename.ilike(term))
            | (Document.description.ilike(term))
        )

    # Dynamic sorting
    if sort_by == "date_asc":
        query = query.order_by(Document.created_at.asc())
    elif sort_by == "name_asc":
        query = query.order_by(Document.document_name.asc())
    elif sort_by == "name_desc":
        query = query.order_by(Document.document_name.desc())
    elif sort_by == "size_desc":
        query = query.order_by(Document.file_size.desc())
    elif sort_by == "size_asc":
        query = query.order_by(Document.file_size.asc())
    else:  # default date_desc
        query = query.order_by(Document.created_at.desc())

    docs = db.scalars(query).all()

    return [serialize_document_response(d) for d in docs]


@router.get(
    "/{document_id}",
    response_model=DocumentResponse,
    summary="Get document details",
    description="Returns metadata of a document owned by the authenticated user.",
)
def get_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DocumentResponse:
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )

    # Security requirement: Strict authorization check. Reject unauthorized users.
    if doc.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You do not have permission to access this document.",
        )

    return serialize_document_response(doc)


@router.delete(
    "/{document_id}",
    response_model=MessageResponse,
    summary="Delete a personal document",
    description="Deletes the encrypted file from storage and removes metadata from the database.",
)
def delete_document(
    document_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )

    # Security requirement: Strict authorization check before deletion
    if doc.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You do not have permission to delete this document.",
        )

    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    # 1. Secure disk deletion: overwrites with random bytes before unlinking
    securely_delete_file(doc.file_path)

    # 2. Record audit log
    audit = AuditLog(
        user_id=current_user.id,
        document_id=doc.id,
        action=AuditAction.DOCUMENT_DELETED,
        result=AuditResult.SUCCESS,
        ip_address=client_ip,
        user_agent=user_agent,
    )
    db.add(audit)

    # 3. Delete database record
    db.delete(doc)
    db.commit()

    return MessageResponse(message="Document deleted successfully.")


@router.get(
    "/{document_id}/download",
    summary="Download decrypted personal document",
    description="Authenticates owner, decrypts the file in memory, and streams it for download.",
)
def download_document(
    document_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    # 1. Authentication is enforced by Depends(get_current_user)
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )

    # 2. Security requirement: Authorization check performed BEFORE any decryption
    # If the user is unauthorized, we immediately abort. The cryptographic key is never invoked.
    if doc.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You do not have permission to download this document.",
        )

    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    # 3. Decrypt ciphertext strictly in-memory (no plaintext file written to server disk)
    raw_content = decrypt_stored_document(doc.file_path)

    # 4. Record audit log for security accountability
    audit = AuditLog(
        user_id=current_user.id,
        document_id=doc.id,
        action=AuditAction.DOCUMENT_DOWNLOADED,
        result=AuditResult.SUCCESS,
        ip_address=client_ip,
        user_agent=user_agent,
    )
    db.add(audit)
    db.commit()

    # 5. Stream directly to HTTP response with no-cache headers to prevent proxy caching
    return Response(
        content=raw_content,
        media_type=doc.mime_type,
        headers={
            "Content-Disposition": f'attachment; filename="{doc.original_filename}"',
            "Cache-Control": "no-store, no-cache, must-revalidate, private",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get(
    "/{document_id}/view",
    summary="View decrypted personal document inline",
    description="Authenticates owner, decrypts in-memory, and returns inline for secure browser preview.",
)
def view_document(
    document_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    # 1. Authentication enforced by Depends(get_current_user)
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )

    # 2. Authorization check performed BEFORE decryption
    if doc.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You do not have permission to view this document.",
        )

    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    # 3. In-memory decryption only
    raw_content = decrypt_stored_document(doc.file_path)

    # 4. Record audit log
    audit = AuditLog(
        user_id=current_user.id,
        document_id=doc.id,
        action=AuditAction.DOCUMENT_VIEWED,
        result=AuditResult.SUCCESS,
        ip_address=client_ip,
        user_agent=user_agent,
    )
    db.add(audit)
    db.commit()

    # 5. Stream inline
    return Response(
        content=raw_content,
        media_type=doc.mime_type,
        headers={
            "Content-Disposition": f'inline; filename="{doc.original_filename}"',
            "Cache-Control": "no-store, no-cache, must-revalidate, private",
            "X-Content-Type-Options": "nosniff",
        },
    )

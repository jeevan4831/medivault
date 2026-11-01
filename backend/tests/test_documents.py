import io
import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.database import Base, get_db
from app.init_db import seed_categories
from app.main import app
from app.models.category import Category
from app.models.document import Document
from app.models.user import User
from app.security.jwt import create_access_token
from app.security.passwords import hash_password


@pytest.fixture()
def engine():
    eng = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture()
def session(engine):
    s = sessionmaker(bind=engine)()
    seed_categories(s)
    yield s
    s.close()


@pytest.fixture()
def client(session):
    def override():
        yield session

    app.dependency_overrides[get_db] = override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def users(session):
    user_a = User(
        full_name="User Alpha",
        email="user_a@example.com",
        password_hash=hash_password("Pass123!"),
    )
    user_b = User(
        full_name="User Beta",
        email="user_b@example.com",
        password_hash=hash_password("Pass123!"),
    )
    session.add_all([user_a, user_b])
    session.commit()
    return user_a, user_b


# Valid file byte fixtures
VALID_PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
VALID_PNG_BYTES = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
VALID_JPG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xdb"


def test_upload_document_success(client, session, users):
    user_a, _ = users
    token_a = create_access_token(subject=user_a.id)

    cat = session.query(Category).filter_by(name="Identity").first()

    response = client.post(
        "/api/documents/upload",
        headers={"Authorization": f"Bearer {token_a}"},
        data={
            "document_name": "My Passport",
            "category_id": cat.id,
            "description": "Scanned copy of international passport",
        },
        files={"file": ("passport.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["id"] is not None
    assert data["document_name"] == "My Passport"
    assert data["original_filename"] == "passport.pdf"
    assert data["mime_type"] == "application/pdf"
    assert data["category_name"] == "Identity"

    # Security check: Internal storage paths and server filenames MUST NOT be exposed
    assert "file_path" not in data
    assert "stored_filename" not in data
    assert "encryption_metadata" not in data

    # Verify database entity
    db_doc = session.query(Document).filter_by(id=data["id"]).first()
    assert db_doc is not None
    assert db_doc.owner_id == user_a.id
    # Server-side filename is random and NOT original filename
    assert db_doc.stored_filename != "passport.pdf"
    assert db_doc.stored_filename.endswith(".enc")

    # File on disk is NOT plaintext (is encrypted)
    with open(db_doc.file_path, "rb") as f:
        stored_bytes = f.read()
    assert stored_bytes != VALID_PDF_BYTES


def test_user_a_cannot_access_user_b_documents(client, session, users):
    """Explicit security requirement: User B must not access User A's documents."""
    user_a, user_b = users
    token_a = create_access_token(subject=user_a.id)
    token_b = create_access_token(subject=user_b.id)

    cat = session.query(Category).first()

    # User A uploads a document
    res_a = client.post(
        "/api/documents/upload",
        headers={"Authorization": f"Bearer {token_a}"},
        data={"document_name": "User A Sensitive Record", "category_id": cat.id},
        files={"file": ("doc_a.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")},
    )
    assert res_a.status_code == 201
    doc_a_id = res_a.json()["id"]

    # 1. User B attempts GET /api/documents/{id} -> 403 Forbidden
    res_b_get = client.get(
        f"/api/documents/{doc_a_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert res_b_get.status_code == 403
    assert "access denied" in res_b_get.json()["detail"].lower()

    # 2. User B attempts DELETE /api/documents/{id} -> 403 Forbidden
    res_b_delete = client.delete(
        f"/api/documents/{doc_a_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert res_b_delete.status_code == 403

    # 3. User B attempts DOWNLOAD /api/documents/{id}/download -> 403 Forbidden
    res_b_download = client.get(
        f"/api/documents/{doc_a_id}/download",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert res_b_download.status_code == 403

    # 4. User B lists documents -> User A's document does not appear
    res_b_list = client.get(
        "/api/documents",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert res_b_list.status_code == 200
    docs_for_b = res_b_list.json()
    assert len(docs_for_b) == 0


def test_upload_rejects_unsupported_extensions(client, session, users):
    user_a, _ = users
    token_a = create_access_token(subject=user_a.id)
    cat = session.query(Category).first()

    res = client.post(
        "/api/documents/upload",
        headers={"Authorization": f"Bearer {token_a}"},
        data={"document_name": "Malicious Script", "category_id": cat.id},
        files={"file": ("payload.exe", io.BytesIO(b"MZ\x90\x00binary"), "application/octet-stream")},
    )
    assert res.status_code == 400
    assert "unsupported file extension" in res.json()["detail"].lower()


def test_upload_rejects_mismatched_magic_bytes(client, session, users):
    user_a, _ = users
    token_a = create_access_token(subject=user_a.id)
    cat = session.query(Category).first()

    # Claiming to be PDF with .pdf extension, but content is plaintext
    res = client.post(
        "/api/documents/upload",
        headers={"Authorization": f"Bearer {token_a}"},
        data={"document_name": "Fake PDF", "category_id": cat.id},
        files={"file": ("fake.pdf", io.BytesIO(b"Hello world, I am plain text!"), "application/pdf")},
    )
    assert res.status_code == 400
    assert "signature" in res.json()["detail"].lower()


def test_upload_rejects_oversized_files(client, session, users):
    user_a, _ = users
    token_a = create_access_token(subject=user_a.id)
    cat = session.query(Category).first()

    # Create oversized content > 10MB
    oversized = io.BytesIO(b"%PDF-" + b"0" * (10 * 1024 * 1024 + 10))

    res = client.post(
        "/api/documents/upload",
        headers={"Authorization": f"Bearer {token_a}"},
        data={"document_name": "Huge File", "category_id": cat.id},
        files={"file": ("huge.pdf", oversized, "application/pdf")},
    )
    assert res.status_code == 413


def test_owner_can_download_and_delete_document(client, session, users):
    user_a, _ = users
    token_a = create_access_token(subject=user_a.id)
    cat = session.query(Category).first()

    # Upload
    res_upload = client.post(
        "/api/documents/upload",
        headers={"Authorization": f"Bearer {token_a}"},
        data={"document_name": "My Medical Scan", "category_id": cat.id},
        files={"file": ("scan.png", io.BytesIO(VALID_PNG_BYTES), "image/png")},
    )
    assert res_upload.status_code == 201
    doc_id = res_upload.json()["id"]

    # Download and verify decrypted content
    res_download = client.get(
        f"/api/documents/{doc_id}/download",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert res_download.status_code == 200
    assert res_download.content == VALID_PNG_BYTES

    # Delete
    res_delete = client.delete(
        f"/api/documents/{doc_id}",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert res_delete.status_code == 200

    # Verify deleted
    res_get_deleted = client.get(
        f"/api/documents/{doc_id}",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert res_get_deleted.status_code == 404


def test_document_metadata_and_details_fields(client, session, users):
    """Test that document responses include file_type, security_status, owner_name, and sharing_status."""
    user_a, _ = users
    token_a = create_access_token(subject=user_a.id)
    cat = session.query(Category).filter_by(name="Healthcare").first()

    res = client.post(
        "/api/documents/upload",
        headers={"Authorization": f"Bearer {token_a}"},
        data={
            "document_name": "Blood Test Report",
            "category_id": cat.id,
            "description": "Routine annual medical test report",
        },
        files={"file": ("lab_report.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")},
    )
    assert res.status_code == 201
    doc_id = res.json()["id"]

    # Fetch document details
    res_details = client.get(
        f"/api/documents/{doc_id}",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert res_details.status_code == 200
    details = res_details.json()

    assert details["document_name"] == "Blood Test Report"
    assert details["category_name"] == "Healthcare"
    assert details["file_type"] == "PDF"
    assert details["security_status"] == "AES-256-GCM Encrypted"
    assert details["owner_name"] == "User Alpha"
    assert details["sharing_status"] == "Private (0 Shares)"
    assert details["active_shares_count"] == 0
    assert details["description"] == "Routine annual medical test report"

    # Ensure no storage paths or internal filenames
    assert "file_path" not in details
    assert "stored_filename" not in details


def test_document_search_and_category_filter(client, session, users):
    """Test searching by name/description and filtering by category."""
    user_a, _ = users
    token_a = create_access_token(subject=user_a.id)

    cat_id = session.query(Category).filter_by(name="Identity").first()
    cat_health = session.query(Category).filter_by(name="Healthcare").first()

    # Upload Doc 1: Identity
    client.post(
        "/api/documents/upload",
        headers={"Authorization": f"Bearer {token_a}"},
        data={"document_name": "Driver License Card", "category_id": cat_id.id, "description": "State DL front and back"},
        files={"file": ("dl.png", io.BytesIO(VALID_PNG_BYTES), "image/png")},
    )

    # Upload Doc 2: Healthcare
    client.post(
        "/api/documents/upload",
        headers={"Authorization": f"Bearer {token_a}"},
        data={"document_name": "Vaccination Card", "category_id": cat_health.id, "description": "COVID and MMR immunization"},
        files={"file": ("vax.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")},
    )

    # Search for "Driver"
    res_search = client.get(
        "/api/documents?search=Driver",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert res_search.status_code == 200
    docs = res_search.json()
    assert len(docs) == 1
    assert docs[0]["document_name"] == "Driver License Card"

    # Search by description keyword "immunization"
    res_desc = client.get(
        "/api/documents?search=immunization",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert res_desc.status_code == 200
    assert len(res_desc.json()) == 1
    assert res_desc.json()[0]["document_name"] == "Vaccination Card"

    # Filter by category "Healthcare"
    res_cat = client.get(
        "/api/documents?category_name=Healthcare",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert res_cat.status_code == 200
    docs_health = res_cat.json()
    assert len(docs_health) == 1
    assert docs_health[0]["document_name"] == "Vaccination Card"


def test_document_sort_options(client, session, users):
    """Test sorting documents by name and date."""
    user_a, _ = users
    token_a = create_access_token(subject=user_a.id)
    cat = session.query(Category).first()

    # Upload Zebra doc
    client.post(
        "/api/documents/upload",
        headers={"Authorization": f"Bearer {token_a}"},
        data={"document_name": "Zebra Records", "category_id": cat.id},
        files={"file": ("zebra.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")},
    )

    # Upload Alpha doc
    client.post(
        "/api/documents/upload",
        headers={"Authorization": f"Bearer {token_a}"},
        data={"document_name": "Alpha Records", "category_id": cat.id},
        files={"file": ("alpha.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")},
    )

    # Sort name_asc
    res_asc = client.get(
        "/api/documents?sort_by=name_asc",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert res_asc.status_code == 200
    names_asc = [d["document_name"] for d in res_asc.json()]
    assert names_asc == ["Alpha Records", "Zebra Records"]

    # Sort name_desc
    res_desc = client.get(
        "/api/documents?sort_by=name_desc",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert res_desc.status_code == 200
    names_desc = [d["document_name"] for d in res_desc.json()]
    assert names_desc == ["Zebra Records", "Alpha Records"]


def test_document_inline_view_decrypted(client, session, users):
    """Test GET /api/documents/{id}/view streams decrypted file inline with no cache."""
    user_a, user_b = users
    token_a = create_access_token(subject=user_a.id)
    token_b = create_access_token(subject=user_b.id)
    cat = session.query(Category).first()

    res_up = client.post(
        "/api/documents/upload",
        headers={"Authorization": f"Bearer {token_a}"},
        data={"document_name": "Preview Test PDF", "category_id": cat.id},
        files={"file": ("view_me.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")},
    )
    assert res_up.status_code == 201
    doc_id = res_up.json()["id"]

    # Owner views file
    res_view = client.get(
        f"/api/documents/{doc_id}/view",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert res_view.status_code == 200
    assert res_view.content == VALID_PDF_BYTES
    assert res_view.headers["content-type"] == "application/pdf"
    assert "inline" in res_view.headers["content-disposition"]
    assert "no-store" in res_view.headers.get("cache-control", "")

    # Non-owner attempts to view -> 403 Forbidden
    res_b_view = client.get(
        f"/api/documents/{doc_id}/view",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert res_b_view.status_code == 403


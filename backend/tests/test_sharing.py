from datetime import timedelta
import hashlib
import io
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.database import Base, get_db
from app.init_db import seed_categories
from app.main import app
from app.models.access_token import AccessToken
from app.models.audit_log import AuditLog
from app.models.category import Category
from app.models.document import Document
from app.models.enums import AuditAction, AuditResult, PermissionStatus, PermissionType
from app.models.permission import Permission
from app.models.user import User
from app.security.jwt import create_access_token
from app.security.passwords import hash_password
from app.services.storage_service import securely_store_file
from app.utils.time import utc_now


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
def test_user(session):
    user = User(
        full_name="Dr. Jane Doe",
        email="jane.doe@example.com",
        password_hash=hash_password("Secret123!"),
    )
    session.add(user)
    session.commit()
    return user


@pytest.fixture()
def other_user(session):
    user = User(
        full_name="John Smith",
        email="john.smith@example.com",
        password_hash=hash_password("Secret123!"),
    )
    session.add(user)
    session.commit()
    return user


@pytest.fixture()
def user_document(session, test_user):
    cat = session.query(Category).first()
    raw_content = b"%PDF-1.4 test document content for sharing"
    stored_name, path, meta = securely_store_file(raw_content, "medical_report.pdf")

    doc = Document(
        owner_id=test_user.id,
        category_id=cat.id,
        document_name="Blood Work Report",
        original_filename="medical_report.pdf",
        stored_filename=stored_name,
        file_path=path,
        mime_type="application/pdf",
        file_size=len(raw_content),
        encryption_metadata=meta,
    )
    session.add(doc)
    session.commit()
    return doc


def test_create_share_success(client, session, test_user, user_document):
    token = create_access_token(subject=test_user.id)

    res = client.post(
        "/api/shares",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "document_id": user_document.id,
            "recipient_identifier": "City Diagnostic Lab",
            "permission_type": "VIEW_ONLY",
            "expiry_hours": 24,
        },
    )

    assert res.status_code == 200
    data = res.json()

    assert data["document_id"] == user_document.id
    assert data["recipient_identifier"] == "City Diagnostic Lab"
    assert data["permission_type"] == "VIEW_ONLY"
    assert data["can_view"] is True
    assert data["can_download"] is False
    assert data["status"] == "ACTIVE"
    assert "raw_token" in data
    assert data["access_path"] == f"/shared-access/{data['raw_token']}"

    # Verify raw token is NOT stored in DB, but its SHA-256 hash is
    raw_token = data["raw_token"]
    expected_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    token_row = session.query(AccessToken).filter_by(token_hash=expected_hash).first()
    assert token_row is not None
    assert token_row.revoked is False
    assert token_row.expires_at > utc_now()

    # Verify audit log was recorded
    audit = (
        session.query(AuditLog)
        .filter_by(
            action=AuditAction.SHARE_CREATED,
            document_id=user_document.id,
            result=AuditResult.SUCCESS,
        )
        .first()
    )
    assert audit is not None


def test_create_share_view_and_download(client, test_user, user_document):
    token = create_access_token(subject=test_user.id)

    res = client.post(
        "/api/shares",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "document_id": user_document.id,
            "recipient_identifier": "Dr. Specialist",
            "permission_type": "VIEW_AND_DOWNLOAD",
            "expiry_hours": 48,
        },
    )

    assert res.status_code == 200
    data = res.json()
    assert data["can_download"] is True
    assert data["permission_type"] == "VIEW_AND_DOWNLOAD"


def test_create_share_forbidden_for_non_owner(client, other_user, user_document):
    token = create_access_token(subject=other_user.id)

    res = client.post(
        "/api/shares",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "document_id": user_document.id,
            "recipient_identifier": "Intruder",
            "permission_type": "VIEW_ONLY",
            "expiry_hours": 24,
        },
    )

    assert res.status_code == 403
    assert "You can only share documents you own" in res.json()["detail"]


def test_public_shared_access_workflow(client, session, test_user, user_document):
    # 1. Create a share
    token = create_access_token(subject=test_user.id)
    share_res = client.post(
        "/api/shares",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "document_id": user_document.id,
            "recipient_identifier": "Cardiology Clinic",
            "permission_type": "VIEW_ONLY",
            "expiry_hours": 12,
        },
    )
    assert share_res.status_code == 200
    raw_token = share_res.json()["raw_token"]

    # 2. Public recipient fetches metadata (No Auth required)
    info_res = client.get(f"/api/shared-access/{raw_token}")
    assert info_res.status_code == 200
    info_data = info_res.json()
    assert info_data["document_name"] == "Blood Work Report"
    assert info_data["recipient_identifier"] == "Cardiology Clinic"
    assert info_data["can_view"] is True
    assert info_data["can_download"] is False
    assert "The QR code provides temporary access" in info_data["security_notice"]

    # 3. Public recipient views decrypted document inline
    view_res = client.get(f"/api/shared-access/{raw_token}/view")
    assert view_res.status_code == 200
    assert view_res.content == b"%PDF-1.4 test document content for sharing"
    assert "no-store" in view_res.headers.get("Cache-Control", "")

    # 4. Public recipient tries download on VIEW_ONLY share -> 403 Forbidden
    download_res = client.get(f"/api/shared-access/{raw_token}/download")
    assert download_res.status_code == 403
    assert "Download permission is not enabled" in download_res.json()["detail"]


def test_public_shared_access_download_allowed(client, test_user, user_document):
    token = create_access_token(subject=test_user.id)
    share_res = client.post(
        "/api/shares",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "document_id": user_document.id,
            "recipient_identifier": "Authorized Downloader",
            "permission_type": "VIEW_AND_DOWNLOAD",
            "expiry_hours": 6,
        },
    )
    raw_token = share_res.json()["raw_token"]

    download_res = client.get(f"/api/shared-access/{raw_token}/download")
    assert download_res.status_code == 200
    assert download_res.content == b"%PDF-1.4 test document content for sharing"
    assert 'filename="medical_report.pdf"' in download_res.headers.get("Content-Disposition", "")


def test_revocation_invalidates_token(client, session, test_user, user_document):
    # 1. Create share
    token = create_access_token(subject=test_user.id)
    share_res = client.post(
        "/api/shares",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "document_id": user_document.id,
            "recipient_identifier": "Temporary Auditor",
            "permission_type": "VIEW_ONLY",
            "expiry_hours": 24,
        },
    )
    perm_id = share_res.json()["permission_id"]
    raw_token = share_res.json()["raw_token"]

    # Check access works before revocation
    assert client.get(f"/api/shared-access/{raw_token}").status_code == 200

    # 2. Owner revokes share
    revoke_res = client.post(
        f"/api/shares/{perm_id}/revoke",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert revoke_res.status_code == 200
    assert revoke_res.json()["status"] == "REVOKED"

    # 3. Access must now fail with 410 GONE
    info_res = client.get(f"/api/shared-access/{raw_token}")
    assert info_res.status_code == 410
    assert "revoked" in info_res.json()["detail"].lower()

    view_res = client.get(f"/api/shared-access/{raw_token}/view")
    assert view_res.status_code == 410


def test_expired_token_rejected(client, session, test_user, user_document):
    # Create an expired permission
    now = utc_now()
    past = now - timedelta(hours=2)

    perm = Permission(
        document_id=user_document.id,
        owner_id=test_user.id,
        recipient_identifier="Past Recipient",
        permission_type=PermissionType.VIEW_ONLY,
        can_view=True,
        can_download=False,
        created_at=past - timedelta(hours=24),
        expires_at=past,
        status=PermissionStatus.ACTIVE,
    )
    session.add(perm)
    session.flush()

    raw_token = "expired_raw_token_xyz_12345678"
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    acc_tok = AccessToken(
        permission_id=perm.id,
        token_hash=token_hash,
        created_at=past - timedelta(hours=24),
        expires_at=past,
        revoked=False,
    )
    session.add(acc_tok)
    session.commit()

    # Attempting to access expired token must return 410 GONE
    res = client.get(f"/api/shared-access/{raw_token}")
    assert res.status_code == 410
    assert "expired" in res.json()["detail"].lower()


def test_invalid_bogus_token(client, session):
    res = client.get("/api/shared-access/bogus-random-token-does-not-exist")
    assert res.status_code == 404
    # Check audit log recorded failed attempt
    audit = (
        session.query(AuditLog)
        .filter_by(action=AuditAction.SHARE_ACCESS_DENIED, result=AuditResult.DENIED)
        .first()
    )
    assert audit is not None


def test_recipient_verification_workflow(client, session, test_user, user_document):
    token = create_access_token(subject=test_user.id)
    share_res = client.post(
        "/api/shares",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "document_id": user_document.id,
            "recipient_identifier": "Dr. Sarah Jenkins",
            "permission_type": "VIEW_ONLY",
            "expiry_hours": 12,
        },
    )
    raw_token = share_res.json()["raw_token"]

    # 1. Matching recipient identifier verification succeeds
    verify_res = client.post(
        f"/api/shared-access/{raw_token}/verify",
        json={"recipient_identifier": "Sarah Jenkins"},
    )
    assert verify_res.status_code == 200
    assert verify_res.json()["verified"] is True
    assert verify_res.json()["recipient_identifier"] == "Dr. Sarah Jenkins"

    # Check verified audit log
    audit_success = (
        session.query(AuditLog)
        .filter_by(
            action=AuditAction.SHARE_ACCESSED,
            result=AuditResult.SUCCESS,
            document_id=user_document.id,
        )
        .first()
    )
    assert audit_success is not None

    # 2. Mismatched recipient identifier verification fails with 403 Forbidden
    mismatch_res = client.post(
        f"/api/shared-access/{raw_token}/verify",
        json={"recipient_identifier": "Unknown Intruder"},
    )
    assert mismatch_res.status_code == 403
    assert "verification failed" in mismatch_res.json()["detail"].lower()

    # Check denied audit log
    audit_denied = (
        session.query(AuditLog)
        .filter_by(
            action=AuditAction.SHARE_ACCESS_DENIED,
            result=AuditResult.DENIED,
            document_id=user_document.id,
        )
        .first()
    )
    assert audit_denied is not None


def test_non_active_permission_returns_403(client, session, test_user, user_document):
    now = utc_now()
    perm = Permission(
        document_id=user_document.id,
        owner_id=test_user.id,
        recipient_identifier="Inactive Recipient",
        permission_type=PermissionType.VIEW_ONLY,
        can_view=True,
        can_download=False,
        created_at=now,
        expires_at=now + timedelta(hours=24),
        status=PermissionStatus.REVOKED,  # non-active
    )
    session.add(perm)
    session.flush()

    raw_token = "inactive_raw_token_9876543210"
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    acc_tok = AccessToken(
        permission_id=perm.id,
        token_hash=token_hash,
        created_at=now,
        expires_at=now + timedelta(hours=24),
        revoked=True,
    )
    session.add(acc_tok)
    session.commit()

    res = client.get(f"/api/shared-access/{raw_token}")
    assert res.status_code == 410


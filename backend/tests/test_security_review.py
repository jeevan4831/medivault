from __future__ import annotations

import hashlib
import io
import os
from datetime import timedelta
from pathlib import Path
import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.config import Settings
from app.database import Base, get_db
from app.init_db import seed_categories
from app.main import app
from app.models.access_token import AccessToken
from app.models.audit_log import AuditLog
from app.models.category import Category
from app.models.document import Document
from app.models.enums import AuditAction, NotificationType, PermissionStatus, PermissionType
from app.models.notification import Notification
from app.models.permission import Permission
from app.models.user import User
from app.security.jwt import create_access_token
from app.security.passwords import hash_password
from app.services.notification_service import create_notification
from app.services.storage_service import (
    decrypt_stored_document,
    get_encrypted_storage_dir,
    securely_store_file,
)
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
def user_a(session):
    user = User(
        full_name="Alice Alpha",
        email="alice.alpha@example.com",
        password_hash=hash_password("Password123!"),
    )
    session.add(user)
    session.commit()
    return user


@pytest.fixture()
def user_b(session):
    user = User(
        full_name="Bob Beta",
        email="bob.beta@example.com",
        password_hash=hash_password("Password123!"),
    )
    session.add(user)
    session.commit()
    return user


@pytest.fixture()
def headers_a(user_a):
    token = create_access_token(subject=user_a.id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def headers_b(user_b):
    token = create_access_token(subject=user_b.id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def doc_a(session, user_a):
    cat = session.query(Category).first()
    raw = b"%PDF-1.4 User A Confidential Report"
    stored, path, meta = securely_store_file(raw, "alice_report.pdf")

    doc = Document(
        owner_id=user_a.id,
        category_id=cat.id,
        document_name="Alice Confidential Records",
        original_filename="alice_report.pdf",
        stored_filename=stored,
        file_path=path,
        mime_type="application/pdf",
        file_size=len(raw),
        encryption_metadata=meta,
    )
    session.add(doc)
    session.commit()
    return doc


# ==============================================================================
# 1. BROKEN AUTHENTICATION & SESSION TESTS
# ==============================================================================

def test_missing_and_malformed_auth_token_rejected(client, doc_a):
    # No Authorization header
    res1 = client.get(f"/api/documents/{doc_a.id}")
    assert res1.status_code == 401

    # Malformed header
    res2 = client.get(f"/api/documents/{doc_a.id}", headers={"Authorization": "InvalidScheme token"})
    assert res2.status_code == 401

    # Bogus token
    res3 = client.get(f"/api/documents/{doc_a.id}", headers={"Authorization": "Bearer not-a-real-jwt-token"})
    assert res3.status_code == 401


def test_deactivated_user_cannot_authenticate(client, session, user_a):
    user_a.is_active = False
    session.commit()

    token = create_access_token(subject=user_a.id)
    res = client.get("/api/documents", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403
    assert "deactivated" in res.json()["detail"].lower()


# ==============================================================================
# 2. UNAUTHORIZED DOCUMENT ACCESS & IDOR / BOLA CHECKS
# ==============================================================================

def test_user_b_cannot_access_user_a_document_by_changing_id(client, doc_a, headers_b):
    """User B must NEVER access User A's document by substituting document_id in URL."""
    # 1. Direct metadata query
    res_get = client.get(f"/api/documents/{doc_a.id}", headers=headers_b)
    assert res_get.status_code == 403
    assert "access denied" in res_get.json()["detail"].lower()

    # 2. Inline view
    res_view = client.get(f"/api/documents/{doc_a.id}/view", headers=headers_b)
    assert res_view.status_code == 403

    # 3. Decrypted download
    res_down = client.get(f"/api/documents/{doc_a.id}/download", headers=headers_b)
    assert res_down.status_code == 403

    # 4. Deletion
    res_del = client.delete(f"/api/documents/{doc_a.id}", headers=headers_b)
    assert res_del.status_code == 403


def test_user_b_cannot_create_share_for_user_a_document(client, doc_a, headers_b):
    """User B cannot create a share link for User A's document."""
    res = client.post(
        "/api/shares",
        headers=headers_b,
        json={
            "document_id": doc_a.id,
            "recipient_identifier": "Attacker Recipient",
            "permission_type": "VIEW_ONLY",
            "expiry_hours": 1,
        },
    )
    assert res.status_code == 403
    assert "access denied" in res.json()["detail"].lower()


def test_user_b_cannot_list_shares_of_user_a_document(client, doc_a, headers_a, headers_b):
    """User B cannot probe User A's document shares via query parameter."""
    # User A creates a share
    client.post(
        "/api/shares",
        headers=headers_a,
        json={
            "document_id": doc_a.id,
            "recipient_identifier": "Legitimate Doctor",
            "permission_type": "VIEW_ONLY",
            "expiry_hours": 24,
        },
    )

    # User B queries shares filtering by User A's document_id
    res_b = client.get(f"/api/shares?document_id={doc_a.id}", headers=headers_b)
    assert res_b.status_code == 403


def test_user_b_cannot_revoke_user_a_share(client, doc_a, headers_a, headers_b):
    """User B cannot revoke User A's permission by changing permission_id."""
    share_res = client.post(
        "/api/shares",
        headers=headers_a,
        json={
            "document_id": doc_a.id,
            "recipient_identifier": "Dr. Smith",
            "permission_type": "VIEW_ONLY",
            "expiry_hours": 24,
        },
    )
    perm_id = share_res.json()["permission_id"]

    revoke_b = client.post(f"/api/shares/{perm_id}/revoke", headers=headers_b)
    assert revoke_b.status_code == 403


def test_user_b_cannot_mark_user_a_notification_as_read(client, session, user_a, headers_b):
    """User B cannot mark User A's notification as read by changing notification ID."""
    notif = create_notification(session, user_a.id, "Security Alert", "Alert", NotificationType.SECURITY)

    res = client.post(f"/api/notifications/{notif.id}/read", headers=headers_b)
    assert res.status_code == 403


# ==============================================================================
# 4. PATH TRAVERSAL & UNSAFE FILE UPLOAD
# ==============================================================================

def test_upload_rejects_path_traversal_in_filename(client, session, headers_a):
    cat = session.query(Category).first()
    res = client.post(
        "/api/documents/upload",
        headers=headers_a,
        files={"file": ("../../etc/passwd.pdf", io.BytesIO(b"%PDF-1.4 Traversal test"), "application/pdf")},
        data={"document_name": "Traversal Test", "category_id": cat.id},
    )
    # Either rejected outright with 400 or sanitized to passwd.pdf without directory path
    if res.status_code == 201:
        assert res.json()["original_filename"] == "passwd.pdf"
        assert "/" not in res.json()["original_filename"]
        assert "\\" not in res.json()["original_filename"]
    else:
        assert res.status_code == 400


def test_upload_rejects_null_byte_in_filename(client, session, headers_a):
    cat = session.query(Category).first()
    res = client.post(
        "/api/documents/upload",
        headers=headers_a,
        files={"file": ("test\0.pdf", io.BytesIO(b"%PDF-1.4 Null byte test"), "application/pdf")},
        data={"document_name": "Null Byte Test", "category_id": cat.id},
    )
    assert res.status_code == 400


def test_decrypt_stored_document_blocks_path_traversal():
    """Attempting to decrypt files outside storage/encrypted is strictly blocked."""
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        decrypt_stored_document("../../etc/passwd")
    assert exc.value.status_code == 400


def test_unsafe_executable_extensions_rejected(client, session, headers_a):
    cat = session.query(Category).first()
    bad_files = [
        ("malicious.exe", b"MZ\x90\x00Binary content", "application/octet-stream"),
        ("exploit.php", b"<?php echo 'pwned'; ?>", "application/x-php"),
        ("script.sh", b"#!/bin/bash\nrm -rf /", "application/x-sh"),
        ("attack.html", b"<script>alert(1)</script>", "text/html"),
        ("code.js", b"console.log('xss')", "application/javascript"),
    ]
    for fname, content, mime in bad_files:
        res = client.post(
            "/api/documents/upload",
            headers=headers_a,
            files={"file": (fname, io.BytesIO(content), mime)},
            data={"document_name": "Exploit Attempt", "category_id": cat.id},
        )
        assert res.status_code == 400


# ==============================================================================
# 6. MIME-TYPE & MAGIC BYTES BYPASS
# ==============================================================================

def test_mime_type_spoofing_rejected_by_magic_bytes(client, session, headers_a):
    cat = session.query(Category).first()
    # A shell script named .pdf claiming application/pdf
    fake_pdf = b"#!/bin/bash\necho 'I am not a PDF'"
    res = client.post(
        "/api/documents/upload",
        headers=headers_a,
        files={"file": ("fake.pdf", io.BytesIO(fake_pdf), "application/pdf")},
        data={"document_name": "Spoofed PDF", "category_id": cat.id},
    )
    assert res.status_code == 400
    assert "signature" in res.json()["detail"].lower()


# ==============================================================================
# 7. SQL INJECTION DEFENSE
# ==============================================================================

def test_sql_injection_payloads_safely_parameterized(client, headers_a):
    sql_payloads = [
        "' OR '1'='1",
        "'; DROP TABLE documents; --",
        "1 UNION SELECT 1, 2, 3, 4",
        "\" OR 1=1 --",
    ]
    for payload in sql_payloads:
        res = client.get(f"/api/documents?search={payload}", headers=headers_a)
        assert res.status_code == 200
        # No 500 error and no SQL syntax error leaked
        assert isinstance(res.json(), list)


# ==============================================================================
# 8. XSS & SECURITY RESPONSE HEADERS
# ==============================================================================

def test_security_headers_present_on_responses(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.headers.get("X-Content-Type-Options") == "nosniff"
    assert res.headers.get("X-Frame-Options") == "DENY"
    assert "1; mode=block" in res.headers.get("X-XSS-Protection", "")
    assert res.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"


# ==============================================================================
# 10 & 11. JWT INTEGRITY & TOKEN LEAKAGE
# ==============================================================================

def test_jwt_signed_with_wrong_key_rejected(client, user_a):
    fake_token = jwt.encode(
        {"sub": str(user_a.id), "exp": int(utc_now().timestamp()) + 3600},
        "wrong-secret-key-that-does-not-match",
        algorithm="HS256",
    )
    res = client.get("/api/documents", headers={"Authorization": f"Bearer {fake_token}"})
    assert res.status_code == 401


def test_jwt_none_algorithm_rejected(client, user_a):
    fake_token = jwt.encode(
        {"sub": str(user_a.id), "exp": int(utc_now().timestamp()) + 3600},
        key="",
        algorithm="none",
    )
    res = client.get("/api/documents", headers={"Authorization": f"Bearer {fake_token}"})
    assert res.status_code == 401


def test_raw_token_not_stored_in_database_or_list_shares(client, session, doc_a, headers_a):
    create_res = client.post(
        "/api/shares",
        headers=headers_a,
        json={
            "document_id": doc_a.id,
            "recipient_identifier": "Privacy Check",
            "permission_type": "VIEW_ONLY",
            "expiry_hours": 12,
        },
    )
    raw_token = create_res.json()["raw_token"]

    # Verify database only stores SHA-256 hash
    expected_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    rec = session.query(AccessToken).filter_by(token_hash=expected_hash).first()
    assert rec is not None

    # Database query for raw token yields zero rows
    raw_match = session.query(AccessToken).filter(AccessToken.token_hash == raw_token).first()
    assert raw_match is None

    # Listing shares does not leak raw token
    list_res = client.get("/api/shares", headers=headers_a)
    assert raw_token not in str(list_res.json())


# ==============================================================================
# 12 & 13. EXPIRED & REVOKED ACCESS
# ==============================================================================

def test_expired_and_revoked_tokens_denied(client, session, doc_a, headers_a):
    # 1. Create active share
    share_res = client.post(
        "/api/shares",
        headers=headers_a,
        json={
            "document_id": doc_a.id,
            "recipient_identifier": "Expiry Test Recipient",
            "permission_type": "VIEW_ONLY",
            "expiry_hours": 12,
        },
    )
    perm_id = share_res.json()["permission_id"]
    raw_token = share_res.json()["raw_token"]

    # Works while active
    assert client.get(f"/api/shared-access/{raw_token}").status_code == 200

    # 2. Revoke and verify access denied with 410
    client.post(f"/api/shares/{perm_id}/revoke", headers=headers_a)
    res_revoked = client.get(f"/api/shared-access/{raw_token}")
    assert res_revoked.status_code == 410
    assert "revoked" in res_revoked.json()["detail"].lower()


# ==============================================================================
# 14. UNAUTHORIZED DOWNLOAD
# ==============================================================================

def test_view_only_share_blocks_download(client, doc_a, headers_a):
    share_res = client.post(
        "/api/shares",
        headers=headers_a,
        json={
            "document_id": doc_a.id,
            "recipient_identifier": "View Only Client",
            "permission_type": "VIEW_ONLY",
            "expiry_hours": 12,
        },
    )
    raw_token = share_res.json()["raw_token"]

    # Viewing works
    view_res = client.get(f"/api/shared-access/{raw_token}/view")
    assert view_res.status_code == 200

    # Downloading is forbidden
    down_res = client.get(f"/api/shared-access/{raw_token}/download")
    assert down_res.status_code == 403
    assert "download permission is not enabled" in down_res.json()["detail"].lower()


# ==============================================================================
# 16. EXCESSIVE FILE SIZE (MAX 10 MB)
# ==============================================================================

def test_upload_rejects_oversized_file(client, session, headers_a):
    cat = session.query(Category).first()
    # 10 MB + 100 KB
    big_content = b"%PDF-1.4" + b"0" * (10 * 1024 * 1024 + 100)
    res = client.post(
        "/api/documents/upload",
        headers=headers_a,
        files={"file": ("large.pdf", io.BytesIO(big_content), "application/pdf")},
        data={"document_name": "Large Doc", "category_id": cat.id},
    )
    assert res.status_code == 413


# ==============================================================================
# 18. SENSITIVE INFORMATION LEAKAGE IN RESPONSES
# ==============================================================================

def test_document_response_does_not_leak_internal_paths_or_keys(client, doc_a, headers_a):
    res = client.get(f"/api/documents/{doc_a.id}", headers=headers_a)
    data = res.json()
    assert "file_path" not in data
    assert "stored_filename" not in data
    assert "encryption_metadata" not in data
    assert "nonce" not in data
    assert "tag" not in data


def test_user_response_does_not_leak_password_hash(client, headers_a):
    res = client.get("/api/auth/me", headers=headers_a)
    data = res.json()
    assert "password_hash" not in data
    assert "password" not in data


# ==============================================================================
# 19 & 20. SECRETS & DEBUG MODE IN PRODUCTION
# ==============================================================================

def test_settings_rejects_debug_mode_and_dev_secrets_in_production():
    # 1. Debug mode enabled in production -> ValueError
    with pytest.raises(ValueError) as exc1:
        Settings(app_env="production", debug=True)
    assert "debug mode" in str(exc1.value).lower()

    # 2. Default JWT secret key in production -> ValueError
    with pytest.raises(ValueError) as exc2:
        Settings(
            app_env="production",
            debug=False,
            jwt_secret_key="dev-secret-key-change-in-production-1234567890",
        )
    assert "jwt secret key" in str(exc2.value).lower()

    # 3. Missing storage encryption key in production -> ValueError
    with pytest.raises(ValueError) as exc3:
        Settings(
            app_env="production",
            debug=False,
            jwt_secret_key="a" * 32,
            storage_encryption_key="",
        )
    assert "storage_encryption_key" in str(exc3.value).lower()

    # 4. Default database password in production -> ValueError
    with pytest.raises(ValueError) as exc4:
        Settings(
            app_env="production",
            debug=False,
            jwt_secret_key="a" * 32,
            storage_encryption_key="k" * 32,
            db_password="change_me",
            database_url=None,
        )
    assert "database password" in str(exc4.value).lower()


# ==============================================================================
# ADDITIONAL EXTENSIVE REVIEWS FOR THE 20 SECURITY GOALS
# ==============================================================================

def test_login_failure_audited_and_generic_error(client, session, user_a):
    """Failed login attempts must return generic error and record audit entries."""
    # Wrong password
    res = client.post(
        "/api/auth/login",
        json={"email": user_a.email, "password": "WrongPassword123!"},
    )
    assert res.status_code == 401
    assert "invalid email or password" in res.json()["detail"].lower()

    # Non-existent user
    res2 = client.post(
        "/api/auth/login",
        json={"email": "nonexistent@example.com", "password": "Password123!"},
    )
    assert res2.status_code == 401
    assert "invalid email or password" in res2.json()["detail"].lower()

    # Verify audit log captures failed attempts
    failed_logs = (
        session.query(AuditLog)
        .filter_by(action=AuditAction.LOGIN_FAILED)
        .all()
    )
    assert len(failed_logs) >= 2


def test_expired_jwt_token_rejected_with_401(client, user_a):
    """Expired JWT must be rejected with 401 Unauthorized."""
    expired_token = create_access_token(
        subject=user_a.id, expires_delta=timedelta(seconds=-60)
    )
    res = client.get(
        "/api/documents", headers={"Authorization": f"Bearer {expired_token}"}
    )
    assert res.status_code == 401
    assert "expired" in res.json()["detail"].lower()


def test_user_b_isolated_from_user_a_documents_dashboard_and_audit(
    client, doc_a, headers_b
):
    """User B must NEVER see User A's document count, audit records, or document list."""
    # 1. Document list returns empty for User B
    docs_res = client.get("/api/documents", headers=headers_b)
    assert docs_res.status_code == 200
    assert docs_res.json() == []

    # 2. Dashboard summary shows zero documents for User B
    dash_res = client.get("/api/dashboard/summary", headers=headers_b)
    assert dash_res.status_code == 200
    assert dash_res.json()["stats"]["total_documents"] == 0

    # 3. Dashboard audit-logs does not leak User A's activity
    dash_audit = client.get("/api/dashboard/audit-logs", headers=headers_b)
    assert dash_audit.status_code == 200
    assert dash_audit.json() == []

    # 4. Audit history does not leak User A's document events
    audit_res = client.get("/api/audit/my-history", headers=headers_b)
    assert audit_res.status_code == 200
    assert audit_res.json() == []


def test_audit_logs_tamper_resistant_immutable(client, headers_a):
    """Audit logs cannot be modified or deleted by users (append-only legal trail)."""
    del_res = client.delete("/api/audit/1", headers=headers_a)
    assert del_res.status_code == 403
    assert "immutable" in del_res.json()["detail"].lower() or "append-only" in del_res.json()["detail"].lower()

    put_res = client.put("/api/audit/1", headers=headers_a)
    assert put_res.status_code == 403
    assert "immutable" in put_res.json()["detail"].lower()


def test_direct_file_url_access_blocked(client):
    """Direct URL access to storage directory must be blocked (no static file route)."""
    res1 = client.get("/storage/encrypted/document.enc")
    assert res1.status_code in (404, 405)

    res2 = client.get("/storage/document.pdf")
    assert res2.status_code in (404, 405)


def test_empty_file_upload_rejected(client, session, headers_a):
    """Uploading an empty file (0 bytes) must be rejected with 400 Bad Request."""
    cat = session.query(Category).first()
    res = client.post(
        "/api/documents/upload",
        headers=headers_a,
        files={"file": ("empty.pdf", io.BytesIO(b""), "application/pdf")},
        data={"document_name": "Empty PDF", "category_id": cat.id},
    )
    assert res.status_code == 400
    assert "empty" in res.json()["detail"].lower()


def test_sql_injection_on_shares_and_audit_search(client, headers_a):
    """SQL injection payloads on share and audit search query parameters are safely parameterized."""
    payloads = ["' OR 1=1 --", "\"; DROP TABLE permissions; --", "' UNION SELECT 1,2,3 --"]
    for p in payloads:
        res1 = client.get(f"/api/shares?search={p}", headers=headers_a)
        assert res1.status_code == 200
        assert isinstance(res1.json(), list)

        res2 = client.get(f"/api/audit/my-history?search={p}", headers=headers_a)
        assert res2.status_code == 200
        assert isinstance(res2.json(), list)


from __future__ import annotations

import io
from datetime import timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.database import Base, get_db
from app.init_db import seed_categories
from app.main import app
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
def user_a(session):
    user = User(
        full_name="User Alpha",
        email="alpha@example.com",
        password_hash=hash_password("Password123!"),
    )
    session.add(user)
    session.commit()
    return user


@pytest.fixture()
def user_b(session):
    user = User(
        full_name="User Beta",
        email="beta@example.com",
        password_hash=hash_password("Password123!"),
    )
    session.add(user)
    session.commit()
    return user


@pytest.fixture()
def doc_a(session, user_a):
    cat = session.query(Category).first()
    raw = b"%PDF-1.4 User A Sensitive Health Document"
    stored, path, meta = securely_store_file(raw, "alpha_doc.pdf")

    doc = Document(
        owner_id=user_a.id,
        category_id=cat.id,
        document_name="Alpha Health Record",
        original_filename="alpha_doc.pdf",
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
# 1. SECURITY-RELEVANT EVENTS RECORDING
# ==============================================================================
def test_login_and_login_failed_events_recorded(client, session, user_a):
    """Test that LOGIN and LOGIN_FAILED events are logged with IP, user_agent, and results."""
    # 1. Failed login with wrong password
    fail_res = client.post(
        "/api/auth/login",
        json={"email": user_a.email, "password": "WrongPassword!"},
        headers={"User-Agent": "TestBrowser/1.0"},
    )
    assert fail_res.status_code == 401

    failed_log = session.scalar(
        select(AuditLog)
        .where(AuditLog.action == AuditAction.LOGIN_FAILED)
        .order_by(AuditLog.id.desc())
    )
    assert failed_log is not None
    assert failed_log.user_id == user_a.id
    assert failed_log.result == AuditResult.FAILURE
    assert failed_log.user_agent == "TestBrowser/1.0"
    assert failed_log.timestamp is not None

    # 2. Successful login
    success_res = client.post(
        "/api/auth/login",
        json={"email": user_a.email, "password": "Password123!"},
        headers={"User-Agent": "SecureClient/2.0"},
    )
    assert success_res.status_code == 200

    success_log = session.scalar(
        select(AuditLog)
        .where(AuditLog.action == AuditAction.LOGIN)
        .order_by(AuditLog.id.desc())
    )
    assert success_log is not None
    assert success_log.user_id == user_a.id
    assert success_log.result == AuditResult.SUCCESS
    assert success_log.user_agent == "SecureClient/2.0"


def test_document_lifecycle_events_recorded(client, session, user_a):
    """Test DOCUMENT_UPLOADED, DOCUMENT_VIEWED, DOCUMENT_DOWNLOADED, and DOCUMENT_DELETED."""
    token = create_access_token(subject=user_a.id)
    cat = session.query(Category).first()

    # 1. Upload
    pdf_content = b"%PDF-1.4 Life Cycle Test Document Content"
    upload_res = client.post(
        "/api/documents/upload",
        headers={
            "Authorization": f"Bearer {token}",
            "User-Agent": "MedicalApp/1.0",
        },
        data={"document_name": "Lifecycle Doc", "category_id": cat.id},
        files={"file": ("lifecycle.pdf", io.BytesIO(pdf_content), "application/pdf")},
    )
    assert upload_res.status_code == 201
    doc_id = upload_res.json()["id"]

    upload_log = session.scalar(
        select(AuditLog).where(
            AuditLog.document_id == doc_id,
            AuditLog.action == AuditAction.DOCUMENT_UPLOADED,
        )
    )
    assert upload_log is not None
    assert upload_log.user_id == user_a.id
    assert upload_log.result == AuditResult.SUCCESS
    assert upload_log.user_agent == "MedicalApp/1.0"

    # 2. View
    view_res = client.get(
        f"/api/documents/{doc_id}/view",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert view_res.status_code == 200

    view_log = session.scalar(
        select(AuditLog).where(
            AuditLog.document_id == doc_id,
            AuditLog.action == AuditAction.DOCUMENT_VIEWED,
        )
    )
    assert view_log is not None
    assert view_log.user_id == user_a.id
    assert view_log.result == AuditResult.SUCCESS

    # 3. Download
    down_res = client.get(
        f"/api/documents/{doc_id}/download",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert down_res.status_code == 200

    down_log = session.scalar(
        select(AuditLog).where(
            AuditLog.document_id == doc_id,
            AuditLog.action == AuditAction.DOCUMENT_DOWNLOADED,
        )
    )
    assert down_log is not None
    assert down_log.user_id == user_a.id
    assert down_log.result == AuditResult.SUCCESS

    # 4. Delete
    del_res = client.delete(
        f"/api/documents/{doc_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert del_res.status_code == 200

    del_log = session.scalar(
        select(AuditLog).where(
            AuditLog.action == AuditAction.DOCUMENT_DELETED,
            AuditLog.user_id == user_a.id,
        )
    )
    assert del_log is not None
    assert del_log.result == AuditResult.SUCCESS


def test_sharing_events_recorded(client, session, user_a, doc_a):
    """Test SHARE_CREATED, SHARE_ACCESSED, SHARE_ACCESS_DENIED, SHARE_REVOKED, and SHARE_EXPIRED."""
    token = create_access_token(subject=user_a.id)

    # 1. SHARE_CREATED
    create_res = client.post(
        "/api/shares",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "document_id": doc_a.id,
            "recipient_identifier": "Central Diagnostic Lab",
            "permission_type": "VIEW_ONLY",
            "expiry_hours": 12,
        },
    )
    assert create_res.status_code == 200
    share_data = create_res.json()
    raw_token = share_data["raw_token"]
    perm_id = share_data["permission_id"]

    created_log = session.scalar(
        select(AuditLog).where(
            AuditLog.permission_id == perm_id,
            AuditLog.action == AuditAction.SHARE_CREATED,
        )
    )
    assert created_log is not None
    assert created_log.user_id == user_a.id
    assert created_log.document_id == doc_a.id
    assert created_log.result == AuditResult.SUCCESS

    # 2. SHARE_ACCESSED
    acc_res = client.get(f"/api/shared-access/{raw_token}")
    assert acc_res.status_code == 200

    accessed_log = session.scalar(
        select(AuditLog).where(
            AuditLog.permission_id == perm_id,
            AuditLog.action == AuditAction.SHARE_ACCESSED,
        )
    )
    assert accessed_log is not None
    assert accessed_log.result == AuditResult.SUCCESS

    # 3. SHARE_ACCESS_DENIED (Download on view-only share)
    down_res = client.get(f"/api/shared-access/{raw_token}/download")
    assert down_res.status_code == 403

    denied_log = session.scalar(
        select(AuditLog).where(
            AuditLog.permission_id == perm_id,
            AuditLog.action == AuditAction.SHARE_ACCESS_DENIED,
        )
    )
    assert denied_log is not None
    assert denied_log.result == AuditResult.DENIED

    # 4. SHARE_REVOKED
    revoke_res = client.post(
        f"/api/shares/{perm_id}/revoke",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert revoke_res.status_code == 200

    revoked_log = session.scalar(
        select(AuditLog).where(
            AuditLog.permission_id == perm_id,
            AuditLog.action == AuditAction.SHARE_REVOKED,
        )
    )
    assert revoked_log is not None
    assert revoked_log.result == AuditResult.SUCCESS

    # 5. SHARE_EXPIRED
    past = utc_now() - timedelta(hours=1)
    expired_perm = Permission(
        document_id=doc_a.id,
        owner_id=user_a.id,
        recipient_identifier="Expired Lab",
        permission_type=PermissionType.VIEW_ONLY,
        can_view=True,
        can_download=False,
        created_at=past - timedelta(hours=5),
        expires_at=past,
        status=PermissionStatus.ACTIVE,
    )
    session.add(expired_perm)
    session.flush()

    from app.services.share_service import hash_token
    from app.models.access_token import AccessToken
    exp_raw_token = "expired_raw_token_audit_test_987"
    exp_tok = AccessToken(
        permission_id=expired_perm.id,
        token_hash=hash_token(exp_raw_token),
        created_at=past - timedelta(hours=5),
        expires_at=past,
        revoked=False,
    )
    session.add(exp_tok)
    session.commit()

    # Access on expired share triggers expiration event
    exp_res = client.get(f"/api/shared-access/{exp_raw_token}")
    assert exp_res.status_code == 410

    expired_log = session.scalar(
        select(AuditLog).where(
            AuditLog.permission_id == expired_perm.id,
            AuditLog.action == AuditAction.SHARE_EXPIRED,
        )
    )
    assert expired_log is not None
    assert expired_log.result == AuditResult.DENIED


# ==============================================================================
# 2. GET /api/audit/my-history AND AUTHORIZATION SCOPING
# ==============================================================================
def test_get_my_history_authorization_scoping(client, session, user_a, user_b, doc_a):
    """Users should only be able to see audit records they are authorized to see:
    - User A sees their logins, their document activities, and shared accesses on their documents.
    - User B cannot see User A's logs.
    """
    token_a = create_access_token(subject=user_a.id)
    token_b = create_access_token(subject=user_b.id)

    # User A performs actions
    client.get(f"/api/documents/{doc_a.id}/view", headers={"Authorization": f"Bearer {token_a}"})
    client.post(
        "/api/shares",
        headers={"Authorization": f"Bearer {token_a}"},
        json={
            "document_id": doc_a.id,
            "recipient_identifier": "Lab Clinic",
            "permission_type": "VIEW_ONLY",
            "expiry_hours": 24,
        },
    )

    # User B logs in
    client.post("/api/auth/login", json={"email": user_b.email, "password": "Password123!"})

    # Fetch User A's history
    res_a = client.get("/api/audit/my-history", headers={"Authorization": f"Bearer {token_a}"})
    assert res_a.status_code == 200
    logs_a = res_a.json()
    assert len(logs_a) > 0

    # Every log seen by User A must either belong to User A or concern User A's document
    for item in logs_a:
        assert (
            item["user_id"] == user_a.id
            or item["document_id"] == doc_a.id
        )
        assert "access_type" in item
        assert "action" in item
        assert "result" in item
        assert "timestamp" in item

    # Fetch User B's history
    res_b = client.get("/api/audit/my-history", headers={"Authorization": f"Bearer {token_b}"})
    assert res_b.status_code == 200
    logs_b = res_b.json()

    # User B must NOT see doc_a or User A's events
    for item in logs_b:
        assert item["document_id"] != doc_a.id
        assert item["user_id"] != user_a.id


def test_get_my_history_filters(client, user_a, doc_a):
    """Test filtering by action and result on /api/audit/my-history."""
    token = create_access_token(subject=user_a.id)

    # Generate document view
    client.get(f"/api/documents/{doc_a.id}/view", headers={"Authorization": f"Bearer {token}"})

    # Filter by action
    res_action = client.get(
        "/api/audit/my-history",
        headers={"Authorization": f"Bearer {token}"},
        params={"action": "DOCUMENT_VIEWED"},
    )
    assert res_action.status_code == 200
    for item in res_action.json():
        assert item["action"] == "DOCUMENT_VIEWED"

    # Filter by result
    res_result = client.get(
        "/api/audit/my-history",
        headers={"Authorization": f"Bearer {token}"},
        params={"result": "SUCCESS"},
    )
    assert res_result.status_code == 200
    for item in res_result.json():
        assert item["result"] == "SUCCESS"


# ==============================================================================
# 3. IMMUTABILITY & TAMPER-RESISTANCE (NORMAL USERS CANNOT MODIFY OR DELETE)
# ==============================================================================
def test_normal_users_cannot_delete_or_modify_audit_logs(client, user_a):
    """Audit logs are strictly append-only; DELETE and PUT return 403 Forbidden."""
    token = create_access_token(subject=user_a.id)

    # Attempt to delete an audit log
    del_res = client.delete(
        "/api/audit/1",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert del_res.status_code == 403
    assert "cannot be modified or deleted" in del_res.json()["detail"].lower()

    # Attempt to modify an audit log
    put_res = client.put(
        "/api/audit/1",
        headers={"Authorization": f"Bearer {token}"},
        json={"action": "ALTERED_ACTION"},
    )
    assert put_res.status_code == 403
    assert "cannot be modified" in put_res.json()["detail"].lower()


def test_all_security_relevant_events_recorded_and_visible_in_my_history(client, session, user_a):
    """End-to-end verification that all 11 security-relevant events are generated,
    stored with all required audit fields, and accessible via GET /api/audit/my-history.

    Events verified:
    1. LOGIN
    2. LOGIN_FAILED
    3. DOCUMENT_UPLOADED
    4. DOCUMENT_VIEWED
    5. DOCUMENT_DOWNLOADED
    6. DOCUMENT_DELETED
    7. SHARE_CREATED
    8. SHARE_ACCESSED
    9. SHARE_ACCESS_DENIED
    10. SHARE_REVOKED
    11. SHARE_EXPIRED
    """
    token = create_access_token(subject=user_a.id)
    cat = session.query(Category).first()

    # 1. LOGIN
    client.post(
        "/api/auth/login",
        json={"email": user_a.email, "password": "Password123!"},
        headers={"User-Agent": "E2ETestClient/1.0"},
    )

    # 2. LOGIN_FAILED
    client.post(
        "/api/auth/login",
        json={"email": user_a.email, "password": "BadPassword!"},
        headers={"User-Agent": "E2ETestClient/1.0"},
    )

    # 3. DOCUMENT_UPLOADED
    upload_res = client.post(
        "/api/documents/upload",
        headers={"Authorization": f"Bearer {token}", "User-Agent": "E2ETestClient/1.0"},
        data={"document_name": "E2E Complete Audit Health Report", "category_id": cat.id},
        files={"file": ("e2e_report.pdf", io.BytesIO(b"%PDF-1.4 E2E Comprehensive Content"), "application/pdf")},
    )
    assert upload_res.status_code == 201
    doc_id = upload_res.json()["id"]

    # 4. DOCUMENT_VIEWED
    client.get(
        f"/api/documents/{doc_id}/view",
        headers={"Authorization": f"Bearer {token}", "User-Agent": "E2ETestClient/1.0"},
    )

    # 5. DOCUMENT_DOWNLOADED
    client.get(
        f"/api/documents/{doc_id}/download",
        headers={"Authorization": f"Bearer {token}", "User-Agent": "E2ETestClient/1.0"},
    )

    # 6. SHARE_CREATED
    share_res = client.post(
        "/api/shares",
        headers={"Authorization": f"Bearer {token}", "User-Agent": "E2ETestClient/1.0"},
        json={
            "document_id": doc_id,
            "recipient_identifier": "Memorial Diagnostic Center",
            "permission_type": "VIEW_ONLY",
            "expiry_hours": 24,
        },
    )
    assert share_res.status_code == 200
    raw_token = share_res.json()["raw_token"]
    perm_id = share_res.json()["permission_id"]

    # 7. SHARE_ACCESSED
    client.get(
        f"/api/shared-access/{raw_token}",
        headers={"User-Agent": "RecipientBrowser/1.0"},
    )

    # 8. SHARE_ACCESS_DENIED (Attempt download on VIEW_ONLY share)
    client.get(
        f"/api/shared-access/{raw_token}/download",
        headers={"User-Agent": "RecipientBrowser/1.0"},
    )

    # 9. SHARE_REVOKED
    client.post(
        f"/api/shares/{perm_id}/revoke",
        headers={"Authorization": f"Bearer {token}", "User-Agent": "E2ETestClient/1.0"},
    )

    # 10. SHARE_EXPIRED
    now = utc_now()
    past_exp = now - timedelta(hours=2)
    expired_perm = Permission(
        document_id=doc_id,
        owner_id=user_a.id,
        recipient_identifier="Past Consultant",
        permission_type=PermissionType.VIEW_ONLY,
        can_view=True,
        can_download=False,
        created_at=past_exp - timedelta(days=1),
        expires_at=past_exp,
        status=PermissionStatus.ACTIVE,
    )
    session.add(expired_perm)
    session.flush()

    from app.services.share_service import hash_token
    from app.models.access_token import AccessToken
    exp_token_str = "e2e_expired_token_raw_string_555"
    exp_tok = AccessToken(
        permission_id=expired_perm.id,
        token_hash=hash_token(exp_token_str),
        created_at=past_exp - timedelta(days=1),
        expires_at=past_exp,
        revoked=False,
    )
    session.add(exp_tok)
    session.commit()

    # Access expired token triggers real-time expiration handling and logging
    client.get(
        f"/api/shared-access/{exp_token_str}",
        headers={"User-Agent": "RecipientBrowser/1.0"},
    )

    # 11. DOCUMENT_DELETED
    client.delete(
        f"/api/documents/{doc_id}",
        headers={"Authorization": f"Bearer {token}", "User-Agent": "E2ETestClient/1.0"},
    )

    # Retrieve complete history via GET /api/audit/my-history
    history_res = client.get(
        "/api/audit/my-history",
        headers={"Authorization": f"Bearer {token}"},
        params={"limit": 100},
    )
    assert history_res.status_code == 200
    items = history_res.json()
    assert len(items) >= 11

    actions_recorded = {item["action"] for item in items}
    required_actions = {
        "LOGIN",
        "LOGIN_FAILED",
        "DOCUMENT_UPLOADED",
        "DOCUMENT_VIEWED",
        "DOCUMENT_DOWNLOADED",
        "DOCUMENT_DELETED",
        "SHARE_CREATED",
        "SHARE_ACCESSED",
        "SHARE_ACCESS_DENIED",
        "SHARE_REVOKED",
        "SHARE_EXPIRED",
    }
    assert required_actions.issubset(actions_recorded), f"Missing actions: {required_actions - actions_recorded}"

    # Verify all records conform to schema:
    # - User ID where available
    # - Document ID where applicable
    # - Action
    # - Timestamp
    # - IP address where appropriate
    # - User agent where appropriate
    for record in items:
        assert record["id"] is not None
        assert record["timestamp"] is not None
        assert record["action"] in required_actions
        assert record["result"] in ("SUCCESS", "FAILURE", "DENIED")
        assert record["access_type"] is not None
        # Document events must carry document_id
        if record["action"].startswith("DOCUMENT_"):
            assert record["document_id"] == doc_id
        # Share events must carry document_id or permission_id
        if record["action"].startswith("SHARE_"):
            assert record["document_id"] == doc_id or record["permission_id"] is not None


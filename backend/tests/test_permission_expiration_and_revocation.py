from __future__ import annotations

import asyncio
from datetime import timedelta
import hashlib
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
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
from app.services.maintenance_service import PermissionExpirationWorker
from app.services.share_service import (
    cleanup_expired_permissions,
    hash_token,
)
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
def owner_user(session):
    user = User(
        full_name="Dr. Alice Smith",
        email="alice.smith@example.com",
        password_hash=hash_password("Password123!"),
    )
    session.add(user)
    session.commit()
    return user


@pytest.fixture()
def second_user(session):
    user = User(
        full_name="Bob Jones",
        email="bob.jones@example.com",
        password_hash=hash_password("Password123!"),
    )
    session.add(user)
    session.commit()
    return user


@pytest.fixture()
def owner_document(session, owner_user):
    cat = session.query(Category).first()
    raw_content = b"%PDF-1.4 Clinical Lab Test Results - Patient #9872"
    stored_name, path, meta = securely_store_file(raw_content, "lab_results.pdf")

    doc = Document(
        owner_id=owner_user.id,
        category_id=cat.id,
        document_name="Blood Chemistry Analysis",
        original_filename="lab_results.pdf",
        stored_filename=stored_name,
        file_path=path,
        mime_type="application/pdf",
        file_size=len(raw_content),
        encryption_metadata=meta,
    )
    session.add(doc)
    session.commit()
    return doc


# ==============================================================================
# 1. ACTIVE ACCESS TESTS
# ==============================================================================
def test_active_access_workflow(client, session, owner_user, owner_document):
    """Test valid permission access when:
    current_time < expires_at AND status = ACTIVE AND token is valid AND authorization succeeds.
    """
    owner_token = create_access_token(subject=owner_user.id)

    # Owner creates a share with VIEW_AND_DOWNLOAD for 24 hours
    create_res = client.post(
        "/api/shares",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "document_id": owner_document.id,
            "recipient_identifier": "Memorial Diagnostic Center",
            "permission_type": "VIEW_AND_DOWNLOAD",
            "expiry_hours": 24,
        },
    )
    assert create_res.status_code == 200
    share_data = create_res.json()
    raw_token = share_data["raw_token"]
    perm_id = share_data["permission_id"]

    # 1. Verify Permission and Token state in DB
    perm = session.get(Permission, perm_id)
    assert perm is not None
    assert perm.status == PermissionStatus.ACTIVE
    assert perm.expires_at > utc_now()
    assert perm.is_active_and_valid() is True
    assert perm.is_expired() is False
    assert perm.is_revoked() is False

    tok = session.scalar(select(AccessToken).where(AccessToken.token_hash == hash_token(raw_token)))
    assert tok is not None
    assert tok.revoked is False
    assert tok.is_valid() is True

    # 2. Access Metadata (Public Endpoint)
    meta_res = client.get(f"/api/shared-access/{raw_token}")
    assert meta_res.status_code == 200
    meta_data = meta_res.json()
    assert meta_data["document_name"] == "Blood Chemistry Analysis"
    assert meta_data["can_view"] is True
    assert meta_data["can_download"] is True
    assert meta_data["time_remaining_seconds"] > 0

    # 3. View Decrypted Document Inline
    view_res = client.get(f"/api/shared-access/{raw_token}/view")
    assert view_res.status_code == 200
    assert view_res.content == b"%PDF-1.4 Clinical Lab Test Results - Patient #9872"
    assert "no-store" in view_res.headers.get("Cache-Control", "")

    # 4. Download Document Attachment
    down_res = client.get(f"/api/shared-access/{raw_token}/download")
    assert down_res.status_code == 200
    assert down_res.content == b"%PDF-1.4 Clinical Lab Test Results - Patient #9872"
    assert 'filename="lab_results.pdf"' in down_res.headers.get("Content-Disposition", "")

    # 5. Recipient Verification
    verify_res = client.post(
        f"/api/shared-access/{raw_token}/verify",
        json={"recipient_identifier": "Memorial Diagnostic Center"},
    )
    assert verify_res.status_code == 200
    assert verify_res.json()["verified"] is True

    # 6. Audit Trail verification
    access_audits = session.scalars(
        select(AuditLog).where(
            AuditLog.permission_id == perm_id,
            AuditLog.result == AuditResult.SUCCESS,
        )
    ).all()
    actions = [a.action for a in access_audits]
    assert AuditAction.SHARE_CREATED in actions
    assert AuditAction.SHARE_ACCESSED in actions
    assert AuditAction.DOCUMENT_VIEWED in actions
    assert AuditAction.DOCUMENT_DOWNLOADED in actions


# ==============================================================================
# 2. EXPIRED ACCESS TESTS
# ==============================================================================
def test_expired_access_denied_and_status_updated_on_access(client, session, owner_user, owner_document):
    """When current_time >= expires_at:
    - Treat permission as EXPIRED.
    - Deny access.
    - Update status in DB.
    - Record expiration event.
    The authorization check must independently verify expiration on every access request.
    """
    now = utc_now()
    past_expiration = now - timedelta(minutes=15)
    past_creation = now - timedelta(hours=2)

    # Permission created in the past whose expires_at has passed.
    # Status in DB is still ACTIVE (simulating access before background cleanup ran).
    perm = Permission(
        document_id=owner_document.id,
        owner_id=owner_user.id,
        recipient_identifier="Late Recipient Clinic",
        permission_type=PermissionType.VIEW_AND_DOWNLOAD,
        can_view=True,
        can_download=True,
        created_at=past_creation,
        expires_at=past_expiration,
        status=PermissionStatus.ACTIVE,  # Still ACTIVE in DB!
    )
    session.add(perm)
    session.flush()

    raw_token = "secret_expired_token_1234567890abcdef"
    token_digest = hash_token(raw_token)
    tok = AccessToken(
        permission_id=perm.id,
        token_hash=token_digest,
        created_at=past_creation,
        expires_at=past_expiration,
        revoked=False,
    )
    session.add(tok)
    session.commit()

    # Pre-condition check
    assert perm.status == PermissionStatus.ACTIVE
    assert perm.is_expired() is True

    # Authorization Check: Recipient attempts to access metadata
    res = client.get(f"/api/shared-access/{raw_token}")
    assert res.status_code == 410
    assert "expired" in res.json()["detail"].lower()

    # Verify status in database was updated to EXPIRED by the authorization check
    session.expire_all()
    refreshed_perm = session.get(Permission, perm.id)
    assert refreshed_perm.status == PermissionStatus.EXPIRED

    # Verify token was revoked
    refreshed_tok = session.get(AccessToken, tok.id)
    assert refreshed_tok.revoked is True

    # Verify expiration audit event was recorded
    audit_exp = session.scalar(
        select(AuditLog).where(
            AuditLog.permission_id == perm.id,
            AuditLog.action == AuditAction.SHARE_EXPIRED,
            AuditLog.result == AuditResult.DENIED,
        )
    )
    assert audit_exp is not None

    # Verify inline view and download also deny access
    assert client.get(f"/api/shared-access/{raw_token}/view").status_code == 410
    assert client.get(f"/api/shared-access/{raw_token}/download").status_code == 410
    assert (
        client.post(
            f"/api/shared-access/{raw_token}/verify",
            json={"recipient_identifier": "Late Recipient Clinic"},
        ).status_code
        == 410
    )


def test_expired_permission_cannot_be_revoked_by_owner(client, session, owner_user, owner_document):
    """Owner can only revoke active permissions; attempting to revoke an expired permission is rejected."""
    owner_token = create_access_token(subject=owner_user.id)
    now = utc_now()
    past_expiration = now - timedelta(hours=1)

    perm = Permission(
        document_id=owner_document.id,
        owner_id=owner_user.id,
        recipient_identifier="Past Consultant",
        permission_type=PermissionType.VIEW_ONLY,
        can_view=True,
        can_download=False,
        created_at=now - timedelta(hours=10),
        expires_at=past_expiration,
        status=PermissionStatus.ACTIVE,
    )
    session.add(perm)
    session.commit()

    # Owner attempts to revoke an expired permission
    revoke_res = client.post(
        f"/api/shares/{perm.id}/revoke",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert revoke_res.status_code == 400
    assert "expired" in revoke_res.json()["detail"].lower()


# ==============================================================================
# 3. REVOKED ACCESS TESTS
# ==============================================================================
def test_manual_revocation_by_owner_workflow(client, session, owner_user, owner_document):
    """Owner can revoke an active permission at any time.
    Revocation:
    - Immediately invalidate access.
    - Set status to REVOKED.
    - Record revoked_at.
    - Add audit log entry.
    """
    owner_token = create_access_token(subject=owner_user.id)

    # 1. Create active share
    create_res = client.post(
        "/api/shares",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "document_id": owner_document.id,
            "recipient_identifier": "External Partner",
            "permission_type": "VIEW_ONLY",
            "expiry_hours": 48,
        },
    )
    raw_token = create_res.json()["raw_token"]
    perm_id = create_res.json()["permission_id"]

    # Access works before revocation
    assert client.get(f"/api/shared-access/{raw_token}").status_code == 200

    # 2. Owner revokes the permission
    revoke_res = client.post(
        f"/api/shares/{perm_id}/revoke",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert revoke_res.status_code == 200
    revoke_data = revoke_res.json()
    assert revoke_data["status"] == "REVOKED"
    assert revoke_data["revoked_at"] is not None

    # 3. Verify Database state
    session.expire_all()
    perm = session.get(Permission, perm_id)
    assert perm.status == PermissionStatus.REVOKED
    assert perm.revoked_at is not None
    assert perm.is_revoked() is True

    # Verify all associated tokens invalidated
    tokens = session.scalars(select(AccessToken).where(AccessToken.permission_id == perm_id)).all()
    assert len(tokens) > 0
    for t in tokens:
        assert t.revoked is True

    # 4. Verify Audit Log entry for SHARE_REVOKED
    audit = session.scalar(
        select(AuditLog).where(
            AuditLog.permission_id == perm_id,
            AuditLog.action == AuditAction.SHARE_REVOKED,
            AuditLog.result == AuditResult.SUCCESS,
        )
    )
    assert audit is not None
    assert audit.user_id == owner_user.id

    # 5. Immediately invalidate access for all endpoints
    assert client.get(f"/api/shared-access/{raw_token}").status_code == 410
    assert client.get(f"/api/shared-access/{raw_token}/view").status_code == 410
    assert client.get(f"/api/shared-access/{raw_token}/download").status_code == 410
    assert (
        client.post(
            f"/api/shared-access/{raw_token}/verify",
            json={"recipient_identifier": "External Partner"},
        ).status_code
        == 410
    )

    # 6. Attempting to revoke an already revoked permission returns 400 Bad Request
    repeat_revoke = client.post(
        f"/api/shares/{perm_id}/revoke",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert repeat_revoke.status_code == 400
    assert "already revoked" in repeat_revoke.json()["detail"].lower()


# ==============================================================================
# 4. INVALID TOKEN TESTS
# ==============================================================================
def test_invalid_token_not_found_and_audited(client, session):
    """Non-existent token produces 404 and is recorded in audit log."""
    bogus_token = "completely-bogus-token-string-xyz-987654"
    res = client.get(f"/api/shared-access/{bogus_token}")
    assert res.status_code == 404
    assert "invalid or unrecognized" in res.json()["detail"].lower()

    # Check audit log recorded failed attempt
    audit = session.scalar(
        select(AuditLog).where(
            AuditLog.action == AuditAction.SHARE_ACCESS_DENIED,
            AuditLog.result == AuditResult.DENIED,
        )
    )
    assert audit is not None


def test_tampered_token_rejected(client, session, owner_user, owner_document):
    """Altering one character of a valid token fails hash matching and denies access."""
    owner_token = create_access_token(subject=owner_user.id)
    create_res = client.post(
        "/api/shares",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "document_id": owner_document.id,
            "recipient_identifier": "Dr. Valid",
            "permission_type": "VIEW_ONLY",
            "expiry_hours": 12,
        },
    )
    raw_token = create_res.json()["raw_token"]

    # Tamper with the last character
    tampered_token = raw_token[:-1] + ("A" if raw_token[-1] != "A" else "B")

    res = client.get(f"/api/shared-access/{tampered_token}")
    assert res.status_code == 404
    assert "invalid or unrecognized" in res.json()["detail"].lower()


# ==============================================================================
# 5. UNAUTHORIZED USER TESTS
# ==============================================================================
def test_unauthorized_user_cannot_revoke_permission(client, owner_user, second_user, owner_document):
    """User B cannot revoke a share grant created by User A."""
    owner_token = create_access_token(subject=owner_user.id)
    second_user_token = create_access_token(subject=second_user.id)

    create_res = client.post(
        "/api/shares",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "document_id": owner_document.id,
            "recipient_identifier": "Confidential Auditor",
            "permission_type": "VIEW_ONLY",
            "expiry_hours": 24,
        },
    )
    perm_id = create_res.json()["permission_id"]

    # Second user attempts to revoke owner's share grant
    res = client.post(
        f"/api/shares/{perm_id}/revoke",
        headers={"Authorization": f"Bearer {second_user_token}"},
    )
    assert res.status_code == 403
    assert "only revoke sharing permissions you created" in res.json()["detail"].lower()


def test_unauthenticated_user_cannot_revoke(client, owner_user, owner_document):
    """Unauthenticated call to revoke returns 401."""
    owner_token = create_access_token(subject=owner_user.id)
    create_res = client.post(
        "/api/shares",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "document_id": owner_document.id,
            "recipient_identifier": "Auditor",
            "permission_type": "VIEW_ONLY",
            "expiry_hours": 24,
        },
    )
    perm_id = create_res.json()["permission_id"]

    res = client.post(f"/api/shares/{perm_id}/revoke")
    assert res.status_code == 401


def test_unauthenticated_user_cannot_create_share(client, owner_document):
    """Unauthenticated call to create share returns 401."""
    res = client.post(
        "/api/shares",
        json={
            "document_id": owner_document.id,
            "recipient_identifier": "Intruder",
            "permission_type": "VIEW_ONLY",
            "expiry_hours": 24,
        },
    )
    assert res.status_code == 401


def test_user_cannot_share_another_users_document(client, second_user, owner_document):
    """User B cannot create a share grant for User A's document."""
    second_user_token = create_access_token(subject=second_user.id)
    res = client.post(
        "/api/shares",
        headers={"Authorization": f"Bearer {second_user_token}"},
        json={
            "document_id": owner_document.id,
            "recipient_identifier": "Third Party",
            "permission_type": "VIEW_ONLY",
            "expiry_hours": 12,
        },
    )
    assert res.status_code == 403
    assert "only share documents you own" in res.json()["detail"].lower()


def test_unauthorized_recipient_verification_fails(client, owner_user, owner_document):
    """Mismatched recipient identifier fails verification with 403."""
    owner_token = create_access_token(subject=owner_user.id)
    create_res = client.post(
        "/api/shares",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "document_id": owner_document.id,
            "recipient_identifier": "Dr. Sarah Connor",
            "permission_type": "VIEW_ONLY",
            "expiry_hours": 24,
        },
    )
    raw_token = create_res.json()["raw_token"]

    verify_res = client.post(
        f"/api/shared-access/{raw_token}/verify",
        json={"recipient_identifier": "Cyberdyne Imposter"},
    )
    assert verify_res.status_code == 403
    assert "recipient verification failed" in verify_res.json()["detail"].lower()


def test_unauthorized_download_denied_for_view_only(client, owner_user, owner_document):
    """Recipient attempting to download a VIEW_ONLY share is rejected with 403."""
    owner_token = create_access_token(subject=owner_user.id)
    create_res = client.post(
        "/api/shares",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "document_id": owner_document.id,
            "recipient_identifier": "View Only Doctor",
            "permission_type": "VIEW_ONLY",
            "expiry_hours": 24,
        },
    )
    raw_token = create_res.json()["raw_token"]

    down_res = client.get(f"/api/shared-access/{raw_token}/download")
    assert down_res.status_code == 403
    assert "download permission is not enabled" in down_res.json()["detail"].lower()


# ==============================================================================
# 6. BACKGROUND CLEANUP AND MAINTENANCE TESTS
# ==============================================================================
def test_background_cleanup_service_identifies_expired_permissions(session, owner_user, owner_document):
    """Test cleanup_expired_permissions function correctly transitions expired grants."""
    now = utc_now()
    past = now - timedelta(hours=2)
    future = now + timedelta(hours=5)

    # 1. Expired permission (should be transitioned to EXPIRED)
    p_expired = Permission(
        document_id=owner_document.id,
        owner_id=owner_user.id,
        recipient_identifier="Past Hospital",
        permission_type=PermissionType.VIEW_ONLY,
        can_view=True,
        can_download=False,
        created_at=past - timedelta(days=1),
        expires_at=past,
        status=PermissionStatus.ACTIVE,
    )
    session.add(p_expired)
    session.flush()

    t_expired = AccessToken(
        permission_id=p_expired.id,
        token_hash=hash_token("expired_token_1"),
        created_at=past - timedelta(days=1),
        expires_at=past,
        revoked=False,
    )
    session.add(t_expired)

    # 2. Active, unexpired permission (must REMAIN active)
    p_active = Permission(
        document_id=owner_document.id,
        owner_id=owner_user.id,
        recipient_identifier="Active Clinic",
        permission_type=PermissionType.VIEW_ONLY,
        can_view=True,
        can_download=False,
        created_at=now,
        expires_at=future,
        status=PermissionStatus.ACTIVE,
    )
    session.add(p_active)
    session.flush()

    t_active = AccessToken(
        permission_id=p_active.id,
        token_hash=hash_token("active_token_1"),
        created_at=now,
        expires_at=future,
        revoked=False,
    )
    session.add(t_active)
    session.commit()

    # Run cleanup
    res = cleanup_expired_permissions(session, reference_time=now)
    assert res["expired_count"] == 1
    assert p_expired.id in res["expired_permission_ids"]

    # Verify p_expired changed to EXPIRED and token revoked
    session.refresh(p_expired)
    session.refresh(t_expired)
    assert p_expired.status == PermissionStatus.EXPIRED
    assert t_expired.revoked is True

    # Verify p_active remains ACTIVE and token not revoked
    session.refresh(p_active)
    session.refresh(t_active)
    assert p_active.status == PermissionStatus.ACTIVE
    assert t_active.revoked is False

    # Verify audit log for the expiration was recorded
    audit = session.scalar(
        select(AuditLog).where(
            AuditLog.permission_id == p_expired.id,
            AuditLog.action == AuditAction.SHARE_EXPIRED,
            AuditLog.result == AuditResult.SUCCESS,
        )
    )
    assert audit is not None


def test_maintenance_cleanup_api_endpoint(client, owner_user):
    """Test calling the maintenance cleanup endpoint as an authenticated user."""
    owner_token = create_access_token(subject=owner_user.id)
    res = client.post(
        "/api/shares/maintenance/cleanup",
        headers={"Authorization": f"Bearer {owner_token}"},
        params={"run_immediately": True},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["message"] == "Permission cleanup completed successfully."
    assert "expired_count" in data["data"]


@pytest.mark.anyio
async def test_permission_expiration_worker_lifecycle(sessionmaker_factory=None):
    """Test the PermissionExpirationWorker starts, executes run_once, and stops gracefully."""
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    test_sessionmaker = sessionmaker(bind=engine)

    worker = PermissionExpirationWorker(
        interval_seconds=1,
        session_factory=test_sessionmaker,
    )

    # Test run_once
    res = await worker.run_once()
    assert "expired_count" in res

    # Test start and stop lifecycle
    await worker.start()
    assert worker._task is not None
    await asyncio.sleep(0.05)
    await worker.stop()
    assert worker._task is None
    engine.dispose()


# ==============================================================================
# 7. MODEL BOUNDARY & INDEPENDENT AUTHORIZATION INVARIANT TESTS
# ==============================================================================
def test_permission_model_boundary_conditions():
    """Verify permission and token boundary logic:
    A permission is valid only when current_time < expires_at AND status = ACTIVE.
    When current_time >= expires_at, it must be treated as expired.
    """
    now = utc_now()
    exp = now + timedelta(hours=1)

    # 1. Active & Valid before expires_at
    p_active = Permission(
        document_id=1,
        owner_id=1,
        recipient_identifier="Dr. Test",
        permission_type=PermissionType.VIEW_ONLY,
        can_view=True,
        can_download=False,
        created_at=now,
        expires_at=exp,
        status=PermissionStatus.ACTIVE,
    )
    assert p_active.is_active_and_valid(now) is True
    assert p_active.is_expired(now) is False
    assert p_active.is_revoked() is False

    # 2. Exact boundary: current_time == expires_at -> MUST be treated as expired
    assert p_active.is_active_and_valid(exp) is False
    assert p_active.is_expired(exp) is True

    # 3. Past boundary: current_time > expires_at -> MUST be treated as expired
    future_time = exp + timedelta(seconds=1)
    assert p_active.is_active_and_valid(future_time) is False
    assert p_active.is_expired(future_time) is True

    # 4. Status = EXPIRED even before expires_at -> Invalid
    p_expired_status = Permission(
        document_id=1,
        owner_id=1,
        recipient_identifier="Dr. Test",
        permission_type=PermissionType.VIEW_ONLY,
        created_at=now,
        expires_at=exp,
        status=PermissionStatus.EXPIRED,
    )
    assert p_expired_status.is_active_and_valid(now) is False
    assert p_expired_status.is_expired(now) is True

    # 5. Revoked state
    p_revoked = Permission(
        document_id=1,
        owner_id=1,
        recipient_identifier="Dr. Test",
        permission_type=PermissionType.VIEW_ONLY,
        created_at=now,
        expires_at=exp,
        status=PermissionStatus.REVOKED,
        revoked_at=now,
    )
    assert p_revoked.is_active_and_valid(now) is False
    assert p_revoked.is_revoked() is True

    # 6. AccessToken is_valid boundaries
    tok = AccessToken(
        permission_id=1,
        token_hash="dummy_hash",
        created_at=now,
        expires_at=exp,
        revoked=False,
    )
    assert tok.is_valid(now) is True
    assert tok.is_valid(exp) is False  # current_time >= expires_at is invalid
    assert tok.is_valid(exp + timedelta(seconds=1)) is False

    tok.revoked = True
    assert tok.is_valid(now) is False


def test_independent_authorization_without_background_worker(client, session, owner_user, owner_document):
    """The authorization check MUST independently verify expiration on every access request,
    NEVER relying only on a background job for security.
    """
    now = utc_now()
    past_expiration = now - timedelta(seconds=5)

    perm = Permission(
        document_id=owner_document.id,
        owner_id=owner_user.id,
        recipient_identifier="Zero-Trust Recipient",
        permission_type=PermissionType.VIEW_AND_DOWNLOAD,
        can_view=True,
        can_download=True,
        created_at=now - timedelta(hours=1),
        expires_at=past_expiration,
        status=PermissionStatus.ACTIVE,  # Still ACTIVE in DB
    )
    session.add(perm)
    session.flush()

    raw_token = "zero_trust_token_secure_999888"
    tok = AccessToken(
        permission_id=perm.id,
        token_hash=hash_token(raw_token),
        created_at=now - timedelta(hours=1),
        expires_at=past_expiration,
        revoked=False,  # Still not revoked in DB
    )
    session.add(tok)
    session.commit()

    # Pre-condition: background worker has NOT run; DB still says ACTIVE and not revoked
    db_perm_before = session.get(Permission, perm.id)
    assert db_perm_before.status == PermissionStatus.ACTIVE
    db_tok_before = session.get(AccessToken, tok.id)
    assert db_tok_before.revoked is False

    # Independent check on access: must reject immediately
    res = client.get(f"/api/shared-access/{raw_token}")
    assert res.status_code == 410
    assert "expired" in res.json()["detail"].lower()

    # Verify DB status updated synchronously upon access
    session.expire_all()
    db_perm_after = session.get(Permission, perm.id)
    assert db_perm_after.status == PermissionStatus.EXPIRED

    db_tok_after = session.get(AccessToken, tok.id)
    assert db_tok_after.revoked is True

    # Verify expiration event was recorded
    audit_log = session.scalar(
        select(AuditLog).where(
            AuditLog.permission_id == perm.id,
            AuditLog.action == AuditAction.SHARE_EXPIRED,
            AuditLog.result == AuditResult.DENIED,
        )
    )
    assert audit_log is not None


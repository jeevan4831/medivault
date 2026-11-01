from __future__ import annotations

import hashlib
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
from app.models.access_token import AccessToken
from app.models.category import Category
from app.models.document import Document
from app.models.enums import NotificationType, PermissionStatus, PermissionType
from app.models.notification import Notification
from app.models.permission import Permission
from app.models.user import User
from app.security.jwt import create_access_token
from app.security.passwords import hash_password
from app.services.notification_service import create_notification
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
        full_name="Alice User",
        email="alice@example.com",
        password_hash=hash_password("Password123!"),
    )
    session.add(user)
    session.commit()
    return user


@pytest.fixture()
def user_b(session):
    user = User(
        full_name="Bob User",
        email="bob@example.com",
        password_hash=hash_password("Password123!"),
    )
    session.add(user)
    session.commit()
    return user


@pytest.fixture()
def token_a(user_a):
    return create_access_token(subject=user_a.id)


@pytest.fixture()
def token_b(user_b):
    return create_access_token(subject=user_b.id)


@pytest.fixture()
def headers_a(token_a):
    return {"Authorization": f"Bearer {token_a}"}


@pytest.fixture()
def headers_b(token_b):
    return {"Authorization": f"Bearer {token_b}"}


@pytest.fixture()
def sample_document(session, user_a):
    cat = session.query(Category).first()
    raw = b"%PDF-1.4 Confidential Medical Report Content"
    stored, path, meta = securely_store_file(raw, "report.pdf")

    doc = Document(
        owner_id=user_a.id,
        category_id=cat.id,
        document_name="Blood Test Results",
        original_filename="report.pdf",
        stored_filename=stored,
        file_path=path,
        mime_type="application/pdf",
        file_size=len(raw),
        encryption_metadata=meta,
    )
    session.add(doc)
    session.commit()
    return doc


# ---------------------------------------------------------------------------
# API Endpoint Tests
# ---------------------------------------------------------------------------


def test_get_notifications_isolation_and_unread_filter(client, session, user_a, user_b, headers_a, headers_b):
    create_notification(session, user_a.id, "Alice Notif 1", "Msg 1", NotificationType.DOCUMENT)
    create_notification(session, user_a.id, "Alice Notif 2", "Msg 2", NotificationType.SECURITY)
    create_notification(session, user_b.id, "Bob Notif 1", "Msg Bob", NotificationType.SHARING)

    # Alice gets only her 2 notifications
    res_a = client.get("/api/notifications", headers=headers_a)
    assert res_a.status_code == 200
    data_a = res_a.json()
    assert len(data_a) == 2
    assert all(item["title"].startswith("Alice") for item in data_a)

    # Bob gets only his 1 notification
    res_b = client.get("/api/notifications", headers=headers_b)
    assert res_b.status_code == 200
    data_b = res_b.json()
    assert len(data_b) == 1
    assert data_b[0]["title"] == "Bob Notif 1"

    # Mark one of Alice's as read
    notif_a1_id = data_a[0]["id"]
    client.post(f"/api/notifications/{notif_a1_id}/read", headers=headers_a)

    # Filter unread only for Alice
    res_unread = client.get("/api/notifications?unread_only=true", headers=headers_a)
    assert res_unread.status_code == 200
    unread_items = res_unread.json()
    assert len(unread_items) == 1
    assert unread_items[0]["id"] != notif_a1_id


def test_get_unread_count(client, session, user_a, user_b, headers_a, headers_b):
    create_notification(session, user_a.id, "Alice 1", "Msg 1", NotificationType.DOCUMENT)
    create_notification(session, user_a.id, "Alice 2", "Msg 2", NotificationType.SECURITY)
    create_notification(session, user_b.id, "Bob 1", "Msg Bob", NotificationType.SHARING)

    res_a = client.get("/api/notifications/unread-count", headers=headers_a)
    assert res_a.status_code == 200
    assert res_a.json()["unread_count"] == 2

    res_b = client.get("/api/notifications/unread-count", headers=headers_b)
    assert res_b.status_code == 200
    assert res_b.json()["unread_count"] == 1


def test_mark_as_read_single_and_forbidden_checks(client, session, user_a, user_b, headers_a, headers_b):
    notif_a = create_notification(session, user_a.id, "Alice Alert", "Hello", NotificationType.SECURITY)
    notif_b = create_notification(session, user_b.id, "Bob Alert", "Hello Bob", NotificationType.SECURITY)

    # Alice marks her own notification as read
    res_read = client.post(f"/api/notifications/{notif_a.id}/read", headers=headers_a)
    assert res_read.status_code == 200
    assert res_read.json()["is_read"] is True

    # Alice tries to mark Bob's notification as read -> 403 Forbidden
    res_forbidden = client.post(f"/api/notifications/{notif_b.id}/read", headers=headers_a)
    assert res_forbidden.status_code == 403

    # Alice tries to mark non-existent notification -> 404 Not Found
    res_404 = client.post("/api/notifications/99999/read", headers=headers_a)
    assert res_404.status_code == 404


def test_mark_all_read(client, session, user_a, user_b, headers_a, headers_b):
    create_notification(session, user_a.id, "A1", "Msg", NotificationType.DOCUMENT)
    create_notification(session, user_a.id, "A2", "Msg", NotificationType.DOCUMENT)
    create_notification(session, user_b.id, "B1", "Msg", NotificationType.DOCUMENT)

    res_mark = client.post("/api/notifications/mark-all-read", headers=headers_a)
    assert res_mark.status_code == 200
    assert res_mark.json()["count"] == 2

    # Verify Alice unread count is now 0
    res_count_a = client.get("/api/notifications/unread-count", headers=headers_a)
    assert res_count_a.json()["unread_count"] == 0

    # Bob's unread count is still 1
    res_count_b = client.get("/api/notifications/unread-count", headers=headers_b)
    assert res_count_b.json()["unread_count"] == 1


def test_delete_notification_single_and_forbidden_checks(client, session, user_a, user_b, headers_a, headers_b):
    notif_a = create_notification(session, user_a.id, "Alice Notif to Delete", "Delete me", NotificationType.DOCUMENT)
    notif_b = create_notification(session, user_b.id, "Bob Notif to Protect", "Keep me", NotificationType.SECURITY)

    # Bob's notification cannot be deleted by Alice -> 403 Forbidden
    res_forbidden = client.delete(f"/api/notifications/{notif_b.id}", headers=headers_a)
    assert res_forbidden.status_code == 403

    # Non-existent notification -> 404 Not Found
    res_404 = client.delete("/api/notifications/99999", headers=headers_a)
    assert res_404.status_code == 404

    # Alice deletes her own notification -> 200 OK
    res_del = client.delete(f"/api/notifications/{notif_a.id}", headers=headers_a)
    assert res_del.status_code == 200
    assert res_del.json()["id"] == notif_a.id

    # Verify notification is removed from Alice's notifications
    res_list = client.get("/api/notifications", headers=headers_a)
    assert all(item["id"] != notif_a.id for item in res_list.json())

    # Bob's notification is still intact
    res_bob_list = client.get("/api/notifications", headers=headers_b)
    assert any(item["id"] == notif_b.id for item in res_bob_list.json())


def test_clear_all_notifications(client, session, user_a, user_b, headers_a, headers_b):
    create_notification(session, user_a.id, "A1", "Msg 1", NotificationType.DOCUMENT)
    create_notification(session, user_a.id, "A2", "Msg 2", NotificationType.SECURITY)
    create_notification(session, user_b.id, "B1", "Msg Bob", NotificationType.SHARING)

    # Alice clears all her notifications
    res_clear = client.delete("/api/notifications", headers=headers_a)
    assert res_clear.status_code == 200
    assert res_clear.json()["count"] == 2

    # Verify Alice has 0 notifications
    res_a = client.get("/api/notifications", headers=headers_a)
    assert len(res_a.json()) == 0

    # Bob's notifications are untouched
    res_b = client.get("/api/notifications", headers=headers_b)
    assert len(res_b.json()) == 1
    assert res_b.json()[0]["title"] == "B1"


# ---------------------------------------------------------------------------
# Event Trigger Tests
# ---------------------------------------------------------------------------


def test_notification_on_document_upload(client, session, user_a, headers_a):
    cat = session.query(Category).first()
    file_bytes = b"%PDF-1.4 Sample upload content for testing notifications"
    response = client.post(
        "/api/documents/upload",
        headers=headers_a,
        files={"file": ("test_doc.pdf", io.BytesIO(file_bytes), "application/pdf")},
        data={"document_name": "Lab Results Document", "category_id": cat.id},
    )
    assert response.status_code == 201

    session.expire_all()
    notifs = session.execute(
        select(Notification).where(Notification.user_id == user_a.id)
    ).scalars().all()
    upload_notifs = [n for n in notifs if "Document Uploaded" in n.title]
    assert len(upload_notifs) >= 1
    assert upload_notifs[0].notification_type == NotificationType.DOCUMENT
    assert "Lab Results Document" in upload_notifs[0].message


def test_notification_on_share_created_and_revoked(client, session, user_a, sample_document, headers_a):
    # Create share via /api/shares
    share_resp = client.post(
        "/api/shares",
        headers=headers_a,
        json={
            "document_id": sample_document.id,
            "recipient_identifier": "doctor@hospital.org",
            "permission_type": "VIEW_AND_DOWNLOAD",
            "expiry_hours": 24,
        },
    )
    assert share_resp.status_code == 200
    perm_id = share_resp.json()["permission_id"]

    # Verify Share Created notification
    session.expire_all()
    notifs = session.execute(
        select(Notification).where(Notification.user_id == user_a.id)
    ).scalars().all()
    created_notifs = [n for n in notifs if "Document Shared Temporarily" in n.title]
    assert len(created_notifs) >= 1
    assert created_notifs[0].notification_type == NotificationType.SHARING
    assert "doctor@hospital.org" in created_notifs[0].message

    # Revoke share via /api/shares/{perm_id}/revoke
    revoke_resp = client.post(
        f"/api/shares/{perm_id}/revoke",
        headers=headers_a,
    )
    assert revoke_resp.status_code == 200

    # Verify Share Revoked notification
    session.expire_all()
    notifs_after_revoke = session.execute(
        select(Notification).where(Notification.user_id == user_a.id)
    ).scalars().all()
    revoked_notifs = [n for n in notifs_after_revoke if "Share Access Revoked" in n.title]
    assert len(revoked_notifs) >= 1
    assert revoked_notifs[0].notification_type == NotificationType.SHARING


def test_notification_on_document_accessed_and_downloaded(client, session, user_a, sample_document, headers_a):
    # Create share
    share_resp = client.post(
        "/api/shares",
        headers=headers_a,
        json={
            "document_id": sample_document.id,
            "recipient_identifier": "recipient@example.com",
            "permission_type": "VIEW_AND_DOWNLOAD",
            "expiry_hours": 12,
        },
    )
    assert share_resp.status_code == 200
    raw_token = share_resp.json()["raw_token"]

    # Public recipient views the document
    view_resp = client.get(f"/api/shared-access/{raw_token}/view")
    assert view_resp.status_code == 200

    # Public recipient downloads the document
    download_resp = client.get(f"/api/shared-access/{raw_token}/download")
    assert download_resp.status_code == 200

    # Verify owner received accessed & downloaded notifications
    session.expire_all()
    notifs = session.execute(
        select(Notification).where(Notification.user_id == user_a.id)
    ).scalars().all()

    view_notifs = [n for n in notifs if "Shared Document Accessed" in n.title]
    assert len(view_notifs) >= 1
    assert view_notifs[0].notification_type == NotificationType.SHARING

    download_notifs = [n for n in notifs if "Shared Document Downloaded" in n.title]
    assert len(download_notifs) >= 1
    assert download_notifs[0].notification_type == NotificationType.SHARING


def test_notification_on_share_expired(client, session, user_a, sample_document, headers_a):
    # Create permission with expired timestamp
    past = utc_now() - timedelta(hours=2)
    perm = Permission(
        document_id=sample_document.id,
        owner_id=user_a.id,
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

    raw_token = "expired-token-12345"
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    acc_token = AccessToken(
        permission_id=perm.id,
        token_hash=token_hash,
        expires_at=past,
        revoked=False,
    )
    session.add(acc_token)
    session.commit()

    # Recipient attempts to access -> triggered expiration
    resp = client.get(f"/api/shared-access/{raw_token}")
    assert resp.status_code == 410

    # Verify owner received Share Grant Expired notification
    session.expire_all()
    notifs = session.execute(
        select(Notification).where(Notification.user_id == user_a.id)
    ).scalars().all()
    expired_notifs = [n for n in notifs if "Share Grant Expired" in n.title]
    assert len(expired_notifs) >= 1
    assert expired_notifs[0].notification_type == NotificationType.SHARING


def test_notification_on_failed_access_attempts(client, session, user_a, sample_document, headers_a):
    # 1. Recipient verification mismatch
    share_resp = client.post(
        "/api/shares",
        headers=headers_a,
        json={
            "document_id": sample_document.id,
            "recipient_identifier": "expected@example.com",
            "permission_type": "VIEW_AND_DOWNLOAD",
            "expiry_hours": 12,
        },
    )
    assert share_resp.status_code == 200
    raw_token = share_resp.json()["raw_token"]

    verify_fail = client.post(
        f"/api/shared-access/{raw_token}/verify",
        json={"recipient_identifier": "wrong@example.com"},
    )
    assert verify_fail.status_code == 403

    # 2. View-only download attempt
    view_only_share = client.post(
        "/api/shares",
        headers=headers_a,
        json={
            "document_id": sample_document.id,
            "recipient_identifier": "viewonly@example.com",
            "permission_type": "VIEW_ONLY",
            "expiry_hours": 12,
        },
    )
    assert view_only_share.status_code == 200
    view_token = view_only_share.json()["raw_token"]

    download_blocked = client.get(f"/api/shared-access/{view_token}/download")
    assert download_blocked.status_code == 403

    # Verify security notifications created
    session.expire_all()
    notifs = session.execute(
        select(Notification).where(Notification.user_id == user_a.id)
    ).scalars().all()

    sec_notifs = [n for n in notifs if n.notification_type == NotificationType.SECURITY]
    assert len(sec_notifs) >= 2
    titles = [n.title for n in sec_notifs]
    assert any("Failed Access Attempt" in t for t in titles)
    assert any("Unauthorized Download Attempt" in t for t in titles)


def test_notification_on_security_login_events(client, session, user_a):
    # Successful login
    login_success = client.post(
        "/api/auth/login",
        json={"email": "alice@example.com", "password": "Password123!"},
    )
    assert login_success.status_code == 200

    # Failed login
    login_fail = client.post(
        "/api/auth/login",
        json={"email": "alice@example.com", "password": "WrongPassword!"},
    )
    assert login_fail.status_code == 401

    session.expire_all()
    notifs = session.execute(
        select(Notification).where(Notification.user_id == user_a.id)
    ).scalars().all()

    login_notifs = [n for n in notifs if n.notification_type == NotificationType.SECURITY]
    assert len(login_notifs) >= 2
    titles = [n.title for n in login_notifs]
    assert any("Successful Login" in t for t in titles)
    assert any("Failed Login Attempt" in t for t in titles)

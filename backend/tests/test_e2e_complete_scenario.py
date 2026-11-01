"""End-to-End Test Suite for MediVault.

Covers the complete scenario and negative edge cases:
1. Register User A.
2. Login as User A.
3. Upload Aadhaar document.
4. Upload PAN document.
5. Upload Driving Licence.
6. Upload a medical report.
7. Verify categories.
8. Open a document.
9. Create VIEW_ONLY permission.
10. Set expiry to a short period.
11. Generate QR.
12. Access using the temporary access flow.
13. Verify document can be viewed.
14. Verify download is unavailable for VIEW_ONLY.
15. Revoke the permission.
16. Verify access is immediately denied.
17. Create VIEW_AND_DOWNLOAD permission.
18. Verify authorized download.
19. Verify audit logs.
20. Verify notifications.
21. Test expiry.
22. Attempt unauthorized access using another account.
23. Verify unauthorized access is denied.

Negative/Edge Cases:
- Invalid login
- Duplicate registration
- Invalid file type
- Oversized file
- Expired token
- Revoked token
- Invalid token
- Missing document
- Unauthorized document ID
- Unauthorized permission ID
"""
import io
import time
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
from app.models.audit_log import AuditLog
from app.models.category import Category
from app.models.document import Document
from app.models.enums import AuditAction, AuditResult, PermissionStatus, PermissionType
from app.models.permission import Permission
from app.models.user import User
from app.services.share_service import hash_token
from app.utils.time import utc_now


@pytest.fixture()
def db_session():
    """Isolated in-memory SQLite database session for complete test isolation."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    seed_categories(session)
    yield session
    session.close()
    engine.dispose()


@pytest.fixture()
def client(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


# ==============================================================================
# Helper functions for generating realistic test documents with valid magic bytes
# ==============================================================================
def create_dummy_pdf(title: str, text: str = "Confidential Record Content") -> bytes:
    """Generate minimal valid PDF bytes with %PDF- header."""
    return (
        f"%PDF-1.5\n"
        f"1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj\n"
        f"2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj\n"
        f"3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R>> endobj\n"
        f"4 0 obj <</Length 60>> stream\n"
        f"BT /F1 12 Tf 72 712 Td ({title}: {text}) Tj ET\n"
        f"endstream\nendobj\n"
        f"xref\n0 5\n0000000000 65535 f \n"
        f"trailer <</Size 5 /Root 1 0 R>>\nstartxref\n300\n%%EOF\n"
    ).encode("utf-8")


def create_dummy_jpeg(label: str) -> bytes:
    """Generate minimal valid JPEG bytes with \xff\xd8\xff\xe0 header."""
    header = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00"
    payload = f"JPEG_DATA_{label}".encode("utf-8")
    footer = b"\xff\xd9"
    return header + payload + footer


def create_dummy_png(label: str) -> bytes:
    """Generate minimal valid PNG bytes with \x89PNG\r\n\x1a\n header."""
    header = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
    payload = f"PNG_DATA_{label}".encode("utf-8")
    footer = b"\x00\x00\x00\x00IEND\xaeB`\x82"
    return header + payload + footer


# ==============================================================================
# Complete End-to-End Scenario Test
# ==============================================================================
def test_complete_e2e_medivault_scenario(client, db_session):
    """Executes the full user journey from Registration through Temporary Sharing,
    Revocation, View/Download access enforcement, Audit logs, and Notifications."""

    # --------------------------------------------------------------------------
    # Step 1: Register User A
    # --------------------------------------------------------------------------
    reg_payload = {
        "full_name": "Alice Johnson",
        "email": "alice.johnson@example.com",
        "phone": "+91 98765 43210",
        "password": "Password123!",
        "confirm_password": "Password123!",
    }
    reg_resp = client.post("/api/auth/register", json=reg_payload)
    assert reg_resp.status_code == 201, reg_resp.text
    user_a_data = reg_resp.json()
    assert user_a_data["email"] == "alice.johnson@example.com"
    assert user_a_data["full_name"] == "Alice Johnson"
    assert "password" not in user_a_data

    # --------------------------------------------------------------------------
    # Step 2: Login as User A
    # --------------------------------------------------------------------------
    login_resp = client.post(
        "/api/auth/login",
        json={"email": "alice.johnson@example.com", "password": "Password123!"},
    )
    assert login_resp.status_code == 200, login_resp.text
    login_data = login_resp.json()
    assert "access_token" in login_data
    token_a = login_data["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # Verify /api/auth/me
    me_resp = client.get("/api/auth/me", headers=headers_a)
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == "alice.johnson@example.com"

    # --------------------------------------------------------------------------
    # Step 7 (pre-check): Verify Categories list
    # --------------------------------------------------------------------------
    cat_resp = client.get("/api/documents/categories", headers=headers_a)
    assert cat_resp.status_code == 200
    categories = cat_resp.json()
    cat_map = {c["name"]: c["id"] for c in categories}
    assert "Identity" in cat_map
    assert "Healthcare" in cat_map
    assert "Education" in cat_map
    assert "Vehicle" in cat_map
    assert "Insurance" in cat_map
    assert "Employment" in cat_map
    assert "Other" in cat_map

    identity_cat_id = cat_map["Identity"]
    healthcare_cat_id = cat_map["Healthcare"]

    # --------------------------------------------------------------------------
    # Step 3: Upload Aadhaar document (Category: Identity, PDF)
    # --------------------------------------------------------------------------
    aadhaar_bytes = create_dummy_pdf("Aadhaar Card", "Unique Identification Authority of India - 1234 5678 9012")
    aadhaar_resp = client.post(
        "/api/documents/upload",
        headers=headers_a,
        data={
            "document_name": "National Aadhaar Card",
            "category_id": identity_cat_id,
            "description": "Government of India Citizen ID",
        },
        files={"file": ("aadhaar_doc.pdf", io.BytesIO(aadhaar_bytes), "application/pdf")},
    )
    assert aadhaar_resp.status_code == 201, aadhaar_resp.text
    aadhaar_doc = aadhaar_resp.json()
    assert aadhaar_doc["document_name"] == "National Aadhaar Card"
    assert aadhaar_doc["category_name"] == "Identity"
    assert aadhaar_doc["file_type"] == "PDF"
    aadhaar_id = aadhaar_doc["id"]

    # --------------------------------------------------------------------------
    # Step 4: Upload PAN document (Category: Identity, PNG)
    # --------------------------------------------------------------------------
    pan_bytes = create_dummy_png("PAN Card - ABCDE1234F")
    pan_resp = client.post(
        "/api/documents/upload",
        headers=headers_a,
        data={
            "document_name": "Income Tax PAN Card",
            "category_id": identity_cat_id,
            "description": "Permanent Account Number Card",
        },
        files={"file": ("pan_card.png", io.BytesIO(pan_bytes), "image/png")},
    )
    assert pan_resp.status_code == 201, pan_resp.text
    pan_doc = pan_resp.json()
    assert pan_doc["document_name"] == "Income Tax PAN Card"
    assert pan_doc["category_name"] == "Identity"
    assert pan_doc["file_type"] == "PNG"
    pan_id = pan_doc["id"]

    # --------------------------------------------------------------------------
    # Step 5: Upload Driving Licence (Category: Identity, JPEG)
    # --------------------------------------------------------------------------
    dl_bytes = create_dummy_jpeg("Driving Licence - DL-0420110012345")
    dl_resp = client.post(
        "/api/documents/upload",
        headers=headers_a,
        data={
            "document_name": "Motor Vehicle Driving Licence",
            "category_id": identity_cat_id,
            "description": "Class LMV/MCWG Licence",
        },
        files={"file": ("driving_licence.jpg", io.BytesIO(dl_bytes), "image/jpeg")},
    )
    assert dl_resp.status_code == 201, dl_resp.text
    dl_doc = dl_resp.json()
    assert dl_doc["document_name"] == "Motor Vehicle Driving Licence"
    assert dl_doc["category_name"] == "Identity"
    assert dl_doc["file_type"] == "JPEG"
    dl_id = dl_doc["id"]

    # --------------------------------------------------------------------------
    # Step 6: Upload a medical report (Category: Healthcare, PDF)
    # --------------------------------------------------------------------------
    med_bytes = create_dummy_pdf("Annual Health Checkup", "Comprehensive Blood Panel & Lipid Profile: Normal")
    med_resp = client.post(
        "/api/documents/upload",
        headers=headers_a,
        data={
            "document_name": "Comprehensive Medical Report 2026",
            "category_id": healthcare_cat_id,
            "description": "Routine annual diagnostics report",
        },
        files={"file": ("medical_report_2026.pdf", io.BytesIO(med_bytes), "application/pdf")},
    )
    assert med_resp.status_code == 201, med_resp.text
    med_doc = med_resp.json()
    assert med_doc["document_name"] == "Comprehensive Medical Report 2026"
    assert med_doc["category_name"] == "Healthcare"
    assert med_doc["file_type"] == "PDF"
    med_id = med_doc["id"]

    # --------------------------------------------------------------------------
    # Step 7: Verify Categories and Document Scoping
    # --------------------------------------------------------------------------
    list_docs_resp = client.get("/api/documents", headers=headers_a)
    assert list_docs_resp.status_code == 200
    all_user_docs = list_docs_resp.json()
    assert len(all_user_docs) == 4

    # Verify category filtering
    id_docs_resp = client.get(f"/api/documents?category_id={identity_cat_id}", headers=headers_a)
    assert id_docs_resp.status_code == 200
    id_docs = id_docs_resp.json()
    assert len(id_docs) == 3
    assert {d["document_name"] for d in id_docs} == {
        "National Aadhaar Card",
        "Income Tax PAN Card",
        "Motor Vehicle Driving Licence",
    }

    health_docs_resp = client.get(f"/api/documents?category_id={healthcare_cat_id}", headers=headers_a)
    assert health_docs_resp.status_code == 200
    health_docs = health_docs_resp.json()
    assert len(health_docs) == 1
    assert health_docs[0]["document_name"] == "Comprehensive Medical Report 2026"

    # --------------------------------------------------------------------------
    # Step 8: Open a document
    # --------------------------------------------------------------------------
    # Get document metadata
    doc_detail_resp = client.get(f"/api/documents/{aadhaar_id}", headers=headers_a)
    assert doc_detail_resp.status_code == 200
    assert doc_detail_resp.json()["document_name"] == "National Aadhaar Card"

    # View document inline (decrypted in-memory)
    view_doc_resp = client.get(f"/api/documents/{aadhaar_id}/view", headers=headers_a)
    assert view_doc_resp.status_code == 200
    assert view_doc_resp.headers["Content-Type"] == "application/pdf"
    assert "inline" in view_doc_resp.headers["Content-Disposition"]
    assert view_doc_resp.content == aadhaar_bytes

    # --------------------------------------------------------------------------
    # Step 9: Create VIEW_ONLY permission
    # Step 10: Set expiry to a short period (e.g. 1 hour or custom)
    # Step 11: Generate QR
    # --------------------------------------------------------------------------
    share_payload_1 = {
        "document_id": aadhaar_id,
        "recipient_identifier": "Dr. Sarah Jenkins (Cardiology Clinic)",
        "permission_type": "VIEW_ONLY",
        "expiry_hours": 2.0,
    }
    share_resp_1 = client.post("/api/shares", headers=headers_a, json=share_payload_1)
    assert share_resp_1.status_code == 200, share_resp_1.text
    share_data_1 = share_resp_1.json()

    assert share_data_1["permission_type"] == "VIEW_ONLY"
    assert share_data_1["can_view"] is True
    assert share_data_1["can_download"] is False
    assert share_data_1["status"] in ("ACTIVE", PermissionStatus.ACTIVE)
    raw_token_1 = share_data_1["raw_token"]
    perm_id_1 = share_data_1["permission_id"]
    assert raw_token_1 is not None and len(raw_token_1) > 20
    assert share_data_1["access_path"] == f"/shared-access/{raw_token_1}"

    # Verify token security invariant: Database stores ONLY the SHA-256 hash, NOT the raw token
    expected_hash_1 = hash_token(raw_token_1)
    db_token_1 = db_session.scalar(select(AccessToken).where(AccessToken.token_hash == expected_hash_1))
    assert db_token_1 is not None
    assert db_token_1.token_hash == expected_hash_1
    # Verify raw token is nowhere in the token table
    raw_token_in_db = db_session.scalar(select(AccessToken).where(AccessToken.token_hash == raw_token_1))
    assert raw_token_in_db is None

    # --------------------------------------------------------------------------
    # Step 12: Access using the temporary access flow (Public Shared Access)
    # --------------------------------------------------------------------------
    info_resp_1 = client.get(f"/api/shared-access/{raw_token_1}")
    assert info_resp_1.status_code == 200, info_resp_1.text
    shared_info_1 = info_resp_1.json()
    assert shared_info_1["document_name"] == "National Aadhaar Card"
    assert shared_info_1["permission_type"] == "VIEW_ONLY"
    assert shared_info_1["can_view"] is True
    assert shared_info_1["can_download"] is False
    assert shared_info_1["recipient_identifier"] == "Dr. Sarah Jenkins (Cardiology Clinic)"
    assert "QR code provides temporary access" in shared_info_1["security_notice"]

    # Verify recipient verification endpoint
    verify_resp = client.post(
        f"/api/shared-access/{raw_token_1}/verify",
        json={"recipient_identifier": "Dr. Sarah Jenkins"},
    )
    assert verify_resp.status_code == 200
    assert verify_resp.json()["verified"] is True

    # --------------------------------------------------------------------------
    # Step 13: Verify document can be viewed
    # --------------------------------------------------------------------------
    view_shared_resp_1 = client.get(f"/api/shared-access/{raw_token_1}/view")
    assert view_shared_resp_1.status_code == 200
    assert view_shared_resp_1.headers["Content-Type"] == "application/pdf"
    assert "inline" in view_shared_resp_1.headers["Content-Disposition"]
    assert view_shared_resp_1.content == aadhaar_bytes

    # --------------------------------------------------------------------------
    # Step 14: Verify download is unavailable for VIEW_ONLY
    # --------------------------------------------------------------------------
    download_denied_resp = client.get(f"/api/shared-access/{raw_token_1}/download")
    assert download_denied_resp.status_code == 403
    assert "Download permission is not enabled for this view-only share" in download_denied_resp.json()["detail"]

    # --------------------------------------------------------------------------
    # Step 15: Revoke the permission
    # --------------------------------------------------------------------------
    revoke_resp = client.post(f"/api/shares/{perm_id_1}/revoke", headers=headers_a)
    assert revoke_resp.status_code == 200, revoke_resp.text
    assert revoke_resp.json()["status"] in ("REVOKED", PermissionStatus.REVOKED)

    # --------------------------------------------------------------------------
    # Step 16: Verify access is immediately denied after revocation
    # --------------------------------------------------------------------------
    post_revoke_info = client.get(f"/api/shared-access/{raw_token_1}")
    assert post_revoke_info.status_code == 410
    assert "revoked" in post_revoke_info.json()["detail"].lower()

    post_revoke_view = client.get(f"/api/shared-access/{raw_token_1}/view")
    assert post_revoke_view.status_code == 410

    post_revoke_download = client.get(f"/api/shared-access/{raw_token_1}/download")
    assert post_revoke_download.status_code == 410

    # --------------------------------------------------------------------------
    # Step 17: Create VIEW_AND_DOWNLOAD permission
    # --------------------------------------------------------------------------
    share_payload_2 = {
        "document_id": med_id,
        "recipient_identifier": "City Diagnostic Pathology Lab",
        "permission_type": "VIEW_AND_DOWNLOAD",
        "expiry_hours": 12.0,
    }
    share_resp_2 = client.post("/api/shares", headers=headers_a, json=share_payload_2)
    assert share_resp_2.status_code == 200, share_resp_2.text
    share_data_2 = share_resp_2.json()
    assert share_data_2["permission_type"] == "VIEW_AND_DOWNLOAD"
    assert share_data_2["can_view"] is True
    assert share_data_2["can_download"] is True
    raw_token_2 = share_data_2["raw_token"]
    perm_id_2 = share_data_2["permission_id"]

    # --------------------------------------------------------------------------
    # Step 18: Verify authorized download
    # --------------------------------------------------------------------------
    download_allowed_resp = client.get(f"/api/shared-access/{raw_token_2}/download")
    assert download_allowed_resp.status_code == 200
    assert "attachment" in download_allowed_resp.headers["Content-Disposition"]
    assert download_allowed_resp.content == med_bytes

    # Also verify view works for VIEW_AND_DOWNLOAD
    view_allowed_resp = client.get(f"/api/shared-access/{raw_token_2}/view")
    assert view_allowed_resp.status_code == 200
    assert view_allowed_resp.content == med_bytes

    # --------------------------------------------------------------------------
    # Step 19: Verify audit logs
    # --------------------------------------------------------------------------
    audit_resp = client.get("/api/audit/my-history", headers=headers_a)
    assert audit_resp.status_code == 200
    audit_logs = audit_resp.json()
    actions_logged = [log["action"] for log in audit_logs]

    # Must contain all standard actions performed by User A and through User A's shares
    assert "LOGIN" in actions_logged
    assert "DOCUMENT_UPLOADED" in actions_logged
    assert "DOCUMENT_VIEWED" in actions_logged
    assert "SHARE_CREATED" in actions_logged
    assert "SHARE_ACCESSED" in actions_logged
    assert "SHARE_ACCESS_DENIED" in actions_logged  # when download was attempted on view-only
    assert "SHARE_REVOKED" in actions_logged
    assert "DOCUMENT_DOWNLOADED" in actions_logged

    # Verify audit log tamper resistance
    tamper_del = client.delete(f"/api/audit/{audit_logs[0]['id']}", headers=headers_a)
    assert tamper_del.status_code == 403
    assert "append-only" in tamper_del.json()["detail"].lower()

    tamper_put = client.put(f"/api/audit/{audit_logs[0]['id']}", headers=headers_a, json={})
    assert tamper_put.status_code == 403
    assert "immutable" in tamper_put.json()["detail"].lower()

    # --------------------------------------------------------------------------
    # Step 20: Verify notifications
    # --------------------------------------------------------------------------
    notif_resp = client.get("/api/notifications", headers=headers_a)
    assert notif_resp.status_code == 200
    notifications = notif_resp.json()
    assert len(notifications) > 0
    notif_titles = [n["title"] for n in notifications]
    assert any("Upload" in t for t in notif_titles)
    assert any("Share" in t for t in notif_titles)
    assert any("Revoke" in t or "Revoked" in t for t in notif_titles)

    # Verify marking notification as read
    notif_id = notifications[0]["id"]
    read_resp = client.post(f"/api/notifications/{notif_id}/read", headers=headers_a)
    assert read_resp.status_code == 200
    assert read_resp.json()["is_read"] is True

    # --------------------------------------------------------------------------
    # Step 21: Test expiry
    # --------------------------------------------------------------------------
    # Create permission with short expiry (0.0001 hours ~ 0.36 seconds)
    share_payload_3 = {
        "document_id": pan_id,
        "recipient_identifier": "Expiry Test Clinic",
        "permission_type": "VIEW_ONLY",
        "expiry_hours": 0.0001,
    }
    share_resp_3 = client.post("/api/shares", headers=headers_a, json=share_payload_3)
    assert share_resp_3.status_code == 200
    raw_token_3 = share_resp_3.json()["raw_token"]
    perm_id_3 = share_resp_3.json()["permission_id"]

    # Sleep 1 second so time surpasses expires_at
    time.sleep(1.0)

    # Access after expiry: should return 410 GONE
    expired_info_resp = client.get(f"/api/shared-access/{raw_token_3}")
    assert expired_info_resp.status_code == 410
    assert "expired" in expired_info_resp.json()["detail"].lower()

    expired_view_resp = client.get(f"/api/shared-access/{raw_token_3}/view")
    assert expired_view_resp.status_code == 410

    expired_dl_resp = client.get(f"/api/shared-access/{raw_token_3}/download")
    assert expired_dl_resp.status_code == 410

    # Maintenance cleanup trigger
    cleanup_resp = client.post("/api/shares/maintenance/cleanup", headers=headers_a)
    assert cleanup_resp.status_code == 200
    assert cleanup_resp.json()["message"] == "Permission cleanup completed successfully."

    # --------------------------------------------------------------------------
    # Step 22: Attempt unauthorized access using another account (User B)
    # Step 23: Verify unauthorized access is denied
    # --------------------------------------------------------------------------
    reg_b_payload = {
        "full_name": "Bob Attacker",
        "email": "bob.attacker@example.com",
        "phone": "+91 91111 22222",
        "password": "Password123!",
        "confirm_password": "Password123!",
    }
    reg_b = client.post("/api/auth/register", json=reg_b_payload)
    assert reg_b.status_code == 201

    login_b = client.post(
        "/api/auth/login",
        json={"email": "bob.attacker@example.com", "password": "Password123!"},
    )
    assert login_b.status_code == 200
    token_b = login_b.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # User B list documents: Must ONLY return User B's documents (empty right now)
    b_docs_resp = client.get("/api/documents", headers=headers_b)
    assert b_docs_resp.status_code == 200
    assert len(b_docs_resp.json()) == 0

    # User B attempts to access User A's document metadata -> 403 Forbidden
    b_get_doc = client.get(f"/api/documents/{aadhaar_id}", headers=headers_b)
    assert b_get_doc.status_code == 403
    assert "Access denied" in b_get_doc.json()["detail"]

    # User B attempts to view User A's document inline -> 403 Forbidden
    b_view_doc = client.get(f"/api/documents/{aadhaar_id}/view", headers=headers_b)
    assert b_view_doc.status_code == 403

    # User B attempts to download User A's document -> 403 Forbidden
    b_dl_doc = client.get(f"/api/documents/{aadhaar_id}/download", headers=headers_b)
    assert b_dl_doc.status_code == 403

    # User B attempts to delete User A's document -> 403 Forbidden
    b_del_doc = client.delete(f"/api/documents/{aadhaar_id}", headers=headers_b)
    assert b_del_doc.status_code == 403

    # User B attempts to create a share grant on User A's document -> 403 Forbidden
    b_share_doc = client.post(
        "/api/shares",
        headers=headers_b,
        json={
            "document_id": aadhaar_id,
            "recipient_identifier": "Illicit Recipient",
            "permission_type": "VIEW_ONLY",
            "expiry_hours": 1.0,
        },
    )
    assert b_share_doc.status_code == 403
    assert "You can only share documents you own" in b_share_doc.json()["detail"]

    # User B attempts to revoke User A's share permission -> 403 Forbidden
    b_revoke = client.post(f"/api/shares/{perm_id_2}/revoke", headers=headers_b)
    assert b_revoke.status_code == 403
    assert "You can only revoke sharing permissions you created" in b_revoke.json()["detail"]

    # User B attempts to read User A's notifications -> 403 Forbidden / Not found
    b_read_notif = client.post(f"/api/notifications/{notif_id}/read", headers=headers_b)
    assert b_read_notif.status_code == 403

    # User B audit history must not leak User A's records
    b_audit_resp = client.get("/api/audit/my-history", headers=headers_b)
    assert b_audit_resp.status_code == 200
    b_audit_logs = b_audit_resp.json()
    for log in b_audit_logs:
        assert log["user_id"] != user_a_data["id"]
        assert log["document_id"] not in (aadhaar_id, pan_id, dl_id, med_id)


# ==============================================================================
# Edge Cases & Negative Security Tests
# ==============================================================================
def test_edge_cases_and_negative_security(client, db_session):
    """Thoroughly tests all negative security cases:
    - Invalid login
    - Duplicate registration
    - Invalid file type
    - Oversized file
    - Expired token
    - Revoked token
    - Invalid token
    - Missing document
    - Unauthorized document ID
    - Unauthorized permission ID
    """

    # 1. Invalid login (wrong password)
    inv_login_1 = client.post(
        "/api/auth/login",
        json={"email": "nobody@example.com", "password": "WrongPassword123!"},
    )
    assert inv_login_1.status_code == 401
    assert "Invalid email or password" in inv_login_1.json()["detail"]

    # 2. Duplicate registration
    user_payload = {
        "full_name": "Test User",
        "email": "unique.user@example.com",
        "phone": "+91 99999 88888",
        "password": "Password123!",
        "confirm_password": "Password123!",
    }
    r1 = client.post("/api/auth/register", json=user_payload)
    assert r1.status_code == 201

    r2 = client.post("/api/auth/register", json=user_payload)
    assert r2.status_code == 400
    assert "already registered" in r2.json()["detail"].lower()

    # Login to get valid auth headers
    login_r = client.post(
        "/api/auth/login",
        json={"email": "unique.user@example.com", "password": "Password123!"},
    )
    assert login_r.status_code == 200
    headers = {"Authorization": f"Bearer {login_r.json()['access_token']}"}

    # 3. Invalid file type (disallowed extension .exe, .sh, .txt)
    txt_upload = client.post(
        "/api/documents/upload",
        headers=headers,
        data={"document_name": "Script File", "category_id": 1},
        files={"file": ("malicious.exe", b"MZ\x90\x00executable", "application/octet-stream")},
    )
    assert txt_upload.status_code == 400
    assert "Unsupported file extension" in txt_upload.json()["detail"]

    # Invalid file content (extension says .pdf but magic bytes are plain text)
    spoofed_pdf = client.post(
        "/api/documents/upload",
        headers=headers,
        data={"document_name": "Spoofed Document", "category_id": 1},
        files={"file": ("fake.pdf", b"This is not a real PDF file header.", "application/pdf")},
    )
    assert spoofed_pdf.status_code == 400
    assert "File content does not match the claimed file type signature" in spoofed_pdf.json()["detail"]

    # 4. Oversized file (exceeds 10MB limit)
    ten_mb_plus = b"%PDF-1.4\n" + (b"0" * (10 * 1024 * 1024 + 1024))
    oversized_upload = client.post(
        "/api/documents/upload",
        headers=headers,
        data={"document_name": "Giant File", "category_id": 1},
        files={"file": ("giant.pdf", io.BytesIO(ten_mb_plus), "application/pdf")},
    )
    assert oversized_upload.status_code == 413
    assert "exceeds the maximum allowed size of 10 MB" in oversized_upload.json()["detail"]

    # 5. Invalid token (non-existent token lookup)
    bogus_token_info = client.get("/api/shared-access/bogus_invalid_token_99999")
    assert bogus_token_info.status_code == 404
    assert "Invalid or unrecognized" in bogus_token_info.json()["detail"]

    bogus_token_view = client.get("/api/shared-access/bogus_invalid_token_99999/view")
    assert bogus_token_view.status_code == 404

    bogus_token_dl = client.get("/api/shared-access/bogus_invalid_token_99999/download")
    assert bogus_token_dl.status_code == 404

    # 6. Missing document (non-existent document IDs)
    missing_doc = client.get("/api/documents/999999", headers=headers)
    assert missing_doc.status_code == 404
    assert "Document not found" in missing_doc.json()["detail"]

    missing_view = client.get("/api/documents/999999/view", headers=headers)
    assert missing_view.status_code == 404

    missing_dl = client.get("/api/documents/999999/download", headers=headers)
    assert missing_dl.status_code == 404

    missing_del = client.delete("/api/documents/999999", headers=headers)
    assert missing_del.status_code == 404

    missing_share = client.post(
        "/api/shares",
        headers=headers,
        json={
            "document_id": 999999,
            "recipient_identifier": "Any Clinic",
            "permission_type": "VIEW_ONLY",
            "expiry_hours": 1.0,
        },
    )
    assert missing_share.status_code == 404

    # 7. Missing permission ID when revoking
    missing_revoke = client.post("/api/shares/999999/revoke", headers=headers)
    assert missing_revoke.status_code == 404
    assert "Share grant not found" in missing_revoke.json()["detail"]

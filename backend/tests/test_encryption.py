import io
import os
from pathlib import Path
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
from app.services.storage_service import (
    decrypt_file,
    encrypt_file,
    secure_temp_decrypted_file,
    securely_delete_file,
    securely_store_file,
)


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
    owner = User(
        full_name="Alice Owner",
        email="alice@example.com",
        password_hash=hash_password("Pass123!"),
    )
    attacker = User(
        full_name="Bob Attacker",
        email="bob@example.com",
        password_hash=hash_password("Pass123!"),
    )
    session.add_all([owner, attacker])
    session.commit()
    return owner, attacker


SECRET_DOCUMENT_CONTENT = b"%PDF-1.4\nCONFIDENTIAL MEDICAL LAB REPORT\nHbA1c: 5.6%\n%%EOF"


def test_unit_encrypt_and_decrypt_file_aes_gcm():
    """Test encrypt_file and decrypt_file core cryptographic functions."""
    payload, meta = encrypt_file(SECRET_DOCUMENT_CONTENT)

    assert meta["algorithm"] == "AES-256-GCM"
    assert meta["key_bits"] == 256
    assert meta["nonce_length_bytes"] == 12
    assert meta["tag_length_bytes"] == 16

    # Ciphertext must not match plaintext
    assert payload != SECRET_DOCUMENT_CONTENT
    assert SECRET_DOCUMENT_CONTENT not in payload

    # Decryption recovers exact plaintext
    decrypted = decrypt_file(payload)
    assert decrypted == SECRET_DOCUMENT_CONTENT


def test_unit_tampered_ciphertext_fails_integrity_check():
    """Tampering with a single bit in the ciphertext or tag must cause decryption to fail."""
    payload, _ = encrypt_file(SECRET_DOCUMENT_CONTENT)

    # Corrupt a byte in the ciphertext portion
    tampered = bytearray(payload)
    tampered[15] ^= 0xFF  # flip bits in the ciphertext

    with pytest.raises(Exception):
        decrypt_file(bytes(tampered))


def test_unit_secure_store_and_delete_file():
    """Test securely_store_file and securely_delete_file lifecycle."""
    stored_name, file_path, meta = securely_store_file(SECRET_DOCUMENT_CONTENT, "test.pdf")

    assert os.path.exists(file_path)
    assert stored_name != "test.pdf"
    assert stored_name.endswith(".enc")

    # Confirm contents on disk are encrypted
    with open(file_path, "rb") as f:
        disk_bytes = f.read()
    assert disk_bytes != SECRET_DOCUMENT_CONTENT

    # Secure deletion
    deleted = securely_delete_file(file_path)
    assert deleted is True
    assert not os.path.exists(file_path)


def test_unit_secure_temp_decrypted_file_cleans_up():
    """Test secure_temp_decrypted_file context manager automatically shreds and removes temp files."""
    _, file_path, _ = securely_store_file(SECRET_DOCUMENT_CONTENT, "test.pdf")

    temp_path_holder = None
    with secure_temp_decrypted_file(file_path) as temp_path:
        temp_path_holder = temp_path
        assert temp_path.exists()
        with open(temp_path, "rb") as f:
            assert f.read() == SECRET_DOCUMENT_CONTENT

    # After exiting context, temp file must be unlinked
    assert not temp_path_holder.exists()

    securely_delete_file(file_path)


def test_e2e_document_encryption_and_access_control(client, session, users):
    """End-to-End Test:

    1. Upload a document.
    2. Confirm the stored file on disk is encrypted/unreadable as plaintext.
    3. Authorized owner can retrieve and decrypt it.
    4. Unauthorized user cannot retrieve it.
    """
    owner, attacker = users
    owner_token = create_access_token(subject=owner.id)
    attacker_token = create_access_token(subject=attacker.id)

    cat = session.query(Category).filter_by(name="Healthcare").first()

    # 1. Upload a document
    upload_res = client.post(
        "/api/documents/upload",
        headers={"Authorization": f"Bearer {owner_token}"},
        data={
            "document_name": "Blood Report Q3",
            "category_id": cat.id,
            "description": "Sensitive blood test lab report",
        },
        files={"file": ("lab_report.pdf", io.BytesIO(SECRET_DOCUMENT_CONTENT), "application/pdf")},
    )
    assert upload_res.status_code == 201
    doc_id = upload_res.json()["id"]

    # 2. Confirm the stored file on disk is encrypted / unreadable as plaintext
    db_doc = session.query(Document).filter_by(id=doc_id).first()
    assert db_doc is not None
    assert os.path.exists(db_doc.file_path)

    # Read physical file on disk directly
    with open(db_doc.file_path, "rb") as f:
        raw_disk_data = f.read()

    assert raw_disk_data != SECRET_DOCUMENT_CONTENT
    assert b"CONFIDENTIAL MEDICAL LAB REPORT" not in raw_disk_data
    assert b"HbA1c" not in raw_disk_data

    # 3. Authorized owner can retrieve decrypted document via download & view
    download_res = client.get(
        f"/api/documents/{doc_id}/download",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert download_res.status_code == 200
    assert download_res.content == SECRET_DOCUMENT_CONTENT

    view_res = client.get(
        f"/api/documents/{doc_id}/view",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert view_res.status_code == 200
    assert view_res.content == SECRET_DOCUMENT_CONTENT

    # 4. Unauthorized user CANNOT retrieve it (403 Forbidden)
    attacker_download_res = client.get(
        f"/api/documents/{doc_id}/download",
        headers={"Authorization": f"Bearer {attacker_token}"},
    )
    assert attacker_download_res.status_code == 403
    assert "access denied" in attacker_download_res.json()["detail"].lower()

    attacker_view_res = client.get(
        f"/api/documents/{doc_id}/view",
        headers={"Authorization": f"Bearer {attacker_token}"},
    )
    assert attacker_view_res.status_code == 403

    # Clean up test artifact
    securely_delete_file(db_doc.file_path)

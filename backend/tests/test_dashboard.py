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
from app.models.enums import AuditAction, AuditResult, PermissionStatus, PermissionType
from app.models.permission import Permission
from app.models.user import User
from app.security.jwt import create_access_token
from app.security.passwords import hash_password
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


def test_dashboard_summary_unauthorized(client):
    res = client.get("/api/dashboard/summary")
    assert res.status_code == 401


def test_dashboard_summary_empty_state_for_new_user(client, session):
    user = User(
        full_name="Priya Patel",
        email="priya@example.com",
        password_hash=hash_password("Password123!"),
    )
    session.add(user)
    session.commit()

    token = create_access_token(subject=user.id)

    res = client.get(
        "/api/dashboard/summary",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()

    # Check real zero stats
    assert data["stats"]["total_documents"] == 0
    assert data["stats"]["active_shares"] == 0
    assert data["stats"]["expiring_soon"] == 0
    assert data["stats"]["recent_access"] == 0

    # Check all 7 categories exist
    assert len(data["categories"]) == 7
    for cat in data["categories"]:
        assert cat["document_count"] == 0

    # Recent activity is empty list
    assert data["recent_activity"] == []
    assert data["unread_notifications"] == 0


def test_dashboard_summary_with_real_data(client, session):
    user = User(
        full_name="Vikram Singh",
        email="vikram@example.com",
        password_hash=hash_password("Password123!"),
    )
    session.add(user)
    session.commit()

    # Add a document in Identity category
    cat_identity = session.query(Category).filter_by(name="Identity").first()
    doc = Document(
        owner_id=user.id,
        category_id=cat_identity.id,
        document_name="Aadhaar Card",
        original_filename="aadhaar.pdf",
        stored_filename="enc_aadhaar_123.bin",
        file_path="/storage/enc_aadhaar_123.bin",
        mime_type="application/pdf",
        file_size=2048,
        encryption_metadata={"alg": "Fernet"},
    )
    session.add(doc)
    session.commit()

    # Add an active permission
    from datetime import timedelta
    perm = Permission(
        document_id=doc.id,
        owner_id=user.id,
        recipient_identifier="hospital@care.org",
        permission_type=PermissionType.VIEW_ONLY,
        can_view=True,
        can_download=False,
        expires_at=utc_now() + timedelta(hours=12),  # within 48h expiring soon
        status=PermissionStatus.ACTIVE,
    )
    session.add(perm)
    session.commit()

    # Authenticate and query summary
    token = create_access_token(subject=user.id)
    res = client.get(
        "/api/dashboard/summary",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()

    assert data["stats"]["total_documents"] == 1
    assert data["stats"]["active_shares"] == 1
    assert data["stats"]["expiring_soon"] == 1

    # Check Identity category count is 1
    id_cat = next(c for c in data["categories"] if c["name"] == "Identity")
    assert id_cat["document_count"] == 1

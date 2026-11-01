from datetime import timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.database import Base, get_db
from app.main import app
from app.models.user import User
from app.security.jwt import create_access_token
from app.security.passwords import hash_password, verify_password


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


VALID_REGISTRATION_DATA = {
    "full_name": "Aarav Sharma",
    "email": "aarav.sharma@example.com",
    "phone": "+91 98765 43210",
    "password": "StrongPassword123!",
    "confirm_password": "StrongPassword123!",
}


def test_password_hashing_and_verification():
    raw = "MySecretPass!2026"
    hashed = hash_password(raw)
    assert hashed != raw
    assert verify_password(raw, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False


def test_register_user_success(client, session):
    res = client.post("/api/auth/register", json=VALID_REGISTRATION_DATA)
    assert res.status_code == 201
    data = res.json()
    assert data["id"] is not None
    assert data["full_name"] == "Aarav Sharma"
    assert data["email"] == "aarav.sharma@example.com"
    assert data["phone"] == "+91 98765 43210"
    assert data["is_active"] is True
    # Crucial security check: password hash must NEVER be returned in response!
    assert "password" not in data
    assert "password_hash" not in data

    # Verify user in database
    db_user = session.query(User).filter_by(email="aarav.sharma@example.com").first()
    assert db_user is not None
    assert db_user.password_hash != "StrongPassword123!"
    assert verify_password("StrongPassword123!", db_user.password_hash) is True


def test_register_duplicate_email_fails(client):
    res1 = client.post("/api/auth/register", json=VALID_REGISTRATION_DATA)
    assert res1.status_code == 201

    res2 = client.post("/api/auth/register", json=VALID_REGISTRATION_DATA)
    assert res2.status_code == 400
    assert "already registered" in res2.json()["detail"].lower()


def test_register_password_mismatch(client):
    payload = {
        **VALID_REGISTRATION_DATA,
        "email": "mismatch@example.com",
        "confirm_password": "DifferentPassword123!",
    }
    res = client.post("/api/auth/register", json=payload)
    assert res.status_code == 422
    assert "passwords do not match" in res.text.lower()


@pytest.mark.parametrize(
    "weak_pass,expected_error",
    [
        ("Short1!", "at least 8 characters"),
        ("lowercaseonly123!", "uppercase letter"),
        ("UPPERCASEONLY123!", "lowercase letter"),
        ("NoDigitsHere!abc", "digit"),
        ("NoSpecialChar123", "special character"),
    ],
)
def test_register_password_strength_validation(client, weak_pass, expected_error):
    payload = {
        **VALID_REGISTRATION_DATA,
        "email": f"test_{weak_pass[:4]}@example.com",
        "password": weak_pass,
        "confirm_password": weak_pass,
    }
    res = client.post("/api/auth/register", json=payload)
    assert res.status_code == 422
    assert expected_error.lower() in res.text.lower()


def test_register_invalid_email(client):
    payload = {
        **VALID_REGISTRATION_DATA,
        "email": "not-an-email",
    }
    res = client.post("/api/auth/register", json=payload)
    assert res.status_code == 422


def test_login_success(client):
    client.post("/api/auth/register", json=VALID_REGISTRATION_DATA)

    res = client.post(
        "/api/auth/login",
        json={
            "email": "aarav.sharma@example.com",
            "password": "StrongPassword123!",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "aarav.sharma@example.com"
    assert "password_hash" not in data["user"]


def test_login_invalid_password(client):
    client.post("/api/auth/register", json=VALID_REGISTRATION_DATA)

    res = client.post(
        "/api/auth/login",
        json={
            "email": "aarav.sharma@example.com",
            "password": "WrongPassword999!",
        },
    )
    assert res.status_code == 401
    assert "invalid email or password" in res.json()["detail"].lower()


def test_login_nonexistent_email(client):
    res = client.post(
        "/api/auth/login",
        json={
            "email": "unknown@example.com",
            "password": "StrongPassword123!",
        },
    )
    assert res.status_code == 401


def test_login_deactivated_account(client, session):
    res_reg = client.post("/api/auth/register", json=VALID_REGISTRATION_DATA)
    user_id = res_reg.json()["id"]

    db_user = session.get(User, user_id)
    db_user.is_active = False
    session.commit()

    res = client.post(
        "/api/auth/login",
        json={
            "email": "aarav.sharma@example.com",
            "password": "StrongPassword123!",
        },
    )
    assert res.status_code == 403
    assert "deactivated" in res.json()["detail"].lower()


def test_get_current_user_me_endpoint(client):
    client.post("/api/auth/register", json=VALID_REGISTRATION_DATA)

    login_res = client.post(
        "/api/auth/login",
        json={
            "email": "aarav.sharma@example.com",
            "password": "StrongPassword123!",
        },
    )
    token = login_res.json()["access_token"]

    # 1. Protected route with valid token
    me_res = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert me_data["email"] == "aarav.sharma@example.com"
    assert me_data["full_name"] == "Aarav Sharma"
    assert "password_hash" not in me_data

    # 2. Protected route without token
    unauth_res = client.get("/api/auth/me")
    assert unauth_res.status_code == 401

    # 3. Protected route with invalid token
    invalid_res = client.get(
        "/api/auth/me",
        headers={"Authorization": "Bearer fake.invalid.token"},
    )
    assert invalid_res.status_code == 401


def test_get_current_user_expired_token(client):
    reg_res = client.post("/api/auth/register", json=VALID_REGISTRATION_DATA)
    user_id = reg_res.json()["id"]

    expired_token = create_access_token(
        subject=user_id,
        expires_delta=timedelta(seconds=-10),  # expired 10 seconds ago
    )

    res = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert res.status_code == 401
    assert "expired" in res.json()["detail"].lower()


def test_logout_endpoint(client):
    res = client.post("/api/auth/logout")
    assert res.status_code == 200
    assert "logged out" in res.json()["message"].lower()

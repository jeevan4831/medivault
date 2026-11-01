import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.database import Base, get_db
from app.init_db import DEFAULT_CATEGORIES, seed_categories
from app.main import app
from app.models import Category, User


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


def test_health_endpoint(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["app"]


def test_database_health_endpoint(client):
    r = client.get("/api/health/db")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_all_tables_created(engine):
    tables = set(inspect(engine).get_table_names())
    assert {
        "users", "document_categories", "documents", "permissions",
        "access_tokens", "audit_logs", "notifications",
    } <= tables


def test_seed_categories_is_idempotent(session):
    assert seed_categories(session) == len(DEFAULT_CATEGORIES) == 7
    assert seed_categories(session) == 0
    names = set(session.scalars(select(Category.name)))
    assert {"Identity", "Healthcare", "Education", "Vehicle",
            "Insurance", "Employment", "Other"} == names


def test_email_must_be_unique(session):
    session.add(User(full_name="A", email="a@example.com", password_hash="x"))
    session.commit()
    session.add(User(full_name="B", email="a@example.com", password_hash="y"))
    with pytest.raises(IntegrityError):
        session.commit()


def test_required_indexes_exist(engine):
    insp = inspect(engine)

    def indexed(table):
        cols = set()
        for ix in insp.get_indexes(table):
            cols.update(ix["column_names"])
        for uq in insp.get_unique_constraints(table):
            cols.update(uq["column_names"])
        return cols

    assert "email" in indexed("users")
    assert "owner_id" in indexed("documents")
    assert {"document_id", "expires_at"} <= indexed("permissions")
    assert "token_hash" in indexed("access_tokens")
    assert "permission_id" in indexed("access_tokens")

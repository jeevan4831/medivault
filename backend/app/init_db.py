"""Database initialisation: creates tables, seeds categories, prepares storage.

Run from the backend/ folder:  python -m app.init_db
Safe to run repeatedly (idempotent).
"""
from sqlalchemy import select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

import app.models  # noqa: F401  (registers all models)
from app.config import get_settings
from app.database import Base, SessionLocal, engine
from app.models import Category

DEFAULT_CATEGORIES: list[tuple[str, str]] = [
    ("Identity", "Aadhaar, PAN, driving licence, passport"),
    ("Healthcare", "Medical reports, prescriptions, health insurance"),
    ("Education", "Marks cards, degree and other certificates"),
    ("Vehicle", "Vehicle RC, vehicle insurance, PUC"),
    ("Insurance", "Insurance policies and related documents"),
    ("Employment", "Employment and experience documents"),
    ("Other", "Any other personal document"),
]


def create_tables(bind: Engine = engine) -> None:
    Base.metadata.create_all(bind)


def seed_categories(session: Session) -> int:
    """Insert missing default categories. Returns how many were added."""
    existing = set(session.scalars(select(Category.name)))
    added = 0
    for name, description in DEFAULT_CATEGORIES:
        if name not in existing:
            session.add(Category(name=name, description=description))
            added += 1
    session.commit()
    return added


def seed_demo_user(session: Session) -> None:
    """Ensure standard demo account exists with valid bcrypt password."""
    from app.models.user import User
    from app.security.passwords import hash_password, verify_password

    user = session.scalar(select(User).where(User.email == "dr.smith@medivault.com"))
    if user is None:
        user = User(
            full_name="Dr. John Smith",
            email="dr.smith@medivault.com",
            phone="+91 98765 43210",
            password_hash=hash_password("Password123!"),
            is_active=True,
        )
        session.add(user)
        session.commit()
    elif not verify_password("Password123!", user.password_hash):
        user.password_hash = hash_password("Password123!")
        user.is_active = True
        session.commit()


def ensure_storage_dir() -> None:
    from pathlib import Path
    Path(get_settings().storage_dir).mkdir(parents=True, exist_ok=True)


def init_db() -> None:
    ensure_storage_dir()
    create_tables()
    with SessionLocal() as session:
        added = seed_categories(session)
        seed_demo_user(session)
    print(f"Tables ready. Categories added: {added}")


if __name__ == "__main__":
    init_db()

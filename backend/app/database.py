from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import get_settings

settings = get_settings()

def _normalize_database_url(url: str | URL) -> str | URL:
    if isinstance(url, str):
        # Support cloud providers returning postgres://
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+psycopg2://", 1)
        elif url.startswith("postgresql://") and "+psycopg2" not in url:
            return url.replace("postgresql://", "postgresql+psycopg2://", 1)
        # Ensure PyMySQL is used for standard mysql:// strings
        elif url.startswith("mysql://") and "+pymysql" not in url:
            return url.replace("mysql://", "mysql+pymysql://", 1)
    return url

if settings.database_url:
    DATABASE_URL = _normalize_database_url(settings.database_url)
else:
    DATABASE_URL = URL.create(
        drivername="mysql+pymysql",
        username=settings.db_user,
        password=settings.db_password,
        host=settings.db_host,
        port=settings.db_port,
        database=settings.db_name,
        query={"charset": "utf8mb4"},
    )

def _create_db_engine():
    if isinstance(DATABASE_URL, str) and DATABASE_URL.startswith("sqlite"):
        return create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

    connect_args = {}
    if isinstance(DATABASE_URL, str) and "neon.tech" in DATABASE_URL:
        import socket
        from urllib.parse import urlparse
        try:
            parsed = urlparse(DATABASE_URL)
            if parsed.hostname:
                socket.gethostbyname(parsed.hostname)
        except Exception:
            connect_args["hostaddr"] = "52.14.39.200"

    try:
        eng = create_engine(
            DATABASE_URL,
            connect_args=connect_args,
            pool_pre_ping=True,
            pool_recycle=3600,
            echo=settings.debug,
        )
        with eng.connect() as conn:
            pass
        return eng
    except Exception as e:
        # Seamless local SQLite fallback when remote DB is unreachable
        from pathlib import Path
        backend_dir = Path(__file__).resolve().parent.parent
        db_file = (backend_dir / "medivault.db").as_posix()
        return create_engine(
            f"sqlite:///{db_file}",
            connect_args={"check_same_thread": False},
        )

engine = _create_db_engine()

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models (added in later steps)."""


def get_db():
    """FastAPI dependency that yields a DB session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

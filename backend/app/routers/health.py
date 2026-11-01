from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.schemas.health import DatabaseHealthResponse, HealthResponse

router = APIRouter(prefix="/api/health", tags=["Health"])


@router.get("", response_model=HealthResponse)
def health_check() -> HealthResponse:
    """Confirms the API process is running."""
    s = get_settings()
    return HealthResponse(
        status="ok",
        app=s.app_name,
        version=s.app_version,
        environment=s.app_env,
        timestamp=datetime.now(timezone.utc),
    )


@router.get("/db", response_model=DatabaseHealthResponse)
def database_health_check(db: Session = Depends(get_db)) -> DatabaseHealthResponse:
    """Runs real queries against MySQL to confirm the connection works."""
    try:
        dialect_name = db.bind.dialect.name if db.bind else ""
        if dialect_name == "sqlite":
            db.execute(text("SELECT 1"))
            db_name = "sqlite_in_memory"
            import sqlite3
            version = sqlite3.sqlite_version
        else:
            db_name = db.execute(text("SELECT DATABASE()")).scalar()
            version = db.execute(text("SELECT VERSION()")).scalar()
    except SQLAlchemyError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection failed. Check MySQL and your .env settings.",
        )
    return DatabaseHealthResponse(
        status="ok", database=str(db_name), server_version=str(version)
    )


def get_lan_ip() -> str:
    """Detect the local Wi-Fi or LAN IPv4 address of this machine."""
    import socket

    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


@router.get("/network", summary="Get local LAN IP for mobile QR code access")
def get_network_info():
    """Returns local LAN IP so QR codes can be resolved on mobile devices on the same Wi-Fi."""
    lan_ip = get_lan_ip()
    return {
        "lan_ip": lan_ip,
        "frontend_port": 5173,
        "backend_port": 8000,
    }

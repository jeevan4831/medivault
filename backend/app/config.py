from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


from pathlib import Path

_backend_dir = Path(__file__).resolve().parent.parent
_project_root = _backend_dir.parent
_storage_dir = _project_root / "storage"

_candidate_env_files = [
    _backend_dir / ".env",
    _backend_dir / ".env.local",
    _project_root / ".env",
    _project_root / ".env.local",
]
_existing_env_files = [str(f) for f in _candidate_env_files if f.exists()]


class Settings(BaseSettings):
    """Application settings loaded from environment variables / .env file."""

    app_name: str = "MediVault API"
    app_env: str = "development"
    app_version: str = "0.1.0"
    debug: bool = False

    db_host: str = "localhost"
    db_port: int = 3306
    db_user: str = "medivault_user"
    db_password: str = "change_me"
    db_name: str = "medivault"
    database_url: str | None = None

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000"

    storage_dir: str = str(_storage_dir.as_posix())
    storage_encryption_key: str = ""

    jwt_secret_key: str = "dev-secret-key-change-in-production-1234567890"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    permission_cleanup_interval_seconds: int = 60
    enable_permission_cleanup_task: bool = True

    model_config = SettingsConfigDict(
        env_file=_existing_env_files if _existing_env_files else ".env",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        if self.app_env.lower() == "production":
            if self.debug:
                raise ValueError(
                    "Security violation: Debug mode cannot be enabled in production environment."
                )
            if self.jwt_secret_key == "dev-secret-key-change-in-production-1234567890":
                raise ValueError(
                    "Security violation: Default JWT secret key must be replaced in production."
                )
            if len(self.jwt_secret_key) < 32:
                raise ValueError(
                    "Security violation: JWT secret key must be at least 32 characters long in production."
                )
            if not self.storage_encryption_key:
                raise ValueError(
                    "Security violation: STORAGE_ENCRYPTION_KEY must be configured in production."
                )
            if "*" in self.cors_origins:
                raise ValueError(
                    "Security violation: Wildcard CORS origin is forbidden in production."
                )
            if self.db_password == "change_me" and not self.database_url:
                raise ValueError(
                    "Security violation: Default database password 'change_me' must be changed in production."
                )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import audit, auth, dashboard, documents, health, notifications, shared_access, shares
from app.services.maintenance_service import PermissionExpirationWorker

settings = get_settings()

worker: PermissionExpirationWorker | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global worker
    # Ensure database tables, categories, and default demo user are ready on startup
    if settings.app_env != "testing":
        try:
            from app.init_db import init_db
            init_db()
        except Exception as e:
            print(f"Startup DB init warning: {e}")

    # Start background cleanup maintenance worker in non-testing environments
    if settings.app_env != "testing" and settings.enable_permission_cleanup_task:
        worker = PermissionExpirationWorker(
            interval_seconds=settings.permission_cleanup_interval_seconds
        )
        await worker.start()
    yield
    if worker:
        await worker.stop()
        worker = None


docs_url = "/docs" if (settings.app_env != "production" or settings.debug) else None
redoc_url = "/redoc" if (settings.app_env != "production" or settings.debug) else None
openapi_url = "/openapi.json" if (settings.app_env != "production" or settings.debug) else None

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Secure, consent-based personal document management and sharing.",
    docs_url=docs_url,
    redoc_url=redoc_url,
    openapi_url=openapi_url,
    lifespan=lifespan,
)

@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|.*\.vercel\.app|.*\.onrender\.com)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(documents.router)
app.include_router(shares.router)
app.include_router(shared_access.router)
app.include_router(audit.router)
app.include_router(notifications.router)


@app.get("/", include_in_schema=False)
def root():
    return {"message": "MediVault API is running. See /docs for the API reference."}

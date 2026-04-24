"""FastAPI entrypoint."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as v1_router
from app.api.admin import router as admin_router
from fastapi.staticfiles import StaticFiles
from app.core.config import get_settings
from app.core.container import build_container
from app.core.logging import configure_logging
from app.middleware.auth_middleware import AuthMiddleware
from app.middleware.logging_middleware import LoggingMiddleware
from app.middleware.rate_limit_middleware import RateLimitMiddleware

settings = get_settings()
configure_logging(settings=settings)
container = build_container(settings=settings)

app = FastAPI(title=settings.app_name, debug=settings.server.debug)
app.state.container = container

app.add_middleware(LoggingMiddleware)
app.add_middleware(AuthMiddleware, settings=settings, key_service=container.key_service)
app.add_middleware(RateLimitMiddleware, settings=settings)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.server.cors_origins,
    allow_origin_regex=settings.server.cors_origin_regex,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router)
app.include_router(admin_router)

# Ensure static folder exists (use absolute path)
import os
from pathlib import Path as _Path
_static_dir = _Path(__file__).resolve().parent / "static"
_static_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(_static_dir)), name="static")
_admin_assets_dir = _Path(__file__).resolve().parents[1] / "admin-ui" / "dist" / "assets"
if _admin_assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(_admin_assets_dir)), name="admin_assets")


@app.get("/health")
async def health() -> dict[str, str]:
    """Health probe endpoint."""

    return {"status": "ok"}


@app.on_event("startup")
async def startup() -> None:
    """Start async workers."""

    await container.solver_service.start()
    if container.settings.retrain.worker_enabled:
        await container.retrain_service.start()


@app.on_event("shutdown")
async def shutdown() -> None:
    """Stop async workers."""

    await container.solver_service.stop()
    if container.settings.retrain.worker_enabled:
        await container.retrain_service.stop()

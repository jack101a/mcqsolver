"""Dependency container for app services."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.core.config import Settings
from app.core.database import Database
from app.services.cache_service import CacheService
from app.services.key_service import KeyService
from app.services.model_router import ModelRouter
from app.services.retrain_service import RetrainService
from app.services.solver_service import SolverService
from app.services.usage_service import UsageService


@dataclass
class Container:
    """Holds initialized app services."""

    settings: Settings
    db: Database
    key_service: KeyService
    usage_service: UsageService
    solver_service: SolverService
    retrain_service: RetrainService


def build_container(settings: Settings) -> Container:
    """Initialize and return dependency container."""

    db = Database(settings=settings)
    db.init()
    model_router = ModelRouter(settings=settings, db=db)
    cache = CacheService(ttl_seconds=settings.queue.cache_ttl_seconds)
    solver = SolverService(
        workers=settings.queue.workers,
        max_pending_jobs=settings.queue.max_pending_jobs,
        model_router=model_router,
        cache=cache,
    )
    key_service = KeyService(db=db, settings=settings)
    usage_service = UsageService(db=db)
    models_dir = (Path(__file__).resolve().parents[3] / "backend" / "models").resolve()
    retrain = RetrainService(db=db, models_dir=models_dir)
    return Container(
        settings=settings,
        db=db,
        key_service=key_service,
        usage_service=usage_service,
        solver_service=solver,
        retrain_service=retrain,
    )

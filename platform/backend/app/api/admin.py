"""Admin dashboard route definitions — Router Composition."""

from __future__ import annotations
from fastapi import APIRouter
from app.api.admin_routes import auth, keys, models, datasets, backups, autofill, locators, settings, analytics, captcha_proposals

router = APIRouter(prefix="/admin", tags=["admin"])

# Include sub-routers
router.include_router(auth.router)
router.include_router(keys.router)
router.include_router(models.router)
router.include_router(datasets.router)
router.include_router(backups.router)
router.include_router(autofill.router)
router.include_router(locators.router)
router.include_router(settings.router)
router.include_router(analytics.router)
router.include_router(captcha_proposals.router)

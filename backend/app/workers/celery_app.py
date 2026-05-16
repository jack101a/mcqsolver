"""Celery application bootstrap for background workers."""

from __future__ import annotations

import os

from celery import Celery


def _redis_url() -> str:
    return os.getenv("REDIS_URL", "redis://redis:6379/0")


celery_app = Celery(
    "sa_helper",
    broker=_redis_url(),
    backend=_redis_url(),
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_time_limit=300,
    task_soft_time_limit=240,
    task_routes={
        "solve.*": {"queue": "solve-heavy"},
        "feedback.*": {"queue": "feedback"},
        "maintenance.*": {"queue": "maintenance"},
        "health.*": {"queue": "default"},
    },
)

celery_app.autodiscover_tasks(["app.workers"])

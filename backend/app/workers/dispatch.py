"""Async helpers for dispatching Celery work from FastAPI routes."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)


async def run_task_with_timeout(
    task_name: str,
    *,
    args: list[Any] | None = None,
    kwargs: dict[str, Any] | None = None,
    queue: str = "default",
    timeout_seconds: float = 25.0,
) -> dict[str, Any]:
    """Send a Celery task and wait without blocking the event loop."""

    def _send_and_wait() -> dict[str, Any]:
        from app.workers.celery_app import celery_app

        result = celery_app.send_task(
            task_name,
            args=args or [],
            kwargs=kwargs or {},
            queue=queue,
        )
        payload = result.get(timeout=timeout_seconds)
        if not isinstance(payload, dict):
            raise RuntimeError(f"Task {task_name} returned unsupported result type")
        return payload

    try:
        return await asyncio.to_thread(_send_and_wait)
    except Exception:
        logger.exception(
            "celery_task_failed",
            extra={"context": {"task": task_name, "queue": queue}},
        )
        raise

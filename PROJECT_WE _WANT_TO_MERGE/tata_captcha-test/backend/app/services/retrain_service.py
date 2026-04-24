"""Background retraining pipeline service."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.database import Database


class RetrainService:
    """Polls retrain jobs and produces candidate model artifacts."""

    def __init__(self, db: Database, models_dir: Path, poll_seconds: int = 20) -> None:
        self._db = db
        self._models_dir = models_dir
        self._poll_seconds = poll_seconds
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._run_loop())

    async def stop(self) -> None:
        self._stop.set()
        if self._task:
            self._task.cancel()
            await asyncio.gather(self._task, return_exceptions=True)
            self._task = None

    async def _run_loop(self) -> None:
        while not self._stop.is_set():
            await self._process_due_jobs()
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=self._poll_seconds)
            except asyncio.TimeoutError:
                continue

    async def _process_due_jobs(self) -> None:
        now_iso = datetime.now(timezone.utc).isoformat()
        jobs = self._db.get_due_retrain_jobs(now_iso)
        for job in jobs:
            await self._run_job(job)

    async def _run_job(self, job: dict[str, Any]) -> None:
        job_id = int(job["id"])
        self._db.mark_retrain_job_running(job_id)
        try:
            min_samples = int(job.get("min_samples") or 20)
            labeled_preview = self._db.get_retrain_samples("labeled", limit=max(min_samples * 5, min_samples))
            if len(labeled_preview) < min_samples:
                self._db.mark_retrain_job_failed(job_id, f"Not enough labeled samples ({len(labeled_preview)}/{min_samples})")
                return

            samples = self._db.claim_labeled_samples(job_id, limit=len(labeled_preview))
            if len(samples) < min_samples:
                self._db.release_job_claims(job_id)
                self._db.mark_retrain_job_failed(job_id, f"Could not claim enough samples ({len(samples)}/{min_samples})")
                return

            run_dir = self._models_dir / "retrain_runs"
            run_dir.mkdir(parents=True, exist_ok=True)
            dataset_path = run_dir / f"job_{job_id}_dataset.json"
            model_artifact = run_dir / f"job_{job_id}_artifact.json"

            dataset = [
                {
                    "sample_id": sample["id"],
                    "domain": sample["domain"],
                    "image_path": sample["image_path"],
                    "label_text": sample["label_text"],
                    "task_type": sample["task_type"],
                    "field_name": sample["field_name"],
                }
                for sample in samples
            ]
            dataset_path.write_text(json.dumps(dataset, indent=2), encoding="utf-8")

            artifact = {
                "job_id": job_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "dataset_path": str(dataset_path),
                "sample_count": len(samples),
                "notes": "Placeholder artifact for candidate model promotion flow.",
            }
            model_artifact.write_text(json.dumps(artifact, indent=2), encoding="utf-8")

            self._db.mark_retrain_job_done(job_id, produced_ai_model_id=None, total_samples=len(samples))
        except Exception as exc:
            self._db.release_job_claims(job_id)
            self._db.mark_retrain_job_failed(job_id, str(exc))

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.core.db import get_session
from app.core.models import (
    ActiveLearningRecord,
    FailedPayloadLabelRecord,
    RetrainJobRecord,
    RetrainSampleRecord,
)

from .base import BaseRepository


class TrainingRepository(BaseRepository):
    def _sample_to_dict(self, row: RetrainSampleRecord) -> dict[str, Any]:
        return {
            "id": row.id,
            "domain": row.domain,
            "image_path": row.image_path,
            "task_type": row.task_type,
            "field_name": row.field_name,
            "reported_by": row.reported_by,
            "status": row.status,
            "label_text": row.label_text,
            "labeled_by": row.labeled_by,
            "labeled_at": row.labeled_at,
            "consumed_by_job_id": row.consumed_by_job_id,
            "created_at": row.created_at,
        }

    def _job_to_dict(self, row: RetrainJobRecord) -> dict[str, Any]:
        return {
            "id": row.id,
            "status": row.status,
            "scheduled_for": row.scheduled_for,
            "started_at": row.started_at,
            "finished_at": row.finished_at,
            "requested_by": row.requested_by,
            "min_samples": row.min_samples,
            "notes": row.notes,
            "error_message": row.error_message,
            "produced_ai_model_id": row.produced_ai_model_id,
            "total_samples": row.total_samples,
        }

    def _active_learning_to_dict(self, row: ActiveLearningRecord) -> dict[str, Any]:
        return {
            "id": row.id,
            "domain": row.domain,
            "image_path": row.image_path,
            "reported_by": row.reported_by,
            "created_at": row.created_at,
        }

    def insert_retrain_sample(
        self,
        domain: str,
        image_path: str,
        reported_by: int,
        task_type: str = "image",
        field_name: str | None = None,
    ) -> int:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                row = RetrainSampleRecord(
                    domain=domain,
                    image_path=image_path,
                    task_type=task_type,
                    field_name=field_name,
                    reported_by=reported_by,
                    status="queued",
                    created_at=datetime.now(UTC).isoformat(),
                )
                session.add(row)
                session.commit()
                session.refresh(row)
                return int(row.id)
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        with self._lock:
            with self.connect() as conn:
                now = datetime.now(UTC).isoformat()
                cursor = conn.execute(
                    """
                    INSERT INTO retrain_samples (domain, image_path, task_type, field_name, reported_by, status, created_at)
                    VALUES (?, ?, ?, ?, ?, 'queued', ?)
                    """,
                    (domain, image_path, task_type, field_name, reported_by, now),
                )
                conn.commit()
                return int(cursor.lastrowid)

    def get_retrain_samples(self, status: str, limit: int = 100) -> list[dict[str, Any]]:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                rows = (
                    session.query(RetrainSampleRecord)
                    .filter(RetrainSampleRecord.status == status)
                    .order_by(RetrainSampleRecord.id.asc())
                    .limit(limit)
                    .all()
                )
                return [self._sample_to_dict(row) for row in rows]
            finally:
                session.close()
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM retrain_samples WHERE status = ? ORDER BY id ASC LIMIT ?",
                (status, limit),
            )
            return [dict(row) for row in rows]

    def label_retrain_sample(self, sample_id: int, label_text: str, labeled_by: int | None) -> None:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                row = session.get(RetrainSampleRecord, sample_id)
                if row:
                    row.status = "labeled"
                    row.label_text = label_text
                    row.labeled_by = labeled_by
                    row.labeled_at = datetime.now(UTC).isoformat()
                session.commit()
                return
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        with self._lock:
            with self.connect() as conn:
                now = datetime.now(UTC).isoformat()
                conn.execute(
                    """
                    UPDATE retrain_samples
                    SET status = 'labeled', label_text = ?, labeled_by = ?, labeled_at = ?
                    WHERE id = ?
                    """,
                    (label_text, labeled_by, now, sample_id),
                )
                conn.commit()

    def reject_retrain_sample(self, sample_id: int, labeled_by: int | None) -> None:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                row = session.get(RetrainSampleRecord, sample_id)
                if row:
                    row.status = "rejected"
                    row.labeled_by = labeled_by
                    row.labeled_at = datetime.now(UTC).isoformat()
                session.commit()
                return
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        with self._lock:
            with self.connect() as conn:
                now = datetime.now(UTC).isoformat()
                conn.execute(
                    """
                    UPDATE retrain_samples
                    SET status = 'rejected', labeled_by = ?, labeled_at = ?
                    WHERE id = ?
                    """,
                    (labeled_by, now, sample_id),
                )
                conn.commit()

    def get_retrain_sample_counts(self) -> dict[str, int]:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                counts = {"queued": 0, "labeled": 0, "rejected": 0, "consumed": 0}
                rows = session.query(RetrainSampleRecord.status, RetrainSampleRecord.id).all()
                for status, _id in rows:
                    counts[str(status)] = counts.get(str(status), 0) + 1
                return counts
            finally:
                session.close()
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT status, COUNT(*) AS c FROM retrain_samples GROUP BY status"
            )
            counts = {"queued": 0, "labeled": 0, "rejected": 0, "consumed": 0}
            for row in rows:
                counts[row["status"]] = int(row["c"])
            return counts

    def upsert_failed_payload_label(
        self,
        filename: str,
        domain: str,
        ai_guess: str | None,
        corrected_text: str,
    ) -> None:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                now = datetime.now(UTC).isoformat()
                row = (
                    session.query(FailedPayloadLabelRecord)
                    .filter(FailedPayloadLabelRecord.filename == filename)
                    .first()
                )
                if row:
                    row.domain = domain
                    row.ai_guess = ai_guess
                    row.corrected_text = corrected_text
                    row.updated_at = now
                else:
                    session.add(FailedPayloadLabelRecord(
                        filename=filename,
                        domain=domain,
                        ai_guess=ai_guess,
                        corrected_text=corrected_text,
                        updated_at=now,
                    ))
                session.commit()
                return
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        with self._lock:
            with self.connect() as conn:
                now = datetime.now(UTC).isoformat()
                conn.execute(
                    """
                    INSERT INTO failed_payload_labels (filename, domain, ai_guess, corrected_text, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(filename) DO UPDATE SET
                        domain = excluded.domain,
                        ai_guess = excluded.ai_guess,
                        corrected_text = excluded.corrected_text,
                        updated_at = excluded.updated_at
                    """,
                    (filename, domain, ai_guess, corrected_text, now),
                )
                conn.commit()

    def get_failed_payload_labels(self) -> dict[str, dict[str, Any]]:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                rows = (
                    session.query(FailedPayloadLabelRecord)
                    .order_by(FailedPayloadLabelRecord.updated_at.desc())
                    .all()
                )
                return {
                    row.filename: {
                        "domain": row.domain,
                        "ai_guess": row.ai_guess,
                        "corrected_text": row.corrected_text,
                        "updated_at": row.updated_at,
                    }
                    for row in rows
                }
            finally:
                session.close()
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT filename, domain, ai_guess, corrected_text, updated_at FROM failed_payload_labels ORDER BY updated_at DESC"
            )
            return {
                row["filename"]: {
                    "domain": row["domain"],
                    "ai_guess": row["ai_guess"],
                    "corrected_text": row["corrected_text"],
                    "updated_at": row["updated_at"],
                }
                for row in rows
            }

    def create_retrain_job(
        self,
        requested_by: int | None,
        min_samples: int,
        notes: str | None,
        scheduled_for: str | None = None,
    ) -> int:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                now = datetime.now(UTC).isoformat()
                row = RetrainJobRecord(
                    status="queued",
                    scheduled_for=scheduled_for or now,
                    requested_by=requested_by,
                    min_samples=min_samples,
                    notes=notes,
                    total_samples=0,
                )
                session.add(row)
                session.commit()
                session.refresh(row)
                return int(row.id)
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        with self._lock:
            with self.connect() as conn:
                now = datetime.now(UTC).isoformat()
                when = scheduled_for or now
                cursor = conn.execute(
                    """
                    INSERT INTO retrain_jobs (status, scheduled_for, requested_by, min_samples, notes)
                    VALUES ('queued', ?, ?, ?, ?)
                    """,
                    (when, requested_by, min_samples, notes),
                )
                conn.commit()
                return int(cursor.lastrowid)

    def get_due_retrain_jobs(self, now_iso: str) -> list[dict[str, Any]]:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                rows = (
                    session.query(RetrainJobRecord)
                    .filter(RetrainJobRecord.status == "queued", RetrainJobRecord.scheduled_for <= now_iso)
                    .order_by(RetrainJobRecord.id.asc())
                    .all()
                )
                return [self._job_to_dict(row) for row in rows]
            finally:
                session.close()
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM retrain_jobs
                WHERE status = 'queued' AND scheduled_for <= ?
                ORDER BY id ASC
                """,
                (now_iso,),
            )
            return [dict(row) for row in rows]

    def mark_retrain_job_running(self, job_id: int) -> None:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                row = session.get(RetrainJobRecord, job_id)
                if row:
                    row.status = "running"
                    row.started_at = datetime.now(UTC).isoformat()
                session.commit()
                return
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        with self._lock:
            with self.connect() as conn:
                now = datetime.now(UTC).isoformat()
                conn.execute(
                    "UPDATE retrain_jobs SET status='running', started_at=? WHERE id=?",
                    (now, job_id),
                )
                conn.commit()

    def mark_retrain_job_done(self, job_id: int, produced_ai_model_id: int | None, total_samples: int) -> None:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                row = session.get(RetrainJobRecord, job_id)
                if row:
                    row.status = "completed"
                    row.finished_at = datetime.now(UTC).isoformat()
                    row.produced_ai_model_id = produced_ai_model_id
                    row.total_samples = total_samples
                session.commit()
                return
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        with self._lock:
            with self.connect() as conn:
                now = datetime.now(UTC).isoformat()
                conn.execute(
                    """
                    UPDATE retrain_jobs
                    SET status='completed', finished_at=?, produced_ai_model_id=?, total_samples=?
                    WHERE id=?
                    """,
                    (now, produced_ai_model_id, total_samples, job_id),
                )
                conn.commit()

    def mark_retrain_job_failed(self, job_id: int, error_message: str) -> None:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                row = session.get(RetrainJobRecord, job_id)
                if row:
                    row.status = "failed"
                    row.finished_at = datetime.now(UTC).isoformat()
                    row.error_message = error_message[:500]
                session.commit()
                return
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        with self._lock:
            with self.connect() as conn:
                now = datetime.now(UTC).isoformat()
                conn.execute(
                    """
                    UPDATE retrain_jobs
                    SET status='failed', finished_at=?, error_message=?
                    WHERE id=?
                    """,
                    (now, error_message[:500], job_id),
                )
                conn.commit()

    def get_retrain_jobs(self, limit: int = 50) -> list[dict[str, Any]]:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                rows = session.query(RetrainJobRecord).order_by(RetrainJobRecord.id.desc()).limit(limit).all()
                return [self._job_to_dict(row) for row in rows]
            finally:
                session.close()
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM retrain_jobs ORDER BY id DESC LIMIT ?",
                (limit,),
            )
            return [dict(row) for row in rows]

    def claim_labeled_samples(self, job_id: int, limit: int) -> list[dict[str, Any]]:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                rows = (
                    session.query(RetrainSampleRecord)
                    .filter(RetrainSampleRecord.status == "labeled", RetrainSampleRecord.consumed_by_job_id.is_(None))
                    .order_by(RetrainSampleRecord.id.asc())
                    .limit(limit)
                    .all()
                )
                result = [self._sample_to_dict(row) for row in rows]
                for row in rows:
                    row.consumed_by_job_id = job_id
                    row.status = "consumed"
                session.commit()
                return result
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        with self._lock:
            with self.connect() as conn:
                rows = conn.execute(
                    """
                    SELECT * FROM retrain_samples
                    WHERE status = 'labeled' AND consumed_by_job_id IS NULL
                    ORDER BY id ASC
                    LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
                sample_ids = [int(row["id"]) for row in rows]
                if sample_ids:
                    conn.executemany(
                        "UPDATE retrain_samples SET consumed_by_job_id = ?, status = 'consumed' WHERE id = ?",
                        [(job_id, sample_id) for sample_id in sample_ids],
                    )
                    conn.commit()
                return [dict(row) for row in rows]

    def release_job_claims(self, job_id: int) -> None:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                (
                    session.query(RetrainSampleRecord)
                    .filter(RetrainSampleRecord.consumed_by_job_id == job_id)
                    .update(
                        {
                            RetrainSampleRecord.consumed_by_job_id: None,
                            RetrainSampleRecord.status: "labeled",
                        },
                        synchronize_session=False,
                    )
                )
                session.commit()
                return
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        with self._lock:
            with self.connect() as conn:
                conn.execute(
                    """
                    UPDATE retrain_samples
                    SET consumed_by_job_id = NULL, status = 'labeled'
                    WHERE consumed_by_job_id = ?
                    """,
                    (job_id,),
                )
                conn.commit()

    def insert_active_learning(self, domain: str, image_path: str, reported_by: int) -> None:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                session.add(ActiveLearningRecord(
                    domain=domain,
                    image_path=image_path,
                    reported_by=reported_by,
                    created_at=datetime.now(UTC).isoformat(),
                ))
                session.commit()
                return
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        with self._lock:
            with self.connect() as conn:
                now = datetime.now(UTC).isoformat()
                conn.execute(
                    "INSERT INTO active_learning (domain, image_path, reported_by, created_at) VALUES (?, ?, ?, ?)",
                    (domain, image_path, reported_by, now)
                )
                conn.commit()

    def get_active_learning_samples(self, limit: int = 50) -> list[dict[str, Any]]:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                rows = session.query(ActiveLearningRecord).order_by(ActiveLearningRecord.id.desc()).limit(limit).all()
                return [self._active_learning_to_dict(row) for row in rows]
            finally:
                session.close()
        with self.connect() as conn:
            return [dict(row) for row in conn.execute("SELECT * FROM active_learning ORDER BY id DESC LIMIT ?", (limit,))]

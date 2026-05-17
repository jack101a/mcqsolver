from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func

from app.core.db import get_session
from app.core.models import ExamAttemptRecord

from .base import BaseRepository


class ExamAttemptsRepository(BaseRepository):
    """Records every exam answer attempt with correctness."""

    def insert_attempt(
        self,
        question_hash: str,
        selected_option: int,
        was_correct: bool,
        method: str | None = None,
        processing_ms: int = 0,
        domain: str | None = None,
        question_num: int | None = None,
    ) -> int:
        if self._use_sqlalchemy:
            return self._insert_attempt_sa(
                question_hash=question_hash,
                selected_option=selected_option,
                was_correct=was_correct,
                method=method,
                processing_ms=processing_ms,
                domain=domain,
                question_num=question_num,
            )
        with self._lock:
            with self.connect() as conn:
                now = datetime.now(UTC).isoformat()
                cursor = conn.execute(
                    """
                    INSERT INTO exam_attempts
                        (question_hash, selected_option, was_correct, method, processing_ms, domain, question_num, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (question_hash, selected_option, int(was_correct), method, processing_ms, domain, question_num, now),
                )
                conn.commit()
                return int(cursor.lastrowid)

    def _insert_attempt_sa(
        self,
        question_hash: str,
        selected_option: int,
        was_correct: bool,
        method: str | None = None,
        processing_ms: int = 0,
        domain: str | None = None,
        question_num: int | None = None,
    ) -> int:
        session = get_session()
        try:
            row = ExamAttemptRecord(
                question_hash=question_hash,
                selected_option=selected_option,
                was_correct=int(was_correct),
                method=method,
                processing_ms=processing_ms,
                domain=domain,
                question_num=question_num,
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

    def get_attempts_by_hash(self, question_hash: str, limit: int = 20) -> list[dict[str, Any]]:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                rows = (
                    session.query(ExamAttemptRecord)
                    .filter(ExamAttemptRecord.question_hash == question_hash)
                    .order_by(ExamAttemptRecord.id.desc())
                    .limit(limit)
                    .all()
                )
                return [self._row_to_dict(row) for row in rows]
            finally:
                session.close()
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM exam_attempts WHERE question_hash = ? ORDER BY id DESC LIMIT ?",
                (question_hash, limit),
            )
            return [dict(row) for row in rows]

    def get_stats(self) -> dict[str, Any]:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                total = int(session.query(func.count(ExamAttemptRecord.id)).scalar() or 0)
                correct = int(
                    session.query(func.count(ExamAttemptRecord.id))
                    .filter(ExamAttemptRecord.was_correct == 1)
                    .scalar()
                    or 0
                )
                by_method = (
                    session.query(
                        ExamAttemptRecord.method,
                        func.count(ExamAttemptRecord.id),
                        func.coalesce(func.sum(ExamAttemptRecord.was_correct), 0),
                    )
                    .group_by(ExamAttemptRecord.method)
                    .order_by(func.count(ExamAttemptRecord.id).desc())
                    .all()
                )
                return {
                    "total_attempts": total,
                    "correct_count": correct,
                    "accuracy": round(correct / max(total, 1), 3) if total else 0.0,
                    "by_method": [
                        {"method": row[0], "count": int(row[1] or 0), "correct": int(row[2] or 0)}
                        for row in by_method
                    ],
                }
            finally:
                session.close()
        with self.connect() as conn:
            total = conn.execute("SELECT COUNT(*) AS n FROM exam_attempts").fetchone()
            correct = conn.execute(
                "SELECT COUNT(*) AS n FROM exam_attempts WHERE was_correct = 1"
            ).fetchone()
            by_method = conn.execute(
                """
                SELECT method, COUNT(*) AS c, SUM(was_correct) AS correct
                FROM exam_attempts GROUP BY method ORDER BY c DESC
                """
            ).fetchall()
            return {
                "total_attempts": int(total["n"]) if total else 0,
                "correct_count": int(correct["n"]) if correct else 0,
                "accuracy": round(int(correct["n"]) / max(int(total["n"]), 1), 3) if total else 0.0,
                "by_method": [
                    {"method": row["method"], "count": row["c"], "correct": row["correct"]}
                    for row in by_method
                ],
            }

    @staticmethod
    def _row_to_dict(row: ExamAttemptRecord) -> dict[str, Any]:
        return {
            "id": row.id,
            "question_hash": row.question_hash,
            "selected_option": row.selected_option,
            "was_correct": row.was_correct,
            "method": row.method,
            "processing_ms": row.processing_ms,
            "domain": row.domain,
            "question_num": row.question_num,
            "created_at": row.created_at,
        }

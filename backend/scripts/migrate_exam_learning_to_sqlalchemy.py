from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = PROJECT_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


LEARNED_COLUMNS = [
    "question_hash",
    "question_phash",
    "question_text",
    "option_1",
    "option_2",
    "option_3",
    "option_4",
    "correct_option",
    "correct_option_hash",
    "correct_option_phash",
    "correct_option_text",
    "confidence",
    "seen_count",
    "first_seen",
    "last_seen",
    "source",
    "learning_mode",
    "ocr_quality",
    "ocr_preview_unreliable",
    "verified_count",
    "wrong_count",
    "last_verified_at",
    "status",
]

ATTEMPT_COLUMNS = [
    "question_hash",
    "selected_option",
    "was_correct",
    "method",
    "processing_ms",
    "domain",
    "question_num",
    "created_at",
]


def _sqlite_table_exists(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (name,),
    ).fetchone()
    return row is not None


def _sqlite_rows(conn: sqlite3.Connection, table: str, columns: list[str]) -> list[dict[str, Any]]:
    if not _sqlite_table_exists(conn, table):
        return []
    selected = ", ".join(columns)
    rows = conn.execute(f"SELECT {selected} FROM {table}").fetchall()
    return [dict(row) for row in rows]


def _apply_target_overrides(args: argparse.Namespace) -> None:
    if args.target_sqlite:
        os.environ["DB_TYPE"] = "sqlite"
        os.environ["SQLITE_PATH"] = str(Path(args.target_sqlite).resolve())
    if args.database_url:
        os.environ["DB_TYPE"] = "postgresql"
        os.environ["DATABASE_URL"] = args.database_url


def _target_label(settings: Any) -> str:
    if settings.storage.db_type == "postgresql":
        return "postgresql"
    return str(Path(settings.storage.sqlite_path).resolve())


def _same_sqlite_source_target(source: Path, settings: Any) -> bool:
    if settings.storage.db_type != "sqlite":
        return False
    try:
        return source.resolve() == Path(settings.storage.sqlite_path).resolve()
    except Exception:
        return False


def _upsert_learned(session: Any, row: dict[str, Any]) -> str:
    from app.core.models import ExamLearnedRecord

    existing = (
        session.query(ExamLearnedRecord)
        .filter(ExamLearnedRecord.question_hash == row["question_hash"])
        .first()
    )
    values = {column: row.get(column) for column in LEARNED_COLUMNS}
    if existing:
        for key, value in values.items():
            setattr(existing, key, value)
        return "updated"
    session.add(ExamLearnedRecord(**values))
    return "inserted"


def _attempt_exists(session: Any, row: dict[str, Any]) -> bool:
    from app.core.models import ExamAttemptRecord

    query = session.query(ExamAttemptRecord).filter(
        ExamAttemptRecord.question_hash == row["question_hash"],
        ExamAttemptRecord.selected_option == row["selected_option"],
        ExamAttemptRecord.was_correct == row["was_correct"],
        ExamAttemptRecord.method == row["method"],
        ExamAttemptRecord.processing_ms == row["processing_ms"],
        ExamAttemptRecord.domain == row["domain"],
        ExamAttemptRecord.question_num == row["question_num"],
        ExamAttemptRecord.created_at == row["created_at"],
    )
    return query.first() is not None


def _insert_attempt(session: Any, row: dict[str, Any]) -> str:
    from app.core.models import ExamAttemptRecord

    if _attempt_exists(session, row):
        return "skipped"
    values = {column: row.get(column) for column in ATTEMPT_COLUMNS}
    session.add(ExamAttemptRecord(**values))
    return "inserted"


def migrate(args: argparse.Namespace) -> dict[str, int | str]:
    source = Path(args.source_sqlite).resolve()
    if not source.is_file():
        raise FileNotFoundError(f"source SQLite DB not found: {source}")

    with sqlite3.connect(source) as src:
        src.row_factory = sqlite3.Row
        learned_rows = _sqlite_rows(src, "exam_learned", LEARNED_COLUMNS)
        attempt_rows = _sqlite_rows(src, "exam_attempts", ATTEMPT_COLUMNS)

    _apply_target_overrides(args)

    from app.core.config import get_settings
    from app.core.db import create_all_tables, get_session, init_db
    import app.core.models  # noqa: F401

    get_settings.cache_clear()
    settings = get_settings()
    if (
        not args.dry_run
        and _same_sqlite_source_target(source, settings)
        and not args.allow_same_sqlite_target
    ):
        raise RuntimeError(
            "target SQLite path is the same as source; pass --target-sqlite for a copy target "
            "or --allow-same-sqlite-target if you really want to update the same DB"
        )

    print(f"source_sqlite={source}")
    print(f"target={_target_label(settings)}")
    print(f"learned_source_rows={len(learned_rows)}")
    print(f"attempt_source_rows={len(attempt_rows)}")
    print(f"dry_run={args.dry_run}")

    if args.dry_run:
        return {
            "learned_source_rows": len(learned_rows),
            "attempt_source_rows": len(attempt_rows),
            "learned_inserted": 0,
            "learned_updated": 0,
            "attempt_inserted": 0,
            "attempt_skipped": 0,
        }

    init_db(settings)
    create_all_tables()

    learned_inserted = 0
    learned_updated = 0
    attempt_inserted = 0
    attempt_skipped = 0

    session = get_session()
    try:
        for row in learned_rows:
            action = _upsert_learned(session, row)
            if action == "inserted":
                learned_inserted += 1
            else:
                learned_updated += 1
        for row in attempt_rows:
            action = _insert_attempt(session, row)
            if action == "inserted":
                attempt_inserted += 1
            else:
                attempt_skipped += 1
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

    return {
        "learned_source_rows": len(learned_rows),
        "attempt_source_rows": len(attempt_rows),
        "learned_inserted": learned_inserted,
        "learned_updated": learned_updated,
        "attempt_inserted": attempt_inserted,
        "attempt_skipped": attempt_skipped,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Copy MCQ exam learning rows from the current SQLite app DB into the configured SQLAlchemy DB."
    )
    parser.add_argument(
        "--source-sqlite",
        default=str(PROJECT_ROOT / "backend" / "logs" / "app.db"),
        help="Existing SQLite app DB containing exam_learned/exam_attempts.",
    )
    parser.add_argument(
        "--target-sqlite",
        default="",
        help="Optional SQLite target for local smoke tests. Sets DB_TYPE=sqlite and SQLITE_PATH for this run.",
    )
    parser.add_argument(
        "--database-url",
        default="",
        help="Optional PostgreSQL DATABASE_URL target. Sets DB_TYPE=postgresql for this run.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Read source rows and resolve target without writing.")
    parser.add_argument(
        "--allow-same-sqlite-target",
        action="store_true",
        help="Allow source and target SQLite paths to be the same. Usually not needed.",
    )
    args = parser.parse_args()
    result = migrate(args)
    for key, value in result.items():
        print(f"{key}={value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

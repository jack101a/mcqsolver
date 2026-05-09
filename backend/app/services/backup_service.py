"""Backup and restore service — full DB dumps, file backups, restore scripts."""

from __future__ import annotations

import json
import logging
import os
import shutil
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from app.core.config import Settings
from app.core.db import get_session

logger = logging.getLogger(__name__)


class BackupService:
    """Manages database backups, file backups, and restore operations."""

    def __init__(self, settings: Settings):
        self._settings = settings
        self._db_path = Path(settings.storage.sqlite_path)
        self._backup_dir = self._db_path.parent / "backups"
        self._backup_dir.mkdir(parents=True, exist_ok=True)

    def full_backup(self) -> dict:
        """Perform a full backup: SQLite dump + critical files. Returns summary."""
        started = datetime.now(timezone.utc)
        timestamp = started.strftime("%Y%m%d_%H%M%S")
        backup_id = f"backup_{timestamp}"

        backup_path = self._backup_dir / backup_id
        backup_path.mkdir(parents=True, exist_ok=True)

        result = {
            "backup_id": backup_id,
            "type": "full",
            "started_at": started.isoformat(),
            "files": [],
            "db_size_bytes": 0,
            "status": "running",
        }

        try:
            # 1. Database dump
            db_backup = backup_path / "database.sqlite"
            if self._db_path.exists():
                shutil.copy2(self._db_path, db_backup)
                result["db_size_bytes"] = db_backup.stat().st_size
                result["files"].append(str(db_backup))

            # 2. Export critical tables as JSON (portable)
            json_export = self._export_json_backup(backup_path)
            if json_export:
                result["files"].append(str(json_export))

            # 3. Settings/config export
            config_backup = backup_path / "config_export.json"
            config_data = {
                "settings": {
                    "db_type": self._settings.storage.db_type,
                    "redis_enabled": self._settings.redis.enabled,
                }
            }
            config_backup.write_text(json.dumps(config_data, indent=2))
            result["files"].append(str(config_backup))

            # 4. Cleanup old backups (keep last 7)
            self._cleanup_old_backups(keep=7)

            result["status"] = "completed"
            result["finished_at"] = datetime.now(timezone.utc).isoformat()

            # Log to backup_runs table
            self._log_backup_run(result)

            logger.info("backup_completed", extra={"context": result})
            return result

        except Exception as e:
            result["status"] = "failed"
            result["error"] = str(e)
            logger.error("backup_failed", extra={"context": result})
            return result

    def _export_json_backup(self, backup_path: Path) -> Optional[Path]:
        """Export critical tables as JSON for portability."""
        try:
            conn = sqlite3.connect(str(self._db_path))
            tables = ["users", "subscription_plans", "user_subscriptions", "payment_records",
                      "user_api_keys", "usage_cycles", "audit_logs", "platform_settings"]

            export = {}
            for table in tables:
                try:
                    rows = conn.execute(f"SELECT * FROM {table}").fetchall()
                    cols = [desc[0] for desc in conn.execute(f"PRAGMA table_info({table})")]
                    export[table] = [dict(zip(cols, row)) for row in rows]
                except Exception:
                    export[table] = []

            conn.close()

            json_path = backup_path / "data_export.json"
            json_path.write_text(json.dumps(export, ensure_ascii=False, indent=2, default=str))
            return json_path
        except Exception as e:
            logger.warning("json_export_failed", extra={"context": {"error": str(e)}})
            return None

    def _cleanup_old_backups(self, keep: int = 7) -> None:
        """Remove old backups, keeping the most recent N."""
        backups = sorted(
            [d for d in self._backup_dir.iterdir() if d.is_dir() and d.name.startswith("backup_")],
            key=lambda d: d.stat().st_mtime,
            reverse=True,
        )
        for old in backups[keep:]:
            shutil.rmtree(old, ignore_errors=True)

    def _log_backup_run(self, result: dict) -> None:
        """Record backup run in the backup_runs table."""
        try:
            session = get_session()
            from app.core.models import BackupRun
            run = BackupRun(
                backup_type=result["type"],
                status=result["status"],
                storage_target=str(self._backup_dir),
                started_at=datetime.fromisoformat(result["started_at"]),
                finished_at=datetime.fromisoformat(result.get("finished_at", result["started_at"])),
                file_path_or_uri=result.get("backup_id", ""),
                error_message=result.get("error", ""),
            )
            session.add(run)
            session.commit()
            session.close()
        except Exception as e:
            logger.warning("backup_log_failed", extra={"context": {"error": str(e)}})

    def list_backups(self) -> list[dict]:
        """List available backups with metadata."""
        backups = []
        for d in sorted(
            [d for d in self._backup_dir.iterdir() if d.is_dir() and d.name.startswith("backup_")],
            key=lambda d: d.stat().st_mtime,
            reverse=True,
        ):
            size = sum(f.stat().st_size for f in d.rglob("*") if f.is_file())
            backups.append({
                "id": d.name,
                "created": datetime.fromtimestamp(d.stat().st_mtime, tz=timezone.utc).isoformat(),
                "size_bytes": size,
                "path": str(d),
            })
        return backups

    def restore_from_backup(self, backup_id: str) -> dict:
        """Restore database from a backup. Returns result."""
        backup_path = self._backup_dir / backup_id
        if not backup_path.exists():
            return {"status": "failed", "error": f"Backup {backup_id} not found"}

        db_backup = backup_path / "database.sqlite"
        if not db_backup.exists():
            return {"status": "failed", "error": "No database file in backup"}

        try:
            # Create safety copy of current DB
            safety = self._db_path.with_suffix(".db.before_restore")
            if self._db_path.exists():
                shutil.copy2(self._db_path, safety)

            # Restore
            shutil.copy2(db_backup, self._db_path)

            logger.info("restore_completed", extra={"context": {"backup_id": backup_id}})
            return {"status": "completed", "backup_id": backup_id, "safety_copy": str(safety)}
        except Exception as e:
            logger.error("restore_failed", extra={"context": {"error": str(e)}})
            return {"status": "failed", "error": str(e)}

    def get_backup_health(self) -> dict:
        """Get backup health summary."""
        backups = self.list_backups()
        last_backup = backups[0] if backups else None
        return {
            "total_backups": len(backups),
            "last_backup": last_backup,
            "backup_dir": str(self._backup_dir),
            "db_size_bytes": self._db_path.stat().st_size if self._db_path.exists() else 0,
        }

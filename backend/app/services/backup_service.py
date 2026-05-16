"""Backup and restore service - portable system/user backup packages."""

from __future__ import annotations

import base64
import hashlib
import hmac
import io
import json
import logging
import os
import shutil
import sqlite3
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import httpx
from sqlalchemy import delete, inspect, insert, select

from app.core.config import Settings
from app.core.db import Base, get_engine, get_session
from app.core.paths import get_project_root

logger = logging.getLogger(__name__)

BACKUP_VERSION = 1
SYSTEM_FILE_ROOTS = [
    "data/models",
    "data/mappings",
    "data/userscripts",
    "data/automation_scripts",
    "data/hashes",
    "data/questions",
    "backend/tessdata",
]
USER_TABLES = [
    "users",
    "subscription_plans",
    "user_subscriptions",
    "payment_records",
    "user_api_keys",
    "user_api_key_devices",
    "usage_cycles",
    "audit_logs",
    "api_keys",
    "api_key_allowed_domains",
    "api_key_rate_limits",
    "api_key_device_bindings",
    "usage_events",
]


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _json_bytes(data: Any) -> bytes:
    return json.dumps(data, ensure_ascii=False, indent=2, default=str).encode("utf-8")


def _xor_stream(data: bytes, key: str) -> bytes:
    """Encrypt/decrypt with an HMAC-derived stream using stdlib only."""
    if not key:
        return data
    secret = key.encode("utf-8")
    out = bytearray()
    counter = 0
    while len(out) < len(data):
        out.extend(hmac.new(secret, counter.to_bytes(8, "big"), hashlib.sha256).digest())
        counter += 1
    return bytes(a ^ b for a, b in zip(data, out))


class BackupService:
    """Manages local packages, restore validation, Telegram, and Google Drive upload."""

    def __init__(self, settings: Settings):
        self._settings = settings
        self._root = get_project_root()
        self._db_path = Path(settings.storage.sqlite_path)
        self._backup_dir = self._root / "backend" / "backups"
        self._backup_dir.mkdir(parents=True, exist_ok=True)

    def full_backup(self) -> dict:
        started = datetime.now(timezone.utc)
        backup_id = f"backup_{started.strftime('%Y%m%d_%H%M%S')}"
        result = {
            "backup_id": backup_id,
            "type": "full-package",
            "started_at": started.isoformat(),
            "status": "running",
        }
        try:
            package = self.create_package(backup_id=backup_id)
            result.update({
                "status": "completed",
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "file_path_or_uri": str(package["path"]),
                "checksum": package["checksum"],
                "size_bytes": package["size_bytes"],
                "encrypted": package["encrypted"],
            })
            self._cleanup_old_backups(self._retention_count())
            self._log_backup_run(result)
            self.notify_telegram_backup(result)
            if self._truthy_setting("backup.gdrive.enabled"):
                self.upload_to_gdrive(Path(package["path"]))
            return result
        except Exception as exc:
            result["status"] = "failed"
            result["error"] = str(exc)
            self._log_backup_run(result)
            self.notify_telegram_backup(result)
            logger.exception("backup_failed", extra={"context": result})
            return result

    def create_package(self, backup_id: str | None = None) -> dict:
        created = datetime.now(timezone.utc)
        backup_id = backup_id or f"backup_{created.strftime('%Y%m%d_%H%M%S')}"
        payload = self._build_payload(backup_id, created)
        clear_bytes = self._zip_payload(payload)
        encryption_key = self._backup_encryption_key()
        stored_bytes = _xor_stream(clear_bytes, encryption_key)
        suffix = ".upbak" if encryption_key else ".zip"
        package_path = self._backup_dir / f"{backup_id}{suffix}"
        package_path.write_bytes(stored_bytes)
        return {
            "backup_id": backup_id,
            "path": package_path,
            "checksum": _sha256(stored_bytes),
            "size_bytes": package_path.stat().st_size,
            "encrypted": bool(encryption_key),
        }

    def validate_package(self, package_path: str | Path) -> dict:
        package = Path(package_path)
        clear_bytes = self._read_package_bytes(package)
        with zipfile.ZipFile(io.BytesIO(clear_bytes)) as zf:
            manifest = json.loads(zf.read("manifest.json").decode("utf-8"))
            for name, expected in manifest.get("checksums", {}).items():
                actual = _sha256(zf.read(name))
                if actual != expected:
                    return {"ok": False, "error": f"checksum mismatch: {name}"}
        return {"ok": True, "manifest": manifest}

    def restore_from_backup(self, backup_id: str) -> dict:
        candidates = [self._backup_dir / backup_id]
        if not Path(backup_id).suffix:
            candidates += [self._backup_dir / f"{backup_id}.upbak", self._backup_dir / f"{backup_id}.zip"]
        package = next((item for item in candidates if item.exists()), None)
        if not package:
            return {"status": "failed", "error": f"Backup {backup_id} not found"}
        return self.restore_package(package)

    def restore_package(self, package_path: str | Path) -> dict:
        package = Path(package_path)
        try:
            validation = self.validate_package(package)
            if not validation.get("ok"):
                return {"status": "failed", "error": validation.get("error")}
            clear_bytes = self._read_package_bytes(package)
            with zipfile.ZipFile(io.BytesIO(clear_bytes)) as zf:
                system_data = json.loads(zf.read("system-data.json").decode("utf-8"))
                user_data = json.loads(zf.read("user-data.json").decode("utf-8"))
                self._restore_system_data(system_data)
                self._restore_user_data(user_data)
                self._restore_files(zf)
            return {"status": "completed", "backup": str(package), "manifest": validation["manifest"]}
        except Exception as exc:
            logger.exception("restore_failed", extra={"context": {"error": str(exc)}})
            return {"status": "failed", "error": str(exc)}

    def list_backups(self) -> list[dict]:
        backups = []
        for item in sorted(self._backup_dir.glob("backup_*.*"), key=lambda p: p.stat().st_mtime, reverse=True):
            if item.suffix not in {".upbak", ".zip"}:
                continue
            backups.append({
                "id": item.stem,
                "name": item.name,
                "created": datetime.fromtimestamp(item.stat().st_mtime, tz=timezone.utc).isoformat(),
                "size_bytes": item.stat().st_size,
                "path": str(item),
                "encrypted": item.suffix == ".upbak",
            })
        return backups

    def get_backup_health(self) -> dict:
        backups = self.list_backups()
        return {
            "total_backups": len(backups),
            "last_backup": backups[0] if backups else None,
            "backup_dir": str(self._backup_dir),
            "db_type": self._settings.storage.db_type,
            "telegram_channel_set": bool(self._setting("backup.telegram_channel_id")),
            "gdrive_enabled": self._truthy_setting("backup.gdrive.enabled"),
        }

    def notify_telegram_backup(self, result: dict) -> bool:
        token = self._telegram_token()
        channel_id = self._setting("backup.telegram_channel_id")
        if not token or not channel_id:
            return False
        status = result.get("status")
        text = (
            f"Backup {status}\n"
            f"ID: {result.get('backup_id')}\n"
            f"Size: {result.get('size_bytes', 0)} bytes\n"
            f"Checksum: {result.get('checksum', 'n/a')}\n"
            "Restore: deploy container, upload this package in admin, validate, restore."
        )
        try:
            import asyncio
            from telegram import Bot

            async def _send() -> None:
                bot = Bot(token=token)
                await bot.send_message(chat_id=channel_id, text=text)
                path = result.get("file_path_or_uri")
                if path and Path(path).exists() and Path(path).stat().st_size < 45 * 1024 * 1024:
                    with Path(path).open("rb") as fh:
                        await bot.send_document(chat_id=channel_id, document=fh, filename=Path(path).name)

            asyncio.run(_send())
            return True
        except Exception as exc:
            self._set_setting("backup.telegram_last_error", str(exc))
            logger.warning("backup_telegram_notify_failed", extra={"context": {"error": str(exc)}})
            return False

    def gdrive_auth_url(self, redirect_uri: str) -> dict:
        client_id = self._setting("backup.gdrive.client_id")
        if not client_id:
            return {"ok": False, "error": "backup.gdrive.client_id is not configured"}
        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "https://www.googleapis.com/auth/drive.file",
            "access_type": "offline",
            "prompt": "consent",
        }
        return {"ok": True, "url": "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)}

    async def gdrive_exchange_code(self, code: str, redirect_uri: str) -> dict:
        client_id = self._setting("backup.gdrive.client_id")
        client_secret = self._setting("backup.gdrive.client_secret")
        if not client_id or not client_secret:
            return {"ok": False, "error": "Google Drive OAuth client is not configured"}
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post("https://oauth2.googleapis.com/token", data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            })
        if resp.status_code >= 400:
            self._set_setting("backup.gdrive.last_error", resp.text)
            return {"ok": False, "error": resp.text}
        data = resp.json()
        self._set_setting("backup.gdrive.token_json", json.dumps(data))
        self._set_setting("backup.gdrive.enabled", "true")
        return {"ok": True, "expires_in": data.get("expires_in")}

    def upload_to_gdrive(self, package_path: Path) -> dict:
        token = self._gdrive_access_token()
        if not token:
            return {"ok": False, "error": "Google Drive is not connected"}
        metadata = {"name": package_path.name}
        folder_id = self._setting("backup.gdrive.folder_id")
        if folder_id:
            metadata["parents"] = [folder_id]
        boundary = "backup_boundary"
        body = (
            f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"
            + json.dumps(metadata)
            + f"\r\n--{boundary}\r\nContent-Type: application/octet-stream\r\n\r\n"
        ).encode("utf-8") + package_path.read_bytes() + f"\r\n--{boundary}--\r\n".encode("utf-8")
        try:
            resp = httpx.post(
                "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
                headers={"Authorization": f"Bearer {token}", "Content-Type": f"multipart/related; boundary={boundary}"},
                content=body,
                timeout=120,
            )
            if resp.status_code >= 400:
                self._set_setting("backup.gdrive.last_error", resp.text)
                return {"ok": False, "error": resp.text}
            data = resp.json()
            self._set_setting("backup.gdrive.last_file_id", data.get("id", ""))
            self._set_setting("backup.gdrive.last_error", "")
            return {"ok": True, "file_id": data.get("id")}
        except Exception as exc:
            self._set_setting("backup.gdrive.last_error", str(exc))
            return {"ok": False, "error": str(exc)}

    def _build_payload(self, backup_id: str, created: datetime) -> dict:
        system_data = self._export_system_data()
        user_data = self._export_user_data()
        files = self._collect_files()
        manifest = {
            "backup_version": BACKUP_VERSION,
            "backup_id": backup_id,
            "created_at": created.isoformat(),
            "db_type": self._settings.storage.db_type,
            "app": "unified-platform",
            "sections": ["system-data", "user-data"],
            "file_count": len(files),
            "checksums": {},
        }
        return {"manifest": manifest, "system": system_data, "user": user_data, "files": files}

    def _zip_payload(self, payload: dict) -> bytes:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            entries = {
                "system-data.json": _json_bytes(payload["system"]),
                "user-data.json": _json_bytes(payload["user"]),
            }
            for arcname, data in entries.items():
                payload["manifest"]["checksums"][arcname] = _sha256(data)
            for rel, abs_path in payload["files"].items():
                data = abs_path.read_bytes()
                arcname = f"files/{rel}"
                entries[arcname] = data
                payload["manifest"]["checksums"][arcname] = _sha256(data)
            manifest_bytes = _json_bytes(payload["manifest"])
            zf.writestr("manifest.json", manifest_bytes)
            for arcname, data in entries.items():
                zf.writestr(arcname, data)
        return buf.getvalue()

    def _export_system_data(self) -> dict:
        from app.core.database import Database

        db = Database(self._settings)
        db.init()
        return db.export_master_setup()

    def _export_user_data(self) -> dict:
        data: dict[str, list[dict]] = {}
        engine = get_engine()
        with engine.connect() as conn:
            for table in Base.metadata.sorted_tables:
                if table.name in USER_TABLES:
                    rows = conn.execute(select(table)).mappings().all()
                    data[table.name] = [dict(row) for row in rows]
        if self._settings.storage.db_type == "sqlite" and self._db_path.exists():
            data["sqlite_snapshot_sha256"] = self._sqlite_snapshot_hash()
        return data

    def _restore_user_data(self, data: dict) -> None:
        session = get_session()
        try:
            tables = [t for t in reversed(Base.metadata.sorted_tables) if t.name in USER_TABLES]
            for table in tables:
                session.execute(delete(table))
            for table in [t for t in Base.metadata.sorted_tables if t.name in USER_TABLES]:
                rows = data.get(table.name) or []
                if rows:
                    session.execute(insert(table), rows)
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def _restore_system_data(self, data: dict) -> None:
        from app.core.database import Database

        db = Database(self._settings)
        db.init()
        db.import_master_setup(data)

    def _collect_files(self) -> dict[str, Path]:
        files: dict[str, Path] = {}
        for rel_root in SYSTEM_FILE_ROOTS:
            root = (self._root / rel_root).resolve()
            if not root.exists():
                continue
            for item in root.rglob("*"):
                if item.is_file():
                    files[str(item.relative_to(self._root)).replace("\\", "/")] = item
        return files

    def _restore_files(self, zf: zipfile.ZipFile) -> None:
        for name in zf.namelist():
            if not name.startswith("files/") or name.endswith("/"):
                continue
            rel = name.removeprefix("files/")
            target = (self._root / rel).resolve()
            if self._root.resolve() not in target.parents:
                raise ValueError(f"unsafe backup path: {rel}")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(zf.read(name))

    def _read_package_bytes(self, package: Path) -> bytes:
        data = package.read_bytes()
        return _xor_stream(data, self._backup_encryption_key()) if package.suffix == ".upbak" else data

    def _sqlite_snapshot_hash(self) -> str:
        tmp = self._backup_dir / ".sqlite_snapshot.tmp"
        if tmp.exists():
            tmp.unlink()
        src = sqlite3.connect(str(self._db_path))
        dst = sqlite3.connect(str(tmp))
        src.backup(dst)
        dst.close()
        src.close()
        digest = _sha256(tmp.read_bytes())
        tmp.unlink(missing_ok=True)
        return digest

    def _cleanup_old_backups(self, keep: int) -> None:
        backups = sorted(self._backup_dir.glob("backup_*.*"), key=lambda p: p.stat().st_mtime, reverse=True)
        for old in backups[keep:]:
            old.unlink(missing_ok=True)

    def _log_backup_run(self, result: dict) -> None:
        try:
            from app.core.models import BackupRun

            session = get_session()
            run = BackupRun(
                backup_type=result["type"],
                status=result["status"],
                storage_target=str(self._backup_dir),
                started_at=datetime.fromisoformat(result["started_at"]),
                finished_at=datetime.fromisoformat(result.get("finished_at", result["started_at"])),
                file_path_or_uri=result.get("file_path_or_uri") or result.get("backup_id", ""),
                checksum=result.get("checksum"),
                error_message=result.get("error", ""),
            )
            session.add(run)
            session.commit()
            session.close()
        except Exception as exc:
            logger.warning("backup_log_failed", extra={"context": {"error": str(exc)}})

    def _setting(self, key: str, default: str = "") -> str:
        try:
            from app.core.database import Database

            db = Database(self._settings)
            db.init()
            return db.get_setting(key, default) or default
        except Exception:
            return os.getenv(key.upper().replace(".", "_"), default)

    def _set_setting(self, key: str, value: str) -> None:
        try:
            from app.core.database import Database

            db = Database(self._settings)
            db.init()
            db.set_setting(key, value)
        except Exception:
            logger.warning("backup_setting_write_failed", extra={"context": {"key": key}})

    def _truthy_setting(self, key: str) -> bool:
        return self._setting(key).strip().lower() in {"1", "true", "yes", "on"}

    def _retention_count(self) -> int:
        try:
            return max(1, int(self._setting("backup.retention_count", "7")))
        except ValueError:
            return 7

    def _backup_encryption_key(self) -> str:
        return self._setting("backup.encryption_key") or os.getenv("BACKUP_ENCRYPTION_KEY", "")

    def _telegram_token(self) -> str:
        return os.getenv("TELEGRAM_BOT_TOKEN", "") or self._settings.telegram.bot_token or self._setting("telegram.bot_token")

    def _gdrive_access_token(self) -> str:
        raw = self._setting("backup.gdrive.token_json")
        if not raw:
            return ""
        try:
            data = json.loads(raw)
            return data.get("access_token", "")
        except Exception:
            return ""

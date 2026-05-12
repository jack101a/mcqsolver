from __future__ import annotations
import os
import json
import re
from pathlib import Path
from fastapi import APIRouter, Request, Form, HTTPException, UploadFile, File
from fastapi.responses import RedirectResponse, FileResponse
from pydantic import BaseModel
from app.core.userscript_utils import parse_userscript_meta
from app.core.paths import get_project_root
from .utils import _admin_guard, _write_auto_backup

router = APIRouter(tags=["admin-settings"])
_PROJECT_ROOT = get_project_root()
_USERSCRIPTS_DIR = (_PROJECT_ROOT / "data" / "mappings").resolve()


def _extension_filename_for_format(fmt: str) -> str:
    normalized = str(fmt or "").strip().lower()
    mapping = {
        "zip": "mcq_solver_extension.zip",
        "crx": "mcq_solver_extension.crx",
        "xpi": "mcq_solver_extension.xpi",
    }
    if normalized not in mapping:
        raise HTTPException(400, "Unsupported extension format. Use zip, crx, or xpi.")
    return mapping[normalized]


def _ensure_headers(name: str, version: str, matches: list[str], runAt: str, code: str) -> str:
    if "==UserScript==" in code:
        return code
    header = [
        "// ==UserScript==",
        f"// @name        {name}",
        f"// @version     {version}",
        f"// @run-at       {runAt}",
    ]
    for m in matches:
        header.append(f"// @match       {m}")
    header.append("// ==/UserScript==")
    header.append("")
    return "\n".join(header) + "\n" + code


def _update_index():
    _USERSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
    index_path = (_USERSCRIPTS_DIR / "index.json").resolve()
    existing_entries = {}
    if index_path.is_file():
        try:
            data = json.loads(index_path.read_text(encoding="utf-8"))
            if isinstance(data, list):
                for e in data:
                    if isinstance(e, dict) and "id" in e:
                        existing_entries[str(e["id"])] = e
        except Exception:
            pass
    new_index = []
    for file_path in sorted(_USERSCRIPTS_DIR.glob("*.user.js")):
        if not file_path.is_file():
            continue
        code = file_path.read_text(encoding="utf-8")
        meta = parse_userscript_meta(code)
        uid = file_path.stem.replace(".user", "")
        enabled = True
        if uid in existing_entries:
            enabled = bool(existing_entries[uid].get("enabled", True))
        new_index.append({
            "id": uid,
            "file": file_path.name,
            "name": meta["name"] or uid,
            "version": meta["version"],
            "enabled": enabled,
            "matches": meta["matches"],
            "exclude": meta["exclude"],
            "runAt": meta["runAt"],
            "requires": meta["requires"],
            "resources": meta["resources"],
            "grants": meta["grants"],
            "connects": meta["connects"],
            "noframes": meta["noframes"],
        })
    index_path.write_text(json.dumps(new_index, indent=2), encoding="utf-8")

@router.post("/access")
async def update_access(request: Request, global_access: str = Form(None), new_domain: str = Form(None)):
    denied = _admin_guard(request)
    if denied:
        return denied
    container = request.app.state.container
    container.db.set_global_access(global_access == "on")
    if new_domain and new_domain.strip():
        container.db.add_allowed_domain(new_domain.strip())
    _write_auto_backup(container, "update_access")
    return RedirectResponse(url="/admin/", status_code=303)

@router.post("/access/remove")
async def remove_domain(request: Request, domain: str = Form(...)):
    denied = _admin_guard(request)
    if denied:
        return denied
    container = request.app.state.container
    container.db.remove_allowed_domain(domain)
    _write_auto_backup(container, "remove_domain")
    return RedirectResponse(url="/admin/", status_code=303)

@router.get("/api/settings")
async def get_settings(request: Request):
    """Return all platform settings for admin display."""
    denied = _admin_guard(request)
    if denied:
        return denied
    container = request.app.state.container
    settings_list = container.db.get_all_settings()
    # Mask secrets for display
    masked = []
    SECRET_KEYS = {"exam.litellm_api_key", "alerts.callmebot_apikey"}
    for s in settings_list:
        row = dict(s)
        if row["key"] in SECRET_KEYS and row["value"]:
            v = row["value"]
            row["value_display"] = v[:4] + "****" + v[-2:] if len(v) >= 8 else "***"
            row["is_secret"] = True
        else:
            row["value_display"] = row["value"]
            row["is_secret"] = False
        masked.append(row)
    return {"settings": masked}

@router.get("/api/settings/{key:path}")
async def get_setting(request: Request, key: str):
    """Return a single platform setting by key."""
    denied = _admin_guard(request)
    if denied:
        return denied
    container = request.app.state.container
    value = container.db.get_setting(key)
    return {"key": key, "value": value or ""}


class SettingPayload(BaseModel):
    key: str
    value: str


@router.post("/api/settings")
async def save_setting(
    request: Request,
    key: str = Form(None),
    value: str = Form(None),
):
    """Save a single platform setting (form or JSON body)."""
    denied = _admin_guard(request)
    if denied:
        return denied
    container = request.app.state.container

    # Support JSON body as fallback
    if key is None:
        try:
            body = await request.json()
            key = body.get("key", "")
            value = body.get("value", "")
        except Exception:
            raise HTTPException(400, "key is required (form or JSON)")

    key   = key.strip()
    value = value.strip()
    if not key:
        raise HTTPException(400, "key is required")
    container.db.set_setting(key, value)
    return {"ok": True, "key": key, "saved": True}

@router.post("/api/settings/bulk")
async def save_settings_bulk(request: Request):
    """
    Save multiple settings at once from a JSON body.
    Body: { "settings": { "key1": "value1", "key2": "value2" } }
    """
    denied = _admin_guard(request)
    if denied:
        return denied
    container = request.app.state.container
    try:
        body = await request.json()
        settings_dict = body.get("settings", {})
    except Exception:
        raise HTTPException(400, "Invalid JSON body")
    if not isinstance(settings_dict, dict):
        raise HTTPException(400, "settings must be an object")
    saved = []
    for key, value in settings_dict.items():
        key   = str(key).strip()
        value = str(value).strip()
        if key:
            container.db.set_setting(key, value)
            saved.append(key)
    return {"ok": True, "saved_keys": saved}

@router.get("/api/alerts/config")
async def get_alert_config(request: Request):
    """Return current WhatsApp alert config status (no secrets exposed)."""
    denied = _admin_guard(request)
    if denied:
        return denied
    container = request.app.state.container
    svc = container.alert_service
    return {
        "enabled":       svc._enabled(),
        "phone_set":     bool(svc._phone()),
        "apikey_set":    bool(svc._apikey()),
        "phone_preview": (svc._phone()[:4] + "****" + svc._phone()[-3:]) if len(svc._phone()) > 7 else "not set",
    }

@router.post("/api/alerts/test")
async def test_alert(request: Request):
    """Send a test WhatsApp message to verify configuration."""
    denied = _admin_guard(request)
    if denied:
        return denied
    container = request.app.state.container
    ok = container.alert_service.send("🧪 *Test Alert*\nUnified Platform WhatsApp alerts are working correctly!")
    return {"ok": ok, "message": "Test message sent" if ok else "Failed — check CALLMEBOT_PHONE and CALLMEBOT_APIKEY in .env"}

@router.post("/api/alerts/notify-key")
async def notify_key_alert(request: Request, key_name: str = Form(...), expires_at: str = Form("")):
    """Manually trigger a new-key WhatsApp notification (e.g. after sharing key with user)."""
    denied = _admin_guard(request)
    if denied:
        return denied
    container = request.app.state.container
    container.alert_service.notify_new_key(key_name=key_name, expires_at=expires_at or None)
    return {"ok": True}

@router.post("/api/extension/repack")
async def repack_extension(request: Request):
    """Manually trigger a fresh packaging of the browser extension."""
    denied = _admin_guard(request)
    if denied:
        return denied
    container = request.app.state.container
    success = container.extension_service.package_extension()
    if not success:
        raise HTTPException(500, "Failed to package extension. Check backend logs.")
    return {"ok": True, "message": "Extension repackaged successfully"}


@router.get("/api/extension/download")
async def download_extension(request: Request, format: str = "zip"):
    """Package and download a fresh extension artifact in the requested format."""
    denied = _admin_guard(request)
    if denied:
        return denied

    container = request.app.state.container
    filename = _extension_filename_for_format(format)  # validate format before packaging

    success = container.extension_service.package_extension()
    if not success:
        raise HTTPException(500, "Failed to package extension. Check backend logs.")

    artifact_path = container.extension_service.output_dir / filename
    if not artifact_path.exists():
        raise HTTPException(500, f"Packaged extension file not found: {filename}")

    media_type = "application/zip" if filename.endswith(".zip") else "application/octet-stream"
    return FileResponse(path=artifact_path, media_type=media_type, filename=filename)


@router.get("/api/userscripts")
async def list_userscripts(request: Request):
    """Admin listing for backend-controlled userscripts."""
    denied = _admin_guard(request)
    if denied:
        return denied
    
    _USERSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
    scripts: list[dict] = []
    index_path = (_USERSCRIPTS_DIR / "index.json").resolve()
    
    if index_path.is_file():
        try:
            entries = json.loads(index_path.read_text(encoding="utf-8"))
            if isinstance(entries, list):
                for entry in entries:
                    if not isinstance(entry, dict):
                        continue
                    file_name = str(entry.get("file", "")).strip()
                    if not file_name:
                        continue
                    file_path = (_USERSCRIPTS_DIR / file_name).resolve()
                    if _USERSCRIPTS_DIR not in file_path.parents or not file_path.is_file():
                        continue
                    code = file_path.read_text(encoding="utf-8")
                    parsed = parse_userscript_meta(code)
                    scripts.append({
                        "id": str(entry.get("id") or file_path.stem.replace(".user", "")),
                        "file": file_path.name,
                        "name": str(entry.get("name") or parsed["name"] or file_path.stem),
                        "version": str(entry.get("version") or parsed["version"]),
                        "enabled": bool(entry.get("enabled", True)),
                        "matches_count": len(entry.get("matches") if isinstance(entry.get("matches"), list) else parsed["matches"]),
                        "requires_count": len(entry.get("requires") if isinstance(entry.get("requires"), list) else parsed["requires"]),
                        "grants": entry.get("grants") if isinstance(entry.get("grants"), list) else parsed["grants"],
                        "runAt": str(entry.get("runAt") or parsed["runAt"]),
                        "updated_at": file_path.stat().st_mtime,
                        "code": code,
                    })
        except Exception:
            pass
    else:
        for file_path in sorted(_USERSCRIPTS_DIR.glob("*.user.js")):
            if not file_path.is_file():
                continue
            code = file_path.read_text(encoding="utf-8")
            parsed = parse_userscript_meta(code)
            scripts.append({
                "id": file_path.stem.replace(".user", ""),
                "file": file_path.name,
                "name": parsed["name"] or file_path.stem,
                "version": parsed["version"],
                "enabled": True,
                "matches_count": len(parsed["matches"]),
                "requires_count": len(parsed["requires"]),
                "grants": parsed["grants"],
                "runAt": parsed["runAt"],
                "updated_at": file_path.stat().st_mtime,
                "code": code,
            })
    
    return {"scripts": scripts, "count": len(scripts)}


@router.post("/api/userscripts")
async def create_userscript(request: Request):
    """Create a new backend-controlled userscript."""
    denied = _admin_guard(request)
    if denied:
        return denied
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")
    
    code_body = body.get("code", "").strip()
    if not code_body:
        raise HTTPException(400, "code is required")
    
    meta = parse_userscript_meta(code_body)
    
    name = (body.get("name") or meta["name"] or "").strip()
    if not name:
        raise HTTPException(400, "Userscript name is required (either in headers or as a separate field)")
        
    uid = re.sub(r"\W+", "_", name.lower())
    version = (body.get("version") or meta["version"] or "0.0.0").strip()
    matches = body.get("matches") if body.get("matches") is not None else meta["matches"]
    if not isinstance(matches, list) or not matches:
        matches = ["<all_urls>"]
    runAt = (body.get("runAt") or meta["runAt"] or "document-idle").strip()
    
    final_code = _ensure_headers(name, version, matches, runAt, code_body)
    _USERSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
    file_path = _USERSCRIPTS_DIR / f"{uid}.user.js"
    if file_path.exists():
        raise HTTPException(400, f"Userscript with id {uid} already exists")
    file_path.write_text(final_code, encoding="utf-8")
    _update_index()
    return {"ok": True, "id": uid}


@router.put("/api/userscripts/{uid}")
async def update_userscript(request: Request, uid: str):
    """Update an existing backend-controlled userscript."""
    denied = _admin_guard(request)
    if denied:
        return denied
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")
    
    code_body = body.get("code", "").strip()
    if not code_body:
        raise HTTPException(400, "code is required")
    
    meta = parse_userscript_meta(code_body)
    
    name = (body.get("name") or meta["name"] or "").strip()
    if not name:
        raise HTTPException(400, "Userscript name is required (either in headers or as a separate field)")
    
    version = (body.get("version") or meta["version"] or "0.0.0").strip()
    matches = body.get("matches") if body.get("matches") is not None else meta["matches"]
    if not isinstance(matches, list) or not matches:
        matches = ["<all_urls>"]
    runAt = (body.get("runAt") or meta["runAt"] or "document-idle").strip()
    
    final_code = _ensure_headers(name, version, matches, runAt, code_body)
    file_path = _USERSCRIPTS_DIR / f"{uid}.user.js"
    if not file_path.exists():
        raise HTTPException(404, f"Userscript {uid} not found")
    file_path.write_text(final_code, encoding="utf-8")
    _update_index()
    return {"ok": True, "id": uid}


@router.delete("/api/userscripts/{uid}")
async def delete_userscript(request: Request, uid: str):
    """Delete a backend-controlled userscript."""
    denied = _admin_guard(request)
    if denied:
        return denied
    file_path = _USERSCRIPTS_DIR / f"{uid}.user.js"
    if not file_path.exists():
        raise HTTPException(404, f"Userscript {uid} not found")
    file_path.unlink()
    _update_index()
    return {"ok": True}


# ── QR Code Image Upload ──────────────────────────────────────────────────────

_QR_DIR = get_project_root() / "data" / "uploads"
_QR_DIR.mkdir(parents=True, exist_ok=True)

@router.post("/api/settings/upload-qr")
async def upload_qr_image(request: Request, file: UploadFile = File(...)):
    """Upload a QR code image for UPI payments. Saves as data/uploads/qr_code.png"""
    denied = _admin_guard(request)
    if denied:
        return denied
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "Only image files allowed")
    
    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename else "png"
    if ext not in ("png", "jpg", "jpeg", "gif", "webp"):
        ext = "png"
    filename = f"qr_code.{ext}"
    filepath = _QR_DIR / filename
    
    content = await file.read()
    filepath.write_bytes(content)
    
    # Save the URL to settings
    container = request.app.state.container
    qr_url = f"/admin/api/settings/qr-image"
    container.db.set_setting("payment.qr_image_url", qr_url)
    
    return {"ok": True, "url": qr_url, "filename": filename}


@router.get("/api/settings/qr-image")
async def get_qr_image(request: Request):
    """Serve the uploaded QR code image."""
    denied = _admin_guard(request)
    if denied:
        return denied
    for ext in ("png", "jpg", "jpeg", "gif", "webp"):
        fp = _QR_DIR / f"qr_code.{ext}"
        if fp.exists():
            media = { "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
                      "gif": "image/gif", "webp": "image/webp" }
            return FileResponse(fp, media_type=media.get(ext, "image/png"))
    raise HTTPException(404, "No QR image uploaded")

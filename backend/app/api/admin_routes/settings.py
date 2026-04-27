from __future__ import annotations
import os
from fastapi import APIRouter, Request, Form, HTTPException
from fastapi.responses import RedirectResponse
from .utils import _admin_guard, _write_auto_backup

router = APIRouter(tags=["admin-settings"])

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
            row["value_display"] = row["value"][:4] + "****" + row["value"][-2:]
            row["is_secret"] = True
        else:
            row["value_display"] = row["value"]
            row["is_secret"] = False
        masked.append(row)
    return {"settings": masked}

@router.post("/api/settings")
async def save_setting(
    request: Request,
    key: str = Form(...),
    value: str = Form(...),
):
    """Save a single platform setting to the DB."""
    denied = _admin_guard(request)
    if denied:
        return denied
    container = request.app.state.container
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
        "enabled":       svc._enabled,
        "phone_set":     bool(svc._phone),
        "apikey_set":    bool(svc._apikey),
        "phone_preview": (svc._phone[:4] + "****" + svc._phone[-3:]) if len(svc._phone) > 7 else "not set",
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


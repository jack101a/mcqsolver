from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Form, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse

from .utils import _admin_guard

router = APIRouter(tags=["admin-locators"])

@router.post("/locators/approve")
async def approve_locator(request: Request, locator_id: int = Form(...)):
    denied = _admin_guard(request)
    if denied:
        return denied
    container = request.app.state.container
    container.db.approve_locator(locator_id)
    return RedirectResponse(url="/admin/", status_code=303)

@router.post("/locators/reject")
async def reject_locator(request: Request, locator_id: int = Form(...)):
    denied = _admin_guard(request)
    if denied:
        return denied
    container = request.app.state.container
    container.db.reject_locator(locator_id)
    return RedirectResponse(url="/admin/", status_code=303)


@router.get("/api/captcha/export")
async def export_captcha_config(request: Request) -> Any:
    """Export all field mappings and approved locators as JSON."""
    denied = _admin_guard(request)
    if denied:
        return denied
    container = request.app.state.container
    return JSONResponse({
        "field_mappings": container.db.models.get_all_field_mappings(),
        "locators": container.db.get_approved_locators(),
    })


@router.post("/api/captcha/import")
async def import_captcha_config(request: Request) -> Any:
    """Import field mappings and locators from a JSON file."""
    denied = _admin_guard(request)
    if denied:
        return denied
    container = request.app.state.container
    try:
        payload = await request.json()
        model_id_by_filename = {
            str(row.get("ai_model_filename") or ""): int(row["id"])
            for row in container.db.get_model_registry()
            if row.get("ai_model_filename") and row.get("id") is not None
        }
        for fm in payload.get("field_mappings", []) or []:
            domain = container.db.settings._normalize_domain(fm.get("domain"))
            field_name = str(fm.get("field_name") or "").strip()
            task_type = str(fm.get("task_type") or "image").strip() or "image"
            filename = str(fm.get("ai_model_filename") or "").strip()
            ai_model_id = model_id_by_filename.get(filename)
            if domain and field_name and ai_model_id:
                container.db.set_field_mapping(
                    domain=domain,
                    field_name=field_name,
                    task_type=task_type,
                    ai_model_id=ai_model_id,
                    source_data_type=fm.get("source_data_type") or task_type,
                    source_selector=fm.get("source_selector") or "",
                    target_data_type=fm.get("target_data_type") or "text",
                    target_selector=fm.get("target_selector") or "",
                )

        container.db.bulk_replace_approved_locators(payload.get("locators", {}) or {})
        return JSONResponse({"ok": True})
    except Exception as e:
        raise HTTPException(400, detail=str(e))

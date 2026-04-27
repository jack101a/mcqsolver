from __future__ import annotations
from fastapi import APIRouter, Request, Form
from fastapi.responses import RedirectResponse
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

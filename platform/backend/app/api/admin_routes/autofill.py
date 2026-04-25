from __future__ import annotations
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
from .utils import _admin_guard

router = APIRouter(tags=["admin-autofill"])

@router.get("/api/autofill/proposals")
async def get_autofill_proposals(request: Request) -> JSONResponse:
    """List proposals for admin review."""
    denied = _admin_guard(request)
    if denied:
        return denied
    container = request.app.state.container
    status = request.query_params.get("status")
    if status == "all":
        status = None
    proposals = container.db.get_autofill_proposals(status=status)
    return JSONResponse(proposals)

@router.post("/api/autofill/proposals/{proposal_id}/approve")
async def approve_autofill_proposal(request: Request, proposal_id: int) -> JSONResponse:
    """Approve a proposal and generate a server_rule_id."""
    denied = _admin_guard(request)
    if denied:
        return denied
    container = request.app.state.container
    try:
        server_rule_id = container.db.approve_autofill_proposal(proposal_id, reviewed_by="admin")
        return JSONResponse({"ok": True, "server_rule_id": server_rule_id})
    except Exception as e:
        raise HTTPException(400, str(e))

@router.post("/api/autofill/proposals/{proposal_id}/reject")
async def reject_autofill_proposal(request: Request, proposal_id: int) -> JSONResponse:
    """Reject a proposal."""
    denied = _admin_guard(request)
    if denied:
        return denied
    container = request.app.state.container
    container.db.reject_autofill_proposal(proposal_id, reviewed_by="admin")
    return JSONResponse({"ok": True})

@router.post("/api/autofill/proposals/bulk-approve")
async def bulk_approve_autofill_proposals(request: Request) -> JSONResponse:
    """Approve multiple proposals."""
    denied = _admin_guard(request)
    if denied:
        return denied
    container = request.app.state.container
    try:
        body = await request.json()
        proposal_ids = body.get("proposal_ids", [])
        results = []
        for pid in proposal_ids:
            try:
                rid = container.db.approve_autofill_proposal(pid, reviewed_by="admin")
                results.append(rid)
            except Exception:
                pass
        return JSONResponse({"ok": True, "count": len(results)})
    except Exception as e:
        raise HTTPException(400, str(e))

@router.post("/api/autofill/proposals/bulk-reject")
async def bulk_reject_autofill_proposals(request: Request) -> JSONResponse:
    """Reject multiple proposals."""
    denied = _admin_guard(request)
    if denied:
        return denied
    container = request.app.state.container
    try:
        body = await request.json()
        proposal_ids = body.get("proposal_ids", [])
        for pid in proposal_ids:
            container.db.reject_autofill_proposal(pid, reviewed_by="admin")
        return JSONResponse({"ok": True, "count": len(proposal_ids)})
    except Exception as e:
        raise HTTPException(400, str(e))

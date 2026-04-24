"""API route definitions."""

from __future__ import annotations

import base64
import logging
import time
import uuid
from collections import deque
from pathlib import Path
from urllib.parse import urlsplit
from fastapi import APIRouter, HTTPException, Request

from app.core.security import is_valid_base64
from app.models.schemas import (
    KeyCreateRequest,
    KeyCreateResponse,
    KeyRevokeRequest,
    SolveRequest,
    SolveResponse,
    VerifyResponse,
    ReportRequest,
    LocatorProposeRequest,
    FieldMappingProposeRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1", tags=["v1"])

_REPORT_WINDOW_SECONDS = 60
_REPORT_MAX_PER_WINDOW = 20
_report_buckets: dict[tuple[int, str], deque[float]] = {}
_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_DATASETS_DIR = (_PROJECT_ROOT / "backend" / "datasets").resolve()


def _normalize_domain(domain: str | None) -> str:
    token = str(domain or "").strip().lower()
    if not token:
        return ""
    if "://" in token:
        try:
            token = urlsplit(token).hostname or token
        except Exception:
            pass
    token = token.split("/", 1)[0].split(":", 1)[0].strip(".")
    if token.startswith("www."):
        token = token[4:]
    return token


def _allow_report(key_id: int, domain: str) -> bool:
    now = time.monotonic()
    bucket_key = (key_id, domain)
    q = _report_buckets.setdefault(bucket_key, deque())
    while q and (now - q[0]) > _REPORT_WINDOW_SECONDS:
        q.popleft()
    if len(q) >= _REPORT_MAX_PER_WINDOW:
        return False
    q.append(now)
    return True


@router.post("/solve", response_model=SolveResponse)
async def solve(request: Request, payload: SolveRequest) -> SolveResponse:
    """Solve task with model queue and return result."""

    container = request.app.state.container
    key_record = request.state.api_key_record
    client_ip = request.client.host if request.client else None
    
    normalized_domain = _normalize_domain(payload.domain)

    # Check access control for allowed domains
    if normalized_domain:
        global_access = container.db.get_global_access()
        if not global_access:
            if not container.db.is_domain_allowed(normalized_domain):
                raise HTTPException(status_code=403, detail="Domain not allowed by server policy.")
        # API-key specific domain scope (all domains or selected list).
        if not container.db.is_domain_allowed_for_key(int(key_record["id"]), normalized_domain):
            raise HTTPException(status_code=403, detail="Domain not allowed for this API key.")

    logger.info(
        "solve_request_received",
        extra={
            "context": {
                "key_id": key_record.get("id"),
                "task_type": payload.type,
                "mode": payload.mode,
                "domain": payload.domain,
                "field_name": payload.field_name,
                "payload_size": len(payload.payload_base64),
            }
        },
    )
    if not is_valid_base64(payload.payload_base64):
        raise HTTPException(status_code=400, detail="payload_base64 invalid")

    try:
        logger.info(
            "solve_payload_decoded",
            extra={
                "context": {
                    "task_type": payload.type,
                    "key_id": key_record.get("id"),
                "domain": payload.domain,
                    "field_name": payload.field_name,
                }
            },
        )
        solved = await container.solver_service.submit(
            task_type=payload.type,
            payload_base64=payload.payload_base64,
            mode=payload.mode,
            domain=normalized_domain or None,
            field_name=payload.field_name,
        )
        container.usage_service.record(
            key_id=int(key_record["id"]),
            task_type=payload.type,
            status="ok",
            processing_ms=solved["processing_ms"],
            model_used=solved.get("model_used"),
            domain=normalized_domain or None,
            ip=client_ip,
        )
        
        logger.info(
            "solve_response_generated",
            extra={
                "context": {
                    "task_type": payload.type,
                    "processing_ms": solved["processing_ms"],
                    "cached": solved.get("cached", False),
                    "model_used": solved.get("model_used"),
                    "field_name": payload.field_name,
                    "result_preview": solved["result"][:32],
                }
            },
        )
        return SolveResponse(**solved)
    except Exception as error:
        container.usage_service.record(
            key_id=int(key_record["id"]),
            task_type=payload.type,
            status="error",
            processing_ms=0,
            model_used=None,
            domain=normalized_domain or None,
            ip=client_ip,
        )
        logger.exception("solve_failed", extra={"context": {"error": str(error)}})
        raise HTTPException(status_code=500, detail="solve failed") from error


@router.post("/report")
async def report(request: Request, payload: ReportRequest) -> dict:
    """Store failed payload file on backend datasets folder."""
    _container = request.app.state.container
    _key_record = request.state.api_key_record
    key_id = int(_key_record["id"])
    
    if not is_valid_base64(payload.payload_base64):
        raise HTTPException(status_code=400, detail="payload_base64 invalid")
    normalized_domain = _normalize_domain(payload.domain)
    if not normalized_domain:
        raise HTTPException(status_code=400, detail="domain invalid")
    if not _allow_report(key_id=key_id, domain=normalized_domain):
        raise HTTPException(status_code=429, detail="report rate limit exceeded for domain")
        
    datasets_dir = _DATASETS_DIR
    datasets_dir.mkdir(parents=True, exist_ok=True)
    
    # Save the base64 image as a PNG file
    try:
        raw = payload.payload_base64
        if "," in raw and raw.startswith("data:"):
            raw = raw.split(",", 1)[1]
        binary = base64.b64decode(raw)
        
        file_id = uuid.uuid4().hex[:12]
        filename = f"{normalized_domain}_{file_id}.png"
        filepath = datasets_dir / filename
        
        with filepath.open("wb") as f:
            f.write(binary)
            
        return {"status": "reported", "filename": filename, "saved_path": str(filepath)}
    except Exception as error:
        logger.exception("report_failed", extra={"context": {"error": str(error)}})
        raise HTTPException(status_code=500, detail="report failed") from error


@router.get("/auth/verify", response_model=VerifyResponse)
async def verify(request: Request) -> VerifyResponse:
    """Verify active API key from middleware state."""

    key_record = request.state.api_key_record
    return VerifyResponse(
        valid=True,
        key_name=str(key_record["name"]),
        expires_at=key_record["expires_at"],
    )


@router.get("/usage")
async def usage(request: Request) -> dict:
    """Return usage summary for active key."""

    container = request.app.state.container
    key_record = request.state.api_key_record
    summary = container.db.get_usage_summary(key_id=int(key_record["id"]))
    return {
        "key_name": key_record["name"],
        "usage": summary,
    }


@router.post("/key/create", response_model=KeyCreateResponse)
async def create_key(request: Request, payload: KeyCreateRequest) -> KeyCreateResponse:
    """Create new API key with optional expiration."""

    container = request.app.state.container
    _key_id, plain, expires_at = container.key_service.create_key(
        name=payload.name,
        expiry_days=payload.expiry_days,
    )
    return KeyCreateResponse(api_key=plain, expires_at=expires_at)


@router.post("/key/revoke")
async def revoke_key(request: Request, payload: KeyRevokeRequest) -> dict:
    """Revoke API key."""

    container = request.app.state.container
    if not container.key_service.revoke_key(payload.api_key):
        raise HTTPException(status_code=404, detail="key not found")
    return {"revoked": True}


@router.get("/locators")
async def get_locators(request: Request) -> dict:
    """Get all approved global locators."""
    container = request.app.state.container
    return container.db.get_approved_locators()


@router.get("/field-mappings")
async def get_field_mappings(request: Request) -> dict:
    """Get active field mappings for a domain."""
    container = request.app.state.container
    domain = _normalize_domain(request.query_params.get("domain", ""))
    if not domain:
        return {}
    return container.db.get_domain_field_mappings(domain)


@router.get("/field-mappings/routes")
async def get_all_field_mapping_routes(request: Request) -> dict:
    """Get all field routes grouped by domain for extension sync."""
    container = request.app.state.container
    return container.db.get_all_domain_field_mappings()


@router.post("/locators/propose")
async def propose_locator(request: Request, payload: LocatorProposeRequest) -> dict:
    """Propose a new locator for a domain."""
    container = request.app.state.container
    container.db.propose_locator(payload.domain, payload.image_selector, payload.input_selector)
    return {"status": "proposed"}


@router.post("/field-mappings/propose")
async def propose_field_mapping(request: Request, payload: FieldMappingProposeRequest) -> dict:
    """Submit a source->target field pair proposal from extension for admin review."""
    container = request.app.state.container
    key_record = request.state.api_key_record
    container.db.propose_field_mapping(
        domain=payload.domain.strip(),
        task_type=payload.task_type,
        source_data_type=payload.source_data_type.strip(),
        source_selector=payload.source_selector.strip(),
        target_data_type=payload.target_data_type.strip(),
        target_selector=payload.target_selector.strip(),
        proposed_field_name=payload.proposed_field_name.strip(),
        reported_by=int(key_record["id"]),
    )
    return {"status": "proposed"}

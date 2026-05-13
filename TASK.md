# TASK.md - Phase 8 API Key Creation Reliability

## Goal
Fix the bug where creating an API key can show an error, then after refresh the key exists but cannot be opened/revealed from the dashboard.

## Status
COMPLETED

## Scope Included
- Inspect admin API-key creation routes and frontend create-key modal flow.
- Identify side effects that can fail after a key row is inserted.
- Make key creation transactional or return the created plain key with non-fatal warnings.
- Ensure frontend opens the key modal whenever `api_key` is present, even if warnings exist.
- Add focused tests or smoke checks for success and side-effect warning behavior.

## Scope Excluded
- No full key-management redesign.
- No long-term encrypted key reveal feature in this phase.
- No subscription/payment flow changes except where directly tied to API key creation.

## Steps
1. DONE - Read admin key routes, key services, alert side effects, and frontend key creation component.
2. DONE - Reproduce/trace the failure shape from code.
3. DONE - Patch backend so post-create side effects cannot turn a persisted key into an HTTP error.
4. DONE - Patch frontend to display key if `api_key` exists and show warnings separately.
5. DONE - Run backend syntax/smoke checks and frontend build.
6. DONE - Update `STATE.md`.

## Verification Approach
- `python -m py_compile` for changed backend Python files.
- Focused key creation test or direct route/service smoke where possible.
- `npm run build` for frontend changes.

## Verification Result
- `python -m py_compile backend/app/api/admin_routes/keys.py` passed.
- Focused route smoke confirmed a failing alert returns HTTP 201 with `api_key` and warning metadata.
- Focused route smoke confirmed a critical domain-scope failure revokes the newly-created key and returns a clear HTTP 500.
- `npm run build` passed for the admin frontend.

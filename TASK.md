# TASK.md - API Key Entitlements And User Sync

## Goal
Add backend-provided user/account entitlement fields so normal users see subscription info and only receive services allowed by the admin backend.

## Status
COMPLETED

## Scope Included
- Inspect API key database schema, admin key/user routes, and auth verify response.
- Add storage for plan, mobile, Telegram ID, enabled services, rate limit, and expiry metadata if missing.
- Return these fields from `/v1/auth/verify` so extension user mode can auto-sync them.
- Add/admin-route support for viewing and updating per-key service entitlements.
- Keep existing admin/master behavior working.
- Verify backend compile/API smoke and extension JS syntax if touched.

## Scope Excluded
- No STALL script method deployment.
- No auth/face-auth/exam-flow bypass scripting.
- No full Telegram registration redesign in this pass.

## Steps
1. Inspect API key schema and admin key routes. - DONE
2. Patch database migration/helpers for entitlement fields. - DONE
3. Patch auth verify response/schema. - DONE
4. Patch admin key API to expose/update entitlement fields. - DONE
5. Patch extension storage only if field names differ. - DONE
6. Verify and update `STATE.md`. - DONE

## Verification Approach
- Python compile/import checks.
- Focused direct database/service smoke for entitlement defaults.
- `rg` checks for verify response fields and admin update paths.

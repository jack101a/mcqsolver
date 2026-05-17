# TASK.md - Fix PostgreSQL Runtime URL Resolution

## Goal
Fix Docker PostgreSQL auth mismatch by ensuring app DB connection never falls back to hardcoded local credentials when `database_url` is blank.

## Status
COMPLETED

## Scope Included
- Trace DB URL resolution path in config and DB init.
- Remove hardcoded PostgreSQL fallback URL from runtime DB initialization.
- Preserve env-driven behavior via `POSTGRES_*` or `DATABASE_URL`.

## Scope Excluded
- Docker orchestration changes unrelated to DB URL resolution.
- Broad refactors in config system.

## Plan
- [x] Inspect config + DB initialization code for DB URL fallback behavior.
- [x] Apply minimal patch so PostgreSQL mode requires env-derived URL and fails clearly if missing.
- [x] Verify with targeted runtime checks (success path + missing-password edge case).

## Verification Approach
- Run a Python check with PostgreSQL env vars set to confirm resolved URL uses provided password.
- Run an edge-case check with missing password to confirm explicit error instead of hidden fallback.

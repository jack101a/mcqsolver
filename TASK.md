# TASK.md - Remove SQLite Fallback And Stabilize PostgreSQL

## Goal
Remove silent SQLite fallback behavior so API/worker use PostgreSQL consistently and fail fast on bad DB auth/config.

## Status
COMPLETED

## Scope Included
- Remove legacy fallback behavior from `Database` facade in PostgreSQL mode.
- Keep sqlite behavior intact when explicitly configured with `DB_TYPE=sqlite`.
- Verify tests and lint after changes.

## Scope Excluded
- Compose secret rotation and live production env edits.
- Worker timeout tuning.

## Plan
- [x] Inspect `Database` facade and startup wiring.
- [x] Prevent sqlite initialization/connection in PostgreSQL mode.
- [x] Keep master key initialization in PostgreSQL path.
- [x] Run test and lint verification.

## Verification Approach
- `python -m pytest backend/tests -q`
- `ruff check backend/app/core/database.py backend/app/core/container.py`

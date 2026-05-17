# STATE.md - Remove SQLite Fallback And Stabilize PostgreSQL

## Status
COMPLETED

## Active Task
Remove SQLite fallback behavior that caused API/worker drift and enforce PostgreSQL-only runtime behavior when `DB_TYPE=postgresql`.

## Last Files Modified
- `backend/app/core/database.py`
- `backend/app/core/container.py`
- `TASK.md`
- `STATE.md`

## Last Command Run
`ruff check backend/app/core/database.py backend/app/core/container.py`

## Last Output/Error
- Pytest passed: `10 passed in 4.70s`.
- Ruff passed: `All checks passed!`.
- Database facade no longer initializes or connects sqlite in PostgreSQL mode.

## Immediate Next Step
Redeploy API + worker with identical Postgres environment values (`DB_TYPE`, `POSTGRES_*`, optional `DATABASE_URL`), then verify logs no longer show `legacy_database_forced_to_sqlite` or Postgres auth failures.

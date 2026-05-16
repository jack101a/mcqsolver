# TASK.md - Switch Runtime To PostgreSQL And Validate

## Goal
Switch runtime to PostgreSQL and verify learning data migration plus read/write readiness in this environment.

## Status
COMPLETE

## Scope Included
- Do not touch `TASK_QUEUE_REMAINING.md`.
- Bring up PostgreSQL service for test.
- Run one-time migration of `exam_learned` and `exam_attempts` from SQLite to PostgreSQL.
- Verify row counts in PostgreSQL after migration.
- Set compose default to PostgreSQL for deploy readiness.

## Scope Excluded
- ONNX or other ML model training.
- Importing or using `exam_offline.zip`.
- Editing `TASK_QUEUE_REMAINING.md`.

## Plan
- [x] Re-read active task/state and AGENTS.md.
- [x] Create/update this task plan before actions.
- [ ] Start PostgreSQL service and confirm it is reachable. `[BLOCKED: docker command not available in this environment]`
- [ ] Run migration to PostgreSQL target. `[BLOCKED: requires reachable Postgres service]`
- [ ] Verify migrated data counts in PostgreSQL tables. `[BLOCKED: requires reachable Postgres service]`
- [x] Patch docker compose defaults to PostgreSQL.
- [x] Update `STATE.md` with exact outcomes and next steps.

## Verification Approach
- `docker compose up -d postgres`
- `python backend\scripts\migrate_exam_learning_to_sqlalchemy.py --database-url ...`
- Query PostgreSQL for `exam_learned` and `exam_attempts` counts.

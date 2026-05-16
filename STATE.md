# STATE.md - Switch Runtime To PostgreSQL And Validate

## Status
COMPLETE

## Active Task
Switched deploy defaults to PostgreSQL and attempted runtime validation/migration tests.

## Last Files Modified
- `TASK.md`
- `STATE.md`
- `docker-compose.yml`

## Last Command Run
`$env:AUTH_HASH_SALT='dev-test-salt'; $env:ADMIN_TOKEN='dev-test-admin'; python backend\scripts\migrate_exam_learning_to_sqlalchemy.py --dry-run --database-url "postgresql+psycopg2://sa_helper:sa_helper@localhost:5432/sa_helper"`

## Last Output/Error
Completed:
- Updated `docker-compose.yml` defaults from `DB_TYPE=sqlite` to `DB_TYPE=postgresql` for `api`, `worker`, and `telegram-bot`.
- Verified compose syntax parses successfully (`docker-compose.yml: OK`).
- Verified migration script targets PostgreSQL in dry-run mode.
- Dry-run read current SQLite source rows: `exam_learned=31`, `exam_attempts=43`.

Blocked:
- `docker compose up -d postgres` failed because `docker` command is not available in this environment (`CommandNotFoundException`).
- Live Postgres migration write and row-count verification could not run here without Docker/Postgres runtime.
- `TASK_QUEUE_REMAINING.md` was not touched.

## Immediate Next Step
On the Docker host (where Docker is installed), run:
1. `docker compose up -d postgres`
2. `python backend\scripts\migrate_exam_learning_to_sqlalchemy.py --database-url "postgresql+psycopg2://sa_helper:sa_helper@localhost:5432/sa_helper"`
3. Verify counts directly in Postgres for `exam_learned` and `exam_attempts`.

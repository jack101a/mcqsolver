# STATE.md - Fix PostgreSQL Runtime URL Resolution

## Status
COMPLETED

## Active Task
Remove hardcoded PostgreSQL fallback URL so Docker runtime env is the only credential source.

## Last Files Modified
- `backend/app/core/db.py`
- `TASK.md`
- `STATE.md`

## Last Command Run
`$env:PYTHONPATH='backend'; $env:DB_TYPE='postgresql'; ...; python -c "... init_db(s) ..."`

## Last Output/Error
Verification passed:
- With `POSTGRES_PASSWORD=abc123`, resolved URL was `postgresql+psycopg2://sa_helper:abc123@postgres:5432/sa_helper`.
- With missing `POSTGRES_PASSWORD`, app now raises:
  `RuntimeError: DB_TYPE=postgresql requires DATABASE_URL or POSTGRES_* environment variables (including POSTGRES_PASSWORD).`

## Immediate Next Step
Run stack on host with real env values and confirm containers connect:
1. `cd C:\codex\Antigravity\mcqsolver`
2. `docker compose up -d`
3. `docker compose logs --tail=200 api postgres`

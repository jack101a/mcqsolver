# STATE.md - Plain Compose Rewrite

## Status
COMPLETE

## Active Task
Rewrote Docker Compose in the user's preferred plain explicit style, without YAML anchors or hidden merges.

## Last Files Modified
- `docker-compose.yml`
- `TASK.md`
- `STATE.md`

## Last Command Run
`python -c "import yaml; c=yaml.safe_load(open('backend/config/config.yaml', encoding='utf-8')); print(c['storage']['db_type'], c['redis']['url'], c['telegram']['api_base_url'])"`

## Last Output/Error
Completed:
- Removed all `x-` extension blocks and `<<` YAML merges from `docker-compose.yml`.
- Made each service explicit:
  - `api`
  - `worker`
  - `telegram-bot`
  - `telegram-bot-api`
  - `postgres`
  - `redis`
- Kept app service env minimal and visible in each service:
  - `CONFIG_PATH=/app/backend/config/config.yaml`
  - seed import controls
- Kept host paths clear through `SA_HELPER_HOST_ROOT`.

Verification:
- YAML parse passed for `docker-compose.yml` and `backend/config/config.yaml`.
- Parsed key config values:
  - `postgresql`
  - `redis://redis:6379/0`
  - `http://telegram-bot-api:8081`

Note:
- Docker is not installed in this workspace, so `docker compose config` could not be run here.

## Immediate Next Step
Use the plain `docker-compose.yml` in Portainer/deployment. App settings remain in mounted `sa_helper/config/config.yaml`.

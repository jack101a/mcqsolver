# TASK.md - Plain Compose Rewrite

## Goal
Rewrite Docker Compose in a plain explicit style like the user's original compose, without YAML anchors or hidden merges.

## Status
COMPLETE

## Scope Included
- Remove `x-` anchors and `<<` merges.
- Keep all services explicit: api, worker, telegram-bot, telegram-bot-api, postgres, redis.
- Keep minimal app env in each app service.
- Keep clear host path variable `SA_HELPER_HOST_ROOT`.
- Verify YAML and app settings load.

## Scope Excluded
- Running Docker locally; Docker is not installed in this workspace.

## Plan
- [x] Read AGENTS/STATE/TASK and check worktree.
- [x] Inspect current compose.
- [x] Rewrite compose explicitly.
- [x] Validate YAML and config values.
- [x] Update `STATE.md`.

## Verification Approach
- YAML parse for `docker-compose.yml` and `backend/config/config.yaml`.
- Parse key config values.

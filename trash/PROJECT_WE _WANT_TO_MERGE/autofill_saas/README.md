# Autofill SaaS

Monorepo implementing an intelligent autofill and workflow automation system with:

- `apps/api`: backend modules (auth, profiles, workflows, execution, AI, captcha, sync, subscription, admin, telemetry)
- `apps/extension-chrome`: Chrome extension shell (popup, overlay, options, background runtime)
- `apps/extension-firefox`: Firefox extension shell
- `apps/web-dashboard`: user dashboard shell
- `apps/admin-dashboard`: admin dashboard shell
- `packages/schemas`: shared Zod contracts
- `packages/auth-sdk`, `packages/workflow-sdk`, `packages/telemetry`: shared SDK utilities

## Quick Start

1. `npm install`
2. `npm run dev:api`
3. Open `http://localhost:4000/health`

## PostgreSQL Mode

1. Start PostgreSQL with `docker compose -f infra/docker-compose.postgres.yml up -d`
2. Set:
   - `DATA_STORE_BACKEND=postgres`
   - `RATE_LIMIT_BACKEND=postgres` (optional, enables distributed rate limiting)
   - `EVENT_BUS_BACKEND=postgres` (optional, enables outbox-backed event processing)
   - `EVENT_BUS_BACKEND=kafka` (optional, enables external broker mode)
   - `KAFKA_BROKERS=broker1:9092,broker2:9092` (required for kafka mode)
   - `KAFKA_TOPIC=autofill.events` (optional)
   - `KAFKA_GROUP_ID=autofill-events-group` (optional)
   - `DATABASE_URL=postgres://autofill:autofill@localhost:5432/autofill`
3. Run migration: `npm run migrate --workspace @autofill/api`
4. Start API: `npm run dev:api`

## API Hardening

- Request rate limiting is enabled on non-health endpoints.
- `POST /execution/runs` supports `Idempotency-Key` for safe client retries.
- `POST /execution/runs` is queue-backed; runs are processed asynchronously by background worker.
- Admin audit endpoint supports server-side filters:
  - `/admin/audit?userId=...&actor=...&action=...&limit=100`
- Admin alerts endpoints:
  - `GET /admin/alerts?status=open|acknowledged`
  - `POST /admin/alerts/:id/ack`
- Incident analytics endpoint:
  - `GET /admin/insights/incidents?windowMinutes=60`
- Incident trends endpoint (projected hourly metrics):
  - `GET /admin/insights/incidents/trends?windowHours=24`
- Rebuild projected trends from alerts:
  - `POST /admin/insights/incidents/rebuild`
  - `npm run rebuild:incident-metrics --workspace @autofill/api`
- Automatic alerts are generated for rate-limit spikes and execution failures/degraded runs.

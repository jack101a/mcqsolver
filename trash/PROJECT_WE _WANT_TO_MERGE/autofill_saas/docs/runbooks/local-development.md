# Local Development Runbook

1. Install dependencies with `npm install` from repository root.
2. (Optional persistent mode) start DB: `docker compose -f infra/docker-compose.postgres.yml up -d`.
3. Set `DATA_STORE_BACKEND=postgres` and `DATABASE_URL` if using persistent mode.
4. Run DB bootstrap: `npm run migrate --workspace @autofill/api`.
5. Start API service with `npm run dev:api`.
6. Optional provider env vars for full-stack local simulation:
   - `AI_MAPPER_BASE_URL`, `AI_MAPPER_API_KEY`
   - `CAPTCHA_PROVIDER_BASE_URL`, `CAPTCHA_PROVIDER_API_KEY`
   - `BILLING_WEBHOOK_SECRET`
7. Load extension manifests from:
   - `apps/extension-chrome/manifest.json`
   - `apps/extension-firefox/manifest.json`
8. Use `/auth/register` to create a user and retrieve access token.
9. Create profiles and workflows via API, then trigger runs from extension popup.
10. Start dashboards for local UI testing:
   - User dashboard: `npm run dev:web` (serves `http://127.0.0.1:4101`)
   - Admin dashboard: `npm run dev:admin` (serves `http://127.0.0.1:4100`)
11. Validate web dashboard DOM/JS wiring after UI edits:
   - `npm run validate:ui --workspace @autofill/web-dashboard`
12. Run API smoke integration after changes:
   - `npm run smoke:integration --workspace @autofill/api`
13. Run extension autofill validation harness:
   - `npm run validate:autofill --workspace @autofill/extension-chrome`
   - Report output: `apps/extension-chrome/tests/results/autofill-validation-report.md`
14. DR readiness and restore drill:
   - `npm run dr:preflight --workspace @autofill/api`
   - If TCP reachable, run: `npm run dr:restore-drill --workspace @autofill/api`
   - Or run full sequence: `npm run dr:orchestrate --workspace @autofill/api`
   - Default target if `DATABASE_URL` unset: `postgres://autofill:autofill@127.0.0.1:5432/autofill`

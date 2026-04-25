# Production Hardening Checklist

## 1) Security Readiness
- Run:
  - `npm run check:security --workspace @autofill/api`
- Must pass:
  - `JWT_SECRET` configured and not default
  - `BILLING_WEBHOOK_SECRET` configured
  - `DATA_STORE_BACKEND=postgres`
  - `DATABASE_URL` configured
- Review warnings:
  - `CORS_ALLOW_ORIGINS` should be explicit allowlist
  - AI/CAPTCHA provider keys present where required

## 2) Schema and Data Safety
- Run:
  - `npm run migrate --workspace @autofill/api`
- Verify:
  - `sync_state` contains `payload` and `device_id` columns
  - all critical tables exist and are queryable

## 3) Disaster Recovery Drill
- Prerequisite:
  - PostgreSQL backend configured
- Run:
  - `npm run dr:restore-drill --workspace @autofill/api`
- Pass criteria:
  - temporary restore schema created and removed
  - row-count parity for critical tables
  - zero mismatches

## 4) Functional Smoke Tests
- Run:
  - `npm run smoke:integration --workspace @autofill/api`
- Pass criteria:
  - auth/register/login path
  - subscription upgrade and billing webhook apply
  - workflow run lifecycle and decision API
  - sync push/pull merge behavior
  - captcha fallback path

## 5) Extension Quality Gate
- Run:
  - `npm run validate:autofill --workspace @autofill/extension-chrome`
- Pass criteria:
  - field detection accuracy >= 80%
  - fill success rate >= 80%

## 6) Admin Console Check
- Start admin dashboard host and API
- Verify manually:
  - stats load
  - alerts load and acknowledge
  - audit trail filters
  - incident insights query

## 7) Release Readiness
- Confirm:
  - runbooks updated
  - rollback procedure documented
  - environment variable contract finalized
  - known limitations and deferred scope documented

---

## Current Snapshot (Latest Known)
- API smoke integration: passed
- Extension validation harness: passed (>=80% gates met)
- Admin dashboard scaffold replaced with functional multi-panel UI
- Pending before final release:
  - production environment security values
  - postgres-backed DR drill execution in target environment

# Production Deployment Runbook

1. Build and publish image for `apps/api`.
2. Create Kubernetes secret from `infra/k8s/api-secret.example.yaml` with real values.
   - baseline environment contract: `apps/api/.env.production.example`
3. Apply manifests:
   - `infra/k8s/api-deployment.yaml`
   - `infra/k8s/api-service.yaml`
4. Run migration job or execute:
   - `npm run migrate --workspace @autofill/api`
5. Verify readiness:
   - `/health`
   - auth/register flow
   - workflow run with `Idempotency-Key`
   - sync push/pull flow
   - billing webhook signature verification
   - captcha solve fallback path
6. Run automated hardening checks:
   - `npm run check:security --workspace @autofill/api`
   - `npm run smoke:integration --workspace @autofill/api`
   - `npm run dr:restore-drill --workspace @autofill/api` (postgres required)
   - `npm run validate:autofill --workspace @autofill/extension-chrome`
7. Follow full checklist:
   - `docs/runbooks/production-hardening-checklist.md`

Operational checks:
- Watch for `429` spikes to tune rate limits.
- Monitor DB pool saturation and query latency.
- Track audit volume and retention policy compliance.
- For multi-node API, set `RATE_LIMIT_BACKEND=postgres` so limit counters are shared.
- For cross-instance event projection, set `EVENT_BUS_BACKEND=postgres`.
- For external broker mode, set:
  - `EVENT_BUS_BACKEND=kafka`
  - `KAFKA_BROKERS`
  - `KAFKA_TOPIC` and `KAFKA_GROUP_ID` as needed.
- For AI mapping external inference:
  - `AI_MAPPER_BASE_URL`
  - `AI_MAPPER_API_KEY`
  - Optional: `AI_MAPPER_TIMEOUT_MS`, `AI_MAPPER_MAX_RETRIES`
- For captcha external fallback:
  - `CAPTCHA_PROVIDER_BASE_URL`
  - `CAPTCHA_PROVIDER_API_KEY`
  - Optional: `CAPTCHA_PROVIDER_TIMEOUT_MS`, `CAPTCHA_PROVIDER_MAX_RETRIES`
- For billing webhook verification:
  - `BILLING_WEBHOOK_SECRET`
- To rebuild projection data after maintenance:
  - `npm run rebuild:incident-metrics --workspace @autofill/api`

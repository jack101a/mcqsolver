# Release Sign-off Report

- Generated At: 2026-03-29T16:51:42.216Z
- Overall Status: ready_with_dr_pending
- DR Status: blocked (database_unreachable)

## Check Results

### Security Readiness
- Command: `npm.cmd run check:security --workspace @autofill/api`
- Result: PASS
- Exit Code: 0

```text
> @autofill/api@0.1.0 check:security
> node scripts/security-readiness.mjs

[PASS] JWT secret configured - JWT_SECRET appears configured.
[PASS] Billing webhook secret configured - BILLING_WEBHOOK_SECRET appears configured.
[PASS] Persistent datastore backend - Using postgres datastore backend.
[PASS] Database URL configured for postgres backend - DATABASE_URL present.
[PASS] CORS allowlist hardened - CORS_ALLOW_ORIGINS=https://admin.example.com,https://app.example.com
[PASS] AI mapper API key configured - AI mapper key configured.
[PASS] CAPTCHA provider API key configured - CAPTCHA provider key configured.

{
  "checks": 7,
  "failed": 0,
  "warnings": 0
}
```

### API Smoke Integration
- Command: `npm.cmd run smoke:integration --workspace @autofill/api`
- Result: PASS
- Exit Code: 0

```text
> @autofill/api@0.1.0 smoke:integration
> npm run build && node scripts/smoke-integration.mjs


> @autofill/api@0.1.0 build
> tsc -p tsconfig.json

{"level":30,"time":1774803081229,"pid":8380,"hostname":"DESKTOP-7P6NF14","reqId":"req-1","req":{"method":"POST","url":"/auth/register","hostname":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1774803082912,"pid":8380,"hostname":"DESKTOP-7P6NF14","msg":"audit_event","actor":"user","action":"auth.register","userId":"f3ad4ecb-6106-4ddd-9dc7-24256e7c4fb9"}
{"level":30,"time":1774803082955,"pid":8380,"hostname":"DESKTOP-7P6NF14","reqId":"req-1","res":{"statusCode":201},"responseTime":1720.400299999863,"msg":"request completed"}
{"level":30,"time":1774803082958,"pid":8380,"hostname":"DESKTOP-7P6NF14","reqId":"req-2","req":{"method":"POST","url":"/subscription/upgrade/pro","hostname":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1774803082970,"pid":8380,"hostname":"DESKTOP-7P6NF14","msg":"audit_event","actor":"user","action":"subscription.upgrade","userId":"f3ad4ecb-6106-4ddd-9dc7-24256e7c4fb9"}
{"level":30,"time":1774803082972,"pid":8380,"hostname":"DESKTOP-7P6NF14","reqId":"req-2","res":{"statusCode":200},"responseTime":13.674300000071526,"msg":"request completed"}
{"level":30,"time":1774803082974,"pid":8380,"hostname":"DESKTOP-7P6NF14","reqId":"req-3","req":{"method":"POST","url":"/profiles","hostname":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1774803082988,"pid":8380,"hostname":"DESKTOP-7P6NF14","msg":"audit_event","actor":"user","action":"profile.create","userId":"f3ad4ecb-6106-4ddd-9dc7-24256e7c4fb9"}
{"level":30,"time":1774803082990,"pid":8380,"hostname":"DESKTOP-7P6NF14","reqId":"req-3","res":{"statusCode":201},"responseTime":15.828999999910593,"msg":"request completed"}
{"level":30,"time":1774803082992,"pid":8380,"hostname":"DESKTOP-7P6NF14","reqId":"req-4","req":{"method":"POST","url":"/workflows","hostname":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1774803083004,"pid":8380,"hostname":"DESKTOP-7P6NF14","msg":"audit_event","actor":"user","action":"workflow.create","userId":"f3ad4ecb-6106-4ddd-9dc7-24256e7c4fb9"}
{"level":30,"time":1774803083005,"pid":8380,"hostname":"DESKTOP-7P6NF14","reqId":"req-4","res":{"statusCode":201},"responseTime":12.74440000206232,"msg":"request completed"}
{"level":30,"time":1774803083007,"pid":8380,"hostname":"DESKTOP-7P6NF14","reqId":"req-5","req":{"method":"POST","url":"/execution/runs","hostname":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1774803083018,"pid":8380,"hostname":"DESKTOP-7P6NF14","msg":"audit_event","actor":"user","action":"execution.run","userId":"f3ad4ecb-6106-4ddd-9dc7-24256e7c4fb9"}
{"level":30,"time":1774803083020,"pid":8380,"hostname":"DESKTOP-7P6NF14","reqId":"req-5","res":{"statusCode":201},"responseTime":13.36659999936819,"msg":"request completed"}
{"level":30,"time":1774803084145,"pid":8380,"hostname":"DESKTOP-7P6NF14","runId":"05de0ebd-9fbe-4c23-8ec1-04566364e058","status":"waiting_confirmation","msg":"execution_processed"}
{"level":30,"time":1774803085233,"pid":8380,"hostname":"DESKTOP-7P6NF14","reqId":"req-6","req":{"method":"GET","url":"/execution/runs","hostname":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1774803085240,"pid":8380,"hostname":"DESKTOP-7P6NF14","reqId":"req-6","res":{"statusCode":200},"responseTime":7.229800000786781,"msg":"request completed"}
{"level":30,"time":1774803085242,"pid":8380,"hostname":"DESKTOP-7P6NF14","reqId":"req-7","req":{"method":"POST","url":"/execution/runs/05de0ebd-9fbe-4c23-8ec1-04566364e058/decision","hostname":"localhost:80","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1774803085251,"pid":8380,"hostname":"DESKTOP-7P6NF14","msg":"audit_event","actor":"user","action":"execution.decision","user
```

### Extension Autofill Validation
- Command: `npm.cmd run validate:autofill --workspace @autofill/extension-chrome`
- Result: PASS
- Exit Code: 0

```text
> @autofill/extension-chrome@0.1.0 validate:autofill
> node scripts/validate-autofill.mjs

{
  "websitesTested": 3,
  "avgDetectionAccuracy": 1,
  "avgFillSuccessRate": 1,
  "detectionGatePassed": true,
  "fillGatePassed": true
}
```

### Web Dashboard UI Contract
- Command: `npm.cmd run validate:ui --workspace @autofill/web-dashboard`
- Result: PASS
- Exit Code: 0

```text
> @autofill/web-dashboard@0.1.0 validate:ui
> node ./scripts/validate-ui-contract.mjs

UI contract check passed. 52 JS bindings are present in HTML.
```

### DR Restore Drill
- Command: `npm.cmd run dr:restore-drill --workspace @autofill/api`
- Result: FAIL
- Exit Code: 1

```text
> @autofill/api@0.1.0 dr:restore-drill
> node scripts/dr-restore-drill.mjs


DR restore drill failed: Error: connect ECONNREFUSED 127.0.0.1:5432
    at E:\codex\autofill_saas\node_modules\pg-pool\index.js:45:11
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
    at async main (file:///E:/codex/autofill_saas/apps/api/scripts/dr-restore-drill.mjs:38:18) {
  errno: -4078,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 5432
}
npm error Lifecycle script `dr:restore-drill` failed with error:
npm error code 1
npm error path E:\codex\autofill_saas\apps\api
npm error workspace @autofill/api@0.1.0
npm error location E:\codex\autofill_saas\apps\api
npm error command failed
npm error command C:\Windows\system32\cmd.exe /d /s /c node scripts/dr-restore-drill.mjs
```

## Conclusion
- Functional and security checks passed in this environment, but DR restore drill is blocked due to missing/unreachable PostgreSQL runtime.

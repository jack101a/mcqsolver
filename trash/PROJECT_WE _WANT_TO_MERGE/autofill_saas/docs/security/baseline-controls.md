# Security Baseline Controls

- JWT access and refresh token flow
- Device record binding on login/register
- Per-request auth guard for protected endpoints
- Global request rate limiting (health endpoint excluded)
- Idempotency support for workflow run creation (`Idempotency-Key`)
- Audit trail for auth/profile/workflow/execution operations
- Filtered audit retrieval for admin investigations
- Plan and feature gating before AI/CAPTCHA operations

Before production, replace in-memory storage and static secret defaults with managed datastore and KMS-backed secret management.

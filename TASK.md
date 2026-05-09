# TASK.md - Diagnose STALL Solver CR/Solver Path

## Status: IN PROGRESS

Goal: Find why STALL solver is not working in the captcha/CR-related solver path, not Step 3/4 payload loading.

Scope included:
- Inspect extension captcha solver flow used on STALL/Sarathi pages.
- Inspect CR/captcha route sync and selector mapping data.
- Inspect backend `/v1/solve`, `/v1/field-mappings/routes`, `/v1/locators`, and recent backend logs.
- Identify whether the issue is route/selector mismatch, API key/domain access, backend model failure, or extension message wiring.
- Apply minimal fix if exact cause is found.
- Update `STATE.md`.

Scope excluded:
- Step 3/4 automation payload debugging.
- Broad STALL automation refactor.

Plan:
- [x] Read `AGENTS.md`, `STATE.md`, and current `TASK.md`.
- [ ] Inspect captcha/CR extension modules and route sync.
- [ ] Inspect backend DB data for Sarathi routes/locators/access.
- [ ] Check recent `/v1/solve` and sync logs.
- [ ] Patch minimal mismatch if found.
- [ ] Verify.
- [ ] Update `STATE.md`.

Verification:
- [ ] Backend health and relevant sync endpoints are OK.
- [ ] JS/Python syntax checks pass for touched files.

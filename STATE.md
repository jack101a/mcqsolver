# STATE.md - API Key Entitlements And User Sync

## Status
COMPLETED

## Active Task
Added backend-provided user/account entitlement fields so normal users receive subscription/service details from the admin backend.

## Last Files Modified
- `backend/app/core/database.py`
- `backend/app/core/repositories/api_keys.py`
- `backend/app/models/schemas.py`
- `backend/app/api/routes.py`
- `backend/app/api/admin_routes/keys.py`
- `extension/background.js`
- `frontend/src/app/components/KeysPanel.jsx`
- `frontend/src/app/components/SettingsPanel.jsx`
- `frontend/src/app/hooks/useKeyHandlers.js`
- `frontend/src/app/hooks/useSettingsHandlers.js`
- `frontend/dist/*`
- `backend/app/static/extension.zip`
- `backend/app/static/extensions/mcq_solver_extension.zip`
- `backend/app/static/extensions/mcq_solver_extension.xpi`
- `backend/app/static/extensions/mcq_solver_extension.crx`
- `TASK.md`
- `STATE.md`

## Last Command Run
Ran Python compile checks for changed backend files, `node --check extension/background.js`, `npm run build` in `frontend`, a direct SQLite migration smoke, rebuilt the extension package with `ExtensionService.package_extension()`, and inspected ZIP entries.

## Last Output/Error
Verification passed. Python compile and `node --check` returned exit code 0. Frontend build completed successfully with Vite. Database smoke reported entitlement columns present: `plan_name`, `mobile`, `telegram_id`, `services_json`; existing keys have default services `{autofill: true, captcha: true, stall: true, solver: true, custom: false}`. Extension packaging returned `packaged= True`.

## Key Findings
- The extension auth path uses the legacy `api_keys` table, so entitlement fields were added there for immediate user-mode sync.
- `/v1/auth/verify` now returns plan, mobile, Telegram ID, enabled services, and rate-limit metadata.
- Background sync now stores backend services and applies them to local service toggles.
- Admin create-key form can set plan/mobile/Telegram/services.
- Admin Settings page can update services and user info for existing keys.

## Immediate Next Step
Manual admin UI test: create or edit a user key, disable one service, then log in with that key in the extension and confirm user mode reflects backend-provided plan/services.

# STATE.md - MCQ Stability And Deployment Plan

## Status
COMPLETED

## Active Task
Phase 8 API key creation reliability.

## Last Files Modified
- `backend/app/api/admin_routes/keys.py`
- `frontend/src/app/hooks/useKeyHandlers.js`
- `frontend/src/app/layout/DashboardLayout.jsx`
- `frontend/src/app/App.jsx`
- `TASK.md`
- `STATE.md`

## Last Command Run
Ran `python -m py_compile backend/app/api/admin_routes/keys.py`, focused API-key route smoke checks for non-critical and critical failures, and `npm run build` for the admin frontend.

## Last Output/Error
Phase 8 passed focused verification. Alert failure now returns the created plain key with warnings; domain/rate configuration failure revokes the new key before returning an error.

## Key Findings
- Learned pHash is unsafe because confidence/confirmation gates are too low and pHash distance is too broad.
- Captcha fill speed is limited by human typing delays.
- VCAM is injected/enabled too broadly and can keep canvas/capture timers alive.
- Docker extension download likely fails because `extension/` is missing from the image.
- Telegram bot is not production-wired for Docker and `python-telegram-bot` is missing from requirements.
- API key create can create a key but fail before frontend receives the plain key.
- Protected STALL step payloads should be server-only, fetched on demand, executed, and wiped.
- Extension logout/API-key removal should wipe server-synced data and cached payloads.

## Immediate Next Step
Phase 8 is complete. Next phase from the plan is Phase 9 database split, seed data, and backups.

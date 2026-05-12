# MCQ Stability, Extension Performance, Telegram, Docker Scaling Plan

## Current Findings

### MCQ learned pHash is unsafe today
- `backend/app/services/exam_service.py` answers from `exam_learned.get_by_hash()` and `get_by_phash()` before OCR/LLM fallback.
- `backend/app/core/repositories/exam_learned.py` returns learned rows at `confidence >= 0.6`.
- A new correct feedback row starts at confidence `0.8` with `seen_count = 1`.
- pHash lookup uses max distance `10`, so one early/wrong generalized pHash can be reused for different-looking questions.
- Extension currently clicks if backend returns an answer; there is no trainer-only mode that learns without touching options.

### Captcha feels slow because extension types like a human
- `extension/modules/captcha.js` calls `humanType()`.
- `humanType()` clears/focuses and then types each character with 40-130 ms gaps plus pauses.
- User target is instant fill after captcha image is fully visible, with only one random 300-800 ms pre-fill delay.

### VCAM can consume RAM/GPU because it starts too broadly
- `extension/manifest.json` injects `modules/vcam_inject.js` into Sarathi pages at `document_start`.
- `extension/modules/vcam_controller.js` defaults to `enabled: true` and `force: true`.
- `vcam_inject.js` creates a canvas stream and timer when enabled, even before the user intentionally starts STALL.

### STALL click timing is too late
- `extension/modules/exam.js` has `CLICK_MIN = 12000` and `CLICK_MAX = 19000`.
- User wants click around 18 seconds with +/- 3 seconds randomness.

### Lemur Android step 3/4 failure likely needs message/state hardening
- `content.js` only executes step 4 after receiving `EXECUTE_STALL_STEP` from background.
- `stall_automation.js` updates state to step 4 but relies on background orchestration to push the step 4 message.
- Android/Lemur may suspend service-worker or content-message delivery, so step 4 needs local fallback polling/retry.

### STALL protected scripts should not live inside extension package
- Step 3 and Step 4 payloads should be fetched from the server only when required.
- After execution, fetched payloads should be deleted from extension memory/storage.
- The extension package should not reveal protected automation scripts or bundled business data.
- When a user enters an API key, extension should sync only the data allowed for that key.
- When user removes API key or logs out, extension should wipe server-synced data, cached scripts, and session state.

### Docker extension download failure has a clear likely cause
- `backend/app/services/extension_service.py` expects `root_dir / "extension"`.
- `Dockerfile` copies `backend/`, `data/`, config, and frontend dist, but does not copy `extension/` into `/app/extension`.
- In Docker, packaging can fail with `Extension source directory not found: /app/extension`.

### Telegram bot likely cannot run in deployed Docker today
- `backend/requirements.txt` does not include `python-telegram-bot`.
- `backend/app/main.py` only starts bot in API if `START_TELEGRAM_BOT_IN_API=true`.
- Docker runs uvicorn with `--workers 2`; Telegram polling must be single-process, so bot should be a separate service/process.
- `docker-compose.yml` does not pass Telegram env vars or start a bot service.

### API key create error then key appears
- Admin route creates and stores key, then performs additional side effects before returning.
- If anything after insert fails, the key row remains but frontend never receives the plain key.
- Frontend only remembers keys if the create call succeeds, so refreshed keys cannot be opened later by design.

### Scaling beyond 50-100 users needs a real deployment split
- SQLite plus in-process queues/thread pools can work for small use, but not reliably for many users and multiple API workers.
- Config already has PostgreSQL and Redis fields, but captcha solve queue is still in-process.
- Telegram polling cannot run in each API worker.

### Global seed DB requirement
- Docker currently seeds `/app/data` and config, while runtime DB is `/app/backend/logs/app.db`.
- Static/global assets live in files (`data/questions`, `data/mappings`, hashes, models), but platform tables are mixed into runtime DB.
- Need explicit split between immutable/global seed data and mutable user/subscription/API-key data.

## Implementation Plan

### Phase 1 - Stop Wrong MCQ Auto-Clicks
Goal: prevent learned pHash from clicking unless evidence is strong.

1. Add settings:
   - `exam.learning_mode`: `train_only` or `auto_click`
   - `exam.learn_min_confidence`: default `0.95`
   - `exam.learn_min_confirmations`: default `10`
   - `exam.learn_phash_max_distance`: default lower than current, e.g. `3`
2. Extend `exam_learned`:
   - add `verified_count`, `wrong_count`, `last_verified_at`, `status`
   - status values: `training`, `verified`, `rejected`
3. Change learned lookup:
   - exact hash may answer only when `confidence >= 0.95` and `verified_count >= 10`
   - pHash may answer only when verified and distance is very small
   - otherwise return a candidate with `train_only: true`, not a clickable answer
4. Change extension:
   - in train-only mode, never click learned guesses
   - log/display guessed option, wait for actual score change, then send feedback
5. Change feedback:
   - correct feedback increments `verified_count` and confidence
   - wrong feedback increments `wrong_count`, lowers confidence, and can mark rejected
6. Verification:
   - unit tests for 1/9/10 confirmations
   - wrong pHash candidate never returns clickable answer
   - extension does not click when backend says train-only

### Phase 2 - Captcha Instant Fill
Goal: fill fast after image load, with 300-800 ms random delay.

1. Replace per-character `humanType()` usage for captcha with `fastFillCaptcha()`.
2. Wait for image `complete && naturalWidth > 0`.
3. Add random pre-fill delay `300-800 ms`.
4. Set native value once and dispatch `input`, `change`, maybe `blur`.
5. Keep human typing only as fallback setting if needed.
6. Verification:
   - solve fills within server time + 300-800 ms
   - React/native input events still register.

### Phase 3 - VCAM Only During STALL
Goal: stop broad vcam injection and canvas timers.

1. Default `vcamEnabled` / `sp_vcam_enabled` to false.
2. When popup sends `START_STALL_AUTOMATION`, set storage flag `stallVcamActive=true`.
3. Only initialize `VcamController` if STALL is active or on a STALL-auth page that needs it.
4. Stop vcam loop and tracks when STALL session ends or tab closes.
5. Consider moving `vcam_inject.js` out of static manifest injection and inject it programmatically only into the STALL tab.
6. Verification:
   - ordinary pages do not show vcam logs/timers
   - Chrome task manager GPU drops when STALL not active
   - vcam still works after Start STALL.

### Phase 4 - STALL Timing And Lemur Step 4 Robustness
Goal: click at 18s +/- 3s and avoid Android step stalls.

1. Change MCQ click window to `15000-21000 ms`.
2. Add clear `targetClickAt = questionStart + random(15000, 21000)`.
3. Add local step 4 fallback in `stall_automation.js`:
   - after step 3, poll state and URL
   - if current state is 4 and payload not executed, fetch/execute step 4 locally
   - ack each step with durable storage marker
4. Add retry/backoff for `FETCH_STALL_PAYLOAD` and `SP_EXEC`.
5. Verification:
   - desktop STALL still works
   - Lemur reproducer reaches step 4 without background push.

### Phase 5 - Server-Only STALL Payloads And Data Wipe
Goal: keep protected scripts/data off the extension package and remove synced data on logout.

1. Remove any static Step 3/Step 4 automation payloads from extension package and web-accessible resources.
2. Keep only a thin executor in the extension:
   - request payload by step id from backend
   - execute in the target tab
   - immediately clear payload variables and any temporary storage
3. Backend returns payloads only after API-key validation and authorization.
4. Add short-lived payload nonce or session id:
   - Start STALL creates session
   - step payload request must include session id and current step
   - backend rejects stale/replayed requests
5. Do not persist protected payloads in `chrome.storage.local`.
6. Add logout/remove-key wipe:
   - `normalized_userscripts`
   - STALL step state and cached payloads
   - global/domain route caches fetched from server
   - locators, userscript resources/requires, and other server-synced data
   - keep only non-sensitive UI preferences if needed
7. Verification:
   - unpacked extension does not contain Step 3/Step 4 payload source
   - DevTools storage has no step payload after execution
   - removing API key wipes synced data
   - next login resyncs from server.

### Phase 6 - Docker Extension Packaging Fix
Goal: make extension download work in Docker.

1. Add `COPY extension/ /app/extension/` to Dockerfile.
2. Ensure `ExtensionService.package_extension()` excludes no needed files and logs full source/output paths.
3. Add startup health check for packaging result.
4. Verification:
   - build image
   - `/admin/api/extension/download?format=zip` returns zip
   - zip contains `manifest.json` and modules.

### Phase 7 - Telegram Bot Registration
Goal: reliable bot registration in Docker.

1. Add `python-telegram-bot` to `backend/requirements.txt`.
2. Do not run bot inside multi-worker API by default.
3. Add a separate `telegram-bot` docker-compose service:
   - same image
   - command `python -m app.services.telegram_bot`
   - same DB volume/env
   - one replica only
4. Add admin endpoints:
   - bot config/status
   - test token
   - last bot error/log tail
5. Store `telegram.bot_enabled` and token in DB/env with clear priority.
6. Verification:
   - bot starts from saved admin token
   - `/register -> plan -> payment -> approval -> key` works.

### Phase 8 - API Key Creation Reliability
Goal: no more "error but key created and cannot open".

1. Make create-key route atomic:
   - if side effect fails after insert, either rollback/delete created key or still return key with warnings.
2. Move notifications/backup after response or wrap them as non-fatal.
3. Return structured warnings to frontend.
4. Frontend should show key if `api_key` exists even when warnings exist.
5. Optional: store one-time encrypted reveal token for newly-created keys for a short TTL.
6. Verification:
   - simulate alert/backup failure and confirm key modal still opens.

### Phase 9 - Database Split, Seed DB, Backups
Goal: plug-and-play Docker with global data and separate user data.

1. Define two stores:
   - global seed/config DB or JSON bundle: captcha rules, domain mappings, autofill rules, userscripts, model registry, question bank, hashes
   - tenant/user DB: users, plans, payments, API keys, usage, audit logs
2. On startup:
   - import seed data if missing
   - never overwrite user DB unless explicitly requested
3. Backup service:
   - local scheduled backups
   - Telegram channel upload target from admin UI
   - GDrive later
4. Docker:
   - ship seed data in image
   - mount mutable DB/backup volumes
5. Verification:
   - fresh container starts usable from image seed
   - redeploy with existing volume preserves users/keys
   - backup appears locally and optionally in Telegram channel.

### Phase 10 - Scaling Architecture
Goal: production shape for 50-100+ users.

1. Move production DB to PostgreSQL.
2. Use Redis for:
   - cache
   - rate limit counters
   - job queue/broker
3. Keep API stateless and horizontally scalable.
4. Move heavy jobs to workers:
   - captcha solve
   - OCR/MCQ solve
   - backup upload
   - extension package
5. Keep Telegram bot as one worker/service.
6. Suggested compose services:
   - `api`
   - `worker`
   - `telegram-bot`
   - `postgres`
   - `redis`
   - `nginx`
7. Python stack recommendation: Redis + RQ/Celery/Arq rather than BullMQ, because backend is Python. BullMQ only if a Node worker is introduced.

## Recommended Execution Order

1. Phase 1 first: MCQ learned-answer safety. This is the highest user-risk bug.
2. Phase 5 next: remove protected STALL payloads from extension and add logout wipe.
3. Phase 6 next: Docker extension download is a concrete deployment break.
3. Phase 3 and Phase 2: vcam resource usage and captcha speed.
4. Phase 4: STALL timing/Lemur robustness.
5. Phase 7: Telegram bot as separate Docker service.
6. Phase 8: API key atomicity.
7. Phase 9/10: DB split, backup automation, and scaling architecture.

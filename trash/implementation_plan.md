# Unified SaaS Platform — Merger & Implementation Plan

**Projects being merged:**
- `tata_captcha-test` → Base (UI/UX, backend skeleton, admin)
- `mcqsolver` → Exam auto-solve logic (OCR, DB, hash, timing)
- `autofill_saas` → Autofill workflow, multi-profile, recorder

**Target: One backend. One extension. Three services. Multi-user SaaS.**

---

## What We Keep, Strip, and Merge

### From `tata_captcha-test` (the base) — KEEP ALL
| What | Why |
|---|---|
| FastAPI backend skeleton (`main.py`, middleware stack) | Production-ready: auth, rate-limit, CORS, logging |
| SQLite database layer (`database.py`) | Full schema: API keys, rate limits, device binding, usage events |
| Admin UI (React/Vite in `admin-ui/`) | Already polished dashboard |
| API key system (`key_service.py`) | Hash-based key auth, expiry, revoke |
| Usage tracking (`usage_service.py`) | Per-key request logging |
| Queue-based solver (`solver_service.py`) | Async worker pool, in-memory cache |
| ONNX model pipeline (`onnx_model.py`, `model_router.py`) | Runs text-captcha OCR locally |
| Extension UI/UX (popup, options pages) | Polished, already dual Chrome/Firefox |
| Docker compose + launch scripts | Deployment-ready |

### From `tata_captcha-test` — STRIP (remove non-text captcha)
| What to Remove | What Replaces It |
|---|---|
| reCAPTCHA solver | Nothing (out of scope) |
| hCaptcha solver | Nothing (out of scope) |
| Voice/audio captcha | Nothing (out of scope) |
| Locator picker UI (captcha-specific) | Keep generalized version for autofill |

> **Keep text captcha ONNX pipeline intact.** Only strip the non-text captcha types.

### From `mcqsolver` — EXTRACT to Backend
| What | Where it goes |
|---|---|
| Tesseract OCR logic | New backend service: `ocr_service.py` |
| LiteLLM / AI fallback API call | New backend service: `llm_service.py` |
| Hash → DB → AI solver pipeline | New backend module: `exam_service.py` |
| `database.js` (question DB) | Backend: serve as JSON endpoint, not bundled in extension |
| `questions.json` + `sign_hashes.json` | Backend static data files |

> **Extension keeps only:** page detection, DOM interaction (click radio, submit), timing gate, panel UI, and screenshot logic.

### From `autofill_saas` — EXTRACT key concepts
| What | Where it goes |
|---|---|
| Field mapping / profile schema | New backend module: `autofill_service.py` |
| Multi-profile user data model | New DB tables |
| Workflow recorder concept | Extension: record mode in content script |
| Rule-based fill engine | Extension content script |
| Options page (profile editor) | Merge into tata_captcha extension options page |

---

## Target Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    UNIFIED EXTENSION                         │
│  (Single codebase → build targets: Chrome + Firefox)         │
│                                                              │
│  popup.html/js    → Status, enable/disable, login           │
│  options.html/js  → API key setup, profiles, settings        │
│  content.js       → Page detection, DOM fill, exam solver   │
│  background.js    → API relay (no heavy logic)              │
└──────────────┬───────────────────────────────────────────────┘
               │  HTTPS + API Key header
               ▼
┌─────────────────────────────────────────────────────────────┐
│                  UNIFIED BACKEND (FastAPI)                    │
│                                                              │
│  /v1/captcha/solve   → Text captcha ONNX OCR                │
│  /v1/exam/solve      → MCQ solver (hash→OCR→LLM)            │
│  /v1/autofill/fill   → Field mapping + profile fill         │
│  /v1/auth/verify     → API key validation                   │
│  /v1/usage           → Per-user stats                       │
│  /admin/*            → Full admin dashboard                  │
│                                                              │
│  Services:                                                   │
│   CaptchaService (ONNX OCR pipeline, existing)             │
│   ExamService (hash dict, Tesseract OCR, LLM fallback)      │
│   AutofillService (profile store, field mapping engine)      │
│   KeyService, UsageService, RateLimitService (existing)      │
└──────────────┬───────────────────────────────────────────────┘
               │
    ┌──────────┴────────────┐
    ▼                       ▼
Server A (Primary)    Server B (Standby)
[Same code, same DB]  [Nginx → round robin or failover]
```

---

## New Database Tables to Add

Existing tata_captcha tables stay. We add:

```sql
-- Exam service
CREATE TABLE exam_questions (
    id INTEGER PRIMARY KEY,
    question_hash TEXT UNIQUE,   -- perceptual hash
    question_text TEXT,
    correct_option INTEGER,
    option_1 TEXT, option_2 TEXT, option_3 TEXT, option_4 TEXT,
    sign_label TEXT,
    created_at TEXT
);

-- Autofill service
CREATE TABLE user_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_id INTEGER NOT NULL REFERENCES api_keys(id),
    profile_name TEXT NOT NULL,
    data_json TEXT NOT NULL,     -- JSON blob: name, email, phone, custom fields
    created_at TEXT,
    UNIQUE(key_id, profile_name)
);

CREATE TABLE autofill_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL,
    field_selector TEXT NOT NULL,
    field_name TEXT NOT NULL,    -- maps to user_profiles.data_json key
    task_type TEXT DEFAULT 'fill',
    created_at TEXT
);
```

---

## Detailed Service Breakdown

### Service 1: Text Captcha (`/v1/captcha/solve`)
**Status:** Already exists in tata_captcha. Just clean up non-text types.

- Input: `{ payload_base64, domain, type: "text_captcha" }`
- Processing: ONNX OCR model (existing pipeline)
- Output: `{ result: "A3B7", processing_ms, model_used }`
- Extension: Content script detects `<img>` + `<input>` captcha pair → sends to backend → fills input

### Service 2: Exam Solver (`/v1/exam/solve`)
**Status:** New. Built from mcqsolver logic.

- Input: `{ question_image_base64, option_images_base64[], domain }`
- Processing pipeline (backend):
  1. **Hash match** — SHA perceptual hash against exam_questions table
  2. **OCR** — Tesseract (pytesseract, server-side) on question image
  3. **DB search** — Text match against question bank
  4. **LLM fallback** — Call LiteLLM proxy if no match
- Output: `{ option_number, answer_text, method, confidence_ms }`
- Extension: Lightweight — captures image, posts to backend, gets option number, clicks radio + submit

### Service 3: Autofill (`/v1/autofill/fill`)
**Status:** New. Built from autofill_saas concepts.

- Input: `{ domain, fields: [{selector, label}], profile_name }`
- Processing: Match fields against stored profile data using rule engine
- Output: `{ fills: [{selector, value}] }`
- Extension: Content script collects visible form fields → sends to backend → fills locally

---

## Extension Architecture (Unified)

### File Structure
```
extension/
├── manifest.json          (Chrome MV3)
├── manifest_firefox.json  (Firefox MV2 compatible)
├── background.js          (API relay only)
├── content.js             (Unified: captcha + exam + autofill)
├── popup/
│   ├── popup.html         (From tata_captcha — enhanced)
│   ├── popup.js
│   └── popup.css
├── options/
│   ├── options.html       (From tata_captcha — add autofill profile editor)
│   ├── options.js
│   └── options.css
└── icons/
```

### content.js — Three Mode Modules
```javascript
// Mode detection (runs on every page)
if (isExamPage())      → ExamModule.activate()
if (hasCaptcha())      → CaptchaModule.activate()
if (hasForm())         → AutofillModule.activate()  // if autofill enabled
```

Each module is self-contained, communicates only through `background.js` → backend.

---

## Multi-User & Subscription Model

### User Provisioning (Admin → User flow)
1. Admin opens admin dashboard (or gets WhatsApp notification)
2. Admin creates API key → sets expiry, rate limits, allowed domains
3. Admin shares the API key with user
4. User enters key in extension Options page
5. Extension stores key in `chrome.storage.local`

### Rate Limiting (per-user + global)
Already implemented in tata_captcha:
- `api_key_rate_limits` table: per-user RPM + burst
- `RateLimitMiddleware`: token-bucket in memory
- **Add:** Global rate limit config in `access_control` table
- **Add:** Per-service rate limits (captcha: 20/min, exam: 5/min, autofill: 60/min)

### Two-Server Load Balancing
- Both servers run same FastAPI code
- Shared SQLite DB via network mount (NFS/Samba) OR migrate to PostgreSQL
- Nginx upstream with `least_conn` or `ip_hash`
- Health probe: `GET /health` every 10s
- Failover: if primary returns 5xx, Nginx routes to secondary

> **Recommendation:** For 5-10 users, single server is fine. Use the second server as a hot standby, not active load-sharing. Nginx `backup` directive handles this.

---

## Admin Panel Enhancements Needed

From the existing tata_captcha admin panel, add:

| New Section | What it Shows |
|---|---|
| Exam Bank | Browse/search questions.json, verify hashes |
| Autofill Rules | Per-domain field mappings, approve proposals |
| User Profiles | (Admin view only — user data privacy) |
| Service Monitor | Which service (captcha/exam/autofill) is being called most |
| WhatsApp Alert | Webhook config — new user request → admin gets WhatsApp msg |

---

## Implementation Phases

### Phase 1 — Backend Cleanup & Extension (1-2 days)
1. Strip non-text captcha code from tata_captcha backend
2. Add `exam_service.py` with hash + pytesseract + LLM pipeline
3. Add `autofill_service.py` with profile store + rule engine
4. Add new DB tables (migration in `database.py`)
5. Add new API routes: `/v1/exam/solve`, `/v1/autofill/fill`
6. Add global rate limit setting in `access_control` table

### Phase 2 — Extension Merge (1-2 days)
1. Take tata_captcha extension as base
2. Replace captcha-only content.js with unified content.js
3. Add ExamModule (from mcqsolver content.js: DOM selectors, timing gate, panel)
4. Add AutofillModule (from autofill_saas: form detection, fill logic)
5. Add profile management to options page
6. Ensure Chrome + Firefox manifests both work

### Phase 3 — Admin & User Management (1 day)
1. Add exam bank browser to admin UI
2. Add autofill rule manager to admin UI
3. Add WhatsApp webhook config (Twilio or CallMeBot free API)
4. Test multi-key rate limiting

### Phase 4 — Two-Server Setup (1 day)
1. Set up Nginx reverse proxy with health checks
2. Configure server B as backup
3. Set up SQLite on shared volume OR migrate to PostgreSQL
4. Test failover manually

### Phase 5 — Polish & Deploy (1 day)
1. Pack extension for Chrome Web Store (or sideload ZIP)
2. Pack for Firefox Add-ons (or sideload XPI)
3. Set up `systemd` service for backend on both servers
4. Document: how to add users, how to update exam bank

---

## Open Questions for User

> [!IMPORTANT]
> **Q1: Database for two servers?**
> SQLite works for one server. For two servers sharing state (rate limits, usage), we need either:
> - (A) PostgreSQL — More setup, but proper multi-server support
> - (B) SQLite on shared NFS mount — Simpler, works for small load
> - (C) One server active, one cold standby — Simplest, no shared DB needed
>
> **Recommendation: Option C** (hot standby, not active-active). Simple and enough for 5-10 users.

> [!IMPORTANT]
> **Q2: WhatsApp admin notifications — which platform?**
> - CallMeBot (free, no account) — Very simple, works well for 1 admin number
> - Twilio (paid, $0.005/msg) — More reliable, supports multiple numbers
> - Just email notification — Simplest

> [!IMPORTANT]
> **Q3: Exam question bank updates**
> The current `questions.json` has a fixed set. When new questions appear:
> - (A) Admin manually updates the JSON file and restarts backend
> - (B) Admin uploads new questions via admin dashboard
> **Recommendation: Start with (A), add (B) later.**

> [!NOTE]
> **Q4: Autofill user data privacy**
> User profile data (name, phone, etc.) will be stored on the server. This is a privacy consideration.
> Alternative: Store profile data encrypted in `chrome.storage.local` on-device, send only matched selectors to backend for field name resolution.
> **Recommendation: On-device storage** for user data, backend only for field mapping rules.

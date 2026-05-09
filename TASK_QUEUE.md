# TASK_QUEUE.md — Direct UPI Payment System Implementation

## Phase 0: Codebase Analysis ✅

| # | Task | Status |
|---|------|--------|
| 0.1 | Analyze existing codebase structure, models, APIs, bot, admin | completed |

## Phase 1: Critical Bug Fixes ✅

| # | Task | Status |
|---|------|--------|
| 1.1 | Fix BUG: `cycle.requests_used` → `cycle.used_count` in users.py line 51 | completed |
| 1.2 | Fix BUG: PaymentRecord `to_dict()` missing new fields | completed |

## Phase 2: Model & Settings Enhancement ✅

| # | Task | Status |
|---|------|--------|
| 2.1 | Enhance PaymentRecord model: add OCR fields, expires_at, payment_ref, plan_id, telegram_user_id | completed |
| 2.2 | Add payment admin settings fields: payment_note_prefix, currency | completed |
| 2.3 | Add UserApiKey tracking fields: last_used_at, usage_count | completed |

## Phase 3: Telegram Bot Fixes ✅

| # | Task | Status |
|---|------|--------|
| 3.1 | "Tap to Pay" as inline keyboard button (not plain text) | completed |
| 3.2 | Fallback copyable UPI ID and payment note below button | completed |
| 3.3 | Dynamic UPI link from admin payment settings | completed |
| 3.4 | /my_status: show plan, expiry, usage, API key status, latest payment status | completed |
| 3.5 | /regenerate_key: revoke old key, create new, show full key once | completed |
| 3.6 | Notify user in Telegram on admin approval/rejection | completed |

## Phase 4: OCR & Payment Flow Enhancement ✅

| # | Task | Status |
|---|------|--------|
| 4.1 | OCR: extract amount, date/time, payer info, store all in PaymentRecord | completed |
| 4.2 | Payment status flow: pending_payment → screenshot_submitted → ready_for_admin_approval → approved/rejected | completed |
| 4.3 | Set expires_at on payment requests | completed |

## Phase 5: Admin Panel Enhancements ✅

| # | Task | Status |
|---|------|--------|
| 5.1 | PaymentsPanel: show telegram ID, plan, expected amount, UPI ID, payment ref, OCR details | completed |
| 5.2 | Admin approve: auto-activate plan with correct duration_days, notify user, create/enable API key | completed |
| 5.3 | UserKeysSection: add last_used_at, usage_count, revoked_at columns | completed |
| 5.4 | SettingsPanel: add payment note prefix, currency fields | completed |

## Phase 6: Verification & Testing ✅

| # | Task | Status |
|---|------|--------|
| 6.1 | Backend syntax check (all files) | completed |
| 6.2 | Run existing tests (10/10 pass) | completed |
| 6.3 | Import verification | completed |
| 6.4 | Frontend brace balance check | completed |

## All Tasks Complete
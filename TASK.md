# TASK.md — Direct UPI Payment System Implementation

## Status: COMPLETE

All 15 tasks across 6 phases are complete.

## Summary

### Codebase Analysis
The project is a unified platform (FastAPI backend + React frontend + Telegram bot) with:
- SQLAlchemy ORM models for users, subscriptions, payments, API keys
- Telegram bot for registration and payment flow
- Admin dashboard for managing users, payments, keys, settings

### What Was Implemented

**Bug Fixes (2):**
1. `cycle.requests_used` → `cycle.used_count` in admin users API
2. PaymentRecord model fields and to_dict updates

**Model Enhancements:**
- PaymentRecord: 8 new fields (plan_id, telegram_user_id, payment_ref, upi_id_used, payee_name_used, ocr_extracted_amount, ocr_extracted_date, ocr_extracted_payer, expires_at)
- UserApiKey: 2 new tracking fields (last_used_at, usage_count)
- Payment statuses: proper flow from pending_payment → screenshot_submitted → ready_for_admin_approval → approved/rejected/expired

**Telegram Bot Fixes (6):**
1. "Tap to Pay" as clickable inline keyboard button
2. Fallback copyable UPI ID and payment note below button
3. Dynamic UPI link from admin payment settings
4. /my_status: shows plan, expiry, usage, API key status, latest payment
5. /regenerate_key: already working correctly (verified)
6. Telegram notification on admin approval/rejection

**Admin Panel Enhancements:**
- PaymentsPanel: TG ID, Ref, UPI ID columns, enhanced OCR details
- KeysPanel: Last Used, Usage columns
- SettingsPanel: Payment Note Prefix, Currency fields

**Backend API Enhancements:**
- Approve: uses plan.duration_days, deactivates old subscriptions, creates API key, notifies user
- Reject: notifies user
- OCR: extracts amount, date, payer info

### Verification
- Backend syntax: all files OK
- Tests: 10/10 pass
- Imports: all verified
- Frontend: brace-balanced
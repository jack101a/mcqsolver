# TASK.md — B1: Fix Bot State Machine — Prevent Re-entering Payment Flow

## Goal
When a user has already submitted a payment (screenshot submitted, pending approval), pressing "Register" again should NOT re-enter the plan selection → payment flow. Instead, it should show current payment status and block re-registration.

## Scope
- Modify `register_cmd` handler to check for existing pending payments
- Modify `text_handler` for "📝 Register" button to also check
- Show clear message: "Payment already submitted — awaiting admin approval"

## Files
- `sa_helper/backend/app/services/telegram_bot.py`

## Steps
1. Add helper method `_has_pending_payment(user_id)` to check for pending payments
2. In `register_cmd` and text_handler "📝 Register" button: if user has pending payment, show status message and return early
3. Verify syntax

## Verification
- Python syntax check on telegram_bot.py
- Review state machine logic
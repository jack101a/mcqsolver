# STATE.md - MCQ Stability And Deployment Plan

## Status
PLANNED

## Active Task
Analyzed requested bug/improvement list and produced a phased implementation plan.

## Last Files Modified
- `TASK.md`
- `STATE.md`
- `tmp/mcq_stability_scaling_plan.md`

## Last Command Run
Targeted code inspection across MCQ learning, captcha, vcam, STALL, Docker, Telegram, API keys, and backup modules.

## Last Output/Error
Plan saved to `tmp/mcq_stability_scaling_plan.md`.

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
Commit and push the current source/plan state to `sa_helper/before-scale` before implementation changes.

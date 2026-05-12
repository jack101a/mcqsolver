# TASK.md - MCQ Stability And Deployment Plan

## Goal
Analyze the reported MCQ learning, extension performance, STALL, Telegram, Docker, API key, DB, backup, and scaling issues; produce an implementation plan before coding.

## Status
CHECKPOINT_PUSHED

## Scope Included
- Learned pHash safety and trainer-only mode.
- Captcha fill speed.
- VCAM activation scope and RAM/GPU impact.
- STALL timing and Lemur step 3/4 robustness.
- Server-only STALL step payloads and logout data wipe.
- Docker extension packaging failure.
- Telegram bot registration/deployment plan.
- API key creation reliability.
- Global seed DB vs user DB split.
- Backup targets and scaling architecture.

## Scope Excluded
- No code implementation in this planning step.
- No full repo-wide refactor.
- No unrelated userscript-engine changes.

## Findings
- Learned answers currently become clickable too early: new learned rows start at confidence 0.8 and lookup allows confidence >= 0.6.
- Learned pHash lookup uses distance 10 and returns clickable answers immediately.
- Captcha is slow because extension types character by character.
- VCAM defaults enabled/force-all and is injected into Sarathi pages at document start.
- Docker image does not copy `extension/`, so packaging can fail in container.
- Telegram bot dependency/deployment is incomplete for Docker; bot should be separate from multi-worker API.
- API key create can leave a created key without returning the plain key if a post-insert side effect fails.
- Step 3/Step 4 protected scripts should not be bundled in the extension; they should be fetched on demand, executed, and wiped.
- Removing an API key/logging out should wipe all server-synced data from extension storage.

## Plan Document
- `tmp/mcq_stability_scaling_plan.md`

## Immediate Next Step
Implement Phase 1: learned-answer safety and trainer-only mode.

## Verification Approach
- Unit/smoke tests for learned lookup thresholds.
- Extension smoke for train-only no-click behavior.
- Backend compile and targeted API checks after implementation.

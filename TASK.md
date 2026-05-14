# TASK.md - Verify Learned Hash Use And Push

## Goal
Answer whether learned pHash data is used immediately or waits for confidence/verification, then commit and push current code to `sa_helper/before-scale`.

## Status
IN PROGRESS

## Scope Included
- Inspect the backend exam learning decision path.
- Verify current extension fixes still pass syntax checks.
- Stage source/artifact/task files while leaving runtime DB files unstaged.
- Commit and push `before-scale` to `sa_helper`.

## Scope Excluded
- No new learning behavior changes unless inspection reveals a direct bug required for the question.
- No runtime database commit.

## Plan
- [x] Inspect learned pHash solve path.
- [x] Run verification checks.
- [x] Stage intended files.
- [ ] Commit and push.

## Verification Approach
- Use targeted `rg`/file reads for learning thresholds.
- Run `node --check extension/modules/exam.js`.
- Run `node --check extension/background.js`.

## Learned pHash Result
- Learned exact-hash and pHash rows are only returned by repository getters when `status='verified'`, confidence meets `exam.learn_min_confidence`, confirmations meet `exam.learn_min_confirmations`, and `wrong_count=0`.
- Defaults are confidence `0.95`, confirmations `10`, and pHash max distance `3`.
- Even verified learned rows only click when `exam.learning_mode` is `auto_click`; default mode is `train_only`.
- Unverified learned pHash rows can be returned as train-only candidates, but they set `option_number=None` and should not be clicked by the extension.

## Verification Result
- `node --check extension/modules/exam.js` passed.
- `node --check extension/background.js` passed.

## Staging Result
- Staged extension source, rebuilt extension artifacts, and task/state files.
- Left `backend/logs/app.db*` unstaged as runtime data.

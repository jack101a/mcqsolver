# TASK.md - Exam Learning Threshold Controls

## Goal
Expose editable self-learning usage thresholds in Admin UI so learned MCQ data can be safely applied to real exams.

## Status
COMPLETE

## Scope Included
- Verify current auto-learning behavior in code.
- Add Admin UI controls for:
  - minimum confidence percentage
  - minimum verified confirmation count
- Ensure values are saved in existing `platform_settings` keys used by solver runtime.
- Validate by building frontend.

## Scope Excluded
- Backend schema changes.
- New APIs for exam learning thresholds.
- Changes to learning algorithm internals.

## Plan
- [x] Inspect exam solver learning gates and admin exam panel.
- [x] Patch exam panel to edit confidence% and verified count.
- [x] Add safe normalization/clamping before save.
- [x] Build frontend and confirm successful output.
- [x] Update `STATE.md`.

## Verification Approach
- Confirm runtime keys already used by solver:
  - `exam.learn_min_confidence`
  - `exam.learn_min_confirmations`
- Run `npm --prefix frontend run build`.

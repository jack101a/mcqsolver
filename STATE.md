# STATE.md - Exam Learning Threshold Controls

## Status
COMPLETE

## Active Task
Made self-learning usage thresholds editable in Admin Exam UI and verified the changes build successfully.

## Last Files Modified
- `frontend/src/app/components/ExamStatsPanel.jsx`
- `TASK.md`
- `STATE.md`

## Last Command Run
`npm --prefix frontend run build`

## Last Output/Error
Completed:
- Confirmed solver already auto-learns through exam feedback and uses learned data at solve time based on:
  - `exam.learn_min_confidence`
  - `exam.learn_min_confirmations`
- Added UI inputs in Exam panel:
  - `Minimum Confidence (%) for Learned Answer Use`
  - `Minimum Verified Count for Learned Answer Use`
- Added normalization/safety:
  - Confidence is entered as `%` but saved as `0.0..1.0`
  - Confidence clamped to `0..1`
  - Verified count clamped to minimum `1`
- Save action now posts normalized threshold values and refreshes dirty-check baseline.
- Frontend build verification passed.

Build output:
- `vite v5.4.21 building for production...`
- `✓ built in 10.32s`

## Immediate Next Step
Deploy updated frontend build and test in Admin -> Exam:
1. Set confidence % and verified count.
2. Save config.
3. Run real exam feedback flow and confirm learned answers trigger according to thresholds.

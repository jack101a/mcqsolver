# STATE.md - Hybrid Learned Answer Identity

## Status
COMPLETE

## Active Task
Make MCQ self-learning store and use correct answer identity so shuffled options do not cause wrong learned clicks.

## Last Files Modified
- `TASK.md`
- `STATE.md`
- `backend/app/core/database.py`
- `backend/app/core/repositories/exam_learned.py`
- `backend/app/core/repositories/settings.py`
- `backend/app/api/routes.py`
- `backend/app/services/exam_service.py`

## Last Command Run
`python -m py_compile backend\app\core\database.py backend\app\core\repositories\exam_learned.py backend\app\core\repositories\settings.py backend\app\api\routes.py backend\app\services\exam_service.py`

## Last Output/Error
Backend compile passed. Focused shuffled-option sanity test returned `3 answer_text`. Temporary DB upsert test stored and read back `correct_option_hash`, `correct_option_phash`, and `correct_option_text`.

## Immediate Next Step
Restart backend so the new `exam_learned` columns are migrated, then train again on mock test pages.

# TASK.md — Phase 4: Medium-Risk Fixes (T27-T33)

## Goal
Fix 7 medium-risk items: ThreadPoolExecutor reuse, backup atomicity, backup restore safety, CTC layout, telegram state persistence, field_name usage, config path docs.

## Steps
Work through T27-T33 one at a time.

## Verification
After each: `python3 -m py_compile`
After all: `python3 -m compileall -q /workspace/sa_helper/backend/`
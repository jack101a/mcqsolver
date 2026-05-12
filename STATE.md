# STATE.md — Sprint 2: Remaining Items

## Status
**COMPLETE** — All 33 tasks across 4 phases finished.

## Sprint 2 Progress
| Phase | Tasks | Done |
|-------|-------|------|
| Phase 1: Trivial | 8 | ✅ 8/8 |
| Phase 2: Backend Low-Risk | 12 | ✅ 12/12 |
| Phase 3: Extension Low-Risk | 6 | ✅ 6/6 |
| Phase 4: Medium-Risk | 7 | ✅ 7/7 |
| **Total** | **33** | **33/33** |

## Combined Progress (Both Sprints)
| Sprint | Tasks | Status |
|--------|-------|--------|
| Sprint 1 (Safe Bug Fixes) | 28 | ✅ Complete |
| Sprint 2 (Remaining Items) | 33 | ✅ Complete |
| **Total** | **61** | **✅ Complete** |

## Phase 4 Files Changed
| Task | File | Change |
|------|------|--------|
| T27 | `exam_service.py` | Persistent ThreadPoolExecutor in __init__, reused across requests |
| T28 | `backup_service.py` | Replaced `shutil.copy2` with atomic `sqlite3.backup()` API |
| T29 | `backup_service.py` | Added doc warning + `sqlite3.backup()` for restore too |
| T30 | `onnx_model.py` | Fixed CTC layout: explicit shape[0]!=1 check for time-first |
| T31 | `telegram_bot.py` | Added JSON file persistence for _user_states with 30-min timeout |
| T32 | `models.py` | `field_name` from form now used (falls back to default if empty) |
| T33 | `config.yaml` | Added comment about relative path requirements |

## Verification
- `python3 -m compileall -q backend/` — zero errors ✅
- `npm run build` (frontend) — 1742 modules, 2.49s, zero errors ✅
# TASK.md - Verify Docker Readiness And Push

## Goal
Verify the current codebase is ready for Docker/startup usage, then commit and push source changes to `sa_helper/before-scale`.

## Status
IN PROGRESS

## Scope Included
- Run backend/frontend/extension verification commands.
- Repackage extension artifacts.
- Stage source/config/artifact changes only.
- Leave runtime DB/log backup files and `trainee.zip` out of git.
- Commit and push to `sa_helper/before-scale`.

## Scope Excluded
- No Docker image build unless verification reveals a Docker-specific failure.
- No runtime DB commit.

## Plan
- [ ] Verify backend compile and frontend build.
- [ ] Verify extension JS syntax and package extension.
- [ ] Stage intended files only.
- [ ] Commit and push.
- [ ] Update `STATE.md`.

## Verification Approach
- `python -m py_compile` for changed backend files.
- `npm run build` in frontend.
- `node --check` for changed extension JS.
- `ExtensionService.package_extension()`.
- `git status --short` before and after staging.

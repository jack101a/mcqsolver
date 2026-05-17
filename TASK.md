# TASK.md - Full Codebase Standardization (Industry Baseline)

## Goal
Standardize the full repository (backend, frontend, extension, infra, and root governance) to an industry baseline for consistency, maintainability, and deployment readiness.

## Status
COMPLETED

## Scope Included
- Add repository-wide formatting/editor standards.
- Add backend quality standards (lint, test config, tooling entrypoint).
- Add frontend quality standards (linting and scripts).
- Add CI workflow to enforce quality checks on pull requests/pushes.
- Update root docs to reflect full-codebase standards workflow.
- Reduce lint debt and enable strict quality gating.

## Scope Excluded
- Rewriting business logic.
- Framework migration.
- Kubernetes/platform migration.

## Plan
- [x] Establish shared repository standards files.
- [x] Add backend lint/test toolchain config.
- [x] Add frontend lint scripts + eslint config.
- [x] Add/standardize CI checks for backend + frontend + compose validation.
- [x] Run local verification commands and record results.
- [x] Reduce lint debt with automated + targeted fixes.
- [x] Switch checks to strict pass/fail gating.

## Verification Approach
- `ruff check backend/app backend/tests`
- `python -m compileall backend/app`
- `python -m pytest backend/tests -q`
- `npm --prefix frontend run lint`
- `docker compose config`

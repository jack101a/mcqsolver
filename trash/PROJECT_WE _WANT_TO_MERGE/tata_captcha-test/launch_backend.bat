@echo off
setlocal

REM Root shortcut to launch the backend API
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" (
  .venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8080 --app-dir backend
) else (
  python -m uvicorn app.main:app --host 0.0.0.0 --port 8080 --app-dir backend
)

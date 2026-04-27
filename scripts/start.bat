@echo off

REM Change directory (FIXED PATH)
cd /d %~dp0\..\backend

REM Check if venv exists
if exist venv (
    set PYTHON_BIN=venv\Scripts\python.exe
) else (
    set PYTHON_BIN=python
)

REM Create logs folder if not exists
if not exist logs (
    mkdir logs
)

REM Start backend in background
start "" cmd /c "%PYTHON_BIN% -m uvicorn app.main:app --host 0.0.0.0 --port 8080> logs\server.log 2>&1"

echo Backend started on port 8080. Logs: backend\logs\server.log
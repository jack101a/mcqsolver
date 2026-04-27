#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
cd "$SCRIPT_DIR/../backend"

# Check if venv exists, if not, use system python or warn
if [ -d "venv" ]; then
    PYTHON_BIN="venv/bin/python3"
else
    PYTHON_BIN="python3"
fi

mkdir -p logs
$PYTHON_BIN -m uvicorn app.main:app --host 0.0.0.0 --port 8080 > logs/server.log 2>&1 &
disown
echo "Backend started on port 8080. Logs: backend/logs/server.log"

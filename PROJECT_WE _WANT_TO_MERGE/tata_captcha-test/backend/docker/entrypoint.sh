#!/bin/sh
set -eu

DEFAULT_CONFIG_TEMPLATE="/app/defaults/config.yaml"
DEFAULT_MODEL_TEMPLATE="/app/defaults/models/model.onnx"
CONFIG_PATH="${CONFIG_PATH:-/app/backend/config/config.yaml}"
SQLITE_PATH="${SQLITE_PATH:-/app/backend/logs/app.db}"

echo "[entrypoint] CONFIG_PATH=${CONFIG_PATH}"
echo "[entrypoint] SQLITE_PATH=${SQLITE_PATH}"

mkdir -p "$(dirname "${CONFIG_PATH}")" /app/backend/logs /app/backend/models /app/backend/datasets

if [ ! -f "${CONFIG_PATH}" ]; then
  if [ -f "${DEFAULT_CONFIG_TEMPLATE}" ]; then
    cp "${DEFAULT_CONFIG_TEMPLATE}" "${CONFIG_PATH}"
    echo "[entrypoint] Created default config at ${CONFIG_PATH}"
  else
    echo "[entrypoint] WARNING: default config template missing at ${DEFAULT_CONFIG_TEMPLATE}"
  fi
fi

if [ ! -f "/app/backend/models/model.onnx" ] && [ -f "${DEFAULT_MODEL_TEMPLATE}" ]; then
  cp "${DEFAULT_MODEL_TEMPLATE}" "/app/backend/models/model.onnx"
  echo "[entrypoint] Seeded default model at /app/backend/models/model.onnx"
fi

SQLITE_DIR="$(dirname "${SQLITE_PATH}")"
mkdir -p "${SQLITE_DIR}" || true
if ! touch "${SQLITE_PATH}" 2>/dev/null; then
  echo "[entrypoint] WARNING: cannot write ${SQLITE_PATH}, falling back to /tmp/app.db"
  export SQLITE_PATH="/tmp/app.db"
  touch "${SQLITE_PATH}"
fi

exec "$@"

#!/bin/sh
set -eu

seed_dir="/opt/sa-helper-seed"

seed_path() {
  src="$1"
  dst="$2"

  if [ -d "$src" ]; then
    mkdir -p "$dst"
    cp -an "$src/." "$dst/"
  fi
}

seed_path "$seed_dir/backend/config" "/app/backend/config"

mkdir -p /app/backend/logs /app/backend/app/static/extensions /app/backend/app/templates /app/data /app/import

if [ "${SEED_BUNDLE_ON_START:-true}" = "true" ] && [ "${1:-}" = "uvicorn" ]; then
  python /app/backend/scripts/import_seed_bundle.py
fi

exec "$@"

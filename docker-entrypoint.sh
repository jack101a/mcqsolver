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

mkdir -p /app/backend/logs /app/backend/app/static/extensions /app/backend/app/templates /app/data /app/import

seed_path "$seed_dir/backend/config" "/app/backend/config"

if [ "${RUN_ALEMBIC_MIGRATIONS:-false}" = "true" ]; then
  cd /app/backend
  attempts=0
  max_attempts="${ALEMBIC_MAX_RETRIES:-30}"
  until alembic upgrade head; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge "$max_attempts" ]; then
      echo "Alembic migration failed after $attempts attempts; exiting."
      exit 1
    fi
    echo "Alembic migration failed (attempt $attempts/$max_attempts). Retrying in 2s..."
    sleep 2
  done
fi

exec "$@"

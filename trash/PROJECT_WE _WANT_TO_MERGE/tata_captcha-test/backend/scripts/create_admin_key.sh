#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:8080}"
ADMIN_TOKEN="${ADMIN_TOKEN:?ADMIN_TOKEN required}"

curl -sS \
  -X POST "${API_URL}/v1/key/create" \
  -H "x-admin-token: ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"name":"local-dev","expiry_days":30}'


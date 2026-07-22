#!/usr/bin/env bash
# Production API server (no autoreload) — run by base-api.service.
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

# Postgres runs in Docker and may come up after us at boot; poll a real
# connection (up to 60s) before starting so we don't crash-loop. If it still
# isn't up, fall through and let systemd's Restart=always take over.
[ -f .env ] && { set -a; . ./.env; set +a; }
PGURL="${DATABASE_URL:-postgresql+psycopg://base:base@localhost:5432/base}"
PGURL="${PGURL/+psycopg/}"
for _ in $(seq 1 30); do
  if PGURL="$PGURL" ./.venv/bin/python -c \
    "import os, psycopg; psycopg.connect(os.environ['PGURL'], connect_timeout=2).close()" 2>/dev/null; then
    break
  fi
  echo "api-serve: waiting for postgres..."
  sleep 2
done

exec ./.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000

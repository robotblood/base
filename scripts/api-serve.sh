#!/usr/bin/env bash
# Production API server (no autoreload) — run by base-api.service.
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"
exec ./.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000

#!/usr/bin/env bash
# Run the FastAPI backend with autoreload.
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"
exec ./.venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

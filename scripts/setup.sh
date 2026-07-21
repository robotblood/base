#!/usr/bin/env bash
# Create the Python virtualenv and install dependencies. No sudo needed.
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

if [[ ! -d .venv ]]; then
  echo "==> Creating virtualenv…"
  python3 -m venv .venv
fi
echo "==> Installing dependencies…"
./.venv/bin/pip install --upgrade pip -q
./.venv/bin/pip install -r requirements.txt -q
echo "Done. Virtualenv ready at $PROJECT_DIR/.venv"

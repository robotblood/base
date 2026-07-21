#!/usr/bin/env bash
# Import the Notion export into Postgres. Passes args through, e.g.:
#   scripts/import.sh --wipe
#   scripts/import.sh --only Tasks Hardware
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"
exec ./.venv/bin/python -m importer.run_import "$@"

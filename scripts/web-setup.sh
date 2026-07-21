#!/usr/bin/env bash
# Install web dashboard dependencies. Requires Node.js (see README setup). No sudo.
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR/web"
echo "==> Installing web dependencies…"
npm install
echo "Done. Run 'bash scripts/web.sh' to start the dashboard."

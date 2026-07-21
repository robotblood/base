#!/usr/bin/env bash
# Launch the SvelteKit web dashboard dev server (API must be running).
# Requires Node.js on PATH (see README first-time setup).
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec npm --prefix "$PROJECT_DIR/web" run dev

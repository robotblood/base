#!/usr/bin/env bash
# Production web server (the adapter-node build) — run by base-web.service.
# Sources nvm so the unit doesn't depend on a version-pinned node path.
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR/web"

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
	# shellcheck disable=SC1091
	source "$HOME/.nvm/nvm.sh"
fi

export HOST=127.0.0.1
export PORT="${PORT:-3000}"
export ORIGIN="${ORIGIN:-http://localhost:$PORT}"
export API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:8000}"

# The API waits for Postgres at boot; poll it (up to 60s) before serving so
# SSR pages don't 500 in the meantime. If it still isn't up, fall through and
# let systemd's Restart=always take over.
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null --max-time 2 "$API_BASE_URL/"; then
    break
  fi
  echo "web-serve: waiting for api..."
  sleep 2
done

exec node build/index.js

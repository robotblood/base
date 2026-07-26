#!/usr/bin/env bash
# Install (or refresh) the always-on setup: systemd user units for the API and
# web dashboard, plus a desktop entry that opens base as an app window.
# Idempotent — rerun after pulling changes to deploy/ or after `npm run build`.
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

UNIT_DIR="$HOME/.config/systemd/user"
APP_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor/scalable/apps"
mkdir -p "$UNIT_DIR" "$APP_DIR" "$ICON_DIR"

cp "$PROJECT_DIR"/deploy/systemd/base-api.service "$UNIT_DIR/"
cp "$PROJECT_DIR"/deploy/systemd/base-web.service "$UNIT_DIR/"
cp "$PROJECT_DIR"/deploy/systemd/base-backup.service "$UNIT_DIR/"
cp "$PROJECT_DIR"/deploy/systemd/base-backup.timer "$UNIT_DIR/"
cp "$PROJECT_DIR"/deploy/systemd/base-selfcheck.service "$UNIT_DIR/"
cp "$PROJECT_DIR"/deploy/systemd/base-selfcheck.timer "$UNIT_DIR/"
cp "$PROJECT_DIR"/deploy/base.desktop "$APP_DIR/"
cp "$PROJECT_DIR"/web/src/lib/assets/favicon.svg "$ICON_DIR/base.svg"

chmod +x "$PROJECT_DIR"/scripts/api-serve.sh "$PROJECT_DIR"/scripts/web-serve.sh \
         "$PROJECT_DIR"/scripts/backup.sh "$PROJECT_DIR"/scripts/restore.sh \
         "$PROJECT_DIR"/scripts/selfcheck.py

systemctl --user daemon-reload
systemctl --user enable base-api.service base-web.service
systemctl --user restart base-api.service base-web.service
# The timer only needs enabling (it starts the service on schedule).
systemctl --user enable --now base-backup.timer base-selfcheck.timer

command -v update-desktop-database >/dev/null && update-desktop-database "$APP_DIR" || true

echo "Installed. Web: http://localhost:3000 (base-web) · API: http://127.0.0.1:8000 (base-api)"
echo "Backups: daily to ~/backups/base (base-backup.timer) · restore: bash scripts/restore.sh --list"
echo "Checks: every 15 min (base-selfcheck.timer) · results at /admin/health"
echo "Logs:   journalctl --user -u base-web -u base-api -f"
echo "Note:   'bash scripts/dev.sh' needs port 8000 — stop the service first:"
echo "        systemctl --user stop base-api"

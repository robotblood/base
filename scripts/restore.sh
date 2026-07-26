#!/usr/bin/env bash
# Restore the database from a backup made by scripts/backup.sh.
#
#   bash scripts/restore.sh                    # newest snapshot
#   bash scripts/restore.sh ~/backups/base/base-20260726-120000.dump
#   bash scripts/restore.sh --list             # what's available
#
# This REPLACES the current contents of the database. It stops base-api while
# restoring so nothing writes underneath it, and takes a safety dump of the
# current state first (into the same backup dir, prefixed pre-restore-).
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/base}"
[ -f .env ] && { set -a; . ./.env; set +a; }
CONTAINER="${DB_CONTAINER:-base-db}"
DB_USER="${POSTGRES_USER:-base}"
DB_NAME="${POSTGRES_DB:-base}"

if [ "${1:-}" = "--list" ]; then
  echo "Daily ($BACKUP_DIR):"
  ls -1t "$BACKUP_DIR"/base-*.dump 2>/dev/null | head -20 || echo "  (none)"
  echo "Monthly:"
  ls -1t "$BACKUP_DIR"/monthly/base-*.dump 2>/dev/null || echo "  (none)"
  exit 0
fi

DUMP="${1:-}"
if [ -z "$DUMP" ]; then
  # shellcheck disable=SC2012  # timestamped names sort correctly
  DUMP="$(ls -1t "$BACKUP_DIR"/base-*.dump 2>/dev/null | head -1 || true)"
fi
[ -n "$DUMP" ] && [ -f "$DUMP" ] || { echo "restore: no dump found (try --list)" >&2; exit 1; }

echo "About to restore:  $DUMP"
echo "Into database:     $DB_NAME on $CONTAINER"
echo "This replaces everything currently in it."
read -r -p "Type 'restore' to continue: " CONFIRM
[ "$CONFIRM" = "restore" ] || { echo "aborted"; exit 1; }

WAS_RUNNING=""
if systemctl --user is-active --quiet base-api.service; then
  WAS_RUNNING=1
  echo "restore: stopping base-api"
  systemctl --user stop base-api.service
fi
restore_api() { [ -n "$WAS_RUNNING" ] && systemctl --user start base-api.service || true; }
trap restore_api EXIT

mkdir -p "$BACKUP_DIR"
SAFETY="$BACKUP_DIR/pre-restore-$(date +%Y%m%d-%H%M%S).dump"
echo "restore: saving current state to $SAFETY"
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$SAFETY"

# --clean --if-exists drops existing objects before recreating them, so this is
# a replace rather than a merge. Ownership/ACL noise is expected on a
# single-user database; pg_restore reports it and carries on.
echo "restore: restoring..."
docker exec -i "$CONTAINER" pg_restore -U "$DB_USER" -d "$DB_NAME" \
  --clean --if-exists --no-owner --no-privileges < "$DUMP"

echo "restore: done. Safety copy of the previous state: $SAFETY"

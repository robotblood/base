#!/usr/bin/env bash
# Snapshot the database to ~/backups/base and prune old copies.
# Run by base-backup.service (daily timer); safe to run by hand any time.
#
#   bash scripts/backup.sh              # normal snapshot
#   KEEP_DAILY=60 bash scripts/backup.sh
#
# Dumps are pg_dump custom format (-Fc): compressed, and restorable
# selectively with pg_restore. See scripts/restore.sh.
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/base}"
KEEP_DAILY="${KEEP_DAILY:-30}"   # daily snapshots to retain
KEEP_MONTHLY="${KEEP_MONTHLY:-12}" # first-of-month snapshots to retain

[ -f .env ] && { set -a; . ./.env; set +a; }
CONTAINER="${DB_CONTAINER:-base-db}"
DB_USER="${POSTGRES_USER:-base}"
DB_NAME="${POSTGRES_DB:-base}"

mkdir -p "$BACKUP_DIR" "$BACKUP_DIR/monthly"

# Postgres lives in Docker and may still be starting at boot.
for _ in $(seq 1 30); do
  docker exec "$CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1 && break
  echo "backup: waiting for postgres..."
  sleep 2
done
if ! docker exec "$CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
  echo "backup: postgres ($CONTAINER) unreachable — aborting" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/base-$STAMP.dump"

# Write to a .part file first so a crash mid-dump can't leave a truncated
# snapshot that looks valid to the pruner.
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$OUT.part"

# A custom-format dump always ends up well over a few KB with real data in it;
# a tiny file means the dump failed silently (e.g. auth error on stderr).
SIZE=$(stat -c %s "$OUT.part")
if [ "$SIZE" -lt 4096 ]; then
  echo "backup: dump is only ${SIZE}B — refusing to keep it" >&2
  rm -f "$OUT.part"
  exit 1
fi
mv "$OUT.part" "$OUT"

# Keep the first snapshot of each month indefinitely (up to KEEP_MONTHLY) —
# protects against damage that isn't noticed for weeks.
MONTH_TAG="$(date +%Y%m)"
if ! ls "$BACKUP_DIR/monthly/base-$MONTH_TAG"* >/dev/null 2>&1; then
  cp "$OUT" "$BACKUP_DIR/monthly/base-$MONTH_TAG-$STAMP.dump"
fi

prune() { # dir, keep count
  local dir="$1" keep="$2"
  # shellcheck disable=SC2012  # names are timestamped, so ls sorts correctly
  ls -1t "$dir"/base-*.dump 2>/dev/null | tail -n "+$((keep + 1))" | while read -r old; do
    echo "backup: pruning $(basename "$old")"
    rm -f "$old"
  done
}
prune "$BACKUP_DIR" "$KEEP_DAILY"
prune "$BACKUP_DIR/monthly" "$KEEP_MONTHLY"

echo "backup: $OUT ($(du -h "$OUT" | cut -f1))"

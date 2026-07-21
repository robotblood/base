#!/usr/bin/env bash
# One-time system setup. Run with sudo:   sudo bash ~/base/scripts/bootstrap.sh
# Installs Python tooling + Docker, starts the Postgres container.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REAL_USER="${SUDO_USER:-$USER}"

if [[ $EUID -ne 0 ]]; then
  echo "Please run with sudo:  sudo bash $0" >&2
  exit 1
fi

echo "==> Installing packages (python venv/pip, docker)…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y python3-venv python3-pip docker.io docker-compose-v2

echo "==> Enabling Docker service…"
systemctl enable --now docker

echo "==> Adding '$REAL_USER' to the docker group (for future sessions)…"
usermod -aG docker "$REAL_USER" || true

echo "==> Starting Postgres container…"
cd "$PROJECT_DIR"
docker compose up -d

echo "==> Waiting for Postgres to be healthy…"
for _ in $(seq 1 30); do
  if docker exec base-db pg_isready -U base -d base >/dev/null 2>&1; then
    echo "    Postgres is ready."
    break
  fi
  sleep 1
done

echo
echo "Bootstrap complete. Next (as your normal user, no sudo):"
echo "    bash $PROJECT_DIR/scripts/setup.sh"

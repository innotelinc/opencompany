#!/usr/bin/env bash
#
# Keep the public path alive when the application moves off this host.
#
# The public front proxies to this box on port 3000. When the application runs
# somewhere else, this installs a plain TCP forward on that port so the domain keeps
# working without touching DNS or the front proxy.
#
# Run once, as root, from a checkout of this repository:
#
#   bash deploy/install-forward.sh                      # defaults from the unit file
#   FORWARD_HOST=192.168.1.52 FORWARD_TARGET_PORT=3001 bash deploy/install-forward.sh
#
# The forward needs port 3000 free, so it is installed and started here, but the
# local application is only stopped when --take-over is passed. Without it, this
# fails loudly on "address already in use" rather than taking the site down.
#
# Undo:
#   systemctl disable --now opencompany-forward.service
#   systemctl enable --now opencompany-web.service opencompany-worker.service
#
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN=/usr/local/bin/opencompany-forward.mjs
UNIT=/etc/systemd/system/opencompany-forward.service
SERVICE=opencompany-forward.service
TAKE_OVER=0
for arg in "$@"; do
  case "$arg" in
    --take-over) TAKE_OVER=1 ;;
    *) echo "[forward] unknown argument: $arg" >&2; exit 2 ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  echo "[forward] run as root: sudo bash deploy/install-forward.sh" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[forward] node is not installed; the application image has it, the host may not" >&2
  exit 1
fi

install -m 0644 "$SRC_DIR/forward/opencompany-forward.mjs" "$BIN"
install -m 0644 "$SRC_DIR/forward/opencompany-forward.service" "$UNIT"

if [ -n "${FORWARD_HOST:-}" ] || [ -n "${FORWARD_TARGET_PORT:-}" ] || [ -n "${FORWARD_PORT:-}" ]; then
  [ -n "${FORWARD_PORT:-}" ] && sed -i "s/^Environment=FORWARD_PORT=.*/Environment=FORWARD_PORT=${FORWARD_PORT}/" "$UNIT"
  [ -n "${FORWARD_HOST:-}" ] && sed -i "s/^Environment=FORWARD_HOST=.*/Environment=FORWARD_HOST=${FORWARD_HOST}/" "$UNIT"
  [ -n "${FORWARD_TARGET_PORT:-}" ] && sed -i "s/^Environment=FORWARD_TARGET_PORT=.*/Environment=FORWARD_TARGET_PORT=${FORWARD_TARGET_PORT}/" "$UNIT"
fi

if [ "$TAKE_OVER" -eq 1 ]; then
  echo "[forward] stopping the local application and its timer"
  systemctl disable --now opencompany-autodeploy.timer 2>/dev/null || true
  systemctl stop opencompany-web.service opencompany-worker.service 2>/dev/null || true
  systemctl disable opencompany-web.service opencompany-worker.service 2>/dev/null || true
fi

systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null 2>&1
systemctl restart "$SERVICE"

# A forward that cannot bind leaves the site down; say so instead of reporting ok.
sleep 2
if ! systemctl is-active --quiet "$SERVICE"; then
  echo "[forward] $SERVICE did not stay up:" >&2
  journalctl -u "$SERVICE" -n 15 --no-pager >&2 || true
  exit 1
fi

PORT="$(grep -m1 '^Environment=FORWARD_PORT=' "$UNIT" | cut -d= -f2)"
if ! curl -fsS -m 5 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
  echo "[forward] $SERVICE is running but :${PORT}/api/health does not answer" >&2
  echo "[forward] check the application host and FORWARD_HOST/FORWARD_TARGET_PORT" >&2
  exit 1
fi

echo "[forward] $SERVICE is forwarding :${PORT} and /api/health answers"
echo "[forward] journal: journalctl -u $SERVICE -n 30"

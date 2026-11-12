#!/usr/bin/env bash
#
# One-time: deploy the box automatically when main moves.
#
#   bash deploy/install-auto-deploy.sh
#
# Installs deploy/auto-deploy.sh as /usr/local/bin/opencompany-autodeploy and
# enables a systemd timer that runs it every minute. Uses the box's existing
# checkout and read-only GitHub deploy key; no inbound port, no webhook, no
# credentials on GitHub.
#
# Remove it again with:
#   systemctl disable --now opencompany-autodeploy.timer
#   rm -f /etc/systemd/system/opencompany-autodeploy.{service,timer}
#   systemctl daemon-reload
#
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/opencompany}"
BRANCH="${BRANCH:-main}"
BIN="/usr/local/bin/opencompany-autodeploy"
UNIT_DIR="/etc/systemd/system"

if [ "$(id -u)" -ne 0 ]; then
  echo "[install] run as root (systemd units are system-wide)" >&2
  exit 1
fi

if [ ! -d "$APP_DIR/.git" ]; then
  echo "[install] $APP_DIR is not a git checkout; run deploy/install-git-deploy.sh first" >&2
  exit 1
fi

echo "[install] installing $BIN"
install -m 755 "$APP_DIR/deploy/auto-deploy.sh" "$BIN"
sed -i "s#^APP_DIR=.*#APP_DIR=\"\${APP_DIR:-$APP_DIR}\"#; s#^BRANCH=.*#BRANCH=\"\${BRANCH:-$BRANCH}\"#" "$BIN"

echo "[install] writing systemd units"
cat > "$UNIT_DIR/opencompany-autodeploy.service" <<EOF
[Unit]
Description=OpenCompany auto-deploy (deploy origin/$BRANCH when it moves)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=root
Environment=APP_DIR=$APP_DIR
Environment=BRANCH=$BRANCH
ExecStart=$BIN
TimeoutStartSec=1800
Nice=10
EOF

cat > "$UNIT_DIR/opencompany-autodeploy.timer" <<'EOF'
[Unit]
Description=Check OpenCompany's origin/main every minute

[Timer]
OnBootSec=90s
OnUnitActiveSec=60s
AccuracySec=5s
Persistent=true
Unit=opencompany-autodeploy.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now opencompany-autodeploy.timer

echo "[install] timer state: $(systemctl is-active opencompany-autodeploy.timer)"
echo "[install] next runs:"
systemctl list-timers opencompany-autodeploy.timer --no-pager || true
echo "[install] logs: journalctl -u opencompany-autodeploy -n 50"

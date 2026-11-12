#!/usr/bin/env bash
#
# Deploy the box when main moves. Run by a systemd timer every minute.
#
# The box has a read-only GitHub deploy key and no inbound access, so a webhook
# cannot reach it: it polls origin instead, and a push is live within about a
# minute. Nothing happens when the branch has not moved, so the timer is cheap.
#
# Installed as /usr/local/bin/opencompany-autodeploy by
# deploy/install-auto-deploy.sh. Logs go to the journal:
#   journalctl -u opencompany-autodeploy -n 50
#
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/opencompany}"
BRANCH="${BRANCH:-main}"

cd "$APP_DIR"
unset GIT_DIR GIT_WORK_TREE

if ! git fetch --prune --quiet origin; then
  echo "[auto-deploy] git fetch failed; leaving $(git rev-parse --short HEAD) serving"
  exit 1
fi

target="$(git rev-parse "origin/$BRANCH")"
current="$(git rev-parse HEAD)"

if [ "$target" = "$current" ]; then
  exit 0
fi

# A dirty checkout means something changed the box by hand. Resetting it would
# throw that away silently, so say so and let a human decide.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "[auto-deploy] tracked files are modified in $APP_DIR; refusing to reset to $target"
  echo "[auto-deploy] inspect with: git -C $APP_DIR status --short"
  exit 1
fi

echo "[auto-deploy] $(git rev-parse --short "$current") -> $(git rev-parse --short "$target") on $BRANCH"
exec bash scripts/deploy.sh "$BRANCH"

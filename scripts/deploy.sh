#!/usr/bin/env bash
#
# Deploy OpenCompany from git. The working tree is hard-reset to origin/<branch>,
# so what runs is exactly a commit — never a hand-copied file. A build failure
# stops before the restart, leaving the previous build serving.
#
# Every deployment writes a start and a finish to $OPENCOMPANY_DATA_DIR/
# deploy-events.jsonl, which the console reads, so nobody has to open a journal to
# learn what went live and when. Set OPENCOMPANY_DEPLOY_NOTIFY_URL to also POST
# those events somewhere (a chat relay, a monitor) as JSON.
#
# Usage: scripts/deploy.sh [branch]      (default: main, or $BRANCH)
#
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/opencompany}"
BRANCH="${1:-${BRANCH:-main}}"
SERVICES="${SERVICES:-opencompany-web opencompany-worker}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
LOCK_FILE="${LOCK_FILE:-/run/opencompany-deploy.lock}"
DATA_DIR="${OPENCOMPANY_DATA_DIR:-$APP_DIR/.data}"
EVENTS="$DATA_DIR/deploy-events.jsonl"
NOTIFY_URL="${OPENCOMPANY_DEPLOY_NOTIFY_URL:-}"

# Emitting is best-effort: a deployment must not fail because a log line did.
emit() {
  local phase="$1" status="$2" detail="${3:-}"
  mkdir -p "$DATA_DIR" 2>/dev/null || true
  local commit
  commit="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
  printf '{"at":"%s","source":"box","phase":"%s","status":"%s","commit":"%s","detail":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$phase" "$status" "$commit" "${detail//\"/\'}" \
    >> "$EVENTS" 2>/dev/null || true
  if [ -n "$NOTIFY_URL" ]; then
    curl -fsS -m 5 -X POST -H "content-type: application/json" \
      -d "{\"source\":\"box\",\"phase\":\"$phase\",\"status\":\"$status\",\"commit\":\"$commit\",\"detail\":\"${detail//\"/\'}\"}" \
      "$NOTIFY_URL" >/dev/null 2>&1 || true
  fi
}

deploy() {
  cd "$APP_DIR"
  unset GIT_DIR GIT_WORK_TREE

  if git rev-parse --verify HEAD >/dev/null 2>&1; then
    before="$(git rev-parse HEAD)"
  else
    before=""
  fi

  trap 'rc=$?; emit finish failed "deploy failed (exit $rc)"; exit $rc' ERR

  echo "[deploy] fetching origin/$BRANCH"
  git fetch --prune origin

  target="$(git rev-parse "origin/$BRANCH")"
  if [ "$before" != "$target" ]; then
    echo "[deploy] $( [ -n "$before" ] && git rev-parse --short "$before" || echo "no checkout" ) -> $(git rev-parse --short "$target")"
    git reset --hard "origin/$BRANCH"
    emit start started ""
  else
    echo "[deploy] already at $(git rev-parse --short HEAD)"
  fi

  # Dependencies are installed only when the lockfile actually moved, so a normal
  # deploy needs no registry access. The first adoption skips it: node_modules is
  # already there from the previous deploy.
  install_deps=0
  if [ -n "$before" ] && ! git diff --quiet "$before" HEAD -- package.json package-lock.json; then
    install_deps=1
  fi
  if [ "$install_deps" -eq 1 ]; then
    echo "[deploy] dependencies changed; installing"
    npm ci --no-audit --no-fund
  fi

  echo "[deploy] building"
  npm run build

  echo "[deploy] restarting $SERVICES"
  # shellcheck disable=SC2086
  systemctl restart $SERVICES

  for _ in $(seq 1 30); do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  if ! curl -fsS "$HEALTH_URL"; then
    echo
    echo "[deploy] health check failed at $HEALTH_URL" >&2
    emit finish failed "health check failed"
    exit 1
  fi

  trap - ERR
  emit finish succeeded ""
  echo
  echo "[deploy] live at commit $(git rev-parse HEAD) — $(git log -1 --pretty=%s)"
}

# The auto-deploy timer and a manual deploy can want the box at the same time.
# Only one build may touch the checkout, so wait for the holder instead of
# building over it.
mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
if ! flock -w 900 9; then
  echo "[deploy] another deploy has held the lock for 15 minutes; giving up" >&2
  exit 1
fi

deploy

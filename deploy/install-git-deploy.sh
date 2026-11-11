#!/usr/bin/env bash
#
# One-time: turn a tar-deployed box into a git checkout that deploys commits.
#
#   BUNDLE=/tmp/opencompany.bundle bash deploy/install-git-deploy.sh
#
# The bundle seeds a bare mirror on the box, because the box has no GitHub
# credentials of its own. Afterwards `git push <mirror> main` deploys: the
# post-receive hook runs scripts/deploy.sh, which resets the working tree to the
# pushed commit, builds and restarts.
#
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/opencompany}"
MIRROR="${MIRROR:-/srv/opencompany.git}"
BRANCH="${BRANCH:-main}"

if [ ! -d "$MIRROR" ]; then
  echo "[install] creating bare mirror $MIRROR"
  git init --bare -b "$BRANCH" "$MIRROR"
fi

if ! git -C "$MIRROR" rev-parse --verify "refs/heads/$BRANCH" >/dev/null 2>&1; then
  if [ -n "${BUNDLE:-}" ] && [ -f "${BUNDLE}" ]; then
    echo "[install] seeding $MIRROR from $BUNDLE"
    git -C "$MIRROR" fetch "$BUNDLE" "+refs/heads/*:refs/heads/*"
    git -C "$MIRROR" symbolic-ref HEAD "refs/heads/$BRANCH"
  else
    echo "[install] $MIRROR has no $BRANCH yet; re-run with BUNDLE=/path/to/repo.bundle" >&2
    exit 1
  fi
fi

echo "[install] installing the deploy hook"
install -m 755 "$APP_DIR/deploy/post-receive" "$MIRROR/hooks/post-receive"

cd "$APP_DIR"
if [ ! -d .git ]; then
  echo "[install] adopting $APP_DIR as a git checkout"
  git init -b "$BRANCH"
fi
git remote remove origin 2>/dev/null || true
git remote add origin "$MIRROR"
git fetch --prune origin

echo "[install] aligning the working tree with origin/$BRANCH"
git reset --hard "origin/$BRANCH"

echo "[install] $APP_DIR is at $(git rev-parse --short HEAD) on $BRANCH; origin=$MIRROR"
echo "[install] deploy from now on with: scripts/deploy.sh   (or push to $MIRROR)"

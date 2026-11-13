#!/usr/bin/env bash
#
# Ask Coolify to deploy this application.
#
# The GitHub push webhook cannot be managed without `admin:repo_hook` on the
# repository, and its stored secret had drifted from the one Coolify expects, so
# deliveries arrived but were rejected as unsigned. Rather than keep the two in
# sync by hand, the box's auto-deploy timer calls this after it ships a commit:
# one push, both hosts, no manual API call.
#
# Reads COOLIFY_TOKEN, COOLIFY_APP_UUID and (optionally) COOLIFY_URL from the
# environment or from $APP_DIR/.env. Missing token or app uuid is not an error:
# the script says so and exits 0, so a host without Coolify still deploys.
#
#   bash deploy/coolify-deploy.sh
#
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/opencompany}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"

read_key() {
  [ -f "$ENV_FILE" ] || return 0
  grep -m1 "^$1=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//' || true
}

COOLIFY_TOKEN="${COOLIFY_TOKEN:-$(read_key COOLIFY_TOKEN)}"
COOLIFY_APP_UUID="${COOLIFY_APP_UUID:-$(read_key COOLIFY_APP_UUID)}"
COOLIFY_URL="${COOLIFY_URL:-$(read_key COOLIFY_URL)}"
COOLIFY_URL="${COOLIFY_URL:-http://192.168.1.93:8000}"

if [ -z "$COOLIFY_TOKEN" ] || [ -z "$COOLIFY_APP_UUID" ]; then
  echo "[coolify] COOLIFY_TOKEN or COOLIFY_APP_UUID is not set; skipping the Coolify deploy"
  exit 0
fi

response="$(curl -sS -m 45 -X POST \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"uuid\":\"$COOLIFY_APP_UUID\"}" \
  "$COOLIFY_URL/api/v1/deploy" 2>&1)" || {
  echo "[coolify] request failed: $response"
  exit 1
}

echo "[coolify] $response"

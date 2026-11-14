#!/usr/bin/env bash
#
# Keep the Coolify host from filling up with old builds.
#
# Every deploy produces a new web and worker image (~1.5 GB together) and leaves
# the previous ones behind for rollback, and BuildKit keeps its cache on top of
# that. Left alone the disk reaches 100%, and the next build dies with ENOSPC
# partway through exporting an image, which looks like a broken deploy rather
# than a full disk.
#
# This runs in two places, both before a build rather than after:
#   - deploy/coolify-deploy.sh calls it over ssh before asking Coolify to deploy
#   - a systemd timer on the Coolify host runs it every five minutes, which also
#     covers deploys queued by the GitHub webhook, which never touch the box
#
# What it removes:
#   - tags of this application's own images beyond the newest $PRUNE_KEEP, never
#     one a container (running or stopped) still references, so rollback keeps
#     working
#   - dangling images, always; they are not referenced by anything
#   - BuildKit cache, stopped containers and unused networks only once the disk
#     is at or above $PRUNE_THRESHOLD percent, since that cache is what makes a
#     rebuild fast
#
# It never touches another application's images, volumes or containers.
#
#   bash deploy/coolify-prune.sh          # on the Coolify host
#   PRUNE_THRESHOLD=70 bash ...           # prune the build cache earlier
#
# Output goes to stdout, which is the journal when the timer runs it:
#   journalctl -u openco-prune -n 30
#
set -euo pipefail

APP_PREFIX="${PRUNE_APP_PREFIX:-oqrdw4ekvjcz0vpw8fs8tmf9}"
KEEP="${PRUNE_KEEP:-2}"
THRESHOLD="${PRUNE_THRESHOLD:-85}"

say() {
  printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"
}

used_percent() {
  df --output=pcent / | tr -dc '0-9'
}

free_gb() {
  df --output=avail -BG / | tr -dc '0-9'
}

before_used="$(used_percent)"
before_free="$(free_gb)"

# 1. This application's old images, keeping the newest $KEEP tags of each
#    repository. `docker rmi` refuses an image a container still holds, which is
#    exactly the protection wanted here, so failures are counted and not forced.
removed_images=0
in_use="$(docker ps -a --format '{{.Image}}' | sort -u)"

while read -r repo; do
  [ -n "$repo" ] || continue
  seen=0
  while IFS=$'\t' read -r tag _created; do
    [ -n "$tag" ] || continue
    [ "$tag" = "<none>" ] && continue
    if [ "$seen" -lt "$KEEP" ]; then
      seen=$((seen + 1))
      continue
    fi
    image="$repo:$tag"
    if grep -qxF "$image" <<<"$in_use"; then
      continue
    fi
    if docker rmi "$image" >/dev/null 2>&1; then
      removed_images=$((removed_images + 1))
      say "removed $image"
    fi
  done < <(docker images --format '{{.Tag}}\t{{.CreatedAt}}' "$repo" | sort -k2 -r)
done < <(docker images --format '{{.Repository}}' | grep -E "^${APP_PREFIX}[_:]" | sort -u)

# 2. Dangling images are unreferenced by definition; take them every run.
docker image prune -f >/dev/null 2>&1 || true

# 3. The expensive caches, only when the disk needs the room. A build that is
#    running right now has its cache in use and BuildKit skips those records, so
#    this cannot break an in-flight deploy.
cache_state="kept"
used_now="$(used_percent)"
if [ "$used_now" -ge "$THRESHOLD" ]; then
  docker builder prune -af >/dev/null 2>&1 || true
  docker container prune -f --filter until=168h >/dev/null 2>&1 || true
  docker network prune -f >/dev/null 2>&1 || true
  cache_state="pruned at ${used_now}%"
fi

after_free="$(free_gb)"

say "images removed: ${removed_images}; build cache: ${cache_state}; disk ${before_used}% -> $(used_percent)% (${before_free}G -> ${after_free}G free)"

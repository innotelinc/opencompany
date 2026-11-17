#!/usr/bin/env sh
# One container, one copy of the company.
#
# Coolify runs this image as a single application: the web process and the worker
# share the image and the /app/.data volume, so there is exactly one database and
# one public copy. Migrations are additive, so they run before anything serves.
#
# Two variables exist for the move onto a new host and are removed afterwards:
#   OPENCOMPANY_RESTORE_URL  restore the database from a snapshot on this boot
#   OPENCOMPANY_SEED=1       seed the demo company when there is no data yet
set -eu

npm run db:migrate

if [ -n "${OPENCOMPANY_RESTORE_URL:-}" ]; then
  node scripts/restore-snapshot.mjs
fi

if [ "${OPENCOMPANY_SEED:-0}" = "1" ]; then
  npx tsx scripts/seed.ts
fi

npm run worker &
exec npm start

# syntax=docker/dockerfile:1.7
# OpenCompany — web and worker share one image, different commands.
FROM node:24-bookworm-slim

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# The build host can be small: `next build` was OOM-killed (exit 137) on a
# 3.5 GB container with no swap. Cap the heap and build with one webpack
# worker so a compile peaks near 2 GB instead of being killed.
ENV NODE_OPTIONS=--max-old-space-size=1280

# Build tools are a fallback for better-sqlite3 on unusual platforms. The cache
# mounts keep apt from re-downloading the same packages on every deployment.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# Employee browser sessions (OPENCOMPANY_BROWSER_ENABLED=1). Installing Chromium
# here means the "Browser: not configured" state cannot come back on redeploy.
RUN npx playwright install --with-deps chromium

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV OPENCOMPANY_DATA_DIR=/app/.data
EXPOSE 3000

# Container health: the app serves a public liveness route that needs no session.
# Coolify reports "healthy" from this probe instead of "running:unknown".
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# One container: migrate, optionally restore a snapshot, then run the worker beside
# the web process against the same data volume. See deploy/docker-entrypoint.sh.
CMD ["sh", "deploy/docker-entrypoint.sh"]

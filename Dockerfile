# syntax=docker/dockerfile:1.7
# OpenCompany — web and worker share one image, different commands.
FROM node:24-bookworm-slim

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

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

CMD ["npm", "start"]

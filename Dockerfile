# OpenCompany — web and worker share one image, different commands.
FROM node:24-bookworm-slim

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# better-sqlite3 ships prebuilds; build tools are a fallback for unusual platforms.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV OPENCOMPANY_DATA_DIR=/app/.data
EXPOSE 3000

CMD ["npm", "start"]

# One Dockerfile, two images:
#   docker build --target web    -t simple-monitoring-web .
#   docker build --target worker -t simple-monitoring-worker .
# The worker image also runs migrations: `node migrate.mjs`.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm run worker:build

# --- web: Next.js standalone server ---
FROM node:24-alpine AS web
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]

# --- worker: single esbuild bundle, no node_modules ---
FROM node:24-alpine AS worker
WORKDIR /app
ENV NODE_ENV=production \
    MIGRATIONS_DIR=/app/drizzle
COPY --from=build /app/dist/worker ./
COPY --from=build /app/drizzle ./drizzle
USER node
# SIGTERM from `docker stop` lets in-flight checks finish (see worker/index.ts).
CMD ["node", "index.mjs"]

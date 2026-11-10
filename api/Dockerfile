# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=24-alpine

# ---- base: shared settings ---------------------------------------------------
FROM node:${NODE_VERSION} AS base
WORKDIR /app
ENV NODE_ENV=production

# ---- deps: production dependencies only --------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# ---- dev: all deps + file watching (used by docker-compose.override.yml) -----
FROM base AS dev
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
# uid of the `node` user in the official image; numeric so the runtime can verify non-root
USER 1000:1000
CMD ["node", "--watch", "src/server.js"]

# ---- prod: minimal runtime image (default target) ----------------------------
FROM base AS prod
# Baked in at build time so /health always reports what is actually running.
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY migrations ./migrations
USER 1000:1000
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "src/server.js"]

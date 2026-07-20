# syntax=docker/dockerfile:1

# ============================================================
# LogMaster Backend — Multi-stage production Dockerfile
# ============================================================

# ---------- Stage 1: builder ----------
FROM node:20-alpine AS builder

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=1

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace root files first for cache-friendly install
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc turbo.json ./
COPY server/package.json server/tsconfig.json ./server/

# Install all workspace dependencies (frozen lockfile for reproducibility)
RUN pnpm install --frozen-lockfile

# Copy server source
COPY server/src ./server/src

# Compile TypeScript to dist/
RUN pnpm --dir server exec tsc -p tsconfig.json

# Prune devDependencies for a lean runtime node_modules
RUN pnpm --dir server install --prod --frozen-lockfile


# ---------- Stage 2: runner ----------
FROM node:20-alpine AS runner

ENV NODE_ENV=production

WORKDIR /app

# Non-root user for security
RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/node_modules ./node_modules
COPY --from=builder /app/server/package.json ./package.json

# Directory for runtime data (crash logs, etc.)
RUN mkdir -p /app/data /app/backups && chown -R app:app /app

USER app

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3001/api/v1/health || exit 1

CMD ["node", "dist/server.js"]

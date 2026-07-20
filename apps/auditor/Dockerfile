# syntax=docker/dockerfile:1

# ============================================================
# LogMaster Auditor — Next.js 14 standalone production Dockerfile
# ============================================================

# ---------- Stage 1: deps ----------
FROM node:20-alpine AS deps

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=1

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace root files for monorepo install
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc turbo.json ./
COPY apps/auditor/package.json ./apps/auditor/
# Copy shared packages package.json files
COPY packages/ui/package.json ./packages/ui/
COPY packages/auth/package.json ./packages/auth/
COPY packages/api/package.json ./packages/api/
COPY packages/types/package.json ./packages/types/
COPY packages/utils/package.json ./packages/utils/
COPY packages/config/package.json ./packages/config/

RUN pnpm install --frozen-lockfile

# ---------- Stage 2: builder ----------
FROM node:20-alpine AS builder

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=1

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm --dir apps/auditor run build

# ---------- Stage 3: runner ----------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

# Copy the standalone server output
COPY --from=builder /app/apps/auditor/.next/standalone ./
COPY --from=builder /app/apps/auditor/.next/static ./apps/auditor/.next/static
COPY --from=builder /app/apps/auditor/public ./apps/auditor/public

EXPOSE 3000

CMD ["node", "apps/auditor/server.js"]

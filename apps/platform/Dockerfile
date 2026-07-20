# syntax=docker/dockerfile:1

# ============================================================
# LogMaster Platform — Multi-stage production Dockerfile
# ============================================================

# ---------- Stage 1: builder ----------
FROM node:20-alpine AS builder

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=1

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace root files for monorepo install
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc turbo.json ./
COPY apps/platform/package.json ./apps/platform/
COPY packages ./packages

# Install dependencies for the workspace (platform + shared packages)
RUN pnpm install --frozen-lockfile

# Copy platform source
COPY apps/platform ./apps/platform

# Build with Vite (tsc --noEmit && vite build)
RUN pnpm --dir apps/platform run build


# ---------- Stage 2: runner ----------
FROM nginx:alpine AS runner

RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

COPY --from=builder /app/apps/platform/dist /usr/share/nginx/html
COPY apps/platform/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

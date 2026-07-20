# syntax=docker/dockerfile:1

# ============================================================
# LogMaster Landing — Multi-stage production Dockerfile
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
COPY apps/landing/package.json ./apps/landing/
COPY packages ./packages

# Install dependencies for the workspace (landing + shared packages)
RUN pnpm install --frozen-lockfile

# Copy landing source
COPY apps/landing ./apps/landing

# Build with Vite (tsc --noEmit && vite build)
RUN pnpm --dir apps/landing run build


# ---------- Stage 2: runner ----------
FROM nginx:alpine AS runner

# Remove default nginx static assets and config
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

COPY --from=builder /app/apps/landing/dist /usr/share/nginx/html
COPY apps/landing/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

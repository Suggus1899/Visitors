# syntax=docker/dockerfile:1

# ============================================================
# LogMaster Admin — Multi-stage production Dockerfile
# ============================================================

# ---------- Stage 1: builder ----------
FROM node:20-alpine AS builder

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=1

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc turbo.json ./
COPY apps/admin/package.json ./apps/admin/
COPY packages ./packages

RUN pnpm install --frozen-lockfile

COPY apps/admin ./apps/admin

RUN pnpm --dir apps/admin run build


# ---------- Stage 2: runner ----------
FROM nginx:alpine AS runner

RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

COPY --from=builder /app/apps/admin/dist /usr/share/nginx/html
COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

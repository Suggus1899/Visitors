FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS base
RUN corepack enable && corepack prepare pnpm@12.4.2 --activate
WORKDIR /src

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY client/package.json client/package.json
RUN pnpm install --frozen-lockfile --filter @logmaster/client...

FROM deps AS build
COPY client/ client/
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --dir client build

FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS runtime
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=10001:10001 /src/client/.next/standalone ./
COPY --from=build --chown=10001:10001 /src/client/.next/static ./.next/static
COPY --from=build --chown=10001:10001 /src/client/public ./public
USER 10001:10001
EXPOSE 3000
CMD ["node", "server.js"]

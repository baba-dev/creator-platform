# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app

RUN corepack enable
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm db:generate && pnpm --filter @aiwa/worker build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update && apt-get install --no-install-recommends -y ffmpeg ca-certificates fonts-noto-core \
    && rm -rf /var/lib/apt/lists/*
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs worker
RUN mkdir -p /var/www/creator-platform/shared/assets && chown -R worker:nodejs /var/www/creator-platform/shared/assets
COPY --from=build --chown=worker:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=worker:nodejs /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=build --chown=worker:nodejs /app/apps/worker/dist ./apps/worker/dist
WORKDIR /app/apps/worker
USER worker
CMD ["node", "dist/index.cjs"]

# syntax=docker/dockerfile:1.7
FROM node:26-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app

RUN corepack enable
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm db:generate && pnpm --filter @aiwa/worker build

FROM node:26-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs worker
COPY --from=build --chown=worker:nodejs /app/apps/worker/dist ./dist
USER worker
CMD ["node", "dist/index.js"]

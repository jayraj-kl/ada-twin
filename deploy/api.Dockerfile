# Build from the repository root, since the API bundles workspace packages:
#   docker build -f deploy/api.Dockerfile .
FROM node:24-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter api...
RUN pnpm --filter api build

# tsup bundles every dependency, so dist/ is all the server needs.
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/apps/api/package.json ./
COPY --from=build /repo/apps/api/dist ./dist
# Read by dist/migrate.js, which the deploy runs as a job before each rollout.
COPY --from=build /repo/packages/db/drizzle ./drizzle
USER node
CMD ["node", "dist/index.js"]

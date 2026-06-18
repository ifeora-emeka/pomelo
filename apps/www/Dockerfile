# Build context is the monorepo root: apps/www depends on the local @kallojs/*
# workspace packages and reads its Markdown docs from apps/docs (../docs at
# runtime), so the whole repo is installed and built, then the docs site is
# started from apps/www.
#
# The CLI is invoked via `node packages/cli/dist/bin.js` rather than the `kallo`
# bin, because the workspace bin symlink is not reliably resolvable during build.
FROM node:22-slim

ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app
COPY . .

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter "@kallojs/*" build
RUN cd /app/apps/www && node /app/packages/cli/dist/bin.js build

WORKDIR /app/apps/www
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "/app/packages/cli/dist/bin.js", "start"]

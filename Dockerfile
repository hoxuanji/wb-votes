# The origin server. Cloudflare sits in front of this; nothing about the application changed to get here.
#
# ── WHY THIS IMAGE LOOKS THE WAY IT DOES ──
#
# TWO THINGS ABOUT THIS APP DECIDE THE WHOLE DOCKERFILE, and both are easy to get wrong.
#
# 1. THE REPO LAYER IS IMPORTED AT REQUEST TIME, AS TYPESCRIPT SOURCE. `place-page.ts` loads it through a
#    dynamic import of an absolute file:// URL with a webpackIgnore comment, deliberately, so the bundler
#    leaves it alone. That means `packages/mandate/src/**` must EXIST in the running container and Node must
#    be able to import a .ts file with no loader and no flags. Node strips types by default from 23.6, so the
#    version below is a requirement rather than a preference. `output: 'standalone'` is NOT used for exactly
#    this reason: it copies what the bundler traced, and the bundler was told not to trace these files.
#
# 2. THE REGISTRY IS A 446 MB READ-ONLY SQLITE FILE, on a volume, reached through MANDATE_DB_PATH. It is not
#    in the image and not in git — it is built offline by `npm run registry:ingest` and uploaded once.
#
# Everything else is ordinary: install, build, copy, run.

FROM node:24-slim AS build
WORKDIR /app

# Dependencies first, so a source-only change does not reinstall 373 MB.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# No database at build time, and none is needed: every route is `dynamic = "force-dynamic"`, so nothing is
# prerendered and the build never opens the registry.
RUN npm run build

# Prune to production dependencies in the build stage, so the runtime stage copies a tree that is already
# correct rather than reinstalling and risking a different resolution.
RUN npm prune --omit=dev


FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# The registry lives on the volume, never in the image.
ENV MANDATE_DB_PATH=/data/registry.db

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.mjs ./next.config.mjs
# THE RUNTIME-IMPORTED SOURCE. See note 1 above — without this the place, district and constituency surfaces
# throw on first request while every other route works, which is the confusing half-broken failure to avoid.
COPY --from=build /app/packages ./packages

# A BUILD THAT CANNOT SERVE SHOULD NOT SHIP. Both mechanisms note 1 depends on are checked here, in the exact
# form the request path uses them, so a Node version without unflagged type stripping or without node:sqlite
# fails the image build instead of failing every page in production.
RUN node --input-type=module -e "\
  import { join } from 'node:path'; \
  import { pathToFileURL } from 'node:url'; \
  const base = pathToFileURL(join(process.cwd(), 'packages/mandate/src/')).href; \
  const repo = await import(base + 'repo/index.ts'); \
  if (Object.keys(repo).length === 0) throw new Error('repo/index.ts imported empty'); \
  const { DatabaseSync } = await import('node:sqlite'); \
  new DatabaseSync(':memory:').close(); \
  console.log('runtime check: .ts import + node:sqlite OK'); \
"

EXPOSE 3000
CMD ["npm", "start"]

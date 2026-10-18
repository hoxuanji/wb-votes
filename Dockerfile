# The origin server. Cloudflare sits in front of this; nothing about the application changed to get here.
#
# ── WHY THIS IMAGE LOOKS THE WAY IT DOES ──
#
# TWO THINGS ABOUT THIS APP DECIDE THE WHOLE DOCKERFILE, and both are easy to get wrong.
#
# 1. THE REPO LAYER IS BUNDLED, NOT IMPORTED AT REQUEST TIME. `envelope.ts` and `place-page.ts` import it
#    statically, so `next build` traces it into `.next` like any other module. It used to be loaded through a
#    dynamic import of an absolute file:// URL with a webpackIgnore comment, which put `packages/mandate/src/**`
#    on the request path as TypeScript source (so Node had to strip types, from 23.6) and ruled out
#    `output: 'standalone'`. Neither holds now; the COPY of `packages/` and the .ts import check below stay
#    until a container build has shown the image serves without them.
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
# The repo layer's source. Nothing on the request path reads it any more (note 1); kept until a container build
# shows the image serves without it.
COPY --from=build /app/packages ./packages

# A BUILD THAT CANNOT SERVE SHOULD NOT SHIP. Every page reads the registry through node:sqlite, so a Node
# version without it fails the image build instead of failing every page in production. The .ts import is the
# old request-time form (note 1), checked for as long as the COPY above stays.
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

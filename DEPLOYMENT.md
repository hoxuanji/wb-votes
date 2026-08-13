# Deployment

Every claim in this file was checked against the repository as it stands. The previous version documented a
Supabase project, five quiz tables, a MyNeta scraper writing `src/data/candidates_real.json` and a set of
environment variables the code no longer reads; none of that exists.

## What the application is

A Next.js 14 App Router application with **three runtime dependencies** — `next`, `react`, `react-dom` — and
no database server, no cache, no analytics and no external API. Every page is a server component that opens
a SQLite file, runs its `SELECT`s and closes the handle.

```text
                       ┌──────────────────────────────┐
   data/seed/*.json ──▶│  packages/mandate            │
   (committed, hashed) │  migrate → ingest → resolve  │
                       └──────────────┬───────────────┘
                                      ▼
                            .data/registry.db  (SQLite, gitignored)
                                      ▲
                       ┌──────────────┴───────────────┐
                       │  src/app — 18 routes         │
                       │  runtime: nodejs             │
                       │  dynamic: force-dynamic      │
                       └──────────────────────────────┘
```

`runtime = 'nodejs'` on every data route, because they use `node:sqlite`. `dynamic = 'force-dynamic'`,
because `.data/` is gitignored and a route that tried to prerender at build time would have nothing to read.

Client JavaScript: 94.3 kB first load, of which the application's own share is under 500 B per route. The one
client component is `CommandKey`, twenty lines that bind ⌘K to the search field.

## Local

```bash
npm install
npm run registry:migrate
npm run registry:ingest
npm run registry:resolve
npm run mandate -- geography fetch     # the declared boundary datasets, sha256 verified
npm run mandate -- geography import --apply
npm run dev                  # http://localhost:3000
```

**The last two steps are what makes the maps exist.** `data/geo/sources.json` declares two boundary datasets
with their publisher, URL, licence and sha256; `fetch` acquires them and **refuses a file whose bytes do not
match the manifest**; `import` resolves each polygon to a jurisdiction, a boundary epoch and a
`place_version`, validates it, and writes what it resolved. Without them the state pages fall back to
district tallies and say so, which is a working product with no electoral map rather than a broken one.

Add `--replace` to overwrite geometry an earlier run wrote. Run `geography inspect` first to see what would
happen — it is the same decision, printed, with nothing written.

`.env.local` is optional and nothing in `src/` reads it. A fresh clone with no `.data/registry.db` renders
every page with the command above on it rather than a 500 — `RegistryMissing`, and there is one wording of it.

Run a production build somewhere other than `.next` if a dev server is up, or the two will fight over the
directory:

```bash
MANDATE_DIST=.next-verify npx next build
```

## Checks before shipping

```bash
npm run type-check           # tsc over the app
npm run registry:typecheck   # tsc over packages/mandate
npm run lint                 # next lint, via .eslintrc.json
npm test                     # 465 tests; one classified failure (searchPersons ranking)
MANDATE_DIST=.next-verify npx next build
npm run mandate -- geography validate   # constituency identity
npm run mandate -- elections validate   # election-event identity
npm run mandate -- release              # the national coverage report
npm run mandate -- export               # the seed round-trip ratchet — SEE docs/release/RC-1.md
```

`export` currently exits non-zero at 94.0% against a 94.1% floor. That is the one open release blocker and
it is a measurement rather than a defect in the product: Phase 3 replaced a seed geometry module with a
published boundary set, so the registry can no longer reproduce what the seed holds. `docs/release/RC-1.md`
carries the problem, the evidence, three options and a recommendation. Do not lower the floor to make it
pass — its own failure message forbids exactly that.

`npm test` includes `repo/smoke.test.ts`, which calls every read function against the real registry, and
`repo/render.test.ts`, which renders the real routes. Both skip cleanly when `.data/registry.db` is absent,
so CI without a registry is green and proves less — worth knowing before trusting a green build.

`.github/workflows/ci.yml` runs exactly that, in that order, and builds the registry first so the two suites
that need one actually run. It asserts the failure COUNT is at most one rather than ignoring failures, so the
classified `searchPersons` failure stays green and a second one does not. The workflow it replaced triggered
the deleted `/api/cron/scrape-results` endpoint.

## Hosting — the unresolved part

`vercel.json` targets Vercel in `bom1`, and this is the honest statement of where that stands: **the registry
is a 566 MB SQLite file that is not in the repository.** A Vercel build has no way to produce it, and a
serverless function has no writable volume to keep it on. So the deployment story for this architecture is
open, and these are the shapes it could take rather than a plan:

* **Ship the file in the build.** `registry:ingest` during `next build`, and the file lands in the function
  bundle. Bounded by the 250 MB unzipped limit, which the current registry exceeds.
* **A persistent volume or an object store with local caching.** Needs a host with a filesystem — Fly, a
  container, a VM — rather than a serverless function.
* **Move to Postgres in production.** `docs/adr/0001-sqlite-dev-postgres-prod.md` records that decision as
  taken and not yet done. It is the one that scales and the one with the most work in it.

Until one of those is real, this runs locally and in CI. Saying so is better than a guide that reads as
though it has been deployed.

### What `vercel.json` still does

* Security headers on every response: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`.
* `/v1/*` cached for 15 minutes with a one-hour stale-while-revalidate; static assets immutable for a year.
* `/west-bengal/:slug` → `/constituency/:slug`, which redirects on into the place tree. An old inbound URL
  still lands somewhere correct.

## Legal and ethical notes

* Informational only. It endorses no candidate and no party, and it publishes no score, ranking or index
  over people — a composite of declared assets and pending cases is a judgement wearing a measurement's
  clothes, and the one that existed was deleted with the dashboard that showed it.
* Affidavit figures are **self-declared** and are carried as cited claims, never as findings. A declared
  pending-case count is a count: the source records no stage, no court and no outcome, and the page says so
  where the figure is.
* No cookies, no analytics, no personal data collected. There is no client-side telemetry of any kind.
* Boundary geometry credits its publisher in the map's own caption, on the page.
* The Model Code of Conduct applies during election periods. Check ECI guidance before deploying close to a
  poll.

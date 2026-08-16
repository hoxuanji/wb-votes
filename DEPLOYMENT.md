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
npm run mandate -- geography check      # the stored polygons: rings, epochs, containment, provenance
npm run mandate -- release              # the national coverage report
npm run mandate -- export               # the seed round-trip ratchet
```

`export` passes at 95.0% against a 95.0% floor. **The floor moves up only**, in the commit that raises the
number — its own failure message says so, and Phase 3's closure earned 94.1 → 95.0 by deriving a field the
registry already held rather than by moving the line. If it goes red, the registry gives back less of
data/seed/ than it did; `docs/release/PHASE-3-FINAL.md` records how the last move was earned.

## Rebuilding the registry from scratch

```bash
node ops/rebuild.mjs .data/next.db                            # ~12 min, from cached hashed sources
node ops/rebuild-compare.mjs .data/registry.db .data/next.db  # must print REPRODUCIBLE — same content
```

`rebuild.mjs` writes to a **separate file** on purpose: `ingest --fresh` deletes the working registry, and a
verification that destroys what it verifies gets run once and never again. It reads bytes from
`.data/cache/{lokdhaba,eci,geo}`, every one content-addressed, so the same bytes give the same registry —
verified by building twice and comparing every table's row count and a content hash over the rows a reader
meets.

**The step order matters and the script encodes why.** `geography delimitation` has to register
`delim-2023-as` and `delim-2022-jk` before the ECI 2024 import, or that import refuses with nineteen
quarantined seats — Assam's fourteen and Jammu & Kashmir's five have no epoch to belong to until it has run.

`npm test` includes `repo/smoke.test.ts`, which calls every read function against the real registry, and
`repo/render.test.ts`, which renders the real routes. Both skip cleanly when `.data/registry.db` is absent,
so CI without a registry is green and proves less — worth knowing before trusting a green build.

`.github/workflows/ci.yml` runs exactly that, in that order, and builds the registry first so the two suites
that need one actually run. It asserts the failure COUNT is at most one rather than ignoring failures, so the
classified `searchPersons` failure stays green and a second one does not. The workflow it replaced triggered
the deleted `/api/cron/scrape-results` endpoint.

## Hosting — resolved

**Cloudflare at the edge, one Node machine behind it.** The application did not change to get there, and
that is the whole reason for this shape rather than a serverless one.

```
reader → Cloudflare (DNS · CDN · WAF · cache) → Fly machine (Node 24, 2 GB) → /data/registry.db
```

Three measured requirements decided it, and each ruled out an alternative:

| Requirement | Figure | What it rules out |
| --- | --- | --- |
| Read a SQLite file from disk | 581 MB (446 MB with resolution working data dropped) | Vercel functions (250 MB), Workers (10 MB) |
| `node:sqlite`, synchronous | 151 call sites, 127 repo functions, 3 already async | Any network database, without an async port |
| Import `.ts` at request time | `place-page.ts` dynamic `file://` import | Cloudflare Workers — no filesystem, no runtime module loading |
| Node ≥ 23.6 | type stripping unflagged | Node 22 without `--experimental-strip-types` |

That third row is the constraint nobody predicts. `place-page.ts` loads the repo layer through a dynamic
import of an absolute `file://` URL with a `webpackIgnore` comment, deliberately, so the bundler leaves it
alone. `packages/mandate/src/**` therefore has to exist in the running container, and `output: 'standalone'`
is unusable — it copies what the bundler traced, and the bundler was told not to trace those files. It would
produce an image where every route works except the place, district and constituency surfaces.

`Dockerfile` checks the last two rows at **build** time — it imports the runtime `.ts` module and opens an
in-memory `node:sqlite` database in the same form the request path uses. A wrong base image fails the build
instead of failing every page in production.

### First deploy

Nothing here touches `wbvotes.in`; that is the last step.

```sh
fly launch --no-deploy --name iei
fly volumes create registry --region bom --size 3
fly deploy                                  # pages render "registry unavailable" until the next step

npm run registry:migrate && npm run registry:ingest
fly ssh sftp shell -a iei                   # put .data/registry.db /data/registry.db
fly machine restart -a iei

curl -s https://iei.fly.dev/state/ka | grep -c Karnataka
```

`registry:ingest` runs on a workstation, never in CI: it reads source files that are not in the repository.

### Cloudflare

Only after `iei.fly.dev` serves real pages.

1. Add the zone; point the registrar's nameservers at Cloudflare.
2. `CNAME wbvotes.in → iei.fly.dev`, **proxied** (orange cloud).
3. SSL/TLS **Full (strict)** — Fly terminates TLS and `force_https` is set.
4. Leave caching at defaults. The application already sends the right headers and Cloudflare honours them.
5. Set `NEXT_PUBLIC_SITE_URL=https://wbvotes.in` in `fly.toml`, redeploy.

Do **not** add a page rule that caches HTML by default. Every election route is `force-dynamic`, and a
by-election result cached for a day is the staleness this product exists to avoid.

### Updating the registry

The database is a build artefact. Nothing writes to it in production.

```sh
npm run registry:ingest
npm run mandate -- elections validate && npm run mandate -- geography validate
fly ssh sftp shell -a iei                   # put .data/registry.db /data/registry.db.new
fly ssh console -a iei -C "mv /data/registry.db.new /data/registry.db"
fly machine restart -a iei
```

Upload beside the live file and move it into place, so a failed transfer cannot leave a truncated database
where a working one was. The volume is sized for both copies.

### One machine, on purpose

A Fly volume attaches to exactly one machine. A second would boot with no database and serve the unavailable
state to whichever readers it received. Scaling this is a read-replica question, not a
`min_machines_running` question. 2 GB of RAM because SQLite reads through the OS page cache and the hot
tables are `result` (76 MB), `person_alias` (59 MB) and `candidacy` (57 MB); 1 GB fits and thrashes.

### Known data states at first deploy

Stated here so nobody discovers them from a reader:

* **West Bengal 2026 turnout reads "verification pending."** The registry's 93.0% is a seed defect; the value
  and the reason are preserved in the evidence drawer. See `repo/turnout-trust.ts`.
* **Assam and Jammu & Kashmir have no 2024 parliamentary geometry.** Those views say so and list every result.
* **A Lok Sabha seat has no district**, and no assembly-segment list exists. The registry asserts no such
  relationship and none was invented.

### What `vercel.json` still does

Kept for the headers and the inbound rewrite; Cloudflare supplies the same caching at the edge.

* Security headers on every response: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`.
* `/v1/*` cached for 15 minutes with a one-hour stale-while-revalidate; static assets immutable for a year.
* `/west-bengal/:slug` → `/constituency/wb/assembly/:slug`. The body is in the destination because a name
  does not identify a seat, and `/constituency/<slug>` is now the legacy numeric-id route, which 404s on a
  name. The old site held West Bengal assembly seats only, which is why the body is known.

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

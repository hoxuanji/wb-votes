# 04 — Engineering

§17 Technical architecture · §18 Folder structure · §19 Database schema · §20 API design · §21 UX flows

---

## §17 Technical architecture

### Constraints that pick the architecture

1. **Read-dominant, write-bursty.** 99.9% reads, except on counting day.
2. **Two shapes of query.** Entity-by-id (registry, low latency, highly cacheable) and
   aggregate-by-measure over tens of millions of rows (analytics, needs columnar).
3. **Traffic is 100–1000× spikier than any normal product.** Six hours a cycle decide reputation.
4. **Every response must carry provenance.** Not an add-on; a schema property.
5. **Mobile-heavy audience on 4G**, desktop-heavy revenue. Two surfaces, one data layer.
6. **A three-to-six-person team for the first year.** Nothing here may require an SRE rota.

### The stack

```
┌─── CLIENTS ────────────────────────────────────────────────────────────────┐
│  Terminal (Next.js, RSC + islands)     Reader (Next.js, mostly static)     │
│  DuckDB-WASM cross-filter              MapLibre GL + PMTiles              │
│  Cache API (Parquet slices, offline)   SSE client                          │
└──────────────────────────────┬─────────────────────────────────────────────┘
                               │  CDN (edge cache, stale-while-revalidate)
┌──────────────────────────────▼─────────────────────────────────────────────┐
│  API  (Next.js route handlers + a Hono service for /v1)                    │
│  · /v1/entity/*    registry reads      → Postgres (+ Redis cache)          │
│  · /v1/query       semantic layer      → ClickHouse                        │
│  · /v1/slice/*     Parquet slices      → object storage, immutable         │
│  · /v1/live/*      SSE                 → Redis Streams                     │
└───────┬──────────────────┬───────────────────┬──────────────────┬──────────┘
        ▼                  ▼                   ▼                  ▼
   Postgres           ClickHouse         Object storage        Redis
   registry,          facts:             Parquet lake,         cache, streams,
   provenance,        result, round,     PMTiles, source        rate limits,
   claims, graph      booth, turnout     documents             live state
        ▲                  ▲                   ▲
        └──────────────────┴───────────────────┘
                    INGEST (scheduled DAG)
   scrapers → Zod contracts → dbt transforms → entity resolution → publish
   sources: ECI · MyNeta/ADR · TCPD Lok Dhaba · PRS · gazettes · courts · Census/SECC
```

### Decisions and the reasons

**Next.js App Router, kept.** The existing repo is Next 14; upgrade rather than migrate. Server
components are genuinely the right tool for Floor 1 — dense server-rendered tables with no client
JS, which is exactly what the five-second test and the crawlability requirement need.

**Postgres for the registry, ClickHouse for the facts.** The registry is a graph with temporal
joins, foreign keys, and a human review workflow — Postgres, comfortably. The facts are
append-only wide scans with heavy group-bys over tens of millions of rows — Postgres will do this
badly and ClickHouse will do it in 100 ms. Splitting them is more operational surface, and it is
the right split; the alternative is a product that is slow at exactly the thing it exists to do.
*If the team is at three people and ClickHouse is a stretch, start with Postgres + a columnar
extension and treat the split as a planned v2 migration — but design the query layer behind an
interface so it is a swap, not a rewrite.*

**DuckDB-WASM in the browser.** The reason cross-filtering can feel instant on a 4G connection:
download once, filter locally forever. This is the single highest-leverage technical choice in the
document.

**PMTiles, not a tile server.** One archive per boundary epoch on object storage, HTTP range
requests, CDN in front. No tile server to run, no per-tile invocation cost, works at any scale.

**SSE, not WebSockets.** §16.

**Typesense for search** with Indic transliteration. Search must resolve `মমতা`, `Mamata`,
`Momota`, and `ममता` to one person. This needs a custom transliteration + phonetic analyser
chain; the same normalisation code is shared with the entity-resolution blocking stage, so it is
written once in `packages/core` and used in both places.

**No GraphQL.** The access pattern is entity-by-id or aggregate-by-measure. GraphQL's flexibility
buys N+1 queries, hostile cacheability, and an unbounded query surface, in exchange for
flexibility we get from `/v1/query` with a validated grammar. Rejected deliberately.

**Ingest as a scheduled DAG.** Start with cron + a queue; graduate to a workflow engine only when
retries and backfills genuinely hurt. Every ingest step is idempotent and content-hash
deduplicated, so a re-run is free and a partial failure is resumable — which matters because ECI
publishes revisions, and a pipeline that cannot be safely re-run will be re-run anyway.

**Contract-first ingest.** Every scraper's output is validated against a Zod schema before it
touches the warehouse. A source that changes its HTML fails loudly at the boundary instead of
writing nulls into the fact tables. This is the cheapest defence available against the most
common failure mode in scraped data pipelines.

### Caching strategy

| Layer | What | TTL | Invalidation |
|---|---|---|---|
| CDN | Floor 1 pages, static slices, PMTiles | 1 h / immutable | tag purge on data version bump |
| CDN | live snapshot | 10 s | natural expiry |
| Redis | entity reads, resolved measures | 5 m | key by `entity:version` |
| Browser Cache API | Parquet slices | immutable | content-addressed filename |
| Next ISR | Reader pages | 15 m | on-demand revalidate from ingest |

Content-addressing everything cacheable means invalidation is mostly a naming problem rather than
a distributed-systems problem.

### Performance budgets (enforced in CI, not aspirational)

| Surface | Metric | Budget |
|---|---|---|
| Floor 1 (Brief) | TTFB / LCP | 200 ms / 1.2 s on 4G |
| Floor 1 | client JS | **0 KB** for the content; ≤ 40 KB for the shell |
| Terminal shell | JS, gzipped | ≤ 180 KB |
| Map | first meaningful paint | 1.5 s on 4G |
| Cross-filter | interaction to repaint | ≤ 60 ms p95 |
| `/v1/query` | server latency | ≤ 400 ms p95 |
| Live | event to painted | ≤ 1.5 s p95 |
| Reader | total transfer, first view | ≤ 250 KB |

CI fails on budget regression. The current repo compiles 2.8 MB of TypeScript data modules into
the bundle; that is the specific failure these budgets exist to prevent recurring.

### Observability

OpenTelemetry traces across ingest → warehouse → API → client. Four dashboards that matter:
**data freshness per source** (the one that pages someone), **citation coverage** (fraction of
rendered values with a resolvable source), **query p95 by measure**, and **AI abstention and
validity rates**. A freshness alert per source with an owner is worth more than any amount of
uptime monitoring for a product like this.

---

## §18 Folder structure

pnpm workspaces + Turborepo. The boundaries are drawn so a data engineer and a front-end engineer
rarely touch the same file.

```
mandate/
├── apps/
│   ├── terminal/                    # the dense workspace (≥1280px)
│   │   ├── app/
│   │   │   ├── (shell)/             # rail + tabs + ink strip layout group
│   │   │   │   ├── page.tsx                       # Situation Room
│   │   │   │   ├── e/[election]/[[...lens]]/
│   │   │   │   ├── s/[election]/[seat]/[[...lens]]/
│   │   │   │   ├── p/[person]/[[...lens]]/
│   │   │   │   ├── party/[party]/[[...lens]]/
│   │   │   │   ├── pl/[...path]/
│   │   │   │   ├── al/[alliance]/
│   │   │   │   ├── house/[house]/
│   │   │   │   ├── map/
│   │   │   │   ├── studio/
│   │   │   │   ├── b/[board]/
│   │   │   │   └── ev/ · src/[source]/ · claim/[claim]/
│   │   │   ├── (bare)/              # no shell: embeds, print, share cards
│   │   │   └── api/                 # BFF only; no business logic
│   │   ├── cards/                   # Card manifests, one file per card (§9)
│   │   └── boards/                  # shipped board templates
│   ├── reader/                      # mobile-first public surface (§26)
│   │   └── app/  (/, /brief, /me, /vote, /search, entity pages, lite lenses)
│   └── api/                         # Hono service for /v1 — the public API
│       └── src/routes/  entity.ts · query.ts · slice.ts · live.ts · search.ts
│
├── packages/
│   ├── core/                        # types, IDs, temporal helpers, Indic normalisation
│   │   ├── entities/                # Person, Party, Place, Election, Contest, …
│   │   ├── citation/                # Citation, Provenance, Freshness — the P2 types
│   │   ├── temporal/                # as-of queries, boundary epochs, crosswalks
│   │   └── indic/                   # transliteration + phonetics (shared: search & ER)
│   ├── semantic/                    # the semantic layer (§13)
│   │   ├── measures/                # one file per measure + its model card
│   │   ├── dimensions/
│   │   └── compile/                 # QuerySpec → SQL (ClickHouse | DuckDB dialects)
│   ├── ui/                          # L1–L2 primitives + tokens
│   │   └── tokens/                  # colour.ts, type.ts, space.ts — generated, not hand-edited
│   ├── viz/                         # L3 charts + the palette validator in CI
│   ├── map/                         # L7 MapLibre wrapper + layer registry
│   ├── ai/                          # question → QuerySpec compiler, guardrails, evals
│   ├── live/                        # SSE client/server, round diffing, replay
│   ├── ingest/                      # scrapers + Zod contracts + parsers
│   │   ├── sources/                 # eci/ myneta/ prs/ tcpd/ gazette/ courts/ census/
│   │   ├── contracts/               # Zod schemas — the boundary that fails loudly
│   │   └── resolve/                 # entity resolution: block → score → merge → audit
│   └── sdk/                         # published TS client for /v1
│
├── data/
│   ├── dbt/                         # warehouse transforms + tests
│   ├── tiles/                       # tippecanoe recipes, one per boundary epoch
│   ├── slices/                      # Parquet slice definitions
│   └── golden/                      # AI eval set + ER audit samples (versioned)
│
├── ops/
│   ├── migrations/                  # Postgres + ClickHouse DDL, forward-only
│   ├── dags/                        # ingest schedules
│   └── dashboards/                  # freshness, citation coverage, query latency
│
└── docs/
    ├── mandate/                     # this vision set
    ├── adr/                         # one file per architectural decision
    └── methodology/                 # model cards — source of truth for /methodology
```

### Boundary rules, lint-enforced

- `apps/*` may not import from `packages/ingest` (the front end never sees a scraper).
- `packages/ui` may not import from `packages/semantic` (primitives know no domain).
- `packages/viz` may not import from `apps/*`.
- Nothing may import from `data/`.
- **Model cards are the source of truth for `/methodology`.** The route renders
  `docs/methodology/*.md`, so a measure without a model card produces a broken page in CI. This is
  how documentation stays alive: make its absence break the build.

---

## §19 Database schema

Forward-only migrations. Postgres for Rings 1 and 3, ClickHouse for Ring 2.

### Postgres — registry and provenance

```sql
-- ─── places, versioned by boundary epoch ─────────────────────────────────────
CREATE TYPE place_kind AS ENUM
  ('nation','state','ut','division','district','pc','ac','ward','booth');

CREATE TABLE boundary_epoch (
  id            text PRIMARY KEY,              -- 'delim-2008'
  name          text NOT NULL,
  effective_from date NOT NULL,
  effective_to   date,                          -- NULL = current
  source_id     text REFERENCES source(id)
);

CREATE TABLE place (
  id         text PRIMARY KEY,                  -- 'wb', 'wb.nadia', 'wb.ac.084'
  kind       place_kind NOT NULL,
  parent_id  text REFERENCES place(id),
  canonical_name text NOT NULL,
  names      jsonb NOT NULL DEFAULT '{}',       -- {bn: '...', hi: '...'}
  lgd_code   text, eci_code text,
  UNIQUE (kind, eci_code, parent_id)
);
CREATE INDEX ON place (parent_id, kind);

CREATE TABLE place_version (
  id           bigserial PRIMARY KEY,
  place_id     text NOT NULL REFERENCES place(id),
  epoch_id     text NOT NULL REFERENCES boundary_epoch(id),
  number       int,                             -- constituency number in that epoch
  reservation  text CHECK (reservation IN ('general','sc','st')),
  geometry_ref text,                            -- tile feature key; geometry lives in PMTiles
  electors_at_creation bigint,
  UNIQUE (place_id, epoch_id)
);

-- the table that survives the next delimitation
CREATE TABLE place_crosswalk (
  from_place_version_id bigint NOT NULL REFERENCES place_version(id),
  to_place_version_id   bigint NOT NULL REFERENCES place_version(id),
  area_share       numeric(6,5) NOT NULL,
  population_share numeric(6,5),
  elector_share    numeric(6,5),
  method    text NOT NULL,     -- 'areal' | 'booth_reassignment' | 'official_order'
  source_id text REFERENCES source(id),
  PRIMARY KEY (from_place_version_id, to_place_version_id)
);

-- ─── people ──────────────────────────────────────────────────────────────────
CREATE TABLE person (
  id             text PRIMARY KEY,              -- slug: 'mamata-banerjee'
  canonical_name text NOT NULL,
  names          jsonb NOT NULL DEFAULT '{}',
  sex            text CHECK (sex IN ('m','f','o')),
  birth_year     int,
  birth_year_confidence text CHECK (birth_year_confidence IN ('exact','approx','unknown')),
  review_state   text NOT NULL DEFAULT 'unreviewed'
                 CHECK (review_state IN ('unreviewed','auto','human','disputed')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE person_alias (
  person_id  text NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  name       text NOT NULL,
  script     text NOT NULL,                     -- 'latn','beng','deva','taml'…
  norm_key   text NOT NULL,                     -- Indic-aware phonetic key (packages/core/indic)
  kind       text NOT NULL,
  source_id  text REFERENCES source(id),
  PRIMARY KEY (person_id, name, script)
);
CREATE INDEX ON person_alias (norm_key);        -- the ER blocking index

CREATE TABLE person_merge (
  id           bigserial PRIMARY KEY,
  surviving_id text NOT NULL REFERENCES person(id),
  merged_id    text NOT NULL,                   -- retained after cascade; audit trail
  score        numeric(4,3),
  decided_by   text NOT NULL,                   -- 'auto:v3' | 'user:<id>'
  decided_at   timestamptz NOT NULL DEFAULT now(),
  evidence     jsonb NOT NULL,
  reverted_at  timestamptz
);

-- ─── parties, versioned, with lineage ────────────────────────────────────────
CREATE TABLE party (
  id text PRIMARY KEY, name text NOT NULL, short_name text NOT NULL,
  names jsonb DEFAULT '{}',
  kind text CHECK (kind IN ('national','state','registered_unrecognised','independent')),
  registered_on date, dissolved_on date
);

CREATE TABLE party_version (
  id bigserial PRIMARY KEY,
  party_id text NOT NULL REFERENCES party(id),
  valid_from date NOT NULL, valid_to date,
  name text NOT NULL, symbol_id text REFERENCES symbol(id),
  EXCLUDE USING gist (party_id WITH =, daterange(valid_from, valid_to) WITH &&)
);

CREATE TABLE party_lineage (
  from_party_id text NOT NULL REFERENCES party(id),
  to_party_id   text NOT NULL REFERENCES party(id),
  kind text NOT NULL CHECK (kind IN ('split','merge','rename','symbol_transfer','derecognition')),
  effective_on date NOT NULL,
  source_id text REFERENCES source(id),
  PRIMARY KEY (from_party_id, to_party_id, effective_on)
);

-- ─── elections and contests ──────────────────────────────────────────────────
CREATE TYPE election_lifecycle AS ENUM
  ('announced','notified','nominations','scrutiny','withdrawal','campaign','silence',
   'polling','counting','declared','disputed','closed');

CREATE TABLE election (
  id   text PRIMARY KEY,                         -- 'ls-2024', 'wb-assembly-2026'
  kind text NOT NULL CHECK (kind IN
       ('general','assembly','biennial_rs','municipal','panchayat','bypoll','presidential')),
  level text NOT NULL CHECK (level IN ('union','state','district','block','ward')),
  electorate_kind text NOT NULL DEFAULT 'direct'
       CHECK (electorate_kind IN ('direct','indirect','electoral_college')),
  jurisdiction_place_id text NOT NULL REFERENCES place(id),
  epoch_id text NOT NULL REFERENCES boundary_epoch(id),
  name text NOT NULL,
  lifecycle election_lifecycle NOT NULL,
  announced_on date, notified_on date, counting_on date,
  -- §6.10: the compliance gate, enforced in the API from these columns
  forecast_gate_from timestamptz, forecast_gate_to timestamptz
);

CREATE TABLE election_phase (
  election_id text NOT NULL REFERENCES election(id),
  n int NOT NULL, poll_date date NOT NULL, seat_count int,
  PRIMARY KEY (election_id, n)
);

CREATE TABLE contest (
  id text PRIMARY KEY,                           -- 'ls-2024:wb-diamond-harbour'
  election_id text NOT NULL REFERENCES election(id),
  place_version_id bigint NOT NULL REFERENCES place_version(id),
  phase_n int, seats_available int NOT NULL DEFAULT 1,
  lifecycle election_lifecycle NOT NULL,
  declared_at timestamptz,
  UNIQUE (election_id, place_version_id)
);

CREATE TABLE candidacy (
  id text PRIMARY KEY,
  contest_id text NOT NULL REFERENCES contest(id),
  person_id  text NOT NULL REFERENCES person(id),
  party_version_id bigint REFERENCES party_version(id),
  alliance_version_id bigint REFERENCES alliance_version(id),
  symbol_id text REFERENCES symbol(id),
  serial_no int,
  status text NOT NULL CHECK (status IN
    ('filed','rejected','withdrawn','contesting','elected','defeated','disqualified')),
  age_declared int, education_declared text,
  UNIQUE (contest_id, person_id)                 -- ER hard negative depends on this
);

-- ─── affidavits: the delta feature ───────────────────────────────────────────
CREATE TABLE affidavit (
  id text PRIMARY KEY,
  candidacy_id text NOT NULL REFERENCES candidacy(id),
  filed_on date, source_id text NOT NULL REFERENCES source(id)
);
CREATE TABLE affidavit_field (
  affidavit_id text NOT NULL REFERENCES affidavit(id),
  path text NOT NULL,                            -- 'assets.movable.total'
  value_numeric numeric(20,2), value_text text, unit text,
  page_no int, rect jsonb,                       -- the citation anchor
  parser_version text NOT NULL,
  PRIMARY KEY (affidavit_id, path)
);

-- ─── cases: P5 lives here ────────────────────────────────────────────────────
CREATE TABLE legal_case (
  id text PRIMARY KEY,
  person_id text NOT NULL REFERENCES person(id),
  court text, case_no text, sections text[],
  stage text NOT NULL CHECK (stage IN
    ('fir','charged','trial','convicted','acquitted','stayed','unknown')),
  filed_on date, last_hearing_on date, disposed_on date,
  source_id text NOT NULL REFERENCES source(id)
  -- a row with stage='convicted' whose source.kind <> 'court_order' fails a dbt test
);

-- ─── provenance ──────────────────────────────────────────────────────────────
CREATE TABLE source (
  id text PRIMARY KEY, kind text NOT NULL, publisher text,
  title text, url text, archived_url text,
  retrieved_at timestamptz NOT NULL, published_on date,
  doc_hash text NOT NULL, page_count int, licence text
);
CREATE TABLE claim (
  id bigserial PRIMARY KEY,
  subject_ref text NOT NULL,                     -- 'person:mamata-banerjee'
  predicate text NOT NULL, object_value jsonb NOT NULL,
  unit text, as_of date,
  confidence text NOT NULL DEFAULT 'verified'
    CHECK (confidence IN ('verified','provisional','disputed','retracted'))
);
CREATE TABLE citation (
  claim_id bigint NOT NULL REFERENCES claim(id),
  source_id text NOT NULL REFERENCES source(id),
  page_no int, rect jsonb,
  parser_version text NOT NULL, extracted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (claim_id, source_id, page_no)
);
CREATE TABLE correction (
  id bigserial PRIMARY KEY,
  entity_ref text NOT NULL, field text NOT NULL,
  old_value jsonb, new_value jsonb, reason text NOT NULL,
  source_id text REFERENCES source(id),
  corrected_at timestamptz NOT NULL DEFAULT now(),
  public_slug text UNIQUE NOT NULL
);
```

### ClickHouse — facts

```sql
CREATE TABLE result (
  contest_id     LowCardinality(String),
  candidacy_id   String,
  revision       UInt16,
  votes          UInt32,
  postal_votes   UInt32,
  evm_votes      UInt32,
  vote_share     Float32,
  rank           UInt16,
  is_winner      UInt8,
  margin         Int32,
  source_id      LowCardinality(String),
  ingested_at    DateTime
) ENGINE = ReplacingMergeTree(revision)
ORDER BY (contest_id, candidacy_id);
-- ReplacingMergeTree on `revision`: revisions supersede, prior rows stay queryable
-- with FINAL omitted, which is exactly what the correction ledger needs.

CREATE TABLE round_result (
  contest_id   LowCardinality(String),
  round_no     UInt16,
  candidacy_id String,
  votes_cumulative UInt32,
  source_id    LowCardinality(String),
  observed_at  DateTime
) ENGINE = MergeTree ORDER BY (contest_id, round_no, candidacy_id);

CREATE TABLE booth_result (
  contest_id     LowCardinality(String),
  booth_place_id String,
  candidacy_id   String,
  votes          UInt32,
  source_id      LowCardinality(String)
) ENGINE = MergeTree
PARTITION BY substring(contest_id, 1, 8)         -- partition by election
ORDER BY (contest_id, booth_place_id, candidacy_id);

CREATE TABLE turnout (
  contest_id LowCardinality(String), scope LowCardinality(String),
  electors UInt64, voters UInt64,
  male UInt64, female UInt64, third_gender UInt64,
  postal UInt64, nota UInt64,
  source_id LowCardinality(String)
) ENGINE = MergeTree ORDER BY (contest_id, scope);
```

### dbt tests that must pass before publish

```
· every result row has a source_id                      (P2, not-null + referential)
· vote_share sums to 100 ± 0.5 per contest revision
· winner margin equals rank-1 minus rank-2 votes
· no candidacy appears twice in one contest             (ER hard negative)
· legal_case.stage='convicted' ⟹ source.kind='court_order'   (P5)
· contest.place_version_id.epoch_id = election.epoch_id (P4: no cross-epoch contests)
· every place_version in a contest has a crosswalk to the current epoch
· every derived measure has a model card in docs/methodology  (build breaks otherwise)
· booth_result votes per contest ≤ result votes per contest
```

Nine tests, each of which has caught a real class of error in every election dataset that has
ever existed.

---

## §20 API design

### Shape

REST for entities, one validated query endpoint for analytics, immutable objects for slices, SSE
for live. Versioned at `/v1`. Public, documented, rate-limited, and the same API the front end
uses — dogfooding is the only reliable way an API stays good.

### The response envelope

Every response, without exception:

```jsonc
{
  "data":     { /* … */ },
  "sources":  [ { "id": "eci-form20-ls2024-wb-19", "kind": "eci_form20",
                  "title": "Form 20 — Diamond Harbour", "url": "…",
                  "retrievedAt": "2024-06-06T04:12:00Z", "pageNo": 3 } ],
  "meta": {
    "dataVersion":  "2026-08-07T03:00:00Z",
    "freshness":    { "oldestSource": "2024-06-06", "computedAt": "…" },
    "epoch":        "delim-2008",
    "estimated":    false,          // true when crosswalk-derived — the UI must label it
    "caveats":      ["Turnout excludes postal votes for pre-2014 contests."],
    "gated":        []              // measures suppressed by the compliance gate
  }
}
```

`sources` is required and non-empty. An endpoint that can return an empty `sources` array fails
its contract test. That single rule is what makes P2 real rather than aspirational.

### Entity endpoints

```
GET /v1/entity/person/:id            ?include=candidacies,affidavits,cases,offices
GET /v1/entity/party/:id             ?include=versions,lineage,alliances
GET /v1/entity/place/:id             ?epoch=delim-2008&include=versions,crosswalk
GET /v1/entity/election/:id          ?include=phases,contests
GET /v1/entity/contest/:id           ?include=candidacies,results,rounds
GET /v1/entity/alliance/:id          ?asOf=2024-04-01
GET /v1/entity/source/:id            ?include=claims,pages
GET /v1/entity/claim/:id             ?include=citations,citedBy

GET /v1/list/person                  ?office=mla&state=wb&party=aitc&hasCases=true
                                     &sort=-assetsDeclared&cursor=…&limit=50
GET /v1/list/contest                 ?election=ls-2024&marginPctLt=2&sort=marginPct
```

`?include=` rather than nested resources: one round trip, explicit cost, cacheable. Cursor
pagination only — offset pagination over a live-updating table produces duplicates and gaps.

### The query endpoint

```http
POST /v1/query
{
  "measures":   ["turnout_pct", "margin_pct"],
  "dimensions": ["place.district"],
  "filters":    [{ "dim": "election.id", "op": "eq", "value": "ls-2024" },
                 { "dim": "place.state", "op": "eq", "value": "wb" }],
  "orderBy":    [{ "measure": "margin_pct", "dir": "asc" }],
  "limit": 100,
  "asOf": "2024-06-06"
}
```

- Validated against the semantic layer. An unknown measure is a 400 listing the valid ones —
  which is also how the AI layer's compiler self-corrects.
- The response `meta.caveats` is assembled from the measures used, so caveats cannot be forgotten.
- Cross-epoch queries return `meta.estimated: true` and a crosswalk description. The client is
  *required* to render the estimate label; the design system's `Number` component reads it from
  context so forgetting is not possible.
- `GET /v1/query?q=<base64 spec>` mirrors it for cacheable, shareable, embeddable queries.

### Slices, live, search, AI

```
GET  /v1/slice/:election/:state.parquet        immutable, content-addressed, CDN, ~2–20 MB
GET  /v1/slice/manifest                        available slices + hashes + row counts

GET  /v1/live/:election                        full snapshot; CDN-cached 10 s
GET  /v1/live/:election/stream                 SSE deltas; Last-Event-ID resume
     events: round | declaration | lead_change | turnout | tally | heartbeat(15s)

GET  /v1/search?q=মমতা&types=person,place&limit=10     transliteration-aware
POST /v1/ask   { "question": "…" } → { finding, card, querySpec, sources[], caveats[], abstained }
```

### Cross-cutting

- **Auth** — public read at 60 req/min per IP; API keys for 6,000 req/min; seat auth for the
  terminal. Bulk downloads are keyed so we know who relies on what before we change it.
- **Caching** — `ETag` + `Cache-Control: s-maxage` per endpoint class; `X-Data-Version` on every
  response so a client can detect a mid-session data change and offer a refresh instead of
  silently mixing versions.
- **Errors** — RFC 9457 problem details. The `detail` string is written to be shown to a user
  verbatim (§10 writing rules), because it will be.
- **Deprecation** — `Sunset` header, 12 months minimum, and a changelog entry. Researchers cite
  our endpoints in papers; breaking one silently breaks a citation.
- **Compliance gate in the API, not the client.** A gated measure is absent from `data` and named
  in `meta.gated` with a reason. A stale or hostile client cannot render it.

---

## §21 UX flows

Eight flows that carry the product. Each is measured; the number in the heading is the target.

### F1 — Priya files a bypoll story · 3 minutes

```
lands on /  → ink strip shows "COUNTING · Kanhaiyapur bypoll · Round 14/19"
  → clicks it → contest Brief
      headline: "AITC held Kanhaiyapur, but its margin fell 61% from 2021."
      tiles: margin · turnout · swing · NOTA        [all provisional-chipped]
  → presses `.` on the margin → citation popover → ECI declaration, page 1
  → presses `2` → Analysis → the vs-2021 comparison chart is already there
  → `⌥⇧E` → export: PNG for the graphics desk, CSV for the sub-editor,
             provenance footer baked into both
  → copies the share URL, which restores the exact view for her editor
```

Design obligations this flow imposes: the headline must be computed and correct; `provisional`
must be unmissable; export must include provenance without her choosing to include it.

### F2 — Farida finds her representative · 60 seconds, on a phone

```
/  (Reader) → "Find my constituency" → PIN code (GPS optional, never required)
  → PIN maps to one or more ACs → disambiguate by ward if needed
  → her AC page: MLA card (photo, party symbol, since when, contact),
    MP card, next election date, "what this seat decided last time"
  → saved locally; the app opens here next time
  → language toggle is in the header, persists, and Bengali is complete — not a partial layer
```

Obligation: PIN → constituency mapping is genuinely hard (PINs cross constituency boundaries).
When ambiguous we ask rather than guess, and we say why.

### F3 — Anand builds a target-seat list · 15 minutes

```
⌘K → "> new analysis" → Studio
  → dimension: place.ac (Bihar) · measures: margin_pct, swing_volatility, incumbency_retention
  → filter margin_pct < 5 → 84 seats
  → cross-filter by district on the map pane (⌘\ split, ⌘⇧L linked)
  → `t` on the scatter → table → sort by swing_volatility
  → `x` rows → `c` compare top 4 → aligned columns
  → `p` pin the screen to a board → `/b/anand-bihar-2027`
  → `> export csv` → the list, with the measure definitions in the header rows
```

Obligation: cross-filter must be < 60 ms or he goes back to Excel, which is why DuckDB-WASM is
in the architecture rather than a nicety.

### F4 — Rohit tests a hypothesis · 40 minutes

```
/downloads → slice manifest → booth-level Parquet for Bihar 2024 (keyed download)
  → /methodology/turnout_pct to check our definition against his
  → /methodology/entity-resolution to check the merge error rate
  → local analysis → finds a discrepancy → /corrections to see if it is known
  → files a data issue from the entity page (a first-class affordance, not a mailto)
  → the correction, if accepted, appears at a public URL with his credit
```

Obligation: a visible, credited correction path. This converts our most dangerous critics into
our most valuable contributors, which is the only way a dataset this large gets clean.

### F5 — Kavya checks coalition arithmetic · 5 minutes

```
⌘K → "rajya sabha 2027" → /house/rajya-sabha
  → retirement cycle view: who retires, from which state, when
  → CoalitionArithmetic widget: drag parties in/out, majority line moves live
  → switch to Lok Sabha floor strength → same widget, same interaction
  → `p` pin both to a board → schedule a weekly briefing email from that board
```

Obligation: Rajya Sabha indirect-election modelling. Nobody does this. It is a week of schema
work and a permanent differentiator.

### F6 — Counting day, returning user · continuous

```
opens a pinned tab after 20 minutes
  → "While you were away" bar: "12 seats declared, 3 lead changes, NDA +7 since 17:42"
  → ⌥⇧R replays the interval on the map at 8×
  → dismisses; the tally, feed, and map are current
  → a revision arrives: the affected row flashes once, states the change,
    keeps the prior figure in the round timeline
```

Obligation: the round timeline must be stored, not just streamed. That single decision makes
replay, revision history, and the permanent archival value all fall out for free.

### F7 — Anyone verifies a number · 10 seconds

```
any figure, anywhere → `.`  (or click the citation mark)
  → popover: source title, publisher, retrieval date, page, parser version
  → "Open document" → DocumentViewer at the exact page, rect highlighted
  → "What else cites this?" → reverse citation list
```

The product's signature flow. If it is ever slower than 10 seconds, the thesis is broken.

### F8 — A politician disputes their profile · a documented path

```
/p/:person → "Dispute a fact on this page" → structured form: which field, what is wrong,
  what is the correct value, what document supports it
  → the field's ConfidenceChip becomes `disputed` and shows the dispute is open
  → internal adjudication against sources; outcome either way is a public correction entry
  → the original value stays in the record; nothing is silently deleted
```

Obligation: this must exist before national launch, not after the first legal notice. A platform
built on provenance that cannot handle a challenge to its own provenance has no defence.

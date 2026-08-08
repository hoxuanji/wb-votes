# ADR 0005 — the seed tier: what moving `src/data/*.ts` to `data/seed/*.json` did, and what it did not

Status: accepted · 2026-08-09 · Relates to §17 (contract-first ingest), §29 (strangler fig) ·
Implemented in `data/seed/**`, `src/data/*.ts` (shims), `scripts/build-seed.js`,
`packages/mandate/src/ingest/sources/wb-static.ts`

## Context

`packages/mandate` imported `src/data/*.ts` directly, so the new registry depended on the old app it
exists to replace: the old app could not be deleted without breaking the thing replacing it. Cycle 4
moved the row data of eight modules into `data/seed/*.json` — a committed RAW tier both sides read —
and left `src/data/*.ts` as typed re-exports that keep every helper the old app calls.

## What it achieved

- **The dependency inversion, which was the point.** Nothing under `packages/mandate` imports from
  `src/` any more. `data/seed/` is the contract; both the app and the registry are consumers.
- **3,254,894 B of TypeScript out of the compile graph**, replaced by 7,120 B of shims plus
  2,483,747 B of JSON. `tsc` no longer parses and type-checks eight megabyte-scale object literals.
- **One writer for the RAW tier.** Every `build-*.js` and scraper goes through
  `scripts/build-seed.js`, which writes compact, producer-ordered JSON and stamps
  `data/seed/provenance.json` — so a rebuild that changes no data produces a byte-identical file.
  The write is `write-then-rename`, because the seed is now an input the app imports and a bare
  `writeFileSync` of a 1.3 MB payload is observably truncated for the length of the write.
- **The old app renders identically**, which was the acceptance criterion.

## What it did NOT achieve, and the numbers

The cycle was motivated in part as "get megabytes of data out of the client bundle graph". **It did
not.** Measured with two clean builds of this repo (`7cb9ebc` pre-cycle, `e6d928f` post-cycle,
shared `node_modules`, sum of every `.next/static/**/*.js`):

| | pre-cycle | post-cycle | delta |
|---|---|---|---|
| raw client JS | 3,834,226 B | 4,036,135 B | **+201,909 B (+5.3%)** |
| same, gzip -9 | 810,255 B | 812,214 B | +1,959 B (+0.2%) |

Per-route First Load JS: `/` 583 → 586 kB, `/explore` 501 → 505 kB, `/constituency/[id]` 340 → 342 kB,
`/compare` 319 → 320 kB, `/results` 421 → 422 kB. Nothing got smaller.

The cause is that a JSON module minifies **worse** than the TypeScript array literal it replaced.
webpack emits an object literal with unquoted keys (`[{id:"wb26_52",name:"…"}]`) but must emit a JSON
import as `JSON.parse('[{\"id\":\"wb26_52\",\"name\":…}]')` — every key regains its quotes and every
quote gains a backslash. The candidates chunk went 1,244,422 → 1,340,844 B (+7.7%), the
historical-results chunk 705,534 → 791,987 B (+12.3%). The pretty-printing the "8.1 MB" figure was
counting had already been stripped by the minifier before it ever shipped, and ~5.2 MB of that figure
was `src/data/raw/historical/*.csv`, which was never in the bundle at all.

**The data is still in the client bundle**, because ~30 `'use client'` components still
`import { candidates } from '@/data/candidates'` and friends. `/candidates`, `/explore`, `/compare`
and `/constituency/[id]` each ship the full 2,920-row array to the browser. That is the real 1.3 MB
problem and this cycle did not touch it — a shim cannot: the fix is for those components to take data
as props from a server component or read it from `/api`, which is a change under `src/` that cycle 4
was scoped out of.

The honest trade this cycle made: **+197 KB raw / +2 KB gzipped on the wire, and a slightly faster
init path (`JSON.parse` of one string beats evaluating a large object literal), in exchange for the
dependency inversion and 3.2 MB off the TypeScript compile graph.** The payload win is future work,
not delivered work.

## Consequences

- Do not cite this cycle as a bundle-size improvement. §17's performance budgets should be set
  against the measured 4.04 MB, not against a hoped-for 2.17 MB.
- The next payload cycle has a clear target and a clear test: the four routes above, and
  `grep -l wb26_1656 .next/static/chunks/*` returning nothing.
- Two compile-time guarantees were lost with the annotation (`raw as Candidate[]` is a cast, and an
  annotation cannot replace it — `tsc` widens a JSON literal, so a correct `reservation: "SC"` arrives
  as `string` and fails too). A row missing a required key and a value outside a string-literal union
  are now checked at ingest by `seedShapeFailures()` in
  `packages/mandate/src/ingest/field-coverage.ts`, against the same `src/types/index.ts` interfaces.

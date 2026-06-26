# WB Votes → WB Civic Dashboard — Roadmap

> **Read this before planning new work.** This document is the source of truth for what the app is, where it's going, and how to add new data, features, or future elections. Living doc — keep it accurate.

---

## 1. What This App Is

**WB Votes** started life (April 2026) as a constituency-and-candidate explorer for the West Bengal Assembly Election 2026, including live counting on result day. With counting closed and a new BJP-led government in place under Chief Minister Suvendu Adhikari (sworn in 9 May 2026 at the Brigade Parade Ground), the app is **pivoting to an ongoing civic dashboard** for the 2026–2031 assembly term.

**Primary user:** a citizen of any of West Bengal's 294 assembly constituencies (AC) who wants to know — at a glance — what their MLA is doing, what funds they've received, what projects are underway, and how the assembly is functioning.

**Secondary user:** a journalist, researcher, or political worker who needs cross-constituency data without bouncing between PRS India, MyNeta, MPLads/MLALADS portals, and `wbassembly.gov.in`.

**Core value prop:** **One place, beautiful, constituency-first.** Equivalent data exists today but is scattered, ugly, and PDF-heavy.

---

## 2. Current State (May 2026)

| Item | Value |
|---|---|
| Phase enum | `pre` &#124; `live` &#124; `post` &#124; **`governance`** *(new)* |
| Active phase | `governance` (default once an election concludes) |
| Phase env var | `NEXT_PUBLIC_ELECTION_PHASE` (client) and `ELECTION_PHASE` (server) |
| ECI scrape cron | Disabled — commit `c41f3a4` |
| Live KV (Upstash) | Optional, used only during `live` |
| Supabase | Schema present in `database/schema.sql`; mostly unused — most data is static TS |
| Deployment | Vercel (Mumbai region, KV cache headers in `vercel.json`) |

### Phase semantics

- **`pre`** — polling underway or upcoming. Show candidates, hide live tab.
- **`live`** — counting day. `/live` enabled, hero shows live tally chips.
- **`post`** — counting just finished. Story-So-Far insights, post-result cards. ~2-week window.
- **`governance`** — steady-state. Default tab on `/constituency/[id]` is **MLA**. Home shows Cabinet, Funds, Projects, Assembly, News, and an Archive tab linking to election-era surfaces.

Phases **augment, never replace** ([feedback_phases_augment.md](.claude/projects/-Users-jeemut-jana-projects-wb-votes/memory/feedback_phases_augment.md)). The constituency search bar, map, and evergreen content stay visible across every phase.

---

## 3. Vision

A unified, mobile-first civic-tech reference for West Bengal's 294 ACs. Per AC, surface:

- **Current MLA** + party + ministry portfolio (if minister)
- **MLALADS funds** received / spent / utilization %
- **Projects** sanctioned / in-progress / completed (with location, value, beneficiaries)
- **Assembly performance** — sessions attended, questions raised, bills, debates
- **Cabinet directory** — who holds which ministry, with reshuffle history
- **News & hot takes** — controversies, achievements, public statements
- **Historical comparison** — vs the 2016 / 2021 incumbent

When the next election arrives (Panchayat 2028, Lok Sabha 2029, Assembly 2031), the app should pivot back to election mode by adding an `ElectionConfig` and a data folder — not by forking. See *[How to Add a New Election](#9-how-to-add-a-new-election)*.

---

## 4. Architecture Overview

### Stack

- **Next.js 14.2.5** App Router · TypeScript · Tailwind 3.4
- **Recharts** for visualization · custom SVG `WestBengalMap`
- **Upstash Redis** (KV) — only used during `live`
- **Supabase / Postgres** — schema in `database/schema.sql`; minimal use today
- Hosting: **Vercel** (Mumbai); data refresh via Vercel cron (currently paused)

### Phase routing

`src/app/page.tsx` is intentionally minimal — renders `<HomeHero />` + `<HomeTabs />`. **Both components are themselves phase-aware** rather than dispatching to phase-specific page components. This is the post-Phase-3 architecture, settled per the *augment-not-replace* feedback.

### Data layer

Static TypeScript imports under `src/data/` are the rule. Build scripts under `scripts/` convert source JSON / CSVs / PDFs into the TS files. Live, mutable data (counting day, news) goes through API routes backed by KV or Supabase.

| Concern | Storage | Refresh |
|---|---|---|
| Constituencies / districts / map paths | static TS | manual |
| Candidates (per election) | static TS (`src/data/candidates.ts`) | once per election |
| Historical results 2011–2026 | static TS (`src/data/historical-results.ts`) | once per election |
| **Current MLAs (2026 winners)** | static TS (`src/data/current-mla.ts`) | manual (M1.5 — partial today) |
| MLA performance | static TS (`src/data/mla-records.ts`) | weekly cron (planned, M6) |
| Cabinet | static TS (`src/data/cabinet.ts`) | manual + reshuffle alerts |
| Projects | DB (planned, M5) | event-driven |
| News | API proxy (`/api/news`) | per-request |
| Live counting | Upstash KV (`src/lib/live-store.ts`) | 5-min cron during `live` |

### Cron schedule

| Route | When | Status |
|---|---|---|
| `/api/cron/scrape-results` | every 5 min during `live` | **Disabled** (counting over) |
| `/api/cron/refresh-mla-stats` | weekly | **Planned** (M6) |
| `/api/cron/refresh-funds` | monthly | **Planned** (M6) |

---

## 5. Directory Map

```
.
├── roadmap.md                         ← this file
├── src/
│   ├── app/
│   │   ├── page.tsx                   ← thin: <HomeHero/> + <HomeTabs/>
│   │   ├── constituency/[id]/         ← per-AC dashboard (MLA tab default in governance)
│   │   ├── cabinet/                   ← M3: cabinet directory
│   │   ├── mla/[id]/                  ← M4 placeholder (MLA detail)
│   │   ├── projects/                  ← M5 placeholder
│   │   ├── funds/                     ← M5 placeholder
│   │   ├── assembly/                  ← M6 placeholder
│   │   ├── live/                      ← Election-era · gated to phase=live
│   │   ├── results/, compare/, quiz/  ← Election-era · reachable via Archive tab
│   │   └── api/                       ← REST routes (candidates, live, news, cron, admin)
│   ├── components/
│   │   ├── home/                      ← HomeHero, HomeTabs, panels per phase
│   │   ├── cabinet/                   ← M3: MinisterCard, MinistryBadge, filters, summary
│   │   ├── mla/                       ← M4: MLA detail, charts (planned)
│   │   ├── layout/                    ← Header, BottomNav, Footer, Disclaimer
│   │   └── ...                        ← Per-feature components
│   ├── data/                          ← Static TS data (auto-generated or seed-fed)
│   │   ├── cabinet.ts                 ← M3: WB cabinet ministers
│   │   ├── mla-records.ts             ← Stub; populated in M4
│   │   ├── candidates.ts              ← Per-election; will move under elections/wb-2026/ (M2)
│   │   ├── historical-results.ts      ← Per-election; will move (M2)
│   │   └── ...
│   ├── lib/
│   │   ├── election-phase.ts          ← Phase enum + helpers
│   │   ├── elections/                 ← M2 (planned): generic election SDK
│   │   ├── live-store.ts              ← KV abstraction for live tally
│   │   └── ...
│   └── types/index.ts                 ← Shared types
├── scripts/
│   ├── data/                          ← JSON seeds (cabinet.json, mla-records.json, …)
│   ├── build-cabinet.js               ← M3: JSON → src/data/cabinet.ts
│   ├── build-mla-records.js           ← JSON → src/data/mla-records.ts
│   ├── build-historical.js            ← Per-election historical results
│   └── scraper/                       ← Per-election candidate scrapers
└── database/schema.sql                ← Postgres schema (Supabase-compatible)
```

---

## 6. Data Sources

| Category | Source | Status | Refresh | Quality / Gaps |
|---|---|---|---|---|
| Cabinet portfolios | wb.gov.in cabinet page + news (swearing-in) | **M3 (this session)** — manual JSON seed | manual + reshuffle alerts | Reshuffle history not yet tracked; v1 = current only |
| MLA assembly stats | [PRS India](https://prsindia.org) per-state pages | M4 — scraper planned | weekly cron | HTML scraping; some MLAs missing if elected late |
| MLALADS funds | WB state finance / planning dept PDFs | M5 — manual seed first | monthly | PDF tables, irregular formats; v1 = top 50 ACs only |
| Projects | MLALADS portal + RTI | M5 — manual seed first | event-driven | Notoriously incomplete; manual entry will be the norm |
| Sessions / questions / bills | [wbassembly.gov.in](http://wbassembly.gov.in) | M6 — scraper planned | weekly | Slow site; expect rate-limit issues |
| News / hot takes | Existing `/api/news` (Bing News) | Already live | per-request | Per-MLA query needs tuning |
| Member contact info | wbassembly.gov.in member directory | M4 | manual | Sparse phone/email |
| MyNeta criminal/asset | [myneta.info](https://myneta.info) | Already live | once per election | Tied to candidate snapshot, not updated post-election |

### Source attribution

Every new data type has a required `sourceUrl` field. UI MUST surface a "source" link so readers can trace any stat back to its origin. Enforced at the type level for `CabinetMember` (M3); rolling out to other types as they're built.

---

## 7. Roadmap by Milestone

| ID | Title | Status |
|---|---|---|
| **M1** | Phase + IA scaffolding (`governance` phase, governance home tabs) | **Done** |
| **M3 partial** | Cabinet seed + `/cabinet` page | **Done** |
| **M1.5** | Current-MLA data layer + 294-AC backfill | **Done (294/294)** |
| **M4 partial** | `/mla/[id]` detail page | **Done (page shipped; PRS performance data still pending first session)** |
| **Cleanup 2026-06** | Cut stale/placeholder surfaces; rewrite `/funds` + `/assembly` as honest reference | **Done** |
| M2 | Election SDK extraction (`src/lib/elections/`, `src/data/elections/wb-2026/`) | Queued |
| Live-data Wave A | News ticker on home + Supabase-backed citizen issue map | Queued — see [docs/superpowers/specs/2026-06-26-live-civic-tool-plan.md](docs/superpowers/specs/2026-06-26-live-civic-tool-plan.md) |
| Live-data Wave B | PIB + wb.gov.in RSS aggregator → "This week in government" feed | Queued (depends on Wave A) |
| Live-data Wave C | PRS scraper run + assembly performance columns | Gated on first assembly session |
| M7 | Bilingual coverage on new pages (extend `src/i18n`) | Queued |

### M1 — Phase + IA scaffolding (done)

- [x] Add `'governance'` to `ElectionPhase` enum + helpers
- [x] Extend `HomeHero` with compact governance variant
- [x] Extend `HomeTabs` with governance tab set (now: Cabinet · Funds · Assembly · News · Archive — Projects tab cut in the 2026-06 cleanup)
- [x] Routes: `/mla/[id]`, `/funds`, `/assembly` (`/projects` removed in cleanup)
- [x] Update `Header` and `BottomNav` for governance phase

### M3 (partial) — Cabinet seed + `/cabinet` (done)

- [x] New types: `MinistryPortfolio`, `CabinetMember`; extend `MLARecord` with `ministryPortfolios`
- [x] Manual JSON seed at `scripts/data/cabinet.json`
- [x] Build script `scripts/build-cabinet.js`
- [x] Components: `MinistryBadge`, `MinisterCard`, `CabinetFilters`, `CabinetSummary`
- [x] `/cabinet` page with CM hero + filters + grid
- [x] Wire `<MinistryBadge />` into `MLAScorecard` for ministers' constituencies

### M1.5 — Current-MLA data layer + 294-AC backfill (done)

The 2026 election was won by BJP (208 seats incl. the Falta repoll). Suvendu Adhikari became
CM on 9 May 2026.

- [x] `CurrentMLA` type, `src/data/current-mla.ts`, seed at `scripts/data/current-mla.json`
- [x] Build script `scripts/build-current-mla.js`; npm `data:current-mla`
- [x] `MLAScorecard.tsx` reads from `current-mla.ts` in governance phase
- [x] `scripts/sync-current-mla.js` to backfill from historical entries; npm `data:sync-current-mla`
- [x] **All 294 ACs backfilled** — 293 from the IndiaVotes CSV in May, Falta added 2026-06-26 from Wikipedia after the 24 May repoll (BJP / Debangshu Panda / margin 109,021)
- [x] `re-election.ts` `RE_ELECTION_ACS` now empty — Falta resolved

### M4 partial — `/mla/[id]` detail page (done)

- [x] `/mla/[id]` page: hero with photo, party badge, ministry portfolio chips, margin, electoral history (2026/2021/2016), candidate-affidavit summary linked to `/candidate/[id]`, news feed, contact section, vacant-seat fallback
- [x] `generateStaticParams` over all 294 ACs
- [x] Wire "View full profile" link from `MLAScorecard`
- [x] PRS scraper code (`scripts/scraper/prs-wb-mla.js`) committed — run locally when first assembly session publishes data

**Open:** Performance grid (attendance, questions, bills, debates) is hidden until `mla-records.ts` is populated. Re-enable by running `npm run scrape:prs-mla` locally followed by `npm run data:mla` once PRS publishes WB 2026-term data.

### Cleanup 2026-06 (done)

Audit on 2026-06-26 surfaced that the civic-issues map and `/projects` tab were dressed-up
static seeds (292 fake-news entries dated 11 May, all `/projects` data sourced to one Wikipedia
article), and a dozen UI strings referenced milestone IDs to users. All cut.

- [x] Delete `src/data/civic-issues.ts`, `scripts/data/civic-issues-seed.json`, build script, related components (`CivicIssueMap`, `ComingSoon`, `ProjectsPanel`, `FlagshipProjectCard`)
- [x] Delete `src/data/flagship-projects.ts`, seed JSON, build script, npm scripts
- [x] Delete `/projects` route, drop the "Projects" home-tab and the legacy `GovernanceDashboard`
- [x] Strip "coming in M5/M6", "Phase 2 candidates coming soon", "will be added when X is ingested", etc. across all components
- [x] Rewrite `/funds` as a MLALADS scheme reference + per-AC allocation directory (no fake utilisation column)
- [x] Rewrite `/assembly` as a sitting-MLA roster with party-composition breakdown (no empty performance columns)
- [x] `/api/reports` GET no longer merges the seed — returns only real Supabase rows (empty if Supabase not configured)
- [x] `ConstituencyIssuesFeed` rewritten as a client component that fetches `/api/reports` and shows "Be the first to flag something" when empty
- [x] `WestBengalMap` hover panel now governance-aware: in governance shows current MLA + party + margin + ministry portfolio + seat-flip badge instead of "Data coming soon"
- [x] Home page renders `HomeHero` + `HomeTabs` for all phases (per the augment-not-replace principle), governance variant no longer goes through a separate dashboard component

### M2 — Election SDK extraction (queued)

Move election-specific concerns behind a thin SDK boundary so future cycles plug in via config + data folder.

- `src/lib/elections/` — `ElectionConfig` types, ECI URL builder, scraper skeleton, live-store keying
- `src/data/elections/wb-2026/` — relocate `candidates.ts`, `historical-results.ts`, `re-election.ts`
- `src/data/parties.ts`, `constituencies.ts`, `wb-districts.ts` stay general
- Hardcoded `c0166` / Mamata in `CMWatch.tsx` → config-driven

### Live-data waves (queued)

Replaces the old M5/M6 milestone framing. Full plan with sources, refresh strategy, and ordering at [docs/superpowers/specs/2026-06-26-live-civic-tool-plan.md](docs/superpowers/specs/2026-06-26-live-civic-tool-plan.md).

- **Wave A** — Daily news ticker on home + reactivate civic-issues map against real Supabase submissions.
- **Wave B** — PIB + wb.gov.in RSS aggregator into a "This week in government" feed; cabinet-reshuffle alerts layered on top.
- **Wave C** — Run PRS scraper after first assembly session, populate `mla-records.ts`, surface performance columns on `/assembly` and `/mla/[id]`.

MLALADS *utilisation* tracking is explicitly out of scope until the WB Planning Department publishes the first annual report (likely mid-2027).

### M7 — i18n parity (queued)

Extend `src/i18n` to cover `/cabinet`, `/mla`, `/funds`, `/assembly`. New data types gain `nameBn`-style fields where it makes sense (ministry names).

---

## 8. How to Add MLA Data

There are two complementary data files:

### 8.1 Current MLA per AC ([src/data/current-mla.ts](src/data/current-mla.ts))

"Who holds the seat right now". One row per AC. Required when in governance phase
to avoid `MLAScorecard` falling back to the previous-term winner.

**Path A — Lokdhaba CSV (preferred, when published).** Lokdhaba publishes a clean WB-AC results CSV ~6 weeks after each election. When it lands:

```
1. Drop the file at  src/data/raw/historical/lokdhaba-wb-ac-2026.csv
2. npm run data:historical        # populates 2026 in historical-results.ts
3. npm run data:sync-current-mla  # writes scripts/data/current-mla.json
                                  #   - matches candidateId from candidates.ts
                                  #   - aborts cleanly if no 2026 entries exist
4. npm run data:current-mla       # emits src/data/current-mla.ts
5. Commit all three: the CSV, historical-results.ts, current-mla.json + .ts
```

**Path B — Manual edit.** For one-off corrections (defectors, by-elections):

```
1. Edit  scripts/data/current-mla.json  directly
2. npm run data:current-mla
```

`build-current-mla.js` validates required fields and rejects duplicate `constituencyId`. Required: `constituencyId`, `name`, `partyId` (matching `parties.ts`), `term`, `sourceUrl`. Margin / vote share / candidate ID are nullable — add them when known.

> **Heads up:** `data:sync-current-mla` overwrites `current-mla.json` in full. If you've made manual edits, reapply them after sync (or skip sync and edit by hand for the affected ACs).

### 8.2 MLA performance per term ([src/data/mla-records.ts](src/data/mla-records.ts))

Attendance, questions, bills, debates, MLALADS spending. One row per (MLA, term).

1. Edit `scripts/data/mla-records.json` (array of `MLARecord`).
2. Run `npm run data:mla` — regenerates `src/data/mla-records.ts`.
3. Commit both files. Build script is idempotent and the empty state still compiles.

Required: `candidateId`, `constituencyId`, `term`, `lastUpdated`. Performance fields are optional; UI shows `—` when missing.

**Source attribution:** include `sourceUrl` whenever the data is observable. Stats without sources should not ship.

---

## 9. How to Add a New Election

When the next election (Panchayat 2028, Lok Sabha 2029, Assembly 2031) approaches:

1. **After M2 lands**, create `src/data/elections/<id>/` (e.g. `wb-loksabha-2029`):
   - `candidates.ts`, `historical-results.ts`, `re-election.ts`
   - `config.ts` exporting an `ElectionConfig` — body type, year, ECI URL pattern, polling/counting dates, term span.
2. Register the config in `src/lib/elections/index.ts` and set as active.
3. Set `NEXT_PUBLIC_ELECTION_PHASE=pre`.
4. Build candidate data: `npm run scrape:<election-id>` (per-election scraper under `scripts/scraper/`).
5. On counting day: flip env to `live`. Re-enable `scrape-results` cron with the new ECI URL.
6. After counting: flip to `post` for ~2 weeks.
7. After government formation: flip to `governance`. Refresh `cabinet.ts`, archive previous-term MLA records (`term: '<prev>-<this>'`), kick off MLA-stat refresh.

Old elections stay accessible via the Archive tab — never break a deep-link to `/results` or `/candidate/[id]`.

---

## 10. Open Decisions

1. **288/294 missing 2026 winners.** The KV live store was the only repository of 2026 per-AC results and the cron is disabled. Pipeline is wired (see §8.1) — waiting on the Lokdhaba 2026 CSV (~6 weeks post-election). Drop it into `src/data/raw/historical/`, run the four-command flow, done.
2. **Defection handling.** `partyAtElection` vs `currentParty`. Decide schema before MLA detail page (M4).
3. **Cabinet reshuffle history.** Schema supports it via `portfolios[].to`; UI shows current only for v1.
4. **MLALADS data realism.** v1 will ship with manual seed for top 50 ACs; full coverage waits on RTI / scraping success in M5.
5. **Bilingual coverage.** v1 of governance pages is English-only; M7 adds Bn.
6. **Static vs DB.** Hybrid is the answer: static TS for slow-changing (cabinet, MLA bios), DB for fast (projects, news). DB pieces start in M5.
7. **Cron quota.** Vercel free plan has limits; consolidate to one weekly cron in M6.
8. **`/archive/2026` namespace.** Not needed until a second election ships — current Archive tab links to existing `/results`, `/live`, `/compare`, `/quiz`.

---

## 11. Glossary

| Term | Meaning |
|---|---|
| **AC** | Assembly Constituency. WB has 294. |
| **MLA** | Member of Legislative Assembly (state-level legislator). |
| **MP** | Member of Parliament (national-level legislator). |
| **MLALADS** | MLA Local Area Development Scheme — funds each MLA gets to allocate to local projects. |
| **MPLADS** | The MP equivalent of MLALADS. |
| **PRS** | [PRS Legislative Research](https://prsindia.org) — independent tracker of legislative activity. |
| **ECI** | Election Commission of India. |
| **MyNeta** | [myneta.info](https://myneta.info) — citizen-watchdog database of candidate affidavits. |
| **RTI** | Right to Information — formal request mechanism for government data. |
| **Lokdhaba** | [Trivedi Centre](https://lokdhaba.ashoka.edu.in) electoral dataset; primary source of historical results 2011–2021. |

---

*Last updated: 2026-06-26 — M1.5 closed (294/294 incl. Falta), M4 detail page shipped, stale civic/projects surfaces cut, live-data plan committed at [docs/superpowers/specs/2026-06-26-live-civic-tool-plan.md](docs/superpowers/specs/2026-06-26-live-civic-tool-plan.md).*

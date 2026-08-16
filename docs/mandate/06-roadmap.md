# 06 — Roadmap, debt, and critique

§28 Roadmap · §29 Technical debt strategy · §30 Final critique

---

## §28 Roadmap

### The anchor dates

The roadmap is not a wishlist; it is scheduled against elections that will happen whether we are
ready or not. Today is **August 2026**. West Bengal 2026 is behind us and is the corpus we already
have.

| When | Event | What it demands of us |
|---|---|---|
| Q4 2026 | Rajya Sabha biennial cycle; local-body polls | the off-season engine must work |
| **Early 2027** | **Uttar Pradesh + Punjab, Uttarakhand, Goa, Manipur assemblies** | **the dress rehearsal: live mode at real scale** |
| Late 2027 | Gujarat, Himachal assemblies | national coverage must be complete |
| 2027–28 | The delimitation process begins in earnest | P4 pays off or we die |
| 2028 | Karnataka, Rajasthan, MP, Chhattisgarh, Telangana | the analytics product must be selling |
| **2029** | **Lok Sabha general election** | **the destination. Everything aims here.** |

Two consequences. First, **live mode must be production-hard by February 2027**, not 2029 — a
national election is the wrong place to discover what breaks. Second, **the delimitation
architecture must exist before the delimitation debate does**, because being the only platform
that can honestly render "this seat before and after" during that debate is a defining moment we
cannot retrofit into.

### MVP — "the registry, proven" · 14 weeks · Aug–Nov 2026

**Goal:** one state, complete and deeply cited, with the registry and provenance architecture
real. Narrow and deep, not broad and shallow.

**Scope:** West Bengal + Bihar (two states so the multi-state joins are exercised from day one and
we never build a single-state assumption). Lok Sabha 2004–2024 and assembly 2001–2026 for both.

| Wk | Deliverable |
|---|---|
| 1–3 | Postgres registry schema (§19); boundary epochs 1976/2008; `place_crosswalk` for WB+BR; forward-only migrations |
| 2–5 | Ingest contracts (Zod) for ECI results, MyNeta affidavits, TCPD Lok Dhaba, PRS; migration of the existing scrapers into `packages/ingest` |
| 4–7 | Entity resolution v1: Indic phonetic blocking, scoring, human review queue; a published merge error rate |
| 5–8 | Provenance chain end to end: `source` → `claim` → `citation` with page anchors; the `.` gesture working on one entity type, then all |
| 6–9 | Design system: tokens, L1–L2 primitives, five charts, the palette validator wired into CI |
| 8–11 | The four lenses on Contest, Person, Place, Party; the shell (rail, tabs, `⌘K`, ink strip) |
| 9–12 | Map: PMTiles for WB+BR at AC and PC level, 6 layers, hover card, table view |
| 11–13 | Semantic layer with 10 measures + model cards; `/v1/query` on Postgres (ClickHouse deferred) |
| 12–14 | Reader surface: `/`, `/me`, `/brief`, entity Briefs; full Bengali and Hindi |

**Explicit non-goals in MVP.** No live mode. No AI. No booth-level data. No Analytics Studio. No
ClickHouse. No boards. No Rajya Sabha. Cross-filtering is server-side and honest about it.

**Ship gate — all five, no exceptions:**
1. 100% of rendered values resolve to a citation. Measured by a crawler, not by assertion.
2. Merge error rate < 1% on a 200-record blind audit, published.
3. Floor 1 ships 0 KB of content JavaScript and hits LCP < 1.2 s on throttled 4G.
4. Five external users complete the five-second test on eight routes.
5. `/methodology` is complete for every measure — no measure without a model card.

*Why 14 weeks and not 6:* weeks 1–7 produce almost nothing demoable. That is the point, and it is
the part a founding team is most tempted to skip. Skipping it means building the entity resolver
after the UI depends on unstable IDs, which is a rewrite rather than a refactor.

### v1 — "national, and live" · 20 weeks · Dec 2026–Apr 2027

**Goal:** national coverage and a live mode that survives UP 2027.

- **All 28 states + 3 UTs with legislatures**, Lok Sabha 1962→2024 and assemblies from the
  earliest reliable digitisation, state by state with a public coverage matrix at
  `/methodology/coverage`. Where we do not have data we say so on the page, with the reason.
- **ClickHouse migration** for the fact tables behind the existing query interface.
- **Live mode** (§16): SSE, round ingestion, the calling discipline, the degraded static fallback,
  the "while you were away" diff. **Load-tested at 1000× baseline before February.**
- **Analytics Studio v1** with DuckDB-WASM cross-filtering and Parquet slices.
- **Boards** — saved dashboards, which is also the first thing a paying seat wants.
- **Rajya Sabha and institutional arithmetic** — the Kavya differentiator, and cheap.
- **Affidavit deltas** across filings — the single most compelling feature in the product.
- **Public API + SDK + bulk downloads** with keys, so we learn who depends on what.
- **The compliance layer** (§6.10) fully wired, including the poll-period gate, before any
  election is notified.

**Ship gate:** UP 2027 counting day served at target latency, with zero seats called ahead of the
returning officer, zero silent revisions, and a public post-mortem of everything that broke.

### v2 — "the intelligence layer" · Q2–Q4 2027

- **AI Analyst** (§14) — query compilation, entity summarisation, briefing generation, with the
  golden eval set and published abstention rate.
- **Booth-level data**, one state at a time, starting where Form 20 quality is best. Booth maps at
  z ≥ 11 — the view nobody else has.
- **Evidence Explorer** as a full surface: gazettes, court orders, archived statements with
  timestamped transcripts, fact-check integration, reverse citation.
- **Municipal and panchayat elections** — the earliest signal of a state's direction and
  completely unaggregated today. This is where "party momentum" becomes genuinely predictive.
- **Influence networks** and the funding graph.
- **Delimitation workbench** — pre/post boundary comparison with crosswalk-weighted estimates,
  ready before the process becomes the country's main political story.
- **Terminal seats sold.** Three newsrooms, two consultancies, one fund, at a publicly listed
  price.

### v3 — "the reference" · 2028–2029

- **Forecasting**, with a published model, published intervals, published historical accuracy, and
  the compliance gate. Not before we have three cycles of our own data to score against.
- **Historical depth to 1951** — a multi-year archival digitisation programme, probably
  grant-funded and done in partnership with TCPD rather than in competition.
- **Data licensing and embeddable graphics** as a revenue line: our charts, with our provenance
  footer, inside other people's articles.
- **Academic dataset with a DOI and a codebook.** The slowest, most durable trust signal
  available.
- **Lok Sabha 2029** — the platform's proof.

### Sequencing rules that override any feature argument

1. **Registry before interface.** Always. A beautiful UI over unstable IDs is a rewrite.
2. **Provenance before breadth.** One state fully cited beats twenty states uncited. The
   uncited version is a liability we would have to unship.
3. **Two states before one.** A single-state MVP encodes single-state assumptions everywhere and
   the second state costs three times what it should.
4. **Live mode a full cycle before it matters.** February 2027, not 2029.
5. **Nothing ships without a model card.** Enforced by the build (§18).
6. **The coverage matrix is public from day one.** Publishing our gaps is what earns the right to
   be believed about what we do have.

---

## §29 Technical debt strategy

### The debt we are starting from

The current repository is a competent prototype carrying five specific, named debts. Naming them
is the first act of managing them.

| Debt | Evidence | Cost | Plan |
|---|---|---|---|
| **Data compiled into the bundle** | [src/data/candidates.ts](../../src/data/candidates.ts) 1.6 MB, [historical-results.ts](../../src/data/historical-results.ts) 1.2 MB, [wb-ac-paths.ts](../../src/data/wb-ac-paths.ts) 168 KB — ~2.8 MB of TS modules | every user downloads every candidate; no incremental updates; type-checking is slow | replaced by Postgres + ClickHouse + Parquet slices in MVP weeks 1–5. **Deleted, not migrated.** |
| **No database** | 12 `build-*.js` scripts producing TS modules | no incremental ingest, no revisions, no provenance | the registry, MVP weeks 1–3 |
| **Geometry as SVG paths** | `wb-ac-paths.ts` | one state only; no epochs; no zoom; no booths | PMTiles, MVP weeks 9–12 |
| **No provenance** | no `source` or `citation` anywhere in `src/types` | the product's central claim is unimplementable | Ring 3, MVP weeks 5–8 |
| **Scrapers without contracts** | [scripts/scraper/](../../scripts/scraper/) writes directly to data files | a source HTML change writes nulls silently | Zod contracts at the boundary, MVP weeks 2–5 |

**Also worth saying plainly:** the scraper corpus is the most valuable thing in the repository.
It represents real, hard-won knowledge of how ECI, MyNeta, and PRS actually publish. It is
promoted, not discarded.

### Strangler-fig migration, not a big-bang rewrite

Even though this is a product rewrite, a big-bang cutover is the wrong execution. The path:

```
Phase A  packages/core defines the entity types.
         The existing pages import types from core but still read the static data modules.
         Nothing user-visible changes. The seam exists.

Phase B  A repository layer behind core's types: reads route to Postgres where populated,
         fall back to the static modules where not. Per-entity migration, per-entity flag.

Phase C  Static modules deleted entity type by entity type. A CI rule forbids new imports
         from src/data/ from the day Phase A lands — the file that cannot grow will shrink.

Phase D  The new shell and lenses ship as apps/terminal alongside the old routes,
         behind a flag, with the old routes redirecting as each replacement reaches parity.

Phase E  Old app deleted. One PR, large diff, zero behaviour change — the good kind.
```

The rule that makes this work: **the old app is never improved during the migration.** Bug fixes
only. Every hour spent improving code with a deletion date is an hour stolen from the thing that
replaces it.

### Preventing the next generation of debt

**Debt is a ledger entry, not a feeling.** Every deliberate shortcut leaves a comment with the
ceiling it hits and the upgrade path:

```ts
// debt(2027-02, live-scale): single Redis stream per election. Ceiling ~50k concurrent
// SSE clients. Shard by state if UP 2027 load testing exceeds that.
```

A script harvests these into `docs/debt.md` weekly, with the date and the owner. A ledger entry
without an owner and a trigger condition is a wish.

**One-way doors get an ADR.** Choices that are expensive to reverse — the Postgres/ClickHouse
split, PMTiles, SSE over WebSockets, no GraphQL, the semantic layer as the AI's only output space
— each get a file in `docs/adr/` stating the decision, the alternatives, and **what evidence
would reverse it.** An ADR without a reversal condition is a rationalisation.

**Structural rules that cost nothing and prevent everything:**

- `no-single-use-export` on `packages/ui` — the design system grows by promotion, never by
  anticipation (§8).
- Package boundary lint (§18) — no app imports a scraper, no primitive imports the domain.
- Performance budgets fail CI (§17) — the 2.8 MB bundle cannot recur.
- The palette validator gates colour changes (§24.8).
- Every derived measure needs a model card or the build breaks (§18).
- Every API endpoint has a contract test asserting non-empty `sources` (§20).
- Forward-only migrations; no down migrations. Rolling forward is the only path that is ever
  actually tested.

**The 20% rule.** Every development cycle allocates 20% to the ledger, drawn from the top by
`(cost of delay × blast radius)`. Not "when we have time" — there is never time, which is how
debt becomes architecture.

**The data-debt category everyone forgets.** Code debt is visible; data debt is not. Four
specific ones to track from day one: unresolved entity-merge queue depth, source-parser drift
(a parser whose confidence is falling), coverage gaps in the public matrix, and stale-source age
per pipeline. **Data freshness is the only metric that pages a human.** A beautiful, fast, wrong
platform is worse than no platform, and only the freshness dashboard catches that.

---

## §30 Final critique

An honest assessment. The bull case first, because it is real, then the bear case, because it is
more likely to determine the outcome.

### Why this could become the definitive platform

**1. The moat is the boring part, and boring parts do not get copied.**
A competitor can clone this interface in three months. They cannot clone a human-audited registry
of every Indian politician with alias graphs, merge provenance, and a published error rate, or a
`place_crosswalk` covering three delimitation epochs. That asset compounds daily and is worth more
in year three than in year one. Choosing the unglamorous asset as the moat is the single most
important decision in this document.

**2. Nobody occupies this position.**
The Election Commission has authority and no product. ADR and TCPD have the best data in the
country and almost no interface. News portals are event-shaped and empty in October. Wikipedia is
prose without a time axis. The position — *authoritative, dense, cited, always-live* — is genuinely
vacant, in the world's largest democracy, and it is vacant because it is hard rather than because
it is unwanted.

**3. Provenance is a real differentiator in exactly this market.**
Indian political information is contested by default. A platform where every number opens onto its
source document is not a feature; it is a different category of thing. And it is defensible in the
way that matters: when someone disputes a figure, we do not argue — we show the page. §21's F8
flow, the dispute path, is the load-bearing piece most competitors would omit.

**4. The delimitation window is a once-in-fifty-years opening.**
The next delimitation will be the largest structural story in Indian politics for a decade, and
it will make every existing election database incoherent. Being the only platform that can render
"this seat, before and after, with a stated crosswalk method" during that debate is a category-
defining moment. It requires the schema in §12 to exist *first*, which is why P4 is a principle
rather than a feature.

**5. The revenue model does not require winning consumer attention.**
Bloomberg sells seats, not eyeballs. Newsrooms, political consultancies, funds, and research
institutions have budgets and a real pain. The free Reader surface is the funnel and the public
good; the terminal is the business. This avoids the trap that kills civic-tech products —
enormous traffic, no revenue, and a dependence on grant cycles.

**6. The accessibility mathematics forced the culturally correct design.**
The validator runs in §24 show that party brand colours are undecodable. The fix — symbol-first
identity — is exactly how Indian ballots have worked since 1951, for the same underlying reason:
not everyone can read the label. When the measured answer and the authentic answer coincide, the
design is probably right.

### Why it could fail

**1. The data operation is the company, and it is a people cost, not a code cost.**
Form 20 is ~1.05 million polling stations of PDFs of wildly varying quality across 31
jurisdictions. Entity resolution needs a staffed review queue forever. Court records need a
paralegal, not a scraper. The realistic annual data-operations cost dwarfs the engineering cost,
and it never ends. **Any plan that treats ingestion as a sprint has already failed.** If the
funding model cannot support a permanent data team, build for four states and be excellent, rather
than for 31 and be wrong.

**2. Legal exposure is asymmetric and personal.**
Publishing pending-case data about powerful people in India invites defamation actions, and the
process is the punishment regardless of merit. Forecast and opinion-poll publication is
restricted during poll periods. §6.10 and P5 are designed for this, but design is not a defence
budget. This needs counsel on retainer, a documented editorial policy, insurance, and a
pre-agreed response protocol — before national launch, not after the first notice.

**3. The scope in this document is roughly three times what a small team can build.**
The user's brief lists ten modules; a faithful reading is several person-decades. §28 sequences it,
but the honest statement is that **v2 as written will slip, and the discipline is which parts slip.**
The parts that must not: the registry, provenance, and the calling discipline. The parts that
should slip freely: AI, forecasting, panchayat coverage, influence networks.

**4. The aesthetic is the most seductive and least important part.**
It is genuinely tempting to build the dark terminal, the ink strip, and the phase ladder in three
weeks and demo something beautiful over incomplete data. That path produces a product that is
impressive for one demo and indefensible on the first hard question. **If there is one failure
mode to guard against by name, it is this one.** Weeks 1–7 of the MVP produce almost nothing
visible, and protecting them is the founding team's main job.

**5. Two surfaces is a real tax on a small team.**
Terminal and Reader (§26) is the right call and it is a 40% front-end cost increase. It is only
survivable because they share the API, the tokens, and the charts. If that sharing erodes, cut
Reader to Briefs and `/me` only rather than letting two half-products drift.

**6. "Never empty, never stale" is a promise about staffing.**
P6 commits us to a Situation Room that is meaningfully different every day for 365 days. That is
not a design problem; it is an editorial and data-ops rota. If it is not staffed, the front page
becomes a museum in month three and the whole thesis of a live civic instrument dies quietly.

### The single most important thing

**Build the registry and the provenance chain before building anything a user can see.**

Every durable advantage in this document — the map, the analytics, the AI, the delimitation
workbench, the API, the academic dataset — is a view over the registry. Every one of them is
worthless if the registry is wrong. And the registry is the one part that cannot be added later,
because everything built on unstable identity has to be rebuilt when identity stabilises.

Get that right, in two states, deeply cited, with a published error rate. Then the rest of this
document is execution.

### The test of whether this worked

Not traffic, not funding, not launch coverage. This:

> **In 2029, when a claim about an Indian election is disputed on television, both sides open the
> same platform to settle it.**

That is what "definitive" means. It is earned by provenance and error rates, not by design — and
the design in these documents exists to make provenance fast enough that people actually use it.

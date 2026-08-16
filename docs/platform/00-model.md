# Political Intelligence Platform — the model

**Status: spec of record as of 2026-08-10. Supersedes the framing of `docs/mandate/`.**

`docs/mandate/` specifies an *Election Intelligence Platform* — ten election modules, four lenses, a
canonical registry of people, parties and places. That spec is not wrong and is not discarded: it
becomes the specification of **one vertical**, the electoral one, and its registry is the spine
everything else hangs off. What changes is the frame around it.

The product is a **political intelligence platform**. Elections are its live-event mode, not its
subject.

---

## 1. Why the current build feels disconnected

The registry today ends at `result`. A person contests a seat, wins or loses, and the record stops.
That is why the product reads as election trivia rather than intelligence: **nothing in the schema
represents holding power**, so there is nowhere for performance, spending, promises or portfolios to
attach.

The missing link is one table.

```
                     ┌──────────── the spine ────────────┐
  contest → result ──▶  TENURE  ──▶ activity      (attendance, questions, debates)
                          │        ├─ allocation   (budget lines, scheme money, CDF)
  appointment  ──────────▶│        ├─ expenditure  (what was actually spent)
  (minister, RS seat,     │        ├─ commitment   (promises made while holding it)
   nomination)            │        ├─ vote         (how they voted on a motion)
                          │        └─ case         (proceedings during it)
                          ▼
                        OFFICE  (MLA for AC-84 · MP for PC-17 · Minister of Health · CM)
```

A **tenure** is one person holding one office for a period, with a reason it began and a reason it
ended. Winning a contest creates one. So does being appointed, nominated to the Rajya Sabha, or
sworn into a cabinet. Everything the user's brief lists — performance, funds, promises, reshuffles,
coalition behaviour — is a fact **about a tenure**, not about a person and not about an election.

Two consequences worth stating because they are the whole design:

- **Elections stop being special.** An election is one way a tenure starts. A reshuffle is a tenure
  ending and another beginning. A defection is a tenure continuing while a party membership changes.
  One timeline holds all of it.
- **Every vertical becomes joinable.** "Which MPs voted for the bill that funded the scheme whose
  money went to the constituency they promised it to" is one query over five tables, not five
  products. That join is the intelligence; the pages are just views of it.

---

## 2. Entity model

Existing (ring 1, built): `person` · `party` · `party_version` · `place` · `place_version` ·
`boundary_epoch` · `place_crosswalk` · `election` · `contest` · `candidacy` · `result` · `turnout` ·
`affidavit` · `claim` · `citation` · `source` · `alliance`.

### New: power and time

| Table | Holds |
|---|---|
| `institution` | a house or body with a term: *18th Lok Sabha*, *WB Legislative Assembly 2026–31*, *Union Council of Ministers*. Has a jurisdiction and a start/end. |
| `office` | a seat or post *within* an institution: MLA for a place_version, MP for a place_version, Minister of a portfolio, Speaker, CM. Not a person. |
| `tenure` | person × office × [from, to), with `started_by` (elected / appointed / nominated / by_election / sworn_in) and `ended_by` (term_end / resigned / died / disqualified / reshuffled / dissolved). The join key for everything below. |
| `party_membership` | person × party × [from, to). Separate from tenure, because a defection changes one and not the other — which is exactly what the Tenth Schedule is about. |

### New: legislative activity

| Table | Holds |
|---|---|
| `session` | a session of an institution, with dates. |
| `sitting` | one day of a session. Attendance is per sitting. |
| `motion` | a bill, resolution, question, or motion, with its type, mover, subject and stage history. |
| `motion_event` | introduced / referred / passed / assented / lapsed, dated and cited. |
| `vote` | person × motion × (aye / no / abstain / absent). **See §4 on why this table will be mostly empty by nature, not by omission.** |
| `activity` | per tenure per session: sittings attended, questions asked, debates participated, private member's bills. One row per (tenure, session, measure). |

### New: money

Three genuinely different things, deliberately not one `amount` table:

| Table | Holds |
|---|---|
| `fiscal_line` | jurisdiction × head/scheme × period, with `allocated`, `revised`, `actual`. Covers budgets, scheme funding, and constituency development funds — they differ in the head, not in the shape. |
| `scheme` | a programme: ministry, launched, status, and the fiscal lines that fund it. |
| `contribution` | donor → party, amount, instrument (electoral bond / direct / trust), period. A different graph entirely: the parties are donor and recipient, not government and programme. |

### New: promises, courts, statistics

| Table | Holds |
|---|---|
| `commitment` | a promise: actor (party or person), source document, text, domain, target date, and whether it is measurable at all. |
| `commitment_assessment` | assessed_at × state × evidence. **Never a bare "kept" or "broken"** — an assessment is itself a cited claim with an author and a date, and the platform shows the evidence beside the verdict. |
| `case` | court, case number, filed, parties, subject, current stage. |
| `case_event` | dated: filed / charged / discharged / convicted / acquitted / stayed. **Only a `convicted` event with a cited order licenses the word "convicted" anywhere in the product.** |
| `place_statistic` | place_version × statistic × period × value. Generalises the existing demographics: census overlays, electorate size, literacy, urbanisation, anything place-and-time-shaped. |

### Derived, not stored

**Policy timeline** and **coalition behaviour** are views, not tables. A timeline is every dated
event across motions, schemes, commitments, cases and tenures on one axis. A coalition is read from
`party_membership`, `alliance_member` and vote agreement. Storing them would be storing a query.

---

## 3. The eighteen verticals

Each row states the question it answers, what it needs, and where the data comes from. **Status is
computed at runtime by `packages/mandate/src/repo/coverage.ts`, not written here** — a status in a
document rots, and this table is the thing most likely to be quoted at us later.

| Vertical | Question | Needs | Source |
|---|---|---|---|
| Elections | Who won, by how much, and how has this seat behaved? | built | ECI, Lokdhaba, MyNeta |
| Census overlays | Who lives in this constituency? | `place_statistic` | Census of India, ECI electoral rolls |
| Historical trends | What has changed across cycles? | built (4 elections, 1 state) | Lokdhaba |
| Delimitation | Is this seat comparable to itself across time? | `place_crosswalk` rows | ECI delimitation orders |
| Cabinet reshuffles | Who holds which portfolio, and since when? | `office`, `tenure` | state gazettes, PIB |
| MLA/MP performance | What has this member actually done? | `tenure`, `session`, `activity` | **PRS India**, Lok Sabha / Rajya Sabha / assembly sites |
| Parliamentary sessions | What did this house do this session? | `institution`, `session`, `sitting` | Lok Sabha / Rajya Sabha bulletins |
| Bills | What was proposed, and what became law? | `motion`, `motion_event` | PRS India, Lok Sabha bill tracker |
| Voting records | How did this member vote? | `vote` | division lists — **see §4** |
| Government schemes | What programmes exist and who runs them? | `scheme` | ministry dashboards, PIB |
| Budget allocations | What was promised in money? | `fiscal_line` | Union and state budget documents |
| Public spending | What was actually spent against it? | `fiscal_line.actual` | CAG reports, expenditure budgets |
| Constituency funds | Did this member spend their allocation? | `fiscal_line` scoped to a tenure | MPLADS portal, state MLALAD |
| Promises vs delivery | Was the manifesto honoured? | `commitment`, `commitment_assessment` | manifestos (have 14) + everything above |
| Political funding | Who funds whom? | `contribution` | ECI contribution reports, electoral bond disclosures |
| Court cases | What proceedings involve this person? | `case`, `case_event` | eCourts, Supreme Court, High Courts |
| RTI datasets | What has been disclosed on request? | `source` + extraction | RTI portals, published responses |
| Coalitions | Who governs with whom, and do they vote together? | derived | `party_membership` + `vote` |

---

## 4. Four honesty constraints that shape the model

These are not caveats. They are why some tables will look empty and must not be filled with
plausible values.

**Indian legislatures rarely record division votes.** Most bills pass by voice vote and no
member-level record exists. A `vote` table that is 2% populated is *correct*; a "voting record"
feature that implies otherwise is a lie. The product must present absence of a division as absence
of a division, never as absence of data on our side.

**"Delivery" is a judgement.** A promise scored kept-or-broken without a cited assessment and a
named assessor is an opinion wearing a fact's clothes. `commitment_assessment` carries author, date
and evidence, and the UI shows the evidence next to the verdict.

**Charged is not convicted.** Already principle P5, and `legal_case` has 0 rows by design. The
`case_event` model keeps it: only a cited `convicted` event permits that word.

**Attendance is not performance.** PRS publishes attendance, questions and debate counts because
they are countable, not because they measure representation. Every activity measure ships with a
model card saying what it does not capture.

---

## 5. Phase order

Ordered by **data availability**, not by interest — because 14 of these 18 need data that has to be
fetched from outside, and building a vertical before its data exists produces an empty frame, which
this project does not ship.

**Phase 0 — the spine, no new data.** `institution`, `office`, `tenure`, `party_membership`, and a
backfill: every winning result becomes a tenure; the 6 cabinet ministers become portfolio tenures;
the 42 MPs become Lok Sabha tenures. Nothing new is fetched, and the product gains the join every
later vertical needs. Also `place_statistic`, absorbing the existing demographics.

**Phase 1 — the verticals whose data is already on disk.** Census overlay per constituency,
manifesto positions across 5 policy axes (14 parties), party funding (5 parties, 1 year), cabinet
portfolios as a timeline. Thin, honest, and immediately visible.

**Phase 2 — PRS India.** Member performance, bills, sessions, questions. One source unlocks four
verticals and it publishes structured data. Highest ratio of verticals to acquisition effort.
Requires network: importer written here, run outside.

**Phase 3 — money.** MPLADS, then budget documents, then CAG actuals. Hardest extraction (PDFs),
highest public value.

**Phase 4 — courts and RTI.** Slowest, most legally sensitive, needs the assessment model to be
proven first.

**Continuous — geography.** 1 of 36 states today. Lokdhaba covers every state's assembly history;
each new state is a data load, not a rewrite, which is what the national model work in `301e91b`
was for.

---

## 6. What this costs the existing build

- The four-floor lens model (Brief / Analysis / Investigation / Evidence) survives and generalises:
  every entity above gets the same four floors.
- `docs/mandate/` §6's ten modules become the electoral vertical's feature list.
- No table is dropped. `election`/`contest`/`candidacy`/`result` keep their shape; `tenure` is added
  beside them and backfilled from results.
- The URL grammar extends rather than changes: `/o/` for offices, `/i/` for institutions, `/m/` for
  motions, `/sch/` for schemes, `/c/` for cases.
- One thing must be built before any of it: **a surface that states what the platform covers and
  what it does not**, so nobody has to guess which of the eighteen is real. That is
  `/coverage`, and its numbers are computed, never written down.

# 01 — Product

§1 Vision · §2 Principles · §3 Personas · §4 Information architecture · §5 Navigation · §6 Features · §7 Page inventory

---

## §1 Product vision

### Statement

**MANDATE is the instrument for reading Indian electoral power.** It holds every contest at
every level — Lok Sabha, Rajya Sabha, assembly, municipal, panchayat, bypoll — as a single
queryable, citable, time-versioned record, and presents it as a workspace where a claim can
be formed, tested, and sourced in under a minute.

### The job to be done

Four questions recur across every user we have talked to, and no existing product answers
more than one of them well:

| Question | Today's answer | MANDATE's answer |
|---|---|---|
| *What is happening in Indian politics right now?* | Scroll five news sites | The Situation Room, in five seconds |
| *Is this number true, and where did it come from?* | Nowhere | Press `.` — the source document, page-anchored |
| *What actually happened here last time, and the time before?* | A Wikipedia table, sometimes | The seat's full contest history, booth-level where available |
| *Who is this person, really?* | A biography | An intelligence profile: assets over time, cases, party switches, attendance, funding |

### What it is not

- **Not a news product.** We do not break stories. We make stories checkable. Editorial
  voice is a liability here; the product's voice is the record's voice.
- **Not a prediction market.** Forecasts appear, labelled, with intervals and a track record
  attached, and vanish during poll periods (§14). A wrong forecast we published loudly and
  never scored is how this product loses its licence to operate.
- **Not an archive.** An archive is stale by construction. §6 specifies what makes the
  product change every single day of the year, including the 300 days with no election.
- **Not a civic-engagement app.** "Find your representative" and voter education are
  *outputs* of the registry (the Reader surface, §26) — not the product's centre of gravity.

### The five-second test

Every page must pass this: a competent stranger, landing cold, states the page's answer out
loud within five seconds. If they instead describe what they see ("there's a map and some
charts"), the page has failed and is redesigned. This is the acceptance criterion for every
route in §7 and it is enforced in design review, not left to taste.

---

## §2 Product principles

Eight rules. They resolve arguments, so each one has a cost attached — a principle that
costs nothing is a slogan.

### P1 — Every surface answers a question, and the question is the title.

Card titles are interrogative or declarative, never nominal. Not "Turnout" — **"Turnout is
down 4.2 points from 2021."** Not "Margin Analysis" — **"Nine seats were decided by under
1,000 votes."**
*Cost:* titles become computed strings with fallbacks, which is harder than a static label
and forces every card to own a headline measure.

### P2 — No number without provenance.

`Citation` is a type in the core package, not a footnote convention. A number rendered
without a resolvable citation set is a build-time error in `@mandate/viz`, caught by lint.
*Cost:* the ingest layer must retain page-level anchors and parser versions for every field
it extracts. This roughly doubles ingest complexity. It is the point of the product.

### P3 — Symbol before colour.

Party identity is carried by the **ECI symbol glyph and the party's short name**, with colour
as reinforcement only. Two independent reasons converge: Indian ballots are symbol-first
precisely so that literacy is not a precondition for voting, and — measurably — real party
brand colours cannot be told apart. Validated with the palette checker (§24):

```
$ node validate_palette.js "#FF9933,#19AAED,#00A550,#DA291C,#0072B1,#22409A,#FFD200,#E4181C" \
    --mode dark --surface "#13111B"
[FAIL] Normal-vision floor   worst adjacent #22409A↔#0072B1 ΔE 13.7  (BSP navy vs AAP blue)
[WARN] CVD separation        worst adjacent #DA291C↔#00A550 ΔE 6.3 deutan  (CPI-M red vs TMC green)
[FAIL] Lightness band        #FF9933, #FFD200 too light; #22409A too dark
```

*Cost:* we ship and maintain a licensed symbol glyph set for ~2,700 registered parties, and
we cannot use the colours users expect as the primary encoding. Worth it: the accessible
answer and the culturally correct answer are the same answer.

### P4 — Time is an axis on everything, including geography.

Places are versioned. Parties are versioned with lineage edges (TMC splitting from INC in
1998; the Shiv Sena and NCP splits; every merger). Affidavit fields are versioned so asset
growth is a first-class series. No entity is a snapshot.
*Cost:* every query carries an as-of epoch, and every join is temporal. This is the single
largest source of schema complexity in §19, and the reason the product survives 2027.

### P5 — Charged is not convicted.

The component layer enforces the distinction. `<CaseChip>` accepts `stage: 'fir' | 'charged'
| 'trial' | 'convicted' | 'acquitted' | 'stayed'` and renders different type weight, colour,
and wording per stage. The string "criminal" never appears next to a name; the strings are
"cases pending" and "convicted". Conviction claims require a citation of `kind: 'court_order'`
— the type system will not accept a news article.
*Cost:* stage tracking requires court-record ingestion, which is expensive and incomplete.
Where stage is unknown, the chip renders "stage not established" rather than guessing —
visibly worse-looking, correctly cautious.

### P6 — Never empty, never stale.

There is no "coming soon", no placeholder, and no section that looks identical in October and
in April. The off-season has its own content engine (§6.1). A surface with nothing to say
today collapses to a single line of text rather than rendering an empty frame.
*Cost:* the Situation Room needs a genuine 365-day event supply, which is a data-operations
commitment, not a design one.

### P7 — Density is respect; disclosure is the ladder.

Four floors, identical semantics on every entity: **Brief → Analysis → Investigation →
Evidence.** A user who wants the number gets it in one glance; a user who wants the Form 20
scan is three keystrokes away. We never simplify by deleting; we simplify by layering.
*Cost:* four floors per entity type is four times the design and build surface. Mitigated by
the fact that the floors are *the same four everywhere* — learn once, apply everywhere.

### P8 — The terminal does not shrink.

The dense multi-panel workspace targets ≥1280 px and is not responsively squeezed onto a
phone. Mobile gets **Reader** — a different product surface, different IA, same data, same
citations (§26).
*Cost:* two front-end surfaces. Cheaper than one surface that is bad at both, and honest
about the fact that 90% of Indian traffic is mobile while 90% of the revenue is desktop.

---

## §3 User personas

Six personas, split across the two surfaces. Each has a trigger, a job, a failure mode we
must avoid, and the one metric that proves we served them.

### Terminal personas (paying)

**1. Priya — political correspondent, national daily, Delhi desk**
Trigger: her editor asks for 400 words and a chart on a bypoll result, filed in 40 minutes.
Job: get a defensible number, a comparison to last time, and an export she can hand to the
graphics desk. Needs the citation because the desk lawyer will ask.
Failure mode: she cannot tell whether a figure is provisional or final, publishes it, and we
have cost her a correction. *Never again is the design constraint.*
Metric: time from landing to exported, cited chart. Target < 3 minutes.

**2. Rohit — psephologist / data journalist, independent**
Trigger: a hypothesis ("Muslim-concentration seats swung differently in 2024").
Job: booth-level data, reproducible transforms, a downloadable slice, and enough methodology
documentation to defend the method in public.
Failure mode: our aggregates are opaque, so he re-derives everything from ECI PDFs himself
and we become a link he never clicks.
Metric: API/Parquet downloads per active researcher per month.

**3. Anand — strategist, political consultancy**
Trigger: a client wants a target-seat list for a state assembly race 14 months out.
Job: constituency screening on margin, swing volatility, incumbency retention, turnout
elasticity; opponent dossiers; booth-level weak-spot maps.
Failure mode: the data is state-incomplete or a delimitation change silently corrupts his
comparison. He is the persona most likely to notice P4 failing.
Metric: saved screens and boards per seat; seat-list exports.

**4. Kavya — policy / macro analyst, asset manager or think tank**
Trigger: a state budget, a farm-law protest, a Rajya Sabha arithmetic question before a bill.
Job: "does the incumbent's coalition survive?", "who controls the upper house in 2027?",
state-level political risk with a source trail her compliance team accepts.
Failure mode: we present India as 543 seats and no institutional arithmetic. She needs Rajya
Sabha cycle modelling, which nobody offers, and it is a cheap differentiator.
Metric: Rajya Sabha arithmetic and coalition-scenario sessions.

### Reader personas (free, and the top of the funnel)

**5. Farida — 24, first-time voter, Kolkata, phone only, Bengali-first**
Trigger: an election notification, or an argument in a WhatsApp group.
Job: who represents me, what did they actually do, who is standing this time, when do I vote.
Failure mode: we show her a terminal. Or we show her English.
Metric: representative lookups completing to a profile view; Bengali/Hindi session share.

**6. Meera — researcher, university political-science department**
Trigger: a paper, a thesis, a class.
Job: the bulk dataset, the codebook, a citable DOI, and the methodology page.
Failure mode: no bulk access, so she cites Lok Dhaba instead — correctly.
Metric: academic citations of the dataset. This is the slowest and most durable trust signal
we have; treat it as a product goal, not PR.

### Explicitly not a persona

The **campaign war room on polling day** looking for booth-level turnout to direct
mobilisation. Serving them well makes us an instrument of a campaign rather than of the
record, and the neutrality cost is unrecoverable. We sell the same seats to everyone at the
same price, publicly listed, or we are not a reference.

---

## §4 Information architecture

### The core abstraction: Entity × Lens

The product is not a set of pages. It is **seven entity types**, each rendered through **four
lenses**. Learn the grammar once; it holds everywhere.

```
                 ┌──────── LENSES (progressive disclosure) ────────┐
                 │                                                  │
                 │  BRIEF        ANALYSIS      INVESTIGATION   EVIDENCE
                 │  answer in    charts,       raw records,    sources,
                 │  5 seconds    comparison,   per-booth,      documents,
ENTITIES         │  + verdict    cross-filter  per-round       changelog
─────────────────┼──────────────────────────────────────────────────────
ELECTION         │     ✓             ✓              ✓             ✓
CONTEST (seat×el)│     ✓             ✓              ✓             ✓
PLACE (st/di/ac) │     ✓             ✓              ✓             ✓
PERSON           │     ✓             ✓              ✓             ✓
PARTY            │     ✓             ✓              ✓             ✓
ALLIANCE         │     ✓             ✓              ✓             ✓
SOURCE / CLAIM   │     ✓             —              ✓             ✓
```

**Entity definitions.**

- **Election** — one notified electoral event (`ls-2024`, `wb-assembly-2026`,
  `kolkata-mc-2026`, `rs-biennial-2026-jul`, `wb-ac-042-bypoll-2027`). Has phases.
- **Contest** — one seat in one election. The atomic unit of the product. `contest` is where
  candidacies, results, rounds, and booths hang. A "constituency page" is a *place* page; the
  2024 race in Diamond Harbour is a *contest*.
- **Place** — nation → state/UT → district → constituency (PC and AC as sibling kinds) →
  ward → booth. Versioned by boundary epoch (§12).
- **Person** — a human, canonical and alias-resolved. Not "a candidate": the same person is a
  candidate, an MLA, a minister, and a defendant, and those are roles on a timeline.
- **Party** — a registered political party, versioned, with lineage edges for splits/mergers.
- **Alliance** — a named coalition with a validity window and member edges. NDA-2019 and
  NDA-2024 are different alliance versions with different members. Modelling this correctly is
  what makes coalition arithmetic possible.
- **Source / Claim** — a document and the assertions extracted from it. First-class, browsable,
  and the terminal node of every citation.

### The lens contract

Each lens has a fixed job, and the same keyboard shortcut everywhere (`1`–`4`):

| Lens | Answers | Contains | Load budget |
|---|---|---|---|
| **Brief** | "What do I need to know?" | headline verdict, 4–6 stat tiles, one hero chart, 3 flagged anomalies, freshness stamp | < 400 ms server-rendered, no client JS required |
| **Analysis** | "How did it get this way?" | cross-filterable charts, comparisons, trends, cohort breakdowns, the semantic-layer measure picker | interactive within 1.2 s; queries run in-browser after first slice loads |
| **Investigation** | "Show me the granular record." | full tables (booth-wise, round-wise, candidate-wise), affidavit field deltas, network graph, case docket | virtualised; unbounded row count |
| **Evidence** | "Prove it." | every source backing this entity, document viewer with page anchors, ingest log, parser version, correction history | lazy |

### The three cross-cutting surfaces

Not entities — instruments that operate *across* entities:

1. **Situation Room** — the national now. The default landing surface.
2. **Map** — the GIS instrument; a spatial index over every place entity.
3. **Analytics Studio** — the free-form query instrument; a canvas over the semantic layer.

Plus two system surfaces: **Boards** (saved dashboards) and **Methodology** (how everything is
computed; a product surface, not a legal page).

### URL grammar

Stable, short, guessable, and lens-addressable. Every deep link carries its floor.

```
/                                    Situation Room
/e/ls-2024                           Election · Brief
/e/ls-2024/analysis                  Election · Analysis
/e/ls-2024/phase/3                   Phase detail
/s/ls-2024/wb-diamond-harbour        Contest · Brief   (s = seat contest)
/s/ls-2024/wb-diamond-harbour/booths Contest · Investigation, booth table
/p/mamata-banerjee                   Person · Brief
/p/mamata-banerjee/evidence          Person · Evidence
/party/aitc                          Party · Brief
/party/aitc/lineage                  Party · Investigation, lineage graph
/pl/wb                               Place · state
/pl/wb/nadia                         Place · district
/pl/wb/nadia/krishnanagar-uttar      Place · assembly constituency
/al/nda                              Alliance
/src/eci-form20-ls2024-wb-19         Source document
/map?layer=margin&e=ls-2024&z=6      Map with state
/studio/new                          Analytics Studio
/b/priya-bengal-watch                Board
/q/which-seats-flipped-in-bihar      A resolved natural-language query, shareable
```

Two rules: **no ID-only URLs in user-facing links** (slugs always, IDs resolve as aliases),
and **every URL is a complete restoration of state** — filters, lens, map viewport, selected
measure. Sharing a link is how analysts collaborate; a link that loses the viewport is broken.

### Search as IA

With ~4,700 constituencies, ~2,700 parties, and hundreds of thousands of people, hierarchical
browse is a fallback. **The command bar is the primary IA** (§5), and it must handle Indic
transliteration natively: `মমতা`, `Mamata`, `Momota`, and `ममता` all resolve to the same
person. This is not a search nicety; in a 12-script country it is the difference between a
usable and an unusable product.

---

## §5 Navigation

### The frame

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ ▪ MANDATE   [Diamond Harbour ×] [Mamata Banerjee ×] [Bihar 2025 ×]  + │ ⌘K  ⊙ │ 32px  tab bar
├──┬─────────────────────────────────────────────────────────────────────────────┤
│▓▓│ ████ PHASE 3 · POLLING  ·  1,204 of 4,120 seats decided  ·  17:42 IST      │ 28px  ink strip
│  ├─────────────────────────────────────────────────────────────────────────────┤
│□ │ Diamond Harbour · Lok Sabha 2024                          ⟨ Brief ⟩         │
│◎ │ ─────────────────────────────────────────────────────────────────────────── │
│▤ │ 1 Brief   2 Analysis   3 Investigation   4 Evidence            ⌥⇧E export   │
│○ │                                                                             │
│◇ │   Abhishek Banerjee held Diamond Harbour by the widest margin in India.     │
│⬡ │   ┌─────────┬─────────┬─────────┬─────────┐                                 │
│▦ │   │ MARGIN  │ TURNOUT │  SWING  │ NOTA    │   ← stat tiles                  │
│  │   │ 710,930 │  78.4%  │  +8.1pp │  0.9%   │                                 │
│◐ │   └─────────┴─────────┴─────────┴─────────┘                                 │
│  │                                                                             │
└──┴─────────────────────────────────────────────────────────────────────────────┘
 40px rail
```

### 1. Left rail — 40 px, icon-only, eight destinations

`⌥1`…`⌥8`. Labels appear on hover after 400 ms and in a persistent expanded state (`⌥\`).
No dropdowns, no nesting, no hamburger.

| | Destination | Why it earns a rail slot |
|---|---|---|
| ▓ | **Situation Room** | the default; the answer to "what now" |
| ◎ | **Map** | the only spatial index; used in every investigation |
| ▤ | **Elections** | upcoming / live / completed, all levels |
| ○ | **People** | the registry's largest entity set |
| ◇ | **Parties & Alliances** | coalition arithmetic lives here |
| ⬡ | **Places** | administrative browse, delimitation history |
| ▦ | **Analytics Studio** | free-form query |
| ◐ | **Evidence** | source explorer; the OSINT surface |

**Boards** and **Methodology** sit below a divider as secondary. Settings and language are in
the account menu, not the rail.

### 2. Command bar — `⌘K` — the real navigation

One input, four modes, disambiguated by what you type:

- **Jump** (default) — fuzzy, transliteration-aware entity search. `diam` → Diamond Harbour
  (PC), Diamond Harbour (AC), the 2024 and 2019 contests. Results grouped by entity type with
  the type as a chip, ranked by recency of political relevance rather than alphabetically.
- **Query** — starts with a natural-language question or `?`. `? which seats flipped in bihar
  2025` runs the AI layer (§14) and returns a table plus citations, at a shareable `/q/` URL.
- **Measure** — starts with `=`. `=margin_pct` inserts that measure into the current view's
  chart. This is how power users build without leaving the keyboard.
- **Action** — starts with `>`. `> export csv`, `> compare`, `> split right`, `> pin to board`,
  `> cite`. Every action in the product is reachable here; the UI affordance is the discoverable
  path and the command bar is the fast one.

Recent entities and saved queries appear on open. `⌘K` then `Enter` on an empty bar returns
you to the last entity — a cheap, heavily-used move.

### 3. Workspace tabs — the multi-entity model

Analysts hold six things open at once; a browser-tab metaphor inside the app beats forcing six
browser tabs, because tabs share the app's filter state and can be split, saved as a board, and
restored. Max 8, LRU eviction with a warning, persisted per user. `⌘1`–`⌘8`, `⌘W`, `⌘⇧T`.

**Split view** — `⌘\` splits the active tab horizontally. The two panes can be **linked**
(`⌘⇧L`): linked panes share time range, election, and hovered entity, so hovering a constituency
in a map pane highlights its row in a table pane. This is the single most-requested behaviour
in any comparison tool and it is cheap to build once state is in a shared store.

### 4. The Ink Strip — 28 px, always present

The phase clock. A horizontal band spanning the viewport where the x-axis is the current
electoral cycle. Behaviour by mode:

- **Off-season** — one column per day for the trailing 90 and leading 180 days, tinted by event
  density (filings, court rulings, RS retirements, ULB polls, delimitation notices). Today is a
  hairline. Click a day → that day's briefing. Hover → the day's events in a tooltip.
- **Notified** — the strip becomes the **phase ladder**: one block per polling phase, sized by
  seat count, labelled with dates, filling with ink-violet as each phase completes. Counting day
  fills left-to-right by round.
- **Counting** — the strip becomes the national tally: a stacked seat bar by alliance with a
  live count and a lead-change ticker.

It is never decorative and never empty, and it is the only element in the system permitted
ambient motion.

### 5. What we deliberately do not have

- **No breadcrumbs.** The tab title plus the ink strip locate you. Breadcrumbs imply a tree,
  and the IA is a graph.
- **No mega-menu.** Eight rail items plus `⌘K` covers ~4,700 constituencies. A menu cannot.
- **No footer navigation in the terminal.** Reader has one.
- **No modals for content.** Modals are for destructive confirmation only. Everything else is a
  panel, a split, or a new tab — because modals cannot be linked to.

---

## §6 Feature breakdown

Ten feature areas. Each lists what it does, the hard part, and the acceptance test.

### 6.1 Situation Room — the national now

The landing surface, and the hardest product problem in the whole platform, because it must be
genuinely different every day for 365 days.

**Composition, in priority order:**

1. **Phase Ladder / Election Clock** (hero). The next notified event as a physical object. Off-season,
   it shows the countdown structure: which assemblies are due, when terms expire, which Rajya
   Sabha seats retire in the next cycle. *There is always a next thing, because terms are fixed.*
2. **Today's Record** — the day's factual developments, each a card with a citation and an
   entity link. Sourced from: ECI notifications and press notes, affidavit filings, court
   orders and disqualifications, oath/resignation events, Rajya Sabha nominations, ULB and
   panchayat results, party organisational changes, defection petitions under the Tenth
   Schedule. **This is a data-ops commitment, not a design one** (P6).
3. **Most Watched** — ranked by our own attention data plus news volume. Honest about being
   attention, not importance, and labelled as such.
4. **Most Competitive** — computed, not editorial: seats ranked by a composite of last-margin,
   swing volatility across the last three contests, and incumbency-retention rate for the seat.
   This list changes when data changes, which is the point.
5. **Party Momentum** — rolling vote-share change across all contests in a trailing window
   (including ULB and panchayat results, which nobody aggregates and which are the earliest
   signal of a state's direction). Genuinely novel and genuinely useful.
6. **Institutional Arithmetic** — Lok Sabha and Rajya Sabha floor strength by alliance, with
   the next RS biennial's projected effect. Kavya's persona, and a differentiator.
7. **Anomalies** — computed flags: a candidate's declared assets growing faster than a
   threshold; a seat's turnout deviating from its district; a party contesting far fewer seats
   than last cycle; an affidavit field changing between filings. Each is a *lead*, never an
   accusation — wording is "flagged for review", and the flag's rule is linked and documented.
8. **Media Pulse** — volume and framing, by entity, over time. Deliberately not sentiment
   scoring, which is not defensible on Indian-language political text and would be the first
   thing an adversary attacks.

*Hard part:* the off-season event supply. *Acceptance test:* a diff of the Situation Room on
two arbitrary dates 30 days apart in a non-election month shows ≥ 60% different content.

### 6.2 Election Center

Every election, at every level, in one lifecycle model: `announced → notified → nominations →
scrutiny → withdrawal → campaign → silence → polling(phase n) → counting → declared → disputed
→ closed`. The lifecycle state drives the UI, so the same components serve an upcoming and a
20-year-old election.

Per election: overview, phase schedule, contest list, candidate list with affidavit summaries,
nomination/rejection statistics (an under-covered story every cycle), turnout by phase and
gender, results, historical comparison against the same seats under the same boundary epoch,
and the dispute docket (election petitions in the High Courts).

*Hard part:* modelling Rajya Sabha and panchayat elections in the same schema as Lok Sabha
without contorting either. §12 solves this with `election.kind` plus an `electorate_kind`
(direct / indirect / electoral-college) rather than separate tables.

### 6.3 Candidate → Person Intelligence

The profile, not the biography. A person is a **timeline of roles and records**:

- **Career timeline** — every candidacy, term, office, portfolio, party membership, on one
  scannable axis with the election results inline.
- **Affidavit deltas** — the killer feature. Declared assets, liabilities, income, education,
  and pending cases *diffed across filings*, field by field, with both scans side by side. When
  a declared education qualification changes between 2014 and 2019, we show both pages. We
  report the delta and never characterise it.
- **Case docket** — per case: court, section, stage (P5), filing date, last hearing, disposal.
- **Legislative record** — attendance, debates, questions, private member's bills, from PRS.
  Presented with the caveat that attendance is a weak proxy for effectiveness, stated on the
  card rather than buried in methodology.
- **Party switches** — with dates, and the anti-defection consequence where one applies.
- **Influence network** — a graph of co-contested seats, shared alliances, family links where
  publicly documented and sourced, and cabinet co-membership. Family links are the highest
  defamation-risk element in the product: `source.kind` must be `official` or `court_order`,
  never `news`, and the edge renders with its source visible.
- **Contested constituencies** — the map of where they have stood, which reveals seat-hopping.

*Hard part:* entity resolution (§12). *Acceptance test:* a manual audit of 200 randomly sampled
person records finds < 1% incorrect merges, measured every release.

### 6.4 Party & Alliance Intelligence

Per party: leadership with tenure, registered symbol and its history, state-wise vote share and
seat share over time, strongholds and collapse zones computed from swing consistency, seat-share
vs vote-share elasticity, contest footprint (how many seats they even fight — the most
under-reported number in Indian politics), funding from electoral-bond disclosures and annual
returns, manifesto archive with cross-cycle promise diffing, organisational timeline, and
**lineage** — splits and mergers as a graph, because "the BJP's 1984 performance" and "the BJS's"
are different claims.

Per alliance: members with join/leave dates, seat-sharing agreements per election, combined
arithmetic, and friendly-fight seats.

### 6.5 Constituency & Place Intelligence

Answers "why does this seat matter?" — a computed, cited answer, not prose. Composition:
electorate size and growth, turnout history against state and national baselines, margin trend,
the seat's competitiveness class, incumbency retention rate, reservation status (SC/ST/general)
and its history, delimitation history with the boundary diff rendered on the map, demographic
profile from Census/SECC with explicit vintage labels (Indian census data is old and the UI must
say so on every figure), literacy, urbanisation, workforce composition, MPLADS/MLALADS
utilisation, major projects, and the contest history with every candidate who has ever stood.

*Hard part:* honest demographic labelling. A 2011 census figure presented as current is the most
common analytical error in Indian election coverage; every demographic tile carries its vintage
in the tile, not in a tooltip.

### 6.6 Live Election Mode

Detailed in §16. Summary: the application transforms rather than adding a page. Round-wise
counting (Indian counting proceeds in rounds of ~14 EVMs, typically 15–25 rounds per seat) is the
native temporal unit, not minutes. `LEADING` and `WON` are typographically distinct and we never
call a seat before the returning officer declares it.

### 6.7 Analytics Studio

Detailed in §13. Cross-filtering over a downloaded columnar slice, so filtering feels
instantaneous rather than round-tripping. Chart forms: bar, line, area, scatter, bubble,
heatmap, choropleth, Sankey (vote transfer between cycles), treemap (seat composition),
network, small multiples, and the table view that every chart can become.

### 6.8 Evidence Explorer (the OSINT surface)

Every source document, browsable in its own right: ECI Form 20s and declarations, Form 26
affidavits, gazette notifications, court orders, PRS records, party annual returns, archived
speeches and press conferences with timestamped transcripts, fact-check verdicts from signatory
organisations. Each document shows what claims were extracted from it, by which parser version,
and every entity that cites it. Reverse citation ("what does this document support?") is as
important as forward citation and is usually missing from products like this.

*Acceptance test:* from any number anywhere in the product, ≤ 2 interactions to the source
document, page-anchored.

### 6.9 AI Analyst

Detailed in §14. Constrained by construction: it emits a *query plus a citation set*, never free
prose over the corpus. It abstains rather than guesses, and abstention rate is a tracked quality
metric rather than an embarrassment.

### 6.10 Compliance & Integrity layer

A feature, not a policy document, because it changes what renders.

- **Poll-period gate** — a per-election flag that suppresses forecast, projection, and
  opinion-poll surfaces for the notified window. Enforced server-side in the API so a stale
  client cannot render suppressed content.
- **Silence-period gate** — a narrower window with its own suppression set.
- **Legal-language enforcement** — P5, in the component layer.
- **Correction ledger** — every corrected figure keeps its history at a public URL. A platform
  that silently edits numbers has no standing to demand provenance from anyone else.
- **Model card per computed metric** — every derived measure has a page: formula, inputs,
  known failure modes, and its historical accuracy where it is a forecast.

---

## §7 Complete page inventory

62 routes. `T` = terminal, `R` = reader, `B` = both. Every entity route accepts a lens segment.

### Cross-cutting surfaces

| Route | Surface | Answers |
|---|---|---|
| `/` | B | What is happening in Indian politics right now? |
| `/day/:date` | B | What happened on this date? |
| `/map` | T | Where is the pattern, spatially? |
| `/map/compare` | T | How did this map change between two elections? |
| `/studio` | T | Studio home — saved and template analyses |
| `/studio/new` | T | Free-form analysis canvas |
| `/studio/:id` | T | A saved analysis |
| `/b` | T | My boards |
| `/b/:slug` | T | A saved dashboard |
| `/q/:slug` | B | A resolved natural-language question, with citations |
| `/search` | R | Reader search (Reader has no command bar) |
| `/methodology` | B | How is every number computed? |
| `/methodology/:measure` | B | Model card for one measure |
| `/methodology/coverage` | B | What data do we have, for where, how fresh? |
| `/corrections` | B | What have we got wrong and fixed? |
| `/sources` | B | Where does everything come from? |
| `/api-docs` | T | How do I query this programmatically? |
| `/downloads` | T | Bulk Parquet/CSV slices and codebooks |
| `/changelog` | B | What changed in the product and the data? |

### Elections

| Route | Answers |
|---|---|
| `/e` | What elections exist — upcoming, live, completed, all levels? |
| `/e/upcoming` | What is coming, and when? |
| `/e/live` | What is being polled or counted right now? |
| `/e/calendar` | The full multi-year electoral calendar, including term expiries |
| `/e/:election` | Brief |
| `/e/:election/analysis` | Analysis |
| `/e/:election/investigation` | Investigation — full contest and candidate tables |
| `/e/:election/evidence` | Evidence |
| `/e/:election/phase/:n` | One polling phase |
| `/e/:election/contests` | Every seat in this election, filterable |
| `/e/:election/candidates` | Every candidate, with affidavit summary columns |
| `/e/:election/nominations` | Filed, rejected, withdrawn — and why |
| `/e/:election/turnout` | Turnout by phase, state, gender, seat |
| `/e/:election/results` | The results table |
| `/e/:election/counting` | Live counting (redirects to `/live` when active) |
| `/e/:election/forecast` | Projection — gated by §6.10 |
| `/e/:election/vs/:other` | Election-to-election comparison, boundary-epoch aware |
| `/e/:election/disputes` | Election petitions and their status |

### Contests (seat × election)

| Route | Answers |
|---|---|
| `/s/:election/:seat` | Brief — who won, by how much, what changed |
| `/s/:election/:seat/analysis` | Analysis — vote shares, swing, comparison |
| `/s/:election/:seat/booths` | Investigation — polling-station-wise Form 20 |
| `/s/:election/:seat/rounds` | Investigation — round-by-round counting |
| `/s/:election/:seat/candidates` | Every candidate in this contest |
| `/s/:election/:seat/evidence` | Evidence |

### People

| Route | Answers |
|---|---|
| `/p` | Directory — filter by office, party, state, case status, assets |
| `/p/:person` | Brief — who is this, what do they hold, what is flagged |
| `/p/:person/analysis` | Analysis — electoral performance over career |
| `/p/:person/timeline` | Career timeline |
| `/p/:person/affidavits` | Affidavit field deltas across filings |
| `/p/:person/cases` | Case docket by stage |
| `/p/:person/record` | Legislative record — attendance, questions, debates |
| `/p/:person/network` | Influence network |
| `/p/:person/statements` | Archived public statements, timestamped |
| `/p/:person/evidence` | Evidence |
| `/p/compare?ids=` | Side-by-side comparison, up to 4 |

### Parties & alliances

| Route | Answers |
|---|---|
| `/party` | Directory of registered parties — national, state, registered-unrecognised |
| `/party/:party` | Brief |
| `/party/:party/analysis` | Analysis — vote share, seat share, elasticity, momentum |
| `/party/:party/geography` | Strongholds and collapse zones |
| `/party/:party/lineage` | Splits, mergers, symbol history |
| `/party/:party/people` | Office bearers, legislators, candidates |
| `/party/:party/funding` | Bonds, returns, declared income |
| `/party/:party/manifestos` | Manifesto archive with cross-cycle promise diff |
| `/party/:party/evidence` | Evidence |
| `/party/compare?ids=` | Side-by-side |
| `/al` | Alliances |
| `/al/:alliance` | Members, seat-sharing, combined arithmetic |

### Places

| Route | Answers |
|---|---|
| `/pl` | India — states and UTs |
| `/pl/:state` | State profile, assembly arithmetic, electoral history |
| `/pl/:state/:district` | District profile |
| `/pl/:state/:district/:ac` | Assembly constituency — the full place brief |
| `/pl/pc/:pc` | Parliamentary constituency |
| `/pl/:...*/delimitation` | Boundary history and the diff |
| `/pl/:...*/evidence` | Evidence |

### Institutions

| Route | Answers |
|---|---|
| `/house/lok-sabha` | Current composition, floor arithmetic, vacancy watch |
| `/house/rajya-sabha` | Composition, biennial retirement cycle, projected 2027–2030 |
| `/house/:state-assembly` | Composition, term expiry, majority arithmetic |
| `/cabinet/union` | Union council of ministers with portfolios and tenure |
| `/cabinet/:state` | State cabinet |

### Evidence

| Route | Answers |
|---|---|
| `/ev` | Source explorer — browse and filter every document |
| `/src/:source` | One document, page-anchored, with extracted claims |
| `/claim/:claim` | One claim, its sources, and everything that cites it |
| `/ev/factchecks` | Fact-check verdicts, linked to the claims they address |

### Reader-only

| Route | Answers |
|---|---|
| `/me` | My constituency, my representatives, my next election |
| `/me/setup` | Locate me (PIN, GPS, or manual) |
| `/brief` | Today's briefing as a vertical card feed |
| `/vote` | When, where, and how do I vote — from the ECI record |

### Notable absences

No `/quiz`, no `/funds` as a destination (it is a party lens), no `/compare` as a page
(comparison is a mode on every directory), no `/about`. `/methodology` and `/corrections`
do the work that an about page pretends to.

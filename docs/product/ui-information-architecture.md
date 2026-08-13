# Information architecture — what each surface owns

**Date** 2026-08-13. The companion to [`ui-final-audit.md`](ui-final-audit.md): that one says what to delete,
this one says where everything lives afterwards.

One rule decides every placement:

> **SIGNAL FIRST · CONTEXT SECOND · EVIDENCE ON DEMAND**

A surface answers *what is happening* before *how it was computed*, and *what can I explore* before *what are
the limits of the database*. A fact and its provenance are never peers: the fact is on the surface, the
provenance is one click behind a single ⓘ.

## The spine

```
INDIA  →  STATE  →  DISTRICT  →  CONSTITUENCY  →  PERSON
  │         │                         │
  │         └── ELECTION (a state's own, selected on its map)
  │
  └── SEARCH (reaches every level)      DATA (what is and is not held)
```

Unchanged from Phase 2.5, and that is deliberate — the navigation graph was already right. What changes is
what each node **shows** and what it **stops showing**.

## Navigation

| | |
| --- | --- |
| **Header** | wordmark → `/`, and one search field with ⌘K. Nothing else. |
| **Footer** | `Data & coverage` → `/coverage`. One link, on every page. |
| **Within a place** | breadcrumbs, on the page, beside the thing they are about. |

`COVERAGE` leaves the primary navigation. It is infrastructure metadata and it was sitting where a product
feature goes. `INDIA` leaves it too: it linked to the page the wordmark already links to.

There is no `/elections`, `/parties` or `/people` index. Each would be a new dashboard listing what the
search field already reaches and what the state pages already own — and "the answer to clutter is not another
page".

## `/` — India

**Owns:** the national picture, and the choice of where to go next.

| module | question it answers | what it may NOT do |
| --- | --- | --- |
| Hero | Who governs India, over how many assemblies? | carry a methodology clause in the headline |
| **Map** | Which party leads each state — or, by mode, vote share / turnout / margin / year? | mix two semantics in one shading; draw district lines at national zoom |
| Who governs | Which party leads each of the 36, and how strongly? | be a five-column spreadsheet |
| Upcoming | Which assemblies face the electorate next? | print a derived date as an announced one |
| Recent results | What has just been decided, and by how much? | carry a coverage column |
| Party landscape | Where does each party actually hold power? | be a seven-column table |
| Closest contests | Which seats were decided by almost nothing? | be more than five rows |
| Notable shifts | Which measurable movements stand out? | predict anything; print its own threshold louder than its finding |

**Does not own:** per-election completeness, registry row counts, source lists, the derivation of a term
expiry, what is not loaded.

## `/pl/<state>` — a state

**Owns:** an intelligence brief. Five seconds to *who governs, how strongly, from which election*; thirty
seconds to *where they won*; two minutes to *evidence*.

1. **Result strip** — party, seats of contested, the election that established it.
2. **Map** — one polygon per constituency, coloured by the party that won it, for the selected election.
3. **Winners** — the parties this election returned, with seat counts. The map's key and its filter.
4. **Key shifts** — three to five observations against the previous election of the same house.
5. **Districts** — where the seats are. A tally, never a winner.
6. **Elections** — a compact timeline, assemblies first.

**Does not own:** the same districts twice, the Analysis floor's measures (those are defined per
constituency), a paragraph explaining why coverage is honest.

## `/pl/<state>/<district>` — a district

**Owns:** the seats inside it, each with its latest result. It has no map of its own — the district level of
the map is reached by selecting a district on the state's map, which reframes it.

## `/pl/<state>/<district>/<seat>` — a constituency

**Owns:** the seat as its latest election left it, its full election history, and what is unusual about its
record. The `Analysis` lens beneath it owns every chart in the product.

## `/p/<person>` — a person

**Owns:** every contest on record for one person, their party history, and their affidavit trail.

## `/search` — one field, five kinds

**Owns:** states, elections, constituencies, people, parties, grouped, from one query. One input in the
document, and it is the shell's.

## `/coverage` — Data

**Owns everything the other surfaces are no longer allowed to say.** This is the deep surface, and it is
*supposed* to be dense:

* the eighteen subject areas and which hold data;
* electoral geography loaded against India's own totals;
* per-election completeness — constituencies, numeric results, unopposed, turnout rows, gaps, anomalies —
  reachable as `/coverage?election=<id>`;
* what will stay incomplete on purpose, and why.

Nothing here is removed or weakened. It is *relocated to the surface whose subject it is*.

## The evidence model

**One drawer, one pattern, one interaction, per module.** `Evidence` renders a native `<details>`; nothing
else in the product may print a publisher, a URL, a hash, a licence or a retrieval date.

| | |
| --- | --- |
| Where it appears | once per module that displays data — never once per figure |
| What it answers | what this is · who published it · when it was retrieved · what the hash is over · whether the bytes were ever fetched · under what licence |
| What replaces it on the surface | nothing. The fact stands alone. |

The seat and person pages carried thirty drawers each: one per metric tile plus one per panel, over the same
handful of sources. One per module is the same provenance, offered once.

## Uncertainty versus incompleteness

The distinction the brief insists on, as a rule this codebase can hold:

| | how it renders |
| --- | --- |
| **A fact is absent** — the source published no figure | the words for it, in the absence style: `not reported`, `no winner recorded`. Never a dash, never a zero. `Value` cannot render a null as a blank. |
| **A fact is inferred** — nobody announced it | the inference in the reader's words: `Expected 2026`, not `2026 DERIVED`. The basis is behind an ⓘ. |
| **A result is incomplete** — some of the election is not loaded | one quiet marker on that row, and only there. Not a column of chips. |
| **The database is incomplete** — verticals, geography, coverage | `/coverage`. Not on a primary screen. |

`BasisChip` survives for exactly one job: marking a flagged observation on a seat page as an inference rather
than a published fact. Everywhere else it was a class label for a database query.

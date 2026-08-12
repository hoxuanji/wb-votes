# Where provenance lives, and where it does not

Phase 2.6's third problem: source information was still visible in more than one place. This is the sweep, the
classification the brief asks for, and the rule that came out of it.

## The rule

| tier | what it holds | where it is |
| --- | --- | --- |
| **PRIMARY** | The fact. `BJP 135`. | On the surface, unqualified. |
| **SECONDARY** | Context that changes how the fact is read — a derived basis, a coverage state, a boundary epoch, a caveat about a denominator. | On the surface, once, next to the fact it qualifies. |
| **EVIDENCE** | Publisher, document, URL, retrieval date, hash, whether the bytes were ever fetched. | Behind one `ⓘ`, per panel or per figure. Nowhere else. |
| **METHODOLOGY** | How a measure is defined and what it does not capture. | `docs/methodology/*`, and `/coverage`. |

The line between SECONDARY and EVIDENCE is the one that took the work. "These are 2011 census boundaries" is
secondary: a reader looking at the polygons cannot read them correctly without it. "udit-001/india-maps-data,
sha256 e724c14b…" is evidence: it answers a different question, asked later, by fewer people.

## The sweep

Every `.tsx` under `src/`, matching `retrieved|sha256|publisher|provenance|methodology|source|ECI`, comments
excluded. 83 lines, and all but the following are either a `sources={…}` prop feeding the one `Evidence`
component, or that component's own internals.

### Fixed

| where | what was visible | now |
| --- | --- | --- |
| `IndiaMap` caption | `Boundaries: udit-001/india-maps-data, 2011 census districts …` — publisher in the primary interface, on every request | The epoch and the semantic disclaimer stay. The publisher, URL, retrieval date and hash moved into the map panel's drawer, via `GEOMETRY_SOURCE`. |
| `/pl/<…>` footer | The whole source list again, plus a paragraph explaining what the `ⓘ` does | One line, to `/coverage`. The panels above already carry the drawer. |
| `/p/<person>` footer | Same | Same |

**A boundary set is a source like any other.** `GEOMETRY_SOURCE` shapes the geometry asset as a `SourceRef`
— publisher, url, `retrievedAt`, `retrievalKind: "fetched"`, `hashKind: "document_bytes"` — so it goes into the
same drawer as every registry citation instead of being spelled out under the map. Both of those flags are
true and were verified in this phase: the file was re-fetched and its sha256 matched the asset's recorded hash
byte for byte. Its `kind` is `census`, from the registry's own union, because that is what the data is.

### Deliberately left on the surface

Each of these was considered and kept, and the reason is the test of whether the rule is being applied or
merely obeyed.

* **`Measured` / `Derived` / `Reference` chips.** Three words, one per panel. They are the product's argument,
  not a citation — and `Derived` in particular has to be beside the figure it qualifies, because a term expiry
  printed like an announced date is the fabrication the whole codebase refuses.
* **`Complete` / `Partial` coverage chips.** How much of an election is loaded changes what its numbers mean.
* **The boundary epoch, on the map.** See above.
* **`/coverage`'s "Source it needs" column.** Not provenance: it is the page's subject. The whole surface
  exists to say what is missing and where it would come from.
* **"294 of 294 constituencies drawn, on the delim-2008 boundaries these results were recorded under."** A map
  that drew 0 of 294 and said nothing would be the defect; this is the disclosure that makes the epoch gate
  visible.
* **"How this record was assembled"**, on a person page. This is not a source citation — it is which rows
  entity resolution merged, on whose decision, at what score. It is the thing that makes "6,167 people" an
  honest number rather than an upper bound, and it belongs on the surface as its own claim.
* **The affidavit caveat.** "A pending-case count is a count and nothing more: the source records no stage, no
  court and no outcome." Secondary, and load-bearing — the figure is defensible only with it.

### Never in a tooltip

Both maps' hover cards carry what won, by how much, and where. No publisher, no document, no retrieval date.
A tooltip is the least dismissible surface in an interface and the worst place to put something a reader did
not ask for.

## What holds it

`repo/render.test.ts`:

* the geometry's publisher, URL and hash are **absent** from the map's caption and **present** in the drawer,
  along with how the bytes were obtained;
* on `/pl` and `/p`, no retrieval date and no hash appears outside a `<details class="iei-ev">`, and the pages
  no longer explain the `ⓘ` in prose;
* the front page's caveat count stays at four or fewer (from Phase 2.5).

The one `Evidence` component is still the only thing in the product that renders a url, a hash or a retrieval
date. That is checkable by grep, and the sweep above is how it was checked.

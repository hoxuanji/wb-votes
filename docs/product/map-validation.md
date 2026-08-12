# Phase 2.6 — map and geometry validation

Written before the map's semantics were changed, because the brief requires the sources to be validated
first and because two of its deliverables turn out to be bounded by what geometry exists rather than by
effort. Every number here was measured against `.data/registry.db` and against the geometry source itself.

## The semantic defect, precisely

`data/geo/india-states.json` holds **36 paths, one per state — and each one is every district polygon of
that state, concatenated**. `ops/geo/build-india.mjs` says so in its own header:

> Districts are not dissolved into state outlines. Each state's path is every one of its districts' rings
> concatenated, filled with one colour: the shared edges disappear under the fill, so it reads as a state
> shape while keeping district geometry for when district-level colour arrives.

The fill hides the shared edges. **The stroke does not.** `.iei-map path { stroke: var(--iei-bg) }` strokes
every subpath, so each state renders as a party-coloured area divided into its districts by visible lines.
A reader looking at that sees district polygons in a party's colour, and the only available reading is "this
district elected this party".

It does not mean that. It means "the party leading this state's most recent assembly election". Two
different claims: one about a government, one about a district's electorate, and the map was making the
second while the data supported only the first.

That is the defect this phase exists to fix, and it is a labelling and layering problem rather than a data
problem — the underlying figure was always the state's.

## Sources, validated

### State and district geometry

| | |
| --- | --- |
| Publisher | `udit-001/india-maps-data`, 2011 census district boundaries |
| URL | `raw.githubusercontent.com/udit-001/india-maps-data/main/geojson/india.geojson` |
| sha256 | `e724c14b…b3b9dc8f` — **re-fetched and verified byte-identical to the hash recorded in the asset** |
| Features | 760, one per district, `Polygon` and `MultiPolygon` |
| Properties | `district`, `dt_code`, `st_nm`, `st_code`, `year: "2011_c"` |
| Simplification | Douglas–Peucker at 0.015° (≈1.5 km) |

**The epoch is 2011.** India has created districts since — Mizoram's Khawzawl and Hnahthial, Tamil Nadu's
Kallakurichi and Tenkasi, and dozens more — so this geometry is a historical administrative snapshot, not
the current map. It must be labelled as one wherever it is drawn. It is not wrong; it is dated, and those
are different.

`st_nm` joins to all 36 jurisdictions. State-level geometry is sound.

### Constituency geometry

**West Bengal only.**

| kind | rows | jurisdiction | epoch |
| --- | --- | --- | --- |
| `ac` | 294 | `wb` | `delim-2008` |
| `district` | 19 | `wb` | `delim-2008` |

`place_geometry` holds 313 rows in total and nothing outside West Bengal. There is no assembly-constituency
polygon for Karnataka, Uttar Pradesh, Assam, Jammu & Kashmir or the other 31 jurisdictions, and no
parliamentary-constituency polygon for any of them.

**This bounds the phase.** "Click a state, see who won each constituency" is a map for one jurisdiction of
36 and a table for the rest. Inventing the other 4,000 polygons is the one thing the brief forbids most
explicitly, and inferring them from district boundaries would be worse than inventing them — it would look
authoritative.

### The epoch gate this implies

West Bengal's 294 polygons are `delim-2008`. The registry holds WB assembly elections from 1951 onward. A
2006 result drawn on 2008 boundaries would be exactly what the brief prohibits: a historical result in a
geography that did not exist when it was recorded.

So constituency polygons may be drawn for an election **only when the contests' own `place_version` rows sit
in the epoch the geometry belongs to.** Where they do not, the map says which epoch it holds and which the
election needs. This is checkable, and it is checked.

### Result and government data — different sources, and kept apart

| claim | table | what it is |
| --- | --- | --- |
| "BJP leads this state" | `result` → `is_winner`, folded per jurisdiction's newest assembly | a count over that state's most recent assembly election |
| "INC won this constituency" | `result` for one contest | one seat's declared winner |
| "12 of 18 constituencies went to INC" | `result` grouped by `place_version.district_place_id` | a count, and never a single district winner |

The first is a *government* layer. The second is an *election-winner* layer. They were the same colour on
the same polygons, which is the whole complaint. They are now separate layers with separate names, and the
layer strip says which one is showing.

## The district join, and why it is only partly usable

The geometry's districts are 2011 census districts. The registry's district places come from election
sources, and some of them are not census districts at all.

| | count |
| --- | --- |
| geojson district features | 760 |
| … carrying a district name | 726 |
| … matching a registry district by exact normalised name within the same state | **548** |
| … not matching | 178 |
| registry district places | 677 |
| … with no polygon | 129 |

Three distinct causes, and they need different answers:

1. **Transliteration.** `Thiruvallur` / `Tiruvallur`, `Thoothukkudi` / `Tuticorin`. A fuzzy match would
   close most of these and would also silently join two genuinely different places, so the unmatched ones
   are reported rather than guessed at.
2. **Districts created after 2011.** `Khawzawl`, `Hnahthial`, `Kallakurichi`. No polygon exists because the
   district did not exist. Correct, and not fixable from this source.
3. **Registry "districts" that are not districts.** Assam's `SILCHAR`, `BOKAJAN`, `DIPHU`, `HAMREN` are
   subdivisions or constituency groupings the election source labelled as districts. Joining those to a
   census polygon would assert a correspondence that is not there.

So the district layer is drawn from geometry and *linked* where the name join is exact. A polygon with no
registry district behind it is drawn and says it is not linked; a registry district with no polygon appears
in the table and not on the map. Neither is presented as the other.

## Renderer

Server-rendered SVG, no client JavaScript. Benchmarked against what the brief lists:

| | count | as SVG |
| --- | --- | --- |
| states | 36 | trivial |
| districts (2011) | 760 | 280 KB of path data for all of India; per state, 4–70 paths |
| assembly constituencies | 294 (WB) | already rendered by the deleted `/map` at 0 KB client JS |
| parliamentary constituencies | 0 | no geometry |

**The current renderer is kept**, and the decision is on the numbers rather than on preference. The largest
document any level draws is one state's districts plus, for West Bengal, 294 constituency paths — the same
order as the front page draws today. MapLibre is ~200 KB of JavaScript plus a tile pipeline, against an app
whose entire first load is 94 KB and whose three dependencies are `next`, `react` and `react-dom`. Vector
tiles solve a problem this data does not have: there is nothing below constituency level to stream, and no
basemap.

What SVG cannot do without client JavaScript is free-form pan and zoom. The brief's requirement is narrower
than that — "zoom must communicate: you are going deeper into the geography" — and a level model whose
`viewBox` frames the geometry of the level you are at communicates exactly that, in the URL, shareably, with
the back button working. Party highlight is the same: URL state rather than a click handler, so a highlighted
map can be sent to someone.

Reconsider the renderer when there is parliamentary geometry for 543 seats and assembly geometry for 4,000
— at which point the question is a tile pipeline, not a library swap.

## Party colour, as it stands

`PARTY_HUES` in `repo/home.ts` is three hues handed out **by rank**: the party leading the most jurisdictions
takes slot 1. Everything else folds to one neutral.

Two consequences, both of which the brief names:

* A party's colour changes when its rank changes. BJP is slot 1 today; on a map of 2004 it would not be, and
  the same party would be a different colour on two pages of one product.
* 427 of the 430 parties that have ever won a seat share one grey. On a Karnataka 2023 map, JD(S) — 19 seats
  — is the same colour as a party with one.

3,330 parties are in the registry; 430 have won at least one seat. That second number is what a colour system
has to distinguish, and it is why "every party gets a unique perceptible colour" is not the goal: curated
identity for the parties a reader recognises, deterministic and stable colour for the rest, and a label on
every mark so colour is never the only channel.

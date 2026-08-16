# Election identity: an election is an event, not a year

Status: **proposal and repair record**. Written 2026-08-11. Every number here is reproducible with
`mandate elections validate`.

Companion to [electoral-geography.md](electoral-geography.md), which repaired the same class of mistake one
level down: a seat number is not a permanent identity for a constituency, and **a year is not a permanent
identity for an election**.

---

## 1. The defect

An election's identity was `(jurisdiction, house, year)`, expressed as an id string — `br-assembly-2005`,
`ls-2019`, `up-bypoll-ae-2014`. Nothing in the schema carried the year, the month, or which occurrence
within the year an election was; `election` has no `year` column at all. Chronology lived only in the id
text, which is why 17 queries across 11 files had to read `substr(election_id, -4)` to sort anything.

Bihar held **two** assembly elections in 2005. The source says so unambiguously, in its own columns:

| | `Assembly_No` | `month` | seats | candidate rows |
|---|---|---|---|---|
| February 2005 | 13 | 2 | 243 | 3,193 |
| November 2005 | 14 | 11 | 243 | 2,133 |

Both collapsed into `br-assembly-2005`. `contest` is `UNIQUE (election_id, place_version_id)`, so the two
events' 486 contests became **243**; a candidacy id is derived from `(contest, person)`, so the **618
candidates who stood in the same seat at both elections** collided and one row overwrote the other.

**Measured before repair:**

| | in the registry | should be |
|---|---|---|
| contests | 243 | 486 |
| candidacies | 4,708 | 5,326 |
| declared winners | 277 | 486 |
| seats showing two winners | 34 | 0 |

The 618 missing rows are the important number. **This is not a re-keying job**: part of the second election
was never stored, so the repair has to re-import it, not move it.

## 2. The source already had the answer

`Assembly_No`, `month`, `Poll_No` and `last_poll` are in all 62 files and in none of
`REQUIRED_COLUMNS` — the importer never read them. `Assembly_No` is the ordinal of the house the election
constituted (Bihar's 13th, then its 14th); `month` is the polling month; `Poll_No` is 0 for a general
election and 1, 2, … for by-elections.

So the event key is the source's own, per house:

```
(jurisdiction, house, year, Assembly_No, Poll_No)
```

**`month` is deliberately NOT part of it.** Indian polling is phased: the 2019 Lok Sabha election polled
across April and May, and state elections routinely straddle two months. Keying on the month would have
split one election into one event per phase. `Assembly_No` is the right distinguisher because it is a fact
about the event — which house it constituted — and Bihar's two 2005 elections differ on exactly that,
13 and 14. Checked rather than assumed: under this key, **zero** events span more than one polling month,
and the collision count is unchanged at 1 general and 13 by-election groups. `month` is kept as
`polling_month`, as data and for ordering, not as identity.

`month` is empty on by-election rows, which is why by-election rounds are separated by `Poll_No` and not by
a date the source does not give.

## 3. Every collision, measured across all 62 files

Scanned: 1,425 `(jurisdiction, house, year)` groups, 742 general events, 829 by-election events.

**One year holds more than one general election** — `br ac 2005`, above. Bihar is the only case in this
corpus, which was checked rather than assumed.

**Thirteen year-groups hold more than one by-election event:** `ap ac 1998`, `ap ac 2008`, `ap pc 2008`,
`as ac 2000`, `ga ac 2005`, `gj ac 2010`, `ka ac 1996`, `ka ac 2011`, `tn ac 2019`, `up ac 2005`,
`up ac 2014`, `up pc 1970`. Each is a `Poll_No 1` and a `Poll_No 2` round collapsed into one
`…-bypoll-…-<year>` id.

Of those thirteen, **one polled the same seat twice** — `up ac 2014` — and that is the second
duplicate-winner contest the geography validator's check 7 was reporting. The other twelve lost no rows;
their identity was still wrong.

## 4. The model

`election` becomes an event, with the fields the source supplies and nothing invented:

```
election (
  id, kind, level, electorate_kind, jurisdiction_place_id, epoch_id, name, lifecycle,
  house         TEXT NOT NULL,      -- 'ac' | 'pc' | 'none' — WHICH HOUSE is being filled
  year          INTEGER NOT NULL,   -- real column; chronology stops living in the id string
  polling_month INTEGER,            -- 1-12 where the source gives it, NULL for by-elections
  house_ordinal INTEGER,            -- Assembly_No: which assembly/Lok Sabha this election constituted
  poll_no       INTEGER,            -- 0 general, 1..n by-election round
  occurrence    INTEGER NOT NULL,   -- 1-based, chronological within (jurisdiction, kind, house, year)
  source_id     -> source(id),      -- P2: who says this event happened
  announced_on, notified_on, counting_on, forecast_gate_from, forecast_gate_to,
  UNIQUE (jurisdiction_place_id, kind, house, year, occurrence)
)
```

**`house` was missing entirely, and adding the constraint is what found it.** An assembly by-election and a
parliamentary by-election in the same state and year are both `kind='bypoll'` at `level='state'`, so 145
pairs — `ap-bypoll-ae-1965` and `ap-bypoll-ge-1965`, and so on — were told apart by nothing but their id
text. No rows were lost to it, but an identity that exists only in a string is the defect this repair is
about. `'none'` is a real value rather than NULL, for elections that fill neither house, so the constraint
stays total: SQLite treats NULLs as distinct.

`occurrence` is what makes the identity total in the other direction: it is not a month, so it separates
by-election rounds that have no month, and it is not the source's ordinal, so it still works where a source
numbers houses differently.

**Chronology is `ORDER BY year, polling_month, occurrence`** — never a string. The 17
`substr(election_id, -4)` sites were a workaround for the missing column and are replaced.

### Ids

Existing ids are preserved wherever they are already unambiguous — 1,186 of 1,188. Only a colliding group
is split, and then both halves get an explicit suffix rather than one keeping the bare id, because neither
event is more "the" election than the other:

```
br-assembly-2005  →  br-assembly-2005-02   (13th assembly, February)
                     br-assembly-2005-11   (14th assembly, November)
up-bypoll-ae-2014 →  up-bypoll-ae-2014-p1
                     up-bypoll-ae-2014-p2
```

Every rename is written to the `correction` ledger — `entity_ref`, `old_value`, `new_value`, `reason`,
`source_id` — which is the registry's existing public audit trail, not a new table invented for this.

## 5. Why a split needs a re-import

618 candidate rows for Bihar's second 2005 election were never written. A migration cannot conjure them,
and inventing them from the surviving rows would be fabrication. So the repair is:

1. migration 013 — the model, and `year` derived from the id it was already encoded in
2. the importer learns the event key, so no future import can collapse two events
3. for each colliding group: record the rename, delete the collapsed election's rows, re-import that
   state's file — which writes both events in full, from the same hash-verified bytes the geography repair
   used

Nothing is deleted before its replacement is proven: the re-import runs first on a copy, the row counts are
compared against the source, and only then does the registry get the same treatment.

## 6. What the repair did, measured

`mandate elections backfill --apply` then `mandate elections repair --apply`:

| | |
|---|---|
| events described by the source | **1,200** |
| elections updated in place (id already unambiguous) | **1,172** |
| collapsed groups split | **14** → 28 events |
| registry elections no source file describes | 2 (the seed's `wb-assembly-2026` and `ls-2024`) |
| election events, before → after | 1,188 → **1,202** |
| contests, before → after | 63,288 → **63,532** (+244) |
| results, before → after | 557,645 → **558,263** (**+618**) |
| contests declaring more winners than seats | 35 → **0** |

The results figure is the confirmation that matters: **+618, exactly the number of candidate rows the
collapse had destroyed.** Bihar's two 2005 elections now hold 243 contests and 243 declared winners each,
and Purnamasi Ram wins Bagha twice — 59,151 votes in February, 60,794 in November — as two results in two
events rather than one row overwriting the other. (The source spells him PURNAMASI RAM in February and
PURNMASI RAM in November, which is why they could never have been one candidacy, and is work for the merge
queue rather than for this repair.)

`mandate elections validate`: **5 of 5 checks pass.** `mandate geography validate`: **10 of 10**, up from
9 — its check 7 was reporting these 34 Bihar seats, and this repair is what fixed it.

## 7. A third defect this exposed

**The house an election fills was never modelled.** Adding `UNIQUE (jurisdiction_place_id, kind, house,
year, occurrence)` failed on the existing data, which is how it was found: an assembly by-election and a
parliamentary by-election in the same state and year are both `kind='bypoll'` at `level='state'`, so **145
pairs** — `ap-bypoll-ae-1965` and `ap-bypoll-ge-1965`, and so on — were distinguished by nothing but their
id text. No rows were lost to it, because they are separate election rows with separate contests. But an
identity that exists only in a string is precisely the defect this repair is about, and the constraint
refusing to be created was the schema doing its job.

## 8. Chronology stops being a string

`substr(election_id, -4)` was a workaround for the missing `year` column, used at **17 sites across 11
files**. After the split it is not merely a workaround but wrong: `'br-assembly-2005-02'` ends in `'5-02'`
and `'up-bypoll-ae-2014-p1'` in `'4-p1'`, so the 28 split events would sort as year 5 and year 4. Every
site now reads `election.year`, `election.polling_month` and `election.occurrence`, joining `election`
where it was not already joined — which is the second half of why a `year` column had to exist.

`yearOf()` in `repo/index.ts` remains correct (it takes the first four-digit run, so it reads 2005 out of
`br-assembly-2005-02`) and is left alone; it is a display helper, not an ordering key.

## 9. Tests

321 tests, 320 pass. The one failure is the pre-existing, classified `searchPersons` ranking issue
documented in [electoral-geography.md](electoral-geography.md) §8 — untouched here, as instructed.

Fourteen new regression tests cover: Bihar February and November 2005 as distinct events with 243 winners
each; the same candidate winning the same seat in both; no contest anywhere declaring more winners than
seats; by-election rounds as separate events; an assembly and a parliamentary by-election in one
state-year; total identity; chronological ordering (including a direct assertion that string sorting
*would* mis-sort a split id); election → contest → result → place-version integrity; the correction ledger
entry; and the pure id scheme — one event keeps its id, two get suffixed, a national parliamentary election
stays one event across thirty state files, phased polling does not split an election, and a blank month is
NULL rather than month zero.

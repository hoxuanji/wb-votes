# Historical Results Backfill

This directory holds per-year raw inputs for `scripts/build-historical.js`.

## Current state

| Year | Status | Source |
|------|--------|--------|
| 2011 | **not backfilled** | ECI archive / TCPD |
| 2016 | **not backfilled** | ECI archive / TCPD |
| 2021 | seeded from `scripts/data/incumbents-2021.csv` | ECI 2021 |

Without these files, `historical-results.ts` still builds — 2011 and 2016 are
silently omitted and the UI renders "data unavailable" for those years.

## Backfill formats

Drop one file per year as `YYYY.json` (e.g. `2011.json`). Each file must be an
array of entries matching this shape:

```json
[
  {
    "constituencyId": "151",
    "winner": {
      "name": "Smt. Mamata Banerjee",
      "partyId": "AITC",
      "partyAbbr": "TMC",
      "votes": 81230,
      "voteShare": 57.4
    },
    "runnerUp": {
      "name": "Deepa Das Munsi",
      "partyId": "INC",
      "partyAbbr": "INC",
      "votes": 54210,
      "voteShare": 38.3
    },
    "turnoutPct": 84.1,
    "marginVotes": 27020,
    "marginPct": 19.1,
    "totalVotes": 141420,
    "totalElectors": 168205
  }
]
```

`year` is injected by the build script — do NOT include it in the JSON file.

## Recommended sources

- **ECI official archives** — `results.eci.gov.in/` (each election has its own
  archive sub-path; crawl AC-wise pages)
- **Trivedi Centre for Political Data (TCPD)** — Ashoka University publishes
  cleaned AC-wise CSVs for all Indian elections. Usually the fastest path.
- **Lokdhaba** — lokdhaba.ashoka.edu.in (same data, browser-friendly)

## Rebuilding

```bash
npm run data:historical
```

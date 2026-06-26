# Make WB Votes Feel Alive — Live-Data Plan

**Date:** 2026-06-26
**Status:** Plan (no code yet)

## Why this exists

Audit on 2026-06-26 confirmed the app's "civic dashboard" surfaces were dressed-up static seeds:
flagship-projects.ts pointed every entry at the same Wikipedia URL, civic-issues.ts had 292
fake-news entries dated 11 May 2026, and a half-dozen pages told users "data coming in M5".
The reference data (294 MLAs, cabinet, candidate affidavits, historical results) is legitimately
static and stays. Everything else needs a heartbeat or it shouldn't be on the page.

This document picks the surfaces worth making live, the sources that can feed them, and the
order to do the work.

## What's already live

- `/api/news` — Google News RSS, per-AC and per-topic. Pulls on every request. Truly live.
- `/api/reports` POST — citizen-report submission (writes to Supabase when configured).
- `/api/reports` GET — now reads Supabase only (seed merge removed in the cleanup).

That's the entire live surface area as of this plan.

## Candidate surfaces for "going live"

Each entry below is one self-contained surface. Build them independently in the order at the bottom.

### 1. Citizen civic-issues map *(reactivate the channel users were promised)*

- **What:** Per-AC pins on the WB SVG map showing real civic reports submitted through the
  existing form. Click a pin → modal with the report; click an empty AC → CTA to file the
  first one.
- **Source:** The Supabase `civic_reports` table that `/api/reports` already writes to. No
  scraping, no third party.
- **Refresh:** ISR with a 60-second revalidate, or fetch on the client at mount. Either works
  because volume will be small.
- **Effort:** Low. The table schema exists, the POST works, the seed merge was removed. We need
  a `CivicIssueMap` re-implementation that pulls live and a Supabase project to actually point
  at (the env vars are in `.env.local.example`).
- **Blocking dependency:** A real Supabase project provisioned and `NEXT_PUBLIC_SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY` set in Vercel. Without it the map renders empty — which is fine
  but not exciting.
- **First-launch problem:** Zero reports on day one. Mitigate with a strong empty-state CTA
  ("Be the first to flag something near you") and seed a *single* genuine WB-press-reported
  issue per district during the first week, sourced and dated, before opening submissions.

### 2. Government-decisions feed *(replaces what /projects was pretending to be)*

- **What:** A chronological feed of actual cabinet decisions and major government announcements.
  Lives in a new home-page section ("This week in government") and probably its own page
  later.
- **Sources, ranked by tractability:**
  1. **PIB (Press Information Bureau) RSS for West Bengal** — best signal, full English, free.
  2. **wb.gov.in press-release section** — has an RSS-ish HTML index; needs light scraping.
  3. **PRS India "What's happening in WB"** — weekly digest, slower cadence but high quality.
  4. **Google News topic search "West Bengal cabinet"** — already wired via `/api/news`, just
     extract the cabinet-tagged subset.
- **Refresh:** Hourly cron pulling RSS → cache in KV or Supabase. Render from cache on every
  request.
- **Effort:** Medium. RSS parsing is already in `/api/news`. The work is normalising entries
  across sources, deduping, and adding a category tag.
- **Watch-out:** Wikipedia "Suvendu Adhikari ministry" was the temptation last time — five
  entries, all the same source URL, zero recency signal. Don't ship a feed unless the source
  publishes a steady stream.

### 3. Assembly session tracker *(makes /assembly mean something)*

- **What:** When sessions happen, who attended, what they asked, what bills moved. The page
  currently shows the MLA roster; this would layer real performance under each row when data
  exists.
- **Source:** PRS India per-MLA stats (`prsindia.org/legislatures/states/west-bengal/...`).
  The scraper at `scripts/scraper/prs-wb-mla.js` is already written, just hasn't been run —
  PRS blocks server IPs so it must run locally.
- **Refresh:** Weekly. Triggered manually from a dev machine, output committed to git as
  `scripts/data/mla-records.json`, then `npm run data:mla` regenerates `mla-records.ts`.
  No live cron — that would fail in Vercel anyway.
- **Effort:** Low (just running the scraper). The blocker is that the WB assembly hasn't held
  its first session yet — there's nothing to scrape until ~July 2026 at earliest.
- **Caveat:** Until first session data exists, the assembly page must NOT advertise this
  capability. It currently doesn't. Leave it that way.

### 4. Daily WB news ticker on home *(elevate what we already pull)*

- **What:** A 3-headline ticker at the top of the home page showing today's top WB
  politics/governance news. Already-fetched data, just promoted to the hero.
- **Source:** `/api/news?type=governance&limit=3` — already live.
- **Refresh:** Per-request (ISR with 5-minute revalidate is plenty).
- **Effort:** Trivial. Maybe two hours.
- **Why it matters:** The user's complaint was "feels like old sheets of paper". A ticker that
  literally shows today's date and today's headline is the cheapest single move toward
  feeling alive.

### 5. MLALADS utilisation tracking *(the only big "real data" gap)*

- **What:** Actual disbursement and project completion figures per AC — not the standard
  ₹70 L/year allocation, but what was sanctioned and spent.
- **Source:** WB Planning Department publishes annual utilisation reports as PDFs
  (`wbplan.gov.in`). No machine-readable feed. RTI filings are the alternative.
- **Refresh:** Annually, manually. This is an *archive*, not a live feed — first useful
  publication is probably 12-18 months into the term (mid-2027).
- **Effort:** High and low-leverage right now. Don't do this in the next 6 months. When the
  first annual report drops, ingest it as a one-off seed.
- **Honest answer:** This was M5 in the old roadmap. It should not be a milestone — it should
  be a one-shot ingest when the source data exists.

### 6. Cabinet reshuffle alerts *(low-volume, high-importance)*

- **What:** When a minister's portfolio changes, surface a banner on `/cabinet` and the
  affected `/mla/[id]` page for ~7 days.
- **Source:** Same as #2 (PIB + wb.gov.in press releases). Filter by keywords like
  "portfolio reshuffle", "minister sworn in", "ministry created".
- **Refresh:** Same hourly RSS pull as #2; this is a tag, not a separate pipe.
- **Effort:** Low once #2 is in place. Maybe a day of work to set up the filter and the
  banner component.

## Sequence

Three waves, each independently shippable. Don't promise wave N until wave N-1 is in production
and observed.

**Wave A — Cheapest "live" wins (~1 week)**
- (#4) Daily WB news ticker on home page
- (#1) Provision Supabase, wire civic-issues map to real reports
- Seed civic issues with one well-documented news-sourced report per district, dated, sourced

**Wave B — Government feed (~2 weeks)**
- (#2) PIB + wb.gov.in RSS aggregator with hourly cron, KV cache
- New home-page section "This week in government"
- (#6) Cabinet reshuffle alerts layered on top

**Wave C — Assembly performance (gated on first session)**
- (#3) Run PRS scraper, ingest first batch
- Surface attendance/questions/bills columns on `/assembly` and the MLA detail page
- Set up weekly local-machine refresh discipline

**Wave never — until data exists**
- (#5) MLALADS utilisation. Stays a "real reference" page until WB Planning publishes.

## Principles to keep this honest

1. A surface either has a live source or it doesn't ship.
2. No "coming in M5" copy. Ever. If the source doesn't exist yet, the section doesn't render.
3. Empty states are CTAs, not roadmap apologies. "Be the first to file a report" is fine.
   "Data ingestion is in progress, see roadmap" is not.
4. Static reference data (the 294 MLAs, cabinet roster, candidates, historical results) stays
   visible and labelled as what it is. The sin was not static-ness — it was static-pretending-
   to-be-live.
5. Every live surface needs an observable freshness signal: a timestamp, a "5 min ago" pill,
   a today's-date badge. If a user can't tell whether it's live, they assume it isn't.

## Related

- [[feedback-anti-stale-civic-tool]] — the directive this plan executes against
- [[feedback-phases-augment]] — the architectural rule live surfaces must respect (augment the
  stable roster, don't replace it)

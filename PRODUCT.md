# Product

<!-- impeccable:product-schema 1 -->

Sources: the user's answers on 2026-11-07 (marked *confirmed*), and the owner's own README.md, DEPLOYMENT.md, GLOSSARY.md, `docs/product/evidence.md`, `docs/platform/00-model.md` (the spec of record since 2026-08-10) and `docs/mandate/` (the founding document). The platform model supersedes the mandate's framing, and the mandate is partly aspirational: where either describes something the code does not do, this file says so.

## Platform

web

## Users

Three audiences, all to be served (*confirmed*). Where their needs conflict, **journalists and researchers win** (*confirmed*, after the first draft of this file left the order open): a figure they can defend, with its source, comes before an analyst's convenience or a voter's plainer reading. The other two audiences are still served; only the tie-break is ranked.

- **Journalists and researchers.** A correspondent on deadline who needs a number she can defend to a desk lawyer; an independent psephologist or a university researcher who must reproduce and cite a figure. A figure they cannot tell is provisional, derived or final costs them a correction. (The mandate's Priya, Rohit and Meera.)
- **Strategists and analysts.** People screening seats on margin, swing, incumbency retention and turnout, or reading a state's political arithmetic, who need a source trail a client or a compliance team accepts, and need a boundary change never to corrupt a comparison silently. (The mandate's Anand and Kavya.)
- **Ordinary voters.** Someone asking who represents a seat and what happened there last time, often on a phone and often a first-time voter. (The mandate's Farida.)

Not for: a campaign directing mobilisation. The README says "this is not a campaign site", and the mandate rules that audience out so the record stays neutral.

## Product Purpose

A registry of Indian elections in which every figure carries the source it came from, how it was derived, and what is missing. It holds assembly and Lok Sabha results across 36 states and union territories, 1962 onward.

It exists because the primary documents are published as PDFs, the best structured datasets have little product around them, news is event-shaped, and Wikipedia has no provenance you can audit (the mandate's framing). It answers the questions a reader returns with: what is happening across India now; is this number true and where does it come from; what happened in this seat last time and the time before; who is this person and what did they declare.

What ships is the electoral vertical. The spec of record frames the longer aim as a political intelligence platform on the same registry: eighteen subject areas (elections, delimitation, member performance, bills, voting records, spending, promises, funding, court cases and others), joined through a *tenure*, one person holding one office for a period, so that elections are one way a tenure starts rather than the whole subject. Most of those areas are specified and unbuilt, and `/coverage` states, at request time, which hold data.

Success, in the mandate's own tests: a competent stranger landing cold states a page's answer within five seconds, and any figure can be traced to its source in a click or two.

## Positioning

The mechanism a neighbouring product could not truthfully copy: nothing here is modelled, predicted or filled in, and the page shows its audit trail. A figure no source published is rendered as the reason there is no figure, never as a zero. A date nobody announced is marked **derived** wherever it appears. `/coverage` counts, at request time, what the platform holds and what it does not.

The asset underneath is a canonical, human-audited registry (people, parties, places with stable ids, alias resolution and merge provenance) in which geography is versioned by boundary epoch, so a result is read against the boundaries it was recorded under.

## Operating Context

- **Free, public, no accounts** (*confirmed*). No login, no pricing, and the site runs no analytics and calls no external API at runtime.
- Hosted on Fly (app `india-election-intelligence`, region `sin`, chosen because Mumbai had no volume capacity) behind Cloudflare. Readers are in India. Every page is a server component rendered on request from a SQLite file; the registry is built from committed, hashed seed sources by `registry:migrate`, `registry:ingest` and `registry:resolve`. A fresh clone has no registry, and every page says so with the command to build one, never a 500.
- Used on a laptop and on a phone; the main reads render without client JavaScript.
- The same reads are available as JSON, with `sources[]`, at `/v1`.
- A merge review queue exists at `/review/merges`. It records decisions only when the server runs with `MANDATE_REVIEW_WRITES=1`, and the deployment does not set it.

## Capabilities and Constraints

Surfaces, each answering one question: the national picture (`/`), a state, a district, a seat and its analysis, an election, a person, search, and `/coverage` (README table).

Constraints the product holds today:
- Show what a source published; never model, predict or judge. A judgement (whether a promise was kept, whether a member performed) is not published, and `/coverage` says why.
- A map coloured by government is not a claim about any district inside it. A comparison across a redrawn map is refused on the page, not just in the data.
- The platform model's four honesty constraints, which are why some tables will look empty and must not be filled with plausible values: Indian legislatures rarely record division votes, so a missing vote is the absence of a division, never of data on our side; "delivery" on a promise is a judgement and is shown only with a cited assessment and a named assessor; charged is not convicted, so only a cited conviction permits that word (the mandate adds that "criminal" never appears next to a name); attendance is not performance, so every activity measure says what it does not capture.
- A pending-case count is a count and nothing more: the source records no stage, no court and no outcome.
- Vocabulary is `GLOSSARY.md` (body, fill, full-house election, chronology key, current election, and so on). Copy uses those words.
- Provenance has tiers: the fact on the surface; context that changes how it is read, once, next to the fact; the evidence (publisher, URL, retrieval date, hash) behind a drawer and nowhere else, one drawer per module that shows registry results, and no more than three on the front page; methodology in `docs/methodology/` and `/coverage` (`docs/product/evidence.md`).
- English only for now (*confirmed*): Bengali and Hindi reading is not planned for this phase. The registry holds no Bengali name strings, so no regional-language text is shown.

Decided since the first draft (*confirmed*):
- **ECI party symbols will be added to party marks.** The shipped product shows none yet, and how they sit with party colour is not decided here.

Undecided, and not to be settled by a design edit:
- **Whether journalists-first means desktop-first.** The tie-break between audiences is decided. Whether the product leads with a laptop reading over a phone reading is not, and phone reading stays a first-class use for ordinary voters.
- **A paid tier.** The mandate describes a paid terminal over a free reader; the user confirmed a free public site, and nothing here commits to the paid one.

## Brand Commitments

- **The name is India Election Intelligence** (*confirmed*), shown as the wordmark INDIA with "Election Intelligence" beside it, and as the page title and the Fly app. MANDATE is the name of the registry package, its CLI and the founding document; WB Votes is the product's former name, and the repository and `GLOSSARY.md` still carry it. Neither is to be reintroduced as the product's name. The name stays even if subject areas beyond elections ship (*confirmed*).
- **Voice is the record's voice.** The mandate states that editorial voice is a liability here: the product makes stories checkable and does not break them, and a page title states the answer rather than naming a topic. Taken from the mandate, not re-confirmed.

## Evidence on Hand

- Committed seed sources, each with a hash and a retrieval date (`data/seed/`); state outlines and district rings with their hash and epoch (`data/geo/india-states.json`, boundaries from `udit-001/india-maps-data`, 2011 census districts); curated party colours with their provenance (`data/party-ink.json`).
- A generated national coverage report (`docs/release/coverage.md`) and methodology cards per measure (`docs/methodology/`).
- A suite that measures rather than asserts: `render.test.ts` checks no fabricated figure and no unlabelled derived date, and `iei.test.ts` computes contrast.

Absences future work must not fabricate:
- No usage data of any kind (the site runs no analytics), no testimonials, no customers, no pricing. The personas are written in `docs/mandate/`; this file records no research behind them.
- Only four of the eighteen subject areas in the model hold data (README; `/coverage` computes the current status). Member performance, bills, voting records, spending, promises and court cases are specified in `docs/platform/00-model.md` and not built. A person's declared assets are shown as one number from one filing, so no change between filings can be computed.
- A fresh clone's registry is small, and boundary polygons are only partly loaded; `/coverage` is the statement of what a given deployment holds.

## Product Principles

1. **A figure without its source is not published.** Provenance is part of the figure, not a footnote to it.
2. **An absence is information.** Say what is missing and why. Never a zero, a blank or a quiet default.
3. **Report what a source published.** Do not model, predict or judge, and mark anything derived as derived, beside the figure it qualifies.
4. **A page answers one question, and says the answer first.**
5. **One record for everyone, and no side.** A correspondent, an analyst and a voter on a phone get the same facts at the same trust level; the product serves no campaign and takes no position.

## Accessibility & Inclusion

No product-specific requirement was established by the user. The code holds a measured standard today, which future work should not lower: text clears 4.5:1 and non-text marks 3:1 on every surface (`iei.test.ts`); focus is always visible and forced-colors gets a real outline; animation is opt-out under `prefers-reduced-motion`; status is never carried by colour alone; the main reads work without JavaScript.

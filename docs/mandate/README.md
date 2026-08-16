# MANDATE

**Every seat. Every claim. Every source.**

A national election intelligence platform for India. This directory is the founding
product document: a complete rewrite of the product formerly known as *WB Votes*.

---

## The one page

India runs the largest continuous electoral operation on earth — 543 Lok Sabha seats,
245 Rajya Sabha members, 31 legislative assemblies totalling ~4,120 seats, ~780 districts,
~4,800 urban local bodies, ~250,000 gram panchayats, ~1.05 million polling stations,
~968 million electors. Something is *always* being contested, filed, disqualified,
delimited, or counted.

Nobody has built the instrument for reading it.

- The **Election Commission** has the authority and the primary documents, and publishes
  them as PDFs and session-bound tables. Custody, not comprehension.
- **ADR/MyNeta** and **TCPD's Lok Dhaba** have the best structured datasets in the country
  and almost no product around them. Data, not interface.
- **News portals** are event-shaped: excellent for four days in June, empty in October.
- **Wikipedia** is consensus prose with no time axis and no provenance you can audit.

MANDATE is the fourth thing: a workspace where a claim about Indian politics can be
made, checked, and cited in under a minute.

### The three bets

1. **The moat is the registry, not the UI.** India has no national politician identifier.
   `Md. Salim`, `Mohammed Salim`, and `MOHAMMAD SALIM` may be one person or three, and
   nothing in the public record tells you which. A canonical, human-audited registry of
   people, parties, and places — with stable IDs, alias graphs, and merge provenance — is
   the asset. Every screen in this document is a *view* over that registry. Build the
   registry first or build nothing.

2. **Geography is time-varying, and everyone forgets.** Constituency boundaries are not
   constants. They changed in 2008 and the next delimitation — constitutionally deferred
   to "the first census after 2026" — will renumber and reshape a large share of the
   country's seats. Every election database that hardcoded a constituency ID will become
   unreadable. MANDATE versions geography from day one and ships an explicit crosswalk so
   pre- and post-delimitation results can be compared honestly instead of silently.

3. **Provenance is a UI primitive, not a footnote.** Every number carries a citation set.
   Press `.` on any figure and the source peels open: the Form 20 page, the Form 26
   affidavit scan, the court order, the ECI declaration, with the ingest timestamp and the
   parser version. This is the difference between a terminal and a blog.

### The signature

Indian national elections are held in **phases** — 2024 ran seven of them across six
weeks. No other democracy has this shape. So the phase ladder is the product's hero and
its clock: a persistent strip that shows the country's electoral calendar as a physical
object, filling with indelible-ink violet as each phase polls and counts. It is the one
piece of ornament in the system, and it is not ornament — it is the answer to *"what is
happening right now?"* rendered pre-attentively, above every page, all year.

---

## Read in this order

| # | File | Deliverables |
|---|------|-------------|
| — | [README.md](README.md) | Thesis, what changes, open questions |
| 1 | [01-product.md](01-product.md) | §1 Vision · §2 Principles · §3 Personas · §4 Information architecture · §5 Navigation · §6 Features · §7 Page inventory |
| 2 | [02-design.md](02-design.md) | §8 Component inventory · §9 Dashboard architecture · §10 Design system · §11 Interaction model |
| 3 | [03-intelligence.md](03-intelligence.md) | §12 Data model · §13 Analytics layer · §14 AI layer · §15 Map experience · §16 Live election experience |
| 4 | [04-engineering.md](04-engineering.md) | §17 Technical architecture · §18 Folder structure · §19 Database schema · §20 API design · §21 UX flows |
| 5 | [05-craft.md](05-craft.md) | §22 Microinteractions · §23 Motion · §24 Color · §25 Typography · §26 Responsive · §27 Accessibility |
| 6 | [06-roadmap.md](06-roadmap.md) | §28 Roadmap · §29 Technical debt strategy · §30 Final critique |

---

## What is thrown away

Everything structural. Nothing of the data work.

**Discarded:** the West Bengal-only scope; the "WB Votes" name and identity; all 16 current
routes; the tab-based home page; `BottomNav`/`Header`/`Footer` as the navigation model; the
light-mode blue-and-saffron palette; the quiz, find-rep, and funds pages as top-level
destinations; the phase-gated homepage swapping (superseded by the persistent phase ladder);
the 2.8 MB of TypeScript data modules compiled into the client bundle
(`src/data/candidates.ts` at 1.6 MB, `src/data/historical-results.ts` at 1.2 MB).

**Kept and promoted:** the scraper corpus in [scripts/scraper/](../../scripts/scraper/) —
MyNeta, PRS, and ECI extraction is exactly the hard, unglamorous work that becomes the
ingest layer; the psephology already encoded in
[src/lib/election-analysis.ts](../../src/lib/election-analysis.ts) (seat flips, margins,
swing) which becomes the semantic layer's first measures; the Bengali localisation, which
becomes a 12-script requirement rather than a nice-to-have; the Upstash Redis live store,
which becomes the counting-day fan-out.

**Superseded prior decisions.** Two earlier notes are now void: the pending mobile UX
overhaul (§26 replaces it — mobile becomes a separate product surface, not a narrower
terminal) and the "phase-aware surfaces layer alongside the existing home" rule (§4 replaces
it — there is no longer an "existing home" to preserve).

---

## Open questions for the founding team

These are not blockers for the design; they are the decisions that shape the company.

1. **Who pays?** §30 argues for terminal seats plus a data API, not advertising. This needs
   validation with three newsrooms and two consultancies before v2 scope is locked.
2. **How much forecasting?** Publishing exit-poll results during a notified poll period is
   restricted under the Representation of the People Act, and opinion-poll publication
   carries disclosure obligations. §14 designs a compliance gate that suppresses forecast
   surfaces during poll periods. *The specific sections and dates cited in these documents
   must be verified with Indian election-law counsel before any forecast ships.* Treat every
   legal reference here as a flag for review, not as advice.
3. **Booth-level depth in MVP or v2?** ~1.05 M polling stations × candidates × elections is
   the single largest cost driver in the data plan (§12, §17). It is also the sharpest
   differentiator. §28 defers it to v2 for one state at a time; that call is worth arguing.
4. **Registry governance.** Who adjudicates a contested person-merge, and what is the
   appeal path when a politician disputes their own profile? §12 specifies the audit trail;
   it does not specify the humans.

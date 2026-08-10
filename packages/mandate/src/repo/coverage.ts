// What the platform covers, and what it does not — computed, never asserted.
//
// This exists because the product had no way to say what it was. Opening it showed margin tables for
// one state with no frame, so the only available reading was "this is all there is, and it is thin".
// Eighteen verticals were specified (docs/platform/00-model.md); two have real data. A reader cannot
// be expected to work that out from a page of tables.
//
// The one rule here: **status is DERIVED from a probe against the live registry.** Nothing in this
// file declares a vertical live, partial or empty. A hand-written status is a claim that rots the
// first time someone loads data, and this table is the thing most likely to be quoted back at us.
//
// It is also NOT a roadmap. Each row states what exists and, where nothing does, which source would
// have to be fetched — a factual disclosure of scope, not a promise about a future release.

import type { DatabaseSync } from "node:sqlite";
import { get } from "../db/index.ts";
import { read } from "./index.ts";

/**
 * `no-model` — nothing in the schema can hold this yet.
 * `empty`    — a table models it and holds zero rows.
 * `present`  — it holds rows. The `scope` line says how far they go; "present" never means complete.
 */
export type Status = "present" | "empty" | "no-model";

export type Vertical = {
  key: string;
  label: string;
  /** The question a reader would open this vertical to answer. */
  question: string;
  /** SQL returning one column `n`. Null when no table models the vertical at all. */
  probe: string | null;
  /** What the row count counts, so a bare number is never ambiguous. */
  unit: string;
  /** How far the data reaches. Stated even when rows exist — "present" is not "complete". */
  scope: string;
  /** Where the data would have to come from. Named for every vertical, including the built ones. */
  source: string;
};

export type VerticalState = Vertical & { status: Status; count: number };

/** §3 of docs/platform/00-model.md, in the order that document lists them. */
export const VERTICALS: readonly Vertical[] = [
  {
    key: "elections",
    label: "Elections",
    question: "Who won this seat, by how much, and how has it behaved across cycles?",
    probe: "SELECT count(*) AS n FROM result WHERE revision = 0",
    unit: "result rows",
    scope: "West Bengal: 294 assembly seats × 4 elections, plus its 42 Lok Sabha seats in 2024",
    source: "ECI, Lokdhaba, MyNeta affidavits",
  },
  {
    key: "census",
    label: "Census overlays",
    question: "Who lives in this constituency?",
    probe: "SELECT count(*) AS n FROM claim WHERE predicate LIKE 'demographics.%'",
    unit: "demographic claims",
    scope: "294 West Bengal assembly seats: literacy, SC/ST share, urbanisation",
    source: "Census of India, ECI electoral rolls",
  },
  {
    key: "trends",
    label: "Historical trends",
    question: "What has changed across election cycles?",
    probe: "SELECT count(*) AS n FROM election",
    unit: "elections",
    scope: "four assembly cycles (2011–2026) and one general election, one state",
    source: "Lokdhaba",
  },
  {
    key: "delimitation",
    label: "Delimitation changes",
    question: "Is this seat comparable to itself across boundary changes?",
    probe: "SELECT count(*) AS n FROM place_crosswalk",
    unit: "crosswalk rows",
    scope: "one boundary epoch loaded, so nothing to cross-walk between yet",
    source: "ECI delimitation orders",
  },
  {
    key: "portfolios",
    label: "Cabinet and portfolios",
    question: "Who holds which portfolio, and since when?",
    probe: "SELECT count(*) AS n FROM claim WHERE predicate LIKE 'cabinet_portfolio:%'",
    unit: "portfolio claims",
    scope: "current West Bengal cabinet only — a snapshot, with no start dates for most and no history",
    source: "state gazettes, PIB",
  },
  {
    key: "performance",
    label: "MLA/MP performance",
    question: "What has this member actually done in office?",
    // The table does not exist. Neither does anything that could stand in for it: the old app's
    // mlaRecords and wbmpRecords are empty arrays in files nothing imports.
    probe: null,
    unit: "activity rows",
    scope: "no tenure or activity model exists yet — see phase 0 and 2",
    source: "PRS India, Lok Sabha / Rajya Sabha / assembly records",
  },
  {
    key: "sessions",
    label: "Parliamentary sessions",
    question: "What did this house do this session?",
    probe: null,
    unit: "sittings",
    scope: "no institution or session model exists yet",
    source: "Lok Sabha and Rajya Sabha bulletins",
  },
  {
    key: "bills",
    label: "Bills",
    question: "What was proposed, and what became law?",
    probe: null,
    unit: "motions",
    scope: "no motion model exists yet",
    source: "PRS India, Lok Sabha bill tracker",
  },
  {
    key: "votes",
    label: "Voting records",
    question: "How did this member vote?",
    probe: null,
    unit: "recorded votes",
    // The single most important row in this table to state correctly.
    scope:
      "no vote model exists yet — and note that Indian legislatures rarely hold division votes, so " +
      "even a complete import is mostly absence of a record rather than a record of absence",
    source: "division lists, where a division was called at all",
  },
  {
    key: "schemes",
    label: "Government schemes",
    question: "What programmes exist, who runs them, and what do they fund?",
    probe: null,
    unit: "schemes",
    scope: "no scheme model exists yet",
    source: "ministry dashboards, PIB",
  },
  {
    key: "budget",
    label: "Budget allocations",
    question: "What was promised in money?",
    probe: null,
    unit: "fiscal lines",
    scope: "no fiscal model exists yet",
    source: "Union and state budget documents",
  },
  {
    key: "spending",
    label: "Public spending",
    question: "What was actually spent against what was allocated?",
    probe: null,
    unit: "fiscal lines with actuals",
    scope: "no fiscal model exists yet",
    source: "CAG reports, expenditure budgets",
  },
  {
    key: "cdf",
    label: "Constituency development funds",
    question: "Did this member spend their allocation, and where?",
    probe: null,
    unit: "allocations",
    scope: "no fiscal model exists yet; also needs the tenure spine to scope money to a member",
    source: "MPLADS portal, state MLALAD returns",
  },
  {
    key: "promises",
    label: "Promises vs delivery",
    question: "Was the manifesto honoured?",
    // Promises exist as party stance data in the old app; NOTHING models delivery.
    probe: null,
    unit: "assessed commitments",
    scope:
      "14 party manifestos with policy positions sit in the repo unmodelled, and there is no delivery " +
      "evidence at all — half a vertical is worse than none, so neither half is published yet",
    source: "manifestos, then every money and legislative vertical above",
  },
  {
    key: "funding",
    label: "Political funding",
    question: "Who funds whom, and through what instrument?",
    probe: null,
    unit: "contributions",
    scope:
      "5 parties for one year sit in the repo as a legacy page, unmodelled and uncited by the registry",
    source: "ECI contribution reports, electoral bond disclosures",
  },
  {
    key: "cases",
    label: "Court cases",
    question: "What proceedings involve this person?",
    // The table exists and is empty ON PURPOSE, which is a different fact from "we have not got to it".
    probe: "SELECT count(*) AS n FROM legal_case",
    unit: "cases",
    scope:
      "deliberately zero: declared pending-case counts are held as cited claims instead, and no case " +
      "is asserted without a court record, because charged is not convicted",
    source: "eCourts, Supreme Court and High Court records",
  },
  {
    key: "rti",
    label: "RTI datasets",
    question: "What has been disclosed on request?",
    probe: null,
    unit: "documents",
    scope: "no extraction pipeline exists yet",
    source: "RTI portals, published responses",
  },
  {
    key: "coalitions",
    label: "Coalitions",
    question: "Who governs with whom, and do they vote together?",
    probe: "SELECT count(*) AS n FROM alliance_member",
    unit: "alliance memberships",
    scope: "the tables exist and hold nothing; vote agreement additionally needs the vote model",
    source: "declared pre-poll alliances, then voting records",
  },
];

/** Row counts per vertical, with status derived from the count rather than declared. */
export function verticals(db: DatabaseSync): VerticalState[] {
  return read(() =>
    VERTICALS.map((v) => {
      if (v.probe === null) return { ...v, status: "no-model" as Status, count: 0 };
      // A probe naming a table that a future migration renames must not take the page down with it.
      let count = 0;
      try {
        count = Number(get<{ n: number }>(db, v.probe)?.n ?? 0);
      } catch {
        return { ...v, status: "no-model" as Status, count: 0 };
      }
      return { ...v, status: count > 0 ? ("present" as Status) : ("empty" as Status), count };
    }),
  );
}

/**
 * India's denominators. Declared, because they are facts about the country rather than about this
 * database, and stated here so the ratios on the page are reproducible.
 *
 * 28 states + 8 union territories. 543 elected Lok Sabha seats. 4,123 is the elected total across
 * every state and UT assembly — the figure moves with delimitation, which is exactly why the number
 * lives next to a `boundary_epoch` model rather than inside a page.
 */
export const INDIA = { states: 36, lokSabhaSeats: 543, assemblySeats: 4123 } as const;

export type Geography = {
  statesLoaded: number;
  assemblySeatsLoaded: number;
  parliamentarySeatsLoaded: number;
  statePct: number;
  assemblyPct: number;
  parliamentaryPct: number;
};

export function geography(db: DatabaseSync): Geography {
  return read(() => {
    const n = (sql: string): number => Number(get<{ n: number }>(db, sql)?.n ?? 0);
    const states = n("SELECT count(*) AS n FROM place WHERE kind IN ('state','ut')");
    const acs = n("SELECT count(*) AS n FROM place WHERE kind = 'ac'");
    const pcs = n("SELECT count(*) AS n FROM place WHERE kind = 'pc'");
    return {
      statesLoaded: states,
      assemblySeatsLoaded: acs,
      parliamentarySeatsLoaded: pcs,
      statePct: (100 * states) / INDIA.states,
      assemblyPct: (100 * acs) / INDIA.assemblySeats,
      parliamentaryPct: (100 * pcs) / INDIA.lokSabhaSeats,
    };
  });
}

export type Coverage = {
  verticals: VerticalState[];
  geography: Geography;
  /** Counts by status, so the headline is computed from the same rows the table shows. */
  present: number;
  empty: number;
  noModel: number;
  total: number;
};

export function getCoverage(db: DatabaseSync): Coverage {
  const rows = verticals(db);
  return {
    verticals: rows,
    geography: geography(db),
    present: rows.filter((v) => v.status === "present").length,
    empty: rows.filter((v) => v.status === "empty").length,
    noModel: rows.filter((v) => v.status === "no-model").length,
    total: rows.length,
  };
}

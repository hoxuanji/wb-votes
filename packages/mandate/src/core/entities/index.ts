// §12 rings 1 and 2, shaped to the §19 DDL that lives in ops/migrations/*.sql.
// camelCase properties over the snake_case columns. The mapping rule, asserted by
// schema-drift.test.ts against live PRAGMA table_info, is:
//   NOT NULL column (or INTEGER PRIMARY KEY) -> required property
//   nullable column                          -> `| null` (a row gives you null, not absence)
//   CHECK (col IN (...))                     -> the matching const array below, exactly
// The DDL wins every disagreement; when it changes, the test says which column and which way.
//
// JSON columns arrive from node:sqlite as TEXT. The shaped ones (names, rect, sections, anomalies)
// are typed parsed because their shape is known.
//
// ONLY THE ROW TYPES SOMETHING READS ARE HERE (C4 step 8, 2026-11-01). Twenty-seven declarations that no code
// imported were removed with the drift checks that policed them: the row models of boundary_epoch, place_version and
// its links and crosswalk, person_alias, party_version and its lineage, alliance_version, election_phase,
// affidavit_field, legal_case, round_result, booth_result, claim, ingest_run and correction, and the five
// vocabularies only they used. Those tables are described by their DDL, which db/catalog.ts reads, and every importer
// writes them through putRows, which checks the columns against that DDL before any SQL runs; a reader that wants a
// typed row for one of them defines the type where it reads it. The vocabulary arrays that remain are the ones a kept
// type is derived from.
//
// ponytail: types plus the CHECK vocabularies as const arrays — the arrays are what lets the drift
// test compare a union to the DDL in both directions, and they cost one line each. No validators
// here: the CHECK constraints are the enforcement, a second copy in TS would drift.

import type { ISODate, ISOTimestamp } from "../temporal/index.ts";
import type { Rect } from "../citation/index.ts";

/** Script- or language-keyed names: { bn: "মমতা ব্যানার্জী", hi: "…" }. */
export type Names = Record<string, string>;

// Script codes come from core/indic, which owns script detection and needs the full set
// (this file's own copy listed three, which could not type a Tamil or Urdu alias).
import type { Script } from "../indic/index.ts";
export type { Script };

// ─── people ──────────────────────────────────────────────────────────────────

export const SEXES = ["m", "f", "o"] as const;
export type Sex = (typeof SEXES)[number];

export const BIRTH_YEAR_CONFIDENCES = ["exact", "approx", "unknown"] as const;
export type BirthYearConfidence = (typeof BIRTH_YEAR_CONFIDENCES)[number];

export const REVIEW_STATES = ["unreviewed", "auto", "human", "disputed"] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

export type Person = {
  /** slug: 'mamata-banerjee'. */
  id: string;
  canonicalName: string;
  /** Script of canonicalName — 'latn' for a Latin nomination form, 'beng' for a Bengali one. */
  canonicalNameScript: Script | null;
  names: Names;
  sex: Sex | null;
  birthYear: number | null;
  birthYearConfidence: BirthYearConfidence | null;
  reviewState: ReviewState;
  createdAt: ISOTimestamp;
};

// ─── parties, versioned, with lineage ────────────────────────────────────────

export const PARTY_KINDS = ["national", "state", "registered_unrecognised", "independent"] as const;
export type PartyKind = (typeof PARTY_KINDS)[number];

export type Party = {
  id: string;
  name: string;
  shortName: string;
  names: Names;
  kind: PartyKind | null;
  registeredOn: ISODate | null;
  dissolvedOn: ISODate | null;
};

/** ECI symbol allotment. P3: the symbol, not the colour, carries party identity. */
export type Symbol = {
  id: string;
  name: string;
  names: Names;
  svgRef: string | null;
  /** 'reserved' | 'free' | 'common' in practice, but §12 does not fix the vocabulary and the column
   *  carries no CHECK, so neither does this. */
  allotmentKind: string | null;
  licensedFrom: string | null;
};

// ─── places, versioned by boundary epoch ─────────────────────────────────────

export const PLACE_KINDS = [
  "nation",
  "state",
  "ut",
  "division",
  "district",
  "pc",
  "ac",
  "ward",
  "booth",
] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export type Place = {
  /** 'wb', 'wb.nadia', 'wb.ac.084'. */
  id: string;
  kind: PlaceKind;
  parentId: string | null;
  canonicalName: string;
  names: Names;
  lgdCode: string | null;
  eciCode: string | null;
};

/** What kind of date `effectiveFrom` is. A legal effective date and a publication date are not the same
 *  fact, and a column holding both without saying which invites a reader to assume the stronger one. */
export const EFFECTIVE_DATE_BASES = [
  "legal_effective_date",
  "order_date",
  "publication_date",
  "not_established",
] as const;
export type EffectiveDateBasis = (typeof EFFECTIVE_DATE_BASES)[number];

/** 'bl' is Sikkim's Bhutia-Lepcha reservation — 12 of its 32 seats, by statute. See migration 010. */
export const RESERVATIONS = ["general", "sc", "st", "bl"] as const;
export type Reservation = (typeof RESERVATIONS)[number];

// ─── elections and contests ──────────────────────────────────────────────────

export const ELECTION_KINDS = [
  "general",
  "assembly",
  "biennial_rs",
  "municipal",
  "panchayat",
  "bypoll",
  "presidential",
] as const;
export type ElectionKind = (typeof ELECTION_KINDS)[number];

export const ELECTION_LEVELS = ["union", "state", "district", "block", "ward"] as const;
export type ElectionLevel = (typeof ELECTION_LEVELS)[number];

/** Rajya Sabha (MLAs voting, STV) lives in the same tables as Lok Sabha; this changes result
 *  interpretation, not shape. */
export const ELECTORATE_KINDS = ["direct", "indirect", "electoral_college"] as const;
export type ElectorateKind = (typeof ELECTORATE_KINDS)[number];

export const ELECTION_LIFECYCLES = [
  "announced",
  "notified",
  "nominations",
  "scrutiny",
  "withdrawal",
  "campaign",
  "silence",
  "polling",
  "counting",
  "declared",
  "disputed",
  "closed",
] as const;
export type ElectionLifecycle = (typeof ELECTION_LIFECYCLES)[number];

/** Which house an election fills. 'none' for one that fills neither — municipal, panchayat, presidential,
 *  biennial Rajya Sabha — and a real value rather than NULL so the UNIQUE identity stays total. */
export const ELECTION_HOUSES = ["ac", "pc", "none"] as const;
export type ElectionHouse = (typeof ELECTION_HOUSES)[number];

/**
 * An election is an EVENT, not a year.
 *
 * Identity is (jurisdiction, kind, house, year, occurrence). Bihar held two assembly elections in 2005 —
 * its 13th assembly in February, its 14th in November — and a (jurisdiction, house, year) key collapsed
 * them into one id, losing 618 candidate rows and leaving 34 seats with two winners. Migration 013;
 * docs/model/election-identity.md.
 */
export type Election = {
  /** 'ls-2024', 'wb-assembly-2026', 'br-assembly-2005-02'. */
  id: string;
  kind: ElectionKind;
  level: ElectionLevel;
  electorateKind: ElectorateKind;
  jurisdictionPlaceId: string;
  epochId: string;
  name: string;
  lifecycle: ElectionLifecycle;
  house: ElectionHouse;
  year: number;
  /** Earliest polling month the source gives. NULL on by-elections, whose rows carry none. Never part of
   *  identity: polling is phased, so one election legitimately spans two months. */
  pollingMonth: number | null;
  /** TCPD's Assembly_No — which assembly or Lok Sabha this election constituted. */
  houseOrdinal: number | null;
  /** 0 for a general election, 1..n for a by-election round. */
  pollNo: number | null;
  /** 1-based, chronological within (jurisdiction, kind, house, year). */
  occurrence: number;
  sourceId: string | null;
  announcedOn: ISODate | null;
  notifiedOn: ISODate | null;
  countingOn: ISODate | null;
  /** §6.10 compliance gate: the API suppresses forecast measures inside this window. */
  forecastGateFrom: ISOTimestamp | null;
  forecastGateTo: ISOTimestamp | null;
};

/** The atomic unit: one seat × one election. */
export type Contest = {
  /** 'ls-2024:wb-diamond-harbour'. */
  id: string;
  electionId: string;
  placeVersionId: number;
  phaseN: number | null;
  seatsAvailable: number;
  lifecycle: ElectionLifecycle;
  declaredAt: ISOTimestamp | null;
};

export const CANDIDACY_STATUSES = [
  "filed",
  "rejected",
  "withdrawn",
  "contesting",
  "elected",
  "defeated",
  "disqualified",
] as const;
export type CandidacyStatus = (typeof CANDIDACY_STATUSES)[number];

export type Candidacy = {
  id: string;
  contestId: string;
  personId: string;
  /** null when the declared party did not resolve — the candidacy is still recorded, the raw label
   *  survives in partyRaw and the failure lands in IngestRun.anomalies. Never drop a candidacy. */
  partyVersionId: number | null;
  allianceVersionId: number | null;
  symbolId: string | null;
  serialNo: number | null;
  status: CandidacyStatus;
  ageDeclared: number | null;
  educationDeclared: string | null;
  /** The source's party string when it did not resolve to a party row. NULL once resolved. */
  partyRaw: string | null;
};

// ─── alliances: NDA-2019 ≠ NDA-2024 ──────────────────────────────────────────

export type Alliance = { id: string; name: string; names: Names };

// ─── affidavits ──────────────────────────────────────────────────────────────

export type Affidavit = {
  id: string;
  candidacyId: string;
  filedOn: ISODate | null;
  sourceId: string;
};

// ─── legal cases: P5 lives here ──────────────────────────────────────────────

// ─── ring 2 — the facts: append-only, immutable with supersession ─────────────

export type Result = {
  contestId: string;
  candidacyId: string;
  /** A revised figure is a new row with a higher revision; the old row stays readable because the
   *  correction ledger depends on it. */
  revision: number;
  /** NULL means the source reported no count; 0 means it reported none. Migration 007 removed the
   *  NOT NULL, because two sources in a row (WB assembly 2026 and Lok Sabha 2024) report a winner and
   *  a margin with no vote totals, and the old constraint was satisfied with a fabricated 0 that then
   *  had to be defended against all the way out to the read path. `result_has_a_figure` still requires
   *  one of votes / margin / voteShare, so a row that says nothing is rejected. */
  votes: number | null;
  /** Nullable, and NULL for every row cycle 1 writes: a historical total does not split postal/EVM.
   *  Typing these non-null is what made `row.postalVotes.toLocaleString()` throw on real data. */
  postalVotes: number | null;
  evmVotes: number | null;
  voteShare: number | null;
  rank: number | null;
  /** 0/1, not boolean: the column is INTEGER CHECK (is_winner IN (0,1)) and node:sqlite hands back
   *  a number — booleans are not even bindable (db.Param). */
  isWinner: 0 | 1;
  margin: number | null;
  sourceId: string;
  ingestedAt: ISOTimestamp;
};

export type Turnout = {
  contestId: string;
  /** 'contest' | 'booth:<id>' | 'phase:<n>' — free-form so a partial-scope figure is storable. */
  scope: string;
  electors: number | null;
  voters: number | null;
  male: number | null;
  female: number | null;
  thirdGender: number | null;
  postal: number | null;
  nota: number | null;
  sourceId: string;
};

// §12 rings 1 and 2, shaped to the §19 DDL that lives in ops/migrations/*.sql.
// camelCase properties over the snake_case columns. The mapping rule, asserted by
// schema-drift.test.ts against live PRAGMA table_info, is:
//   NOT NULL column (or INTEGER PRIMARY KEY) -> required property
//   nullable column                          -> `| null` (a row gives you null, not absence)
//   CHECK (col IN (...))                     -> the matching const array below, exactly
// The DDL wins every disagreement; when it changes, the test says which column and which way.
//
// JSON columns arrive from node:sqlite as TEXT. The shaped ones (names, rect, sections, anomalies)
// are typed parsed because their shape is known; opaque payloads (claim.object_value,
// correction.old_value/new_value) stay raw JSON text because it is not.
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

/** person_alias.kind. ponytail: the column carries no CHECK (the DDL only comments the vocabulary),
 *  so the drift test cannot police this one — it documents intent, it is not an enforced domain. */
export type AliasKind =
  | "eci_nomination"
  | "affidavit"
  | "prs"
  | "court"
  | "gazette"
  | "press"
  | "user_submitted";

export type PersonAlias = {
  personId: string;
  name: string;
  script: Script;
  /** Indic-aware phonetic key from core/indic — the entity-resolution blocking index. */
  normKey: string;
  kind: AliasKind;
  firstSeen: ISOTimestamp | null;
  sourceId: string | null;
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

export type PartyVersion = {
  id: number;
  partyId: string;
  validFrom: ISODate;
  validTo: ISODate | null;
  name: string;
  symbolId: string | null;
};

export const PARTY_LINEAGE_KINDS = [
  "split",
  "merge",
  "rename",
  "symbol_transfer",
  "derecognition",
] as const;
export type PartyLineageKind = (typeof PARTY_LINEAGE_KINDS)[number];

/** Without lineage edges a historical series is silently wrong, which is worse than absent (§12). */
export type PartyLineage = {
  fromPartyId: string;
  toPartyId: string;
  kind: PartyLineageKind;
  effectiveOn: ISODate;
  sourceId: string | null;
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

export type BoundaryEpoch = {
  /** 'delim-2008'. */
  id: string;
  name: string;
  effectiveFrom: ISODate;
  effectiveTo: ISODate | null;
  sourceId: string | null;
};

/** 'bl' is Sikkim's Bhutia-Lepcha reservation — 12 of its 32 seats, by statute. See migration 010. */
export const RESERVATIONS = ["general", "sc", "st", "bl"] as const;
export type Reservation = (typeof RESERVATIONS)[number];

export type PlaceVersion = {
  id: number;
  placeId: string;
  epochId: string;
  /** Constituency number in that epoch. */
  number: number | null;
  reservation: Reservation | null;
  /** Tile feature key; geometry lives in PMTiles, never in the registry. */
  geometryRef: string | null;
  electorsAtCreation: number | null;
};

export const CROSSWALK_METHODS = ["areal", "booth_reassignment", "official_order"] as const;
export type CrosswalkMethod = (typeof CROSSWALK_METHODS)[number];

/** How a seat that did not exist in 1999 gets an honest 1999 number. Every value derived through a
 *  crosswalk is an estimate and the UI must label it as one (§20 meta.estimated). */
export type PlaceCrosswalk = {
  fromPlaceVersionId: number;
  toPlaceVersionId: number;
  areaShare: number;
  populationShare: number | null;
  electorShare: number | null;
  method: CrosswalkMethod;
  sourceId: string | null;
};

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

export type Election = {
  /** 'ls-2024', 'wb-assembly-2026'. */
  id: string;
  kind: ElectionKind;
  level: ElectionLevel;
  electorateKind: ElectorateKind;
  jurisdictionPlaceId: string;
  epochId: string;
  name: string;
  lifecycle: ElectionLifecycle;
  announcedOn: ISODate | null;
  notifiedOn: ISODate | null;
  countingOn: ISODate | null;
  /** §6.10 compliance gate: the API suppresses forecast measures inside this window. */
  forecastGateFrom: ISOTimestamp | null;
  forecastGateTo: ISOTimestamp | null;
};

export type ElectionPhase = {
  electionId: string;
  n: number;
  pollDate: ISODate;
  seatCount: number | null;
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

export type AllianceVersion = {
  id: number;
  allianceId: string;
  validFrom: ISODate;
  validTo: ISODate | null;
};

// ─── affidavits ──────────────────────────────────────────────────────────────

export type Affidavit = {
  id: string;
  candidacyId: string;
  filedOn: ISODate | null;
  sourceId: string;
};

/** One extracted field with its page anchor — this is what makes asset growth a series and every
 *  number clickable back to the scan. */
export type AffidavitField = {
  affidavitId: string;
  /** 'assets.movable.total'. */
  path: string;
  valueNumeric: number | null;
  valueText: string | null;
  unit: string | null;
  pageNo: number | null;
  rect: Rect | null;
  parserVersion: string;
};

// ─── legal cases: P5 lives here ──────────────────────────────────────────────

/** P5 — charged is not convicted. A bare case count carries no stage, so it becomes 'unknown' and
 *  renders as "stage not established". 'convicted' additionally requires a source of kind
 *  'court_order' (§19 dbt test); a news article can never establish it. */
export const CASE_STAGES = [
  "fir",
  "charged",
  "trial",
  "convicted",
  "acquitted",
  "stayed",
  "unknown",
] as const;
export type CaseStage = (typeof CASE_STAGES)[number];

export type LegalCase = {
  id: string;
  personId: string;
  court: string | null;
  caseNo: string | null;
  /** JSON array in the column, and nullable there: a case count carries no sections at all. */
  sections: string[] | null;
  stage: CaseStage;
  filedOn: ISODate | null;
  lastHearingOn: ISODate | null;
  disposedOn: ISODate | null;
  sourceId: string;
};

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

export type RoundResult = {
  contestId: string;
  roundNo: number;
  candidacyId: string;
  votesCumulative: number;
  sourceId: string;
  observedAt: ISOTimestamp;
};

/** Form 20, booth level. */
export type BoothResult = {
  contestId: string;
  boothPlaceId: string;
  candidacyId: string;
  votes: number;
  sourceId: string;
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

// Does core/entities + core/citation still describe the tables the migrations actually create?
//
// Types are erased at runtime, so each entity contributes one Shape<T> literal to MAP below: TS
// forces it to name every property exactly once and to label it "req" or "null" exactly as the type
// does (write the wrong label and this file will not compile). The test then reads the live columns
// with PRAGMA table_info and compares. Two ways to go green: fix the type, or fix the label — and
// the label cannot lie, so it is always the type.
//
// Rules asserted, per §19 and the DDL header:
//   * NOT NULL column, or an INTEGER PRIMARY KEY (rowid alias, table_info reports notnull=0) -> req
//   * nullable column                                                                        -> null
//   * every column has a property, every property has a column
//   * CHECK (col IN ('a','b')) matches the type's const array exactly, both directions
// ponytail: NOT NULL WITH a default is also "req" — a read always yields a value, and these are
// read shapes. Split the rule only when a write shape (a POST body) needs the looser one.
// Tables absent from MAP are not checked; adding 004/005 cannot fail this test.

import test from "node:test";
import assert from "node:assert/strict";
import { all, get, open } from "../../db/index.ts";
import { migrate } from "../../db/migrate.ts";
import {
  BIRTH_YEAR_CONFIDENCES,
  CANDIDACY_STATUSES,
  CASE_STAGES,
  CROSSWALK_METHODS,
  ELECTION_KINDS,
  ELECTION_LEVELS,
  ELECTION_LIFECYCLES,
  ELECTORATE_KINDS,
  PARTY_KINDS,
  PARTY_LINEAGE_KINDS,
  PLACE_KINDS,
  RESERVATIONS,
  REVIEW_STATES,
  SEXES,
} from "./index.ts";
import type {
  Affidavit,
  AffidavitField,
  Alliance,
  AllianceVersion,
  BoothResult,
  BoundaryEpoch,
  Candidacy,
  Contest,
  Election,
  ElectionPhase,
  LegalCase,
  Party,
  PartyLineage,
  PartyVersion,
  Person,
  PersonAlias,
  Place,
  PlaceCrosswalk,
  PlaceVersion,
  Result,
  RoundResult,
  Symbol as SymbolRow,
  Turnout,
} from "./index.ts";
import { CONFIDENCES, HASH_KINDS, INGEST_RUN_STATUSES, RETRIEVAL_KINDS, SOURCE_KINDS } from "../citation/index.ts";
import type { Citation, Claim, Correction, IngestRun, Source } from "../citation/index.ts";

/** "req" for every property whose type rejects null, "null" for every one that admits it. `-?`
 *  makes optional properties mandatory here too, so an optional property must still be labelled and
 *  will be labelled "req" — i.e. `x?: string` cannot stand in for a nullable column. */
type Shape<T> = { [K in keyof T]-?: null extends T[K] ? "null" : "req" };

const MAP = {
  // ── 001_registry.sql ───────────────────────────────────────────────────────
  source: {
    id: "req",
    kind: "req",
    publisher: "null",
    title: "null",
    url: "null",
    archivedUrl: "null",
    retrievedAt: "req",
    publishedOn: "null",
    docHash: "req",
    hashKind: "req",
    retrievalKind: "req",
    pageCount: "null",
    licence: "null",
  } satisfies Shape<Source>,
  boundary_epoch: {
    id: "req",
    name: "req",
    effectiveFrom: "req",
    effectiveTo: "null",
    sourceId: "null",
  } satisfies Shape<BoundaryEpoch>,
  place: {
    id: "req",
    kind: "req",
    parentId: "null",
    canonicalName: "req",
    names: "req",
    lgdCode: "null",
    eciCode: "null",
  } satisfies Shape<Place>,
  place_version: {
    id: "req",
    placeId: "req",
    epochId: "req",
    number: "null",
    reservation: "null",
    geometryRef: "null",
    electorsAtCreation: "null",
  } satisfies Shape<PlaceVersion>,
  place_crosswalk: {
    fromPlaceVersionId: "req",
    toPlaceVersionId: "req",
    areaShare: "req",
    populationShare: "null",
    electorShare: "null",
    method: "req",
    sourceId: "null",
  } satisfies Shape<PlaceCrosswalk>,
  person: {
    id: "req",
    canonicalName: "req",
    canonicalNameScript: "null",
    names: "req",
    sex: "null",
    birthYear: "null",
    birthYearConfidence: "null",
    reviewState: "req",
    createdAt: "req",
  } satisfies Shape<Person>,
  person_alias: {
    personId: "req",
    name: "req",
    script: "req",
    normKey: "req",
    kind: "req",
    firstSeen: "null",
    sourceId: "null",
  } satisfies Shape<PersonAlias>,
  symbol: {
    id: "req",
    name: "req",
    names: "req",
    svgRef: "null",
    allotmentKind: "null",
    licensedFrom: "null",
  } satisfies Shape<SymbolRow>,
  party: {
    id: "req",
    name: "req",
    shortName: "req",
    names: "req",
    kind: "null",
    registeredOn: "null",
    dissolvedOn: "null",
  } satisfies Shape<Party>,
  party_version: {
    id: "req",
    partyId: "req",
    validFrom: "req",
    validTo: "null",
    name: "req",
    symbolId: "null",
  } satisfies Shape<PartyVersion>,
  party_lineage: {
    fromPartyId: "req",
    toPartyId: "req",
    kind: "req",
    effectiveOn: "req",
    sourceId: "null",
  } satisfies Shape<PartyLineage>,
  alliance: { id: "req", name: "req", names: "req" } satisfies Shape<Alliance>,
  alliance_version: {
    id: "req",
    allianceId: "req",
    validFrom: "req",
    validTo: "null",
  } satisfies Shape<AllianceVersion>,
  election: {
    id: "req",
    kind: "req",
    level: "req",
    electorateKind: "req",
    jurisdictionPlaceId: "req",
    epochId: "req",
    name: "req",
    lifecycle: "req",
    announcedOn: "null",
    notifiedOn: "null",
    countingOn: "null",
    forecastGateFrom: "null",
    forecastGateTo: "null",
  } satisfies Shape<Election>,
  election_phase: {
    electionId: "req",
    n: "req",
    pollDate: "req",
    seatCount: "null",
  } satisfies Shape<ElectionPhase>,
  contest: {
    id: "req",
    electionId: "req",
    placeVersionId: "req",
    phaseN: "null",
    seatsAvailable: "req",
    lifecycle: "req",
    declaredAt: "null",
  } satisfies Shape<Contest>,
  candidacy: {
    id: "req",
    contestId: "req",
    personId: "req",
    partyVersionId: "null",
    allianceVersionId: "null",
    symbolId: "null",
    serialNo: "null",
    status: "req",
    ageDeclared: "null",
    educationDeclared: "null",
    partyRaw: "null",
  } satisfies Shape<Candidacy>,
  affidavit: {
    id: "req",
    candidacyId: "req",
    filedOn: "null",
    sourceId: "req",
  } satisfies Shape<Affidavit>,
  affidavit_field: {
    affidavitId: "req",
    path: "req",
    valueNumeric: "null",
    valueText: "null",
    unit: "null",
    pageNo: "null",
    rect: "null",
    parserVersion: "req",
  } satisfies Shape<AffidavitField>,
  legal_case: {
    id: "req",
    personId: "req",
    court: "null",
    caseNo: "null",
    sections: "null",
    stage: "req",
    filedOn: "null",
    lastHearingOn: "null",
    disposedOn: "null",
    sourceId: "req",
  } satisfies Shape<LegalCase>,
  // ── 002_facts.sql ──────────────────────────────────────────────────────────
  result: {
    contestId: "req",
    candidacyId: "req",
    revision: "req",
    votes: "req",
    postalVotes: "null",
    evmVotes: "null",
    voteShare: "null",
    rank: "null",
    isWinner: "req",
    margin: "null",
    sourceId: "req",
    ingestedAt: "req",
  } satisfies Shape<Result>,
  round_result: {
    contestId: "req",
    roundNo: "req",
    candidacyId: "req",
    votesCumulative: "req",
    sourceId: "req",
    observedAt: "req",
  } satisfies Shape<RoundResult>,
  booth_result: {
    contestId: "req",
    boothPlaceId: "req",
    candidacyId: "req",
    votes: "req",
    sourceId: "req",
  } satisfies Shape<BoothResult>,
  turnout: {
    contestId: "req",
    scope: "req",
    electors: "null",
    voters: "null",
    male: "null",
    female: "null",
    thirdGender: "null",
    postal: "null",
    nota: "null",
    sourceId: "req",
  } satisfies Shape<Turnout>,
  // ── 003_provenance.sql ─────────────────────────────────────────────────────
  claim: {
    id: "req",
    subjectRef: "req",
    predicate: "req",
    objectValue: "req",
    unit: "null",
    asOf: "null",
    confidence: "req",
    contentKey: "null",
  } satisfies Shape<Claim>,
  citation: {
    claimId: "req",
    sourceId: "req",
    pageNo: "req",
    rect: "null",
    parserVersion: "req",
    extractedAt: "req",
  } satisfies Shape<Citation>,
  ingest_run: {
    id: "req",
    pipeline: "req",
    parserVersion: "req",
    startedAt: "req",
    finishedAt: "null",
    rowsIn: "null",
    rowsOut: "null",
    anomalies: "req",
    status: "req",
  } satisfies Shape<IngestRun>,
  correction: {
    id: "req",
    entityRef: "req",
    field: "req",
    oldValue: "null",
    newValue: "null",
    reason: "req",
    sourceId: "null",
    correctedAt: "req",
    publicSlug: "req",
  } satisfies Shape<Correction>,
};

/** The CHECK'd columns of the mapped tables. A missing entry means "the column has no CHECK". */
const VOCAB: Record<string, readonly string[]> = {
  "source.kind": SOURCE_KINDS,
  "source.hash_kind": HASH_KINDS,
  "source.retrieval_kind": RETRIEVAL_KINDS,
  "place.kind": PLACE_KINDS,
  "place_version.reservation": RESERVATIONS,
  "place_crosswalk.method": CROSSWALK_METHODS,
  "person.sex": SEXES,
  "person.birth_year_confidence": BIRTH_YEAR_CONFIDENCES,
  "person.review_state": REVIEW_STATES,
  "party.kind": PARTY_KINDS,
  "party_lineage.kind": PARTY_LINEAGE_KINDS,
  "election.kind": ELECTION_KINDS,
  "election.level": ELECTION_LEVELS,
  "election.electorate_kind": ELECTORATE_KINDS,
  "election.lifecycle": ELECTION_LIFECYCLES,
  "contest.lifecycle": ELECTION_LIFECYCLES,
  "candidacy.status": CANDIDACY_STATUSES,
  "legal_case.stage": CASE_STAGES,
  "claim.confidence": CONFIDENCES,
  "ingest_run.status": INGEST_RUN_STATUSES,
};

type Col = { name: string; notnull: number; pk: number };

const snake = (prop: string): string => prop.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const camel = (col: string): string => col.replace(/_(.)/g, (_, c: string) => c.toUpperCase());

/** The quoted literals of `CHECK (<column> IN (...))`, or [] when there is no such CHECK.
 *  ponytail: only quoted lists — result.is_winner's CHECK (is_winner IN (0,1)) has no strings to
 *  compare and is covered by typing isWinner as 0 | 1. */
function checkedValues(sql: string, column: string): string[] {
  const body = new RegExp(`CHECK\\s*\\(\\s*${column}\\s+IN\\s*\\(([^)]*)\\)`).exec(sql)?.[1] ?? "";
  return [...body.matchAll(/'([^']*)'/g)].map((m) => String(m[1]));
}

const db = open(":memory:");
migrate(db, "2026-08-07T00:00:00.000Z"); // globs ops/migrations/*.sql; 004+ arrive for free

for (const [table, shape] of Object.entries(MAP)) {
  test(`${table} matches its DDL`, () => {
    const cols = all<Col>(db, `PRAGMA table_info(${table})`);
    assert.ok(cols.length > 0, `no table '${table}' — MAP names a table no migration creates`);
    // `--` comments are kept verbatim in sqlite_master.sql and contain apostrophes ("cycle 1's"),
    // which would otherwise be read as CHECK literals.
    const ddl = String(get<{ sql: string }>(db, "SELECT sql FROM sqlite_master WHERE name = ?", table)?.sql).replace(
      /--[^\n]*/g,
      "",
    );

    const props = new Map(Object.entries(shape).map(([prop, want]) => [snake(prop), { prop, want }]));
    const drift: string[] = [];

    for (const col of cols) {
      // An INTEGER PRIMARY KEY is a rowid alias: table_info says notnull=0, SQLite never returns
      // NULL for it, and Postgres has it as bigserial NOT NULL.
      const want = col.notnull === 1 || col.pk > 0 ? "req" : "null";
      const p = props.get(col.name);
      if (p === undefined) {
        drift.push(`${table}.${col.name} (${want}) has no property — add \`${camel(col.name)}\``);
      } else if (p.want !== want) {
        drift.push(
          `${table}.${col.name} is ${want} in the DDL but \`${p.prop}\` is ${p.want}` +
            (want === "null" ? " — union it with null" : " — drop the null"),
        );
      }
      const vocab = VOCAB[`${table}.${col.name}`];
      if (vocab !== undefined) {
        const ddlValues = checkedValues(ddl, col.name);
        const missing = ddlValues.filter((v) => !vocab.includes(v));
        const extra = vocab.filter((v) => !ddlValues.includes(v));
        if (missing.length > 0 || extra.length > 0) {
          drift.push(
            `${table}.${col.name} CHECK vocabulary: type is missing [${missing.join(", ")}],` +
              ` type has extra [${extra.join(", ")}]`,
          );
        }
      }
    }

    for (const [col, p] of props) {
      if (!cols.some((c) => c.name === col)) {
        drift.push(`property \`${p.prop}\` has no column ${table}.${col} — delete it`);
      }
    }

    assert.deepEqual(drift, [], `\n  ${drift.join("\n  ")}\n`);
  });
}

test("the map covers a table it does not own without failing", () => {
  // person_merge, person_identifier, alliance_member, source_page and schema_migration are real
  // tables with no type. That is allowed: the loop above only walks MAP.
  assert.ok(all<Col>(db, "PRAGMA table_info(person_merge)").length > 0);
  assert.equal(Object.keys(MAP).includes("person_merge"), false);
});

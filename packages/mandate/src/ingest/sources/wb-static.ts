// Ingest: the eight committed seed files in data/seed/ -> the registry, with real provenance.
//
// The seed files are the only inputs that exist yet. They are not placeholders: each one is a file
// with bytes we can sha256 and a dated entry in data/seed/provenance.json, so a `source` row built
// from one is as honest as a scraped PDF — it just has no page anchors yet. Cycle 4 moved them out
// of src/data/*.ts: the app now reads the same seed, so nothing here imports from src/.
//
// Two rules this file exists to keep:
//   P2 — every affidavit field, every declared value and every demographic figure lands as a
//        claim + citation pointing at the source that actually says it. Never a placeholder id.
//   P5 — candidates.criminalCases is a bare COUNT. It produces ZERO legal_case rows. See §P5 below.
//
// Idempotent by construction: every id is content- or key-derived and every write is an upsert on
// the table's own key, so `runIngest` twice over the same bytes leaves the same row counts.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { DatabaseSync } from "node:sqlite";

import type { Anomaly } from "../../core/citation/index.ts";
import { blockingKeys, detectScript } from "../../core/indic/index.ts";
import { candidacyId, contentId, contestId, slug } from "../../core/ids.ts";
// One table for both directions of the district name disagreement; a leaf module, because
// defining it here and importing it in the exporter made a cycle that left it undefined.
import { DISTRICT_ALIAS } from "../districts.ts";
// India's 36 jurisdictions as reference data. Written so the place tree is national in fact and
// not only in shape: "1 of 36 states" was a hardcoded denominator with nothing behind it.
import { JURISDICTIONS } from "../india.ts";
import { all, insertMany, type Param } from "../../db/index.ts";
import { coverageFailures, fieldCoverage, formatCoverage, seedShapeFailures, type CoverageRow } from "../field-coverage.ts";

const PARSER_VERSION = "wb-static@1";
const EPOCH_ID = "delim-2008";
// The Presidential order under s.10(2) of the Delimitation Act 2002 brought the redrawn
// constituencies into force on this date; WB first polled on them in 2011. Every seat in these
// datasets is a post-2008 seat, so this is the only epoch cycle 1 can honestly assert — there is
// no 1976 boundary data in the repo and inventing an epoch is worse than having one.
const EPOCH_FROM = "2008-02-19";
const STATE_PLACE = "wb";
/** India. The registry had no `nation` row: `wb` was a root with no parent, which made "national
 *  platform" true of the DDL and false of the data. A Lok Sabha election's jurisdiction is the union,
 *  so it needs somewhere to point. */
const NATION_PLACE = "in";
/** place_version.id is the seat NUMBER, unique only within one kind and one epoch (see the note by the
 *  assembly rows). Parliamentary constituencies are numbered 1-42 in this state and would collide head
 *  on with assembly seats 1-42, so they are offset. A second epoch needs the same treatment. */
const PC_VERSION_OFFSET = 1000;
const LS_ELECTION = "ls-2024";
/** District outlines need a place_version to hang off and districts are not delimitation-versioned
 *  here, so they get synthetic ids clear of AC numbers (1-294) and the PC offset (1001-1042). */
const DISTRICT_VERSION_OFFSET = 2000;

const YEARS = [2011, 2016, 2021, 2026];
/** The one open-ended party version this dataset can honestly assert; also its natural key. */
const PARTY_VALID_FROM = "2011-01-01";

// ─── the shapes we actually read (src/data types live behind the Next-only "@/types" alias) ──

type ConstituencyRow = {
  id: string;
  assemblyNumber: number;
  name: string;
  nameBn?: string;
  district: string;
  districtBn?: string;
  reservation: string;
};
type PartyRow = {
  id: string;
  name: string;
  nameBn?: string;
  abbreviation: string;
  isNational?: boolean;
  /** P3's identity system: half of parties.json carries one. */
  symbolUrl?: string;
};
type CandidateRow = {
  id: string;
  name: string;
  nameBn?: string;
  partyId: string;
  constituencyId: string;
  age?: number | null;
  gender?: string;
  education?: string;
  criminalCases: number;
  totalAssets?: number | null;
  totalLiabilities?: number | null;
  movableAssets?: number | null;
  immovableAssets?: number | null;
  affidavitUrl?: string;
  occupation?: string;
  isIncumbent?: boolean;
  /** myneta's own photo of the candidate, one distinct URL per candidate row. */
  photoUrl?: string;
  /** Years already served, declared only by the 157 rows whose isIncumbent is true. */
  incumbentYears?: number | null;
};
type ContestantRow = {
  name: string;
  partyId: string;
  partyAbbr?: string;
  votes: number;
  voteShare?: number | null;
};
type HistoricalRow = {
  constituencyId: string;
  year: number;
  winner: ContestantRow;
  runnerUp?: ContestantRow | null;
  topContestants?: ContestantRow[];
  turnoutPct?: number | null;
  marginVotes?: number | null;
  totalVotes?: number | null;
  totalElectors?: number | null;
};
type MLARow = {
  constituencyId: string;
  name: string;
  partyId: string;
  term: string;
  marginVotes?: number | null;
  voteShare?: number | null;
  /** candidates.json id of this MLA's own nomination. The exact disambiguator when a seat fields
   *  two nominations with the same name — used to join the declared win onto the right candidacy. */
  candidateId?: string | null;
  sourceUrl: string;
};
type DemographicsRow = {
  constituencyId: string;
  population?: number | null;
  literacyRate?: number | null;
  sexRatio?: number | null;
  scPct?: number | null;
  stPct?: number | null;
  urbanPct?: number | null;
  sourceYear: number;
  sourceNote?: string;
};
type CabinetRow = {
  name: string;
  partyId: string;
  constituencyId?: string;
  portfolios: { ministry: string; rank?: string; from?: string }[];
  sourceUrl: string;
};
/** A rendered outline. `path` is SVG path data in the projected space `centroid` shares; no CRS was
 *  recorded upstream, so none is claimed here. */
type AcPathRow = { id: string; acNo: number; path: string; centroid: { x: number; y: number } };
type DistrictPathRow = { name: string; path: string; centroid: { x: number; y: number } };

type MPRow = {
  name: string;
  partyId: string;
  lsConstituency: string;
  /** The state's own PC numbering, 1-42 here. Present on all 42 seed rows and simply never read until
   *  now, which is why `mandate export --diff` reported lsNumber as "not reconstructable": the field
   *  was not unstorable, the ingest's own row type did not declare it. */
  lsNumber?: number | null;
  margin?: number | null;
  electedOn?: string;
  sourceUrl: string;
};

// ─── module provenance ───────────────────────────────────────────────────────

export const MODULE_KEYS = [
  "constituencies",
  "parties",
  "candidates",
  "historicalResults",
  "currentMLAs",
  "demographics",
  "cabinet",
  "mps",
  // DISTRICT outlines. The constituency module that used to sit beside this one left the seed in Phase 3's
  // closure: the registry holds published constituency geometry now, from a hashed and licensed source in
  // the product's shared projection, so a repo module in a West Bengal-only frame had nothing left to add.
  // These 19 remain because nothing replaces them, and nothing reads them either — a district frames itself
  // from its own constituencies now. They are the only rows in the legacy projection and PHASE-3-FINAL.md
  // says so.
  "districtPaths",
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

const MODULE_FILES: Record<ModuleKey, string> = {
  constituencies: "constituencies.json",
  parties: "parties.json",
  candidates: "candidates.json",
  historicalResults: "historical-results.json",
  currentMLAs: "current-mla.json",
  demographics: "demographics.json",
  cabinet: "cabinet.json",
  mps: "wbmps.json",
  districtPaths: "wb-districts.json",
};

/** `retrievedOn` is null when data/seed/provenance.json has no entry for the file — that becomes
 *  an anomaly, not a guess. `docHash` is the sha256 of the bytes on disk: change the file, get
 *  a new source row. */
export type ModuleDoc = { file: string; retrievedOn: string | null; docHash: string };

export type StaticBundle = {
  docs: Record<ModuleKey, ModuleDoc>;
  constituencies: readonly ConstituencyRow[];
  parties: readonly PartyRow[];
  candidates: readonly CandidateRow[];
  historicalResults: readonly HistoricalRow[];
  currentMLAs: readonly MLARow[];
  demographics: readonly DemographicsRow[];
  cabinet: readonly CabinetRow[];
  mps: readonly MPRow[];
  districtPaths: readonly DistrictPathRow[];
};

const DATA_DIR = fileURLToPath(new URL("../../../../../data/seed/", import.meta.url));

/** Retrieval dates used to live in each module's line-1 header comment. JSON has no comments, so
 *  they moved with the data into data/seed/provenance.json — one flat `file -> YYYY-MM-DD` map.
 *  A file with no entry has no date, exactly as a header with no date had none, and still becomes
 *  a `no_header_date` anomaly rather than a guess. */
function provenance(dir: string): Record<string, string> {
  const path = dir + "provenance.json";
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (cause) {
    // ponytail: a MISSING provenance file dates every module to the run clock and says so via the
    // per-module no_header_date anomaly. Upgrade to a hard failure if the seed ever ships without it.
    if ((cause as { code?: string }).code === "ENOENT") return {};
    throw cause;
  }
  // A MALFORMED file is not the same case: swallowing a SyntaxError voided all seven retrieval dates
  // at once and stamped source.retrieved_at with the run clock, i.e. reported a guess as a fact.
  try {
    return JSON.parse(text) as Record<string, string>;
  } catch (cause) {
    throw new Error(`${path} is not valid JSON: ${(cause as Error).message}`);
  }
}

/** `docHash` is the sha256 of the bytes on disk: change the seed file, get a new source row. */
export function readModuleDoc(file: string, dir: string = DATA_DIR): ModuleDoc {
  return {
    file,
    retrievedOn: provenance(dir)[file] ?? null,
    docHash: createHash("sha256").update(readFileSync(dir + file)).digest("hex"),
  };
}

/** The real bundle. Reads the eight seed files: hash the bytes, parse the rows, once each. Nothing
 *  here imports from src/ — the app's typed modules are now consumers of this same seed, not the
 *  registry's source of truth. */
export async function loadStaticBundle(dir: string = DATA_DIR): Promise<StaticBundle> {
  const prov = provenance(dir);
  const rows: Record<string, unknown> = {};
  const docs = Object.fromEntries(
    MODULE_KEYS.map((k) => {
      const file = MODULE_FILES[k];
      const bytes = readFileSync(dir + file);
      rows[k] = JSON.parse(bytes.toString("utf8"));
      return [
        k,
        {
          file,
          retrievedOn: prov[file] ?? null,
          docHash: createHash("sha256").update(bytes).digest("hex"),
        },
      ];
    }),
  ) as Record<ModuleKey, ModuleDoc>;
  return {
    docs,
    constituencies: rows.constituencies as readonly ConstituencyRow[],
    parties: rows.parties as readonly PartyRow[],
    candidates: rows.candidates as readonly CandidateRow[],
    historicalResults: rows.historicalResults as readonly HistoricalRow[],
    currentMLAs: rows.currentMLAs as readonly MLARow[],
    demographics: rows.demographics as readonly DemographicsRow[],
    cabinet: rows.cabinet as readonly CabinetRow[],
    mps: rows.mps as readonly MPRow[],
    districtPaths: rows.districtPaths as readonly DistrictPathRow[],
  };
}

// ─── report ──────────────────────────────────────────────────────────────────

export type IngestReport = {
  sources: number;
  places: number;
  persons: number;
  parties: number;
  /** The declared party labels that matched no row in parties.json by id, abbreviation or name. */
  unmatchedPartyStrings: string[];
  elections: number;
  contests: number;
  candidacies: number;
  results: number;
  claims: number;
  citations: number;
  /** P2's number: rendered values with no citation behind them. Must be 0. */
  uncitedValues: number;
  /** Input field set vs registry field set, one row per field of all eight modules. Empty when a
   *  test fixture was supplied: a fixture is a deliberate subset of the seed's fields. */
  coverage: CoverageRow[];
  durationMs: number;
  anomalies: Anomaly[];
};

export type IngestOptions = {
  nowIso: string;
  /** Omitted in production (the eight modules are loaded from disk); a small fixture in tests. */
  bundle?: StaticBundle;
  /** Injected so a test can make durationMs reproducible. */
  monotonicMs?: () => number;
};

// ─── helpers ─────────────────────────────────────────────────────────────────

/** `INSERT ... ON CONFLICT (key) DO UPDATE SET <every non-key column>`. One generator instead of
 *  twenty hand-written statements that drift from the DDL. */
function upsert(table: string, cols: readonly string[], key: readonly string[]): string {
  const set = cols.filter((c) => !key.includes(c)).map((c) => `${c}=excluded.${c}`);
  return (
    `INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})` +
    ` ON CONFLICT (${key.join(",")}) DO ${set.length ? `UPDATE SET ${set.join(",")}` : "NOTHING"}`
  );
}

const acPlaceId = (n: number): string => `${STATE_PLACE}.ac.${String(n).padStart(3, "0")}`;
/** Seat slug for a contest id. The number is always appended because WB has two Bishnupurs. */
const seatSlug = (name: string, n: number): string => `${slug(name)}-${String(n).padStart(3, "0")}`;
const electionId = (year: number): string => `wb-assembly-${year}`;
const jsonNames = (bn: string | undefined, latin: string): string =>
  bn && bn !== latin ? JSON.stringify({ bn }) : "{}";

// ─── the ingest ──────────────────────────────────────────────────────────────

export async function runIngest(db: DatabaseSync, opts: IngestOptions): Promise<IngestReport> {
  const b = opts.bundle ?? (await loadStaticBundle());
  // The field-coverage gate compares the SEED's field set to the registry's, so it only means
  // anything for the seed. A test fixture is a deliberate subset — six candidates with no photoUrl
  // is not a dropped field, so the gate would be measuring the fixture, not the pipeline.
  const checkCoverage = opts.bundle === undefined;
  const runId = Number(
    db
      .prepare(
        "INSERT INTO ingest_run (pipeline, parser_version, started_at, rows_in, rows_out, anomalies, status)" +
          " VALUES (?,?,?,0,0,'[]','running')",
      )
      .run("static:wb-static", PARSER_VERSION, opts.nowIso).lastInsertRowid,
  );
  try {
    return ingest(db, b, opts, runId, checkCoverage);
  } catch (cause) {
    // The failure path the DDL's status='failed' exists for. Without it a crashed run stays
    // 'running' with finished_at NULL forever and is indistinguishable from one in flight.
    const detail = (cause as Error).message.split("\n")[0] ?? String(cause);
    // Only the first line is persisted (it is the one-line summary every failure starts with), but
    // the rest — the field-coverage table, for instance — is what the operator needs to see, so it
    // rides along in the message the CLI prints.
    const rest = (cause as Error).message.split("\n").slice(1).join("\n");
    db.prepare(
      "UPDATE ingest_run SET finished_at=?, anomalies=?, status='failed' WHERE id=?",
    ).run(
      opts.nowIso,
      JSON.stringify([{ kind: "ingest_failed", ref: `ingest_run:${runId}`, detail }]),
      runId,
    );
    throw new Error(
      `ingest run ${runId} stopped on a write and is recorded as status='failed': ${detail}. ` +
        `Tables written before the failure are committed and every write is an idempotent upsert, ` +
        `so correct the offending row in data/seed/ and re-run \`mandate ingest\`; ` +
        `\`mandate ingest --fresh\` rebuilds from an empty database.` +
        (rest === "" ? "" : `\n${rest}`),
      { cause },
    );
  }
}

function ingest(
  db: DatabaseSync,
  b: StaticBundle,
  opts: IngestOptions,
  runId: number,
  checkCoverage: boolean,
): IngestReport {
  const now = opts.nowIso;
  const clock = opts.monotonicMs ?? (() => performance.now());
  const startedMs = clock();
  const anomalies: Anomaly[] = [];

  // ── sources ────────────────────────────────────────────────────────────────
  const sourceRows = new Map<string, Param[]>();
  function addSource(s: {
    kind: string;
    publisher: string | null;
    title: string;
    url: string | null;
    retrievedAt: string;
    publishedOn: string | null;
    docHash: string;
    licence: string | null;
    /** 'document_bytes' only when we have actually hashed the document. */
    hashKind: "document_bytes" | "url_only";
    /** 'fetched' only when this process read the bytes. Never a claim about someone else. */
    retrievalKind: "fetched" | "asserted_by_upstream";
  }): string {
    const id = contentId([s.kind, s.url ?? "", s.docHash]);
    if (!sourceRows.has(id)) {
      sourceRows.set(id, [
        id,
        s.kind,
        s.publisher,
        s.title,
        s.url,
        null,
        s.retrievedAt,
        s.publishedOn,
        s.docHash,
        null,
        s.licence,
        s.hashKind,
        s.retrievalKind,
      ]);
    }
    return id;
  }

  /** A document we know the locator of but have never fetched the bytes of. The `unfetched:`
   *  prefix is greppable on purpose: it is the backlog of things to archive, and it can never be
   *  mistaken for a real content hash. source.hash_kind = 'url_only' is the queryable form. */
  const unfetched = (url: string): string => `unfetched:${contentId([url])}`;

  const moduleDate = (k: ModuleKey): string => {
    const d = b.docs[k].retrievedOn;
    if (d) return d;
    anomalies.push({
      kind: "no_header_date",
      ref: `module:${k}`,
      detail: `${b.docs[k].file} has no entry in data/seed/provenance.json; retrieved_at falls back to the run clock`,
    });
    return now.slice(0, 10);
  };
  const stamp = (day: string): string => `${day}T00:00:00Z`;

  // Kind per module is what the module actually is, not a blanket label: the candidate file is a
  // MyNeta affidavit scrape, the results file is ECI declarations laundered through Lokdhaba, the
  // demographics file is Census 2011. The three hand-curated files carry per-row upstream URLs, so
  // the module row is only the artefact we hashed — the URL rows below are their real provenance.
  const MODULE_META: Record<
    ModuleKey,
    { kind: string; publisher: string | null; title: string; licence: string | null }
  > = {
    constituencies: {
      kind: "static_module",
      publisher: "myneta.info / ADR",
      title: "WB 2026 assembly constituency list (repo module)",
      licence: null,
    },
    parties: {
      kind: "static_module",
      publisher: "wb-votes",
      title: "WB 2026 contesting party register (repo module)",
      licence: null,
    },
    candidates: {
      kind: "affidavit",
      publisher: "myneta.info / ADR",
      title: "MyNeta WestBengal2026 candidate affidavit extract",
      licence: null,
    },
    historicalResults: {
      kind: "eci_declaration",
      publisher: "ECI, via Lokdhaba (TCPD) and IndiaVotes",
      title: "WB assembly results 2011/2016/2021/2026",
      licence: null,
    },
    currentMLAs: {
      kind: "static_module",
      publisher: "wb-votes",
      title: "Sitting WB MLAs, current term (repo module)",
      licence: null,
    },
    demographics: {
      kind: "census",
      publisher: "Census of India",
      title: "WB constituency demographics (district-level Census 2011 proxy)",
      licence: null,
    },
    cabinet: {
      kind: "static_module",
      publisher: "wb-votes",
      title: "WB Council of Ministers, 2026 term (repo module)",
      licence: null,
    },
    mps: {
      kind: "static_module",
      publisher: "wb-votes",
      title: "West Bengal Lok Sabha MPs, 2024 (repo module)",
      licence: null,
    },
    districtPaths: {
      kind: "static_module",
      publisher: null,
      title: "WB district outlines, projected SVG (repo module)",
      licence: null,
    },
  };

  const moduleSource: Record<string, string> = {};
  for (const k of MODULE_KEYS) {
    const meta = MODULE_META[k];
    const day = moduleDate(k);
    moduleSource[k] = addSource({
      kind: meta.kind,
      publisher: meta.publisher,
      title: meta.title,
      url: `repo:data/seed/${b.docs[k].file}`,
      retrievedAt: stamp(day),
      // The census file's vintage is the census year, not the day we generated the file.
      publishedOn: k === "demographics" ? `${b.demographics[0]?.sourceYear ?? 2011}-01-01` : day,
      docHash: b.docs[k].docHash,
      licence: meta.licence,
      // The eight modules are the only documents in this pipeline we really do hold: readModuleDoc
      // sha256s the bytes on disk, so both columns are true here and nowhere else.
      hashKind: "document_bytes",
      retrievalKind: "fetched",
    });
  }
  const src = (k: ModuleKey): string => moduleSource[k] as string;

  /** URLs whose path is the bare site root: a citation that cannot support anything specific. */
  const siteRootUrls = new Set<string>();

  /** Every distinct per-row sourceUrl in the three curated modules becomes its own source: that
   *  URL, not our file, is what the fact actually rests on. `sourceUrl` is unvalidated input from
   *  a hand-curated file — a trust boundary. One malformed value used to abort the whole run
   *  inside `new URL()`; it is now recorded as an anomaly like every other bad input, and the
   *  fact falls back to citing the module we did hash. */
  function urlSource(url: string, retrievedOn: string, fallback: ModuleKey, ref: string): string {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      anomalies.push({
        kind: "invalid_source_url",
        ref,
        detail: `sourceUrl ${JSON.stringify(url)} is not a URL; the fact now cites ${MODULE_FILES[fallback]}, the seed file whose bytes we hashed. Fix the URL in data/seed/${MODULE_FILES[fallback]}.`,
      });
      return src(fallback);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      anomalies.push({
        kind: "invalid_source_url",
        ref,
        detail: `sourceUrl ${JSON.stringify(url)} is not http(s); the fact now cites ${MODULE_FILES[fallback]}. Fix the URL in data/seed/${MODULE_FILES[fallback]}.`,
      });
      return src(fallback);
    }
    if (parsed.pathname === "/" && parsed.search === "") siteRootUrls.add(url);
    const wiki = parsed.hostname.endsWith("wikipedia.org");
    return addSource({
      kind: "press",
      publisher: wiki ? "Wikipedia" : parsed.hostname,
      title: url,
      url,
      // The day the LOCATOR was seen in the module, not the day the document was retrieved: we
      // have never opened it. retrieval_kind says so.
      retrievedAt: stamp(retrievedOn),
      publishedOn: null,
      docHash: unfetched(url),
      licence: wiki ? "CC-BY-SA-4.0" : null,
      hashKind: "url_only",
      retrievalKind: "asserted_by_upstream",
    });
  }

  // ── row accumulators ───────────────────────────────────────────────────────
  const placeRows: Param[][] = [];
  const placeVersionRows: Param[][] = [];
  const placeGeometryRows: Param[][] = [];
  const symbolRows: Param[][] = [];
  const partyRows: Param[][] = [];
  const partyVersionRows: Param[][] = [];
  const electionRows: Param[][] = [];
  const contestRows: Param[][] = [];
  const personRows: Param[][] = [];
  const aliasRows: Param[][] = [];
  const identifierRows: Param[][] = [];
  /** Keyed, not a list: the declared-winner upgrade edits the nomination row it joined onto. A
   *  second row for the same id would UPDATE every column from a partial row and wipe the
   *  affidavit-declared age and education off every declared winner. */
  const candidacyRows = new Map<string, Param[]>();
  const affidavitRows: Param[][] = [];
  const affidavitFieldRows: Param[][] = [];
  const resultRows: Param[][] = [];
  const turnoutRows: Param[][] = [];

  /** `INSERT ... ON CONFLICT DO UPDATE` for one table. Defined here because party rows are
   *  written mid-build: candidacy needs the party_version ids the database assigns. */
  const w = (table: string, cols: readonly string[], key: readonly string[], rows: readonly Param[][]): number =>
    rows.length === 0 ? 0 : insertMany(db, upsert(table, cols, key), rows);

  // Every citation this pipeline writes anchors at page_no 0 ("the whole document") with a null
  // rect: we hold module bytes and affidavit URLs, never a page. A value whose citation cannot
  // point at a page has not been checked against one, so it is 'provisional'. A citation that
  // overstates its own strength is the failure this product exists to eliminate.
  // ponytail: a constant, not a page_no parameter — there is exactly one anchor strength in this
  // pipeline. Make confidence a function of page_no the moment a parser emits a real one.
  const CITED_PAGE_NO = 0;
  const CLAIM_CONFIDENCE = "provisional";

  type ClaimAcc = {
    subject: string;
    predicate: string;
    value: string;
    unit: string | null;
    asOf: string | null;
    sourceId: string;
  };
  /** Keyed by content_key: a claim id is a function of WHAT IS CLAIMED — subject, predicate,
   *  as_of, unit — never of the row's position in this run. Cycle 1 used `++claimSeq`, so a
   *  changed input rewrote claim N to a different fact while run N-1's citation row survived and
   *  the registry asserted that a document supported a value it does not contain. */
  const claims = new Map<string, ClaimAcc>();
  function claim(
    subjectRef: string,
    predicate: string,
    objectValue: unknown,
    unit: string | null,
    asOf: string | null,
    sourceId: string,
  ): void {
    const key = contentId([subjectRef, predicate, asOf ?? "", unit ?? ""]);
    const value = JSON.stringify(objectValue);
    const prev = claims.get(key);
    if (prev !== undefined && (prev.value !== value || prev.sourceId !== sourceId)) {
      anomalies.push({
        kind: "claim_key_collision",
        ref: `${subjectRef}#${predicate}`,
        detail: `two different facts share (subject, predicate, as_of, unit): ${prev.value} and ${value}. The first is kept; the predicate has to name what distinguishes them.`,
      });
      return;
    }
    claims.set(key, { subject: subjectRef, predicate, value, unit, asOf, sourceId });
  }

  // ── boundary epoch, places, place versions ─────────────────────────────────
  // A nation, and a state that hangs off it. `place.kind` has permitted 'nation' and 'pc' since 001 —
  // the DDL was national from the start and nothing had ever exercised it.
  placeRows.push([NATION_PLACE, "nation", null, "India", '{"hi":"भारत"}', null, null]);
  // All 36 jurisdictions, not just the one with data. A state with no results is still a real place and
  // an honest denominator; loading only West Bengal is what made "1 of 36" unverifiable. lgd_code is the
  // key every Indian government dataset joins on, so it is stored now rather than backfilled later.
  for (const j of JURISDICTIONS) {
    const names = j.id === STATE_PLACE ? '{"bn":"পশ্চিমবঙ্গ"}' : "{}";
    placeRows.push([j.id, j.kind, NATION_PLACE, j.name, names, j.lgd, null]);
  }
  const districtPlace = new Map<string, string>();
  for (const c of b.constituencies) {
    const dId = `${STATE_PLACE}.${slug(c.district)}`;
    if (!districtPlace.has(dId)) {
      districtPlace.set(dId, c.district);
      placeRows.push([
        dId,
        "district",
        STATE_PLACE,
        c.district,
        jsonNames(c.districtBn, c.district),
        null,
        null,
      ]);
    }
    const acId = acPlaceId(c.assemblyNumber);
    placeRows.push([
      acId,
      "ac",
      dId,
      c.name,
      jsonNames(c.nameBn, c.name),
      null,
      String(c.assemblyNumber),
    ]);
    // ponytail: place_version.id = the assembly number, unique inside delim-2008. A second epoch
    // needs an offset (or the UNIQUE (place_id, epoch_id) lookup) — add it with the epoch.
    // The seat NAME lives here, on the version, not on the place: a place is keyed by seat number and a
    // seat number means nothing across delimitations (migration 011). The seed describes only delim-2008,
    // but writing the name at the right level is what stops a second epoch inheriting this one's.
    placeVersionRows.push([
      c.assemblyNumber,
      acId,
      STATE_PLACE,
      "ac",
      EPOCH_ID,
      c.assemblyNumber,
      c.name,
      dId,
      c.reservation.toLowerCase(),
      // geometry_ref points at place_geometry's key, which is this version id. Null here for 336 rows
      // is what hid 294 outlines in the seed for eight cycles.
      String(c.assemblyNumber),
      null,
      null,
      src("constituencies"),
      0,
      "[]",
    ]);
  }

  // ── parties: resolve the declared label, never drop the candidacy ──────────
  // parties.json keys are inconsistent in the candidate data — sometimes the id ("SUCI"), sometimes
  // the full name ("ALL INDIA FORWARD BLOC"), sometimes the abbreviation. Try all three, case
  // -insensitively (a superset of the spec's "case-insensitive name" that can only match more).
  const byId = new Map<string, string>();
  const byAbbr = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const p of b.parties) {
    byId.set(p.id.toUpperCase(), p.id);
    if (!byAbbr.has(p.abbreviation.toUpperCase())) byAbbr.set(p.abbreviation.toUpperCase(), p.id);
    if (!byName.has(p.name.toUpperCase())) byName.set(p.name.toUpperCase(), p.id);
  }
  const known = (raw: string | null | undefined): string | null => {
    if (!raw) return null;
    const k = raw.trim().toUpperCase();
    return byId.get(k) ?? byAbbr.get(k) ?? byName.get(k) ?? null;
  };

  /** → { id, raw }: `raw` is non-null exactly when the label resolved to nothing in parties.json,
   *  which is what candidacy.party_raw exists to record. Pure — the counting is the loop below. */
  const resolveParty = (
    ...labels: (string | null | undefined)[]
  ): { id: string | null; raw: string | null } => {
    for (const l of labels) {
      const hit = known(l);
      if (hit) return { id: hit, raw: null };
    }
    const first = labels.find((l) => l != null && l !== "");
    if (first == null) return { id: null, raw: null };
    return { id: slug(first) || contentId([first]), raw: first };
  };

  // Discovery pass: every unmatched label has to be known before party rows are built, because a
  // candidacy cannot reference a party_version that does not exist yet.
  const unmatchedCounts = new Map<string, number>();
  const note = (...labels: (string | null | undefined)[]): void => {
    const { raw } = resolveParty(...labels);
    if (raw) unmatchedCounts.set(raw, (unmatchedCounts.get(raw) ?? 0) + 1);
  };
  for (const c of b.candidates) note(c.partyId);
  for (const h of b.historicalResults) {
    for (const c of [h.winner, h.runnerUp, ...(h.topContestants ?? [])]) {
      if (c) note(c.partyId, c.partyAbbr);
    }
  }
  for (const m of b.currentMLAs) note(m.partyId);
  for (const m of b.cabinet) note(m.partyId);
  for (const m of b.mps) note(m.partyId);
  const unmatchedPartyStrings = [...unmatchedCounts.keys()].sort();
  for (const raw of unmatchedPartyStrings) {
    anomalies.push({
      kind: "unresolved_party",
      ref: `party_label:${raw}`,
      detail: `declared party "${raw}" matches no id, abbreviation or name in parties.json; a registered_unrecognised party row was synthesised and every candidacy kept its raw label in candidacy.party_raw (${unmatchedCounts.get(raw)} rows)`,
    });
  }

  // ── symbols (P3) ───────────────────────────────────────────────────────────
  // P3 is "symbol before colour", so a party card with no symbol can only fall back to colour —
  // the inversion P3 forbids. parties.json ships an asset path for half the register; that path is
  // the symbol we have, so it becomes a symbol row and party_version.symbol_id points at it.
  const symbolSeen = new Set<string>();
  let unnamedSymbols = 0;
  /** null when the party ships no asset path. Id and name both come from the asset's own name:
   *  the ECI symbol name ("Grass Flowers", "Lotus") is in the symbol notification, which we do
   *  not have, and inventing one is worse than recording the filename we do have. */
  const symbolId = (url: string | undefined): string | null => {
    if (!url) return null;
    const file = url.split("/").pop() ?? url;
    const bare = file.replace(/\.[a-z0-9]+$/i, "");
    const id = slug(bare) || contentId([url]);
    if (!symbolSeen.has(id)) {
      symbolSeen.add(id);
      symbolRows.push([id, bare, "{}", url, null, null]);
      unnamedSymbols++;
    }
    return id;
  };

  const partyVersionOf = new Map<string, number>();
  const orderedParties: {
    id: string;
    name: string;
    shortName: string;
    names: string;
    kind: string;
    symbolId: string | null;
  }[] = [
      ...b.parties.map((p) => ({
        id: p.id,
        name: p.name,
        shortName: p.abbreviation,
        names: jsonNames(p.nameBn, p.name),
        kind: p.id.toUpperCase() === "IND" ? "independent" : p.isNational ? "national" : "state",
        symbolId: symbolId(p.symbolUrl),
      })),
      ...unmatchedPartyStrings.map((raw) => ({
        id: slug(raw) || contentId([raw]),
        // short_name is NOT NULL and the raw label is the only truthful value we have. Deriving
        // "RLJP" from "RASHTRIYA LOK JANSHAKTI PARTY" would be inventing an abbreviation.
        name: raw,
        shortName: raw,
        names: "{}",
        kind: "registered_unrecognised",
        symbolId: null,
      })),
    ];
  for (const p of orderedParties) {
    partyRows.push([p.id, p.name, p.shortName, p.names, p.kind, null, null]);
    // ponytail: one open-ended version per party, valid_from = the earliest election in this
    // dataset. Real registration dates, renames and split/merge lineage need the ECI party
    // register — a later cycle.
    partyVersionRows.push([p.id, PARTY_VALID_FROM, null, p.name, p.symbolId]);
  }
  // Written here, not in the write block at the end: candidacy rows need party_version ids.
  //
  // party_version.id and claim.id are DATABASE-LOCAL SURROGATES. The UNIQUE natural keys added in
  // 005 — (party_id, valid_from) and claim.content_key — are what the upserts match on, so an id is
  // bound to one fact for the lifetime of ONE database and a shrinking register can no longer leave
  // a party with two open-ended versions. They are NOT reproducible across databases: measured
  // 2026-08-08, a rebuild from a reversed `parties` array moves 32 of 63 party_version ids, and
  // reversing `parties` + `candidates` moves 18,831 of 22,414 claim ids, because both are rowids
  // assigned in insert order. Anything published — a permalink, an export — must carry the natural
  // key (party_id + valid_from, or claim.content_key), never these integers. Nothing does today: 0
  // claims name a party_version, which test B5b asserts along with reorder-invariance of the natural
  // key and of every candidacy's resolved party. See ADR 0001, "Surrogate keys that must never be
  // published".
  w("symbol", ["id", "name", "names", "svg_ref", "allotment_kind", "licensed_from"], ["id"], symbolRows);
  w("party", ["id", "name", "short_name", "names", "kind", "registered_on", "dissolved_on"], ["id"], partyRows);
  w("party_version", ["party_id", "valid_from", "valid_to", "name", "symbol_id"], ["party_id", "valid_from"], partyVersionRows);
  for (const r of all<{ id: number; party_id: string }>(
    db,
    "SELECT id, party_id FROM party_version WHERE valid_from = ?",
    PARTY_VALID_FROM,
  )) {
    partyVersionOf.set(r.party_id, Number(r.id));
  }
  const partyVersionId = (id: string | null): number | null =>
    id == null ? null : (partyVersionOf.get(id) ?? null);

  // ── elections and contests: 294 seats x 4 elections ────────────────────────
  for (const y of YEARS) {
    // house / year / occurrence are identity, not decoration: an election is an event, and a year alone
    // cannot identify one (migration 013). The seed describes one assembly election per year, so each is
    // occurrence 1; it gives no polling month, so that stays NULL rather than being guessed.
    electionRows.push([
      electionId(y),
      "assembly",
      "state",
      "direct",
      STATE_PLACE,
      EPOCH_ID,
      `West Bengal Legislative Assembly election, ${y}`,
      "declared",
      "ac",
      y,
      null,
      null,
      0,
      1,
      src("historicalResults"),
      null,
      null,
      null,
      null,
      null,
    ]);
  }
  const contestOf = new Map<string, string>(); // `${year}:${constituencyId}` -> contest id
  for (const c of b.constituencies) {
    for (const y of YEARS) {
      const id = contestId(electionId(y), seatSlug(c.name, c.assemblyNumber));
      contestOf.set(`${y}:${c.id}`, id);
      contestRows.push([id, electionId(y), c.assemblyNumber, null, 1, "declared", null]);
    }
  }

  // ── persons ────────────────────────────────────────────────────────────────
  const takenPersonIds = new Set<string>();
  function addPerson(p: {
    name: string;
    scopeKey: string;
    variants: readonly (string | undefined)[];
    aliasKind: string;
    sourceId: string;
    firstSeen: string;
    sex?: string | null;
    birthYear?: number | null;
    birthYearConfidence?: string;
  }): string {
    // The discriminator is a function of the row's OWN content, always present. Cycle 1 awarded
    // the bare slug to whichever row arrived first and suffixed the rest, so reordering the
    // scraper output reassigned a persisted, cited id to a different human. One person row per
    // SOURCE row, deliberately: two candidates named "Swapna Barman" in c0018 are two humans and
    // merging them here would silently drop a candidacy. Collapsing the genuine duplicates is
    // resolve/'s job, which is why every person starts 'unreviewed'.
    const id = `${slug(p.name) || contentId([p.name])}-${contentId([p.scopeKey]).slice(0, 6)}`;
    if (takenPersonIds.has(id)) {
      anomalies.push({
        kind: "duplicate_person_scope_key",
        ref: `person:${id}`,
        detail: `two source rows share the scope key ${JSON.stringify(p.scopeKey)} for "${p.name}", so they collapse into one person row. If they are two humans, the caller's scope key has to include what separates them.`,
      });
      return id;
    }
    takenPersonIds.add(id);
    const bn = p.variants.find((v) => v && detectScript(v) === "beng");
    personRows.push([
      id,
      p.name,
      detectScript(p.name),
      bn ? JSON.stringify({ bn }) : "{}",
      p.sex ?? null,
      p.birthYear ?? null,
      p.birthYearConfidence ?? "unknown",
      "unreviewed",
      now,
    ]);
    const seen = new Set<string>();
    for (const v of p.variants) {
      const name = v?.trim();
      if (!name) continue;
      const script = detectScript(name);
      if (seen.has(`${name}|${script}`)) continue;
      seen.add(`${name}|${script}`);
      // One row per blocking key: blockingKeys() returns 1-3 (order-independent, in-order and
      // surname-only), and the ER index is inert unless every one of them is written. The old
      // single ascii-folded key was script-partitioned and order-sensitive, so a person's Bengali
      // and Latin aliases never shared a bucket and this data's surname-first / given-name-first
      // split never got compared.
      for (const key of blockingKeys(name)) {
        aliasRows.push([id, name, script, key, p.aliasKind, p.firstSeen, p.sourceId]);
      }
    }
    return id;
  }

  const sexOf = (g: string | undefined): string | null =>
    g === "Male" ? "m" : g === "Female" ? "f" : g ? "o" : null;

  // ── candidacies, affidavits, affidavit fields (wb-assembly-2026) ───────────
  const candidatesDay = moduleDate("candidates");
  /** (constituencyId, name slug) -> the single matching 2026 candidacy, or null when ambiguous. */
  const candidacyByAcName = new Map<string, { candidacyId: string; personId: string } | null>();
  /** candidates.json id -> its 2026 candidacy. The exact key, used when the name key is ambiguous. */
  const candidacyByMynetaId = new Map<string, { candidacyId: string; personId: string }>();
  /** (constituencyId, name slug) -> candidates.json id, from current-mla.json. current-mla.json already
   *  carries the winner's own candidateId, so a seat with two same-named nominations does NOT need
   *  entity resolution to place the win — the input says which one won. */
  const winnerCandidateId = new Map<string, string>();
  /** 2026 contests that ended up with an elected candidacy, so the current-mla.json backstop below
   *  only fires for the seats the results module never covered. */
  const electedContests = new Set<string>();
  for (const m of b.currentMLAs) {
    if (m.candidateId) winnerCandidateId.set(`${m.constituencyId}|${slug(m.name)}`, m.candidateId);
  }

  for (const c of b.candidates) {
    const contest = contestOf.get(`2026:${c.constituencyId}`);
    if (!contest) {
      anomalies.push({
        kind: "unknown_constituency",
        ref: `candidate:${c.id}`,
        detail: `constituencyId ${c.constituencyId} is not in constituencies.ts; candidacy skipped`,
      });
      continue;
    }
    const party = resolveParty(c.partyId);
    const personId = addPerson({
      name: c.name,
      scopeKey: c.id,
      variants: [c.name, c.nameBn],
      aliasKind: "affidavit",
      sourceId: src("candidates"),
      firstSeen: candidatesDay,
      sex: sexOf(c.gender),
      // Declared age at the affidavit's retrieval year: derived, so 'approx', never 'exact'.
      birthYear: c.age != null ? Number(candidatesDay.slice(0, 4)) - c.age : null,
      birthYearConfidence: c.age != null ? "approx" : "unknown",
    });
    identifierRows.push([personId, "myneta_id", c.id, src("candidates")]);

    const candId = candidacyId(contest, personId);
    candidacyRows.set(candId, [
      candId,
      contest,
      personId,
      partyVersionId(party.id),
      null,
      null,
      null,
      // 'contesting', not 'defeated': the nomination file establishes that they stood, nothing
      // more. Inferring defeat from someone else's declared win is a result, not a nomination.
      "contesting",
      c.age ?? null,
      c.education ?? null,
      party.raw,
    ]);

    const key = `${c.constituencyId}|${slug(c.name)}`;
    candidacyByAcName.set(
      key,
      candidacyByAcName.has(key) ? null : { candidacyId: candId, personId },
    );
    candidacyByMynetaId.set(c.id, { candidacyId: candId, personId });

    // The affidavit is per candidacy and its URL is the per-candidacy source. When the scraper
    // could not reach the affidavit page, the module we hashed is still a real source for the
    // declared figures — so the facts are recorded and cited to it, and the gap is an anomaly.
    // Cycle 1 nested all of this inside `if (c.affidavitUrl)`, so those candidates lost their
    // declared case count, age, education and occupation with nothing reported.
    const affSource = c.affidavitUrl
      ? addSource({
          kind: "affidavit",
          publisher: "myneta.info / ADR",
          title: `Affidavit — ${c.name} (${c.constituencyId})`,
          url: c.affidavitUrl,
          // The day the LOCATOR was seen, not a retrieval: retrieval_kind says so.
          retrievedAt: stamp(candidatesDay),
          publishedOn: null,
          docHash: unfetched(c.affidavitUrl),
          licence: null,
          hashKind: "url_only",
          retrievalKind: "asserted_by_upstream",
        })
      : src("candidates");
    if (!c.affidavitUrl) {
      anomalies.push({
        kind: "missing_affidavit_url",
        ref: `candidate:${c.id}`,
        detail: `no affidavitUrl in candidates.json, so every declared figure for "${c.name}" cites the module itself instead of the affidavit. Backfill the URL for a per-document citation.`,
      });
    }
    {
      const affId = `affidavit:${c.id}`;
      affidavitRows.push([affId, candId, null, affSource]);

      const fields: [string, number | null | undefined, string][] = [
        ["assets.total", c.totalAssets, "INR"],
        ["liabilities.total", c.totalLiabilities, "INR"],
        ["assets.movable.total", c.movableAssets, "INR"],
        ["assets.immovable.total", c.immovableAssets, "INR"],
      ];
      for (const [path, value, unit] of fields) {
        if (value == null) continue;
        // page_no and rect stay null: we have the affidavit's URL, never its bytes, so there is no
        // page to anchor to yet. The citation's page_no 0 means "the whole document" (§19).
        affidavitFieldRows.push([affId, path, value, null, unit, null, null, PARSER_VERSION]);
        claim(`candidacy:${candId}`, `affidavit.${path}`, value, unit, candidatesDay, affSource);
      }

      // ── §P5 ──────────────────────────────────────────────────────────────────
      // candidates.criminalCases is a bare COUNT with no docket, no court, no section and no
      // stage. It therefore produces ZERO legal_case rows — a legal_case row would have to assert
      // a stage, and the only honest stage would be 'unknown', which is a case we cannot prove
      // exists. The count itself is real and declared, so it is recorded as one claim cited to the
      // affidavit. It is never mapped to 'charged' and never to 'convicted'. Creating legal_case
      // rows here is a correctness bug, not a style choice.
      claim(
        `person:${personId}`,
        "pending_cases_declared",
        c.criminalCases,
        "cases",
        candidatesDay,
        affSource,
      );
      // Declared, rendered, therefore cited. education/age also sit on candidacy as columns; the
      // claim is what gives them provenance, because candidacy has no source_id.
      if (c.education) {
        claim(`person:${personId}`, "education_declared", c.education, null, candidatesDay, affSource);
      }
      if (c.occupation) {
        claim(`person:${personId}`, "occupation_declared", c.occupation, null, candidatesDay, affSource);
      }
      if (c.age != null) {
        claim(`person:${personId}`, "age_declared", c.age, "years", candidatesDay, affSource);
      }

      // photoUrl and incumbentYears: declared in the same affidavit extract as everything above and
      // dropped by cycles 1-3 with nothing reporting it — 2,920 photo URLs and 157 tenure figures
      // reached the registry as zero rows. field-coverage.ts is why that can no longer happen.
      //
      // Claims, not columns (§12). A column is the shape for a value the read path filters, sorts
      // or joins on; nothing filters a candidate list by photo URL or by years-served, and adding
      // person.photo_url would put an asset locator in ring 1 with no source_id of its own. A claim
      // is the only shape that carries the affidavit citation these two values need, which is P2's
      // whole point — so neither needs a migration and 007 does not exist.
      if (c.photoUrl) {
        claim(`person:${personId}`, "photo_url_declared", c.photoUrl, null, candidatesDay, affSource);
      }
      if (c.incumbentYears != null) {
        // Subject is the CANDIDACY, not the person: "5 years served" is a figure about THIS
        // nomination — the same human's next candidacy declares a different number, and a person
        // -subject claim would be a claim_key_collision the moment two of their candidacies are
        // ingested with the same as_of. §12's rule, not a preference: the subject of a claim is
        // whatever the declaration is about.
        claim(
          `candidacy:${candId}`,
          "incumbent_years_declared",
          c.incumbentYears,
          "years",
          candidatesDay,
          affSource,
        );
      }
    }
  }

  // ── historical results -> persons, candidacies, results, turnout ───────────
  const resultsDay = moduleDate("historicalResults");
  const byAcNumber = new Map(b.constituencies.map((c) => [c.id, c.assemblyNumber]));
  let zeroVoteResults = 0;
  // Ring 2 is append-only with supersession (002_facts.sql:5-9): revision is IN the primary key so
  // a corrected tally is a NEW row and the prior row stays readable — that is what the correction
  // ledger reads. Cycle 1 hard-coded revision 0, so a corrected tally UPDATEd in place and the
  // invariant never held. `fact` is the tuple a correction would change; an identical set of tuples
  // for the whole contest means this is the same figure re-ingested, so it keeps its revision and
  // the upsert is a no-op.
  //
  // One revision PER CONTEST, not per (contest, candidacy). Allocating per candidacy meant that
  // correcting one candidate's vote_share created a "revision 1" holding a SINGLE result row, so
  // the shipped invariant "vote_share sums to 100 +/- 0.5 per contest revision" reported that
  // contest as permanently 73 points off, and every consumer reading MAX(revision) per contest got
  // one row instead of the field. A correction rewrites the whole field at the new revision.
  const factOf = (...xs: (number | null)[]): string => JSON.stringify(xs);
  const priorContest = new Map<string, { revision: number; facts: Map<string, string> }>();
  for (const r of all<{
    contest_id: string;
    candidacy_id: string;
    revision: number;
    votes: number;
    vote_share: number | null;
    rank: number | null;
    is_winner: number;
    margin: number | null;
  }>(
    db,
    'SELECT contest_id, candidacy_id, revision, votes, vote_share, "rank" AS rank, is_winner, margin' +
      " FROM result ORDER BY revision",
  )) {
    const rev = Number(r.revision);
    let cur = priorContest.get(r.contest_id);
    if (cur === undefined || rev > cur.revision) {
      priorContest.set(r.contest_id, (cur = { revision: rev, facts: new Map() }));
    }
    cur.facts.set(r.candidacy_id, factOf(r.votes, r.vote_share, r.rank, r.is_winner, r.margin));
  }
  /** The revision the whole field of `contest` goes in at, given the facts this run produced for it. */
  const revisionFor = (contest: string, facts: ReadonlyMap<string, string>): number => {
    const prev = priorContest.get(contest);
    if (prev === undefined) return 0;
    if (prev.facts.size !== facts.size) return prev.revision + 1;
    for (const [candId, fact] of facts) if (prev.facts.get(candId) !== fact) return prev.revision + 1;
    return prev.revision;
  };
  // historical-results.ts contains 40 (year, constituencyId) keys twice: upstream assigned two
  // different seats the same AC id (c0049/2011 carries both Malatipur's winner and Manikchak's,
  // with different totalVotes). Writing both onto one contest gives it two rank-1 winners and
  // corrupts ring 2, and there is no way to tell which row belongs to this seat. So ONE row is
  // written and every other one is recorded verbatim as an anomaly.
  //
  // Which one survives is decided by CONTENT, never by array position: highest totalVotes, then
  // the lowest contentId of the row's own JSON. historical-results.ts is auto-generated from
  // Lokdhaba CSVs, so "whichever came first" made the registry's recorded winner for 40 contests a
  // function of the generator's row order — swapping two array elements changed the declared winner
  // of Chakdaha 2011, and a seeded shuffle changed 20 of 1,135 contests, the person count and even
  // the record of what had been discarded.
  const chosenResultRow = new Map<string, HistoricalRow>();
  for (const h of b.historicalResults) {
    const key = `${h.year}:${h.constituencyId}`;
    const prev = chosenResultRow.get(key);
    if (prev === undefined) {
      chosenResultRow.set(key, h);
      continue;
    }
    const better =
      (h.totalVotes ?? -1) !== (prev.totalVotes ?? -1)
        ? (h.totalVotes ?? -1) > (prev.totalVotes ?? -1)
        : contentId([JSON.stringify(h)]) < contentId([JSON.stringify(prev)]);
    if (better) chosenResultRow.set(key, h);
  }

  for (const h of b.historicalResults) {
    const contest = contestOf.get(`${h.year}:${h.constituencyId}`);
    if (contest == null || !byAcNumber.has(h.constituencyId)) {
      anomalies.push({
        kind: "unknown_constituency",
        ref: `result:${h.year}:${h.constituencyId}`,
        detail: "constituencyId is not in constituencies.ts; result row skipped",
      });
      continue;
    }
    if (chosenResultRow.get(`${h.year}:${h.constituencyId}`) !== h) {
      anomalies.push({
        kind: "duplicate_result_row",
        ref: `contest:${contest}`,
        detail: `a second ${h.year} row claims ${h.constituencyId}: winner "${h.winner.name}" (${h.winner.partyId}) ${h.winner.votes} votes, margin ${h.marginVotes ?? "?"}, totalVotes ${h.totalVotes ?? "?"}. Not written — one contest cannot have two winners, and the row kept is the one with the higher totalVotes (ties broken on the row's own content hash), never the one that happened to come first in the array.`,
      });
      continue;
    }

    // Winner, runner-up and topContestants overlap. The natural key inside one contest is
    // (name, party): four contests genuinely field two different people of the same name on
    // different tickets, so deduping on name alone would delete a real candidacy.
    const contestants = new Map<string, ContestantRow>();
    for (const c of [h.winner, h.runnerUp, ...(h.topContestants ?? [])]) {
      if (!c) continue;
      const k = `${slug(c.name)}|${c.partyId}`;
      if (!contestants.has(k)) contestants.set(k, c);
    }
    const ranked = [...contestants.entries()].sort((a, b2) => b2[1].votes - a[1].votes);
    const winnerKey = `${slug(h.winner.name)}|${h.winner.partyId}`;
    const winnerVotes = h.winner.votes;
    /** This contest's rows, held back until the whole field's facts are known: the revision is one
     *  number for the contest, not one per candidacy. */
    const contestResults: Param[][] = [];
    const contestFacts = new Map<string, string>();

    ranked.forEach(([key, c], i) => {
      const isWinner = key === winnerKey;
      const party = resolveParty(c.partyId, c.partyAbbr);

      // 2026's nomination data is already in the registry: when exactly one 2026 candidate in this
      // seat carries this name, the declared result belongs on THAT candidacy. This is a join on a
      // natural key, not entity resolution — ambiguous or absent matches get their own person row
      // and an anomaly, so resolve/ still has the pair to judge.
      let match: { candidacyId: string; personId: string } | null | undefined;
      if (h.year === 2026) {
        match = candidacyByAcName.get(`${h.constituencyId}|${slug(c.name)}`);
        if (!match && isWinner) {
          // The name key is ambiguous (two nominations, one name) or absent. current-mla.json names
          // the winner's own candidates.json id, so for a declared WINNER the right candidacy is
          // known exactly — fabricating a third person here loses the affidavit's age and
          // education for a sitting MLA the input already identified.
          const exact = winnerCandidateId.get(`${h.constituencyId}|${slug(c.name)}`);
          match = (exact != null ? candidacyByMynetaId.get(exact) : undefined) ?? match;
        }
        if (match === null || match === undefined) {
          anomalies.push({
            kind: "unmatched_declared_winner",
            ref: `contest:${contest}`,
            detail: `declared ${isWinner ? "winner" : "contestant"} "${c.name}" matches ${match === null ? "more than one" : "no"} 2026 nomination in ${h.constituencyId} and current-mla.json names no candidateId for them; a separate person + candidacy was created for resolve/ to judge`,
          });
        }
      }

      let personId: string;
      let candId: string;
      if (match) {
        personId = match.personId;
        candId = match.candidacyId;
      } else {
        personId = addPerson({
          name: c.name,
          scopeKey: `${h.year}:${h.constituencyId}:${key}`,
          variants: [c.name],
          aliasKind: "eci_nomination",
          sourceId: src("historicalResults"),
          firstSeen: resultsDay,
        });
        candId = candidacyId(contest, personId);
        candidacyRows.set(candId, [
          candId,
          contest,
          personId,
          partyVersionId(party.id),
          null,
          null,
          null,
          isWinner ? "elected" : "defeated",
          null,
          null,
          party.raw,
        ]);
      }
      if (isWinner) electedContests.add(contest);
      if (match && isWinner) {
        // Upgrade the nomination row we joined onto: this person was declared elected. Edit the
        // status on the row that is already there — cycle 1 pushed a SECOND row for the same id
        // with age_declared and education_declared null, and since upsert() SETs every non-key
        // column the later row wiped the affidavit-declared age and education off all 293
        // declared winners. A later, thinner row must never overwrite a richer one.
        const nomination = candidacyRows.get(candId);
        if (nomination) nomination[7] = "elected";
      }

      // 0 in this source means "not reported", not "polled nothing": historical-results records the
      // 2026 winner and margin and never backfilled the tallies, so all 293 declared seats arrive at
      // votes 0 / voteShare 0. Writing that 0 through was only possible while result.votes was
      // NOT NULL; migration 007 removed that, so absence is stored as absence. Verified against the
      // registry before changing it: there was not one genuine votes = 0 row in 4,357.
      const votes = c.votes === 0 ? null : c.votes;
      const share = c.voteShare === 0 || c.voteShare == null ? null : c.voteShare;

      // margin: the declared figure for the winner, the deficit to the winner for everyone else. A
      // deficit needs two counts, so it is null when either side is unreported rather than 0 - 0.
      const runnerUp = ranked[1];
      const runnerUpVotes = runnerUp?.[1].votes ?? 0;
      const margin = isWinner
        ? (h.marginVotes ?? (votes !== null && runnerUpVotes > 0 ? votes - runnerUpVotes : null))
        : votes !== null && winnerVotes > 0
          ? votes - winnerVotes
          : null;
      const fact = factOf(votes, share, i + 1, isWinner ? 1 : 0, margin);
      contestFacts.set(candId, fact);
      contestResults.push([
        contest,
        candId,
        0, // placeholder: the revision is a property of the CONTEST and is filled in below
        votes,
        null,
        null,
        share,
        i + 1,
        isWinner ? 1 : 0,
        margin,
        src("historicalResults"),
        now,
      ]);
      if (votes === null) zeroVoteResults++;
    });
    const revision = revisionFor(contest, contestFacts);
    for (const row of contestResults) {
      row[2] = revision;
      resultRows.push(row);
    }

    if (h.turnoutPct != null || h.totalVotes != null || h.totalElectors != null) {
      turnoutRows.push([
        contest,
        "contest",
        h.totalElectors ?? null,
        h.totalVotes ?? null,
        null,
        null,
        null,
        null,
        null,
        src("historicalResults"),
      ]);
      if (h.turnoutPct != null) {
        claim(
          `contest:${contest}`,
          "turnout_pct",
          h.turnoutPct,
          "%",
          `${h.year}-01-01`,
          src("historicalResults"),
        );
      }
    }
  }
  if (zeroVoteResults > 0) {
    anomalies.push({
      kind: "zero_vote_result",
      ref: `election:${electionId(2026)}`,
      detail: `${zeroVoteResults} result rows carry votes=NULL — no reported count — because historical-results.json records the 2026 winner and margin but never backfilled the tallies. They were written as votes=0 until migration 007 let absence be stored as absence. Recorded as declared (never invented) — these rows will fail the §19 dbt test "vote_share sums to 100 +/- 0.5 per contest revision" until the counts land. They also break §19's "winner margin equals rank-1 minus rank-2 votes": each is the only row in its contest and asserts a margin with no tallies behind it, so that invariant cannot be evaluated for these contests at all.`,
    });
  }
  const seenResults = new Set(b.historicalResults.map((h) => `${h.year}:${h.constituencyId}`));
  for (const c of b.constituencies) {
    for (const y of YEARS) {
      if (!seenResults.has(`${y}:${c.id}`)) {
        anomalies.push({
          kind: "missing_result",
          ref: `contest:${contestOf.get(`${y}:${c.id}`)}`,
          detail: `historical-results.ts has no ${y} row for ${c.id} (${c.name}); the contest exists, its result does not`,
        });
      }
    }
  }

  // ── declared winners current-mla.json knows about and historical-results.ts does not ────────────
  // 294 sitting MLAs, and historical-results.ts carries a 2026 row for 293 seats. The missing seat
  // still has a declared winner with a candidateId, so its candidacy is marked elected here rather
  // than left as one more 'contesting' row. No result row: there are no tallies to record.
  for (const m of b.currentMLAs) {
    const contest = contestOf.get(`2026:${m.constituencyId}`);
    if (!contest || electedContests.has(contest) || !m.candidateId) continue;
    const won = candidacyByMynetaId.get(m.candidateId);
    const row = won && candidacyRows.get(won.candidacyId);
    if (!row) continue;
    row[7] = "elected";
    electedContests.add(contest);
    anomalies.push({
      kind: "elected_without_result",
      ref: `contest:${contest}`,
      detail: `current-mla.json declares ${m.name} (${m.candidateId}) elected in ${m.constituencyId} but historical-results.ts has no 2026 row, so the candidacy is marked elected with no result row behind it — no votes, share or rank are invented`,
    });
  }

  // ── sitting MLAs: persons + aliases + claims, cited to their own sourceUrl ──
  const mlaDay = moduleDate("currentMLAs");
  for (const m of b.currentMLAs) {
    const source = urlSource(m.sourceUrl, mlaDay, "currentMLAs", `mla:${m.constituencyId}`);
    const personId = addPerson({
      name: m.name,
      scopeKey: `mla:${m.constituencyId}:${m.name}`,
      variants: [m.name],
      aliasKind: "press",
      sourceId: source,
      firstSeen: mlaDay,
    });
    const term = m.term.slice(0, 4);
    const acNumber = byAcNumber.get(m.constituencyId);
    claim(
      `person:${personId}`,
      "mla_term",
      {
        term: m.term,
        constituencyId: m.constituencyId,
        party: m.partyId,
        // placeId and partyId are the SAME assertion in the registry's own vocabulary. A sitting
        // MLA has no candidacy row (§19 has no office table), so without them resolve/ sees a
        // person with no history at all: both its overlap features are 0, its score ceiling is
        // 0.6471, and every one of the 294 MLAs stays a permanent duplicate of the person who
        // holds their candidacies.
        placeId: acNumber == null ? null : acPlaceId(acNumber),
        partyId: resolveParty(m.partyId).id,
      },
      null,
      `${term}-01-01`,
      source,
    );
    if (m.marginVotes != null) {
      claim(`person:${personId}`, "mla_margin_votes", m.marginVotes, "votes", `${term}-01-01`, source);
    }
    if (m.voteShare != null) {
      claim(`person:${personId}`, "mla_vote_share", m.voteShare, "%", `${term}-01-01`, source);
    }
  }

  // Ministers and MPs get persons + claims, not offices: §19 has no office/portfolio table, so a
  // claim is the only place these facts can live without inventing a schema. Persons also give
  // resolve/ its best hard cases — "Adhikari Suvendu" here vs "Suvendu Adhikari" in the
  // nominations is exactly the transliteration pair the blocking index has to catch.
  const cabinetDay = moduleDate("cabinet");
  for (const m of b.cabinet) {
    const source = urlSource(m.sourceUrl, cabinetDay, "cabinet", `minister:${m.name}`);
    const personId = addPerson({
      name: m.name,
      scopeKey: `minister:${m.name}:${m.constituencyId ?? ""}`,
      variants: [m.name],
      aliasKind: "press",
      sourceId: source,
      firstSeen: cabinetDay,
    });
    for (const p of m.portfolios) {
      const acNumber = m.constituencyId == null ? undefined : byAcNumber.get(m.constituencyId);
      claim(
        `person:${personId}`,
        // The ministry is part of the fact slot, not just the value: one minister holds four
        // portfolios and two of them share a `from` date, so a bare predicate would make them one
        // claim. A claim id is (subject, predicate, as_of, unit) — the predicate has to separate them.
        `cabinet_portfolio:${slug(p.ministry)}`,
        {
          ministry: p.ministry,
          rank: p.rank ?? null,
          constituencyId: m.constituencyId ?? null,
          // Same reason as mla_term: a minister row has no candidacy, so this is the only seat and
          // party assertion resolve/ can score it on.
          placeId: acNumber == null ? null : acPlaceId(acNumber),
          partyId: resolveParty(m.partyId).id,
        },
        null,
        p.from ?? null,
        source,
      );
    }
  }

  // ── Lok Sabha 2024: the registry's second election KIND and second place KIND ───────────────
  //
  // These 42 rows have been in the seed since before the registry existed and were ingested as a
  // person plus one `ls_seat_won` claim, with a comment conceding that "a Lok Sabha seat has no place
  // row in this registry". That made the national claim structural rather than actual: one nation
  // place did not exist, no parliamentary constituency existed, and every election was kind=assembly
  // at level=state. A model that has only ever held one election type is not a national model, it is a
  // state model with roomy CHECK constraints.
  //
  // So they now load as facts: a `general`/`union` election whose jurisdiction is India, 42 `pc` places
  // under West Bengal, a contest each, a candidacy for the winner, and a result carrying the declared
  // margin. The claim stays too — it is what resolve/ scores an MP on, and deleting an input because a
  // better representation arrived is how corroboration silently weakens.
  //
  // What is deliberately NOT invented: vote counts (the source has none, so votes is NULL under 007),
  // turnout, runners-up, and the other 501 seats of the 2024 general election. This is West Bengal's 42
  // of 543, and `mandate coverage` says so rather than letting a reader assume otherwise.
  // ── geometry: the shapes that have been in the seed since the first commit ──────────────────
  //
  // One row per place_version, keyed by the version rather than the place, because an outline belongs
  // to a delimitation: the same seat has a different shape in a different epoch, which is the whole
  // reason place_version exists. geometry_ref is set to the version id so the pointer 001 designed is
  // actually populated rather than left null with the data hidden in a side table.
  const VIEW_BOX = "0 0 400 580";
  const districtVersionOf = new Map<string, number>();
  const districtGeoIndex = (dId: string): number => {
    const seen = districtVersionOf.get(dId);
    if (seen !== undefined) return seen;
    const next = districtVersionOf.size + 1;
    districtVersionOf.set(dId, next);
    return next;
  };
  // CONSTITUENCY GEOMETRY NO LONGER COMES FROM THE SEED, and that is Phase 3's closure rather than a
  // regression. This wrote 294 West Bengal outlines from `wb-ac-paths.json` — a repo module with no
  // publisher, no upstream URL and a West Bengal-only projection — and the registry now holds 4,950
  // constituency polygons from two hashed, licensed, published boundary sets in the projection the whole
  // product shares (`mandate geography fetch && geography import`). Keeping both meant two coordinate
  // spaces in one table and a round-trip measurement of a contract that no longer held.
  //
  // A fresh registry therefore has NO constituency geometry until the geography import runs. That is the
  // honest bootstrap: DEPLOYMENT.md names the two commands, and a state page with no polygons falls back to
  // its district tally and says so.
  const districtPlaceIds = new Set(placeRows.filter((r) => r[1] === "district").map((r) => String(r[0])));
  const unmatchedDistricts: string[] = [];
  for (const g of b.districtPaths) {
    // Districts have no place_version — only constituencies are versioned by delimitation here — so
    // their outline attaches to a synthetic version id offset well clear of both AC numbers and the
    // PC offset. Documented rather than clever: a district shape that cannot be stored is a district
    // shape that silently disappears, which is how these got to 0% in the first place.
    const raw = slug(g.name);
    const dId = `${STATE_PLACE}.${DISTRICT_ALIAS[raw] ?? raw}`;
    if (!districtPlaceIds.has(dId)) {
      unmatchedDistricts.push(g.name);
      continue;
    }
    const versionId = DISTRICT_VERSION_OFFSET + districtGeoIndex(dId);
    const source = src("districtPaths");
    placeVersionRows.push([versionId, dId, STATE_PLACE, "district", EPOCH_ID, null, g.name, null, null, String(versionId), null, null, source, 0, "[]"]);
    placeGeometryRows.push([versionId, g.path, g.centroid.x, g.centroid.y, VIEW_BOX, source]);
  }

  if (unmatchedDistricts.length > 0) {
    anomalies.push({
      kind: "geometry_unmatched_district",
      ref: "registry",
      detail:
        `${unmatchedDistricts.length} district outline(s) name a district that constituencies.json does ` +
        `not: ${unmatchedDistricts.join(", ")}. Their shape is not stored, so a district map would be ` +
        `missing them. Add the spelling to DISTRICT_ALIAS in this file after confirming it is the same ` +
        `district and not a new one.`,
    });
  }

  const mpsDay = moduleDate("mps");
  // Guarded on lsNumber, not on row count: a seat number is what makes a PC place, and without one
  // there is no contest to hold. An election row with no contests is an empty frame, which this
  // project does not ship — so if no MP row carries a number, the election is not created at all.
  if (b.mps.some((m) => m.lsNumber != null)) {
    // counting_on is a real date from the source (electedOn), not a guess: the last declaration wins,
    // because a general election's count finishes when its slowest seat does.
    const countedOn = b.mps.reduce<string | null>(
      (latest, m) => (m.electedOn != null && (latest === null || m.electedOn > latest) ? m.electedOn : latest),
      null,
    );
    electionRows.push([
      LS_ELECTION,
      "general",
      "union",
      "direct",
      NATION_PLACE,
      EPOCH_ID,
      "Indian general election, 2024",
      "declared",
      "pc",
      2024,
      null,
      18,
      0,
      1,
      src("mps"),
      null,
      null,
      countedOn,
      null,
      null,
    ]);
  }

  for (const m of b.mps) {
    const source = urlSource(m.sourceUrl, mpsDay, "mps", `mp:${m.lsConstituency}`);
    const personId = addPerson({
      name: m.name,
      scopeKey: `mp:${m.lsConstituency}:${m.name}`,
      variants: [m.name],
      aliasKind: "press",
      sourceId: source,
      firstSeen: mpsDay,
    });

    // A PC number is only meaningful with a state: 'Cooch Behar' is PC 1 in West Bengal and nothing in
    // Bihar. lsNumber is the state's own numbering, which is why the place id is scoped to the state.
    if (m.lsNumber != null) {
      const pcId = `${STATE_PLACE}.pc.${String(m.lsNumber).padStart(2, "0")}`;
      const versionId = PC_VERSION_OFFSET + m.lsNumber;
      placeRows.push([pcId, "pc", STATE_PLACE, m.lsConstituency, "{}", null, String(m.lsNumber)]);
      // reservation is NULL, not 'general': the source does not say, and 'general' would be a guess
      // that a reader could not distinguish from a fact.
      placeVersionRows.push([versionId, pcId, STATE_PLACE, "pc", EPOCH_ID, m.lsNumber, m.lsConstituency, null, null, null, null, null, src("mps"), 0, "[]"]);

      const contest = contestId(LS_ELECTION, `${slug(m.lsConstituency)}-${String(m.lsNumber).padStart(2, "0")}`);
      contestRows.push([contest, LS_ELECTION, versionId, null, 1, "declared", m.electedOn ?? null]);

      const party = resolveParty(m.partyId);
      const candId = candidacyId(contest, personId);
      candidacyRows.set(candId, [
        candId,
        contest,
        personId,
        partyVersionId(party.id),
        null,
        null,
        null,
        "elected",
        null,
        null,
        party.raw,
      ]);
      resultRows.push([
        contest,
        candId,
        0,
        null, // votes: the source reports a margin and no tallies. 007 lets that be absent.
        null,
        null,
        null,
        1,
        1,
        m.margin ?? null,
        source,
        now,
      ]);
    }
    claim(
      `person:${personId}`,
      "ls_seat_won",
      {
        constituency: m.lsConstituency,
        party: m.partyId,
        margin: m.margin ?? null,
        // A Lok Sabha seat has no place row in this registry, so placeId stays absent: an MP row
        // can only be corroborated on party, never on constituency, and it will not reach the
        // auto-merge bar on that alone. Stated here so the gap is visible rather than assumed.
        partyId: resolveParty(m.partyId).id,
      },
      null,
      m.electedOn ?? null,
      source,
    );
  }

  // ── demographics: the census vintage rides on the claim (§6.5) ─────────────
  const demoFields: (keyof DemographicsRow)[] = [
    "population",
    "literacyRate",
    "sexRatio",
    "scPct",
    "stPct",
    "urbanPct",
  ];
  const demoUnits: Record<string, string | null> = {
    population: "persons",
    literacyRate: "%",
    sexRatio: "females_per_1000_males",
    scPct: "%",
    stPct: "%",
    urbanPct: "%",
  };
  for (const d of b.demographics) {
    const n = byAcNumber.get(d.constituencyId);
    if (n == null) continue;
    // as_of IS the vintage: a Census 2011 figure is a 2011 claim however late we ingest it, and
    // the UI is required to render the year beside the number.
    const asOf = `${d.sourceYear}-01-01`;
    const subject = `place:${acPlaceId(n)}`;
    for (const f of demoFields) {
      const v = d[f];
      if (v == null) continue;
      claim(subject, `demographics.${String(f)}`, v, demoUnits[String(f)] ?? null, asOf, src("demographics"));
    }
    if (d.sourceNote) {
      // The caveat travels with the figures, so §20 meta.caveats can be assembled, not remembered.
      claim(subject, "demographics.source_note", d.sourceNote, null, asOf, src("demographics"));
    }
  }

  // ── merge-aware write: the ingest must not resurrect what resolve absorbed ─
  // Every person id here is derived from the SOURCE row, so a re-scrape regenerates the id of a
  // person that `mandate resolve` has since absorbed. Writing it back resurrected all 948 absorbed
  // persons, pulled their candidacies and claims off the survivor, and left person_merge asserting
  // 948 merges that no longer held — after which a second `resolve` re-merged the same pairs into a
  // SECOND ledger row and the merge became impossible to revert. So generated person ids are routed
  // through the un-reverted merge ledger before anything is written.
  //
  // Two things deliberately keep the RAW id: candidacy.id (mergeOne keeps the id and moves only
  // person_id — the id is cited from result / affidavit / claim rows) and claim.content_key
  // (mergeOne rewrites subject_ref and not content_key, so keeping the raw key is exactly what
  // makes the upsert land on the row the merge already moved instead of inserting a duplicate).
  const survivorOf = new Map<string, string>();
  for (const r of all<{ merged_id: string; surviving_id: string }>(
    db,
    "SELECT merged_id, surviving_id FROM person_merge WHERE reverted_at IS NULL",
  )) {
    survivorOf.set(r.merged_id, r.surviving_id);
  }
  /** Chains: a survivor can itself be absorbed on a later pass. */
  const livePerson = (id: string): string => {
    let cur = id;
    for (let hops = 0; hops < 64; hops += 1) {
      const next = survivorOf.get(cur);
      if (next === undefined || next === cur) break;
      cur = next;
    }
    return cur;
  };
  let reroutedPersons = 0;
  if (survivorOf.size > 0) {
    const absorbed = new Set<string>();
    for (const row of personRows) {
      const id = String(row[0]);
      if (livePerson(id) !== id) absorbed.add(id);
    }
    for (const rows of [aliasRows, identifierRows]) {
      for (const row of rows) row[0] = livePerson(String(row[0]));
    }
    for (const row of candidacyRows.values()) row[2] = livePerson(String(row[2]));
    for (const c of claims.values()) {
      if (!c.subject.startsWith("person:")) continue;
      const live = livePerson(c.subject.slice("person:".length));
      c.subject = `person:${live}`;
    }
    reroutedPersons = absorbed.size;
    for (let i = personRows.length - 1; i >= 0; i -= 1) {
      if (absorbed.has(String(personRows[i]?.[0]))) personRows.splice(i, 1);
    }
    anomalies.push({
      kind: "merged_person_rerouted",
      ref: "registry",
      detail: `${reroutedPersons} person ids this run generated name persons that person_merge has absorbed; their aliases, identifiers, candidacies and claims were written onto the surviving person instead and no person row was re-created. Revert the merge (mandate unmerge --id=<person_merge.id>) if the input is right and the merge was wrong.`,
    });
  }

  // ── write, parents first ───────────────────────────────────────────────────
  // ponytail: insertMany opens one transaction per table, so a mid-ingest crash leaves a partial
  // database. That is survivable because every write is an idempotent upsert — re-run and it
  // converges, and the run is recorded status='failed'. Wrap the whole thing in one transaction
  // when a reader can hit the db mid-ingest.
  // symbol / party / party_version are already written, above: candidacy needs their ids.
  w("source", ["id","kind","publisher","title","url","archived_url","retrieved_at","published_on","doc_hash","page_count","licence","hash_kind","retrieval_kind"], ["id"], [...sourceRows.values()]);
  w("boundary_epoch", ["id","name","effective_from","effective_to","source_id"], ["id"], [[EPOCH_ID, "Delimitation of Parliamentary and Assembly Constituencies Order, 2008", EPOCH_FROM, null, src("constituencies")]]);
  w("place", ["id","kind","parent_id","canonical_name","names","lgd_code","eci_code"], ["id"], placeRows);
  w("place_version", ["id","place_id","jurisdiction_id","kind","epoch_id","number","canonical_name","district_place_id","reservation","geometry_ref","electors_at_creation","source_constituency_key","name_source_id","name_conflict","name_variants"], ["id"], placeVersionRows);
  // After place_version: place_geometry references it, and writing first failed the foreign key.
  w("place_geometry", ["place_version_id","path","centroid_x","centroid_y","view_box","source_id"], ["place_version_id"], placeGeometryRows);
  w("election", ["id","kind","level","electorate_kind","jurisdiction_place_id","epoch_id","name","lifecycle","house","year","polling_month","house_ordinal","poll_no","occurrence","source_id","announced_on","notified_on","counting_on","forecast_gate_from","forecast_gate_to"], ["id"], electionRows);
  w("contest", ["id","election_id","place_version_id","phase_n","seats_available","lifecycle","declared_at"], ["id"], contestRows);
  w("person", ["id","canonical_name","canonical_name_script","names","sex","birth_year","birth_year_confidence","review_state","created_at"], ["id"], personRows);
  w("person_alias", ["person_id","name","script","norm_key","kind","first_seen","source_id"], ["person_id","name","script","norm_key"], aliasRows);
  w("person_identifier", ["person_id","scheme","value","source_id"], ["scheme","value"], identifierRows);
  w("candidacy", ["id","contest_id","person_id","party_version_id","alliance_version_id","symbol_id","serial_no","status","age_declared","education_declared","party_raw"], ["id"], [...candidacyRows.values()]);
  w("affidavit", ["id","candidacy_id","filed_on","source_id"], ["id"], affidavitRows);
  w("affidavit_field", ["affidavit_id","path","value_numeric","value_text","unit","page_no","rect","parser_version"], ["affidavit_id","path"], affidavitFieldRows);
  // legal_case: intentionally never written. See §P5 above.
  w("result", ["contest_id","candidacy_id","revision","votes","postal_votes","evm_votes","vote_share",'"rank"',"is_winner","margin","source_id","ingested_at"], ["contest_id","candidacy_id","revision"], resultRows);
  w("turnout", ["contest_id","scope","electors","voters","male","female","third_gender","postal","nota","source_id"], ["contest_id","scope"], turnoutRows);

  // claim.id stays database-assigned; content_key is what the upsert matches on, so a claim id is
  // bound to one fact for the lifetime of the database and its citations can never be inherited by
  // a different fact. The ids are read back because citation.claim_id is an INTEGER foreign key.
  const claimRows = [...claims].map(([key, c]): Param[] =>
    [key, c.subject, c.predicate, c.value, c.unit, c.asOf, CLAIM_CONFIDENCE]);
  w("claim", ["content_key","subject_ref","predicate","object_value","unit","as_of","confidence"], ["content_key"], claimRows);
  const claimIdOf = new Map<string, number>();
  for (const r of all<{ id: number; content_key: string }>(
    db,
    "SELECT id, content_key FROM claim WHERE content_key IS NOT NULL",
  )) {
    claimIdOf.set(r.content_key, Number(r.id));
  }
  const citationRows = [...claims].map(([key, c]): Param[] =>
    [claimIdOf.get(key) ?? 0, c.sourceId, CITED_PAGE_NO, null, PARSER_VERSION, now]);
  w("citation", ["claim_id","source_id","page_no","rect","parser_version","extracted_at"], ["claim_id","source_id","page_no"], citationRows);

  // ── re-ingest hygiene: a vanished fact must not leave its citation behind ───
  // Nothing used to be deleted, so a previous run's citation outlived the claim it described.
  // Scoped by parser_version: only this pipeline's own citations are ever removed.
  db.exec(
    "CREATE TEMP TABLE IF NOT EXISTS run_citation (claim_id INTEGER NOT NULL, source_id TEXT NOT NULL," +
      " page_no INTEGER NOT NULL, PRIMARY KEY (claim_id, source_id, page_no))",
  );
  db.exec("DELETE FROM run_citation");
  if (citationRows.length > 0) {
    insertMany(
      db,
      "INSERT OR IGNORE INTO run_citation (claim_id, source_id, page_no) VALUES (?,?,?)",
      citationRows.map((r) => [r[0] ?? 0, r[1] ?? "", r[2] ?? 0]),
    );
  }
  const staleCitations = Number(
    db
      .prepare(
        `DELETE FROM citation WHERE parser_version = ? AND NOT EXISTS (
           SELECT 1 FROM run_citation r WHERE r.claim_id = citation.claim_id
             AND r.source_id = citation.source_id AND r.page_no = citation.page_no)`,
      )
      .run(PARSER_VERSION).changes,
  );
  // A claim this run did not produce and that no citation is left pointing at was ours and has
  // vanished from the input. Deleting it is what keeps countUncited() an honest number.
  const staleClaims = Number(
    db
      .prepare(
        `DELETE FROM claim WHERE id NOT IN (SELECT claim_id FROM run_citation)
           AND NOT EXISTS (SELECT 1 FROM citation WHERE citation.claim_id = claim.id)`,
      )
      .run().changes,
  );
  if (staleCitations > 0 || staleClaims > 0) {
    anomalies.push({
      kind: "stale_provenance_removed",
      ref: "registry",
      detail: `the input changed since the last run: ${staleClaims} claims and ${staleCitations} citations no longer had a fact behind them and were deleted. Nothing was rewritten in place — a claim id is bound to (subject, predicate, as_of, unit).`,
    });
  }

  // A shrinking party register must not leave a second open-ended version behind. Versions still
  // referenced by a candidacy are kept and reported rather than orphaning ring 1.
  /** The ids this run produced for one table, so the deletes below can spot what vanished. */
  const keep = (kind: string, ids: readonly string[]): void => {
    db.exec(
      "CREATE TEMP TABLE IF NOT EXISTS run_row (kind TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (kind, id))",
    );
    db.prepare("DELETE FROM run_row WHERE kind = ?").run(kind);
    if (ids.length > 0) {
      insertMany(db, "INSERT OR IGNORE INTO run_row (kind, id) VALUES (?,?)", ids.map((i) => [kind, i]));
    }
  };

  // A candidate who leaves the input takes their affidavit with them. Without this the fields stay
  // behind with no claim to cite them and countUncited() — P2's one number — reports a violation
  // for a document that is no longer part of the registry.
  keep("affidavit", affidavitRows.map((r) => String(r[0])));
  db.prepare(
    "DELETE FROM affidavit_field WHERE parser_version = ?" +
      " AND affidavit_id NOT IN (SELECT id FROM run_row WHERE kind = 'affidavit')",
  ).run(PARSER_VERSION);
  db.prepare(
    `DELETE FROM affidavit WHERE id NOT IN (SELECT id FROM run_row WHERE kind = 'affidavit')
       AND NOT EXISTS (SELECT 1 FROM affidavit_field f WHERE f.affidavit_id = affidavit.id)`,
  ).run();
  // ponytail: the candidacy and person ROWS of a vanished candidate are left in place — they are
  // cited history, not an uncited value. Delete them when a retraction surface needs it.
  //
  // Their DECLARED COLUMNS are not. age_declared and education_declared are rendered figures whose
  // only provenance is the claim just swept above, so leaving them behind left age 57 / "Graduate"
  // on the page with zero resolvable citations while `uncited values 0` said the registry was
  // clean — exactly the state P2 forbids. The myneta id goes with them: it identifies a candidate
  // record that no longer exists, and resolve/ scores it as a shared identifier.
  keep("candidacy", [...candidacyRows.keys()]);
  const strippedDeclarations = Number(
    db
      .prepare(
        `UPDATE candidacy SET age_declared = NULL, education_declared = NULL
           WHERE (age_declared IS NOT NULL OR education_declared IS NOT NULL)
             AND id NOT IN (SELECT id FROM run_row WHERE kind = 'candidacy')`,
      )
      .run().changes,
  );
  keep("myneta", identifierRows.filter((r) => r[1] === "myneta_id").map((r) => String(r[2])));
  const strippedIdentifiers = Number(
    db
      .prepare(
        "DELETE FROM person_identifier WHERE scheme = 'myneta_id'" +
          " AND value NOT IN (SELECT id FROM run_row WHERE kind = 'myneta')",
      )
      .run().changes,
  );
  if (strippedDeclarations > 0 || strippedIdentifiers > 0) {
    anomalies.push({
      kind: "stale_declaration_removed",
      ref: "registry",
      detail: `${strippedDeclarations} candidacy rows had age_declared / education_declared cleared and ${strippedIdentifiers} myneta_id identifiers were dropped: the candidate left the input, their claims and citations were swept, and a declared figure with no surviving citation is an uncited value (P2). The candidacy row itself is kept — it is cited history.`,
    });
  }

  keep("party", orderedParties.map((p) => p.id));
  db.prepare(
    `DELETE FROM party_version WHERE party_id NOT IN (SELECT id FROM run_row WHERE kind = 'party')
       AND NOT EXISTS (SELECT 1 FROM candidacy c WHERE c.party_version_id = party_version.id)`,
  ).run();
  const overlap = Number(db.prepare("SELECT COUNT(*) AS n FROM party_version_overlap").get()?.n ?? 0);
  if (overlap > 0) {
    anomalies.push({
      kind: "party_version_overlap",
      ref: "registry",
      detail: `${overlap} party_version pairs overlap in time — the invariant §19 enforced with an EXCLUDE constraint (ADR 0001). Each surviving stale version is still referenced by a candidacy from an earlier run; re-ingest with --fresh, or delete the candidacies that point at it.`,
    });
  }
  if (unnamedSymbols > 0) {
    anomalies.push({
      kind: "symbol_name_unknown",
      ref: "registry",
      detail: `${unnamedSymbols} symbol rows carry their asset filename as name: parties.json ships the image path but not the ECI symbol name ("Grass Flowers", "Lotus"). svg_ref is the real datum; backfill name from the ECI symbol notification.`,
    });
  }
  if (siteRootUrls.size > 0) {
    anomalies.push({
      kind: "site_root_citation",
      ref: "registry",
      detail: `${siteRootUrls.size} cited URLs are bare site roots, which cannot support a specific figure: ${[...siteRootUrls].sort().join(", ")}. Replace them with the page that carries the number.`,
    });
  }

  // ── P2's audit: anything rendered with nothing behind it ───────────────────
  const uncitedValues = countUncited(db);
  if (uncitedValues > 0) {
    anomalies.push({
      kind: "uncited_value",
      ref: "registry",
      detail: `${uncitedValues} affidavit fields / claims have no citation — P2 violation`,
    });
  }
  // §19 dbt test: vote_share sums to 100 +/- 0.5 per contest revision. It cannot hold on this
  // input and saying so is the point — historical-results.ts carries only the top five
  // contestants, so the tail of every larger field is absent. Recorded, not papered over.
  const shareShort = Number(
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM (SELECT contest_id, SUM(vote_share) AS s FROM result GROUP BY contest_id, revision HAVING s IS NULL OR ABS(s - 100) > 0.5)",
      )
      .get()?.n ?? 0,
  );
  if (shareShort > 0) {
    anomalies.push({
      kind: "incomplete_contestant_field",
      ref: "registry",
      detail: `${shareShort} contests have vote_share summing outside 100 +/- 0.5: historical-results.ts publishes only the top five contestants, so the rest of the field has no row. The §19 dbt vote_share test stays red until full candidate-level results are ingested.`,
    });
  }
  const uncitedSources = Number(
    db.prepare("SELECT COUNT(*) AS n FROM source s WHERE NOT EXISTS (SELECT 1 FROM citation c WHERE c.source_id = s.id)").get()?.n ?? 0,
  );
  if (uncitedSources > 0) {
    anomalies.push({
      kind: "source_without_citation",
      ref: "registry",
      detail: `${uncitedSources} source rows are referenced by registry rows but carry no citation yet — the repo modules whose facts all travel via a per-row upstream URL, plus the constituency and party registers, which describe structure rather than assert a value`,
    });
  }

  // ── the field-coverage gate: did every input field reach the registry? ─────
  // The check cycles 1-3 did not have. Every other audit in this file asks whether what we wrote is
  // cited; this one asks whether we wrote everything, which is how 2,920 photoUrls and 157
  // incumbentYears reached the registry as zero rows with 239 tests green. It reports through the
  // anomaly list because that is what `mandate ingest` prints, and it FAILS the run on an
  // unexplained drop — a gate you have to remember to look at is not a gate.
  const coverage = checkCoverage ? fieldCoverage(db, b) : [];
  // The other half of what the JSON move gave away: a row missing a required key, or a value outside
  // one of src/types/index.ts's string-literal unions. `raw as Candidate[]` checks neither, and an
  // annotation cannot (tsc widens a JSON literal), so an override that drops `age` or spells gender
  // "M" used to pass both TypeScript gates AND this one — the input and registry counts fall
  // together — and render as undefined on /candidate/[id].
  const shapeBroken = checkCoverage ? seedShapeFailures(b) : [];
  if (coverage.length > 0) {
    // First in the list, not last: `mandate ingest` prints the first 20 anomalies and this run has
    // 121, so a pushed coverage table would be reported as "… 101 more in ingest_run" — the same
    // invisible-gate mistake as cycle 1's registry:audit.
    anomalies.unshift({
      kind: "field_coverage",
      ref: "registry",
      detail: `input field set vs registry field set, all eight seed modules:\n${formatCoverage(coverage)}`,
    });
  }
  const coverageBroken = coverageFailures(coverage);

  const rowsIn =
    b.constituencies.length + b.parties.length + b.candidates.length + b.historicalResults.length +
    b.currentMLAs.length + b.demographics.length + b.cabinet.length + b.mps.length;  const rowsOut =
    sourceRows.size + placeRows.length + placeVersionRows.length + symbolRows.length + partyRows.length +
    partyVersionRows.length + electionRows.length + contestRows.length + personRows.length +
    aliasRows.length + identifierRows.length + candidacyRows.size + affidavitRows.length +
    affidavitFieldRows.length + resultRows.length + turnoutRows.length + claimRows.length +
    citationRows.length;

  db.prepare("UPDATE ingest_run SET finished_at=?, rows_in=?, rows_out=?, anomalies=?, status=? WHERE id=?").run(
    now,
    rowsIn,
    rowsOut,
    JSON.stringify(anomalies),
    anomalies.length > 0 ? "partial" : "ok",
    runId,
  );

  const count = (t: string): number =>
    Number(db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get()?.n ?? 0);

  // Thrown after the ingest_run row is closed, so the written rows and the run record survive for
  // inspection: every write is an idempotent upsert, and the fix is to carry the field, not to undo
  // the run. The first line is what runIngest persists as the failure detail, so it names the
  // fields; the table follows for the operator. Failing here is the point — the drop this gate
  // exists for shipped three times because nothing failed.
  if (coverageBroken.length > 0) {
    throw new Error(
      `field-coverage gate: ${coverageBroken.length} input field(s) unaccounted for — ` +
        coverage
          .filter((r) => r.failure !== null)
          .map((r) => `${r.module}.${r.field} (${r.input} in, ${r.registry ?? "-"} out)`)
          .join(", ") +
        `\n\n${coverageBroken.join("\n")}\n\n${formatCoverage(coverage)}`,
    );
  }
  if (shapeBroken.length > 0) {
    throw new Error(
      `seed shape gate: ${shapeBroken.length} row(s) do not satisfy src/types/index.ts — ` +
        `the old app's interfaces are the contract data/seed/*.json has to keep.\n\n${shapeBroken.join("\n")}`,
    );
  }

  return {
    sources: count("source"),
    places: count("place"),
    persons: count("person"),
    parties: count("party"),
    unmatchedPartyStrings,
    elections: count("election"),
    contests: count("contest"),
    candidacies: count("candidacy"),
    results: count("result"),
    claims: count("claim"),
    citations: count("citation"),
    uncitedValues,
    coverage,
    durationMs: Math.round(clock() - startedMs),
    anomalies,
  };
}

/** Affidavit fields with no claim+citation behind them, plus claims with no citation at all.
 *  P2's one number. Exported because `mandate coverage` prints it too. */
export function countUncited(db: DatabaseSync): number {
  const fields = db
    .prepare(
      `SELECT COUNT(*) AS n FROM affidavit_field af
         JOIN affidavit a ON a.id = af.affidavit_id
        WHERE NOT EXISTS (
          SELECT 1 FROM claim c JOIN citation ci ON ci.claim_id = c.id
           WHERE c.subject_ref = 'candidacy:' || a.candidacy_id
             AND c.predicate = 'affidavit.' || af.path)`,
    )
    .get();
  const claims = db
    .prepare(
      "SELECT COUNT(*) AS n FROM claim c WHERE NOT EXISTS (SELECT 1 FROM citation ci WHERE ci.claim_id = c.id)",
    )
    .get();
  const results = db.prepare("SELECT COUNT(*) AS n FROM result WHERE source_id IS NULL OR source_id = ''").get();
  // candidacy.age_declared / education_declared are RENDERED values and candidacy has no source_id,
  // so their only provenance is a claim on the person. Counting them here is what stops this number
  // reading 0 while a page shows a declared age whose citation has been swept.
  const declared = db
    .prepare(
      `SELECT COUNT(*) AS n FROM candidacy c
        WHERE (c.age_declared IS NOT NULL OR c.education_declared IS NOT NULL)
          AND NOT EXISTS (
            SELECT 1 FROM claim cl JOIN citation ci ON ci.claim_id = cl.id
             WHERE cl.subject_ref = 'person:' || c.person_id
               AND cl.predicate IN ('age_declared', 'education_declared'))`,
    )
    .get();
  return Number(fields?.n ?? 0) + Number(claims?.n ?? 0) + Number(results?.n ?? 0) + Number(declared?.n ?? 0);
}

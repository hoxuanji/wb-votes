// Lokdhaba / TCPD importer — the first thing in this project that acquires data.
//
// Nine cycles asserted that this sandbox blocked all outbound network and used it as the reason no
// importer existed. That was wrong: the claim came from one `listen()` failure, which is a SERVER
// restriction and says nothing about outbound requests. `lokdhaba.ashoka.edu.in` answers, and it serves
// per-state gzipped CSVs covering every Indian assembly and general election since 1962.
//
//   https://lokdhaba.ashoka.edu.in/downloads/{State_Name}/{State_Name}_{AE|GE}.csv.gz
//
// Bihar's assembly file alone is 54,666 candidate rows across 40 election years in 47 columns. That is
// not "another state": it is better data than the West Bengal seed this registry was built around, and
// three of its columns change the architecture rather than filling it —
//
//   · `pid`     a STABLE TCPD person id. The entity resolver exists because India has no national
//               politician id; TCPD has been assigning one for years. It does not retire the resolver,
//               which still has to reconcile across sources, but it gives the unmeasured recall problem
//               in the merge queue something to be measured against.
//   · `DelimID` the delimitation the row belongs to, per row. `boundary_epoch` has held one row and
//               `place_crosswalk` none; this is what populates them.
//   · `Turncoat`, `Last_Party`, `No_Terms`, `Incumbent` — party switches and terms served, already
//               computed. That is the tenure spine from docs/platform/00-model.md, arriving as data.
//
// PROVENANCE. Every source row this writes is genuinely fetched: `hash_kind='document_bytes'` over the
// real gzip bytes and `retrieval_kind='fetched'` with the actual retrieval time. Before this, 10 of
// 2,934 sources had ever been retrieved and the rest were publisher assertions.
//
// One schema limitation, recorded rather than papered over: `source.kind`'s CHECK has no value for a
// cleaned academic dataset, and widening it needs a table rebuild that SQLite refuses while child rows
// hold foreign keys into `source`. The rows are `eci_declaration` — which is what the CONTENT is,
// declared results — with the compilation chain stated in `publisher` and `title`. Add a
// `research_dataset` kind when a migration can safely rebuild that table.

import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Param } from "../../db/index.ts";
import { all, insertMany } from "../../db/index.ts";
import { slug } from "../../core/ids.ts";
import { DISTRICT_ALIAS } from "../districts.ts";
import { JURISDICTIONS } from "../india.ts";

export type ElectionType = "AE" | "GE";

/**
 * TCPD's `DelimID` mapped to the delimitation it actually is.
 *
 * The file gives an opaque integer, and the year ranges identify it beyond doubt: in Bihar, DelimID 1
 * covers 1962-1964, 2 covers 1967-1972, 3 covers 1977-2009 and 4 covers 2010-2021 — India's four
 * delimitations, whose orders were published in 1952, 1963, 1976 and 2008.
 *
 * DelimID 4 maps to `delim-2008`, which is the epoch the West Bengal seed already created. That reuse is
 * the point: a parallel `delim-4` epoch would put Bihar's and West Bengal's current seats in different
 * boundary regimes and quietly break every cross-state comparison.
 *
 * Only the 2008 order's exact date is on record here (19 February 2008, from the existing epoch row).
 * The other three carry January of the order year and say so in their name, because a fabricated day is
 * worse than an admitted approximation.
 */
const DELIMITATIONS: Record<string, { id: string; name: string; from: string }> = {
  "1": {
    id: "delim-1952",
    name: "Delimitation Commission Order, 1952 (day precision not recorded)",
    from: "1952-01-01",
  },
  "2": {
    id: "delim-1963",
    name: "Delimitation Commission Order, 1963 (day precision not recorded)",
    from: "1963-01-01",
  },
  "3": {
    id: "delim-1976",
    name: "Delimitation Commission Order, 1976 (day precision not recorded)",
    from: "1976-01-01",
  },
  "4": {
    id: "delim-2008",
    name: "Delimitation of Parliamentary and Assembly Constituencies Order, 2008",
    from: "2008-02-19",
  },
};

const BASE = "https://lokdhaba.ashoka.edu.in/downloads";
const CACHE_DIR = ".data/cache/lokdhaba";

/** The name Lokdhaba publishes a state's files under, where it differs from this project's. */
const LOKDHABA_NAME: Record<string, string> = {
  // Every other state is its own name with underscores. J&K keeps the ampersand, and a request for
  // Jammu_and_Kashmir is a 404.
  jk: "Jammu_&_Kashmir",
};

/** State_Name as Lokdhaba spells it, from our jurisdiction id. */
export function lokdhabaState(id: string): string | null {
  const j = JURISDICTIONS.find((x) => x.id === id);
  return j === undefined ? null : (LOKDHABA_NAME[id] ?? j.name.replace(/\s+/g, "_"));
}

export type Fetched = {
  url: string;
  bytes: Uint8Array;
  sha256: string;
  retrievedAt: string;
  /** True when the bytes came from the on-disk cache rather than the network. */
  cached: boolean;
};

/**
 * Fetch a state file, or read it from cache.
 *
 * Cached deliberately and by content path: these files are 1-2 MB each and 36 states is a lot of
 * repeated traffic against a university's server for data that changes once an election. `--refresh`
 * is the way to re-fetch. The sha256 is over the compressed bytes exactly as received, which is what
 * makes the hash checkable by anyone who downloads the same URL.
 */
export function downloadUrl(state: string, type: ElectionType): string {
  return `${BASE}/${state}/${state}_${type}.csv.gz`;
}

/**
 * Read a file already on disk as if it had been fetched.
 *
 * Acquisition and ingestion are separated deliberately, and not only for testing. Node's `fetch` does not
 * honour proxy environment variables, so on a machine where outbound traffic goes through one, `curl`
 * reaches Lokdhaba and `fetch` does not — which is exactly what happened here. Rather than smuggle a
 * transport into the importer, the importer takes bytes: `--file` accepts anything curl, wget or a browser
 * downloaded, and the sha256 is still computed over those bytes, so provenance is identical either way.
 */
export function localFile(path: string, url: string, now = () => new Date().toISOString()): Fetched {
  const bytes = readFileSync(path);
  if (bytes.length < 1024 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
    throw new Error(`${path} is ${bytes.length} bytes and is not gzip — is it an HTML error page?`);
  }
  return { url, bytes, sha256: sha256(bytes), retrievedAt: now(), cached: true };
}

export async function fetchState(
  state: string,
  type: ElectionType,
  opts: { refresh?: boolean; now?: () => string; cacheDir?: string } = {},
): Promise<Fetched> {
  const url = `${BASE}/${state}/${state}_${type}.csv.gz`;
  const dir = opts.cacheDir ?? CACHE_DIR;
  const path = join(dir, `${state}_${type}.csv.gz`);
  const now = opts.now ?? (() => new Date().toISOString());

  if (opts.refresh !== true && existsSync(path)) {
    const bytes = readFileSync(path);
    const meta = `${path}.meta.json`;
    const at = existsSync(meta)
      ? (JSON.parse(readFileSync(meta, "utf8")) as { retrievedAt: string }).retrievedAt
      : now();
    return { url, bytes, sha256: sha256(bytes), retrievedAt: at, cached: true };
  }

  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${url} returned ${res.status} ${res.statusText}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  // A truncated or HTML error body would otherwise be cached and then fail to gunzip on every later
  // run, so the bytes are validated as gzip before anything is written to disk.
  if (bytes.length < 1024 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
    throw new Error(`${url} returned ${bytes.length} bytes that are not gzip — refusing to cache`);
  }
  const retrievedAt = now();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
  writeFileSync(`${path}.meta.json`, JSON.stringify({ url, retrievedAt, bytes: bytes.length }, null, 2));
  return { url, bytes, sha256: sha256(bytes), retrievedAt, cached: false };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * RFC-4180 CSV, because these files need it: candidate names contain commas ("Singh, Rajesh"), quotes,
 * and the occasional embedded newline. A split(",") parser silently shifts every column after the first
 * quoted comma, which is the kind of corruption that looks like real data.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * The columns this importer cannot work without. The file has 45-47; naming the ones we use keeps the
 * mapping auditable.
 *
 * Assembly and parliamentary files are NOT the same schema. The AE files carry 47 columns including
 * `District_Name` and `Age`; the GE files carry 45 and have neither. Both are listed in OPTIONAL_COLUMNS
 * rather than dropped from the check, because a column that vanishes from the AE files is a change worth
 * failing on, while its absence in a GE file is just what a GE file is. Every read of them already
 * handles an empty value: District_Name is blank before about 2009 even in the AE files, and Age is how
 * birth_year gets its 'approx'.
 */
export const REQUIRED_COLUMNS = [
  "State_Name",
  "Year",
  "Constituency_No",
  "Constituency_Name",
  "Constituency_Type",
  "DelimID",
  "Position",
  "Candidate",
  "Sex",
  "Party",
  "Party_ID",
  "Votes",
  "Valid_Votes",
  "Electors",
  "Turnout_Percentage",
  "Vote_Share_Percentage",
  "Margin",
  "pid",
  "Election_Type",
] as const;

/** Read when present, absent from the parliamentary files. */
export const OPTIONAL_COLUMNS = ["District_Name", "Age"] as const;

export type Row = Record<string, string>;

/** Header-indexed rows, with the required columns verified once rather than per row. */
export function readRows(csvText: string): { rows: Row[]; header: string[] } {
  const table = parseCsv(csvText.trim());
  const header = table[0] ?? [];
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    throw new Error(
      `Lokdhaba file is missing ${missing.length} expected column(s): ${missing.join(", ")}. ` +
        `The published schema has changed; update REQUIRED_COLUMNS and the mapping together.`,
    );
  }
  const idx = new Map(header.map((h, i) => [h, i]));
  const rows: Row[] = [];
  for (const line of table.slice(1)) {
    if (line.length < header.length / 2) continue; // a trailing blank line, not a row
    const r: Row = {};
    for (const c of header) r[c] = (line[idx.get(c) ?? -1] ?? "").trim();
    rows.push(r);
  }
  return { rows, header };
}

/**
 * NOTA is not a person.
 *
 * TCPD ships "None of the Above" as a candidate row — 499 of them in Bihar — and deliberately gives it no
 * `pid`. The first run of this importer created ~500 PEOPLE named NOTA, which then formed the second and
 * third largest name-blocking buckets in the whole registry and would have been fed to the merge queue as
 * candidate duplicates of each other. The absent pid was the signal and it was logged as a curiosity.
 *
 * `turnout.nota` is the column that exists for this, so the votes go there and no person, candidacy or
 * result row is created.
 */
const isNota = (candidate: string, party: string): boolean =>
  /^(nota|none of the above)$/i.test(candidate.trim()) || party.trim().toUpperCase() === "NOTA";

const num = (v: string | undefined): number | null => {
  if (v === undefined || v === "" || v === "NA" || v === "NULL") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * place_version.id allocation for imported states.
 *
 * The existing West Bengal rows use the seat number directly (1-294), with parliamentary seats offset by
 * 1,000 and district outlines by 2,000. That scheme cannot survive a second state — Bihar's seat 1 and
 * West Bengal's seat 1 both want id 1 — so imported rows are allocated above 1,000,000 from
 * (jurisdiction, delimitation, seat, kind), which is deterministic so re-running an import updates rows
 * rather than duplicating them. West Bengal's low ids are grandfathered: they are referenced by contest
 * and place_geometry rows and renumbering them is a migration, not an importer's business.
 *
 * `kind` is in the key because an assembly and a parliamentary file for the same state both number their
 * seats from 1. Without the offset, Uttar Pradesh's AC 5 and PC 5 in the same delimitation compute the
 * same id, the upsert repoints one row to the other's place, and every contest on the losing seat
 * silently follows it. The largest assembly is 403 seats and the largest parliamentary delegation 80, so
 * 500 separates them with room to spare.
 */
export function versionId(stateIdx: number, delimId: number, seatNo: number, kind: "ac" | "pc" = "ac"): number {
  if (seatNo < 1 || seatNo > 499) throw new Error(`seat number ${seatNo} outside 1-499`);
  if (delimId < 0 || delimId > 19) throw new Error(`delimitation id ${delimId} outside 0-19`);
  return 1_000_000 + stateIdx * 20_000 + delimId * 1_000 + (kind === "pc" ? 500 : 0) + seatNo;
}

export type ImportReport = {
  state: string;
  type: ElectionType;
  url: string;
  sha256: string;
  retrievedAt: string;
  cached: boolean;
  rowsRead: number;
  elections: number;
  contests: number;
  candidacies: number;
  results: number;
  persons: number;
  tcpdIds: number;
  parties: number;
  epochs: number;
  /** Seats and contests this import attached to rows another source had already created. Non-zero only
   *  for a state the registry already held — West Bengal, whose seed built it. */
  adoptedVersions: number;
  adoptedContests: number;
  /** Seats whose place row already existed and was therefore left exactly as another source wrote it. */
  adoptedPlaces: number;
  skipped: { reason: string; count: number }[];
};

function upsert(table: string, cols: readonly string[], key: readonly string[]): string {
  const set = cols.filter((c) => !key.includes(c)).map((c) => `${c}=excluded.${c}`);
  return (
    `INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})` +
    ` ON CONFLICT (${key.join(",")}) DO ${set.length ? `UPDATE SET ${set.join(",")}` : "NOTHING"}`
  );
}

/**
 * Load one state's election file into the registry.
 *
 * Person identity uses TCPD's `pid` as the key, NOT this project's resolver: within one TCPD dataset the
 * pid is authoritative and re-deriving identity from names would be strictly worse. The pid is recorded
 * in `person_identifier` so the resolver can later reconcile these persons against affidavit-derived
 * ones — and so the merge queue's recall can finally be measured against a published ground truth.
 */
export function importLokdhaba(
  db: DatabaseSync,
  input: { jurisdictionId: string; type: ElectionType; file: Fetched; nowIso: string },
): ImportReport {
  const j = JURISDICTIONS.find((x) => x.id === input.jurisdictionId);
  if (j === undefined) throw new Error(`unknown jurisdiction '${input.jurisdictionId}'`);
  const stateIdx = JURISDICTIONS.findIndex((x) => x.id === j.id) + 1;

  const text = gunzipSync(input.file.bytes).toString("utf8");
  const { rows } = readRows(text);

  const skipped = new Map<string, number>();
  const skip = (reason: string): void => {
    skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
  };

  // ── source: one row for the file, genuinely fetched and genuinely hashed ────────────────────
  const sourceId = `lokdhaba:${j.id}:${input.type}:${input.file.sha256.slice(0, 12)}`;
  const sourceRows: Param[][] = [
    [
      sourceId,
      // See the note at the top of this file: no 'research_dataset' kind exists yet, and the content is
      // declared results. The compilation chain is stated in publisher and title instead of implied.
      "eci_declaration",
      "Trivedi Centre for Political Data, Ashoka University (compiled from Election Commission of India results)",
      `TCPD ${input.type === "AE" ? "Assembly" : "General"} Election dataset — ${j.name}`,
      input.file.url,
      null,
      input.file.retrievedAt,
      null,
      input.file.sha256,
      "document_bytes",
      "fetched",
    ],
  ];

  const epochRows = new Map<string, Param[]>();
  const placeRows = new Map<string, Param[]>();
  const versionRows = new Map<number, Param[]>();
  const electionRows = new Map<string, Param[]>();
  const contestRows = new Map<string, Param[]>();
  const personRows = new Map<string, Param[]>();
  const identifierRows = new Map<string, Param[]>();
  const aliasRows = new Map<string, Param[]>();
  const partyRows = new Map<string, Param[]>();
  const partyVersionRows = new Map<string, Param[]>();
  const candidacyRows = new Map<string, Param[]>();
  const resultRows = new Map<string, Param[]>();
  const turnoutRows = new Map<string, Param[]>();

  const districtOf = new Map<string, string>();
  const notaVotes = new Map<string, number | null>();

  // ── adoption: a state this registry already holds under another source ──────────────────────
  //
  // West Bengal came from the seed, so `wb.ac.001` already exists, already has a place_version in
  // delim-2008, and that version already has contests for 2011/2016/2021/2026. `place_version` is
  // UNIQUE (place_id, epoch_id) and `contest` is UNIQUE (election_id, place_version_id), so a parallel
  // row is not merely undesirable — the schema refuses it, which is how this was found. Adopting the
  // existing ids is also the only outcome worth having: the point of importing West Bengal from TCPD is
  // that the seat page the app already renders gains sixty years of history, not that a second West
  // Bengal appears beside the first.
  //
  // An adopted row is never rewritten. The seed's version rows carry geometry_ref and
  // electors_at_creation that this file has no value for, and upserting would blank them.
  //
  // Places are adopted by their NATURAL key, not their id: the seed numbers West Bengal's parliamentary
  // seats `wb.pc.01` and this importer would write `wb.pc.001`, which is the same seat under a different
  // id — and `place` is UNIQUE (kind, eci_code, parent_id), so the second one is refused rather than
  // silently duplicated. The key is (jurisdiction, kind, seat number); the parent is deliberately not in
  // it, because a seat's parent moves from the state to its district the moment a row carries a district
  // name, and that must not make the same seat look like a new place.
  const placeFromDb = new Map<string, { id: string; name: string }>();
  for (const r of all<{ id: string; kind: string; eci_code: string; canonical_name: string }>(
    db,
    "SELECT id, kind, eci_code, canonical_name FROM place WHERE eci_code IS NOT NULL",
  )) {
    placeFromDb.set(`${r.id.split(".")[0]} ${r.kind} ${r.eci_code}`, { id: r.id, name: r.canonical_name });
  }
  // Every place id already in the registry. A district has no eci_code, so placeFromDb cannot see it,
  // and `w()` is an upsert on id: the district block below rewrote all 19 of West Bengal's curated
  // district rows with TCPD's spelling — "Cooch Behar" became "COOCH BEHAR", their Bengali names became
  // "{}" and their LGD codes became NULL. The same mistake as the one that reduced "All India Trinamool
  // Congress" to the four characters AITC. An existing row is reference data this file did not create and
  // must not overwrite.
  const placeIdsInDb = new Set(all<{ id: string }>(db, "SELECT id FROM place").map((r) => r.id));
  const adoptedVersion = new Map<string, number>();
  for (const r of all<{ id: number; place_id: string; epoch_id: string }>(
    db,
    "SELECT id, place_id, epoch_id FROM place_version",
  )) {
    adoptedVersion.set(`${r.place_id} ${r.epoch_id}`, r.id);
  }
  const adoptedContest = new Map<string, string>();
  for (const r of all<{ id: string; election_id: string; place_version_id: number }>(
    db,
    "SELECT id, election_id, place_version_id FROM contest",
  )) {
    adoptedContest.set(`${r.election_id} ${r.place_version_id}`, r.id);
  }
  /** Contests that already carry a result from some other source. Their candidate rows are not this
   *  import's to restate — see the note at the point of use. */
  const reportedElsewhere = new Set(
    all<{ contest_id: string }>(db, "SELECT DISTINCT contest_id FROM result").map((r) => r.contest_id),
  );
  const partyFromDb = new Set(all<{ id: string }>(db, "SELECT id FROM party").map((r) => r.id));
  const adoptedPlaces = new Set<string>();
  // Which keys came from the DATABASE, captured before the loop starts adding its own. Without this the
  // second candidate row for a seat looks like an adoption, and the first Sikkim import duly reported 291
  // adopted contests in a state that had none.
  const preexisting = new Set([...adoptedVersion.keys(), ...adoptedContest.keys()]);
  let adoptedVersions = 0;
  let adoptedContests = 0;
  const countedVersions = new Set<string>();
  const countedContests = new Set<string>();
  /** Seat → best parent seen. District_Name is only filled from about 2009, so a seat's parent must
   *  never be downgraded back to the state by an older row that happens to be processed later. */
  const parentOf = new Map<string, string>();

  for (const r of rows) {
    const year = num(r["Year"]);
    const seatNo = num(r["Constituency_No"]);
    const delimId = num(r["DelimID"]);
    const position = num(r["Position"]);
    const pollNo = num(r["Poll_No"]) ?? 0;
    const name = r["Candidate"] ?? "";
    const pid = r["pid"] ?? "";

    if (year === null || seatNo === null || delimId === null) {
      skip("row missing year, seat number or delimitation id");
      continue;
    }
    if (name === "") {
      skip("row has no candidate name");
      continue;
    }

    // ── geography ────────────────────────────────────────────────────────────────────────────
    const delim = DELIMITATIONS[String(delimId)];
    if (delim === undefined) {
      skip(`unknown TCPD DelimID ${delimId} — add it to DELIMITATIONS before importing`);
      continue;
    }
    const epochId = delim.id;
    if (!epochRows.has(epochId)) epochRows.set(epochId, [epochId, delim.name, delim.from, null]);

    const seatName = r["Constituency_Name"] ?? `Seat ${seatNo}`;
    const kind = input.type === "AE" ? "ac" : "pc";
    const already = placeFromDb.get(`${j.id} ${kind} ${seatNo}`);
    const placeId = already?.id ?? `${j.id}.${kind}.${String(seatNo).padStart(3, "0")}`;
    const districtName = r["District_Name"] ?? "";
    if (districtName !== "") {
      // DISTRICT_ALIAS exists because two sources spell nine West Bengal districts differently. TCPD
      // uses the census-side spellings ("Maldah", "Barddhaman", "Hugli"), so without the map an import
      // creates a second place for a district the registry already holds — the exact drift that table
      // was written to stop.
      const sl = slug(districtName);
      const dId = `${j.id}.${DISTRICT_ALIAS[sl] ?? sl}`;
      if (!districtOf.has(dId)) {
        districtOf.set(dId, districtName);
        // Created only when absent — see placeIdsInDb.
        if (!placeIdsInDb.has(dId)) {
          placeRows.set(dId, [dId, "district", j.id, districtName, "{}", null, null]);
        }
      }
      parentOf.set(placeId, dId);
    }
    // An existing place is LEFT ALONE, not upserted. This row has a name and a seat number and nothing
    // else; the registry's row may carry a Bengali name in `names`, an LGD code, and a district parent —
    // and an upsert from here wrote "{}" and null over all three. The same mistake against `party`
    // replaced "All India Trinamool Congress", its Bengali name, its abbreviation TMC and its national
    // status with the four characters "AITC".
    if (already === undefined) {
      placeRows.set(placeId, [placeId, kind, parentOf.get(placeId) ?? j.id, seatName, "{}", null, String(seatNo)]);
    } else {
      adoptedPlaces.add(placeId);
    }

    // Constituency_Type is GEN / SC / ST — plus BL in Sikkim, whose assembly reserves twelve seats for
    // the Bhutia-Lepcha communities. Migration 010 put that value in the schema's vocabulary.
    const reservation = (r["Constituency_Type"] ?? "").toLowerCase();
    const vKey = `${placeId} ${epochId}`;
    const adoptedV = adoptedVersion.get(vKey);
    const vId = adoptedV ?? versionId(stateIdx, delimId, seatNo, kind);
    if (adoptedV === undefined) {
      // THE NAME GOES ON THE VERSION, NOT THE PLACE. `place` is keyed by seat number, and a seat number
      // means nothing across delimitations: Karnataka's parliamentary seat 1 is BIDAR under the 1976 order
      // and CHIKKODI under the 2008 one. Writing the name onto the place — which the first version of this
      // importer did, and only on create — gave 52,875 of 63,288 contests a name from somebody else's
      // delimitation, and put Chikkodi's 2019 winner beside the word Bidar. Migration 011 moved identity
      // here and 012 made the name mandatory, so this row now carries the name THIS delimitation's file
      // gives it, with the district it sat in and the source that said so.
      versionRows.set(vId, [
        vId,
        placeId,
        j.id,
        kind,
        epochId,
        seatNo,
        seatName,
        parentOf.get(placeId) ?? null,
        reservation === "gen" ? "general" : reservation === "" ? null : reservation,
        null,
        null,
        // The source's own identity for this seat, verbatim, so the mapping stays auditable.
        `${r["State_Name"] ?? ""}|${r["Election_Type"] ?? ""}|${delimId}|${seatNo}`,
        sourceId,
        0,
        "[]",
      ]);
      // Remembered so the next row for the same seat and epoch reuses it, rather than re-deriving an id
      // that is only the same by luck of the allocation scheme.
      adoptedVersion.set(vKey, vId);
    } else if (preexisting.has(vKey) && !countedVersions.has(vKey)) {
      countedVersions.add(vKey);
      adoptedVersions += 1;
    }

    // ── election and contest ─────────────────────────────────────────────────────────────────
    // Poll_No is not a re-poll counter. In Bihar 1,358 rows carry Poll_No = 1 but only 10 (year, seat)
    // pairs have both 0 and 1, so a 1 is overwhelmingly a BY-ELECTION held that year rather than a second
    // poll of the same contest. Modelling it as a separate election of kind 'bypoll' is what the schema's
    // vocabulary already says, keeps the by-poll's winner from overwriting the general election's, and is
    // what stopped `UNIQUE (election_id, place_version_id)` failing.
    //
    // A by-poll id names the house too: an assembly by-election and a parliamentary one in the same state
    // and year are two different elections, and 'wb-bypoll-1969' cannot be both.
    const isBypoll = pollNo > 0;
    const electionId = isBypoll
      ? `${j.id}-bypoll-${input.type === "AE" ? "ae" : "ge"}-${year}`
      : input.type === "AE"
        ? `${j.id}-assembly-${year}`
        : `ls-${year}`;
    electionRows.set(electionId, [
      electionId,
      isBypoll ? "bypoll" : input.type === "AE" ? "assembly" : "general",
      input.type === "AE" || isBypoll ? "state" : "union",
      "direct",
      input.type === "AE" || isBypoll ? j.id : "in",
      epochId,
      isBypoll
        ? `${j.name} by-elections, ${year}`
        : input.type === "AE"
          ? `${j.name} Legislative Assembly election, ${year}`
          : `Indian general election, ${year}`,
      "declared",
      null,
      null,
      null,
      null,
      null,
    ]);

    // The seed's contest ids carry the seat name ('wb-assembly-2011:alipurduars-012'); this file's do
    // not, deliberately. Where the registry already has a contest for this election and seat, its id is
    // the one every existing candidacy, result and claim already points at — so adopt it, and do not
    // rewrite the row.
    //
    // An assembly election id already names its state, but a general election's does not: every state
    // numbers its parliamentary seats from 1, so 'ls-2024:s001' is Uttar Pradesh's first seat and West
    // Bengal's, and the second import to run would repoint the first one's contest at its own seat. The
    // jurisdiction goes in the id.
    const cKey = `${electionId} ${vId}`;
    const adoptedC = adoptedContest.get(cKey);
    const seatSuffix = `${input.type === "GE" && !isBypoll ? `${j.id}-` : ""}s${String(seatNo).padStart(3, "0")}`;
    const contestId = adoptedC ?? `${electionId}:${seatSuffix}`;
    if (adoptedC === undefined) {
      contestRows.set(contestId, [contestId, electionId, vId, null, 1, "declared", null]);
      adoptedContest.set(cKey, contestId);
    } else if (preexisting.has(cKey) && !countedContests.has(cKey)) {
      countedContests.add(cKey);
      adoptedContests += 1;
    }

    // A contest ANOTHER SOURCE HAS ALREADY REPORTED is left exactly as it is. Without this the import
    // wrote a second candidate set into West Bengal's 2011, 2016 and 2021 contests — the seat pages then
    // carried two winners each — and its `turnout` upsert replaced the seed's hand-checked electors and
    // votes-polled for 281 of 294 seats with TCPD's ELECTORS and VALID VOTES, which is a different
    // measure (Amta: 82.4% became 87.7%).
    //
    // The cost is real and is counted below, not waved away: for those years the seed holds only the
    // leading contestants, so the fuller TCPD field is declined along with the duplicate. Choosing which
    // source supersedes the other for one contest — and re-pointing the affidavits that hang off the
    // seed's candidacies when it does — is the merge problem this project has a resolver for, and it
    // deserves a design pass rather than being settled by whichever import ran last.
    if (adoptedC !== undefined && reportedElsewhere.has(contestId)) {
      skip("contest already reported by another source — its candidate rows were left untouched");
      continue;
    }

    if (isNota(name, r["Party"] ?? "")) {
      notaVotes.set(contestId, num(r["Votes"]));
      skip("NOTA row — votes recorded as turnout.nota, not as a person");
      continue;
    }

    // ── person, keyed on TCPD's pid where present ────────────────────────────────────────────
    const personId =
      pid !== "" ? `tcpd-${pid.toLowerCase()}` : `${j.id}-${slug(name)}-${year}-${seatNo}`;
    if (pid === "") skip("row has no TCPD pid, person keyed on name and contest instead");

    const sex = (r["Sex"] ?? "").toUpperCase();
    const age = num(r["Age"]);
    personRows.set(personId, [
      personId,
      name,
      "latn",
      "{}",
      // person.sex is CHECK (sex IN ('m','f','o')) — single letters, which is what TCPD supplies anyway.
      // Writing "male" here failed the constraint on the first run; mapping to the schema's own vocabulary
      // rather than inventing a longer one is the fix.
      sex === "M" ? "m" : sex === "F" ? "f" : sex === "O" || sex === "TG" ? "o" : null,
      // Age is age AT THIS ELECTION, so a birth year derived from it is accurate to a year at best.
      age === null ? null : year - age,
      // 'approx', from the schema's own CHECK (exact|approx|unknown). Age is age AT THIS ELECTION, so a
      // birth year derived from it is accurate to about a year — which is precisely what approx means.
      age === null ? null : "approx",
      "auto",
      input.nowIso,
    ]);
    if (pid !== "") {
      identifierRows.set(`tcpd_pid|${pid}`, [personId, "tcpd_pid", pid, sourceId]);
    }
    aliasRows.set(`${personId}|${name}`, [
      personId,
      name,
      "latn",
      slug(name).replace(/-/g, ""),
      "eci_nomination",
      `${year}-01-01`,
      sourceId,
    ]);

    // ── party ────────────────────────────────────────────────────────────────────────────────
    const partyLabel = r["Party"] ?? "";
    const partyKey = partyLabel === "" ? null : partyLabel.toUpperCase();
    let partyVersionKey: string | null = null;
    if (partyKey !== null) {
      // Same rule as places: a party the registry already holds keeps its own row. TCPD's label is only
      // an abbreviation, and writing it over a curated row is a loss, not an update.
      if (!partyFromDb.has(partyKey)) {
        partyRows.set(partyKey, [
          partyKey,
          partyLabel,
          "{}",
          partyLabel,
          r["Party_Type_TCPD"] === "National Party" ? "national" : "state",
          null,
          null,
        ]);
      }
      partyVersionKey = partyKey;
      partyVersionRows.set(partyKey, [partyKey, "1900-01-01", null, partyLabel, null]);
    }

    // ── candidacy and result ─────────────────────────────────────────────────────────────────
    const candidacyId = `${contestId}:${personId}`;
    candidacyRows.set(candidacyId, [
      candidacyId,
      contestId,
      personId,
      null, // party_version_id is resolved after the party versions are written
      null,
      null,
      null,
      position === 1 ? "elected" : "defeated",
      age,
      r["MyNeta_education"] === "" ? null : (r["MyNeta_education"] ?? null),
      partyLabel === "" ? null : partyLabel,
    ]);

    const votes = num(r["Votes"]);
    const share = num(r["Vote_Share_Percentage"]);
    const margin = position === 1 ? num(r["Margin"]) : null;
    if (votes === null && share === null && margin === null) {
      skip("result row carries no votes, share or margin");
    } else {
      resultRows.set(candidacyId, [
        contestId,
        candidacyId,
        0,
        votes,
        null,
        null,
        share,
        position,
        position === 1 ? 1 : 0,
        margin,
        sourceId,
        input.nowIso,
      ]);
    }

    const electors = num(r["Electors"]);
    const valid = num(r["Valid_Votes"]);
    if (electors !== null || valid !== null) {
      turnoutRows.set(contestId, [
        contestId,
        "contest",
        electors,
        valid,
        null,
        null,
        null,
        null,
        notaVotes.get(contestId) ?? null,
        sourceId,
      ]);
    }
  }

  // ── write, parents before children ─────────────────────────────────────────────────────────
  // One savepoint around all thirteen tables. Sikkim's first import failed on place_version — a
  // reservation value the schema had never seen — and left the source, epoch and place rows behind,
  // because every insertMany owned its own transaction and nothing owned the import. A half-imported
  // state is worse than an unimported one: it looks loaded.
  const w = (table: string, cols: readonly string[], key: readonly string[], rows: Iterable<Param[]>): number => {
    const list = [...rows];
    return list.length === 0 ? 0 : insertMany(db, upsert(table, cols, key), list);
  };
  db.exec("SAVEPOINT import_lokdhaba");
  try {
    writeAll();
    db.exec("RELEASE import_lokdhaba");
  } catch (cause) {
    db.exec("ROLLBACK TO import_lokdhaba");
    db.exec("RELEASE import_lokdhaba");
    throw cause;
  }

  function writeAll(): void {
    w("source", ["id", "kind", "publisher", "title", "url", "archived_url", "retrieved_at", "published_on", "doc_hash", "hash_kind", "retrieval_kind"], ["id"], sourceRows);
    w("boundary_epoch", ["id", "name", "effective_from", "effective_to"], ["id"], epochRows.values());
    w("place", ["id", "kind", "parent_id", "canonical_name", "names", "lgd_code", "eci_code"], ["id"], placeRows.values());
    w(
      "place_version",
      ["id", "place_id", "jurisdiction_id", "kind", "epoch_id", "number", "canonical_name",
       "district_place_id", "reservation", "geometry_ref", "electors_at_creation",
       "source_constituency_key", "name_source_id", "name_conflict", "name_variants"],
      ["id"],
      versionRows.values(),
    );
    w("election", ["id", "kind", "level", "electorate_kind", "jurisdiction_place_id", "epoch_id", "name", "lifecycle", "announced_on", "notified_on", "counting_on", "forecast_gate_from", "forecast_gate_to"], ["id"], electionRows.values());
    w("contest", ["id", "election_id", "place_version_id", "phase_n", "seats_available", "lifecycle", "declared_at"], ["id"], contestRows.values());
    w("person", ["id", "canonical_name", "canonical_name_script", "names", "sex", "birth_year", "birth_year_confidence", "review_state", "created_at"], ["id"], personRows.values());
    w("person_identifier", ["person_id", "scheme", "value", "source_id"], ["scheme", "value"], identifierRows.values());
    w("person_alias", ["person_id", "name", "script", "norm_key", "kind", "first_seen", "source_id"], ["person_id", "name", "script", "norm_key"], aliasRows.values());
    w("party", ["id", "name", "names", "short_name", "kind", "registered_on", "dissolved_on"], ["id"], partyRows.values());

    // party_version has an autoincrement id, so it is inserted then read back to resolve candidacies.
    for (const [partyId, row] of partyVersionRows) {
      insertMany(
        db,
        `INSERT INTO party_version (party_id, valid_from, valid_to, name, symbol_id)
           VALUES (?,?,?,?,?)
           ON CONFLICT DO NOTHING`,
        [[partyId, row[1] ?? null, row[2] ?? null, row[3] ?? null, row[4] ?? null]],
      );
    }
    const pvByParty = new Map<string, number>();
    for (const r of db
      .prepare(`SELECT id, party_id FROM party_version`)
      .all() as { id: number; party_id: string }[]) {
      if (!pvByParty.has(r.party_id)) pvByParty.set(r.party_id, r.id);
    }
    for (const row of candidacyRows.values()) {
      const raw = row[10];
      const key = typeof raw === "string" ? raw.toUpperCase() : null;
      row[3] = key === null ? null : (pvByParty.get(key) ?? null);
    }

    w("candidacy", ["id", "contest_id", "person_id", "party_version_id", "alliance_version_id", "symbol_id", "serial_no", "status", "age_declared", "education_declared", "party_raw"], ["id"], candidacyRows.values());
    w("result", ["contest_id", "candidacy_id", "revision", "votes", "postal_votes", "evm_votes", "vote_share", '"rank"', "is_winner", "margin", "source_id", "ingested_at"], ["contest_id", "candidacy_id", "revision"], resultRows.values());
    // NOTA can appear after the row that produced the turnout entry for the same contest, so the value is
    // stitched in here rather than relying on file order.
    for (const [contestId, votes] of notaVotes) {
      const row = turnoutRows.get(contestId);
      if (row !== undefined) row[8] = votes;
      else turnoutRows.set(contestId, [contestId, "contest", null, null, null, null, null, null, votes, sourceId]);
    }
    w("turnout", ["contest_id", "scope", "electors", "voters", "male", "female", "third_gender", "postal", "nota", "source_id"], ["contest_id", "scope"], turnoutRows.values());
  }

  return {
    state: j.name,
    type: input.type,
    url: input.file.url,
    sha256: input.file.sha256,
    retrievedAt: input.file.retrievedAt,
    cached: input.file.cached,
    rowsRead: rows.length,
    elections: electionRows.size,
    contests: contestRows.size,
    candidacies: candidacyRows.size,
    results: resultRows.size,
    persons: personRows.size,
    tcpdIds: identifierRows.size,
    parties: partyRows.size,
    epochs: epochRows.size,
    adoptedVersions,
    adoptedContests,
    adoptedPlaces: adoptedPlaces.size,
    skipped: [...skipped.entries()].map(([reason, count]) => ({ reason, count })),
  };
}

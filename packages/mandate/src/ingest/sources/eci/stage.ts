/**
 * Stage the 2024 Lok Sabha: parse the four reports, normalize, join, and resolve every constituency to
 * a `place_version` — all BEFORE a single row is written to the registry.
 *
 * The output is a JSON document on disk (`.data/cache/eci/staging/ls-2024.json`). validate.ts reads it
 * and import.ts writes it. Nothing here touches the registry except to READ the identities it must
 * resolve against, so a failed stage leaves no trace and a validation failure costs nothing.
 *
 * RAW IS NEVER MUTATED. Every source value is kept under a `raw…` field and every value derived for
 * matching sits beside it under a `norm…` field. `BISHNUPUR(SC)` stays `BISHNUPUR(SC)`; the normalized
 * form used to find the seat is `BISHNUPUR`. See FIELD_CLASS at the bottom for the full RAW / NORMALIZED
 * / DERIVED / INFERRED classification, which a test asserts against the staged record's own keys.
 *
 * THE FOUR REPORTS, AND WHY FOUR.
 *   33  every candidate of every constituency — the only file with the full candidate list.
 *   13  PC NUMBER and turnout. Report 33 identifies a seat by name only.
 *    4  the winner and the margin, stated outright, plus the constituency's reservation.
 *   2A  Surat. ECI's own note on report 4: "based on election related data of 542 PCs only excluding
 *       data of PC-24:Surat due to unopposed election in the PC". Without 2A the import is 542 of 543.
 */

import type { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { all } from "../../../db/index.ts";
import { slug } from "../../../core/ids.ts";
import { ECI_CACHE_DIR, type RawArtefact, readRaw } from "./acquire.ts";
import { readSheet, type Sheet } from "./sheet.ts";

export const LS2024_ELECTION_ID = "ls-2024";
export const LS2024_EPOCH_ID = "delim-2008";
export const LS2024_EXPECTED_PCS = 543;
/** ECI publishes 542 in reports 33/13/4 and Surat separately. Its own note says so. */
export const LS2024_REPORTED_PCS = 542;
export const STAGING_DIR = join(ECI_CACHE_DIR, "staging");

// ── normalization ─────────────────────────────────────────────────────────────────────────────────

/** Reservation markers ECI appends to a constituency name: 'Araku (ST)', 'BISHNUPUR(SC)'. */
const RESERVATION_MARKER = /\s*\((SC|ST|GEN|GENERAL)\)\s*$/i;

/**
 * The value a name is MATCHED on. Never stored as the name.
 *
 * Strips the reservation marker and every non-alphanumeric, and uppercases — so 'Araku (ST)',
 * 'ARAKU' and 'Araku' all match, while 'Araku' and 'Arakku' still do not. This is the same
 * normalisation the registry already needed for its own seat names; see place-page.ts.
 */
export function normName(s: string): string {
  return s.replace(RESERVATION_MARKER, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** The reservation a name's own marker asserts, or null when it carries none. */
export function markerReservation(name: string): "general" | "sc" | "st" | null {
  const m = RESERVATION_MARKER.exec(name)?.[1]?.toUpperCase();
  if (m === "SC") return "sc";
  if (m === "ST") return "st";
  if (m === "GEN" || m === "GENERAL") return "general";
  return null;
}

/** Report 4's `Constituency Type` column: 'ST' | 'SC' | 'GEN'. */
export function typeReservation(v: string): "general" | "sc" | "st" | null {
  const t = v.trim().toUpperCase();
  if (t === "SC") return "sc";
  if (t === "ST") return "st";
  if (t === "GEN" || t === "GENERAL") return "general";
  return null;
}

const text = (v: string | undefined): string => (v ?? "").replace(/\s+/g, " ").trim();

/** An integer, or null. '' and '-' are ABSENT, which is not 0 — Surat's vote count is '-'. */
export function int(v: string | undefined): number | null {
  const t = (v ?? "").trim().replace(/,/g, "");
  if (t === "" || t === "-" || t === "NA" || t === "N/A") return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** A decimal, or null. Same absence rules as `int`. */
export function dec(v: string | undefined): number | null {
  const t = (v ?? "").trim().replace(/,/g, "").replace(/%$/, "");
  if (t === "" || t === "-" || t === "NA" || t === "N/A") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const GENDER: Record<string, "m" | "f" | "o"> = {
  MALE: "m", M: "m", FEMALE: "f", F: "f", THIRDGENDER: "o", TG: "o", OTHERS: "o", O: "o", THIRD: "o",
};
export function sex(v: string): "m" | "f" | "o" | null {
  return GENDER[v.trim().toUpperCase().replace(/[^A-Z]/g, "")] ?? null;
}

/**
 * ECI state/UT names → this registry's jurisdiction ids.
 *
 * Only the names that do NOT match a `place.canonical_name` after normalisation are listed; everything
 * else resolves against the registry itself, so this map stays small and every entry is a real
 * disagreement rather than a restatement. An ECI name that resolves to nothing is a THROW, never a
 * skipped row — a silently dropped state is 40 missing constituencies that validate as "complete".
 */
export const ECI_STATE_ALIAS: Record<string, string> = {
  NCTOFDELHI: "dl",
  ANDAMANNICOBARISLANDS: "an",
  DADRANAGARHAVELIANDDAMANDIU: "dh",
  DADRAANDNAGARHAVELIANDDAMANANDDIU: "dh",
  JAMMUANDKASHMIR: "jk",
  ORISSA: "od",
  PONDICHERRY: "py",
  UTTARANCHAL: "uk",
};

export function jurisdictionResolver(db: DatabaseSync): (eciName: string) => string {
  const byName = new Map<string, string>();
  for (const p of all<{ id: string; canonical_name: string }>(
    db,
    "SELECT id, canonical_name FROM place WHERE kind IN ('state','ut')",
  )) {
    byName.set(normName(p.canonical_name), p.id);
  }
  return (eciName: string): string => {
    const key = normName(eciName);
    const id = byName.get(key) ?? ECI_STATE_ALIAS[key];
    if (id === undefined) {
      throw new Error(
        `ECI state "${eciName}" (normalized ${key}) matches no jurisdiction. Add it to ECI_STATE_ALIAS — ` +
          `dropping it would silently lose every constituency in it`,
      );
    }
    return id;
  };
}

// ── the staged shapes ─────────────────────────────────────────────────────────────────────────────

export type StagedCandidate = {
  /** Deterministic and content-derived: same report bytes → same id, on any machine, forever. */
  eciCandidateId: string;
  rawName: string;
  normName: string;
  rawGender: string;
  rawAge: string;
  rawCategory: string;
  rawParty: string;
  rawSymbol: string;
  sex: "m" | "f" | "o" | null;
  age: number | null;
  evmVotes: number | null;
  postalVotes: number | null;
  totalVotes: number | null;
  /** ECI reports three denominators; all three are kept because all three are published. */
  shareOfValid: number | null;
  shareOfPolled: number | null;
  shareOfElectors: number | null;
  /** DERIVED from totalVotes descending, then cross-checked against the report's row order. */
  rank: number;
  /** RAW: report 4 names the winner outright, so this is not inferred from rank. */
  isWinner: boolean;
  /** RAW on the winner only, from report 4. */
  margin: number | null;
};

export type StagedTurnout = {
  electors: number | null;
  voters: number | null;
  male: number | null;
  female: number | null;
  thirdGender: number | null;
  postal: number | null;
  nota: number | null;
  pollingStations: number | null;
  serviceElectors: number | null;
  overseasElectors: number | null;
  turnoutPct: number | null;
};

export type Resolution = "ADOPTED" | "CREATE" | "UNRESOLVED";

export type StagedContest = {
  jurisdictionId: string;
  number: number;
  /** The source's own spelling, kept exactly. Reservation marker and all. */
  rawName: string;
  normName: string;
  reservation: "general" | "sc" | "st" | null;
  /** Set when report 4's type column and the name's own marker disagree. Recorded, never reconciled. */
  reservationConflict: string | null;
  placeVersionId: number | null;
  resolution: Resolution;
  /** Why the resolution came out the way it did, in words, for the report. */
  resolutionNote: string;
  /** Set when an adopted seat's registry name differs from ECI's. Recorded, never overwritten. */
  nameMismatch: string | null;
  totalVotesPolled: number | null;
  totalValidVotes: number | null;
  turnout: StagedTurnout;
  /** True for Surat: won unopposed, so ECI publishes no vote count anywhere. */
  unopposed: boolean;
  candidates: StagedCandidate[];
  /** Which reports contributed. Surat has only report 2(A). */
  fromReports: string[];
};

export type Staged = {
  electionId: string;
  epochId: string;
  stagedAt: string;
  sources: RawArtefact[];
  /** ECI's own name for the election, and its own note about Surat. */
  eciCategoryName: string;
  eciSuratNote: string;
  contests: StagedContest[];
  unresolved: { what: string; detail: string }[];
  counts: {
    report33Rows: number;
    report13Rows: number;
    report4Rows: number;
    joinResolved: number;
    joinAttempted: number;
    contests: number;
    candidates: number;
    notaContests: number;
  };
};

// ── report parsers ────────────────────────────────────────────────────────────────────────────────

/** Find the header row by the labels it must contain, rather than trusting a fixed row index. */
function headerRow(sheet: Sheet, must: readonly string[], label: string): number {
  for (let i = 0; i < Math.min(sheet.length, 12); i += 1) {
    const cells = (sheet[i] ?? []).map((c) => normName(c));
    if (must.every((m) => cells.includes(normName(m)))) return i;
  }
  throw new Error(`${label}: no header row containing ${must.join(", ")} in the first 12 rows`);
}

export type R33Row = {
  state: string; pcName: string; candidate: string; gender: string; age: string; category: string;
  party: string; symbol: string; totalPolled: number | null; validVotes: number | null;
  evm: number | null; postal: number | null; total: number | null;
  ofElectors: number | null; ofPolled: number | null; ofValid: number | null; electors: number | null;
};

/** Report 33 — Constituency Wise Detailed Result. One row per candidate, plus a NOTA row per seat. */
export function parseReport33(sheet: Sheet): R33Row[] {
  const h = headerRow(sheet, ["State Name", "PC Name", "Candidate Name"], "report 33");
  const out: R33Row[] = [];
  for (const r of sheet.slice(h + 1)) {
    const state = text(r[0]);
    const pcName = text(r[1]);
    const candidate = text(r[2]);
    // Footnote and disclaimer rows have a first cell and nothing else that matters.
    if (state === "" || pcName === "" || candidate === "") continue;
    if (/^(note|disclaimer)\b/i.test(state)) continue;
    out.push({
      state, pcName, candidate,
      gender: text(r[3]), age: text(r[4]), category: text(r[5]),
      party: text(r[6]), symbol: text(r[7]),
      totalPolled: int(r[8]), validVotes: int(r[9]),
      evm: int(r[10]), postal: int(r[11]), total: int(r[12]),
      ofElectors: dec(r[13]), ofPolled: dec(r[14]), ofValid: dec(r[15]), electors: int(r[16]),
    });
  }
  return out;
}

export type R13Row = {
  state: string; number: number; pcName: string; pollingStations: number | null;
  electorsMale: number | null; electorsFemale: number | null; electorsTg: number | null;
  electors: number | null; serviceElectors: number | null;
  evmMale: number | null; evmFemale: number | null; evmTg: number | null; evmTotal: number | null;
  nri: number | null; postal: number | null; voters: number | null; turnoutPct: number | null;
};

/** Report 13 — PC Wise Voters Turn Out. The only report that numbers the constituencies. */
export function parseReport13(sheet: Sheet): R13Row[] {
  const h = headerRow(sheet, ["State Name", "PC NO.", "PC NAME"], "report 13");
  const out: R13Row[] = [];
  for (const r of sheet.slice(h + 1)) {
    const n = int(r[1]);
    if (n === null || text(r[0]) === "" || text(r[2]) === "") continue;
    out.push({
      state: text(r[0]), number: n, pcName: text(r[2]), pollingStations: int(r[3]),
      electorsMale: int(r[4]), electorsFemale: int(r[5]), electorsTg: int(r[6]),
      electors: int(r[7]), serviceElectors: int(r[8]),
      evmMale: int(r[9]), evmFemale: int(r[10]), evmTg: int(r[11]), evmTotal: int(r[12]),
      nri: int(r[13]), postal: int(r[14]), voters: int(r[15]), turnoutPct: dec(r[16]),
    });
  }
  return out;
}

export type R4Row = {
  state: string; number: number; pcName: string; type: string; totalValidVotes: number | null;
  winner: string; winnerCategory: string; winnerGender: string; winnerParty: string;
  winnerSymbol: string; winnerVotes: number | null;
  runnerUp: string; runnerUpParty: string; runnerUpVotes: number | null;
  margin: number | null; marginPct: number | null;
};

/** Report 4 — List Of Successful Candidate. Winner, runner-up, margin and reservation, all stated. */
export function parseReport4(sheet: Sheet): R4Row[] {
  const h = headerRow(sheet, ["State", "Const No.", "Winner Name"], "report 4");
  const out: R4Row[] = [];
  for (const r of sheet.slice(h + 1)) {
    const n = int(r[2]);
    if (n === null || text(r[1]) === "" || text(r[6]) === "") continue;
    out.push({
      state: text(r[1]), number: n, pcName: text(r[3]), type: text(r[4]), totalValidVotes: int(r[5]),
      winner: text(r[6]), winnerCategory: text(r[7]), winnerGender: text(r[8]), winnerParty: text(r[9]),
      winnerSymbol: text(r[10]), winnerVotes: int(r[11]),
      runnerUp: text(r[12]), runnerUpParty: text(r[15]), runnerUpVotes: int(r[17]),
      margin: int(r[18]), marginPct: dec(r[19]),
    });
  }
  return out;
}

export type SuratRow = {
  state: string; stateCode: string; pcName: string; number: number; reservation: string;
  winner: string; winnerParty: string;
  electors: number | null; electorsMale: number | null; electorsFemale: number | null;
  electorsTg: number | null; overseas: number | null; service: number | null;
  pollingStations: number | null; contested: number | null;
  /** ECI's own words about why this constituency has its own report. */
  note: string;
};

/**
 * Report 2(A) — the 543rd constituency.
 *
 * Not a table: a label/value sheet with section headers. Parsed by finding each labelled row rather than
 * by fixed offsets, because a layout that is bespoke to one file is the layout most likely to shift.
 */
export function parseSurat(sheet: Sheet): SuratRow {
  const head = sheet[1] ?? [];
  const stateAndCode = text(head[1]);            // 'Gujarat-S06'
  const nameAndCode = text(head[3]);             // 'Surat-GEN'
  const number = int(head[5]);
  if (number === null) throw new Error(`report 2(A): no constituency number in row 1 (${head.join(" | ")})`);

  /** The row whose second cell is `label`, within the section started by `section`. */
  const row = (section: string, label: string): string[] | undefined => {
    let inSection = false;
    for (const r of sheet) {
      const first = normName(r[0] ?? "");
      if (first !== "") inSection = first === normName(section);
      if (inSection && normName(r[1] ?? "") === normName(label)) return r;
    }
    return undefined;
  };
  const electors = row("ELECTORS", "Total");
  const overseas = row("ELECTORS", "OverSeas");
  const service = row("ELECTORS", "Service");
  const contested = row("CANDIDATES", "Contested");
  const ps = row("POLLING STATION", "Number");
  const winner = row("RESULT", "Winner");

  return {
    state: stateAndCode.replace(/-[SU]\d+$/i, ""),
    stateCode: /-([SU]\d+)$/i.exec(stateAndCode)?.[1] ?? "",
    pcName: nameAndCode.replace(/-(GEN|SC|ST|GENERAL)$/i, ""),
    number,
    reservation: /-(GEN|SC|ST|GENERAL)$/i.exec(nameAndCode)?.[1] ?? "",
    winner: text(winner?.[4]),
    winnerParty: text(winner?.[3]),
    electors: int(electors?.[6]),
    electorsMale: int(electors?.[3]),
    electorsFemale: int(electors?.[4]),
    electorsTg: int(electors?.[5]),
    overseas: int(overseas?.[6]),
    service: int(service?.[6]),
    pollingStations: int(ps?.[3]),
    contested: int(contested?.[6]),
    // Filled by the caller from report 4, which is where ECI states why Surat has its own report.
    note: "",
  };
}

// ── staging ───────────────────────────────────────────────────────────────────────────────────────

type Sheets = { r33: Sheet; r13: Sheet; r4: Sheet; surat: Sheet };

/**
 * ECI's own explanation of why 542 and not 543, quoted from report 4's footer.
 *
 * Carried into the staged document and the import report so the shortfall is never something a reader has
 * to reconstruct: the Commission says outright which constituency is missing and where it went.
 */
export function suratNote(r4: Sheet): string {
  return r4.flat().find((c) => /unopposed/i.test(c) && /surat/i.test(c)) ?? "";
}

/** Read the four reports out of the raw store, verifying each one's hash on the way in. */
export function readReports(raw: readonly RawArtefact[]): Sheets {
  const of = (reportNo: string): Sheet => {
    const a = raw.find((r) => r.reportNo === reportNo);
    if (a === undefined) {
      throw new Error(`no acquired artefact for report ${reportNo} (have ${raw.map((r) => r.reportNo).join(", ")})`);
    }
    return readSheet(readRaw(a));
  };
  return { r33: of("33"), r13: of("13"), r4: of("4"), surat: of("2(A)") };
}

/**
 * Build the staged dataset.
 *
 * `db` is READ ONLY here: it supplies the jurisdiction names and the existing `place_version` slots so
 * every constituency can be resolved before import. Nothing is written.
 */
export function stageLs2024(
  db: DatabaseSync,
  raw: readonly RawArtefact[],
  sheets: Sheets,
  opts: { now?: () => string; categoryName?: string } = {},
): Staged {
  const now = opts.now ?? (() => new Date().toISOString());
  const jurisdictionOf = jurisdictionResolver(db);
  const unresolved: { what: string; detail: string }[] = [];

  const r33 = parseReport33(sheets.r33);
  const r13 = parseReport13(sheets.r13);
  const r4 = parseReport4(sheets.r4);
  const surat = parseSurat(sheets.surat);

  // ── the join: report 33 identifies a seat by NAME, reports 13 and 4 give it a NUMBER ─────────────
  //
  // Keyed on (jurisdiction, normalized name) because ECI spells the same seat 'Araku' in report 33 and
  // 'Araku (ST)' in report 13. Verified total during reconnaissance: 542 of 542, no collisions. A miss
  // here is never guessed around — it lands in `unresolved`.
  const numberOf = new Map<string, { number: number; r13: R13Row }>();
  const dupKeys: string[] = [];
  for (const row of r13) {
    const j = jurisdictionOf(row.state);
    const key = `${j}|${normName(row.pcName)}`;
    if (numberOf.has(key)) dupKeys.push(key);
    numberOf.set(key, { number: row.number, r13: row });
  }
  for (const k of dupKeys) unresolved.push({ what: "report 13 duplicate seat name", detail: k });

  const r4By = new Map<string, R4Row>();
  for (const row of r4) r4By.set(`${jurisdictionOf(row.state)}|${row.number}`, row);

  // ── group report 33's candidate rows into contests ───────────────────────────────────────────────
  type Group = { j: string; rawName: string; rows: R33Row[] };
  const groups = new Map<string, Group>();
  for (const row of r33) {
    const j = jurisdictionOf(row.state);
    const key = `${j}|${normName(row.pcName)}`;
    const g = groups.get(key) ?? { j, rawName: row.pcName, rows: [] };
    g.rows.push(row);
    groups.set(key, g);
  }

  // ── existing place_version slots, so a seat is adopted rather than duplicated ────────────────────
  const slots = new Map<string, { id: number; name: string; reservation: string | null }>();
  /** Which numbers each name currently occupies, so renumbering can be told from a spelling variant. */
  const nameAt = new Map<string, number[]>();
  for (const v of all<{ id: number; jurisdiction_id: string; number: number; canonical_name: string; reservation: string | null }>(
    db,
    `SELECT id, jurisdiction_id, number, canonical_name, reservation FROM place_version
      WHERE kind = 'pc' AND epoch_id = ?`,
    LS2024_EPOCH_ID,
  )) {
    slots.set(`${v.jurisdiction_id}|${v.number}`, { id: v.id, name: v.canonical_name, reservation: v.reservation });
    const key = `${v.jurisdiction_id}|${normName(v.canonical_name)}`;
    nameAt.set(key, [...(nameAt.get(key) ?? []), v.number]);
  }

  const contests: StagedContest[] = [];
  let joinResolved = 0;

  for (const [key, g] of groups) {
    const hit = numberOf.get(key);
    if (hit === undefined) {
      unresolved.push({
        what: "constituency number",
        detail: `${g.j} "${g.rawName}" appears in report 33 but not in report 13 — no PC number, not imported`,
      });
      continue;
    }
    joinResolved += 1;
    const r4row = r4By.get(`${g.j}|${hit.number}`);
    contests.push(
      buildContest({
        j: g.j, number: hit.number, rawName: g.rawName, rows: g.rows, r13: hit.r13, r4: r4row,
        slots, nameAt, unresolved,
        fromReports: ["33", "13", ...(r4row === undefined ? [] : ["4"])],
      }),
    );
  }

  // ── the 543rd: Surat, from report 2(A) only ─────────────────────────────────────────────────────
  const suratJ = jurisdictionOf(surat.state);
  if (contests.some((c) => c.jurisdictionId === suratJ && c.number === surat.number)) {
    unresolved.push({
      what: "Surat double-counted",
      detail: `${suratJ} PC ${surat.number} came from both report 33 and report 2(A) — ECI's exclusion note no longer holds`,
    });
  } else {
    contests.push(suratContest(surat, suratJ, slots, nameAt, unresolved));
  }

  /**
   * Quarantine a whole jurisdiction once ANY of its seats is provably renumbered.
   *
   * A state that was re-delimited did not renumber some seats and keep others: every seat in it belongs
   * to the new electoral geography, including the ones whose name happens to land on the same number as
   * before. Importing the coincidences would put a mix of two geographies inside one state and one
   * election — which is what `mandate geography validate` check 2 exists to catch, and worse, would look
   * complete. Assam (13 of 14 seats renamed, 7 provably renumbered) and Jammu & Kashmir (3 of 5, 2
   * provably) are the two 2024 cases; both were re-delimited after the 2008 order.
   */
  const renumbered = new Set(
    unresolved.filter((u) => u.what === "constituency renumbered").map((u) => u.detail.split(" ")[0] as string),
  );
  for (const c of contests) {
    if (!renumbered.has(c.jurisdictionId) || c.resolution === "UNRESOLVED") continue;
    c.placeVersionId = null;
    c.resolution = "UNRESOLVED";
    c.resolutionNote =
      `${c.jurisdictionId} was renumbered after ${LS2024_EPOCH_ID}, so every seat in it is quarantined — ` +
      `this one's number and name happen to agree, which is not evidence that it is the same constituency`;
  }
  for (const j of renumbered) {
    unresolved.push({
      what: "jurisdiction quarantined",
      detail:
        `${j}: every 2024 parliamentary seat is held back. Its constituencies were re-delimited after the ` +
        `2008 order, so they are not ${LS2024_EPOCH_ID} slots. Unblocking them needs the ECI delimitation ` +
        `order for ${j} as a cited source, and a boundary_epoch row built from it — not a name match`,
    });
  }

  contests.sort((a, z) => (a.jurisdictionId === z.jurisdictionId ? a.number - z.number : a.jurisdictionId < z.jurisdictionId ? -1 : 1));

  return {
    electionId: LS2024_ELECTION_ID,
    epochId: LS2024_EPOCH_ID,
    stagedAt: now(),
    sources: [...raw],
    eciCategoryName: opts.categoryName ?? "General Election to Loksabha-2024",
    eciSuratNote: suratNote(sheets.r4),
    contests,
    unresolved,
    counts: {
      report33Rows: r33.length,
      report13Rows: r13.length,
      report4Rows: r4.length,
      joinResolved,
      joinAttempted: groups.size,
      contests: contests.length,
      candidates: contests.reduce((n, c) => n + c.candidates.length, 0),
      notaContests: contests.filter((c) => c.turnout.nota !== null).length,
    },
  };
}

function buildContest(a: {
  j: string; number: number; rawName: string; rows: R33Row[]; r13: R13Row; r4: R4Row | undefined;
  slots: Map<string, { id: number; name: string; reservation: string | null }>;
  nameAt: Map<string, number[]>;
  unresolved: { what: string; detail: string }[]; fromReports: string[];
}): StagedContest {
  // NOTA is not a person. Its votes belong in `turnout`, which is the only place the registry models it.
  const notaRow = a.rows.find((r) => normName(r.candidate) === "NOTA");
  const candidateRows = a.rows.filter((r) => normName(r.candidate) !== "NOTA");

  const winnerNorm = a.r4 === undefined ? null : normName(a.r4.winner);
  const winnerVotes = a.r4?.winnerVotes ?? null;
  const ranked = [...candidateRows].sort((x, z) => (z.total ?? -1) - (x.total ?? -1));

  /**
   * Which row is the winner report 4 names.
   *
   * Name alone is not enough, and this is real data rather than a hypothetical: seven 2024 seats fielded
   * an INDEPENDENT with the same name as the eventual winner — Rewa had two JANARDAN MISHRAs, one on
   * 477,459 votes and one on 2,295 — which is a known tactic to split a recognisable name. Matching on
   * name marked both, so 543 contests produced 550 winners. The vote count report 4 states alongside the
   * name is what separates them.
   */
  const winnerRow =
    winnerNorm === null
      ? undefined
      : (ranked.find((r) => normName(r.candidate) === winnerNorm && r.total === winnerVotes) ??
         ranked.find((r) => normName(r.candidate) === winnerNorm));

  // A deterministic, content-derived candidate id. Name alone would collide for exactly the seats above,
  // so party and then votes widen the key. Nothing positional is used, so the id survives a re-ordered
  // report — which is what makes a re-import idempotent.
  const seen = new Map<string, number>();
  const idFor = (r: R33Row): string => {
    const base = `${LS2024_ELECTION_ID}:${a.j}-pc${a.number}:${slug(r.candidate)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${slug(r.party)}-${r.total ?? n}`;
  };

  const candidates: StagedCandidate[] = ranked.map((r, i) => ({
    eciCandidateId: idFor(r),
    rawName: r.candidate,
    normName: normName(r.candidate),
    rawGender: r.gender,
    rawAge: r.age,
    rawCategory: r.category,
    rawParty: r.party,
    rawSymbol: r.symbol,
    sex: sex(r.gender),
    age: int(r.age),
    evmVotes: r.evm,
    postalVotes: r.postal,
    totalVotes: r.total,
    shareOfValid: r.ofValid,
    shareOfPolled: r.ofPolled,
    shareOfElectors: r.ofElectors,
    rank: i + 1,
    isWinner: r === winnerRow,
    margin: r === winnerRow ? (a.r4?.margin ?? null) : null,
  }));

  // Reservation: report 4's type column and the name's own marker are two independent assertions.
  const fromType = a.r4 === undefined ? null : typeReservation(a.r4.type);
  const fromMarker = markerReservation(a.r13.pcName) ?? markerReservation(a.rawName);
  const conflict =
    fromType !== null && fromMarker !== null && fromType !== fromMarker
      ? `report 4 says ${fromType}, the name "${a.r13.pcName}" says ${fromMarker}`
      : null;

  const resolved = resolveSlot(a.j, a.number, a.rawName, a.slots, a.nameAt, a.unresolved);
  return {
    jurisdictionId: a.j,
    number: a.number,
    rawName: a.rawName,
    normName: normName(a.rawName),
    reservation: fromType ?? fromMarker,
    reservationConflict: conflict,
    ...resolved,
    totalVotesPolled: a.rows[0]?.totalPolled ?? null,
    totalValidVotes: a.r4?.totalValidVotes ?? a.rows[0]?.validVotes ?? null,
    turnout: {
      electors: a.r13.electors,
      voters: a.r13.voters,
      male: a.r13.evmMale,
      female: a.r13.evmFemale,
      thirdGender: a.r13.evmTg,
      postal: a.r13.postal,
      nota: notaRow?.total ?? null,
      pollingStations: a.r13.pollingStations,
      serviceElectors: a.r13.serviceElectors,
      overseasElectors: a.r13.nri,
      turnoutPct: a.r13.turnoutPct,
    },
    unopposed: false,
    candidates,
    fromReports: a.fromReports,
  };
}

/**
 * Surat: elected unopposed, so ECI publishes no vote count for it anywhere.
 *
 * The candidacy is staged with no result figures at all — not zeros. `result_has_a_figure` requires one
 * of votes / margin / vote_share, so the importer deliberately writes NO result row for this contest and
 * records the unopposed election as a cited claim instead. A fabricated 0 here is exactly the defect
 * migration 007 existed to undo.
 */
function suratContest(
  s: SuratRow,
  j: string,
  slots: Map<string, { id: number; name: string; reservation: string | null }>,
  nameAt: Map<string, number[]>,
  unresolved: { what: string; detail: string }[],
): StagedContest {
  const resolved = resolveSlot(j, s.number, s.pcName, slots, nameAt, unresolved);
  return {
    jurisdictionId: j,
    number: s.number,
    rawName: s.pcName,
    normName: normName(s.pcName),
    reservation: typeReservation(s.reservation),
    reservationConflict: null,
    ...resolved,
    totalVotesPolled: null,
    totalValidVotes: null,
    turnout: {
      electors: s.electors,
      voters: null,
      male: s.electorsMale,
      female: s.electorsFemale,
      thirdGender: s.electorsTg,
      postal: null,
      nota: null,
      pollingStations: s.pollingStations,
      serviceElectors: s.service,
      overseasElectors: s.overseas,
      turnoutPct: null,
    },
    unopposed: true,
    candidates: [
      {
        eciCandidateId: `${LS2024_ELECTION_ID}:${j}-pc${s.number}:${slug(s.winner)}`,
        rawName: s.winner,
        normName: normName(s.winner),
        rawGender: "",
        rawAge: "",
        rawCategory: "",
        rawParty: s.winnerParty,
        rawSymbol: "",
        sex: null,
        age: null,
        evmVotes: null,
        postalVotes: null,
        totalVotes: null,
        shareOfValid: null,
        shareOfPolled: null,
        shareOfElectors: null,
        rank: 1,
        isWinner: true,
        margin: null,
      },
    ],
    fromReports: ["2(A)"],
  };
}

/**
 * Resolve one ECI constituency to a `place_version`.
 *
 * The key is (jurisdiction, kind, epoch, number) — the registry's own identity since migration 011.
 * NEVER `place.canonical_name`, and never the seat number alone.
 *
 * Three outcomes, and the third is the one that matters:
 *
 *   ADOPTED     the slot exists and its name agrees, or differs only in spelling. The registry's name is
 *               left exactly as another source wrote it and ECI's spelling is recorded as a variant. Two
 *               sources disagreeing about a spelling is a fact; overwriting one destroys it.
 *   CREATE      no slot exists at that number. These are the six seats in jurisdictions this registry has
 *               never held a parliamentary constituency for, which is a genuine absence.
 *   UNRESOLVED  the slot exists but holds a DIFFERENT constituency — ECI's name for seat N is the
 *               registry's name for some other seat M. That is renumbering, not spelling, and adopting it
 *               would file one constituency's votes under another's name: the exact BIDAR/CHIKKODI defect
 *               docs/model/electoral-geography.md was written to undo.
 *
 * The renumbering test is decidable and carries no fuzzy matching: does ECI's name for this seat appear at
 * a DIFFERENT number in the same jurisdiction? 'ARUKU' vs 'Araku' is a spelling variant because no other
 * Andhra seat is called Araku. Assam's seat 1 'Kokrajhar' is renumbering because the registry's Kokrajhar
 * is seat 5. A 278-of-294 fuzzy name match was refused during the geography repair for the same reason.
 */
function resolveSlot(
  j: string,
  number: number,
  eciName: string,
  slots: Map<string, { id: number; name: string; reservation: string | null }>,
  nameAt: Map<string, number[]>,
  unresolved: { what: string; detail: string }[],
): { placeVersionId: number | null; resolution: Resolution; resolutionNote: string; nameMismatch: string | null } {
  if (number < 1 || number > 499) {
    unresolved.push({ what: "constituency number out of range", detail: `${j} PC ${number} ("${eciName}")` });
    return { placeVersionId: null, resolution: "UNRESOLVED", resolutionNote: `number ${number} outside 1-499`, nameMismatch: null };
  }
  const slot = slots.get(`${j}|${number}`);
  if (slot === undefined) {
    return {
      placeVersionId: null,
      resolution: "CREATE",
      resolutionNote: `${j} has no pc place_version numbered ${number} in ${LS2024_EPOCH_ID}`,
      nameMismatch: null,
    };
  }
  if (normName(slot.name) === normName(eciName)) {
    return { placeVersionId: slot.id, resolution: "ADOPTED", resolutionNote: `adopted place_version ${slot.id}`, nameMismatch: null };
  }
  const elsewhere = (nameAt.get(`${j}|${normName(eciName)}`) ?? []).filter((n) => n !== number);
  if (elsewhere.length > 0) {
    const detail =
      `${j} PC ${number}: ECI calls it "${eciName}", the registry calls PC ${elsewhere.join("/")} that ` +
      `and calls PC ${number} "${slot.name}" — the jurisdiction was renumbered after ${LS2024_EPOCH_ID}`;
    unresolved.push({ what: "constituency renumbered", detail });
    return { placeVersionId: null, resolution: "UNRESOLVED", resolutionNote: detail, nameMismatch: `registry "${slot.name}" vs ECI "${eciName}"` };
  }
  return {
    placeVersionId: slot.id,
    resolution: "ADOPTED",
    resolutionNote: `adopted place_version ${slot.id} (spelling differs)`,
    nameMismatch: `registry "${slot.name}" vs ECI "${eciName}"`,
  };
}

// ── the staged document on disk ───────────────────────────────────────────────────────────────────

export function stagingPath(electionId = LS2024_ELECTION_ID, dir = STAGING_DIR): string {
  return join(dir, `${electionId}.json`);
}

export function writeStaged(s: Staged, dir = STAGING_DIR): string {
  const path = stagingPath(s.electionId, dir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(s, null, 2)}\n`);
  return path;
}

export function readStaged(electionId = LS2024_ELECTION_ID, dir = STAGING_DIR): Staged {
  const path = stagingPath(electionId, dir);
  if (!existsSync(path)) {
    throw new Error(`no staged dataset at ${path} — run: mandate eci stage --election=${electionId}`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as Staged;
}

/**
 * How every staged field was obtained. Asserted against the staged shape by a test, so a new field
 * cannot be added without saying which of the four it is.
 *
 *   RAW         printed by ECI, carried through unchanged
 *   NORMALIZED  computed from a RAW value for matching only; never displayed as the fact
 *   DERIVED     computed from RAW values by arithmetic or ordering
 *   INFERRED    a judgement this pipeline made, which a human could disagree with
 */
export const FIELD_CLASS: Record<string, "RAW" | "NORMALIZED" | "DERIVED" | "INFERRED"> = {
  // contest
  jurisdictionId: "NORMALIZED",
  number: "RAW",
  rawName: "RAW",
  "contest.normName": "NORMALIZED",
  reservation: "RAW",
  reservationConflict: "DERIVED",
  placeVersionId: "INFERRED",
  resolution: "INFERRED",
  nameMismatch: "DERIVED",
  totalVotesPolled: "RAW",
  totalValidVotes: "RAW",
  unopposed: "RAW",
  // turnout — every one printed by report 13 or 2(A)
  electors: "RAW", voters: "RAW", male: "RAW", female: "RAW", thirdGender: "RAW",
  postal: "RAW", nota: "RAW", pollingStations: "RAW", serviceElectors: "RAW",
  overseasElectors: "RAW", turnoutPct: "RAW",
  // candidate
  eciCandidateId: "DERIVED",
  "candidate.rawName": "RAW",
  "candidate.normName": "NORMALIZED",
  rawGender: "RAW", rawAge: "RAW", rawCategory: "RAW", rawParty: "RAW", rawSymbol: "RAW",
  sex: "NORMALIZED",
  age: "RAW",
  evmVotes: "RAW", postalVotes: "RAW", totalVotes: "RAW",
  shareOfValid: "RAW", shareOfPolled: "RAW", shareOfElectors: "RAW",
  rank: "DERIVED",
  isWinner: "RAW",
  margin: "RAW",
};

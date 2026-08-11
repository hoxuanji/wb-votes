/**
 * Tests for the ECI 2024 Lok Sabha pipeline.
 *
 * Two halves, deliberately:
 *
 *   PURE      parsers, normalization and discovery-shape checks, on inline fixtures. Always run.
 *   FIXTURE   a real registry built in a temp directory, so idempotency and rollback are asserted on
 *             actual SQLite semantics rather than on a mock that cannot have a UNIQUE constraint.
 *   REAL      the acquired ECI artefacts, when `.data/cache/eci` holds them. These are the tests that
 *             would have caught every defect this pipeline actually had, so they assert exact numbers.
 *
 * Every number below was measured, not assumed: 8,901 report-33 rows, 542 constituencies in reports 13
 * and 4, 543 with Surat, 8,360 candidates, 543 winners.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { open } from "../../../db/index.ts";
import { migrate } from "../../../db/migrate.ts";
import { readSheet, sniff } from "./sheet.ts";
import { extractAccess, parseCategory, reportNumber } from "./discover.ts";
import { ECI_STATISTICAL_DISCLAIMER, artefactPath, sourceIdOf, type RawArtefact } from "./acquire.ts";
import {
  dec, int, markerReservation, normName, parseReport13, parseReport33, parseReport4, parseSurat,
  readReports, sex, stageLs2024, typeReservation, type Staged, type StagedContest,
} from "./stage.ts";
import { validateStaged } from "./validate.ts";
import { importStaged } from "./import.ts";

const NOW = "2026-08-11T00:00:00.000Z";
const CACHE = ".data/cache/eci";

// ── PURE: normalization ───────────────────────────────────────────────────────────────────────────

test("normalization strips the reservation marker for matching and never for storage", () => {
  // The source appends the reservation to the name; the registry has 102 such versions of its own.
  assert.equal(normName("BISHNUPUR(SC)"), "BISHNUPUR");
  assert.equal(normName("Araku (ST)"), "ARAKU");
  assert.equal(normName("ARUKU"), "ARUKU");
  assert.equal(normName("Coochbehar uttar"), "COOCHBEHARUTTAR");
  // Different seats stay different: normalization folds case and punctuation, not spelling.
  assert.notEqual(normName("Araku"), normName("Arakku"));

  assert.equal(markerReservation("BISHNUPUR(SC)"), "sc");
  assert.equal(markerReservation("Araku (ST)"), "st");
  assert.equal(markerReservation("Srikakulam"), null);
  assert.equal(typeReservation("GEN"), "general");
  assert.equal(typeReservation("SC"), "sc");
  assert.equal(typeReservation(""), null);
});

test("absence is not zero: '-' and '' parse to null", () => {
  // Surat's winner has '-' where a vote count would be, because no poll was held. Reading that as 0
  // would publish "0 votes" for a man who was elected unopposed.
  assert.equal(int("-"), null);
  assert.equal(int(""), null);
  assert.equal(int("NA"), null);
  assert.equal(int("1,786,287"), 1786287);
  assert.equal(int("0"), 0);
  assert.equal(dec("49.23"), 49.23);
  assert.equal(dec("-"), null);
  assert.equal(sex("FEMALE"), "f");
  assert.equal(sex("male"), "m");
  assert.equal(sex("Third Gender"), "o");
  assert.equal(sex(""), null);
});

// ── PURE: discovery ───────────────────────────────────────────────────────────────────────────────

test("the API base and the public secret are read from the bundle's own declaration", () => {
  // ECI declares both in one minified var statement. Matching the literal token would rot on rotation;
  // following `headers:{secret:s}` back to `s` resolved it to the string "function", because a minifier
  // reuses one-letter names. The declaration site is what is unambiguous.
  const bundle =
    `function x(){}var wl="ROTATED@TOKEN9",kl="https://www.eci.gov.in/eci-backend/public",Cl="https://www.eci.gov.in";` +
    `fetch(kl+"/api/election-result",{headers:{secret:s}});var s="function";var s="object";`;
  assert.deepEqual(extractAccess(bundle), {
    base: "https://www.eci.gov.in/eci-backend/public",
    secret: "ROTATED@TOKEN9",
  });
  // No `secret` header anywhere means the API changed shape, which must not be guessed past.
  assert.throws(() => extractAccess(`var kl="https://www.eci.gov.in/eci-backend/public";`), /never sends a `secret` header/);
  assert.throws(() => extractAccess("var a=1;"), /no assignment of the eci-backend\/public API base/);
});

test("ECI's report number, not its row id, identifies a report", () => {
  // GE-2024's row 36 holds report 33. The row id is positional and the URL carries an upload epoch, so
  // neither can key an artefact across runs.
  assert.equal(reportNumber("33.Constituency Wise Detailed Result"), "33");
  assert.equal(reportNumber("2(A).Constituency Data Summary For PC-SURAT"), "2(A)");
  assert.equal(reportNumber("1 - Other Abbreviations And Description"), "1");
  assert.equal(reportNumber("No leading number"), "");
});

test("a discovery response that says nothing is a failure, never an answer of zero", () => {
  const ok = JSON.stringify({
    code: 200, success: true, cat_name: "X", totalResults: 1,
    results: [{ id: 5, title: "33.Detailed", xlsx_url: "https://e/x.xls", pdf_zip_url: null }],
  });
  const cat = parseCategory(1, ok);
  assert.equal(cat.artefacts.length, 1);
  assert.equal(cat.artefacts[0]?.reportNo, "33");

  // Each of these has the same shape as a real answer of zero, and each is a different failure.
  assert.throws(() => parseCategory(1, JSON.stringify({ code: 200, success: true, results: [] })), /empty result is a failure/);
  assert.throws(() => parseCategory(1, JSON.stringify({ code: 401, success: false, results: [] })), /refusing to continue/);
  assert.throws(() => parseCategory(1, JSON.stringify({ code: 200, success: true, results: {} })), /not an array/);
  assert.throws(() => parseCategory(1, "<!doctype html>"), /not JSON/);
  // totalResults disagreeing with the rows means a truncated page, which would import as fewer seats.
  assert.throws(
    () => parseCategory(1, JSON.stringify({ code: 200, success: true, totalResults: 42, results: [{ id: 1, title: "1.x", xlsx_url: "https://e/x" }] })),
    /totalResults=42 but 1 rows/,
  );
  // An artefact count that changed upstream must stop the run rather than import a different corpus.
  assert.throws(() => parseCategory(1, ok, 42), /expected 42 artefacts, found 1/);
});

test("an artefact's cache path and source id come from its content, not its URL", () => {
  const a = { categoryId: 1, rowId: 36, reportNo: "33", title: "33.Constituency Wise Detailed Result",
    spreadsheetUrl: "https://x/33-Detailed_1778165388.xlsx", pdfUrl: null };
  // The upload epoch in the URL must not reach the path, or every re-upload orphans the cache.
  assert.equal(artefactPath(a, "/tmp/c"), "/tmp/c/1-33-Constituency-Wise-Detailed-Result/report-33.xlsx");
  assert.equal(sourceIdOf({ categoryId: 1, reportNo: "33", sha256: "abcdef0123456789".repeat(4) }), "eci:1:r33:abcdef012345");
});

// ── PURE: the spreadsheet readers ─────────────────────────────────────────────────────────────────

test("format is decided by magic bytes, because ECI mislabels its own files", () => {
  // One 2023 Rajasthan report is titled "…-pdf" and is an .xlsx. Trusting the extension would throw.
  assert.equal(sniff(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])), "xls");
  assert.equal(sniff(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])), "xlsx");
  assert.equal(sniff(Buffer.from("<!doctype html>")), "unknown");
  assert.throws(() => readSheet(Buffer.from("<!doctype html><p>error</p>")), /not a spreadsheet/);
});

// ── PURE: the report parsers, on inline fixtures ──────────────────────────────────────────────────

const R33_HEADER = ["State Name", "PC Name", "Candidate Name", "Gender", "Age", "Category", "Party Name",
  "Party Symbol", "Total Votes Polled In The Constituency", "Valid Votes", "General", "Postal", "Total",
  "Over Total Electors In Constituency", "Over Total Votes Polled In Constituency",
  "Over Total Valid Votes Polled In Constituency", "Total Electors"];

test("report 33 parses candidates and finds its header wherever it sits", () => {
  const sheet = [
    ["33 - CONSTITUENCY WISE DETAILED RESULT"],
    ["", "", "", "", "", "", "", "", "", "", "Votes Secured"],
    R33_HEADER,
    ["Andhra Pradesh", "Araku", "GUMMA THANUJA RANI", "FEMALE", "31", "ST", "YSRCP", "Ceiling fan",
      "1165787", "1113975", "471470", "5535", "477005", "30.63", "40.92", "42.82", "1557153"],
    ["Andhra Pradesh", "Araku", "NOTA", "", "", "", "NOTA", "NOTA",
      "1165787", "1113975", "50205", "265", "50470", "3.24", "4.33", "4.53", "1557153"],
    ["Note -This report is based on election related data of 542 PCs only"],
  ];
  const rows = parseReport33(sheet);
  assert.equal(rows.length, 2, "the footnote row is not a candidate");
  assert.equal(rows[0]?.candidate, "GUMMA THANUJA RANI");
  assert.equal(rows[0]?.age, "31");
  assert.equal(rows[0]?.evm, 471470);
  assert.equal(rows[0]?.postal, 5535);
  assert.equal(rows[0]?.total, 477005);
  assert.equal(rows[1]?.candidate, "NOTA", "NOTA is a row in this report and must survive parsing");
  assert.throws(() => parseReport33([["nothing"], ["at"], ["all"]]), /no header row/);
});

test("report 13 supplies the constituency number report 33 has no column for", () => {
  const sheet = [
    ["13 - PC Wise Voters Turn Out"], [], [],
    ["State Name", "PC NO.", "PC NAME", "Polling Stations", "Male", "Female", "TG", "TOTAL", "",
      "Male", "Female", "TG", "TOTAL", "NRI", "", "TOTAL VOTERS", "VOTER TURN OUT (%)"],
    ["Andhra Pradesh", "1", "Araku (ST)", "2052", "756088", "800954", "111", "1557153", "2520",
      "560845", "582168", "0", "1143013", "0", "22774", "1165787", "74.87"],
  ];
  const rows = parseReport13(sheet);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.number, 1);
  assert.equal(rows[0]?.pcName, "Araku (ST)", "the reservation marker is kept in the raw name");
  assert.equal(rows[0]?.electors, 1557153);
  assert.equal(rows[0]?.voters, 1165787);
  assert.equal(rows[0]?.postal, 22774);
  assert.equal(rows[0]?.turnoutPct, 74.87);
});

test("report 4 states the winner, the margin and the reservation outright", () => {
  const sheet = [
    ["4. List Of Successful Candidate"], [],
    ["SL. NO.", "State", "Const No.", "Constituency", "Constituency Type", "Total Valid Votes",
      "Winner Name", "Social Category", "Gender", "Party", "Party Symbol", "Vote Secured",
      "Runner Up Name", "Social Category", "Gender", "Party", "Party Symbol", "Vote Secured", "Margin", "Margin %"],
    ["1", "Andhra Pradesh", "1", "Araku", "ST", "1113975", "GUMMA THANUJA RANI", "ST", "FEMALE",
      "YSRCP", "Ceiling fan", "477005", "KOTHAPALLI GEETHA", "ST", "FEMALE", "BJP", "Lotus", "426425", "50580", "4.54"],
  ];
  const rows = parseReport4(sheet);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.number, 1);
  assert.equal(rows[0]?.winner, "GUMMA THANUJA RANI");
  assert.equal(rows[0]?.winnerVotes, 477005);
  assert.equal(rows[0]?.margin, 50580, "the margin is RAW here, never a subtraction we did");
  assert.equal(rows[0]?.type, "ST");
});

test("report 2(A) is the 543rd constituency, and its vote cell is not a number", () => {
  const sheet = [
    ["2A - CONSTITUENCY DATA SUMMARY FOR PC - SURAT"],
    ["State/UT & Code", "Gujarat-S06", "Constituency Name & Code", "Surat-GEN", "Const. No.", "24"],
    ["CANDIDATES", "", "", "Male", "Female", " TG ", "Total"],
    ["", "Contested", "", "1", "0", "0", "1"],
    ["ELECTORS"],
    ["", "Total", "", "954646", "831563", "78", "1786287"],
    ["POLLING STATION"],
    ["", "Number", "", "1648"],
    ["RESULT", "", "", "Party", "Candidates", "", "", "Votes"],
    ["", "Winner", "", "Bharatiya Janata Party", "MUKESHKUMAR CHANDRAKAANT DALAL", "", "", "-"],
  ];
  const s = parseSurat(sheet);
  assert.equal(s.number, 24);
  assert.equal(s.state, "Gujarat");
  assert.equal(s.stateCode, "S06");
  assert.equal(s.pcName, "Surat");
  assert.equal(s.reservation, "GEN");
  assert.equal(s.winner, "MUKESHKUMAR CHANDRAKAANT DALAL");
  assert.equal(s.electors, 1786287);
  assert.equal(s.contested, 1);
  assert.equal(s.pollingStations, 1648);
});

// ── FIXTURE: a real registry, so UNIQUE constraints are real ───────────────────────────────────────

/** Enough registry for the importer: an epoch, a state, two seats, the election, a party. */
function fixtureRegistry(): ReturnType<typeof open> {
  const path = join(mkdtempSync(join(tmpdir(), "mandate-eci-")), "registry.db");
  const d = open(path);
  migrate(d, NOW);
  d.exec(`
    INSERT INTO source (id,kind,publisher,title,url,retrieved_at,doc_hash,hash_kind,retrieval_kind)
      VALUES ('seed','eci_declaration','seed','seed','repo:seed','${NOW}','h','document_bytes','fetched');
    INSERT INTO boundary_epoch (id,name,effective_from) VALUES ('delim-2008','Delimitation Order, 2008','2008-02-19');
    INSERT INTO place (id,kind,canonical_name) VALUES ('in','nation','India'),('ap','state','Andhra Pradesh');
    INSERT INTO place (id,kind,parent_id,canonical_name) VALUES
      ('ap.pc.001','pc','ap','ARUKU'),('ap.pc.002','pc','ap','SRIKAKULAM');
    INSERT INTO place_version (id,place_id,jurisdiction_id,kind,epoch_id,number,canonical_name) VALUES
      (9001,'ap.pc.001','ap','pc','delim-2008',1,'ARUKU'),
      (9002,'ap.pc.002','ap','pc','delim-2008',2,'SRIKAKULAM');
    INSERT INTO party (id,name,short_name,kind) VALUES ('ysrcp','YSR Congress Party','YSRCP','state');
    INSERT INTO party_version (id,party_id,valid_from,name) VALUES (1,'ysrcp','2011-01-01','YSR Congress Party');
    INSERT INTO election (id,kind,level,jurisdiction_place_id,epoch_id,name,lifecycle,house,year,occurrence)
      VALUES ('ls-2024','general','union','in','delim-2008','Lok Sabha 2024','declared','pc',2024,1);
  `);
  return d;
}

const artefact = (reportNo: string, path: string): RawArtefact => ({
  sourceId: `eci:1:r${reportNo}:aaaaaaaaaaaa`,
  categoryId: 1, electionId: "ls-2024", reportNo, title: `${reportNo}.Report`,
  url: `https://www.eci.gov.in/x/${reportNo}.xls`, path, filename: `${reportNo}.xls`,
  publisher: "Election Commission of India", retrievedAt: NOW, httpStatus: 200,
  contentType: "application/vnd.ms-excel", contentLength: 1024, bytes: 1024,
  sha256: "a".repeat(64), etag: null, lastModified: null, cached: false,
});

/** A staged document with one contested seat (two candidates of the SAME name) and one unopposed. */
function fixtureStaged(): Staged {
  const cand = (name: string, party: string, votes: number, rank: number, isWinner: boolean, margin: number | null) => ({
    eciCandidateId: `ls-2024:ap-pc1:${name.toLowerCase().replace(/\W+/g, "-")}-${votes}`,
    rawName: name, normName: normName(name), rawGender: "MALE", rawAge: "45", rawCategory: "ST",
    rawParty: party, rawSymbol: "Ceiling fan", sex: "m" as const, age: 45,
    evmVotes: votes - 5, postalVotes: 5, totalVotes: votes,
    shareOfValid: null, shareOfPolled: null, shareOfElectors: null, rank, isWinner, margin,
  });
  const contested: StagedContest = {
    jurisdictionId: "ap", number: 1, rawName: "Araku", normName: "ARAKU", reservation: "st",
    reservationConflict: null, placeVersionId: 9001, resolution: "ADOPTED", resolutionNote: "adopted",
    nameMismatch: 'registry "ARUKU" vs ECI "Araku"',
    totalVotesPolled: 300, totalValidVotes: 300,
    turnout: { electors: 1000, voters: 300, male: 150, female: 150, thirdGender: 0, postal: 10, nota: 0,
      pollingStations: 5, serviceElectors: 1, overseasElectors: 0, turnoutPct: 30 },
    unopposed: false,
    // The real defect: two candidates with the same name on one ballot. Both must survive.
    candidates: [cand("SAME NAME", "YSRCP", 200, 1, true, 100), cand("SAME NAME", "IND", 100, 2, false, null)],
    fromReports: ["33", "13", "4"],
  };
  const unopposed: StagedContest = {
    ...contested, number: 2, rawName: "SRIKAKULAM", normName: "SRIKAKULAM", placeVersionId: 9002,
    nameMismatch: null, totalVotesPolled: null, totalValidVotes: null, unopposed: true,
    turnout: { ...contested.turnout, voters: null, nota: null },
    candidates: [{ ...cand("WALKOVER WINNER", "YSRCP", 0, 1, true, null),
      eciCandidateId: "ls-2024:ap-pc2:walkover", evmVotes: null, postalVotes: null, totalVotes: null, age: null, sex: null }],
    fromReports: ["2(A)"],
  };
  return {
    electionId: "ls-2024", epochId: "delim-2008", stagedAt: NOW,
    sources: [artefact("33", "/dev/null"), artefact("13", "/dev/null"), artefact("4", "/dev/null"), artefact("2(A)", "/dev/null")],
    eciCategoryName: "General Election to Loksabha-2024", eciSuratNote: "unopposed election in the PC",
    contests: [contested, unopposed], unresolved: [],
    counts: { report33Rows: 3, report13Rows: 2, report4Rows: 2, joinResolved: 2, joinAttempted: 2,
      contests: 2, candidates: 3, notaContests: 1 },
  };
}

test("two candidates with the same name on one ballot stay two people and two results", () => {
  // Seven 2024 seats fielded an independent with the winner's exact name. `candidacy` is UNIQUE on
  // (contest, person), so resolving both to one person silently overwrote one result and three
  // constituencies lost their winner. This is that regression.
  const db = fixtureRegistry();
  const r = importStaged(db, fixtureStaged(), { nowIso: NOW });
  assert.equal(r.contests, 2);
  assert.equal(r.results, 2, "the unopposed seat contributes no result");
  assert.equal(r.winners, 1);

  const rows = db.prepare(
    `SELECT p.canonical_name AS name, r.votes, r.is_winner FROM result r
       JOIN candidacy ca ON ca.id = r.candidacy_id JOIN person p ON p.id = ca.person_id
      WHERE r.contest_id = 'ls-2024:ap-pc001' ORDER BY r.votes DESC`,
  ).all() as { name: string; votes: number; is_winner: number }[];
  assert.equal(rows.length, 2, "both same-named candidates have a result");
  assert.deepEqual(rows.map((x) => x.votes), [200, 100]);
  assert.deepEqual(rows.map((x) => x.is_winner), [1, 0]);
  db.close();
});

test("the unopposed winner gets a candidacy and a cited claim, and no fabricated vote row", () => {
  const db = fixtureRegistry();
  importStaged(db, fixtureStaged(), { nowIso: NOW });
  const contest = "ls-2024:ap-pc002";
  const results = db.prepare("SELECT COUNT(*) AS n FROM result WHERE contest_id = ?").get(contest) as { n: number };
  assert.equal(results.n, 0, "no poll was held, so there is no result to record — not a zero");
  const elected = db.prepare("SELECT COUNT(*) AS n FROM candidacy WHERE contest_id = ? AND status = 'elected'").get(contest) as { n: number };
  assert.equal(elected.n, 1, "the winner is still recorded");
  const claim = db.prepare(
    `SELECT c.object_value AS v, COUNT(ci.claim_id) AS cites FROM claim c
       LEFT JOIN citation ci ON ci.claim_id = c.id
      WHERE c.subject_ref = ? AND c.predicate = 'elected_unopposed' GROUP BY c.id`,
  ).get(`contest:${contest}`) as { v: string; cites: number } | undefined;
  assert.equal(claim?.v, "true");
  assert.ok((claim?.cites ?? 0) > 0, "the claim cites the report it came from");
  db.close();
});

test("every source carries the ECI caveat, a hash and a real retrieval", () => {
  const db = fixtureRegistry();
  importStaged(db, fixtureStaged(), { nowIso: NOW });
  const rows = db.prepare(
    "SELECT publisher_note AS note, hash_kind, retrieval_kind, doc_hash FROM source WHERE id LIKE 'eci:%'",
  ).all() as { note: string; hash_kind: string; retrieval_kind: string; doc_hash: string }[];
  assert.equal(rows.length, 4);
  for (const r of rows) {
    assert.equal(r.note, ECI_STATISTICAL_DISCLAIMER, "the Commission's own caveat travels with the row");
    assert.match(r.note, /statutory forms is final/);
    assert.equal(r.hash_kind, "document_bytes");
    assert.equal(r.retrieval_kind, "fetched");
    assert.equal(r.doc_hash.length, 64);
  }
  db.close();
});

test("importing twice changes nothing", () => {
  const db = fixtureRegistry();
  const s = fixtureStaged();
  importStaged(db, s, { nowIso: NOW });
  const count = (t: string): number =>
    Number((db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n);
  const before = ["contest", "candidacy", "result", "person", "person_identifier", "turnout", "claim", "source", "place_version"]
    .map((t) => [t, count(t)] as const);

  const second = importStaged(db, s, { nowIso: NOW });
  for (const [t, n] of before) assert.equal(count(t), n, `${t} changed on the second import`);
  assert.equal(second.persons.REUSED, 3, "every person was found through its ECI candidate id");
  assert.equal(second.persons.NEW_PERSON, 0);
  db.close();
});

test("a failure mid-import leaves the registry exactly as it was", () => {
  const db = fixtureRegistry();
  const count = (t: string): number =>
    Number((db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n);
  const before = ["contest", "candidacy", "result", "person", "source", "turnout", "claim", "ingest_run"]
    .map((t) => [t, count(t)] as const);

  assert.throws(
    () => importStaged(db, fixtureStaged(), { nowIso: NOW, hook: () => { throw new Error("disk on fire"); } }),
    /disk on fire/,
  );
  for (const [t, n] of before) assert.equal(count(t), n, `${t} survived the rollback with ${count(t)} rows, expected ${n}`);
  db.close();
});

test("two constituencies claiming one seat are refused, and the run rolls back", () => {
  // `contest` is UNIQUE (election_id, place_version_id) and the upsert keys on `id`, so two staged
  // constituencies pointing at one seat RAISE rather than overwrite. Asserted because the opposite —
  // a silent overwrite — is how three winners went missing at the candidacy layer, and it is worth
  // knowing which layers fail loudly on their own.
  //
  // The importer's own pre-COMMIT row count is the second line of defence for the layers that do
  // overwrite; the real-registry test below asserts it holds on all 524 imported constituencies.
  const db = fixtureRegistry();
  const s = fixtureStaged();
  const a = s.contests[0] as StagedContest;
  const clash: StagedContest = { ...a, number: 7, rawName: "CLASH", normName: "CLASH" };
  assert.throws(
    () => importStaged(db, { ...s, contests: [a, clash] }, { nowIso: NOW }),
    /UNIQUE constraint failed: contest\.election_id, contest\.place_version_id/,
  );
  assert.equal(Number((db.prepare("SELECT COUNT(*) AS n FROM result").get() as { n: number }).n), 0,
    "and the rollback leaves nothing behind");
  db.close();
});

test("validation runs on the fixture and its hard checks are about this data, not the fixture's size", () => {
  const db = fixtureRegistry();
  const v = validateStaged(fixtureStaged(), db);
  // The arithmetic and identity checks must pass on any well-formed dataset...
  for (const n of [2, 3, 5, 7, 10, 12, 13, 14]) {
    const c = v.checks.find((x) => x.n === n);
    assert.equal(c?.violations, 0, `check ${n} (${c?.name}): ${c?.examples.join(" | ")}`);
  }
  // ...while the counts that are specific to the real 2024 corpus correctly fail on a 2-seat fixture.
  assert.ok((v.checks.find((c) => c.n === 1)?.violations ?? 0) > 0, "543 constituencies is asserted, not assumed");
  db.close();
});

// ── REAL: the acquired ECI artefacts ──────────────────────────────────────────────────────────────

const manifest = join(CACHE, "manifest.tsv");
const haveArtefacts = existsSync(manifest) && existsSync(".data/registry.db");
const skipReal = haveArtefacts ? false : `no acquired ECI artefacts — run: mandate eci ls-2024`;

/**
 * The acquired artefacts, read back from the `.meta.json` the acquire step wrote beside each file.
 *
 * Read from disk rather than re-discovered, so these tests never touch the network and assert on exactly
 * the bytes the import used.
 */
function acquired(): RawArtefact[] {
  const out: RawArtefact[] = [];
  for (const entry of readdirSync(CACHE, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".meta.json")) continue;
    const meta = JSON.parse(readFileSync(join(entry.parentPath, entry.name), "utf8")) as RawArtefact;
    if (meta.electionId === "ls-2024") out.push(meta);
  }
  return out.sort((a, b) => a.reportNo.localeCompare(b.reportNo));
}

test("the real reports parse to the numbers ECI published", { skip: skipReal }, () => {
  const raw = acquired();
  assert.equal(raw.length, 4, "four artefacts were acquired");
  const sheets = readReports(raw);
  assert.equal(parseReport33(sheets.r33).length, 8901, "report 33 candidate rows");
  assert.equal(parseReport13(sheets.r13).length, 542, "report 13 constituencies");
  assert.equal(parseReport4(sheets.r4).length, 542, "report 4 winners");
  assert.equal(parseSurat(sheets.surat).number, 24, "Surat is Gujarat PC 24");
});

test("the raw store still holds the bytes that were parsed", { skip: skipReal }, () => {
  for (const a of acquired()) {
    assert.ok(existsSync(a.path), `${a.path} is gone`);
    assert.equal(a.sha256.length, 64);
    assert.equal(a.httpStatus, 200);
    assert.ok(a.url.startsWith("https://www.eci.gov.in/"), a.url);
    assert.ok(a.retrievedAt.length > 0);
    // readReports re-hashes and throws on a mismatch, so this asserting is the same check the pipeline
    // makes; it is here so a corrupted cache fails the suite rather than the next import.
    assert.doesNotThrow(() => readSheet(readFileSync(a.path)));
  }
});

test("the 542/542 join holds, and the 543rd constituency is found and classified", { skip: skipReal }, () => {
  const db = open(".data/registry.db");
  const staged = stageLs2024(db, acquired(), readReports(acquired()), { now: () => NOW });

  // The join: report 33 names a seat, report 13 numbers it.
  assert.equal(staged.counts.joinAttempted, 542);
  assert.equal(staged.counts.joinResolved, 542, "every constituency in report 33 resolved to a number");

  // The 543rd. ECI's own note says why it is not in the other reports.
  assert.equal(staged.contests.length, 543);
  const surat = staged.contests.filter((c) => c.unopposed);
  assert.equal(surat.length, 1);
  assert.equal(surat[0]?.jurisdictionId, "gj");
  assert.equal(surat[0]?.number, 24);
  assert.match(surat[0]?.rawName ?? "", /Surat/i);
  assert.equal(surat[0]?.candidates.length, 1);
  assert.equal(surat[0]?.candidates[0]?.totalVotes, null, "an unopposed win has no vote count, not zero");
  assert.match(staged.eciSuratNote, /excluding data of PC-24:Surat due to unopposed election/);

  assert.equal(staged.counts.candidates, 8360, "8,359 contested plus Surat");
  assert.equal(staged.contests.reduce((n, c) => n + c.candidates.filter((x) => x.isWinner).length, 0), 543);
  for (const c of staged.contests) {
    assert.equal(c.candidates.filter((x) => x.isWinner).length, 1, `${c.jurisdictionId} pc${c.number}`);
  }
  db.close();
});

test("a renumbered jurisdiction is quarantined, not adopted by seat number", { skip: skipReal }, () => {
  // Assam's 2024 seat 1 is Kokrajhar; the registry's Kokrajhar is seat 5. Adopting by number would file
  // Kokrajhar's votes under Karimganj — the BIDAR/CHIKKODI defect docs/model/electoral-geography.md undid.
  const db = open(".data/registry.db");
  const staged = stageLs2024(db, acquired(), readReports(acquired()), { now: () => NOW });
  const unresolved = staged.contests.filter((c) => c.resolution === "UNRESOLVED");
  assert.deepEqual([...new Set(unresolved.map((c) => c.jurisdictionId))].sort(), ["as", "jk"]);
  assert.equal(unresolved.length, 19, "all 14 Assam and all 5 Jammu & Kashmir seats");
  for (const c of unresolved) assert.equal(c.placeVersionId, null, "a quarantined seat carries no place_version");
  // The whole jurisdiction goes, including seats whose number and name happen to agree.
  const jkBaramulla = staged.contests.find((c) => c.jurisdictionId === "jk" && c.number === 1);
  assert.equal(jkBaramulla?.resolution, "UNRESOLVED");
  assert.match(jkBaramulla?.resolutionNote ?? "", /renumbered/);
  assert.ok(staged.unresolved.some((u) => u.what === "jurisdiction quarantined"), "the reason is recorded");
  db.close();
});

test("a spelling variant is adopted, and the registry's own name is never overwritten", { skip: skipReal }, () => {
  const db = open(".data/registry.db");
  const staged = stageLs2024(db, acquired(), readReports(acquired()), { now: () => NOW });
  // 'ARUKU' vs 'Araku' is a spelling variant: no other Andhra seat is called Araku.
  const araku = staged.contests.find((c) => c.jurisdictionId === "ap" && c.number === 1);
  assert.equal(araku?.resolution, "ADOPTED");
  assert.equal(araku?.rawName, "Araku", "the source's spelling is kept as the source wrote it");
  assert.match(araku?.nameMismatch ?? "", /ARUKU/, "and the disagreement is recorded");
  const stored = db.prepare("SELECT canonical_name AS n FROM place_version WHERE id = ?").get(araku?.placeVersionId as number) as { n: string };
  assert.equal(stored.n, "ARUKU", "the registry's name was not overwritten by the import");
  db.close();
});

test("all sixteen checks pass on the real staged dataset", { skip: skipReal }, () => {
  const db = open(".data/registry.db");
  const v = validateStaged(stageLs2024(db, acquired(), readReports(acquired()), { now: () => NOW }), db);
  for (const c of v.checks) {
    assert.equal(c.skipped, null, `check ${c.n} was not asked`);
    if (c.severity === "hard") assert.equal(c.violations, 0, `check ${c.n} (${c.name}): ${c.examples.join(" | ")}`);
  }
  assert.equal(v.hardFailures, 0);
  db.close();
});

test("the registry holds the imported election, with one winner per seat", { skip: skipReal }, () => {
  const db = open(".data/registry.db");
  const one = <T>(sql: string, ...p: (string | number)[]): T =>
    db.prepare(sql).get(...p) as T;

  // Election identity: exactly one 2024 parliamentary general election, and every contest is on it.
  const e = one<{ n: number }>("SELECT COUNT(*) AS n FROM election WHERE kind='general' AND house='pc' AND year=2024");
  assert.equal(e.n, 1, "the 2024 Lok Sabha is one event");
  const src = one<{ s: string | null }>("SELECT source_id AS s FROM election WHERE id='ls-2024'");
  assert.ok(src.s?.startsWith("eci:"), "the election cites the ECI report it was imported from");

  const contests = one<{ n: number }>("SELECT COUNT(*) AS n FROM contest WHERE election_id='ls-2024'");
  assert.equal(contests.n, 524, "524 of 543: Assam and Jammu & Kashmir are quarantined");

  // Every contest resolves to a place_version in the right epoch and of the right house.
  const wrong = db.prepare(
    `SELECT COUNT(*) AS n FROM contest c JOIN place_version v ON v.id = c.place_version_id
      WHERE c.election_id = 'ls-2024' AND (v.kind <> 'pc' OR v.epoch_id <> 'delim-2008')`,
  ).get() as { n: number };
  assert.equal(wrong.n, 0);

  // No duplicate winners anywhere on this election, and no duplicate results.
  const dupWinners = db.prepare(
    `SELECT COUNT(*) AS n FROM (SELECT c.id FROM contest c JOIN result r ON r.contest_id = c.id
       WHERE c.election_id = 'ls-2024' AND r.is_winner = 1 AND r.revision = 0
       GROUP BY c.id HAVING COUNT(*) > 1)`,
  ).get() as { n: number };
  assert.equal(dupWinners.n, 0);
  const winners = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM result r JOIN contest c ON c.id = r.contest_id
      WHERE c.election_id='ls-2024' AND r.is_winner=1 AND r.revision=0`,
  );
  assert.equal(winners.n, 523, "523 counted winners plus Surat, which has no result to count");

  // Age is preserved with ECI provenance — the whole point of preferring report 33.
  const ages = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM candidacy ca JOIN contest c ON c.id = ca.contest_id
      WHERE c.election_id='ls-2024' AND ca.age_declared IS NOT NULL`,
  );
  assert.equal(ages.n, 8116);
  const cited = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM result r JOIN contest c ON c.id = r.contest_id
      WHERE c.election_id='ls-2024' AND r.source_id NOT LIKE 'eci:%'`,
  );
  assert.equal(cited.n, 0, "every result on this election cites an ECI artefact");

  // The superseded placeholders are in the public ledger rather than simply gone.
  const ledger = one<{ n: number }>("SELECT COUNT(*) AS n FROM correction WHERE public_slug LIKE 'eci-ls2024-supersede-%'");
  assert.equal(ledger.n, 42, "the seed's 42 count-less West Bengal winners were superseded, and recorded");
  db.close();
});

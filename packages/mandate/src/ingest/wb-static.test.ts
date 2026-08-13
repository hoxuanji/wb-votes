// Ingest tests run against the REAL migrations on a :memory: db, but a hand-written six-row
// fixture instead of the 2920-row module — a unit test that loads production data is a slow
// integration test wearing a disguise. The properties asserted here are the ones that make the
// registry trustworthy: idempotency, P2 (nothing rendered without a citation), P5 (a bare case
// count never becomes a case), and no candidacy is ever dropped for an unresolvable party.

import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { slug } from "../core/ids.ts";
import { open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { MODULE_KEYS, countUncited, loadStaticBundle, readModuleDoc, runIngest } from "./index.ts";
import { resolvePersons } from "./resolve/index.ts";
import type { ModuleKey, StaticBundle } from "./index.ts";

const NOW = "2026-08-07T00:00:00Z";
const SEED_DIR = fileURLToPath(new URL("../../../../data/seed/", import.meta.url));

// The one thing cycle 4 could break silently: retrieval dates moved out of each module's line-1
// header comment and into data/seed/provenance.json. Lose that lookup and every source row's
// retrieved_at quietly falls back to the run clock, which reads as fresh and is not. Asserted
// against the real seed, because the real seed is the thing that would rot.
test("retrieval dates come from data/seed/provenance.json, and an absent entry stays absent", async () => {
  assert.equal(readModuleDoc("candidates.json").retrievedOn, "2026-04-25");
  assert.equal(readModuleDoc("historical-results.json").retrievedOn, "2026-05-15");
  // parties.json never carried a date; that is a fact to report, not a gap to fill with today.
  assert.equal(readModuleDoc("parties.json").retrievedOn, null);
  // docHash is the seed file's own bytes, so every module is a distinct source row.
  const b = await loadStaticBundle();
  assert.equal(new Set(MODULE_KEYS.map((k) => b.docs[k].docHash)).size, MODULE_KEYS.length);
  assert.equal(b.constituencies.length, 294);
  assert.ok(b.candidates.length > 2000);
});

test("a MALFORMED provenance.json throws; only a MISSING one falls back to the run clock", async () => {
  // The swallowed error: one stray comma used to void all seven retrieval dates at once and stamp
  // every source with the run clock, reported as an ordinary anomaly. A source row that says
  // "retrieved today" about a file retrieved in April is a guess wearing a fact's clothes.
  const dir = `${mkdtempSync(join(tmpdir(), "seed-prov-"))}/`;
  writeFileSync(`${dir}provenance.json`, '{ "candidates.json": "2026-04-25",,, }');
  await assert.rejects(() => loadStaticBundle(dir), /provenance\.json is not valid JSON/);

  // A missing file is the documented case and stays documented: no date, reported per module.
  const bare = `${mkdtempSync(join(tmpdir(), "seed-none-"))}/`;
  copyFileSync(SEED_DIR + "cabinet.json", `${bare}cabinet.json`);
  assert.equal(readModuleDoc("cabinet.json", bare).retrievedOn, null);
});

/** Distinct docHash per module, so the eight module sources stay eight distinct rows. */
const docs = Object.fromEntries(
  MODULE_KEYS.map((k, i) => [
    k,
    { file: `${k}.json`, retrievedOn: "2026-04-25", docHash: String(i).repeat(64) },
  ]),
) as StaticBundle["docs"];

// "JATIYA UNNAYAN PARTY" is a real unmatched label from the real data: it is not an id, an
// abbreviation or a name in parties.json, and its candidacy must survive anyway.
const UNMATCHED = "JATIYA UNNAYAN PARTY";

function fixture(): StaticBundle {
  return {
    docs,
    constituencies: [
      { id: "c0001", assemblyNumber: 1, name: "Mekliganj", district: "Cooch Behar", reservation: "SC" },
      { id: "c0002", assemblyNumber: 2, name: "Mathabhanga", district: "Cooch Behar", reservation: "SC" },
    ],
    parties: [
      { id: "AITC", name: "All India Trinamool Congress", abbreviation: "TMC", isNational: true },
      { id: "BJP", name: "Bharatiya Janata Party", abbreviation: "BJP", isNational: true },
    ],
    candidates: [
      {
        // the sitting-MLA shape: a photo and a declared tenure, the two fields cycles 1-3 dropped
        id: "wb26_1", name: "Hiten Barman", partyId: "AITC", constituencyId: "c0001",
        age: 57, gender: "Male", education: "Graduate", criminalCases: 0,
        totalAssets: 1021356, totalLiabilities: 0, movableAssets: 500000,
        affidavitUrl: "https://myneta.info/x?candidate_id=1", occupation: "Social Work",
        photoUrl: "https://myneta.info/images_candidate/WestBengal2026/hiten.jpg",
        isIncumbent: true, incumbentYears: 5,
      },
      {
        // the unresolvable party label, and a declared case count with no docket
        id: "wb26_2", name: "Kamal Kumar Roy", partyId: UNMATCHED, constituencyId: "c0001",
        age: 61, gender: "Male", education: "Graduate", criminalCases: 3,
        totalAssets: 900, totalLiabilities: 100,
        affidavitUrl: "https://myneta.info/x?candidate_id=2",
        // a photo but no tenure: not an incumbent, so there is no figure to carry
        photoUrl: "https://myneta.info/images_candidate/WestBengal2026/kamal.jpg",
      },
      {
        // matches the 2026 declared winner below by name, so the result lands on THIS candidacy
        id: "wb26_3", name: "Paritosh Das", partyId: "BJP", constituencyId: "c0002",
        age: 44, education: "Post Graduate", criminalCases: 0,
        totalAssets: 5000, totalLiabilities: 0,
        affidavitUrl: "https://myneta.info/x?candidate_id=3",
      },
    ],
    historicalResults: [
      {
        constituencyId: "c0001", year: 2011,
        winner: { name: "ADHIKARY PARESH CHANDRA", partyId: "AITC", partyAbbr: "TMC", votes: 72040, voteShare: 48.89 },
        runnerUp: { name: "JAYANTA KUMAR RAY", partyId: "BJP", partyAbbr: "BJP", votes: 39408, voteShare: 26.74 },
        topContestants: [
          { name: "ADHIKARY PARESH CHANDRA", partyId: "AITC", partyAbbr: "TMC", votes: 72040, voteShare: 48.89 },
          { name: "JAYANTA KUMAR RAY", partyId: "BJP", partyAbbr: "BJP", votes: 39408, voteShare: 26.74 },
        ],
        turnoutPct: 84.5, marginVotes: 32632, totalVotes: 147348, totalElectors: 174376,
      },
      {
        // the 2026 shape: a declared winner and margin, tallies never backfilled
        constituencyId: "c0002", year: 2026,
        winner: { name: "Paritosh Das", partyId: "BJP", partyAbbr: "BJP", votes: 0, voteShare: 0 },
        turnoutPct: 94.1, marginVotes: 70420, totalVotes: 229846, totalElectors: 244331,
      },
    ],
    currentMLAs: [
      {
        constituencyId: "c0001", name: "Dadhiram Ray", partyId: "BJP", term: "2026-2031",
        marginVotes: 29584, voteShare: null, sourceUrl: "https://www.indiavotes.com/",
      },
    ],
    demographics: [
      {
        constituencyId: "c0001", population: 2819086, literacyRate: 74.78, sexRatio: 942,
        scPct: 50.11, stPct: 0.62, urbanPct: 10.2, sourceYear: 2011,
        sourceNote: "District-level proxy",
      },
    ],
    cabinet: [
      {
        name: "Suvendu Adhikari", partyId: "BJP", constituencyId: "c0166",
        portfolios: [{ ministry: "Chief Minister", rank: "CM", from: "2026-05-09" }],
        sourceUrl: "https://en.wikipedia.org/wiki/Suvendu_Adhikari_ministry",
      },
    ],
    mps: [
      {
        name: "Jagadish Basunia", partyId: "AITC", lsConstituency: "Cooch Behar",
        lsNumber: 1, margin: 39250, electedOn: "2024-06-04",
        sourceUrl: "https://en.wikipedia.org/wiki/2024_Indian_general_election_in_West_Bengal",
      },
    ],
    // "Kochbihar", the census spelling, because that is what wb-districts.json actually uses — the
    // disagreement districts.ts bridges. A fixture using the ECI spelling tests the wrong thing.
    districtPaths: [{ name: "Kochbihar", path: "M5,5 L50,5 L50,50 Z", centroid: { x: 27, y: 27 } }],
  };
}

const TABLES = [
  "source", "boundary_epoch", "place", "place_version", "party", "party_version", "election",
  "contest", "person", "person_alias", "person_identifier", "candidacy", "affidavit",
  "affidavit_field", "legal_case", "result", "turnout", "claim", "citation",
];

function counts(db: ReturnType<typeof open>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of TABLES) {
    out[t] = Number(db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get()?.n ?? 0);
  }
  return out;
}

async function ingested(): Promise<{ db: ReturnType<typeof open>; report: Awaited<ReturnType<typeof runIngest>> }> {
  const db = open(":memory:");
  migrate(db, NOW);
  const report = await runIngest(db, { nowIso: NOW, bundle: fixture(), monotonicMs: () => 0 });
  return { db, report };
}

test("ingest is idempotent: the same bytes twice leave the same rows", async () => {
  const { db } = await ingested();
  const first = counts(db);
  await runIngest(db, { nowIso: NOW, bundle: fixture(), monotonicMs: () => 0 });
  assert.deepEqual(counts(db), first);
  // ingest_run is the exception on purpose: runs are an append-only log, not an upserted entity.
  assert.equal(Number(db.prepare("SELECT COUNT(*) AS n FROM ingest_run").get()?.n), 2);
  db.close();
});

test("P2: every result row carries a source_id, and it resolves to a real source", async () => {
  const { db, report } = await ingested();
  assert.ok(report.results > 0);
  const orphans = db
    .prepare(
      "SELECT COUNT(*) AS n FROM result r WHERE r.source_id IS NULL OR NOT EXISTS (SELECT 1 FROM source s WHERE s.id = r.source_id)",
    )
    .get();
  assert.equal(Number(orphans?.n), 0);
  db.close();
});

test("P2: every affidavit_field has a citation, and nothing rendered is uncited", async () => {
  const { db, report } = await ingested();
  assert.ok(report.claims > 0 && report.citations > 0);
  assert.ok(Number(db.prepare("SELECT COUNT(*) AS n FROM affidavit_field").get()?.n) > 0);
  assert.equal(countUncited(db), 0);
  assert.equal(report.uncitedValues, 0);
  // and each affidavit source is the candidate's own affidavitUrl, not the module's
  const url = db.prepare("SELECT s.url AS url FROM affidavit a JOIN source s ON s.id = a.source_id JOIN candidacy c ON c.id = a.candidacy_id ORDER BY a.id LIMIT 1").get();
  assert.match(String(url?.url), /^https:\/\/myneta\.info\//);
  db.close();
});

test("P5: a bare case count creates a claim and ZERO legal_case rows", async () => {
  const { db } = await ingested();
  assert.equal(Number(db.prepare("SELECT COUNT(*) AS n FROM legal_case").get()?.n), 0);
  const declared = db
    .prepare(
      "SELECT object_value AS v, unit FROM claim WHERE predicate = 'pending_cases_declared' ORDER BY CAST(object_value AS INTEGER) DESC LIMIT 1",
    )
    .get();
  assert.equal(declared?.v, "3");
  assert.equal(declared?.unit, "cases");
  // the count is never dressed up as a stage
  const stages = db.prepare("SELECT COUNT(*) AS n FROM claim WHERE predicate LIKE '%charged%' OR predicate LIKE '%convict%'").get();
  assert.equal(Number(stages?.n), 0);
  db.close();
});

test("an unresolvable party label is recorded, and its candidacy is not dropped", async () => {
  const { db, report } = await ingested();
  assert.deepEqual(report.unmatchedPartyStrings, [UNMATCHED]);
  assert.ok(report.anomalies.some((a) => a.kind === "unresolved_party" && a.ref.includes(UNMATCHED)));

  // every candidate still has a candidacy, with a party_version, and the raw label preserved
  const row = db
    .prepare(
      "SELECT c.party_raw AS raw, p.kind AS kind, p.short_name AS short FROM candidacy c JOIN party_version pv ON pv.id = c.party_version_id JOIN party p ON p.id = pv.party_id WHERE c.party_raw IS NOT NULL",
    )
    .get();
  assert.equal(row?.raw, UNMATCHED);
  assert.equal(row?.kind, "registered_unrecognised");
  assert.equal(row?.short, UNMATCHED);
  // 3 candidates -> 3 candidacies in wb-assembly-2026, none lost; plus the 2011 contestants
  const c2026 = db.prepare("SELECT COUNT(*) AS n FROM candidacy WHERE contest_id LIKE 'wb-assembly-2026:%'").get();
  assert.equal(Number(c2026?.n), 3);
  // resolved labels leave party_raw null — party_raw is the flag, not a mirror of every party
  const resolved = db.prepare("SELECT COUNT(*) AS n FROM candidacy WHERE party_raw IS NULL").get();
  assert.ok(Number(resolved?.n) > 0);
  db.close();
});

test("the census vintage survives onto the claim and the source", async () => {
  const { db } = await ingested();
  const claim = db
    .prepare("SELECT as_of, object_value AS v, unit FROM claim WHERE predicate = 'demographics.literacyRate'")
    .get();
  assert.equal(claim?.as_of, "2011-01-01", "2011 census figure must stay a 2011 claim");
  assert.equal(claim?.v, "74.78");
  assert.equal(claim?.unit, "%");
  const source = db.prepare("SELECT published_on, kind FROM source WHERE kind = 'census'").get();
  assert.equal(source?.published_on, "2011-01-01");
  // the caveat travels with the figures so §20 meta.caveats can be assembled, not remembered
  const note = db.prepare("SELECT COUNT(*) AS n FROM claim WHERE predicate = 'demographics.source_note'").get();
  assert.equal(Number(note?.n), 1);
  db.close();
});

test("boundary epoch, place versions and contests line up on delim-2008 (P4)", async () => {
  const { db, report } = await ingested();
  // 4 state assembly elections + 1 union general election. The count is 5 because the registry now
  // holds two election KINDS at two LEVELS, which is the thing that makes "national" a fact about the
  // data rather than about the CHECK constraints.
  assert.equal(report.elections, 5);
  assert.equal(report.contests, 9, "2 assembly seats x 4 elections, + 1 parliamentary seat");
  assert.deepEqual(
    db
      .prepare("SELECT kind, level, jurisdiction_place_id AS j FROM election ORDER BY id")
      .all()
      .map((r) => `${r.kind}/${r.level}/${r.j}`),
    [
      "general/union/in",
      "assembly/state/wb",
      "assembly/state/wb",
      "assembly/state/wb",
      "assembly/state/wb",
    ],
    "the union election must hang off the nation, not the state",
  );
  // The place tree has a root above the state, and a PC alongside the ACs.
  assert.equal(
    db.prepare("SELECT parent_id FROM place WHERE id = 'wb'").get()?.parent_id,
    "in",
    "West Bengal is still a root place, so nothing national can point at a jurisdiction",
  );
  assert.deepEqual(
    db.prepare("SELECT kind, COUNT(*) AS n FROM place GROUP BY kind ORDER BY kind").all()
      .map((r) => `${r.kind}=${r.n}`),
    // All 36 jurisdictions load regardless of whether any data sits beneath them: a state with no
    // results is still a real place and the honest denominator behind "1 of 36". Only West Bengal has
    // children here, which the next assertion checks.
    ["ac=2", "district=1", "nation=1", "pc=1", "state=28", "ut=8"],
  );
  assert.equal(
    Number(
      db
        .prepare(
          `SELECT COUNT(DISTINCT s.id) AS n FROM place s JOIN place c ON c.parent_id = s.id
            WHERE s.kind IN ('state','ut')`,
        )
        .get()?.n,
    ),
    1,
    "exactly one jurisdiction should have anything beneath it in this fixture",
  );
  assert.equal(
    Number(db.prepare("SELECT COUNT(*) AS n FROM place WHERE kind IN ('state','ut') AND lgd_code IS NULL").get()?.n),
    0,
    "every jurisdiction must carry its LGD code — it is the join key for government datasets",
  );
  const epoch = db.prepare("SELECT effective_from, effective_to FROM boundary_epoch WHERE id = 'delim-2008'").get();
  assert.equal(epoch?.effective_from, "2008-02-19");
  assert.equal(epoch?.effective_to, null);
  // §19 dbt test: contest.place_version.epoch_id = election.epoch_id — no cross-epoch contests
  const crossEpoch = db
    .prepare(
      "SELECT COUNT(*) AS n FROM contest c JOIN place_version pv ON pv.id = c.place_version_id JOIN election e ON e.id = c.election_id WHERE pv.epoch_id <> e.epoch_id",
    )
    .get();
  assert.equal(Number(crossEpoch?.n), 0);
  // 2 assembly seats + 1 parliamentary seat + 1 district, which gets a synthetic version purely to hang
  // its outline off. PC versions are offset by 1,000 and district versions by 2,000, because
  // place_version.id is the seat number and PC 1 would otherwise collide with AC 1.
  assert.equal(Number(db.prepare("SELECT COUNT(*) AS n FROM place_version").get()?.n), 4);
  assert.equal(
    Number(db.prepare("SELECT COUNT(*) AS n FROM place_geometry").get()?.n),
    1,
    "one district outline — constituency geometry left the seed in Phase 3's closure, the registry " +
      "holding published polygons in its place, so the ingest writes only districts now",
  );
  assert.equal(
    Number(db.prepare("SELECT COUNT(*) AS n FROM place_version WHERE geometry_ref IS NOT NULL").get()?.n),
    3,
    "geometry_ref must point at the stored shape, not stay null as it did for eight cycles",
  );
  assert.equal(
    Number(db.prepare("SELECT id FROM place_version WHERE place_id = 'wb.pc.01'").get()?.id),
    1001,
  );
  const pv = db.prepare("SELECT number, reservation FROM place_version WHERE place_id = 'wb.ac.001'").get();
  assert.deepEqual([pv?.number, pv?.reservation], [1, "sc"]);
  db.close();
});

test("a declared 2026 winner lands on the existing nomination, not a duplicate candidacy", async () => {
  const { db } = await ingested();
  const rows = db
    .prepare(
      "SELECT c.status AS status, r.is_winner AS win, r.margin AS margin, r.\"rank\" AS rank FROM candidacy c JOIN result r ON r.candidacy_id = c.id WHERE c.contest_id LIKE 'wb-assembly-2026:%'",
    )
    .all();
  assert.equal(rows.length, 1, "one declared result, on one candidacy");
  assert.equal(rows[0]?.status, "elected");
  assert.equal(Number(rows[0]?.win), 1);
  assert.equal(Number(rows[0]?.margin), 70420, "the declared margin, not a computed one");
  // the un-tallied 2026 row is flagged rather than silently trusted
  const { report } = await ingested();
  assert.ok(report.anomalies.some((a) => a.kind === "zero_vote_result"));
  db.close();
});

test("person aliases carry a blocking key, and duplicates are left for resolve/ to merge", async () => {
  const { db } = await ingested();
  const blank = db.prepare("SELECT COUNT(*) AS n FROM person_alias WHERE norm_key IS NULL OR norm_key = ''").get();
  assert.equal(Number(blank?.n), 0);
  assert.equal(
    Number(db.prepare("SELECT COUNT(*) AS n FROM person WHERE review_state <> 'unreviewed'").get()?.n),
    0,
    "the ingest never claims to have resolved anyone",
  );
  // "Paritosh Das" the nominee and "Paritosh Das" the winner are one person (natural-key join);
  // the MLA, the minister and the MP are their own rows, which is the resolver's real input
  const paritosh = db.prepare("SELECT COUNT(*) AS n FROM person WHERE canonical_name = 'Paritosh Das'").get();
  assert.equal(Number(paritosh?.n), 1);
  assert.ok(Number(db.prepare("SELECT COUNT(*) AS n FROM person WHERE canonical_name = 'Suvendu Adhikari'").get()?.n) > 0);
  db.close();
});

test("per-row sourceUrls become their own sources, and the MLA fact cites one", async () => {
  const { db } = await ingested();
  const s = db.prepare("SELECT id, kind, licence FROM source WHERE url = 'https://www.indiavotes.com/'").get();
  assert.equal(s?.kind, "press");
  const cited = db
    .prepare("SELECT COUNT(*) AS n FROM claim c JOIN citation ci ON ci.claim_id = c.id WHERE c.predicate = 'mla_term' AND ci.source_id = ?")
    .get(String(s?.id));
  assert.equal(Number(cited?.n), 1);
  const wiki = db.prepare("SELECT licence FROM source WHERE url LIKE '%wikipedia.org%' LIMIT 1").get();
  assert.equal(wiki?.licence, "CC-BY-SA-4.0");
  db.close();
});

test("no missing header date in the fixture, and a missing one is reported not invented", async () => {
  const db = open(":memory:");
  migrate(db, NOW);
  const b = fixture();
  const dateless: StaticBundle = {
    ...b,
    docs: { ...b.docs, parties: { ...b.docs.parties, retrievedOn: null } } as Record<ModuleKey, StaticBundle["docs"][ModuleKey]>,
  };
  const report = await runIngest(db, { nowIso: NOW, bundle: dateless, monotonicMs: () => 0 });
  assert.ok(report.anomalies.some((a) => a.kind === "no_header_date" && a.ref === "module:parties"));
  db.close();
});

test("a second result row for the same seat and year never gives a contest two winners", async () => {
  const db = open(":memory:");
  migrate(db, NOW);
  const b = fixture();
  // the real defect: historical-results.json assigns two different seats the same AC id 40 times
  const collided: StaticBundle = {
    ...b,
    historicalResults: [
      ...b.historicalResults,
      {
        constituencyId: "c0001", year: 2011,
        winner: { name: "SABITRI MITRA", partyId: "AITC", partyAbbr: "TMC", votes: 64641, voteShare: 46.2 },
        runnerUp: { name: "RATNA BHATTACHARYA", partyId: "BJP", partyAbbr: "BJP", votes: 58424, voteShare: 41.75 },
        turnoutPct: 80, marginVotes: 6217, totalVotes: 139930, totalElectors: 174376,
      },
    ],
  };
  const report = await runIngest(db, { nowIso: NOW, bundle: collided, monotonicMs: () => 0 });
  const twoWinners = db
    .prepare("SELECT COUNT(*) AS n FROM (SELECT contest_id FROM result WHERE is_winner = 1 GROUP BY contest_id HAVING COUNT(*) > 1)")
    .get();
  assert.equal(Number(twoWinners?.n), 0);
  const dupRank = db
    .prepare('SELECT COUNT(*) AS n FROM (SELECT contest_id, "rank" FROM result GROUP BY contest_id, "rank" HAVING COUNT(*) > 1)')
    .get();
  assert.equal(Number(dupRank?.n), 0);
  // the discarded row is not silently gone: its numbers are in the anomaly, verbatim
  const dup = report.anomalies.find((a) => a.kind === "duplicate_result_row");
  assert.ok(dup, "the second row must be reported");
  assert.match(String(dup?.detail), /SABITRI MITRA/);
  assert.match(String(dup?.detail), /139930/);
  db.close();
});

test("the ingest_run row records what happened", async () => {
  const { db, report } = await ingested();
  const run = db.prepare("SELECT pipeline, rows_in, rows_out, status, anomalies FROM ingest_run").get();
  assert.equal(run?.pipeline, "static:wb-static");
  assert.equal(run?.status, "partial", "unresolved party + un-tallied 2026 rows are real anomalies");
  assert.ok(Number(run?.rows_in) > 0 && Number(run?.rows_out) > Number(run?.rows_in));
  assert.deepEqual(JSON.parse(String(run?.anomalies)), report.anomalies);
  db.close();
});

// ─── cycle-2 repairs. Each test fails on the cycle-1 code, by construction. ───

/** The cycle-1 defect's exact shape: `npm run scrape && npm run registry:ingest` re-ingests into
 *  the same database with rows PREPENDED, so every positional counter shifts. */
function withCandidates(names: readonly string[]): StaticBundle {
  const b = fixture();
  return {
    ...b,
    historicalResults: [],
    candidates: names.map((name, i) => ({
      id: `wb26_${slug(name)}`,
      name,
      partyId: "AITC",
      constituencyId: "c0001",
      age: 40 + i,
      education: "Graduate",
      criminalCases: i,
      totalAssets: 1000 * (i + 1),
      totalLiabilities: 0,
      affidavitUrl: `https://myneta.info/x?candidate_id=${slug(name)}`,
    })),
  };
}

/** Every source url cited for one person's declared asset total. Length > 1 is the bug. */
function assetCitations(db: ReturnType<typeof open>, person: string): string[] {
  return db
    .prepare(
      `SELECT s.url AS url FROM claim c
         JOIN citation ci ON ci.claim_id = c.id
         JOIN source s ON s.id = ci.source_id
         JOIN candidacy cd ON 'candidacy:' || cd.id = c.subject_ref
         JOIN person p ON p.id = cd.person_id
        WHERE p.canonical_name = ? AND c.predicate = 'affidavit.assets.total'
        ORDER BY s.url`,
    )
    .all(person)
    .map((r) => String(r.url));
}

test("B1: prepending a candidate never hands their affidavit to someone else's numbers", async () => {
  const db = open(":memory:");
  migrate(db, NOW);
  await runIngest(db, { nowIso: NOW, bundle: withCandidates(["Alpha Roy"]), monotonicMs: () => 0 });
  // re-ingest with a candidate PREPENDED: on the cycle-1 code claim 1 is now Beta Sen's asset
  // total and still carries Alpha Roy's affidavit citation from the previous run
  await runIngest(db, {
    nowIso: NOW,
    bundle: withCandidates(["Beta Sen", "Alpha Roy"]),
    monotonicMs: () => 0,
  });
  assert.deepEqual(assetCitations(db, "Beta Sen"), ["https://myneta.info/x?candidate_id=beta-sen"]);
  assert.deepEqual(assetCitations(db, "Alpha Roy"), ["https://myneta.info/x?candidate_id=alpha-roy"]);
  // and the id of a fact is the fact: Alpha Roy's claim kept the id it had in run 1
  const orphans = db
    .prepare(
      `SELECT COUNT(*) AS n FROM citation ci
        WHERE NOT EXISTS (SELECT 1 FROM claim c WHERE c.id = ci.claim_id)`,
    )
    .get();
  assert.equal(Number(orphans?.n), 0);
  assert.equal(countUncited(db), 0);
  db.close();
});

test("B1: a fact that vanishes from the input takes its citation with it", async () => {
  const db = open(":memory:");
  migrate(db, NOW);
  await runIngest(db, {
    nowIso: NOW,
    bundle: withCandidates(["Alpha Roy", "Beta Sen"]),
    monotonicMs: () => 0,
  });
  const before = Number(db.prepare("SELECT COUNT(*) AS n FROM citation").get()?.n);
  await runIngest(db, { nowIso: NOW, bundle: withCandidates(["Alpha Roy"]), monotonicMs: () => 0 });
  assert.deepEqual(assetCitations(db, "Beta Sen"), [], "Beta Sen is gone; so is the citation");
  assert.ok(Number(db.prepare("SELECT COUNT(*) AS n FROM citation").get()?.n) < before);
  // P2's number stays honest instead of counting a document nobody claims anything from
  assert.equal(countUncited(db), 0);
  db.close();
});

test("B2: the declared-winner upgrade never nulls the affidavit's age and education", async () => {
  const { db } = await ingested();
  const won = db
    .prepare(
      `SELECT status, age_declared AS age, education_declared AS edu FROM candidacy
        WHERE contest_id LIKE 'wb-assembly-2026%' AND status = 'elected'`,
    )
    .all();
  assert.equal(won.length, 1);
  assert.equal(won[0]?.age, 44, "Paritosh Das declared 44 on his affidavit");
  assert.equal(won[0]?.edu, "Post Graduate");
  db.close();
});

test("B3: surname-first and given-name-first share a blocking bucket", async () => {
  const db = open(":memory:");
  migrate(db, NOW);
  const b = fixture();
  // Lokdhaba writes "ADHIKARY PARESH CHANDRA", MyNeta writes "Paresh Chandra Adhikary". That pair
  // IS the dominant duplicate in this data, and cycle 1's single ascii-folded key put each token
  // order in its own bucket, so the resolver never compared the two records for one human.
  await runIngest(db, {
    nowIso: NOW,
    bundle: {
      ...b,
      candidates: [
        ...b.candidates,
        {
          id: "wb26_9", name: "Paresh Chandra Adhikary", partyId: "AITC", constituencyId: "c0002",
          criminalCases: 0, totalAssets: 10, affidavitUrl: "https://myneta.info/x?candidate_id=9",
        },
      ],
    },
    monotonicMs: () => 0,
  });
  const keysOf = (name: string): string[] =>
    db
      .prepare("SELECT norm_key AS k FROM person_alias WHERE name = ? ORDER BY k")
      .all(name)
      .map((r) => String(r.k));
  assert.ok(keysOf("ADHIKARY PARESH CHANDRA").length > 1, "one alias, several indexed keys");
  const shared = db
    .prepare(
      `SELECT COUNT(*) AS n FROM person_alias a JOIN person_alias b
        ON a.norm_key = b.norm_key AND a.person_id <> b.person_id
       WHERE a.name = 'Paresh Chandra Adhikary' AND b.name = 'ADHIKARY PARESH CHANDRA'`,
    )
    .get();
  assert.ok(Number(shared?.n) > 0, "the two token orders must land in one bucket");
  assert.equal(
    Number(db.prepare("SELECT COUNT(*) AS n FROM person_alias WHERE norm_key = ''").get()?.n),
    0,
  );
  db.close();
});

test("B4: reordering the input reassigns no person id", async () => {
  const ids = async (candidates: StaticBundle["candidates"]): Promise<string[]> => {
    const db = open(":memory:");
    migrate(db, NOW);
    await runIngest(db, { nowIso: NOW, bundle: { ...fixture(), candidates }, monotonicMs: () => 0 });
    const out = db
      .prepare("SELECT id FROM person ORDER BY id")
      .all()
      .map((r) => String(r.id));
    db.close();
    return out;
  };
  // two humans really do share a name — c0018 fields two Swapna Barmans. Cycle 1 gave the bare
  // slug to whichever arrived first, so reversing the scraper output moved a persisted, cited id
  // from one of them to the other.
  const forward: StaticBundle["candidates"] = [
    { id: "wb26_7", name: "Swapna Barman", partyId: "AITC", constituencyId: "c0001", criminalCases: 0, totalAssets: 1, affidavitUrl: "https://myneta.info/x?candidate_id=7" },
    { id: "wb26_8", name: "Swapna Barman", partyId: "BJP", constituencyId: "c0001", criminalCases: 0, totalAssets: 2, affidavitUrl: "https://myneta.info/x?candidate_id=8" },
  ];
  assert.deepEqual(await ids([...forward].reverse()), await ids(forward));
});

test("B5: a shrinking party register leaves no stale version and no id churn", async () => {
  const db = open(":memory:");
  migrate(db, NOW);
  const b = fixture();
  const rsp = { id: "RSP", name: "Revolutionary Socialist Party", abbreviation: "RSP" };
  await runIngest(db, {
    nowIso: NOW,
    bundle: { ...b, parties: [...b.parties, rsp] },
    monotonicMs: () => 0,
  });
  const versionOf = (): Record<string, number> =>
    Object.fromEntries(
      db
        .prepare("SELECT party_id, id FROM party_version ORDER BY party_id")
        .all()
        .map((r) => [String(r.party_id), Number(r.id)]),
    );
  const before = versionOf();
  // RSP is delisted and the register is regenerated in a different order
  await runIngest(db, {
    nowIso: NOW,
    bundle: { ...b, parties: [...b.parties].reverse() },
    monotonicMs: () => 0,
  });
  const after = versionOf();
  assert.equal("RSP" in after, false, "the delisted party's version must not survive");
  for (const [party, id] of Object.entries(after)) {
    assert.equal(id, before[party], `${party}'s version id must not move`);
  }
  assert.equal(
    Number(db.prepare("SELECT COUNT(*) AS n FROM party_version_overlap").get()?.n),
    0,
    "no party may have two open-ended versions",
  );
  db.close();
});

test("B5b: party_version.id is internal — a reordered rebuild moves it and nothing notices", async () => {
  // The guarantee wb-static.ts actually makes: the id is a DATABASE-LOCAL rowid, so the natural key
  // (party_id, valid_from) and every resolution THROUGH the id have to be reorder-invariant, and
  // nothing published may carry the integer. B5 above covers id stability inside ONE database; this
  // covers two independent rebuilds from the same register in a different order.
  const b = fixture();
  const rebuild = async (parties: StaticBundle["parties"]): Promise<Record<string, string[]>> => {
    const db = open(":memory:");
    migrate(db, NOW);
    await runIngest(db, { nowIso: NOW, bundle: { ...b, parties }, monotonicMs: () => 0 });
    const col = (sql: string): string[] => db.prepare(sql).all().map((r) => Object.values(r).join("="));
    const out = {
      versions: col("SELECT party_id, valid_from FROM party_version ORDER BY party_id, valid_from"),
      candidacies: col(
        `SELECT c.id, pv.party_id FROM candidacy c
           JOIN party_version pv ON pv.id = c.party_version_id ORDER BY c.id`,
      ),
      // Every namespace a claim subject uses. 'party_version:' appearing here would mean the
      // surrogate had escaped into the cited layer, where a reorder would silently repoint it.
      subjects: col("SELECT DISTINCT substr(subject_ref, 1, instr(subject_ref, ':')) FROM claim ORDER BY 1"),
    };
    db.close();
    return out;
  };
  const forward = await rebuild(b.parties);
  const reversed = await rebuild([...b.parties].reverse());
  assert.deepEqual(reversed.versions, forward.versions, "the natural key must not depend on input order");
  assert.deepEqual(reversed.candidacies, forward.candidacies, "which party a candidacy resolves to must not either");
  assert.deepEqual(forward.subjects, ["candidacy:", "contest:", "person:", "place:"]);
  assert.deepEqual(reversed.subjects, forward.subjects);
});

test("B6: a source says whether we hashed it, and an unanchored claim is provisional", async () => {
  const { db } = await ingested();
  const mod = db
    .prepare("SELECT hash_kind AS h, retrieval_kind AS r FROM source WHERE url LIKE 'repo:%' LIMIT 1")
    .get();
  assert.deepEqual([mod?.h, mod?.r], ["document_bytes", "fetched"], "we do hold the module bytes");
  const aff = db
    .prepare("SELECT hash_kind AS h, retrieval_kind AS r FROM source WHERE url LIKE 'https://myneta%' LIMIT 1")
    .get();
  assert.deepEqual([aff?.h, aff?.r], ["url_only", "asserted_by_upstream"], "never fetched");
  assert.equal(
    Number(db.prepare("SELECT COUNT(*) AS n FROM claim WHERE confidence = 'verified'").get()?.n),
    0,
    "no page anchor, no 'verified'",
  );
  assert.ok(Number(db.prepare("SELECT COUNT(*) AS n FROM claim WHERE confidence = 'provisional'").get()?.n) > 0);
  db.close();
});

test("B7: symbols are ingested and party_version points at one (P3)", async () => {
  const db = open(":memory:");
  migrate(db, NOW);
  const b = fixture();
  const parties = b.parties.map((p) =>
    p.id === "AITC" ? { ...p, symbolUrl: "/images/parties/aitc.png" } : p,
  );
  await runIngest(db, { nowIso: NOW, bundle: { ...b, parties }, monotonicMs: () => 0 });
  const sym = db.prepare("SELECT id, svg_ref AS ref FROM symbol").all();
  assert.equal(sym.length, 1);
  assert.equal(sym[0]?.ref, "/images/parties/aitc.png");
  const pv = db.prepare("SELECT symbol_id AS s FROM party_version WHERE party_id = 'AITC'").get();
  assert.equal(pv?.s, sym[0]?.id, "the party card resolves a symbol before a colour");
  db.close();
});

test("B8: a corrected tally appends a revision and the prior row stays readable", async () => {
  const db = open(":memory:");
  migrate(db, NOW);
  const b = fixture();
  await runIngest(db, { nowIso: NOW, bundle: b, monotonicMs: () => 0 });
  const first = b.historicalResults[0];
  assert.ok(first);
  const corrected: StaticBundle = {
    ...b,
    historicalResults: [
      { ...first, winner: { ...first.winner, votes: 80000 }, marginVotes: 40592 },
      ...b.historicalResults.slice(1),
    ],
  };
  await runIngest(db, { nowIso: NOW, bundle: corrected, monotonicMs: () => 0 });
  const rows = db
    .prepare(
      `SELECT r.revision AS rev, r.votes AS votes FROM result r
         JOIN candidacy c ON c.id = r.candidacy_id
         JOIN person p ON p.id = c.person_id
        WHERE p.canonical_name = 'ADHIKARY PARESH CHANDRA' ORDER BY r.revision`,
    )
    .all();
  assert.deepEqual(
    rows.map((r) => [Number(r.rev), Number(r.votes)]),
    [
      [0, 72040],
      [1, 80000],
    ],
    "ring 2 is append-only: the correction ledger reads the superseded row",
  );
  // and re-ingesting the SAME correction appends nothing
  await runIngest(db, { nowIso: NOW, bundle: corrected, monotonicMs: () => 0 });
  assert.equal(
    Number(db.prepare("SELECT COUNT(*) AS n FROM result WHERE revision > 1").get()?.n),
    0,
  );
  db.close();
});

test("B9: a failing write records status='failed' and explains itself", async () => {
  const db = open(":memory:");
  migrate(db, NOW);
  const b = fixture();
  // one bad row in constituencies.ts: two seats claiming assembly number 1 collide on
  // contest's UNIQUE (election_id, place_version_id)
  const broken: StaticBundle = {
    ...b,
    constituencies: b.constituencies.map((c) => ({ ...c, assemblyNumber: 1 })),
  };
  await assert.rejects(
    () => runIngest(db, { nowIso: NOW, bundle: broken, monotonicMs: () => 0 }),
    (err: Error) => {
      assert.match(err.message, /status='failed'/);
      assert.match(err.message, /mandate ingest/, "the message says what to do next");
      assert.doesNotMatch(err.message, /sorry|oops/i);
      return true;
    },
  );
  const run = db.prepare("SELECT status, finished_at AS fin, anomalies FROM ingest_run").get();
  assert.equal(run?.status, "failed");
  assert.ok(run?.fin, "a failed run is not left looking like one still in flight");
  assert.match(String(run?.anomalies), /ingest_failed/);
  db.close();
});

test("B10: a malformed sourceUrl is an anomaly, not the end of the run", async () => {
  const db = open(":memory:");
  migrate(db, NOW);
  const b = fixture();
  const mla = b.currentMLAs[0];
  assert.ok(mla);
  const report = await runIngest(db, {
    nowIso: NOW,
    bundle: { ...b, currentMLAs: [{ ...mla, sourceUrl: "not a url" }] },
    monotonicMs: () => 0,
  });
  assert.ok(report.anomalies.some((a) => a.kind === "invalid_source_url"));
  assert.ok(report.persons > 0, "the other 294 rows still land");
  // the fact is still cited — to the module we did hash, not to nothing
  const cited = db
    .prepare(
      `SELECT s.url AS url FROM claim c JOIN citation ci ON ci.claim_id = c.id
         JOIN source s ON s.id = ci.source_id WHERE c.predicate = 'mla_term'`,
    )
    .get();
  assert.equal(cited?.url, "repo:data/seed/currentMLAs.json");
  assert.equal(countUncited(db), 0);
  db.close();
});

// ── cycle 2 ──────────────────────────────────────────────────────────────────

/** The two rows that upstream gave the same (year, constituencyId), highest totalVotes first. */
const DUPES: StaticBundle["historicalResults"] = [
  {
    constituencyId: "c0002", year: 2011,
    winner: { name: "UPENDRA NATH BISWAS", partyId: "AITC", partyAbbr: "TMC", votes: 91821, voteShare: 51.2 },
    runnerUp: { name: "SUBHAS CHANDRA BOSE", partyId: "BJP", partyAbbr: "BJP", votes: 70865, voteShare: 39.5 },
    turnoutPct: 85, marginVotes: 20956, totalVotes: 179400, totalElectors: 210000,
  },
  {
    constituencyId: "c0002", year: 2011,
    winner: { name: "NARESH CHANDRA CHAKI", partyId: "BJP", partyAbbr: "BJP", votes: 88771, voteShare: 50.1 },
    runnerUp: { name: "AMAL KUMAR ROY", partyId: "AITC", partyAbbr: "TMC", votes: 74672, voteShare: 42.1 },
    turnoutPct: 82, marginVotes: 14099, totalVotes: 177200, totalElectors: 210000,
  },
];

test("B11: which of two rows claiming one seat survives is decided by CONTENT, not array position", async () => {
  const declaredWinner = async (rows: StaticBundle["historicalResults"]): Promise<string> => {
    const db = open(":memory:");
    migrate(db, NOW);
    const b = fixture();
    await runIngest(db, {
      nowIso: NOW,
      bundle: { ...b, historicalResults: [...b.historicalResults, ...rows] },
      monotonicMs: () => 0,
    });
    const w = db
      .prepare(
        `SELECT p.canonical_name AS name, r.votes AS votes FROM result r
           JOIN candidacy c ON c.id = r.candidacy_id
           JOIN person p ON p.id = c.person_id
          WHERE r.contest_id = 'wb-assembly-2011:mathabhanga-002' AND r.is_winner = 1`,
      )
      .get();
    db.close();
    return `${String(w?.name)} ${String(w?.votes)}`;
  };
  const forward = await declaredWinner(DUPES);
  const reversed = await declaredWinner([...DUPES].reverse());
  assert.equal(forward, reversed, "swapping two array elements changed the registry's recorded winner");
  assert.equal(forward, "UPENDRA NATH BISWAS 91821", "the rule is the higher totalVotes, stated");
  // and the discarded row is still reported verbatim, with the same detail either way
  const detailOf = async (rows: StaticBundle["historicalResults"]): Promise<string[]> => {
    const db = open(":memory:");
    migrate(db, NOW);
    const b = fixture();
    const r = await runIngest(db, {
      nowIso: NOW,
      bundle: { ...b, historicalResults: [...b.historicalResults, ...rows] },
      monotonicMs: () => 0,
    });
    db.close();
    return r.anomalies.filter((a) => a.kind === "duplicate_result_row").map((a) => a.detail);
  };
  assert.deepEqual(await detailOf(DUPES), await detailOf([...DUPES].reverse()));
});

test("B12: correcting one candidate's share revises the WHOLE contest, not just that row", async () => {
  const db = open(":memory:");
  migrate(db, NOW);
  const b = fixture();
  await runIngest(db, { nowIso: NOW, bundle: b, monotonicMs: () => 0 });
  const first = b.historicalResults[0];
  assert.ok(first?.runnerUp);
  const corrected: StaticBundle = {
    ...b,
    historicalResults: [
      { ...first, runnerUp: { ...first.runnerUp, voteShare: 26.77 } },
      ...b.historicalResults.slice(1),
    ],
  };
  await runIngest(db, { nowIso: NOW, bundle: corrected, monotonicMs: () => 0 });
  const perRevision = db
    .prepare(
      `SELECT revision AS rev, COUNT(*) AS n, ROUND(SUM(vote_share), 2) AS s FROM result
        WHERE contest_id = 'wb-assembly-2011:mekliganj-001' GROUP BY revision ORDER BY revision`,
    )
    .all();
  assert.deepEqual(
    perRevision.map((r) => [Number(r.rev), Number(r.n), Number(r.s)]),
    [
      [0, 2, 75.63],
      [1, 2, 75.66],
    ],
    "a revision must be the whole field, or the per-contest vote_share invariant is broken by design",
  );
  db.close();
});

test("B13: a vanished candidate's declared age and education do not survive their citation", async () => {
  const db = open(":memory:");
  migrate(db, NOW);
  const b = fixture();
  await runIngest(db, { nowIso: NOW, bundle: b, monotonicMs: () => 0 });
  const before = db
    .prepare("SELECT id, age_declared AS age FROM candidacy WHERE age_declared = 57")
    .get();
  assert.equal(Number(before?.age), 57, "Hiten Barman's declared age is there to start with");

  const report = await runIngest(db, {
    nowIso: NOW,
    bundle: { ...b, candidates: b.candidates.filter((c) => c.id !== "wb26_1") },
    monotonicMs: () => 0,
  });
  const after = db
    .prepare("SELECT age_declared AS age, education_declared AS edu FROM candidacy WHERE id = ?")
    .get(String(before?.id));
  assert.ok(after, "the candidacy row itself is kept — it is cited history");
  assert.equal(after.age, null, "a declared figure whose citation was just swept is an uncited value");
  assert.equal(after.edu, null);
  assert.equal(
    Number(db.prepare("SELECT COUNT(*) AS n FROM person_identifier WHERE value = 'wb26_1'").get()?.n),
    0,
  );
  assert.ok(report.anomalies.some((a) => a.kind === "stale_declaration_removed"));
  assert.equal(countUncited(db), 0, "and P2's number is honest again, not honest-looking");
  db.close();
});

test("B14: an ingest after a resolve does not resurrect the person the merge absorbed", async () => {
  const db = open(":memory:");
  migrate(db, NOW);
  const b = fixture();
  // One duplicate the resolver will merge at the default thresholds: same seat, same party, two
  // elections, one name.
  const bundle: StaticBundle = {
    ...b,
    candidates: [
      ...b.candidates,
      {
        id: "wb26_9", name: "Nikhil Ranjan Dey", partyId: "AITC", constituencyId: "c0002",
        criminalCases: 0, totalAssets: 100, affidavitUrl: "https://myneta.info/x?candidate_id=9",
      },
    ],
    historicalResults: [
      ...b.historicalResults,
      {
        constituencyId: "c0002", year: 2011,
        winner: { name: "NIKHIL RANJAN DEY", partyId: "AITC", partyAbbr: "TMC", votes: 60000, voteShare: 55 },
        runnerUp: { name: "SANKAR SINGHA", partyId: "BJP", partyAbbr: "BJP", votes: 40000, voteShare: 36 },
        turnoutPct: 80, marginVotes: 20000, totalVotes: 109000, totalElectors: 140000,
      },
    ],
  };
  await runIngest(db, { nowIso: NOW, bundle, monotonicMs: () => 0 });
  const r = resolvePersons(db, { nowIso: NOW });
  assert.ok(r.merged >= 1, "the fixture must actually produce a merge for this test to mean anything");
  const absorbed = db.prepare("SELECT merged_id AS id, surviving_id AS s FROM person_merge").all();
  const persons = (): number => Number(db.prepare("SELECT COUNT(*) AS n FROM person").get()?.n);
  const afterResolve = persons();

  await runIngest(db, { nowIso: NOW, bundle, monotonicMs: () => 0 });
  assert.equal(persons(), afterResolve, "the re-ingest resurrected the absorbed person");
  for (const m of absorbed) {
    const gone = String(m.id);
    assert.equal(
      Number(db.prepare("SELECT COUNT(*) AS n FROM person WHERE id = ?").get(gone)?.n),
      0,
      `${gone} came back from the dead`,
    );
    assert.equal(
      Number(db.prepare("SELECT COUNT(*) AS n FROM candidacy WHERE person_id = ?").get(gone)?.n),
      0,
      "a candidacy moved back onto the absorbed person",
    );
    assert.equal(
      Number(db.prepare("SELECT COUNT(*) AS n FROM claim WHERE subject_ref = ?").get(`person:${gone}`)?.n),
      0,
      "a claim's subject moved back onto the absorbed person",
    );
  }
  // and the ledger stays one row per merge: a second resolve must find nothing to do
  const again = resolvePersons(db, { nowIso: NOW });
  assert.equal(again.merged, 0, "the same pairs were re-merged into duplicate, unrevertable ledger rows");
  assert.equal(
    Number(db.prepare("SELECT COUNT(*) AS n FROM person_merge").get()?.n),
    absorbed.length,
  );
  assert.equal(countUncited(db), 0);
  db.close();
});

test("B15: two same-named nominations — current-mla.json's candidateId places the win exactly", async () => {
  const db = open(":memory:");
  migrate(db, NOW);
  const b = fixture();
  // c0099 really does field three "Swapan Majumder" rows in the real data. The name key is then
  // ambiguous, and cycle 1c fabricated a THIRD person with status 'elected' and no declared age —
  // while current-mla.json already names the winner's candidates.json id.
  await runIngest(db, {
    nowIso: NOW,
    bundle: {
      ...b,
      candidates: [
        ...b.candidates,
        {
          id: "wb26_4", name: "Paritosh Das", partyId: "AITC", constituencyId: "c0002",
          age: 62, education: "Graduate", criminalCases: 0, totalAssets: 700,
          affidavitUrl: "https://myneta.info/x?candidate_id=4",
        },
      ],
      currentMLAs: [
        ...b.currentMLAs,
        {
          constituencyId: "c0002", name: "Paritosh Das", partyId: "BJP", term: "2026-2031",
          marginVotes: 70420, voteShare: null, candidateId: "wb26_3",
          sourceUrl: "https://www.indiavotes.com/",
        },
      ],
    },
    monotonicMs: () => 0,
  });
  const rows = db
    .prepare(
      `SELECT status, age_declared AS age FROM candidacy
        WHERE contest_id = 'wb-assembly-2026:mathabhanga-002' ORDER BY age_declared`,
    )
    .all()
    .map((r) => [String(r.status), r.age]);
  assert.deepEqual(
    rows,
    [["elected", 44], ["contesting", 62]],
    "two nominations, two candidacies — no fabricated third person for the declared winner",
  );
  assert.equal(countUncited(db), 0);
  db.close();
});

test("B16: a seat whose 2026 result row is missing still has its declared winner elected", async () => {
  const db = open(":memory:");
  migrate(db, NOW);
  const b = fixture();
  // Falta's shape: current-mla.json declares a winner with a candidateId, historical-results.ts has
  // no 2026 row for the seat, so the sitting MLA's candidacy stayed 'contesting' forever.
  const report = await runIngest(db, {
    nowIso: NOW,
    bundle: {
      ...b,
      currentMLAs: [
        {
          constituencyId: "c0001", name: "Hiten Barman", partyId: "AITC", term: "2026-2031",
          marginVotes: 29584, voteShare: null, candidateId: "wb26_1",
          sourceUrl: "https://www.indiavotes.com/",
        },
      ],
    },
    monotonicMs: () => 0,
  });
  const won = db
    .prepare(
      `SELECT id, age_declared AS age FROM candidacy
        WHERE contest_id = 'wb-assembly-2026:mekliganj-001' AND status = 'elected'`,
    )
    .all();
  assert.equal(won.length, 1, "one declared winner, on the nomination current-mla.json points at");
  assert.match(String(won[0]?.id), /hiten-barman/);
  assert.equal(won[0]?.age, 57, "and it is the affidavit's candidacy, so the declared age is there");
  // no tallies exist for that seat, so no result row is invented and the gap stays reported
  assert.equal(
    Number(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM result WHERE contest_id = 'wb-assembly-2026:mekliganj-001'",
        )
        .get()?.n,
    ),
    0,
  );
  assert.ok(report.anomalies.some((a) => a.kind === "elected_without_result"));
  assert.equal(countUncited(db), 0);
  db.close();
});

test("B7: photoUrl and incumbentYears are carried, cited, and never invented", async () => {
  const { db } = await ingested();
  /** claim + the URL of the source its citation resolves to. */
  const cited = (predicate: string): { subject: string; value: string; unit: string | null; url: string }[] =>
    db
      .prepare(
        `SELECT c.subject_ref AS subject, c.object_value AS value, c.unit AS unit, s.url AS url
           FROM claim c JOIN citation ci ON ci.claim_id = c.id JOIN source s ON s.id = ci.source_id
          WHERE c.predicate = ? ORDER BY c.subject_ref`,
      )
      .all(predicate)
      .map((r) => ({
        subject: String(r.subject),
        value: String(r.value),
        unit: r.unit === null ? null : String(r.unit),
        url: String(r.url),
      }));

  // A URL is a claim about the PERSON, cited to that candidate's own affidavit page — the shape
  // every other declared field already has, and the reason no column was added to `person`.
  const photos = cited("photo_url_declared");
  assert.equal(photos.length, 2, "two of the three fixture candidates ship a photo");
  assert.ok(photos.every((p) => p.subject.startsWith("person:")));
  assert.deepEqual(
    photos.map((p) => [JSON.parse(p.value), p.url]).sort(),
    [
      ["https://myneta.info/images_candidate/WestBengal2026/hiten.jpg", "https://myneta.info/x?candidate_id=1"],
      ["https://myneta.info/images_candidate/WestBengal2026/kamal.jpg", "https://myneta.info/x?candidate_id=2"],
    ].sort(),
  );

  // The tenure is a figure about the CANDIDACY: the same human's next nomination declares a
  // different number, so a person-subject claim would collide with itself.
  const years = cited("incumbent_years_declared");
  assert.equal(years.length, 1, "only the incumbent declares years served — the other two invent none");
  assert.match(String(years[0]?.subject), /^candidacy:wb-assembly-2026:mekliganj-001/);
  assert.deepEqual([JSON.parse(String(years[0]?.value)), years[0]?.unit], [5, "years"]);
  assert.equal(years[0]?.url, "https://myneta.info/x?candidate_id=1");

  assert.equal(countUncited(db), 0, "both new claims are cited, so P2's number stays 0");
  db.close();
});

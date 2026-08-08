// The round trip, tested on a fixture: what the report must never do is flatter itself. The three
// properties asserted here are the ones that make its number worth gating on — an unresolvable party
// label comes back VERBATIM, a name the registry holds two candidates for is reported ambiguous
// instead of guessed, and a field the schema cannot hold is counted separately from a wrong value.

import assert from "node:assert/strict";
import test from "node:test";

import { open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { runIngest } from "./index.ts";
import type { StaticBundle } from "./index.ts";
import { THRESHOLD_PCT, diff, reconstruct } from "./export.ts";
import type { ModuleStat, Row, Seed } from "./export.ts";

const NOW = "2026-08-07T00:00:00Z";
const UNMATCHED = "JATIYA UNNAYAN PARTY";

const docs = Object.fromEntries(
  [
    "constituencies",
    "parties",
    "candidates",
    "historicalResults",
    "currentMLAs",
    "demographics",
    "cabinet",
    "mps",
  ].map((k, i) => [k, { file: `${k}.json`, retrievedOn: "2026-04-25", docHash: String(i).repeat(64) }]),
) as StaticBundle["docs"];

function fixture(): StaticBundle {
  return {
    docs,
    constituencies: [
      { id: "c0001", assemblyNumber: 1, name: "Mekliganj", district: "Cooch Behar", reservation: "SC" },
      { id: "c0002", assemblyNumber: 2, name: "Mathabhanga", district: "Cooch Behar", reservation: "General" },
    ],
    parties: [
      { id: "AITC", name: "All India Trinamool Congress", abbreviation: "TMC", isNational: true },
      { id: "BJP", name: "Bharatiya Janata Party", abbreviation: "BJP", isNational: true },
    ],
    candidates: [
      {
        id: "wb26_1", name: "Hiten Barman", partyId: "AITC", constituencyId: "c0001",
        age: 57, gender: "Male", education: "Graduate", criminalCases: 0,
        totalAssets: 1021356, totalLiabilities: 0, movableAssets: 500000,
        affidavitUrl: "https://myneta.info/x?candidate_id=1", occupation: "Social Work",
        // The two fields cycle 4 recovered, plus the boolean the seed derives from the second.
        photoUrl: "https://myneta.info/photo/1.jpg", incumbentYears: 5, isIncumbent: true,
      },
      {
        id: "wb26_2", name: "Kamal Kumar Roy", partyId: UNMATCHED, constituencyId: "c0001",
        age: 61, gender: "Male", education: "Graduate", criminalCases: 3,
        totalAssets: 900, totalLiabilities: 100,
        affidavitUrl: "https://myneta.info/x?candidate_id=2",
        photoUrl: "https://myneta.info/photo/2.jpg", isIncumbent: false,
      },
      {
        id: "wb26_3", name: "Paritosh Das", partyId: "BJP", constituencyId: "c0002",
        age: 44, education: "Post Graduate", criminalCases: 0,
        totalAssets: 5000, totalLiabilities: 0,
        affidavitUrl: "https://myneta.info/x?candidate_id=3",
        photoUrl: "https://myneta.info/photo/3.jpg", isIncumbent: false,
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
    ],
    currentMLAs: [
      {
        constituencyId: "c0002", name: "Paritosh Das", partyId: "BJP", term: "2026-2031",
        marginVotes: 29584, voteShare: null, candidateId: "wb26_3",
        sourceUrl: "https://www.indiavotes.com/",
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
        margin: 39250, electedOn: "2024-06-04",
        sourceUrl: "https://en.wikipedia.org/wiki/2024_Indian_general_election_in_West_Bengal",
      },
    ],
  };
}

/** The fixture's own rows, in seed-file shape: the bundle IS the seed for these modules. */
function seedOf(b: StaticBundle): Seed {
  return {
    "constituencies.json": b.constituencies as unknown as Row[],
    "parties.json": b.parties as unknown as Row[],
    "candidates.json": b.candidates as unknown as Row[],
    "historical-results.json": b.historicalResults as unknown as Row[],
    "current-mla.json": b.currentMLAs as unknown as Row[],
    "demographics.json": b.demographics as unknown as Row[],
    "cabinet.json": b.cabinet as unknown as Row[],
    "wbmps.json": b.mps as unknown as Row[],
  };
}

async function ingested(): Promise<ReturnType<typeof open>> {
  const db = open(":memory:");
  migrate(db, NOW);
  await runIngest(db, { nowIso: NOW, bundle: fixture(), monotonicMs: () => 0 });
  return db;
}

const mod = (stats: readonly ModuleStat[], file: string): ModuleStat =>
  stats.find((m) => m.file === file) as ModuleStat;
const field = (m: ModuleStat, name: string): { exact: number; diff: number; ambiguous: number; notStored: number } =>
  m.fields.find((f) => f.field === name) ?? { exact: 0, diff: 0, ambiguous: 0, notStored: 0 };

test("the registry rebuilds one row per seed row for every module it ingests", async () => {
  const db = await ingested();
  const out = reconstruct(db);
  assert.deepEqual(
    Object.fromEntries(Object.entries(out).map(([f, rows]) => [f, rows.length])),
    {
      "constituencies.json": 2,
      "parties.json": 2,
      "candidates.json": 3,
      "historical-results.json": 1,
      "current-mla.json": 1,
      "demographics.json": 1,
      "cabinet.json": 1,
      "wbmps.json": 1,
    },
  );
  db.close();
});

test("an unresolvable party label comes back verbatim, and derived values come back exactly", async () => {
  const db = await ingested();
  const r = diff(seedOf(fixture()), reconstruct(db));

  const cands = mod(r.modules, "candidates.json");
  // The whole point of candidacy.party_raw: 31 labels in the real data resolve to nothing, and a
  // round trip that returns a slug or a synthesised abbreviation instead of the label is lossy.
  assert.equal(field(cands, "partyId").exact, 3);
  assert.equal(field(cands, "partyId").diff, 0);
  const rebuilt = reconstruct(db)["candidates.json"] as Row[];
  assert.equal(rebuilt.find((c) => c["id"] === "wb26_2")?.["partyId"], UNMATCHED);
  // Declared figures ride on affidavit_field / candidacy columns and must be identical, not close.
  for (const f of ["totalAssets", "totalLiabilities", "age", "education", "criminalCases"]) {
    assert.equal(field(cands, f).diff, 0, f);
    assert.equal(field(cands, f).ambiguous, 0, f);
  }
  // 'General' is stored lowercase; the seed's casing has to come back.
  assert.equal(field(mod(r.modules, "constituencies.json"), "reservation").exact, 2);
  // Census figures are the one module with nothing derived and nothing merged: it must be 100%.
  assert.equal(mod(r.modules, "demographics.json").pct, 100);
  // vote_share is stored per row, so it round-trips; margin is recomputed and must still be exact.
  const hist = mod(r.modules, "historical-results.json");
  assert.equal(field(hist, "winner.voteShare").exact, 1);
  assert.equal(field(hist, "marginVotes").exact, 1);
  db.close();
});

test("a field the schema cannot hold is 'not reconstructable', a wrong value is a difference", async () => {
  const db = await ingested();
  const b = fixture();
  const doctored = {
    ...seedOf(b),
    // A party colour has no column anywhere in the 35 tables; a wrong name is a different failure.
    "parties.json": b.parties.map((p, i) => ({
      ...p,
      color: "#1B5E20",
      ...(i === 0 ? { name: "Trinamool" } : {}),
    })) as Row[],
  };
  const r = diff(doctored, reconstruct(db));
  const parties = mod(r.modules, "parties.json");
  assert.equal(field(parties, "color").notStored, 2);
  assert.equal(field(parties, "name").diff, 1);
  assert.equal(field(parties, "name").exact, 1);
  db.close();
});

test("photoUrl and incumbentYears come back — 'not reconstructable' cannot name a stored field", async () => {
  // The regression this guards: both were on NOT_STORED while 2,920 and 157 cited claims held them,
  // so the report told a reader the cycle's own recovered fields were unrecoverable, and the ratchet
  // was set 3.4pp below what the registry can give back.
  const db = await ingested();
  const cands = mod(diff(seedOf(fixture()), reconstruct(db)).modules, "candidates.json");
  for (const [f, exact] of [["photoUrl", 3], ["incumbentYears", 1], ["isIncumbent", 3]] as const) {
    assert.equal(field(cands, f).exact, exact, f);
    assert.equal(field(cands, f).notStored, 0, f);
    assert.equal(field(cands, f).diff, 0, f);
  }
  db.close();
});

test("a rebuilt row with no seed row is counted, not ignored", () => {
  // diff() used to walk only the seed, so a rebuild could invent unlimited rows and still score
  // 100%: one real row plus 999 fabricated keys read 'values 2/2 exact 100%'.
  const seed = { "demographics.json": [{ constituencyId: "c0001", population: 1 }] };
  const rebuilt = {
    "demographics.json": [
      { constituencyId: "c0001", population: 1 },
      ...Array.from({ length: 9 }, (_, i) => ({ constituencyId: `bogus${i}`, population: 2 })),
    ],
  };
  const m = mod(diff(seed, rebuilt).modules, "demographics.json");
  assert.equal(m.inventedRows, 9);
  assert.ok(m.pct < 100, `an invented row must cost the percentage, got ${m.pct}`);
  // 2 real values exact, plus 2 leaves per invented row counted against it.
  assert.equal(m.exact, 2);
  assert.equal(m.values, 20);
});

test("a name resolution left two candidates for is ambiguous, never quietly guessed", async () => {
  const db = await ingested();
  // Exactly what a person_merge produces: one person carrying two source spellings, with nothing
  // linking either spelling to a particular candidacy.
  const person = db
    .prepare("SELECT person_id AS p FROM person_identifier WHERE value = 'wb26_1'")
    .get() as { p: string };
  db.prepare(
    "INSERT INTO person_alias (person_id, name, script, norm_key, kind, first_seen, source_id)" +
      " SELECT ?, 'BARMAN HITEN', 'latn', 'brmn-htn', 'eci_nomination', first_seen, source_id" +
      " FROM person_alias WHERE person_id = ? LIMIT 1",
  ).run(person.p, person.p);

  const r = diff(seedOf(fixture()), reconstruct(db));
  const name = field(mod(r.modules, "candidates.json"), "name");
  assert.equal(name.ambiguous, 1);
  // The two unmerged candidates still come back exactly: ambiguity is per person, not per module.
  assert.equal(name.exact, 2);
  assert.equal(name.diff, 0);
  const stat = mod(r.modules, "candidates.json").fields.find((f) => f.field === "name");
  // The guess the report refused to make is still reported, so the cost of resolution is separable
  // from a name that is genuinely gone.
  assert.equal(stat?.guessable, 1);
  assert.match(String(stat?.examples[0]?.got), /^ambiguous \(guess: Hiten Barman\)$/);
  db.close();
});

test("the gate is a ratchet that can actually be green today", () => {
  // An always-red gate is ignored (cycle 1's unsatisfiable vote-share invariant). The floor is the
  // measured value, so it must be below 100 and above zero — and it is raised, never lowered.
  assert.ok(THRESHOLD_PCT > 0 && THRESHOLD_PCT < 100);
  // Identical input and rebuild is 100%: the metric has no built-in penalty.
  const same = diff({ "demographics.json": [{ constituencyId: "c0001", population: 1 }] },
    { "demographics.json": [{ constituencyId: "c0001", population: 1 }] });
  assert.equal(mod(same.modules, "demographics.json").pct, 100);
});

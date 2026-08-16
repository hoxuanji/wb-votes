/**
 * Regression tests for the election-identity defect.
 *
 * Bihar held two assembly elections in 2005 — its 13th assembly in February, its 14th in November, 243
 * seats each — and an id of (jurisdiction, house, year) collapsed them into `br-assembly-2005`. 486
 * contests became 243, the 618 candidates who stood in the same seat at both elections collided in a
 * candidacy key derived from (contest, person), and 34 seats ended up with two declared winners.
 * docs/model/election-identity.md.
 *
 * These assert the FACTS. Purnamasi Ram won Bagha in February 2005 with 59,151 votes and again in November
 * with 60,794; the registry must say exactly that, twice, in two different elections.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { DEV_DB_PATH, all, get, openRead } from "../../db/index.ts";
import { chronological, electionIdOf, eventsFromRows, planFromRows, suffixNote, type SourceElection } from "./event.ts";
import { validateElections } from "./validate.ts";

function haveRegistry(): boolean {
  try {
    const d = openRead(DEV_DB_PATH);
    try {
      d.prepare("SELECT 1 FROM election WHERE year IS NOT NULL LIMIT 1").get();
      return true;
    } finally {
      d.close();
    }
  } catch {
    return false;
  }
}
const skip = haveRegistry()
  ? false
  : `no repaired registry at ${DEV_DB_PATH} — run: mandate migrate && mandate elections backfill --apply`;
const skipSource = existsSync(".data/cache/lokdhaba/refetch-manifest.tsv")
  ? false
  : "no hash-verified source cache — run ops/geo/refetch-lokdhaba.sh";

const db = () => openRead(DEV_DB_PATH);

type Ev = {
  id: string;
  year: number;
  polling_month: number | null;
  house_ordinal: number | null;
  occurrence: number;
  house: string;
  contests: number;
  winners: number;
};
const events = (d: ReturnType<typeof db>, like: string): Ev[] =>
  all<Ev>(
    d,
    `SELECT e.id, e.year, e.polling_month, e.house_ordinal, e.occurrence, e.house,
            (SELECT COUNT(*) FROM contest c WHERE c.election_id = e.id) AS contests,
            (SELECT COUNT(*) FROM result r JOIN contest c ON c.id = r.contest_id
              WHERE c.election_id = e.id AND r.is_winner = 1 AND r.revision = 0) AS winners
       FROM election e WHERE e.id LIKE ? ORDER BY e.year, e.polling_month, e.occurrence`,
    like,
  );

test("THE REGRESSION: Bihar's two 2005 assembly elections are two events", { skip }, () => {
  const d = db();
  const both = events(d, "br-assembly-2005%");
  assert.equal(both.length, 2, `expected two events, got ${both.map((e) => e.id).join(", ")}`);

  const [feb, nov] = both;
  assert.ok(feb !== undefined && nov !== undefined);
  assert.equal(feb.polling_month, 2, "the first is February");
  assert.equal(nov.polling_month, 11, "the second is November");
  assert.equal(feb.house_ordinal, 13, "February 2005 constituted Bihar's 13th assembly");
  assert.equal(nov.house_ordinal, 14, "November 2005 constituted its 14th");
  assert.equal(feb.occurrence, 1);
  assert.equal(nov.occurrence, 2);

  // Both are complete: 243 seats and 243 winners each, where the collapsed election had 243 contests
  // between them and 277 winners.
  for (const e of both) {
    assert.equal(e.contests, 243, `${e.id} contests`);
    assert.equal(e.winners, 243, `${e.id} declared winners`);
  }
  d.close();
});

test("the same candidate winning the same seat twice is two results, not a collision", { skip }, () => {
  const d = db();
  // Bagha, seat 2. Purnamasi Ram (JD(U)) won it in February with 59,151 and again in November with 60,794.
  // A candidacy id derived from (contest, person) made those one row; the split makes them two.
  const rows = all<{ election_id: string; seat: string; winner: string; votes: number }>(
    d,
    `SELECT c.election_id, v.canonical_name AS seat, per.canonical_name AS winner, r.votes
       FROM contest c
       JOIN place_version v ON v.id = c.place_version_id
       JOIN result r        ON r.contest_id = c.id AND r.is_winner = 1 AND r.revision = 0
       JOIN candidacy ca    ON ca.id = r.candidacy_id
       JOIN person per      ON per.id = ca.person_id
      WHERE c.election_id LIKE 'br-assembly-2005%' AND v.number = 2
      ORDER BY c.election_id`,
  );
  assert.equal(rows.length, 2, "one winner per event at Bagha");
  assert.deepEqual(
    rows.map((r) => [r.election_id, r.votes]),
    [["br-assembly-2005-02", 59151], ["br-assembly-2005-11", 60794]],
  );
  // THE SPELLING IS NOT THE PROPERTY, and pinning it was the mistake. The source spells him PURANMASI RAM in
  // February and PURNMASI RAM in November, and a third seat's winner is PURANWASI RAM; the regex here once
  // accepted two of those three, so a registry rebuilt from the same bytes failed the test by holding what
  // the source actually says. What matters is the invariant the merge queue exists for: two events, two
  // candidacies, TWO PERSON ROWS for one human, because no two of the spellings are equal.
  for (const r of rows) assert.match(r.winner, /^PUR[AN]*[MW]ASI RAM$/i, `got ${r.winner}`);
  assert.equal(new Set(rows.map((r) => r.winner)).size, 2, "the two spellings collapsed into one");
  d.close();
});

test("no contest anywhere declares more winners than it has seats", { skip }, () => {
  const d = db();
  const bad = all<{ ex: string }>(
    d,
    `SELECT c.election_id || ' / ' || c.id || ' has ' || COUNT(*) || ' winners' AS ex
       FROM contest c
       JOIN result r ON r.contest_id = c.id AND r.is_winner = 1 AND r.revision = 0
      GROUP BY c.id HAVING COUNT(*) > c.seats_available`,
  );
  assert.equal(bad.length, 0, `the 34+1 duplicate-winner defect is back: ${bad.map((b) => b.ex).join(", ")}`);
  d.close();
});

test("by-election rounds in one year are separate events", { skip }, () => {
  const d = db();
  // Uttar Pradesh 2014 held two rounds of assembly by-elections, and one seat was polled in both — the
  // second duplicate-winner contest before the split.
  const rounds = events(d, "up-bypoll-ae-2014%");
  assert.equal(rounds.length, 2, `expected two rounds, got ${rounds.map((r) => r.id).join(", ")}`);
  assert.deepEqual(rounds.map((r) => r.id).sort(), ["up-bypoll-ae-2014-p1", "up-bypoll-ae-2014-p2"]);
  for (const r of rounds) assert.equal(r.house, "ac");
  // A by-election carries no month in the source, so occurrence — not a date — is what orders the rounds.
  assert.deepEqual(rounds.map((r) => r.occurrence).sort(), [1, 2]);
  d.close();
});

test("an assembly and a parliamentary by-election in one state and year are distinct", { skip }, () => {
  const d = db();
  // 145 such pairs existed, told apart by nothing but their id text: both are kind='bypoll' at
  // level='state'. `house` is what distinguishes them now, and it is part of the UNIQUE identity.
  const pair = all<{ id: string; house: string; year: number; kind: string }>(
    d,
    `SELECT id, house, year, kind FROM election
      WHERE id IN ('ap-bypoll-ae-1965', 'ap-bypoll-ge-1965') ORDER BY id`,
  );
  assert.equal(pair.length, 2);
  assert.deepEqual(pair.map((p) => p.house), ["ac", "pc"]);
  assert.deepEqual(pair.map((p) => p.kind), ["bypoll", "bypoll"]);
  d.close();
});

test("identity is total: no two events share (jurisdiction, kind, house, year, occurrence)", { skip }, () => {
  const d = db();
  const dupes = all<{ ex: string }>(
    d,
    `SELECT jurisdiction_place_id || ' ' || kind || ' ' || house || ' ' || year || ' #' || occurrence AS ex
       FROM election
      GROUP BY jurisdiction_place_id, kind, house, year, occurrence HAVING COUNT(*) > 1`,
  );
  assert.equal(dupes.length, 0, dupes.map((x) => x.ex).join(", "));
  const unnamed = get<{ n: number }>(d, "SELECT COUNT(*) AS n FROM election WHERE year IS NULL");
  assert.equal(unnamed?.n, 0, "every election carries a year");
  d.close();
});

test("chronology comes from the columns, and a split id would break string sorting", { skip }, () => {
  const d = db();
  // The point of the year column: 'br-assembly-2005-02' ends in '5-02', so substr(id, -4) reads it as
  // year 5. Anything still sorting on the id string would put Bihar's February 2005 election before 1962.
  const byString = all<{ id: string }>(
    d,
    `SELECT id FROM election WHERE id LIKE 'br-assembly-%'
      ORDER BY CAST(substr(id, -4) AS INTEGER) LIMIT 1`,
  );
  assert.match(byString[0]?.id ?? "", /br-assembly-2005-(02|11)/, "string sorting does mis-sort a split id");

  const byColumns = all<{ id: string; year: number }>(
    d,
    `SELECT id, year FROM election WHERE id LIKE 'br-assembly-%'
      ORDER BY year, polling_month, occurrence LIMIT 1`,
  );
  assert.ok((byColumns[0]?.year ?? 0) < 1970, `real chronology starts at ${byColumns[0]?.year}`);
  d.close();
});

test("every contest, result and place version hangs off exactly one event", { skip }, () => {
  const d = db();
  const orphans = all<{ ex: string }>(
    d,
    `SELECT 'contest ' || c.id || ' names a missing election' AS ex
       FROM contest c WHERE NOT EXISTS (SELECT 1 FROM election e WHERE e.id = c.election_id)
     UNION ALL
     SELECT 'result on missing contest ' || r.contest_id AS ex
       FROM result r WHERE NOT EXISTS (SELECT 1 FROM contest c WHERE c.id = r.contest_id)
     UNION ALL
     SELECT 'contest ' || c.id || ' points at no place version' AS ex
       FROM contest c WHERE NOT EXISTS (SELECT 1 FROM place_version v WHERE v.id = c.place_version_id)
     UNION ALL
     SELECT e.id || ' fills ' || e.house || ' but has a ' || v.kind || ' contest' AS ex
       FROM election e JOIN contest c ON c.election_id = e.id
       JOIN place_version v ON v.id = c.place_version_id
      WHERE e.house IN ('ac','pc') AND v.kind <> e.house`,
  );
  assert.equal(orphans.length, 0, orphans.slice(0, 5).map((o) => o.ex).join(" | "));
  d.close();
});

test("the split is recorded in the ledger IF it ever had to happen", { skip }, () => {
  // WHAT IS BEING ASSERTED IS THE OUTCOME, not the repair. Bihar held two assembly elections in 2005 and they
  // collapsed into one id; `elections repair` split them and wrote the ledger entry. The importer has since
  // learned to key an election by its event, so a registry built from these bytes today creates
  // `br-assembly-2005-02` and `-11` directly and there is nothing to correct — a clean build has no ledger
  // row, which is not a regression but the defect never occurring.
  //
  // So: the collapsed id must NOT exist, and if it ever did the correction must be there. Requiring the row
  // unconditionally made a correctly built registry fail for being correctly built.
  const d = db();
  const collapsed = all<{ id: string }>(d, `SELECT id FROM election WHERE id = 'br-assembly-2005'`);
  assert.equal(collapsed.length, 0, "the collapsed election id is still present");
  const split = all<{ id: string }>(d, `SELECT id FROM election WHERE id LIKE 'br-assembly-2005-%' ORDER BY id`);
  assert.deepEqual(split.map((r) => r.id), ["br-assembly-2005-02", "br-assembly-2005-11"]);

  const rows = all<{ entity_ref: string; new_value: string; reason: string }>(
    d,
    `SELECT entity_ref, new_value, reason FROM correction
      WHERE entity_ref = 'election:br-assembly-2005' AND field = 'id'`,
  );
  if (rows.length > 0) {
    assert.equal(rows.length, 1, "one correction for the Bihar split");
    assert.match(rows[0]?.new_value ?? "", /br-assembly-2005-02/);
    assert.match(rows[0]?.new_value ?? "", /br-assembly-2005-11/);
    assert.match(rows[0]?.reason ?? "", /distinct electoral events/);
  }
  d.close();
});

test("all election checks pass on the live registry", { skip: skip || skipSource }, () => {
  const d = db();
  const v = validateElections(d);
  for (const c of v.checks) {
    assert.equal(c.skipped, false, `check ${c.n} was not asked`);
    assert.equal(c.violations, 0, `check ${c.n} (${c.name}): ${c.examples.join(" | ")}`);
  }
  assert.equal(v.metrics.duplicateWinnerContests, 0);
  assert.equal(v.metrics.withoutYear, 0);
  assert.equal(v.metrics.missingFromRegistry, 0, "every event the source describes is present");
  assert.equal(v.metrics.multiEventYears, 14, "the 14 known multi-event years, no more and no fewer");
  d.close();
});

// ── the pure id scheme, no registry needed ──────────────────────────────────────────────────────────

const ev = (o: Partial<SourceElection>): SourceElection => ({
  jurisdictionId: "br",
  house: "ac",
  year: 2005,
  houseOrdinal: 13,
  pollNo: 0,
  month: 2,
  seats: 243,
  rows: 3193,
  sourceId: "lokdhaba:br:AE:abc",
  ...o,
});

test("a year with one event keeps its existing id; a year with two suffixes both", { skip: false }, () => {
  const solo = ev({});
  assert.equal(electionIdOf(solo, [solo]), "br-assembly-2005");

  const feb = ev({ month: 2, houseOrdinal: 13 });
  const nov = ev({ month: 11, houseOrdinal: 14 });
  const group = [feb, nov];
  assert.equal(electionIdOf(feb, group), "br-assembly-2005-02");
  assert.equal(electionIdOf(nov, group), "br-assembly-2005-11");
  assert.equal(suffixNote(feb, group), " (February)");
  assert.equal(suffixNote(nov, group), " (November)");

  // Both halves are suffixed. Leaving one on the bare id would imply it is "the" 2005 election.
  assert.notEqual(electionIdOf(feb, group), "br-assembly-2005");

  // Where the month cannot separate them, the house ordinal does — no id is ever ambiguous.
  const sameMonth = [ev({ month: 5, houseOrdinal: 13 }), ev({ month: 5, houseOrdinal: 14 })];
  assert.deepEqual(sameMonth.map((e) => electionIdOf(e, sameMonth)), [
    "br-assembly-2005-a13",
    "br-assembly-2005-a14",
  ]);

  // By-election rounds are separated by the round number, because their rows carry no month at all.
  const r1 = ev({ pollNo: 1, month: null });
  const r2 = ev({ pollNo: 2, month: null });
  assert.deepEqual([r1, r2].map((e) => electionIdOf(e, [r1, r2])), [
    "br-bypoll-ae-2005-p1",
    "br-bypoll-ae-2005-p2",
  ]);
  assert.equal(electionIdOf(r1, [r1]), "br-bypoll-ae-2005");
});

test("a general parliamentary election is one national event, however many files describe it", { skip: false }, () => {
  // Every state file describes its own slice of a Lok Sabha election. Keying it by the file's state made
  // one event per state — 1,571 "events" for 1,188 elections — and whichever state was imported last would
  // have owned the row. A parliamentary BY-election is not national and keeps its state.
  const row = (o: Record<string, string>): Record<string, string> => ({
    Election_Type: "Lok Sabha Election (GE)",
    Year: "2019",
    Assembly_No: "17",
    Poll_No: "0",
    month: "4",
    Constituency_No: "1",
    ...o,
  });
  const ka = eventsFromRows("ka", [row({})], "lokdhaba:ka:GE:x").events;
  const mh = eventsFromRows("mh", [row({ month: "5" })], "lokdhaba:mh:GE:y").events;
  assert.equal(ka[0]?.jurisdictionId, "in", "a general parliamentary election belongs to the nation");
  assert.equal(mh[0]?.jurisdictionId, "in");
  assert.equal(electionIdOf(ka[0]!, ka), "ls-2019");
  assert.equal(electionIdOf(mh[0]!, mh), "ls-2019");

  const bypoll = eventsFromRows("up", [row({ Poll_No: "1", month: "" })], "lokdhaba:up:GE:z").events;
  assert.equal(bypoll[0]?.jurisdictionId, "up", "a parliamentary by-election stays the state's");
  assert.equal(electionIdOf(bypoll[0]!, bypoll), "up-bypoll-ge-2019");
});

test("phased polling does not split an election, and a blank month is null not zero", { skip: false }, () => {
  // 2019's Lok Sabha election polled across April and May. Keying on the month would have made that two
  // elections; the key is (Assembly_No, Poll_No) and the month is kept as the earliest reported.
  const rows = [4, 5, 3].map((m) => ({
    Election_Type: "State Assembly Election (AE)",
    Year: "2019",
    Assembly_No: "9",
    Poll_No: "0",
    month: String(m),
    Constituency_No: String(m),
  }));
  const { events: evs } = eventsFromRows("mh", rows, "s");
  assert.equal(evs.length, 1, "one election, three polling months");
  assert.equal(evs[0]?.month, 3, "the month recorded is the earliest");
  assert.equal(evs[0]?.seats, 3);

  // `Number("")` is 0, which put month 0 on every by-election and failed the CHECK that says 1-12.
  const blank = eventsFromRows(
    "mh",
    [{ Election_Type: "State Assembly Election (AE)", Year: "2019", Assembly_No: "9", Poll_No: "1", month: "", Constituency_No: "1" }],
    "s",
  ).events;
  assert.equal(blank[0]?.month, null, "a blank month is null, never month zero");
});

test("planFromRows gives every event an id and a chronological occurrence", { skip: false }, () => {
  const rows = [
    { Election_Type: "State Assembly Election (AE)", Year: "2005", Assembly_No: "14", Poll_No: "0", month: "11", Constituency_No: "1" },
    { Election_Type: "State Assembly Election (AE)", Year: "2005", Assembly_No: "13", Poll_No: "0", month: "2", Constituency_No: "1" },
  ];
  const plan = planFromRows("br", rows, "src");
  const byId = new Map([...plan.values()].map((p) => [p.id, p]));
  assert.equal(byId.get("br-assembly-2005-02")?.occurrence, 1, "February is the first occurrence");
  assert.equal(byId.get("br-assembly-2005-11")?.occurrence, 2);

  // Ordering is by real chronology even when the rows arrive newest-first, as they did here.
  const sorted = [...plan.values()].sort((a, b) => a.occurrence - b.occurrence).map((p) => p.id);
  assert.deepEqual(sorted, ["br-assembly-2005-02", "br-assembly-2005-11"]);
  assert.equal(chronological(ev({ month: 2 }), ev({ month: 11 })) < 0, true);
});

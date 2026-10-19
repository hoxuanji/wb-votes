// The readers built on seat results, on a hand-built registry: the party tallies and the front page's closest fights,
// the state trajectory, the election map, the parent levels of the place page, and the sources behind them.
//
// Each of them used to carry its own copy of who won, what party that was, by how much and on what turnout. The
// fixture is built in memory because the seed registry cannot show the cases that matter: it has no winner the
// registry can only name by the source's string, no revision above 0, and one unverified election with no other
// state to be compared with. What the registry-backed half checks against the old readers is in read-seats.test.ts.

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { closeFights, foldStandings, seatsByParty, seatsWonBy } from "./elections.ts";
import { electionMapView, SHARED_FRAME } from "./election-map.ts";
import { electionCoverage } from "./home.ts";
import { placeView } from "./place-page.ts";
import { partyVotes, readSeats, sourcesFor } from "./seat-results.ts";
import { searchAll } from "./search.ts";
import { readRegistry } from "./session.ts";
import { stateTrajectory } from "./trajectory.ts";

const plain = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

type Standing = {
  who: string;
  /** party_version id, or null for a candidate the registry cannot name past `raw`. */
  pv: number | null;
  raw?: string | null;
  votes: number | null;
  rank: number;
  win?: boolean;
  margin?: number | null;
  src?: string;
  revision?: number;
};

/**
 * Karnataka, Kerala, West Bengal and Tamil Nadu, six elections.
 *
 *   ka-assembly-2018  verified. ka.ac.001 and .002 are in district North, .003 in South, .004 hangs off the state.
 *     c1 AAA 600 beat BBB 400 (margin 200)   c2 CCC 520 beat AAA 480 (40)   c3 AAA 505 beat CCC 495 (10)
 *     c4 NO DECLARED WINNER: a rank 2 row and no turnout.  c1 also has a revision-1 row nothing reads (source s4).
 *   ka-assembly-2023  verified. ka.ac.003 is fought under the NEW boundaries (epoch e2), so it has no predecessor.
 *     c5 AAA 640 beat BBB 360   c6 BBB 550 beat CCC 450   c7 AAA 502 beat CCC 498   c8 an IND the registry cannot name
 *     past the source's string, 700 to AAA's 300.  ka.ac.004 had no declared winner in 2018, so it has no predecessor.
 *   kl-assembly-2021  verified, one seat. CCC 700 beat AAA 600 with counts and NO declared margin.
 *   wb-assembly-2026  UNVERIFIED: turnout and declared margins, no vote counts at all. wb.ac.003 has no declared winner.
 *   tn-assembly-2020  verified, one seat whose winner's 90,000 votes have no runner-up beside them, so its margin is the
 *     declared one: 44,751 of 140,000 polled is 31.965%, a tie at the third decimal that SQLite's ROUND rounds down.
 *   ls-2024           verified, a general election: one seat in Karnataka and one in Kerala.
 *
 * Sources: s1 the results, s2 the turnout, s3 the outlines, s4 a revision nobody reads, s5 and s6 the results and the
 * turnout of ka.ac.003 alone, so that a scope narrower than the election cites fewer of them.
 */
function fixture(db: DatabaseSync): DatabaseSync {
  migrate(db, "2026-08-12T00:00:00.000Z");
  db.exec(`
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e1','Delimitation','2008-02-19');
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e2','Redrawn','2020-02-19');
    INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India');
  `);
  const source = db.prepare(
    `INSERT INTO source (id, kind, publisher, title, retrieved_at, doc_hash) VALUES (?, 'static_module', ?, ?, '2026-08-12', 'sha256:0')`,
  );
  for (const s of ["s1", "s2", "s3", "s4", "s5", "s6"]) source.run(s, `Publisher ${s}`, `Source ${s}`);
  const place = db.prepare(`INSERT INTO place (id, kind, canonical_name, parent_id) VALUES (?, ?, ?, ?)`);
  for (const [id, name] of [["ka", "Karnataka"], ["kl", "Kerala"], ["wb", "West Bengal"], ["tn", "Tamil Nadu"]] as const) {
    place.run(id, "state", name, "in");
  }
  place.run("ka.d1", "district", "North", "ka");
  place.run("ka.d2", "district", "South", "ka");
  place.run("wb.d1", "district", "Cooch Behar", "wb");
  const version = db.prepare(
    `INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation, district_place_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  /** A seat: its place, and one version per epoch it exists under. */
  const seat = (id: string, kind: "ac" | "pc", parent: string, j: string, district: string | null, number: number, versions: [number, string, string][]): void => {
    place.run(id, kind, versions[0]?.[2] ?? id, parent);
    for (const [vid, epoch, name] of versions) version.run(vid, id, j, kind, epoch, number, name, "general", district);
  };
  seat("ka.ac.001", "ac", "ka.d1", "ka", "ka.d1", 1, [[1, "e1", "Seat A"]]);
  seat("ka.ac.002", "ac", "ka.d1", "ka", "ka.d1", 2, [[2, "e1", "Seat B"]]);
  seat("ka.ac.003", "ac", "ka.d2", "ka", "ka.d2", 3, [[3, "e1", "Seat C"], [13, "e2", "Seat C"]]);
  seat("ka.ac.004", "ac", "ka", "ka", null, 4, [[4, "e1", "Seat D"]]);
  seat("kl.ac.001", "ac", "kl", "kl", null, 1, [[5, "e1", "Seat K"]]);
  seat("wb.ac.001", "ac", "wb.d1", "wb", "wb.d1", 1, [[6, "e1", "Seat W1"]]);
  seat("wb.ac.002", "ac", "wb.d1", "wb", "wb.d1", 2, [[7, "e1", "Seat W2"]]);
  seat("wb.ac.003", "ac", "wb.d1", "wb", "wb.d1", 3, [[8, "e1", "Seat W3"]]);
  seat("tn.ac.001", "ac", "tn", "tn", null, 1, [[9, "e1", "Seat T"]]);
  seat("ka.pc.001", "pc", "ka", "ka", null, 101, [[10, "e1", "Seat KP"]]);
  seat("kl.pc.001", "pc", "kl", "kl", null, 101, [[11, "e1", "Seat LP"]]);

  // Outlines: Seat A in the shared frame, Seat B in another projection, Seat C (new boundaries) in the shared frame.
  const outline = db.prepare(
    `INSERT INTO place_geometry (place_version_id, path, centroid_x, centroid_y, view_box, source_id) VALUES (?, ?, 1, 1, ?, 's3')`,
  );
  outline.run(1, "M10 10L40 10L40 40L10 40Z", SHARED_FRAME);
  outline.run(2, "M50 10L80 10L80 40L50 40Z", "0 0 400 580");
  outline.run(13, "M10 50L40 50L40 80L10 80Z", SHARED_FRAME);

  db.exec(`
    INSERT INTO party (id, name, short_name) VALUES ('AAA','A Party','AAA');
    INSERT INTO party (id, name, short_name) VALUES ('BBB','B Party','');
    INSERT INTO party (id, name, short_name) VALUES ('CCC','C Party','CCC');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (1,'AAA','1990-01-01','A Party');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (2,'BBB','1990-01-01','B Party');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (3,'CCC','1990-01-01','C Party');
  `);
  const election = db.prepare(
    `INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
     VALUES (?, ?, ?, ?, 'e1', ?, 'declared', ?, ?, 1)`,
  );
  election.run("ka-assembly-2018", "assembly", "state", "ka", "KA 2018", "ac", 2018);
  election.run("ka-assembly-2023", "assembly", "state", "ka", "KA 2023", "ac", 2023);
  election.run("kl-assembly-2021", "assembly", "state", "kl", "KL 2021", "ac", 2021);
  election.run("wb-assembly-2026", "assembly", "state", "wb", "WB 2026", "ac", 2026);
  election.run("tn-assembly-2020", "assembly", "state", "tn", "TN 2020", "ac", 2020);
  election.run("ls-2024", "general", "union", "in", "LS 2024", "pc", 2024);

  const person = db.prepare(`INSERT INTO person (id, canonical_name, created_at) VALUES (?, ?, '2026-08-12')`);
  const contestRow = db.prepare(`INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES (?, ?, ?, 'declared')`);
  const candidacy = db.prepare(
    `INSERT INTO candidacy (id, contest_id, person_id, party_version_id, status, party_raw) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const result = db.prepare(
    `INSERT INTO result (contest_id, candidacy_id, revision, votes, "rank", is_winner, margin, source_id, ingested_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '2026-08-12')`,
  );
  const turnout = db.prepare(
    `INSERT INTO turnout (contest_id, scope, voters, electors, source_id) VALUES (?, 'contest', ?, ?, ?)`,
  );
  const contest = (id: string, election: string, versionId: number, rows: Standing[], t?: [number, number, string?]): void => {
    contestRow.run(id, election, versionId);
    for (const r of rows) {
      const cid = `${id}-${r.who}`;
      person.run(`p-${cid}`, `Person ${r.who}`);
      candidacy.run(cid, id, `p-${cid}`, r.pv, r.win === true ? "elected" : "defeated", r.raw ?? null);
      result.run(id, cid, r.revision ?? 0, r.votes, r.rank, r.win === true ? 1 : 0, r.margin ?? null, r.src ?? "s1");
    }
    if (t !== undefined) turnout.run(id, t[0], t[1], t[2] ?? "s2");
  };
  const w = (who: string, pv: number | null, votes: number | null, margin: number | null, over: Partial<Standing> = {}): Standing => ({
    who, pv, votes, rank: 1, win: true, margin, ...over,
  });
  const r2 = (who: string, pv: number | null, votes: number | null, over: Partial<Standing> = {}): Standing => ({
    who, pv, votes, rank: 2, ...over,
  });

  contest("c1", "ka-assembly-2018", 1, [w("a1", 1, 600, 200), r2("b1", 2, 400), w("late", 3, 999, 1, { revision: 1, src: "s4" })], [1000, 2000]);
  contest("c2", "ka-assembly-2018", 2, [w("c2", 3, 520, 40), r2("a2", 1, 480)], [1000, 2000]);
  contest("c3", "ka-assembly-2018", 3, [w("a3", 1, 505, 10, { src: "s5" }), r2("c3", 3, 495, { src: "s5" })], [1000, 1600, "s6"]);
  contest("c4", "ka-assembly-2018", 4, [r2("b4", 2, 300)]);

  contest("c5", "ka-assembly-2023", 1, [w("a5", 1, 640, 280), r2("b5", 2, 360)], [1000, 2000]);
  contest("c6", "ka-assembly-2023", 2, [w("b6", 2, 550, 100), r2("c6", 3, 450)], [1000, 2000]);
  contest("c7", "ka-assembly-2023", 13, [w("a7", 1, 502, 4, { src: "s5" }), r2("c7", 3, 498, { src: "s5" })], [1000, 2000, "s6"]);
  contest("c8", "ka-assembly-2023", 4, [w("ind8", null, 700, 400, { raw: "IND" }), r2("a8", 1, 300)], [1000, 2000]);

  contest("c9", "kl-assembly-2021", 5, [w("c9", 3, 700, null), r2("a9", 1, 600)], [1300, 2000]);

  contest("c10", "wb-assembly-2026", 6, [w("a10", 1, null, 321)], [900, 2000]);
  contest("c11", "wb-assembly-2026", 7, [w("b11", 2, null, 12)], [1800, 2000]);
  contest("c12", "wb-assembly-2026", 8, [], [1500, 2000]);

  contest("c13", "tn-assembly-2020", 9, [w("a13", 1, 90000, 44751)], [140000, 300000]);

  contest("c14", "ls-2024", 10, [w("a14", 1, 51000, 11000), r2("c14", 3, 40000)], [95000, 150000]);
  contest("c15", "ls-2024", 11, [w("c15", 3, 30000, 1000), r2("a15", 1, 29000)], [62000, 100000]);
  return db;
}

const memory = (): DatabaseSync => fixture(open(":memory:"));
const tmp = (): string => join(mkdtempSync(join(tmpdir(), "mandate-seatreaders-")), "registry.db");
const onFile = (): string => {
  const path = tmp();
  fixture(open(path)).close();
  return path;
};

/* ────────────────────────────── party tallies ────────────────────────────── */

test("seatsWonBy: seats won by party inside each jurisdiction, in election, jurisdiction, party order", () => {
  const d = memory();
  try {
    assert.deepEqual(plain(seatsWonBy(d, ["ls-2024", "ka-assembly-2023", "wb-assembly-2026", "ka-assembly-2018"])), [
      { electionId: "ka-assembly-2018", jurisdictionId: "ka", key: "AAA", label: "AAA", seats: 2 },
      { electionId: "ka-assembly-2018", jurisdictionId: "ka", key: "CCC", label: "CCC", seats: 1 },
      { electionId: "ka-assembly-2023", jurisdictionId: "ka", key: "AAA", label: "AAA", seats: 2 },
      // BBB's short name is blank, so its label is its full name; the IND is a party of the source's own string.
      { electionId: "ka-assembly-2023", jurisdictionId: "ka", key: "BBB", label: "B Party", seats: 1 },
      { electionId: "ka-assembly-2023", jurisdictionId: "ka", key: "IND", label: "IND", seats: 1 },
      // A general election is read as one slice of itself per state.
      { electionId: "ls-2024", jurisdictionId: "ka", key: "AAA", label: "AAA", seats: 1 },
      { electionId: "ls-2024", jurisdictionId: "kl", key: "CCC", label: "CCC", seats: 1 },
      { electionId: "wb-assembly-2026", jurisdictionId: "wb", key: "AAA", label: "AAA", seats: 1 },
      { electionId: "wb-assembly-2026", jurisdictionId: "wb", key: "BBB", label: "B Party", seats: 1 },
    ]);
    assert.deepEqual(seatsWonBy(d, []), []);
  } finally {
    d.close();
  }
});

test("seatsByParty: seats from the declared winners, votes over every candidate, and a party with votes and no seat", () => {
  const d = memory();
  try {
    assert.deepEqual(plain(seatsByParty(d, ["ka-assembly-2023"])), [
      { electionId: "ka-assembly-2023", jurisdictionId: "ka", key: "AAA", label: "AAA", seats: 2, votes: 640 + 502 + 300 },
      { electionId: "ka-assembly-2023", jurisdictionId: "ka", key: "BBB", label: "B Party", seats: 1, votes: 360 + 550 },
      { electionId: "ka-assembly-2023", jurisdictionId: "ka", key: "CCC", label: "CCC", seats: 0, votes: 450 + 498 },
      { electionId: "ka-assembly-2023", jurisdictionId: "ka", key: "IND", label: "IND", seats: 1, votes: 700 },
    ]);
    // 2018: ka.ac.004 has only a runner-up, whose votes are counted and whose seat is nobody's.
    const y18 = seatsByParty(d, ["ka-assembly-2018"]);
    assert.equal(y18.reduce((n, r) => n + r.seats, 0), 3, "four contests, three declared winners");
    assert.equal(y18.find((r) => r.key === "BBB")?.votes, 400 + 300);
    assert.equal(y18.find((r) => r.key === "BBB")?.seats, 0);
    // An election with no counts at all: seats, and no votes — not a vote of zero.
    const wb = seatsByParty(d, ["wb-assembly-2026"]);
    assert.deepEqual(wb.map((r) => [r.key, r.seats, r.votes]), [["AAA", 1, null], ["BBB", 1, null]]);
    const folded = foldStandings(wb);
    assert.equal(folded.votesCounted, false);
    assert.deepEqual(folded.parties.map((p) => p.votePct), [null, null]);
  } finally {
    d.close();
  }
});

test("partyVotes: a party's votes over every candidate it ran, under the same scope as the seats", () => {
  const d = memory();
  try {
    const votes = (scope: Parameters<typeof partyVotes>[1]) =>
      partyVotes(d, scope).map((v) => [v.electionId, v.jurisdictionId, v.party.key, v.votes]);
    assert.deepEqual(votes({ elections: ["ls-2024"] }), [
      ["ls-2024", "ka", "AAA", 51000],
      ["ls-2024", "ka", "CCC", 40000],
      ["ls-2024", "kl", "AAA", 29000],
      ["ls-2024", "kl", "CCC", 30000],
    ]);
    assert.deepEqual(votes({ elections: ["ls-2024"], within: "kl" }), [
      ["ls-2024", "kl", "AAA", 29000],
      ["ls-2024", "kl", "CCC", 30000],
    ]);
    // One district: Seat A and Seat B only, and the revision-1 row names a third party that is not counted.
    assert.deepEqual(votes({ elections: ["ka-assembly-2018"], district: "ka.d1" }), [
      ["ka-assembly-2018", "ka", "AAA", 600 + 480],
      ["ka-assembly-2018", "ka", "BBB", 400],
      ["ka-assembly-2018", "ka", "CCC", 520],
    ]);
    assert.deepEqual(partyVotes(d, { elections: [] }), []);
  } finally {
    d.close();
  }
});

test("readSeats: `district` narrows to the seats of one district, and a parliamentary seat is in none", () => {
  const d = memory();
  try {
    assert.deepEqual(readSeats(d, { elections: ["ka-assembly-2018"], district: "ka.d2" }).map((s) => s.contestId), ["c3"]);
    assert.deepEqual(readSeats(d, { elections: ["ls-2024"], district: "ka.d1" }), []);
    assert.deepEqual(
      readSeats(d, { elections: ["ka-assembly-2018"], within: "ka", district: "ka.d1" }).map((s) => s.contestId),
      ["c1", "c2"],
    );
  } finally {
    d.close();
  }
});

/* ────────────────────────────── the closest fights ────────────────────────────── */

test("closeFights: the tightest verified seats of each jurisdiction's latest election, an unverified election never", () => {
  const d = memory();
  try {
    const fights = closeFights(d, "assembly", 12);
    // wb-assembly-2026 is the latest election of West Bengal and its seats carry margins of 321 and 12 votes: of an
    // unverified turnout, a share is unknown, and an unknown share is not a close one.
    assert.ok(!fights.some((f) => f.electionId === "wb-assembly-2026"), "ranked by a share nothing corroborates");
    assert.deepEqual(
      plain(fights.map((f) => [f.placeName, f.marginPct, f.marginVotes, f.electionId])),
      [
        ["Seat C", 0.4, 4, "ka-assembly-2023"],
        ["Seat K", 7.69, 100, "kl-assembly-2021"],
        ["Seat B", 10, 100, "ka-assembly-2023"],
        ["Seat A", 28, 280, "ka-assembly-2023"],
        // 100 * 44751 / 140000 = 31.965, which SQLite's ROUND takes to 31.96 and Math.round to 31.97.
        ["Seat T", 31.96, 44751, "tn-assembly-2020"],
        ["Seat D", 40, 400, "ka-assembly-2023"],
      ],
    );
    assert.deepEqual(closeFights(d, "assembly", 2).map((f) => f.placeName), ["Seat C", "Seat K"], "and the limit cuts the list");
  } finally {
    d.close();
  }
});

test("closeFights: each row names its runner-up, both shares, the year, and a link into the seat when it has a district", () => {
  const d = memory();
  try {
    const [c, k, , , , dd] = closeFights(d, "assembly", 12);
    assert.deepEqual(plain(c), {
      placeName: "Seat C",
      placeId: "ka.ac.003",
      jurisdictionId: "ka",
      href: "/constituency/ka/assembly/seat-c",
      winner: "AAA",
      runnerUp: "CCC",
      runnerUpPct: 49.8,
      winnerPct: 50.2,
      marginPct: 0.4,
      marginVotes: 4,
      electionId: "ka-assembly-2023",
      year: 2023,
    });
    // Seat K's winner holds both counts and no declared margin: the margin is counted from them, and the seat is ranked.
    assert.equal(k?.winnerPct, 53.8);
    assert.equal(k?.runnerUpPct, 46.2);
    assert.equal(k?.winner, "CCC");
    // No district, so the link falls back up the tree to the state rather than to a seat page that is not there.
    assert.equal(k?.href, "/state/kl");
    assert.equal(dd?.href, "/state/ka");
    // The independent is a party of its own string.
    assert.equal(dd?.winner, "IND");
  } finally {
    d.close();
  }
});

test("a seat whose name another seat of its state and body shares is linked by its registry id, wherever seats are linked", () => {
  const d = memory();
  try {
    // Seat B takes Seat A's name: ka.ac.001 and ka.ac.002 are now two assembly seats of Karnataka, in one epoch, called the
    // same, which no name can tell apart. The 2023 election is made to vote wholly under e1, so the epoch the seats sit in is
    // the one Karnataka's assembly votes under: the fixture's Seat C contest sits in e2, and a house is current in the newer
    // epoch of an election that straddles two, which would retire both.
    d.exec(`UPDATE place_version SET canonical_name = 'Seat A' WHERE id = 2`);
    d.exec(`UPDATE contest SET place_version_id = 3 WHERE id = 'c7'`);
    const own = (id: string): string => `/constituency/ka/assembly/${id}`;

    const fights = closeFights(d, "assembly", 12).filter((f) => f.electionId === "ka-assembly-2023");
    assert.deepEqual(
      plain(fights.map((f) => [f.placeId, f.href])),
      [
        ["ka.ac.003", "/constituency/ka/assembly/seat-c"],
        ["ka.ac.002", own("ka.ac.002")],
        ["ka.ac.001", own("ka.ac.001")],
        // no district, so it is the state's link as it always was
        ["ka.ac.004", "/state/ka"],
      ],
    );

    const map = electionMapView(d, "ka-assembly-2023");
    const hrefs = new Map(map.seats.map((x) => [x.placeId, x.href]));
    assert.equal(hrefs.get("ka.ac.001"), own("ka.ac.001"));
    assert.equal(hrefs.get("ka.ac.002"), own("ka.ac.002"));
    assert.equal(hrefs.get("ka.ac.003"), "/constituency/ka/assembly/seat-c", "a seat nobody shares a name with keeps its name");

    const found = searchAll(d, "Seat A").constituencies.filter((h) => h.label === "Seat A");
    assert.deepEqual(found.map((h) => h.href).sort(), [own("ka.ac.001"), own("ka.ac.002")]);
  } finally {
    d.close();
  }
});

test("two retired seats that share a name are linked by that name wherever seats are linked, never by an id that opens another seat", () => {
  const d = memory();
  try {
    // The same pair, but now Karnataka's assembly votes under e2 (the fixture's 2023 election straddles e1 and e2, and the newer
    // epoch is the answer), so Seat A and Seat B are versions of a delimitation that no longer answers. A registry id answers
    // with the CURRENT seat of its number, so a link by id would open whatever e2 holds at ka.ac.001; their name is theirs.
    d.exec(`UPDATE place_version SET canonical_name = 'Seat A' WHERE id = 2`);
    const named = "/constituency/ka/assembly/seat-a";

    const fights = closeFights(d, "assembly", 12).filter((f) => f.electionId === "ka-assembly-2023");
    assert.deepEqual(
      plain(fights.map((f) => [f.placeId, f.href])),
      [
        ["ka.ac.003", "/constituency/ka/assembly/seat-c"],
        ["ka.ac.002", named],
        ["ka.ac.001", named],
        ["ka.ac.004", "/state/ka"],
      ],
    );

    const map = electionMapView(d, "ka-assembly-2023");
    const hrefs = new Map(map.seats.map((x) => [x.placeId, x.href]));
    assert.equal(hrefs.get("ka.ac.001"), named);
    assert.equal(hrefs.get("ka.ac.002"), named);

    const found = searchAll(d, "Seat A").constituencies.filter((h) => h.label === "Seat A");
    assert.deepEqual(found.map((h) => h.href), [named, named]);
  } finally {
    d.close();
  }
});

test("closeFights: a general election's fights are its seats, and a kind with no election has none", () => {
  const d = memory();
  try {
    assert.deepEqual(
      closeFights(d, "general", 5).map((f) => [f.placeName, f.marginPct, f.winner, f.href]),
      [
        ["Seat LP", 1.61, "CCC", "/state/kl"],
        ["Seat KP", 11.58, "AAA", "/state/ka"],
      ],
    );
    assert.deepEqual(closeFights(d, "bypoll", 5), []);
  } finally {
    d.close();
  }
});

/* ────────────────────────────── the state trajectory ────────────────────────────── */

test("stateTrajectory: seats and vote share per party per election, from the same winners and votes", () => {
  const d = memory();
  try {
    const t = stateTrajectory(d, "ka", "ac");
    assert.deepEqual(t.elections.map((e) => [e.id, e.seats]), [["ka-assembly-2018", 4], ["ka-assembly-2023", 4]]);
    // Only a party that won a seat at two elections has a trajectory: AAA does; CCC, BBB and the IND won at one.
    assert.deepEqual(t.parties.map((p) => p.key), ["AAA"]);
    const aaa = t.parties[0];
    assert.equal(aaa?.label, "AAA");
    assert.deepEqual(aaa?.points.map((p) => p.seats), [2, 2]);
    assert.deepEqual(aaa?.points.map((p) => p.seatPct), [50, 50]);
    // 2018: AAA polled 600 + 480 + 505 of the 1,000 + 1,000 + 1,000 + 300 candidate votes read, the runner-up of the
    // seat with no declared winner among them.
    assert.equal(aaa?.points[0]?.votePct, (100 * 1585) / 3300);
    assert.equal(aaa?.points[1]?.votePct, (100 * (640 + 502 + 300)) / (1000 + 1000 + 1000 + 1000));
    assert.equal(aaa?.latestSeats, 2);
    assert.deepEqual(stateTrajectory(d, "ka", "pc").parties, [], "no Lok Sabha election belongs to Karnataka itself");
  } finally {
    d.close();
  }
});

/* ────────────────────────────── the election map ────────────────────────────── */

test("electionMapView: a seat with no declared winner belongs to no party, and no flip is claimed for it", () => {
  const d = memory();
  try {
    const v = electionMapView(d, "ka-assembly-2018");
    const d4 = v.seats.find((s) => s.contestId === "c4");
    assert.equal(d4?.partyKey, null);
    assert.equal(d4?.partyLabel, null);
    assert.equal(d4?.winnerName, null);
    assert.equal(d4?.marginVotes, null);
    assert.equal(d4?.marginBasis, null);
    assert.equal(d4?.flip, null);
    // Its rank 2 row is still read, and it still has a seat.
    assert.equal(d4?.runnerUpLabel, "B Party");
    assert.deepEqual(v.legend, [{ key: "AAA", label: "AAA", n: 2 }, { key: "CCC", label: "CCC", n: 1 }]);
    assert.ok(!v.legend.some((l) => l.key === "unattached"), "an undeclared seat is not a party called Unattached");
    assert.equal(v.seats.length, 4);
    assert.ok(v.voteSeat.every((r) => r.party.key !== "unattached"));
  } finally {
    d.close();
  }
});

test("electionMapView: seats come in jurisdiction then number order with winner, runner-up, margin and turnout", () => {
  const d = memory();
  try {
    const v = electionMapView(d, "ka-assembly-2023");
    assert.deepEqual(v.seats.map((s) => [s.contestId, s.name]), [["c5", "Seat A"], ["c6", "Seat B"], ["c7", "Seat C"], ["c8", "Seat D"]]);
    const [a, , c, ind] = v.seats;
    assert.deepEqual(
      plain({ ...a, path: undefined, flip: undefined, turnout: undefined }),
      plain({
        placeId: "ka.ac.001",
        versionId: 1,
        epochId: "e1",
        contestId: "c5",
        name: "Seat A",
        number: 1,
        reservation: "general",
        jurisdictionId: "ka",
        jurisdictionName: "Karnataka",
        districtId: "ka.d1",
        districtName: "North",
        partyKey: "AAA",
        partyLabel: "AAA",
        winnerName: "Person a5",
        votes: 640,
        runnerUpKey: "BBB",
        runnerUpLabel: "B Party",
        runnerUpName: "Person b5",
        runnerUpVotes: 360,
        marginVotes: 280,
        marginBasis: "counted",
        marginPct: 28,
        marginBin: 28,
        standing: "held",
        comparable: true,
        href: "/constituency/ka/assembly/seat-a",
      }),
    );
    assert.deepEqual(plain(a?.turnout), { state: "reported", pct: 50 });
    // A winner the registry can only name by the source's string is a party of that string.
    assert.deepEqual([ind?.partyKey, ind?.partyLabel, ind?.runnerUpKey], ["IND", "IND", "AAA"]);
    assert.equal(c?.epochId, "e2");
    assert.deepEqual(v.legend, [
      { key: "AAA", label: "AAA", n: 2 },
      { key: "BBB", label: "B Party", n: 1 },
      { key: "IND", label: "IND", n: 1 },
    ]);
    assert.deepEqual(plain(v.turnout), { state: "reported", pct: 50 });
    // Votes over every candidate: CCC won nothing here and polled 948 of 4,000.
    const ccc = v.voteSeat.find((r) => r.party.key === "CCC");
    assert.equal(ccc?.seats, 0);
    assert.equal(ccc?.votePct, (100 * 948) / 4000);
  } finally {
    d.close();
  }
});

test("electionMapView: flips are counted through the epoch gate, and only a redrawn seat is counted as redrawn", () => {
  const d = memory();
  try {
    const v = electionMapView(d, "ka-assembly-2023");
    // ka.ac.003 is fought under new boundaries, so it cannot be compared. ka.ac.004 had no declared winner in 2018: it
    // is the same seat under the same boundary, so it is comparable and has no flip, and nothing was redrawn.
    // Seat B changed hands, but its outline is in another projection and is withheld: a seat that cannot be drawn is
    // undrawable whatever else is true of it. Its flip is still counted below.
    assert.deepEqual(v.seats.map((s) => [s.contestId, s.comparable, s.standing]), [
      ["c5", true, "held"],
      ["c6", true, "no-geometry"],
      ["c7", false, "not-comparable"],
      ["c8", true, "no-geometry"],
    ]);
    assert.equal(v.seats[3]?.flip, null);
    assert.deepEqual(v.seats[1]?.flip && plain(v.seats[1].flip), {
      from: { key: "CCC", label: "CCC" },
      changed: true,
    });
    assert.equal(v.incomparableSeats, 1, "only the redrawn seat is counted as redrawn");
    assert.deepEqual(plain(v.flips), {
      type: "seat_flips",
      flipped: 1,
      held: 1,
      comparable: 2,
      pairs: [{ from: { key: "CCC", label: "CCC" }, to: { key: "BBB", label: "B Party" }, count: 1 }],
      previousYear: 2018,
      year: 2023,
    });
    assert.deepEqual(v.previous, { id: "ka-assembly-2018", year: 2018 });
  } finally {
    d.close();
  }
});

test("electionMapView: an unverified election keeps each seat's declared margin, labelled, and no share of votes polled", () => {
  const d = memory();
  try {
    const v = electionMapView(d, "wb-assembly-2026");
    const [a, b, none] = v.seats;
    assert.deepEqual([a?.marginVotes, a?.marginBasis, a?.marginPct, a?.marginBin], [321, "declared", null, null]);
    assert.deepEqual([b?.marginVotes, b?.marginBasis, b?.marginPct, b?.marginBin], [12, "declared", null, null]);
    assert.equal(a?.runnerUpLabel, null, "the source named no runner-up, and none is invented");
    // The seat with no declared winner has no margin to declare, and is nobody's.
    assert.deepEqual([none?.partyKey, none?.marginVotes, none?.marginBasis], [null, null, null]);
    assert.equal(v.turnout.state, "unverified");
    assert.equal(a?.turnout.state, "unverified");
    assert.ok(v.marginBins.every((bin) => bin.n === 0), "no seat is placed in a bin by a share nothing corroborates");
    assert.deepEqual(v.legend.map((l) => [l.key, l.n]), [["AAA", 1], ["BBB", 1]]);
    // ...and the figure is still held, where a drawer can show it: 4,200 voters of 6,000 electors.
    if (v.turnout.state === "unverified") assert.equal(v.turnout.evidence.pct, 70);
  } finally {
    d.close();
  }
});

test("electionMapView: a margin the source declared and the votes can be checked against are told apart", () => {
  const d = memory();
  try {
    // c13 holds the winner's count and no runner-up: there is nothing to subtract, so the declared margin stands.
    const tn = electionMapView(d, "tn-assembly-2020").seats[0];
    assert.deepEqual([tn?.marginVotes, tn?.marginBasis], [44751, "declared"]);
    assert.equal(tn?.marginPct, (100 * 44751) / 140000);
    // Where both counts exist the margin is theirs, even though the source declared one as well.
    const kl = electionMapView(d, "kl-assembly-2021").seats[0];
    assert.deepEqual([kl?.marginVotes, kl?.marginBasis], [100, "counted"]);
  } finally {
    d.close();
  }
});

test("electionMapView: outlines are a separate join, and one in another projection is withheld and counted", () => {
  const d = memory();
  try {
    const v = electionMapView(d, "ka-assembly-2018");
    assert.deepEqual(v.seats.map((s) => [s.name, s.path !== null]), [["Seat A", true], ["Seat B", false], ["Seat C", false], ["Seat D", false]]);
    assert.deepEqual(
      { drawable: v.geometry.drawable, total: v.geometry.total, otherFrames: v.geometry.otherFrames, epochs: v.geometry.undrawableEpochs },
      { drawable: 1, total: 4, otherFrames: 1, epochs: ["e1"] },
    );
    // The same Seat C under the new boundaries has its own outline, found through its own version.
    const y23 = electionMapView(d, "ka-assembly-2023");
    assert.deepEqual(y23.seats.map((s) => s.path !== null), [true, false, true, false]);
  } finally {
    d.close();
  }
});

test("electionMapView: scoped to a jurisdiction, every aggregate is over its seats alone", () => {
  const d = memory();
  try {
    const v = electionMapView(d, "ls-2024", "kl");
    assert.deepEqual(v.seats.map((s) => s.name), ["Seat LP"]);
    assert.equal(v.scope, "kl");
    assert.deepEqual(v.legend, [{ key: "CCC", label: "CCC", n: 1 }]);
    assert.deepEqual(plain(v.turnout), { state: "reported", pct: 62 });
    assert.equal(v.seats[0]?.href, "/constituency/kl/lok-sabha/seat-lp", "the body of the election decides the link");
    assert.equal(v.voteSeat.find((r) => r.party.key === "AAA")?.votePct, (100 * 29000) / 59000);
  } finally {
    d.close();
  }
});

/* ────────────────────────────── provenance ────────────────────────────── */

test("sourcesFor: the sources of the results read, plus the turnout and outlines a page says it draws on", () => {
  const d = memory();
  try {
    const ids = (scope: Parameters<typeof sourcesFor>[1], cited?: Parameters<typeof sourcesFor>[2], limit?: number) =>
      sourcesFor(d, scope, cited, limit).map((s) => s.id);
    // s4 cites a result of revision 1, which nothing reads, so it is cited by nothing.
    assert.deepEqual(ids({ elections: ["ka-assembly-2018"] }), ["s1", "s5"]);
    assert.deepEqual(ids({ elections: ["ka-assembly-2018"] }, { turnout: true }), ["s1", "s2", "s5", "s6"]);
    assert.deepEqual(ids({ elections: ["ka-assembly-2018"] }, { geometry: true }), ["s1", "s3", "s5"]);
    assert.deepEqual(ids({ elections: ["ka-assembly-2018"] }, { turnout: true, geometry: true }), ["s1", "s2", "s3", "s5", "s6"]);
    // A narrower scope cites fewer: one district, and one jurisdiction of a general election.
    assert.deepEqual(ids({ elections: ["ka-assembly-2018"], district: "ka.d2" }, { turnout: true }), ["s5", "s6"]);
    assert.deepEqual(ids({ elections: ["ka-assembly-2018"], district: "ka.d1" }, { turnout: true }), ["s1", "s2"]);
    assert.deepEqual(ids({ elections: ["ls-2024"], within: "kl" }), ["s1"]);
    // Nothing asked, nothing cited; a cap keeps the smallest ids.
    assert.deepEqual(sourcesFor(d, { elections: [] }, { turnout: true }), []);
    assert.deepEqual(ids({ elections: ["ka-assembly-2018"] }, { turnout: true, geometry: true }, 2), ["s1", "s2"]);
    // A source is the whole record, not an id.
    assert.deepEqual(sourcesFor(d, { elections: ["ls-2024"] })[0]?.publisher, "Publisher s1");
  } finally {
    d.close();
  }
});

test("electionCoverage cites an election's results and turnout, and no more than twelve of them", () => {
  const d = open(":memory:");
  try {
    migrate(d, "2026-08-12T00:00:00.000Z");
    d.exec(`
      INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e1','Delimitation','2008-02-19');
      INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India');
      INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('ka','state','Karnataka','in');
      INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
        VALUES ('ka-assembly-2018','assembly','state','ka','e1','KA 2018','declared','ac',2018,1);
      INSERT INTO party (id, name, short_name) VALUES ('AAA','A Party','AAA');
      INSERT INTO party_version (id, party_id, valid_from, name) VALUES (1,'AAA','1990-01-01','A Party');
    `);
    // Fourteen contests, each citing a source of its own for its result, and a fifteenth source for every turnout.
    for (let i = 1; i <= 15; i++) {
      d.prepare(`INSERT INTO source (id, kind, retrieved_at, doc_hash) VALUES (?, 'static_module', '2026-08-12', 'sha256:0')`).run(
        `src${String(i).padStart(2, "0")}`,
      );
    }
    for (let i = 1; i <= 14; i++) {
      const id = `ka.ac.${String(i).padStart(3, "0")}`;
      d.prepare(`INSERT INTO place (id, kind, canonical_name, parent_id) VALUES (?, 'ac', ?, 'ka')`).run(id, `Seat ${i}`);
      d.prepare(
        `INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation) VALUES (?, ?, 'ka', 'ac', 'e1', ?, ?, 'general')`,
      ).run(i, id, i, `Seat ${i}`);
      d.prepare(`INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES (?, 'ka-assembly-2018', ?, 'declared')`).run(`c${i}`, i);
      d.prepare(`INSERT INTO person (id, canonical_name, created_at) VALUES (?, ?, '2026-08-12')`).run(`p${i}`, `Person ${i}`);
      d.prepare(`INSERT INTO candidacy (id, contest_id, person_id, party_version_id, status) VALUES (?, ?, ?, 1, 'elected')`).run(`d${i}`, `c${i}`, `p${i}`);
      d.prepare(
        `INSERT INTO result (contest_id, candidacy_id, revision, votes, "rank", is_winner, margin, source_id, ingested_at) VALUES (?, ?, 0, 100, 1, 1, 10, ?, '2026-08-12')`,
      ).run(`c${i}`, `d${i}`, `src${String(i).padStart(2, "0")}`);
      d.prepare(`INSERT INTO turnout (contest_id, scope, voters, electors, source_id) VALUES (?, 'contest', 100, 200, 'src15')`).run(`c${i}`);
    }
    const cited = electionCoverage(d, "ka-assembly-2018")?.sources.map((s) => s.id);
    assert.equal(cited?.length, 12, "capped, because a panel names publishers and is not a bibliography");
    // The twelve smallest ids: src13 and src14 are results, src15 the turnout, and none of the three made the cut.
    assert.deepEqual(cited, Array.from({ length: 12 }, (_, i) => `src${String(i + 1).padStart(2, "0")}`));
  } finally {
    d.close();
  }
});

/* ────────────────────────────── the place page's parent levels ────────────────────────────── */

const at =
  (path: string): typeof readRegistry =>
  (fn) =>
    readRegistry(fn, { path });

test("placeView: a district lists its seats, winner, member, margin and turnout", async () => {
  const read = at(onFile());
  const d = await placeView({ level: "district", state: "ka", district: "d1" }, {}, read);
  if (d.kind !== "parent" || d.level !== "district") return assert.fail("not a district view");
  assert.match(d.headline, /North has 2 assembly seats; AAA won 1 of them in 2023\./);
  assert.deepEqual(
    d.children.rows.map((r) => r.cols),
    [
      ["1", "Seat A · General", "AAA", "Person a5", "280", "50.0%"],
      ["2", "Seat B · General", "B Party", "Person b6", "100", "50.0%"],
    ],
  );
  assert.deepEqual(d.children.rows.map((r) => r.href), ["/constituency/ka/assembly/seat-a", "/constituency/ka/assembly/seat-b"]);
  // North's two seats only: Seat C's results and turnout (s5, s6) belong to South.
  assert.deepEqual(d.sources.map((x) => x.id), ["s1", "s2"]);
});

test("placeView: an unverified election's seats are listed with the turnout the registry holds, as the Analysis floor prints it", async () => {
  const read = at(onFile());
  const d = await placeView({ level: "district", state: "wb", district: "d1" }, {}, read);
  if (d.kind !== "parent" || d.level !== "district") return assert.fail("not a district view");
  // Whether a district page should print West Bengal 2026's turnout is its own decision, not this one: the winners come
  // from the seat results, and the turnout is still the held figure. The third seat has no declared winner.
  assert.deepEqual(
    d.children.rows.map((r) => r.cols),
    [
      ["1", "Seat W1 · General", "AAA", "Person a10", "321", "45.0%"],
      ["2", "Seat W2 · General", "B Party", "Person b11", "12", "90.0%"],
      ["3", "Seat W3 · General", "no result declared", "—", "—", "75.0%"],
    ],
  );
});

test("placeView: a registry with no election lists nothing and cites nothing, rather than reading the election ''", async () => {
  const path = tmp();
  const d = open(path);
  migrate(d, "2026-08-12T00:00:00.000Z");
  d.exec(`
    INSERT INTO place (id, kind, canonical_name) VALUES ('wb', 'state', 'West Bengal');
    INSERT INTO place (id, kind, parent_id, canonical_name) VALUES ('wb.d1', 'district', 'wb', 'Cooch Behar');
  `);
  d.close();
  const dd = await placeView({ level: "district", state: "wb", district: "d1" }, {}, at(path));
  if (dd.kind !== "parent" || dd.level !== "district") return assert.fail("not a district view");
  assert.deepEqual([dd.children.rows, dd.sources, dd.electionId], [[], [], null]);
});

/* ────────────────────────────── rounding ────────────────────────────── */

test("closeFights rounds the shares exactly as SQLite's ROUND did, ties included", () => {
  const d = open(":memory:");
  try {
    migrate(d, "2026-08-12T00:00:00.000Z");
    d.exec(`
      INSERT INTO source (id, kind, retrieved_at, doc_hash) VALUES ('s1','static_module','2026-08-12','sha256:0');
      INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e1','Delimitation','2008-02-19');
      INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India');
      INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('ka','state','Karnataka','in');
      INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
        VALUES ('ka-assembly-2023','assembly','state','ka','e1','KA 2023','declared','ac',2023,1);
      INSERT INTO party (id, name, short_name) VALUES ('AAA','A Party','AAA');
      INSERT INTO party_version (id, party_id, valid_from, name) VALUES (1,'AAA','1990-01-01','A Party');
    `);
    // Round numbers of voters, so that 100 * votes / voters lands exactly on a tie at the last decimal far more often
    // than it would on real counts: 0.125, 31.965 and their kind.
    const polled = [400, 800, 1600, 2000, 2400, 3200, 4000, 8000, 140000];
    let s = 5;
    const rnd = (n: number): number => Math.floor(((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296) * n);
    for (let i = 1; i <= 600; i++) {
      const voters = polled[rnd(polled.length)] as number;
      const won = 1 + rnd(voters);
      const second = rnd(won);
      d.prepare(`INSERT INTO place (id, kind, canonical_name, parent_id) VALUES (?, 'ac', ?, 'ka')`).run(`ka.ac.${i}`, `Seat ${i}`);
      d.prepare(
        `INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
         VALUES (?, ?, 'ka', 'ac', 'e1', ?, ?, 'general')`,
      ).run(i, `ka.ac.${i}`, i, `Seat ${i}`);
      d.prepare(`INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES (?, 'ka-assembly-2023', ?, 'declared')`).run(`c${i}`, i);
      for (const [k, votes] of [[0, won], [1, second]] as const) {
        d.prepare(`INSERT INTO person (id, canonical_name, created_at) VALUES (?, ?, '2026-08-12')`).run(`p${i}-${k}`, `P${i}-${k}`);
        d.prepare(`INSERT INTO candidacy (id, contest_id, person_id, party_version_id, status) VALUES (?, ?, ?, 1, 'elected')`).run(`d${i}-${k}`, `c${i}`, `p${i}-${k}`);
        d.prepare(
          `INSERT INTO result (contest_id, candidacy_id, revision, votes, "rank", is_winner, margin, source_id, ingested_at)
           VALUES (?, ?, 0, ?, ?, ?, ?, 's1', '2026-08-12')`,
        ).run(`c${i}`, `d${i}-${k}`, votes, k + 1, k === 0 ? 1 : 0, k === 0 ? won - second : null);
      }
      d.prepare(`INSERT INTO turnout (contest_id, scope, voters, electors, source_id) VALUES (?, 'contest', ?, ?, 's1')`).run(`c${i}`, voters, voters * 2);
    }
    const fights = closeFights(d, "assembly", 1_000_000);
    assert.equal(fights.length, 600);
    // The SQL the front page ran before: the figures rounded by the database itself.
    const sql = new Map(
      (
        d
          .prepare(
            `SELECT pv.place_id AS placeId, ROUND(100.0 * r.votes / t.voters, 1) AS winnerPct,
                    ROUND(100.0 * r2.votes / t.voters, 1) AS runnerUpPct, ROUND(100.0 * r.margin / t.voters, 2) AS marginPct
               FROM contest c JOIN place_version pv ON pv.id = c.place_version_id JOIN turnout t ON t.contest_id = c.id
               JOIN result r ON r.contest_id = c.id AND r.is_winner = 1 JOIN result r2 ON r2.contest_id = c.id AND r2."rank" = 2`,
          )
          .all() as { placeId: string; winnerPct: number; runnerUpPct: number; marginPct: number }[]
      ).map((r) => [r.placeId, { ...r }]),
    );
    for (const f of fights) {
      const want = sql.get(f.placeId);
      assert.deepEqual(
        { winnerPct: f.winnerPct, runnerUpPct: f.runnerUpPct, marginPct: f.marginPct },
        { winnerPct: want?.winnerPct, runnerUpPct: want?.runnerUpPct, marginPct: want?.marginPct },
        `${f.placeName}: rounded differently from the database`,
      );
    }
  } finally {
    d.close();
  }
});

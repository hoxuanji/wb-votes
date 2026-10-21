// The seat-results SQL adapter: `readSeats`, on a hand-built registry, and held to the readers it replaces.
//
// The fixture is built in memory because the live registry cannot show the cases that matter: it has no winner
// the registry cannot name, no contest with a revision above 0, and no seat a source declared nothing for.
// The parity test runs on that fixture AND, when a registry is present, on every election in it: the old SQL of
// the front page's seatFacts and the election map's winner and runner-up columns is reproduced below and the
// module is compared against it, so the day a registry disagrees the failure names the seat.

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { DEV_DB_PATH, all, open, openRead } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { readSeats, type SeatResult } from "./seat-results.ts";

const HAVE_DB = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const live = { skip: HAVE_DB ? false : "no .data/registry.db — run npm run registry:ingest" };

/**
 * Karnataka and Kerala, three elections.
 *
 *   ka-assembly-2018  verified (it published vote counts)
 *     ka.ac.001  AAA beat BBB 600-400, margin 200, in district ka.d1, turnout 1000 of 2000
 *     ka.ac.002  an independent the registry cannot name past 'IND' beat BBB 500-450
 *     ka.ac.003  NO DECLARED WINNER: a rank 2 row and nothing else, and no turnout row
 *   ka-assembly-2023  UNVERIFIED (turnout, no vote counts at all): winners and declared margins only
 *   kl-assembly-2021  verified, one seat, to scope `within` against
 *
 * and, in ka.ac.001 of 2018, a revision-1 row that names another winner, which nothing reads.
 */
function fixture(): DatabaseSync {
  const d = open(":memory:");
  migrate(d, "2026-08-12T00:00:00.000Z");
  d.exec(`
    INSERT INTO source (id, kind, retrieved_at, doc_hash) VALUES ('s1','static_module','2026-08-12','sha256:0');
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e1','Delimitation','2008-02-19');
    INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('ka','state','Karnataka','in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('kl','state','Kerala','in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('ka.d1','district','North','ka');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('ka.ac.001','ac','SEAT A','ka.d1');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('ka.ac.002','ac','SEAT B','ka');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('ka.ac.003','ac','SEAT C','ka');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('kl.ac.001','ac','SEAT K','kl');
    INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation, district_place_id)
      VALUES (1,'ka.ac.001','ka','ac','e1',1,'SEAT A','general','ka.d1');
    INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
      VALUES (2,'ka.ac.002','ka','ac','e1',2,'SEAT B','sc');
    INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
      VALUES (3,'ka.ac.003','ka','ac','e1',3,'SEAT C','general');
    INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
      VALUES (4,'kl.ac.001','kl','ac','e1',1,'SEAT K','general');
    INSERT INTO party (id, name, short_name) VALUES ('AAA','A Party','AAA');
    INSERT INTO party (id, name, short_name) VALUES ('BBB','B Party','');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (1,'AAA','1990-01-01','A Party');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (2,'BBB','1990-01-01','B Party');
  `);
  const person = d.prepare(`INSERT INTO person (id, canonical_name, created_at) VALUES (?, ?, '2026-08-12')`);
  const election = d.prepare(
    `INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
     VALUES (?, 'assembly', 'state', ?, 'e1', ?, 'declared', 'ac', ?, 1)`,
  );
  const contest = d.prepare(
    `INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES (?, ?, ?, 'declared')`,
  );
  const candidacy = d.prepare(
    `INSERT INTO candidacy (id, contest_id, person_id, party_version_id, status, party_raw) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const result = d.prepare(
    `INSERT INTO result (contest_id, candidacy_id, revision, votes, "rank", is_winner, margin, source_id, ingested_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 's1', '2026-08-12')`,
  );
  const turnout = d.prepare(
    `INSERT INTO turnout (contest_id, scope, voters, electors, source_id) VALUES (?, 'contest', ?, ?, 's1')`,
  );

  for (const [id, j, name, year] of [
    ["ka-assembly-2018", "ka", "KA 2018", 2018],
    ["ka-assembly-2023", "ka", "KA 2023", 2023],
    ["kl-assembly-2021", "kl", "KL 2021", 2021],
  ] as const) election.run(id, j, name, year);

  /** One candidate: a person, a candidacy, and (unless `row` is null) a result row. */
  const stand = (
    cid: string,
    n: string,
    pv: number | null,
    raw: string | null,
    row: { votes: number | null; rank: number; win: 0 | 1; margin: number | null; revision?: number } | null,
  ): void => {
    person.run(`p-${cid}-${n}`, `Person ${n}`);
    candidacy.run(`d-${cid}-${n}`, cid, `p-${cid}-${n}`, pv, row?.win === 1 ? "elected" : "defeated", raw);
    if (row !== null) result.run(cid, `d-${cid}-${n}`, row.revision ?? 0, row.votes, row.rank, row.win, row.margin);
  };

  contest.run("c18-1", "ka-assembly-2018", 1);
  stand("c18-1", "w", 1, null, { votes: 600, rank: 1, win: 1, margin: 200 });
  stand("c18-1", "r", 2, null, { votes: 400, rank: 2, win: 0, margin: null });
  stand("c18-1", "late", 2, null, { votes: 999, rank: 1, win: 1, margin: 1, revision: 1 });
  turnout.run("c18-1", 1000, 2000);

  contest.run("c18-2", "ka-assembly-2018", 2);
  stand("c18-2", "w", null, "IND", { votes: 500, rank: 1, win: 1, margin: 50 });
  stand("c18-2", "r", 2, null, { votes: 450, rank: 2, win: 0, margin: null });
  turnout.run("c18-2", 1000, 1500);

  contest.run("c18-3", "ka-assembly-2018", 3);
  stand("c18-3", "r", 2, null, { votes: 300, rank: 2, win: 0, margin: null });

  contest.run("c23-1", "ka-assembly-2023", 1);
  stand("c23-1", "w", 1, null, { votes: null, rank: 1, win: 1, margin: 321 });
  turnout.run("c23-1", 900, 2000);
  contest.run("c23-2", "ka-assembly-2023", 2);
  stand("c23-2", "w", 2, null, { votes: null, rank: 1, win: 1, margin: 12 });
  turnout.run("c23-2", 1800, 2000);

  contest.run("c21-1", "kl-assembly-2021", 4);
  stand("c21-1", "w", 2, null, { votes: 700, rank: 1, win: 1, margin: 100 });
  stand("c21-1", "r", 1, null, { votes: 600, rank: 2, win: 0, margin: null });
  turnout.run("c21-1", 1300, 2000);
  return d;
}

const plain = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

test("readSeats: a verified seat carries its winner, runner-up, counted margin, share and turnout", () => {
  const d = fixture();
  try {
    const seats = readSeats(d, { elections: ["ka-assembly-2018"] });
    assert.deepEqual(
      seats.map((s) => s.contestId),
      ["c18-1", "c18-2", "c18-3"],
      "in seat order",
    );
    assert.deepEqual(plain(seats[0]), {
      electionId: "ka-assembly-2018",
      contestId: "c18-1",
      placeId: "ka.ac.001",
      epochId: "e1",
      versionId: 1,
      name: "SEAT A",
      number: 1,
      reservation: "general",
      jurisdictionId: "ka",
      districtId: "ka.d1",
      districtName: "North",
      winner: { name: "Person w", personId: "p-c18-1-w", party: { key: "AAA", label: "AAA" }, votes: 600 },
      // BBB's short_name is blank, so its label is its full name.
      runnerUp: { name: "Person r", party: { key: "BBB", label: "B Party" }, votes: 400 },
      margin: { votes: 200, basis: "counted" },
      marginShare: 20,
      turnout: { state: "reported", pct: 50 },
      counts: { voters: 1000, electors: 2000 },
    });
  } finally {
    d.close();
  }
});

test("readSeats: a winner the registry can only name by the source's string is that party, not an unknown", () => {
  const d = fixture();
  try {
    const s = readSeats(d, { elections: ["ka-assembly-2018"] })[1];
    assert.deepEqual(plain(s?.winner?.party), { key: "IND", label: "IND" });
  } finally {
    d.close();
  }
});

test("readSeats: a seat with no declared winner has none, and is nobody's rather than Unattached", () => {
  const d = fixture();
  try {
    const s = readSeats(d, { elections: ["ka-assembly-2018"] })[2];
    assert.equal(s?.winner, null);
    assert.equal(s?.margin, null);
    assert.equal(s?.marginShare, null);
    assert.deepEqual(plain(s?.runnerUp?.party), { key: "BBB", label: "B Party" }, "its rank 2 row is still read");
    assert.deepEqual(plain(s?.turnout), { state: "absent" });
  } finally {
    d.close();
  }
});

test("readSeats: an unverified election keeps its declared margin and withholds everything that divides", () => {
  const d = fixture();
  try {
    const [a, b] = readSeats(d, { elections: ["ka-assembly-2023"] });
    assert.deepEqual(plain(a?.margin), { votes: 321, basis: "declared" });
    assert.equal(a?.marginShare, null);
    assert.equal(a?.turnout.state, "unverified");
    assert.equal(a?.counts, null);
    assert.deepEqual(plain(b?.margin), { votes: 12, basis: "declared" });
    assert.equal(b?.marginShare, null, "12 of 1,800 would have been a knife-edge seat");
    assert.equal(a?.runnerUp, null, "the source named no runner-up, and none is invented");
  } finally {
    d.close();
  }
});

test("readSeats: only the current revision is read", () => {
  const d = fixture();
  try {
    const s = readSeats(d, { elections: ["ka-assembly-2018"] })[0];
    assert.equal(s?.winner?.name, "Person w", "revision 1 names another winner and is not the current one");
    assert.equal(s?.margin?.votes, 200);
  } finally {
    d.close();
  }
});

test("readSeats: `within` narrows to the seats inside one jurisdiction, and the gate does not narrow with it", () => {
  const d = fixture();
  try {
    const all3 = readSeats(d, { elections: ["ka-assembly-2018", "ka-assembly-2023", "kl-assembly-2021"] });
    assert.equal(all3.length, 6);
    assert.deepEqual(
      readSeats(d, { elections: ["ka-assembly-2018", "ka-assembly-2023", "kl-assembly-2021"], within: "kl" }).map((s) => s.contestId),
      ["c21-1"],
    );
    assert.deepEqual(readSeats(d, { elections: ["ka-assembly-2023"], within: "kl" }), [], "no Kerala seat in a Karnataka election");
    // The same Karnataka election read within Karnataka is still unverified: the reason is the election's.
    assert.ok(readSeats(d, { elections: ["ka-assembly-2023"], within: "ka" }).every((s) => s.turnout.state === "unverified"));
  } finally {
    d.close();
  }
});

test("readSeats: results come back in election then seat order, whatever order the ids were asked in", () => {
  const d = fixture();
  try {
    assert.deepEqual(
      readSeats(d, { elections: ["ka-assembly-2023", "kl-assembly-2021", "ka-assembly-2018"] }).map((s) => s.contestId),
      ["c18-1", "c18-2", "c18-3", "c23-1", "c23-2", "c21-1"],
    );
  } finally {
    d.close();
  }
});

test("readSeats: nothing asked, nothing read; an unknown election is empty, not an error", () => {
  const d = fixture();
  try {
    assert.deepEqual(readSeats(d, { elections: [] }), []);
    assert.deepEqual(readSeats(d, { elections: ["no-such-election"] }), []);
  } finally {
    d.close();
  }
});

test("readSeats: the result is plain data, with no row prototype left on it", () => {
  const d = fixture();
  try {
    const seats = readSeats(d, { elections: ["ka-assembly-2018", "ka-assembly-2023"] });
    assert.deepEqual(plain(seats), seats);
  } finally {
    d.close();
  }
});

/* ────────────────────────────── held to the reads it replaces ────────────────────────────── */

/**
 * The SQL the front page's `seatFacts` ran before the module, verbatim except for the ORDER BY it never had.
 * Kept here so that a registry on which the module and the old read disagree says where.
 */
const OLD_HOME = `SELECT c.election_id AS electionId,
              CASE WHEN dis.kind = 'district' THEN dis.parent_id ELSE pl.parent_id END AS jurisdictionId,
              pl.id AS placeId, pvv.epoch_id AS epochId, pvv.canonical_name AS placeName,
              pt.id AS winnerKey,
              COALESCE(NULLIF(pt.short_name, ''), NULLIF(pt.name, ''), NULLIF(cd.party_raw, '')) AS winnerLabel,
              r.margin AS marginVotes, t.voters AS voters, t.electors AS electors
         FROM contest c
         JOIN place_version pvv ON pvv.id = c.place_version_id
         JOIN place pl          ON pl.id = pvv.place_id
         LEFT JOIN place dis    ON dis.id = COALESCE(pvv.district_place_id, pl.parent_id)
         LEFT JOIN result r     ON r.contest_id = c.id AND r.revision = 0 AND r.is_winner = 1
         LEFT JOIN candidacy cd ON cd.id = r.candidacy_id
         LEFT JOIN party_version pv ON pv.id = cd.party_version_id
         LEFT JOIN party pt         ON pt.id = pv.party_id
         LEFT JOIN turnout t    ON t.contest_id = c.id AND t.scope = 'contest'
        ORDER BY c.election_id, c.place_version_id`;

type OldHome = {
  electionId: string;
  jurisdictionId: string;
  placeId: string;
  epochId: string;
  placeName: string;
  winnerKey: string | null;
  winnerLabel: string | null;
  marginVotes: number | null;
  voters: number | null;
  electors: number | null;
};

/** The election map's winner and runner-up columns, as its `RUNNER` subqueries and its LEFT JOINs read them. */
const OLD_MAP = `SELECT c.election_id AS electionId, c.id AS contestId,
       pv.jurisdiction_id AS jurisdictionId, pv.district_place_id AS districtId, dis.canonical_name AS districtName,
       COALESCE(pt.id, NULLIF(cd.party_raw, ''), 'unattached') AS partyKey,
       COALESCE(NULLIF(pt.short_name, ''), NULLIF(pt.name, ''), NULLIF(cd.party_raw, ''), 'Unattached') AS partyLabel,
       r.candidacy_id AS wonBy, per.canonical_name AS winnerName, r.votes AS votes,
       (SELECT COALESCE(pt2.id, NULLIF(cd2.party_raw, ''), 'unattached') FROM result r2
          JOIN candidacy cd2 ON cd2.id = r2.candidacy_id
          LEFT JOIN party_version pv2 ON pv2.id = cd2.party_version_id LEFT JOIN party pt2 ON pt2.id = pv2.party_id
         WHERE r2.contest_id = c.id AND r2.revision = 0 AND r2.rank = 2) AS runnerUpKey,
       (SELECT per2.canonical_name FROM result r2
          JOIN candidacy cd2 ON cd2.id = r2.candidacy_id LEFT JOIN person per2 ON per2.id = cd2.person_id
         WHERE r2.contest_id = c.id AND r2.revision = 0 AND r2.rank = 2) AS runnerUpName,
       (SELECT r2.votes FROM result r2 WHERE r2.contest_id = c.id AND r2.revision = 0 AND r2.rank = 2) AS runnerUpVotes
  FROM contest c
  JOIN place_version pv ON pv.id = c.place_version_id
  LEFT JOIN place dis   ON dis.id = pv.district_place_id
  LEFT JOIN result r    ON r.contest_id = c.id AND r.revision = 0 AND r.is_winner = 1
  LEFT JOIN candidacy cd ON cd.id = r.candidacy_id
  LEFT JOIN person per   ON per.id = cd.person_id
  LEFT JOIN party_version pvv ON pvv.id = cd.party_version_id
  LEFT JOIN party pt          ON pt.id = pvv.party_id
 ORDER BY c.election_id, c.place_version_id`;

type OldMap = {
  electionId: string;
  contestId: string;
  jurisdictionId: string;
  districtId: string | null;
  districtName: string | null;
  partyKey: string;
  partyLabel: string;
  wonBy: string | null;
  winnerName: string | null;
  votes: number | null;
  runnerUpKey: string | null;
  runnerUpName: string | null;
  runnerUpVotes: number | null;
};

/** Every election in `db` read by the module and by both old reads, seat by seat. Returns what it compared. */
function parity(d: DatabaseSync): { seats: number; keyed: number; undeclared: number } {
  const ids = all<{ id: string }>(d, "SELECT id FROM election ORDER BY id").map((r) => r.id);
  const seats = readSeats(d, { elections: ids });
  const home = all<OldHome>(d, OLD_HOME).map((r) => ({ ...r }));
  const map = all<OldMap>(d, OLD_MAP).map((r) => ({ ...r }));
  assert.equal(seats.length, home.length, "the module reads exactly the contests the front page read");
  assert.equal(seats.length, map.length, "and the ones the election map read");

  let keyed = 0;
  let undeclared = 0;
  seats.forEach((s: SeatResult, i) => {
    const h = home[i] as OldHome;
    const m = map[i] as OldMap;
    const at = `${s.electionId} ${s.placeId}`;
    // The seat itself.
    assert.equal(s.electionId, h.electionId, at);
    assert.equal(s.placeId, h.placeId, at);
    assert.equal(s.epochId, h.epochId, at);
    assert.equal(s.name, h.placeName, at);
    // The scope: `pv.jurisdiction_id` against the parent-chain derivation the front page used. They agree here,
    // which is what lets the module use the column.
    assert.equal(s.jurisdictionId, h.jurisdictionId, `${at}: pv.jurisdiction_id disagrees with the parent chain`);
    assert.equal(s.jurisdictionId, m.jurisdictionId, at);
    assert.equal(s.districtId, m.districtId, at);
    assert.equal(s.districtName, m.districtName, at);
    // Declared or not: the front page's LEFT JOIN on is_winner = 1, and the map's.
    assert.equal(s.winner === null, m.wonBy === null, `${at}: winner declared differently`);
    if (s.winner === null) {
      undeclared += 1;
      assert.equal(h.winnerKey, null, at);
      assert.equal(h.winnerLabel, null, at);
      assert.equal(h.marginVotes, null, at);
    } else {
      // The party. Where the front page named one (it keyed by party.id alone) the module names the same one;
      // where it could not, the module keys by the source's string, as the maps always did.
      if (h.winnerKey !== null) {
        keyed += 1;
        assert.equal(s.winner.party.key, h.winnerKey, at);
      } else {
        assert.equal(h.winnerLabel === null || h.winnerLabel === s.winner.party.label, true, at);
      }
      assert.equal(s.winner.party.key, m.partyKey, `${at}: party key differs from the election map's`);
      assert.equal(s.winner.party.label, m.partyLabel, `${at}: party label differs from the election map's`);
      if (h.winnerLabel !== null) assert.equal(s.winner.party.label, h.winnerLabel, at);
      assert.equal(s.winner.name, m.winnerName, at);
      assert.equal(s.winner.votes, m.votes, at);
    }
    // The runner-up: rank = 2.
    assert.equal(s.runnerUp === null, m.runnerUpKey === null, `${at}: runner-up present differently`);
    if (s.runnerUp !== null) {
      assert.equal(s.runnerUp.party.key, m.runnerUpKey, at);
      assert.equal(s.runnerUp.name, m.runnerUpName, at);
      assert.equal(s.runnerUp.votes, m.runnerUpVotes, at);
    }
    // The margin: the front page's was result.margin and the map's the two counts. Whichever the module
    // used, the figure is the front page's.
    assert.equal(s.margin?.votes ?? null, h.marginVotes, `${at}: margin differs from result.margin`);
    // The turnout counts, for a verified election (an unverified one keeps them under evidence).
    if (s.counts !== null) {
      assert.equal(s.counts.voters, h.voters, at);
      assert.equal(s.counts.electors, h.electors, at);
    } else if (s.turnout.state === "unverified") {
      assert.equal(s.turnout.evidence.voters, h.voters, at);
      assert.equal(s.turnout.evidence.electors, h.electors, at);
    } else {
      // An unverified election's seat that has no usable turnout row: nothing to withhold, and nothing kept.
      assert.equal(s.turnout.state, "absent", at);
      assert.ok(!((h.voters ?? 0) > 0 && (h.electors ?? 0) > 0), `${at}: a usable turnout row went missing`);
    }
  });
  return { seats: seats.length, keyed, undeclared };
}

test("parity: on the fixture the module reads what the front page and the election map read", () => {
  const d = fixture();
  try {
    // The fixture's revision-1 row and its unnamed independent are exactly where the old reads and the module
    // are allowed to differ, and the assertions above say how: the key, and nothing else.
    const got = parity(d);
    assert.deepEqual(got, { seats: 6, keyed: 4, undeclared: 1 });
  } finally {
    d.close();
  }
});

test("parity: on every election of the registry the module reads what the front page and the election map read", live, () => {
  const d = openRead();
  try {
    const got = parity(d);
    assert.ok(got.seats > 0 && got.keyed > 0, "the registry held nothing to compare");
  } finally {
    d.close();
  }
});

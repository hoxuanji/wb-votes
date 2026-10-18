// Seat comparison: which seats may be set beside which, and what became of them.
//
// The rules are checked on literal seats with no database, then once against the two surfaces that print the
// answer. The defect behind the gate is told in full in epoch-gate.test.ts, which keeps the registry-backed checks
// of the same property at both consumers; this file holds the primitive and the one claim that spans both pages.

import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { electionMapView } from "./election-map.ts";
import { seatKey } from "./elections.ts";
import { spine, watchSignals } from "./home.ts";
import { compareSeats, sameSeat } from "./seat-comparison.ts";
import type { ComparableSeat } from "./seat-comparison.ts";
import { stateView } from "./state-view.ts";

/** A seat with a name, which a comparison passes through untouched. */
type Seat = ComparableSeat & { name: string };
const seat = (placeId: string, epochId: string, party: string | null): Seat => ({
  placeId,
  epochId,
  name: `${placeId}/${epochId}`,
  winner: party === null ? null : { party: { key: party, label: party.toUpperCase() } },
});

/* ─────────────────────────────── the key, with no database ─────────────────────────────── */

test("seatKey separates the same seat number under two delimitations", () => {
  // The exact rows behind the defect. One number, two territories, two keys.
  assert.notEqual(seatKey("ka.ac.001", "delim-1976"), seatKey("ka.ac.001", "delim-2008"));
  // And the same seat under the same boundary is the same key, or nothing could ever be compared.
  assert.equal(seatKey("ka.ac.001", "delim-2008"), seatKey("ka.ac.001", "delim-2008"));
});

test("seatKey cannot collide: no two distinct (place, epoch) pairs produce one key", () => {
  const pairs: [string, string][] = [
    ["ka.ac.001", "delim-2008"],
    ["ka.ac.001", "delim-1976"],
    ["ka.ac.0", "delim-2008 1"], // the adversarial case a naive concatenation would collapse
    ["wb.ac.084", "delim-2008"],
    ["up.ac.306", "delim-1952"],
  ];
  const keys = new Set(pairs.map(([p, e]) => seatKey(p, e)));
  assert.equal(keys.size, pairs.length, "two different seats share a comparison key");
});

test("sameSeat: the same place under the same boundary, and nothing else", () => {
  assert.equal(sameSeat({ placeId: "ka.ac.001", epochId: "e1" }, { placeId: "ka.ac.001", epochId: "e1" }), true);
  assert.equal(sameSeat({ placeId: "ka.ac.001", epochId: "e1" }, { placeId: "ka.ac.001", epochId: "e2" }), false);
  assert.equal(sameSeat({ placeId: "ka.ac.001", epochId: "e1" }, { placeId: "ka.ac.002", epochId: "e1" }), false);
  // Extra fields on either side are not part of the identity.
  assert.equal(sameSeat(seat("ka.ac.001", "e1", "inc"), seat("ka.ac.001", "e1", "bjp")), true);
});

/* ─────────────────────────────── the gate: what may be compared at all ─────────────────────────────── */

test("compareSeats refuses every seat when the boundary changed, and refuses none when it did not", () => {
  const then2004 = [seat("ka.ac.001", "delim-1976", "inc"), seat("ka.ac.002", "delim-1976", "bjp")];
  const now2008 = [seat("ka.ac.001", "delim-2008", "inc"), seat("ka.ac.002", "delim-2008", "inc")];

  const across = compareSeats(now2008, then2004);
  assert.equal(across.comparable, 0, "a redrawn seat was admitted to the comparison");
  assert.equal(across.incomparable.length, 2, "the refused seats were not reported");
  assert.equal(across.flipped.length, 0, "a redrawn seat was reported as having changed hands");
  assert.deepEqual(across.matrix, []);

  const within = compareSeats(now2008, now2008);
  assert.equal(within.comparable, 2);
  assert.equal(within.incomparable.length, 0);
});

test("compareSeats splits a MIXED election per seat, not per election", () => {
  // ls-2024 is this shape in the live registry: 524 contests under delim-2008, 5 under delim-2022-jk and
  // 14 under delim-2023-as. An election-level flag would have called all 543 comparable to 2019.
  const then = [seat("ka.pc.001", "delim-2008", "inc"), seat("jk.pc.001", "delim-2008", "inc")];
  const now = [seat("ka.pc.001", "delim-2008", "bjp"), seat("jk.pc.001", "delim-2022-jk", "bjp")];
  const c = compareSeats(now, then);
  assert.equal(c.comparable, 1, "the seat on unchanged boundaries should compare");
  assert.equal(c.incomparable.length, 1, "the redrawn seat should not");
  assert.equal(c.incomparable[0]?.placeId, "jk.pc.001");
  assert.deepEqual(c.flipped.map((p) => p.now.placeId), ["ka.pc.001"]);
});

/* ─────────────────────────────── the four buckets, and the one denominator ─────────────────────────────── */

// Seven seats of `now`, one in each case. `then` also holds a seat `now` does not, which no bucket may mention.
const THEN = [
  seat("p.held", "e1", "inc"),
  seat("p.flipped", "e1", "inc"),
  seat("p.then-unknown", "e1", null),
  seat("p.now-unknown", "e1", "inc"),
  seat("p.both-unknown", "e1", null),
  seat("p.redrawn", "e1", "inc"),
  seat("p.gone", "e1", "inc"),
];
const NOW = [
  seat("p.held", "e1", "inc"),
  seat("p.flipped", "e1", "bjp"),
  seat("p.then-unknown", "e1", "bjp"),
  seat("p.now-unknown", "e1", null),
  seat("p.both-unknown", "e1", null),
  seat("p.redrawn", "e2", "inc"),
  seat("p.new", "e1", "inc"),
];

test("compareSeats: four buckets that add up to the seats of `now`, and one denominator", () => {
  const c = compareSeats(NOW, THEN);
  assert.deepEqual(c.held.map((p) => p.now.placeId), ["p.held"]);
  assert.deepEqual(c.flipped.map((p) => p.now.placeId), ["p.flipped"]);
  assert.deepEqual(
    c.unknown.map((p) => [p.now.placeId, p.missing]),
    [["p.then-unknown", "then"], ["p.now-unknown", "now"], ["p.both-unknown", "both"]],
  );
  assert.deepEqual(c.incomparable.map((s) => s.placeId), ["p.redrawn", "p.new"]);
  assert.equal(c.held.length + c.flipped.length + c.unknown.length + c.incomparable.length, NOW.length);
  // Unknown is neither a hold nor a change, so it is not in the denominator: 1 of 2, never 1 of 5.
  assert.equal(c.comparable, 2);
  assert.equal(c.comparable, c.held.length + c.flipped.length);
});

test("compareSeats: a pair is the same seat at both elections, rows passed through untouched", () => {
  const c = compareSeats(NOW, THEN);
  const [flip] = c.flipped;
  assert.equal(flip?.now, NOW[1], "the row of `now` is handed back, not a copy of some of its fields");
  assert.equal(flip?.then, THEN[1]);
  assert.equal(flip?.now.name, "p.flipped/e1");
});

test("compareSeats: verdicts are one per seat of `now`, in its order, and agree with the buckets", () => {
  const c = compareSeats(NOW, THEN);
  assert.deepEqual(c.verdicts.map((v) => v.now), NOW);
  assert.deepEqual(c.verdicts.map((v) => v.kind), [
    "held", "flipped", "unknown", "unknown", "unknown", "incomparable", "incomparable",
  ]);
  const flipped = c.verdicts[1];
  assert.ok(flipped?.kind === "flipped");
  assert.deepEqual([flipped.from, flipped.to], [{ key: "inc", label: "INC" }, { key: "bjp", label: "BJP" }]);
  assert.deepEqual(c.verdicts.filter((v) => v.kind === "unknown").map((v) => v.kind === "unknown" && v.missing), [
    "then", "now", "both",
  ]);
});

test("compareSeats: an undeclared winner is never a flip, whoever won the other side", () => {
  const then = [seat("a", "e1", null), seat("b", "e1", "inc"), seat("c", "e1", null)];
  const now = [seat("a", "e1", "bjp"), seat("b", "e1", null), seat("c", "e1", null)];
  const c = compareSeats(now, then);
  assert.equal(c.flipped.length, 0);
  assert.equal(c.held.length, 0);
  assert.equal(c.comparable, 0);
  assert.equal(c.unknown.length, 3);
});

test("compareSeats: an independent replaced by another independent is HELD, decided by party key alone", () => {
  // The registry names the party and not the person here, so two different independents are one key.
  const then = [{ ...seat("a", "e1", "ind"), name: "Independent One" }];
  const now = [{ ...seat("a", "e1", "ind"), name: "Independent Two" }];
  const c = compareSeats(now, then);
  assert.equal(c.held.length, 1);
  assert.equal(c.flipped.length, 0);
});

test("compareSeats: nothing on either side is a comparison of nothing", () => {
  for (const [now, then] of [[[], []], [[], THEN], [NOW, []]] as const) {
    const c = compareSeats(now, then);
    assert.equal(c.comparable, 0);
    assert.equal(c.verdicts.length, now.length);
    assert.equal(c.incomparable.length, now.length, "a seat with nothing to be compared with is incomparable");
    assert.deepEqual(c.matrix, []);
  }
});

test("compareSeats does not change what it is given", () => {
  const now = structuredClone(NOW);
  const then = structuredClone(THEN);
  compareSeats(now, then);
  assert.deepEqual(now, NOW);
  assert.deepEqual(then, THEN);
});

/* ─────────────────────────────── the flip matrix ─────────────────────────────── */

test("compareSeats: the matrix adds up to the flipped seats and is sorted by count, from, then to", () => {
  const moves: [string, string][] = [
    ["inc", "bjp"], ["inc", "bjp"], ["inc", "bjp"],
    ["jds", "inc"], ["jds", "inc"],
    ["bjp", "inc"], ["bjp", "jds"], ["bjp", "aap"],
    ["aap", "bjp"],
  ];
  const then = moves.map(([from], i) => seat(`s${i}`, "e1", from));
  const now = moves.map(([, to], i) => seat(`s${i}`, "e1", to));
  const c = compareSeats(now, then);
  assert.deepEqual(
    c.matrix.map((m) => [m.from.key, m.to.key, m.count]),
    [
      ["inc", "bjp", 3],
      ["jds", "inc", 2],
      // Four single-seat cells: from.key decides, and where it ties (bjp three times) to.key does.
      ["aap", "bjp", 1],
      ["bjp", "aap", 1],
      ["bjp", "inc", 1],
      ["bjp", "jds", 1],
    ],
  );
  assert.equal(c.matrix.reduce((n, m) => n + m.count, 0), c.flipped.length);
  assert.deepEqual(c.matrix[0]?.from, { key: "inc", label: "INC" });
});

test("compareSeats: the matrix and the verdicts do not depend on the order the rows arrive in", () => {
  let s = 99;
  const rnd = (n: number): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s % n;
  };
  const shuffled = <T>(xs: readonly T[]): T[] => {
    const out = [...xs];
    for (let i = out.length - 1; i > 0; i--) {
      const j = rnd(i + 1);
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  };
  const parties = ["inc", "bjp", "jds", "ind", null];
  const then = Array.from({ length: 40 }, (_, i) => seat(`s${i}`, "e1", parties[rnd(5)] ?? null));
  const now = Array.from({ length: 40 }, (_, i) => seat(`s${i}`, rnd(5) === 0 ? "e2" : "e1", parties[rnd(5)] ?? null));
  const base = compareSeats(now, then);
  const verdictOf = (c: typeof base): Record<string, string> =>
    Object.fromEntries(c.verdicts.map((v) => [v.now.placeId, v.kind]));
  for (let i = 0; i < 20; i++) {
    const c = compareSeats(shuffled(now), shuffled(then));
    assert.deepEqual(c.matrix, base.matrix, "the matrix order followed the order of the rows");
    assert.deepEqual(verdictOf(c), verdictOf(base));
    assert.equal(c.comparable, base.comparable);
  }
});

/* ─────────────────────────────── one identity per seat ─────────────────────────────── */

test("compareSeats throws when either side holds one seat twice, and not when the epochs differ", () => {
  const once = [seat("a", "e1", "inc")];
  const twice = [seat("a", "e1", "inc"), seat("a", "e1", "bjp")];
  assert.throws(() => compareSeats(twice, once), /a under e1 is on the now side twice/);
  assert.throws(() => compareSeats(once, twice), /a under e1 is on the then side twice/);
  // The same place under two boundaries is two seats.
  assert.doesNotThrow(() => compareSeats([seat("a", "e1", "inc"), seat("a", "e2", "inc")], once));
});

/* ─────────────────────────────── against a naive pairing ─────────────────────────────── */

test("compareSeats agrees with a nested-loop pairing on random seat lists", () => {
  let s = 4242;
  const rnd = (n: number): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s % n;
  };
  const parties = ["inc", "bjp", "jds", "ind", null];
  for (let round = 0; round < 300; round++) {
    const places = Array.from({ length: 1 + rnd(12) }, (_, i) => `p${i}`);
    const side = (): Seat[] =>
      places.flatMap((p) => (rnd(6) === 0 ? [] : [seat(p, ["e1", "e2", "e3"][rnd(3)] as string, parties[rnd(5)] ?? null)]));
    const now = side();
    const then = side();

    // The rule, written out the long way: look each seat up by scanning, count with plain loops.
    let held = 0;
    let flipped = 0;
    let unknown = 0;
    let incomparable = 0;
    const cells: Record<string, number> = {};
    for (const n of now) {
      const t = then.find((x) => x.placeId === n.placeId && x.epochId === n.epochId);
      if (t === undefined) incomparable += 1;
      else if (n.winner === null || t.winner === null) unknown += 1;
      else if (n.winner.party.key === t.winner.party.key) held += 1;
      else {
        flipped += 1;
        const cell = `${t.winner.party.key}>${n.winner.party.key}`;
        cells[cell] = (cells[cell] ?? 0) + 1;
      }
    }
    const c = compareSeats(now, then);
    assert.deepEqual(
      [c.held.length, c.flipped.length, c.unknown.length, c.incomparable.length, c.comparable],
      [held, flipped, unknown, incomparable, held + flipped],
      `round ${round}`,
    );
    assert.deepEqual(
      Object.fromEntries(c.matrix.map((m) => [`${m.from.key}>${m.to.key}`, m.count])),
      cells,
      `round ${round}`,
    );
  }
});

/* ─────────────────────────────── one count, on both pages ─────────────────────────────── */

/**
 * Karnataka's assembly elections of 2018 and 2023, eight seats of 2023, one of each case:
 *
 *   ka.ac.001  AAA then, AAA now       held
 *   ka.ac.002  CCC then, BBB now       flipped
 *   ka.ac.003  fought under e1, then under e2 (redrawn)         incomparable
 *   ka.ac.004  no winner declared in 2018, AAA now              unknown
 *   ka.ac.005  AAA then, no winner declared in 2023             unknown
 *   ka.ac.006  one independent then, another now                held
 *   ka.ac.007  AAA then, CCC now                                flipped
 *   ka.ac.008  no winner declared in either                     unknown
 */
function fixture(): DatabaseSync {
  const d = open(":memory:");
  migrate(d, "2026-08-12T00:00:00.000Z");
  d.exec(`
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e1','Delimitation','2008-02-19');
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e2','Redrawn','2020-02-19');
    INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('ka','state','Karnataka','in');
    INSERT INTO source (id, kind, publisher, title, retrieved_at, doc_hash)
      VALUES ('s1','static_module','Publisher','Source','2026-08-12','sha256:0');
    INSERT INTO party (id, name, short_name) VALUES ('AAA','A Party','AAA');
    INSERT INTO party (id, name, short_name) VALUES ('BBB','B Party','BBB');
    INSERT INTO party (id, name, short_name) VALUES ('CCC','C Party','CCC');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (1,'AAA','1990-01-01','A Party');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (2,'BBB','1990-01-01','B Party');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (3,'CCC','1990-01-01','C Party');
  `);
  const place = d.prepare(`INSERT INTO place (id, kind, canonical_name, parent_id) VALUES (?, 'ac', ?, 'ka')`);
  const version = d.prepare(
    `INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
     VALUES (?, ?, 'ka', 'ac', ?, ?, ?, 'general')`,
  );
  for (let n = 1; n <= 8; n++) {
    place.run(`ka.ac.00${n}`, `Seat ${n}`);
    version.run(n, `ka.ac.00${n}`, "e1", n, `Seat ${n}`);
  }
  version.run(13, "ka.ac.003", "e2", 3, "Seat 3");

  const election = d.prepare(
    `INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
     VALUES (?, 'assembly', 'state', 'ka', 'e1', ?, 'declared', 'ac', ?, 1)`,
  );
  election.run("ka-assembly-2018", "KA 2018", 2018);
  election.run("ka-assembly-2023", "KA 2023", 2023);

  const contest = d.prepare(`INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES (?, ?, ?, 'declared')`);
  const person = d.prepare(`INSERT INTO person (id, canonical_name, created_at) VALUES (?, ?, '2026-08-12')`);
  const candidacy = d.prepare(
    `INSERT INTO candidacy (id, contest_id, person_id, party_version_id, status, party_raw) VALUES (?, ?, ?, ?, 'elected', ?)`,
  );
  const result = d.prepare(
    `INSERT INTO result (contest_id, candidacy_id, revision, votes, "rank", is_winner, margin, source_id, ingested_at)
     VALUES (?, ?, 0, 100, 1, 1, NULL, 's1', '2026-08-12')`,
  );
  const loser = d.prepare(
    `INSERT INTO result (contest_id, candidacy_id, revision, votes, "rank", is_winner, margin, source_id, ingested_at)
     VALUES (?, ?, 0, 90, 2, 0, NULL, 's1', '2026-08-12')`,
  );
  /** A contest. A winner is a party_version id, or a raw string for one the registry cannot name; null declares none. */
  const held = (election: string, versionId: number, winner: number | string | null): void => {
    const id = `${election}:${versionId}`;
    contest.run(id, election, versionId);
    // Every contest has a runner-up, so that a seat with no declared winner is still a contest.
    person.run(`${id}-r`, `Runner ${id}`);
    candidacy.run(`${id}-r`, id, `${id}-r`, 2, null);
    loser.run(id, `${id}-r`);
    if (winner === null) return;
    person.run(`${id}-w`, `Winner ${id}`);
    candidacy.run(`${id}-w`, id, `${id}-w`, typeof winner === "number" ? winner : null, typeof winner === "string" ? winner : null);
    result.run(id, `${id}-w`);
  };
  // 2018, all under e1.
  held("ka-assembly-2018", 1, 1);
  held("ka-assembly-2018", 2, 3);
  held("ka-assembly-2018", 3, 1);
  held("ka-assembly-2018", 4, null);
  held("ka-assembly-2018", 5, 1);
  held("ka-assembly-2018", 6, "IND");
  held("ka-assembly-2018", 7, 1);
  held("ka-assembly-2018", 8, null);
  // 2023: seat 3 is fought under the new boundaries.
  held("ka-assembly-2023", 1, 1);
  held("ka-assembly-2023", 2, 2);
  held("ka-assembly-2023", 13, 2);
  held("ka-assembly-2023", 4, 1);
  held("ka-assembly-2023", 5, null);
  held("ka-assembly-2023", 6, "IND");
  held("ka-assembly-2023", 7, 3);
  held("ka-assembly-2023", 8, null);
  return d;
}

test("the front page and the state page report the same comparable count for the same pair", () => {
  const d = fixture();
  try {
    // The state page, through the view it renders from.
    const page = stateView(d, "ka");
    assert.ok(page.kind === "ready");
    assert.equal(page.map.election?.id, "ka-assembly-2023");
    const flips = page.map.flips;
    assert.ok(flips !== null);
    assert.deepEqual([flips.flipped, flips.held, flips.comparable], [2, 2, 4]);
    // One seat was redrawn; the three with an undeclared winner are not called redrawn.
    assert.equal(page.map.incomparableSeats, 1);

    // The front page, through the signal it prints.
    const signal = watchSignals(d, spine(d), 2026, 20).find((s) => /differs from the previous election/.test(s.rule));
    assert.ok(signal !== undefined, "the front page printed no flip signal for a pair that has flips");
    const said = /^(\d+) of (\d+) seats changed hands between 2018 and 2023\.$/.exec(signal.detail);
    assert.ok(said !== null, `unexpected wording: ${signal.detail}`);
    assert.deepEqual([Number(said[1]), Number(said[2])], [flips.flipped, flips.comparable]);
    assert.equal(signal.weight, flips.flipped);
  } finally {
    d.close();
  }
});

test("the map says an undeclared winner is not a redraw, and flips nothing for it", () => {
  const d = fixture();
  try {
    const v = electionMapView(d, "ka-assembly-2023");
    const by = new Map(v.seats.map((s) => [s.placeId, s]));
    // Redrawn: the one seat that is not comparable.
    assert.deepEqual([by.get("ka.ac.003")?.comparable, by.get("ka.ac.003")?.flip], [false, null]);
    // Undeclared on either side: comparable, because nothing moved, and with no flip to report.
    for (const id of ["ka.ac.004", "ka.ac.005", "ka.ac.008"]) {
      assert.deepEqual([by.get(id)?.comparable, by.get(id)?.flip], [true, null], id);
    }
    // One independent for another is a hold.
    assert.deepEqual(by.get("ka.ac.006")?.flip && { ...by.get("ka.ac.006")?.flip }, {
      from: { key: "IND", label: "IND" },
      changed: false,
    });
    assert.deepEqual(
      v.flips?.pairs.map((p) => [p.from.key, p.to.key, p.count]),
      [["AAA", "CCC", 1], ["CCC", "BBB", 1]],
    );
  } finally {
    d.close();
  }
});

// `stateView`: what a state page opens on.
//
// Hand-built, because the cases that matter are the ones the live registry cannot show: it holds no assembly-less
// jurisdiction beyond the seed's West Bengal, no election announced and not yet voted in, and no state the newest
// general election did not reach. The rules are checked on the real schema (`:memory:` + migrate), the pattern
// of current-election.test.ts, so they run with or without a registry.
//
//   ka   Karnataka     assembly 2018 and 2023, a by-election newer than both, an announced 2028 with no
//                      contests, Lok Sabha 2019 and 2024 (two seats each), a Lok Sabha by-election
//   kl   Kerala        assembly 2021, Lok Sabha 2019 only: the 2024 general election has no seat in it
//   br   Bihar         two assembly elections in 2005, the id order the reverse of the calendar
//   wb   West Bengal   a by-election and nothing else
//   an   Andaman       no assembly: Lok Sabha 2019 and 2024, one seat each
//   tn   Tamil Nadu    no election at all

import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { currentElection } from "./elections.ts";
import { electionMapView } from "./election-map.ts";
import { stateTrajectory } from "./trajectory.ts";
import { stateView } from "./state-view.ts";
import type { StateView } from "./state-view.ts";

function fixture(): DatabaseSync {
  const d = open(":memory:");
  migrate(d, "2026-08-12T00:00:00.000Z");
  d.exec(`INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e1','Delimitation','2008-02-19')`);
  const place = d.prepare(`INSERT INTO place (id, kind, canonical_name, parent_id) VALUES (?, ?, ?, ?)`);
  place.run("in", "nation", "India", null);
  for (const [id, kind, name] of [
    ["ka", "state", "Karnataka"],
    ["kl", "state", "Kerala"],
    ["br", "state", "Bihar"],
    ["wb", "state", "West Bengal"],
    ["tn", "state", "Tamil Nadu"],
    ["an", "ut", "Andaman and Nicobar Islands"],
  ] as const) {
    place.run(id, kind, name, "in");
  }
  const version = d.prepare(
    `INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
     VALUES (?, ?, ?, ?, 'e1', ?, ?, 'general')`,
  );
  let versionId = 0;
  /** One seat, as a place and its single version; returns the version's id. */
  const seat = (jurisdiction: string, kind: "ac" | "pc", number: number): number => {
    const id = `${jurisdiction}.${kind}.${String(number).padStart(3, "0")}`;
    place.run(id, kind, `SEAT ${id}`, jurisdiction);
    version.run(++versionId, id, jurisdiction, kind, number, `SEAT ${id}`);
    return versionId;
  };
  const ka1 = seat("ka", "ac", 1);
  const ka2 = seat("ka", "ac", 2);
  const kaP1 = seat("ka", "pc", 1);
  const kaP2 = seat("ka", "pc", 2);
  const kl1 = seat("kl", "ac", 1);
  const klP1 = seat("kl", "pc", 1);
  const br1 = seat("br", "ac", 1);
  const wb1 = seat("wb", "ac", 1);
  const anP1 = seat("an", "pc", 1);

  const election = d.prepare(
    `INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year,
                           polling_month, occurrence)
     VALUES (?, ?, ?, ?, 'e1', ?, 'declared', ?, ?, ?, ?)`,
  );
  const contest = d.prepare(
    `INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES (?, ?, ?, 'declared')`,
  );
  let contestId = 0;
  const contests = (electionId: string, ...versions: number[]): void => {
    for (const v of versions) contest.run(`c${++contestId}`, electionId, v);
  };

  election.run("ka-assembly-2018", "assembly", "state", "ka", "KA 2018", "ac", 2018, 5, 1);
  election.run("ka-assembly-2023", "assembly", "state", "ka", "KA 2023", "ac", 2023, 5, 1);
  election.run("ka-bypoll-ae-2021", "bypoll", "state", "ka", "KA bypoll 2021", "ac", 2021, null, 1);
  election.run("ka-bypoll-ae-2024", "bypoll", "state", "ka", "KA bypoll 2024", "ac", 2024, null, 1);
  // Announced, not yet voted in: a row with no contests, and the newest full-house assembly election there is.
  election.run("ka-assembly-2028", "assembly", "state", "ka", "KA 2028", "ac", 2028, 5, 1);
  election.run("ka-bypoll-ge-2025", "bypoll", "state", "ka", "KA LS bypoll 2025", "pc", 2025, null, 1);
  contests("ka-assembly-2018", ka1, ka2);
  contests("ka-assembly-2023", ka1, ka2);
  contests("ka-bypoll-ae-2021", ka2);
  contests("ka-bypoll-ae-2024", ka1);
  contests("ka-bypoll-ge-2025", kaP1);

  // The general elections belong to the union and are fought in every jurisdiction that has a seat in them.
  election.run("ls-2019", "general", "union", "in", "LS 2019", "pc", 2019, 4, 1);
  election.run("ls-2024", "general", "union", "in", "LS 2024", "pc", 2024, 4, 1);
  contests("ls-2019", kaP1, kaP2, klP1, anP1);
  contests("ls-2024", kaP1, kaP2, anP1);

  election.run("kl-assembly-2021", "assembly", "state", "kl", "KL 2021", "ac", 2021, 4, 1);
  contests("kl-assembly-2021", kl1);

  // Bihar held two in 2005. October is the later, though its id sorts below February's.
  election.run("br-assembly-2005-a", "assembly", "state", "br", "BR Oct 2005", "ac", 2005, 10, 2);
  election.run("br-assembly-2005-z", "assembly", "state", "br", "BR Feb 2005", "ac", 2005, 2, 1);
  contests("br-assembly-2005-a", br1);
  contests("br-assembly-2005-z", br1);

  election.run("wb-bypoll-ae-2021", "bypoll", "state", "wb", "WB bypoll 2021", "ac", 2021, null, 1);
  contests("wb-bypoll-ae-2021", wb1);
  return d;
}

/** Run `fn` on a fresh fixture and close it, as a test does. */
function withFixture(fn: (d: DatabaseSync) => void): void {
  const d = fixture();
  try {
    fn(d);
  } finally {
    d.close();
  }
}

/** The `ready` variant, or a failure that says what came back instead. */
function ready(v: StateView): Extract<StateView, { kind: "ready" }> {
  assert.ok(v.kind === "ready", `expected a ready view, got ${v.kind}`);
  return v;
}

/** The choices as (id, seats), which is what a tab row is made of. */
const idsOf = (v: Extract<StateView, { kind: "ready" }>): [string, number][] =>
  v.choices.map((c) => [c.id, c.seats]);

test("a state opens on its assembly's newest election with seats, not on a by-election or one nobody voted in", () => {
  withFixture((d) => {
    // The precondition, so the rest is not vacuous: the registry's own "current" assembly election is the
    // announced one, and a by-election is newer than the one a reader came for.
    assert.equal(currentElection(d, "assembly", "ka")?.id, "ka-assembly-2028");

    const v = ready(stateView(d, "ka"));
    assert.deepEqual({ ...v.jurisdiction }, { id: "ka", name: "Karnataka" });
    assert.equal(v.house, "assembly");
    assert.equal(v.map.election?.id, "ka-assembly-2023");
    assert.equal(v.map.scope, "ka");
    assert.equal(v.asked, "none");
    assert.deepEqual(idsOf(v), [["ka-assembly-2023", 2], ["ka-assembly-2018", 2]]);
    assert.ok(v.choices.every((c) => c.body === "assembly" && c.fill === "general"));
  });
});

test("two elections in one year: the later month opens, whatever the ids say", () => {
  withFixture((d) => {
    const v = ready(stateView(d, "br"));
    assert.equal(v.map.election?.id, "br-assembly-2005-a");
    assert.deepEqual(idsOf(v).map(([id]) => id), ["br-assembly-2005-a", "br-assembly-2005-z"]);
  });
});

test("the view is the map and the trajectory it names, not a second reading of them", () => {
  withFixture((d) => {
    const v = ready(stateView(d, "ka"));
    assert.deepEqual(v.map, electionMapView(d, "ka-assembly-2023", "ka"));
    assert.deepEqual(v.trajectory, stateTrajectory(d, "ka", "ac"));
    const lok = ready(stateView(d, "ka", { house: "pc" }));
    assert.deepEqual(lok.map, electionMapView(d, "ls-2024", "ka"));
    assert.deepEqual(lok.trajectory, stateTrajectory(d, "ka", "pc"));
  });
});

test("?house=pc is the state's share of the national Lok Sabha, with the seats counted inside the state", () => {
  withFixture((d) => {
    const v = ready(stateView(d, "ka", { house: "pc" }));
    assert.equal(v.house, "lok-sabha");
    assert.equal(v.map.election?.id, "ls-2024");
    assert.equal(v.map.scope, "ka");
    // ls-2024 has three contests in the registry; two are in Karnataka.
    assert.deepEqual(idsOf(v), [["ls-2024", 2], ["ls-2019", 2]]);
    assert.equal(v.map.seats.length, 2);
    assert.ok(v.map.seats.every((s) => s.jurisdictionId === "ka"));
    assert.ok(v.choices.every((c) => c.body === "lok-sabha" && c.fill === "general"));
    // Both houses are on offer from either view.
    assert.deepEqual(v.houses, ["assembly", "lok-sabha"]);
    assert.deepEqual(ready(stateView(d, "ka")).houses, ["assembly", "lok-sabha"]);
  });
});

test("a house the URL does not name is the state's own, and ?house=ac asks for it", () => {
  withFixture((d) => {
    const own = ready(stateView(d, "ka"));
    for (const house of [undefined, "", "ac", "AC", "lok-sabha", "nonsense"]) {
      assert.equal(ready(stateView(d, "ka", { house })).map.election?.id, own.map.election?.id, `house=${house}`);
    }
  });
});

test("a state the newest general election did not reach opens on the newest it did, not on zero seats", () => {
  withFixture((d) => {
    // The registry's current Lok Sabha election is ls-2024, and Kerala has no seat in it.
    assert.equal(currentElection(d, "lok-sabha")?.id, "ls-2024");
    const v = ready(stateView(d, "kl", { house: "pc" }));
    assert.equal(v.map.election?.id, "ls-2019");
    assert.deepEqual(idsOf(v), [["ls-2019", 1]]);
    assert.equal(v.map.seats.length, 1);
  });
});

test("an election named in the URL is honoured when it is one this state's house contested", () => {
  withFixture((d) => {
    const older = ready(stateView(d, "ka", { election: "ka-assembly-2018" }));
    assert.equal(older.map.election?.id, "ka-assembly-2018");
    assert.equal(older.asked, "honoured");

    // The newest election is honoured too, and is not "defaulted" merely because it is also the default.
    assert.equal(ready(stateView(d, "ka", { election: "ka-assembly-2023" })).asked, "honoured");

    const lok = ready(stateView(d, "ka", { house: "pc", election: "ls-2019" }));
    assert.equal(lok.map.election?.id, "ls-2019");
    assert.equal(lok.asked, "honoured");
  });
});

test("a by-election named in the URL is honoured, and its strip is the house's by-elections, not the general ones", () => {
  withFixture((d) => {
    const v = ready(stateView(d, "ka", { election: "ka-bypoll-ae-2024" }));
    assert.equal(v.map.election?.id, "ka-bypoll-ae-2024");
    assert.equal(v.map.election?.fill, "bypoll");
    assert.equal(v.asked, "honoured");
    assert.deepEqual(idsOf(v), [["ka-bypoll-ae-2024", 1], ["ka-bypoll-ae-2021", 1]]);
    // It never opens by default, and the default strip never lists it.
    assert.deepEqual(idsOf(ready(stateView(d, "ka"))).map(([id]) => id), ["ka-assembly-2023", "ka-assembly-2018"]);

    const lok = ready(stateView(d, "ka", { house: "pc", election: "ka-bypoll-ge-2025" }));
    assert.equal(lok.map.election?.id, "ka-bypoll-ge-2025");
    assert.equal(lok.asked, "honoured");
    assert.deepEqual(idsOf(lok), [["ka-bypoll-ge-2025", 1]]);
  });
});

test("an election the URL names that this page cannot show opens the default, and says it defaulted", () => {
  withFixture((d) => {
    const cases: [label: string, req: { house?: string; election?: string }, opens: string][] = [
      ["no such election", { election: "nowhere-2099" }, "ka-assembly-2023"],
      ["the other house's election", { election: "ls-2024" }, "ka-assembly-2023"],
      ["the other house's by-election", { election: "ka-bypoll-ge-2025" }, "ka-assembly-2023"],
      ["another state's election", { election: "kl-assembly-2021" }, "ka-assembly-2023"],
      ["announced, with no contests", { election: "ka-assembly-2028" }, "ka-assembly-2023"],
      ["an assembly election, asked of the Lok Sabha", { house: "pc", election: "ka-assembly-2023" }, "ls-2024"],
      ["a general election the state took no part in", { house: "pc", election: "ls-2099" }, "ls-2024"],
      ["a string meant as SQL", { election: "x' OR '1'='1" }, "ka-assembly-2023"],
    ];
    for (const [label, req, opens] of cases) {
      const v = ready(stateView(d, "ka", req));
      assert.equal(v.asked, "defaulted", label);
      assert.equal(v.map.election?.id, opens, label);
    }
    // And a Lok Sabha election the state has no seat in, asked of Kerala.
    const kl = ready(stateView(d, "kl", { house: "pc", election: "ls-2024" }));
    assert.equal(kl.asked, "defaulted");
    assert.equal(kl.map.election?.id, "ls-2019");
  });
});

test("an empty ?election= asks for nothing", () => {
  withFixture((d) => {
    assert.equal(ready(stateView(d, "ka", { election: "" })).asked, "none");
    assert.equal(ready(stateView(d, "ka", { election: undefined })).asked, "none");
  });
});

test("an id that is not a state or union territory is not found, in whatever case or spelling", () => {
  withFixture((d) => {
    // Resolving a path to a place is the caller's; this takes the id as the registry spells it.
    for (const id of ["zz", "", "KA", "Karnataka", "karnataka", "in", "ka.ac.001", "ka-assembly-2023"]) {
      assert.deepEqual(stateView(d, id), { kind: "not-found" }, JSON.stringify(id));
    }
  });
});

test("a jurisdiction with no assembly opens on its scoped Lok Sabha view", () => {
  withFixture((d) => {
    const v = ready(stateView(d, "an"));
    assert.equal(v.house, "lok-sabha");
    assert.deepEqual(v.houses, ["lok-sabha"]);
    assert.equal(v.map.election?.id, "ls-2024");
    assert.equal(v.map.scope, "an");
    assert.deepEqual(idsOf(v), [["ls-2024", 1], ["ls-2019", 1]]);
    assert.equal(v.map.seats.length, 1);
    assert.equal(v.asked, "none");
    // Its trajectory is the Lok Sabha's, which no jurisdiction has of its own: empty, not a crash.
    assert.equal(v.trajectory.house, "pc");
    assert.deepEqual(v.trajectory.elections, []);

    // An election of that house is honoured without ?house=, because the house is already the Lok Sabha.
    const older = ready(stateView(d, "an", { election: "ls-2019" }));
    assert.equal(older.map.election?.id, "ls-2019");
    assert.equal(older.asked, "honoured");
  });
});

test("asking for a house a jurisdiction has no election of is not answered with the other house", () => {
  withFixture((d) => {
    assert.equal(stateView(d, "an", { house: "ac" }).kind, "no-elections", "Andaman has no assembly");
    assert.equal(stateView(d, "br", { house: "pc" }).kind, "no-elections", "Bihar has no seat in a general election");
  });
});

test("a jurisdiction with nothing to open on says so, and still names itself", () => {
  withFixture((d) => {
    const tn = stateView(d, "tn");
    assert.equal(tn.kind, "no-elections");
    assert.deepEqual(tn.kind === "no-elections" ? { ...tn.jurisdiction } : null, {
      id: "tn",
      name: "Tamil Nadu",
    });
    // West Bengal has a by-election and no full-house election: nothing to open on by default...
    assert.equal(stateView(d, "wb").kind, "no-elections");
    // ...but one that names the by-election gets it, as the page always did.
    const v = ready(stateView(d, "wb", { election: "wb-bypoll-ae-2021" }));
    assert.equal(v.map.election?.id, "wb-bypoll-ae-2021");
    assert.equal(v.asked, "honoured");
    assert.deepEqual(idsOf(v), [["wb-bypoll-ae-2021", 1]]);
    assert.deepEqual(v.houses, ["assembly"]);
  });
});

test("an empty registry finds no state at all", () => {
  const d = open(":memory:");
  migrate(d, "2026-08-12T00:00:00.000Z");
  try {
    assert.deepEqual(stateView(d, "ka"), { kind: "not-found" });
  } finally {
    d.close();
  }
});

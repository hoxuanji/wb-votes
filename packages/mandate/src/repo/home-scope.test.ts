// What the front page says about how much of India it is looking at, and the order it ranks parties in.
//
// The two scope sentences are pure and tested on literals. The ranking rule is the one claim here that is about CODE: the page prints a sentence, and
// the sort that produced the order is somewhere else. A sentence that said "by seats" over a sort by states led would be a false statement printed on
// every page, so a registry is built here whose parties can only come out in one order if the sort is the sentence.

import assert from "node:assert/strict";
import test from "node:test";
import { open } from "../db/index.ts";
import { PARTY_RANK_RULE, homeView } from "./home.ts";
import { houseScope, landscapeScope, seatsLoadedLine } from "./home-scope.ts";
import { electionsFixture } from "./testkit.ts";

const whole = { assemblySeatsHeld: 4123, assemblySeatsTotal: 4123, lokSabhaSeatsHeld: 543, lokSabhaSeatsTotal: 543 };

/* ────────────────────────────── the scope of the party landscape ────────────────────────────── */

test("a landscape over every seat says nothing about its scope", () => {
  assert.equal(landscapeScope(whole), null);
});

test("a landscape names each house that is not whole, with the registry's seats against the house's, in Indian digit grouping", () => {
  assert.equal(
    landscapeScope({ ...whole, assemblySeatsHeld: 294, lokSabhaSeatsHeld: 42 }),
    "Counted over the 294 of 4,123 assembly seats and 42 of 543 Lok Sabha seats the registry holds.",
  );
  assert.equal(landscapeScope({ ...whole, lokSabhaSeatsHeld: 42 }), "Counted over the 42 of 543 Lok Sabha seats the registry holds.", "a whole house is not named");
  assert.equal(landscapeScope({ ...whole, assemblySeatsHeld: 1500 }), "Counted over the 1,500 of 4,123 assembly seats the registry holds.");
  assert.equal(landscapeScope({ ...whole, assemblySeatsHeld: 0 }), "Counted over the 0 of 4,123 assembly seats the registry holds.", "none held is a count, not an absence of one");
});

test("a house with no reference total is not described, because there is no denominator to say", () => {
  assert.equal(landscapeScope({ assemblySeatsHeld: 12, assemblySeatsTotal: 0, lokSabhaSeatsHeld: 3, lokSabhaSeatsTotal: 0 }), null);
});

/* ────────────────────────────── the scope of a Lok Sabha row ────────────────────────────── */

test("a Lok Sabha election the registry holds part of says how much of the house", () => {
  assert.equal(houseScope({ body: "lok-sabha", fill: "general", loaded: 42, houseTotal: 543 }), "42 of 543 seats");
});

test("nothing else gets a scope: a whole house, an assembly, a by-election, and a house with no total", () => {
  assert.equal(houseScope({ body: "lok-sabha", fill: "general", loaded: 543, houseTotal: 543 }), null, "a whole house needs no qualifier");
  assert.equal(houseScope({ body: "assembly", fill: "general", loaded: 294, houseTotal: 543 }), null, "an assembly's 'of 294' is its own house");
  assert.equal(houseScope({ body: "lok-sabha", fill: "bypoll", loaded: 1, houseTotal: 543 }), null, "a by-election fills vacancies, so '1 of 543' would be false");
  assert.equal(houseScope({ body: "lok-sabha", fill: "general", loaded: 42, houseTotal: 0 }), null);
});

/* ────────────────────────────── the order, held to its sentence ────────────────────────────── */

test("the sentence under the party landscape is the order it is in: assemblies led, then Lok Sabha seats, then assembly seats", () => {
  // The sentence has to say the three things in this order, or this test is reading a different rule than the one it names.
  assert.match(PARTY_RANK_RULE, /assemblies led.*Lok Sabha seats.*assembly seats/);

  const d = open(":memory:");
  try {
    electionsFixture(d, [
      // AAA leads the one assembly. CCC has more assembly seats than EEE, and DDD none.
      { id: "wb-assembly-2021", jurisdiction: "wb", year: 2021, seats: { AAA: 5, CCC: 3, BBB: 1, EEE: 1 } },
      // BBB has the most Lok Sabha seats of the parties that lead nothing, and AAA the fewest of the five that hold any.
      { id: "ls-2024", jurisdiction: "in", year: 2024, kind: "general", house: "pc", seatsIn: "wb", seats: { AAA: 2, BBB: 5, CCC: 1, EEE: 1, DDD: 1 } },
    ]);
    const order = homeView(d, { thisYear: 2026 }).parties.rows.map((r) => r.key);
    // AAA leads an assembly, so it is first although BBB holds more Lok Sabha seats (assemblies led come first). BBB is next on five Lok Sabha seats.
    // CCC, EEE and DDD tie on one Lok Sabha seat, and the assembly seats part them: three, one and none.
    assert.deepEqual(order, ["AAA", "BBB", "CCC", "EEE", "DDD"]);
  } finally {
    d.close();
  }
});

test("the scope line under the title names what each total counted over, and says nothing where there is no total", () => {
  assert.equal(
    seatsLoadedLine({ assemblySeatsHeld: 294, assemblySeatsTotal: 4123, lokSabhaSeatsHeld: 42, lokSabhaSeatsTotal: 543 }),
    "294 of 4,123 assembly seats and 42 of 543 Lok Sabha seats are loaded.",
  );
  assert.equal(
    seatsLoadedLine({ assemblySeatsHeld: 4123, assemblySeatsTotal: 4123, lokSabhaSeatsHeld: 0, lokSabhaSeatsTotal: 0 }),
    "4,123 of 4,123 assembly seats are loaded.",
    "a house with no reference total has no denominator to say, and is left out",
  );
  assert.equal(seatsLoadedLine({ assemblySeatsHeld: 0, assemblySeatsTotal: 0, lokSabhaSeatsHeld: 0, lokSabhaSeatsTotal: 0 }), null);
  for (const w of ["Measured", "Derived", "Complete", "Partial", "Unavailable"]) {
    assert.ok(!(seatsLoadedLine({ assemblySeatsHeld: 1, assemblySeatsTotal: 2, lokSabhaSeatsHeld: 1, lokSabhaSeatsTotal: 2 }) ?? "").includes(w), `${w} is in the scope line`);
  }
});

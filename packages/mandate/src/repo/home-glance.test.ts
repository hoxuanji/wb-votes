// The glance: every jurisdiction with a result in one order that judges none of them, and a chosen state by membership.

import assert from "node:assert/strict";
import test from "node:test";
import { glanceOf, indiaSentence, stateChoice } from "./home-glance.ts";
import type { Standing } from "./elections.ts";
import type { JurisdictionState } from "./coverage.ts";

const st = (id: string, name: string, year: number, leader: string | null, seats: number, of: number): Standing => ({
  jurisdictionId: id,
  jurisdictionName: name,
  electionId: `${id}-${year}`,
  year,
  seatsContested: of,
  leaderKey: leader,
  leaderLabel: leader,
  leaderSeats: seats,
  majority: seats * 2 > of,
});
const js = (id: string, name: string, seats: number | null, kind: "state" | "ut" = "state"): JurisdictionState => ({ id, name, kind, seats, loaded: 0, hasData: false });

const standings = [st("ka", "Karnataka", 2023, "INC", 135, 224), st("wb", "West Bengal", 2026, "BJP", 192, 294), st("kl", "Kerala", 2021, "CPM", 62, 140)];
const house = [st("wb", "West Bengal", 2024, "AITC", 29, 42), st("tn", "Tamil Nadu", 2024, "DMK", 22, 39)];

test("every jurisdiction with a result is a row, whichever house it has one for", () => {
  const g = glanceOf({ standings, houseStandings: house });
  assert.deepEqual(g.map((r) => r.id).sort(), ["ka", "kl", "tn", "wb"]);
  const tn = g.find((r) => r.id === "tn")!;
  assert.equal(tn.assembly, null, "a state with only a Lok Sabha result has no assembly line");
  assert.equal(tn.loksabha?.leader?.label, "DMK");
  const wb = g.find((r) => r.id === "wb")!;
  assert.deepEqual([wb.assembly?.year, wb.assembly?.leader?.label, wb.assembly?.seats, wb.assembly?.of, wb.assembly?.majority], [2026, "BJP", 192, 294, true]);
  assert.equal(wb.loksabha?.of, 42);
});

test("the order is the most recent election first and then by name: never by size or by who governs", () => {
  const g = glanceOf({ standings, houseStandings: house });
  assert.deepEqual(g.map((r) => r.id), ["wb", "tn", "ka", "kl"]);
  // A state of 294 seats is not above one of 140 because it is bigger: the same years, ordered by name.
  const tie = glanceOf({ standings: [st("b", "B State", 2021, "X", 200, 300), st("a", "A State", 2021, "Y", 5, 10)], houseStandings: [] });
  assert.deepEqual(tie.map((r) => r.id), ["a", "b"]);
});

test("a registry with no result has an empty glance", () => {
  assert.deepEqual(glanceOf({ standings: [], houseStandings: [] }), []);
});

test("a chosen state is looked up by membership: loaded, unloaded, or nothing", () => {
  const i = { standings, houseStandings: house, states: [js("wb", "West Bengal", 294), js("gj", "Gujarat", 182), js("py", "Puducherry", 30, "ut")] };
  assert.equal(stateChoice(i, "wb")?.status, "loaded");
  const gj = stateChoice(i, "gj");
  assert.deepEqual(gj, { status: "unloaded", id: "gj", name: "Gujarat", seats: 182, ut: false });
  assert.equal((stateChoice(i, "py") as { ut: boolean }).ut, true);
  for (const bad of ["zz", "'; DROP TABLE election; --", "", "../x", null, undefined]) assert.equal(stateChoice(i, bad), null, String(bad));
});

test("the first sentence is about the country: it names every jurisdiction when few, and counts them when many", () => {
  const one = glanceOf({ standings: [st("wb", "West Bengal", 2026, "BJP", 192, 294)], houseStandings: [] });
  assert.equal(indiaSentence(one, 36), "The registry holds election results for 1 of India's 36 states and territories: West Bengal.");
  const three = glanceOf({ standings, houseStandings: [] });
  assert.equal(indiaSentence(three, 36), "The registry holds election results for 3 of India's 36 states and territories: West Bengal, Karnataka and Kerala.");
  const many = glanceOf({ standings: ["a", "b", "c", "d", "e", "f"].map((k, i) => st(k, k.toUpperCase(), 2015 + i, "X", 1, 2)), houseStandings: [] });
  assert.equal(indiaSentence(many, 36), "The registry holds election results for 6 of India's 36 states and territories, from 2015 to 2020.");
  assert.match(indiaSentence([], 36), /no election result yet for any of India's 36/);
});

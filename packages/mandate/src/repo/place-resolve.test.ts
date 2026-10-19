// The place resolver, on literals. `resolve` is pure, so every rule below is a ten-row array and runs anywhere; the
// loader needs a registry and is built through the real migrations in memory, because the live one cannot show a
// retired name, a house that never voted, or a state whose two houses vote under different epochs.
//
// The cases come from the two suites the SQL resolvers were held to: place-page.test.ts (a duplicated name resolved by
// the district in the path, the path's ancestry must be true, the number form) and constituency.test.ts (one name in
// two bodies is two seats; the pre-body URL asks rather than choosing). What they could not say, because the SQL
// resolvers could not do it, is D25 (the exact name wins, the marker-stripped name applies only when it is empty, a
// tie is many and never LIMIT 1) and D26 (a retired name does not resolve).

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { ensureEpochs } from "../db/epochs.ts";
import { open, openRead } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { loadPlaceIndex, placeIndex, resolve, seatHref, seatTies, tiedVersions } from "./place-resolve.ts";
import type { DistrictRow, Found, Place, PlaceIndex, PlaceQuery, SeatRow, StateRow } from "./place-resolve.ts";
import { constituencyHref, districtHref, stateHref } from "./routes.ts";

// ── a hand-built index ───────────────────────────────────────────────────────────────────────────

const states: StateRow[] = [
  { id: "wb", kind: "state", name: "West Bengal" },
  { id: "ka", kind: "state", name: "Karnataka" },
  { id: "up", kind: "state", name: "Uttar Pradesh" },
  { id: "dl", kind: "ut", name: "Delhi" },
];

const districts: DistrictRow[] = [
  { id: "wb.cooch-behar", stateId: "wb", name: "Cooch Behar" },
  { id: "wb.bankura", stateId: "wb", name: "Bankura" },
  { id: "wb.south-24-parganas", stateId: "wb", name: "South 24 Parganas" },
  { id: "wb.kolkata", stateId: "wb", name: "Kolkata" },
  { id: "ka.bangalore", stateId: "ka", name: "Bangalore" },
  { id: "up.saharanpur", stateId: "up", name: "Saharanpur" },
];

let nextVersion = 100;

/** A current assembly seat unless the override says otherwise. */
function seat(over: Partial<SeatRow> & Pick<SeatRow, "placeId" | "stateId" | "name">): SeatRow {
  return {
    versionId: (nextVersion += 1),
    kind: "ac",
    districtId: null,
    number: null,
    reservation: "general",
    epochId: "delim-2008",
    current: true,
    ...over,
  };
}

const seats: SeatRow[] = [
  // West Bengal. Two Bishnupurs: the source spells the South 24 Parganas one with its reservation.
  seat({ versionId: 1, placeId: "wb.ac.001", stateId: "wb", name: "Mekliganj", number: 1, districtId: "wb.cooch-behar", reservation: "sc" }),
  seat({ versionId: 146, placeId: "wb.ac.146", stateId: "wb", name: "BISHNUPUR(SC)", number: 146, districtId: "wb.south-24-parganas", reservation: "sc" }),
  seat({ versionId: 266, placeId: "wb.ac.266", stateId: "wb", name: "BISHNUPUR", number: 266, districtId: "wb.bankura" }),
  seat({ versionId: 337, placeId: "wb.pc.37", stateId: "wb", name: "Bishnupur", kind: "pc", number: 37, reservation: null }),
  seat({ versionId: 2, placeId: "wb.ac.002", stateId: "wb", name: "Jadavpur", number: 2, districtId: "wb.kolkata" }),
  seat({ versionId: 3, placeId: "wb.ac.003", stateId: "wb", name: "Jaynagar-Majilpur", number: 3, districtId: "wb.south-24-parganas" }),
  seat({ versionId: 4, placeId: "wb.ac.004", stateId: "wb", name: "St. Thomas Mount", number: 4, districtId: "wb.kolkata" }),
  seat({ versionId: 5, placeId: "wb.ac.005", stateId: "wb", name: "মেখলিগঞ্জ", number: 5, districtId: "wb.cooch-behar" }),
  seat({ versionId: 6, placeId: "wb.ac.006", stateId: "wb", name: "কুচবিহার উত্তর", number: 6, districtId: "wb.cooch-behar" }),
  // A minimal pair: they differ only in a vowel sign, so a word split at the signs would make them one name.
  seat({ versionId: 11, placeId: "wb.ac.011", stateId: "wb", name: "কাল", number: 11, districtId: "wb.cooch-behar" }),
  seat({ versionId: 12, placeId: "wb.ac.012", stateId: "wb", name: "কূল", number: 12, districtId: "wb.cooch-behar" }),
  // Two seats of one body with one exact name: a tie the data holds, which no query can break.
  seat({ versionId: 7, placeId: "wb.ac.007", stateId: "wb", name: "Twin", number: 7, districtId: "wb.bankura" }),
  seat({ versionId: 8, placeId: "wb.ac.008", stateId: "wb", name: "Twin", number: 8, districtId: "wb.kolkata" }),
  // Two seats that differ only by the marker: stripped, they tie.
  seat({ versionId: 9, placeId: "wb.ac.009", stateId: "wb", name: "FOO(SC)", number: 9, districtId: "wb.bankura", reservation: "sc" }),
  seat({ versionId: 10, placeId: "wb.ac.010", stateId: "wb", name: "FOO(ST)", number: 10, districtId: "wb.kolkata", reservation: "st" }),
  // Karnataka. ka.ac.214 is a seat NUMBER: it was Badami under one order and is Nanjangud now.
  seat({ versionId: 214, placeId: "ka.ac.214", stateId: "ka", name: "NANJANGUD", number: 214, districtId: "ka.bangalore" }),
  seat({ versionId: 1214, placeId: "ka.ac.214", stateId: "ka", name: "BADAMI", number: 214, epochId: "delim-1976", current: false }),
  // A seat the 2008 order abolished: it exists only as retired versions.
  seat({ versionId: 1300, placeId: "ka.ac.300", stateId: "ka", name: "GONE", number: 300, epochId: "delim-1976", current: false }),
  seat({ versionId: 21, placeId: "ka.ac.021", stateId: "ka", name: "Jayanagar", number: 21, districtId: "ka.bangalore" }),
  seat({ versionId: 22, placeId: "ka.ac.022", stateId: "ka", name: "KHANAPUR(ST)", number: 22, districtId: "ka.bangalore", reservation: "st" }),
  // Uttar Pradesh. Saharanpur is an assembly seat and a Lok Sabha seat; Kairana only the second; Nakur only the first.
  seat({ versionId: 41, placeId: "up.ac.004", stateId: "up", name: "Saharanpur", number: 4, districtId: "up.saharanpur" }),
  seat({ versionId: 441, placeId: "up.pc.001", stateId: "up", name: "Saharanpur", kind: "pc", number: 1, reservation: null }),
  seat({ versionId: 442, placeId: "up.pc.002", stateId: "up", name: "Kairana", kind: "pc", number: 2, reservation: null }),
  seat({ versionId: 42, placeId: "up.ac.005", stateId: "up", name: "Nakur", number: 5, districtId: "up.saharanpur" }),
  // A name two states share: a bare name, which asks every state at once, ties across them.
  seat({ versionId: 43, placeId: "up.ac.006", stateId: "up", name: "Jayanagar", number: 6, districtId: "up.saharanpur" }),
];

/** Deep-frozen, so a resolver that sorts or edits what it was given throws instead of passing. */
const index: PlaceIndex = Object.freeze({
  states: Object.freeze(states.map((s) => Object.freeze(s))),
  districts: Object.freeze(districts.map((d) => Object.freeze(d))),
  seats: Object.freeze(seats.map((s) => Object.freeze(s))),
});

function one(f: Found): Place {
  assert.equal(f.found, "one", `expected one, got ${JSON.stringify(f)}`);
  if (f.found !== "one") throw new Error("unreachable");
  return f.place;
}

function many(f: Found): readonly Place[] {
  assert.equal(f.found, "many", `expected many, got ${JSON.stringify(f)}`);
  if (f.found !== "many") throw new Error("unreachable");
  return f.places;
}

const versionOf = (p: Place): number | null => (p.level === "seat" ? p.versionId : null);

const wb = (name: string, more: { body?: "assembly" | "lok-sabha"; district?: string } = {}): PlaceQuery => ({
  level: "seat",
  state: "wb",
  name,
  ...more,
});

// ── a state or union territory, by its id ────────────────────────────────────────────────────────

test("a state resolves by its id, and the canonical href is built by routes.ts", () => {
  const p = one(resolve(index, { level: "state", id: "wb" }));
  assert.equal(p.level, "state");
  assert.equal(p.href, stateHref("wb"));
  assert.equal(p.href, "/state/wb");
  assert.equal(p.name, "West Bengal");
});

test("a union territory is a state to the resolver: eight of India's thirty-six jurisdictions are", () => {
  const p = one(resolve(index, { level: "state", id: "dl" }));
  assert.equal(p.href, "/state/dl");
  assert.equal(p.level === "state" ? p.kind : null, "ut");
});

test("a state is its id and nothing else: a name, a prefix and an unknown id are none (D27)", () => {
  assert.deepEqual(resolve(index, { level: "state", id: "xx" }), { found: "none" });
  assert.deepEqual(resolve(index, { level: "state", id: "west-bengal" }), { found: "none" });
  assert.deepEqual(resolve(index, { level: "state", id: "w" }), { found: "none" });
  assert.deepEqual(resolve(index, { level: "state", id: "" }), { found: "none" });
});

test("a state's id is matched as written in a URL: case and surrounding space do not matter", () => {
  assert.equal(one(resolve(index, { level: "state", id: " WB " })).href, "/state/wb");
});

// ── a district ───────────────────────────────────────────────────────────────────────────────────

test("a district resolves by its state and its slug, and only under the state that has it", () => {
  const p = one(resolve(index, { level: "district", state: "wb", district: "cooch-behar" }));
  assert.equal(p.href, districtHref("wb.cooch-behar"));
  assert.equal(p.href, "/district/wb/cooch-behar");
  assert.equal(p.level === "district" ? p.id : null, "wb.cooch-behar");
  // the path's ancestry must be true
  assert.deepEqual(resolve(index, { level: "district", state: "ka", district: "cooch-behar" }), { found: "none" });
  assert.deepEqual(resolve(index, { level: "district", state: "wb", district: "bangalore" }), { found: "none" });
  assert.deepEqual(resolve(index, { level: "district", state: "wb", district: "nowhere" }), { found: "none" });
});

test("a district answers to its id's tail, its whole id and its name, as it always did: D27 is about states", () => {
  for (const written of ["cooch-behar", "Cooch-Behar", "wb.cooch-behar", "Cooch Behar", "cooch behar", "coochbehar", "  COOCH BEHAR  "]) {
    const p = one(resolve(index, { level: "district", state: "wb", district: written }));
    assert.equal(p.level === "district" ? p.id : null, "wb.cooch-behar", written);
    assert.equal(p.href, "/district/wb/cooch-behar");
  }
  // still under the state that has it, and a whole id of another state's district is no district of this one
  assert.deepEqual(resolve(index, { level: "district", state: "ka", district: "cooch behar" }), { found: "none" });
  assert.deepEqual(resolve(index, { level: "district", state: "wb", district: "ka.bangalore" }), { found: "none" });
  assert.deepEqual(resolve(index, { level: "district", state: "wb", district: "" }), { found: "none" });
});

test("a district's id comes before its name, and a name two districts share goes to the lower id", () => {
  const twins: PlaceIndex = {
    ...index,
    districts: [
      { id: "wb.aaa", stateId: "wb", name: "Kolkata" },
      { id: "wb.kolkata", stateId: "wb", name: "Kolkata" },
      { id: "wb.x1", stateId: "wb", name: "Twin District" },
      { id: "wb.x2", stateId: "wb", name: "Twin District" },
    ],
  };
  const id = (district: string): string | null => {
    const p = one(resolve(twins, { level: "district", state: "wb", district }));
    return p.level === "district" ? p.id : null;
  };
  assert.equal(id("kolkata"), "wb.kolkata", "the id's tail is read before any name");
  assert.equal(id("twin district"), "wb.x1");
  assert.equal(id("twin-district"), "wb.x1");
  assert.equal(id("twindistrict"), "wb.x1");
});

test("a district is not matched by a seat's name, and a seat is not matched by a district's", () => {
  assert.deepEqual(resolve(index, { level: "district", state: "wb", district: "jadavpur" }), { found: "none" });
  assert.deepEqual(resolve(index, wb("kolkata")), { found: "none" });
  assert.deepEqual(resolve(index, wb("wb")), { found: "none" });
});

// ── a seat by name: place-page.test.ts and constituency.test.ts ──────────────────────────────────

test("a seat resolves by name, with the href routes.ts builds from the seat itself", () => {
  const p = one(resolve(index, wb("mekliganj", { body: "assembly" })));
  assert.equal(versionOf(p), 1);
  assert.equal(p.href, "/constituency/wb/assembly/mekliganj");
  assert.equal(p.href, constituencyHref({ jurisdictionId: "wb", kind: "ac", canonicalName: "Mekliganj" }));
});

test("the place carries its version id in-process, and the href never contains it", () => {
  const p = one(resolve(index, wb("jadavpur")));
  assert.equal(versionOf(p), 2);
  assert.equal(p.level === "seat" ? p.placeId : null, "wb.ac.002");
  assert.doesNotMatch(p.href, /\b2\b/);
});

test("a duplicated name resolves by the district in the path, and the district must be true", () => {
  // place-page.test.ts: Bankura's Bishnupur and South 24 Parganas', whichever has the lower id.
  assert.equal(versionOf(one(resolve(index, wb("bishnupur", { district: "bankura" })))), 266);
  assert.equal(versionOf(one(resolve(index, wb("bishnupur", { district: "south-24-parganas" })))), 146);
  // A name that exists, but not in the named district, is still none.
  assert.deepEqual(resolve(index, wb("bishnupur", { district: "kolkata" })), { found: "none" });
  assert.deepEqual(resolve(index, wb("mekliganj", { district: "nadia" })), { found: "none" });
  assert.deepEqual(resolve(index, wb("nowhere", { district: "cooch-behar" })), { found: "none" });
});

test("a district asserted of a parliamentary seat finds nothing: a Lok Sabha seat has no district", () => {
  assert.deepEqual(resolve(index, wb("bishnupur", { body: "lok-sabha", district: "bankura" })), { found: "none" });
  assert.equal(versionOf(one(resolve(index, wb("bishnupur", { body: "lok-sabha" })))), 337);
});

test("a seat by number is the same seat as the seat by name, and a state's numbers are its own", () => {
  const byNumber = one(resolve(index, { level: "seat", state: "wb", district: "cooch-behar", number: 1 }));
  const byName = one(resolve(index, wb("mekliganj", { district: "cooch-behar" })));
  assert.equal(byNumber.href, byName.href);
  assert.equal(versionOf(byNumber), versionOf(byName));
  assert.deepEqual(resolve(index, { level: "seat", state: "wb", district: "nadia", number: 1 }), { found: "none" });
  assert.deepEqual(resolve(index, { level: "seat", state: "ka", body: "assembly", number: 1 }), { found: "none" });
  assert.deepEqual(resolve(index, { level: "seat", state: "wb", body: "assembly", number: 0 }), { found: "none" });
});

test("a seat is never answered with a different kind of place: a missing seat is none, not its state", () => {
  assert.deepEqual(resolve(index, wb("nowhere")), { found: "none" });
  assert.deepEqual(resolve(index, { level: "seat", state: "xx", name: "mekliganj" }), { found: "none" });
  assert.deepEqual(resolve(index, wb("")), { found: "none" });
  assert.deepEqual(resolve(index, wb("   ")), { found: "none" });
  assert.deepEqual(resolve(index, wb("---")), { found: "none" });
});

// ── one name, two bodies ─────────────────────────────────────────────────────────────────────────

test("one name in two bodies is two seats: the body asked for is the body answered", () => {
  const ac = one(resolve(index, { level: "seat", state: "up", body: "assembly", name: "saharanpur" }));
  const pc = one(resolve(index, { level: "seat", state: "up", body: "lok-sabha", name: "saharanpur" }));
  assert.notEqual(versionOf(ac), versionOf(pc));
  assert.equal(ac.href, "/constituency/up/assembly/saharanpur");
  assert.equal(pc.href, "/constituency/up/lok-sabha/saharanpur");
  assert.equal(ac.level === "seat" ? ac.kind : null, "ac");
  assert.equal(pc.level === "seat" ? pc.kind : null, "pc");
});

test("the pre-body URL asks rather than choosing, and resolves when only one body has the name", () => {
  const both = many(resolve(index, { level: "seat", state: "up", name: "saharanpur" }));
  assert.deepEqual(both.map((p) => (p.level === "seat" ? p.kind : null)), ["ac", "pc"]);
  assert.deepEqual(both.map((p) => p.href), ["/constituency/up/assembly/saharanpur", "/constituency/up/lok-sabha/saharanpur"]);
  // UNAMBIGUOUS: one body only, so the old URL has exactly one destination.
  assert.equal(one(resolve(index, { level: "seat", state: "up", name: "kairana" })).href, "/constituency/up/lok-sabha/kairana");
  assert.equal(one(resolve(index, { level: "seat", state: "up", name: "nakur" })).href, "/constituency/up/assembly/nakur");
  // and a body that does not have it is none, never the other body
  assert.deepEqual(resolve(index, { level: "seat", state: "up", body: "assembly", name: "kairana" }), { found: "none" });
});

test("a name is a seat of the state in the path and no other state's", () => {
  assert.deepEqual(resolve(index, { level: "seat", state: "ka", name: "mekliganj" }), { found: "none" });
  assert.equal(one(resolve(index, { level: "seat", state: "ka", name: "jayanagar" })).href, "/constituency/ka/assembly/jayanagar");
});

// ── D25: the exact name wins, the marker-stripped name only fills an empty tier, a tie is many ───

test("D25: the exact name wins, so a bare name does not also return the seat that only matches without its marker", () => {
  // Bankura's BISHNUPUR is the exact name; South 24 Parganas' BISHNUPUR(SC) matches only with its marker stripped.
  const p = one(resolve(index, wb("bishnupur", { body: "assembly" })));
  assert.equal(versionOf(p), 266);
});

test("D25: the marker-stripped name applies only when no seat has the exact name", () => {
  // Narrowed to the district where nothing is called plain BISHNUPUR, the stripped tier is consulted.
  assert.equal(versionOf(one(resolve(index, wb("bishnupur", { body: "assembly", district: "south-24-parganas" })))), 146);
  // Nothing in Karnataka is called plain KHANAPUR: it resolves to KHANAPUR(ST).
  const p = one(resolve(index, { level: "seat", state: "ka", name: "khanapur" }));
  assert.equal(versionOf(p), 22);
  assert.equal(p.href, "/constituency/ka/assembly/khanapur(st)");
});

test("D25: the name with its marker is the exact name, however a reader writes the marker", () => {
  for (const written of ["bishnupur(sc)", "Bishnupur (SC)", "bishnupur-sc", "BISHNUPUR SC", "bishnupur--sc"]) {
    assert.equal(versionOf(one(resolve(index, wb(written, { body: "assembly" })))), 146, written);
  }
  // The SC seat's own canonical href is one of them, so its link resolves back to it.
  const sc = one(resolve(index, wb("bishnupur(sc)")));
  assert.equal(sc.href, "/constituency/wb/assembly/bishnupur(sc)");
});

test("D25: the name's words joined are the last tier, as old links wrote them, and only when nothing is called that", () => {
  // The SQL squashed both sides of the comparison, so `coochbeharuttar` found "Coochbehar Uttar" and `jaynagarmajilpur`
  // found "Jaynagar-Majilpur"; the words compared one by one do not.
  for (const written of ["jaynagarmajilpur", "JaynagarMajilpur", "jaynagar-majilpur"]) {
    assert.equal(versionOf(one(resolve(index, wb(written)))), 3, written);
  }
  assert.equal(versionOf(one(resolve(index, wb("কুচবিহারউত্তর")))), 6);
  const more: PlaceIndex = {
    ...index,
    seats: [
      ...index.seats,
      seat({ versionId: 900, placeId: "wb.ac.900", stateId: "wb", name: "Jaynagarmajilpur", number: 900, districtId: "wb.kolkata" }),
      seat({ versionId: 901, placeId: "wb.ac.901", stateId: "wb", name: "Dakshin Dinajpur(SC)", number: 901, districtId: "wb.bankura", reservation: "sc" }),
    ],
  };
  // A seat with exactly that name takes it, and the spaced name still finds the one it always found.
  assert.equal(versionOf(one(resolve(more, wb("jaynagarmajilpur")))), 900);
  assert.equal(versionOf(one(resolve(more, wb("jaynagar-majilpur")))), 3);
  // The marker is stripped before the words are joined, and a joined name is no wider than that.
  assert.equal(versionOf(one(resolve(more, wb("dakshindinajpur")))), 901);
  assert.deepEqual(resolve(more, wb("dakshindinajpursc")), { found: "none" });
  assert.deepEqual(resolve(more, wb("jaynagarmaji")), { found: "none" });
  // Joined names can tie like any others, and then the reader is asked.
  const tied: PlaceIndex = {
    ...more,
    seats: [...more.seats, seat({ versionId: 902, placeId: "wb.ac.902", stateId: "wb", name: "Dakshin-Dinajpur", number: 902, districtId: "wb.kolkata" })],
  };
  assert.deepEqual(many(resolve(tied, wb("dakshindinajpur"))).map(versionOf), [901, 902]);
});

test("an exact name is the first tier alone: no marker stripped, no words joined", () => {
  const exact = (name: string, more: { body?: "assembly" | "lok-sabha" } = {}): Found =>
    resolve(index, { level: "seat", state: "wb", name, exact: true, ...more });
  // what the first tier reads is unchanged, spaces, hyphens and case included
  assert.equal(versionOf(one(exact("Jaynagar-Majilpur"))), 3);
  assert.equal(versionOf(one(exact("jaynagar majilpur"))), 3);
  assert.equal(versionOf(one(exact("bishnupur(sc)", { body: "assembly" }))), 146);
  assert.equal(versionOf(one(exact("bishnupur", { body: "lok-sabha" }))), 337);
  // and the fallbacks are not tried: a marker-stripped name, a joined one
  assert.equal(versionOf(one(resolve(index, { level: "seat", state: "ka", name: "khanapur" }))), 22);
  assert.deepEqual(resolve(index, { level: "seat", state: "ka", name: "khanapur", exact: true }), { found: "none" });
  assert.deepEqual(exact("jaynagarmajilpur"), { found: "none" });
  assert.deepEqual(exact("কুচবিহারউত্তর"), { found: "none" });
});

test("D25: a tie is many, in a stable order, and is never cut to the first row", () => {
  const twins = many(resolve(index, wb("twin")));
  assert.deepEqual(twins.map(versionOf), [7, 8]);
  // Two seats of one body that tie on name are addressed by their registry id, which tells them apart: a page that
  // lists them has two links, to two seats, and neither is the page asking which.
  assert.deepEqual(twins.map((p) => p.href), ["/constituency/wb/assembly/wb.ac.007", "/constituency/wb/assembly/wb.ac.008"]);
  // Two seats that tie only after their markers are stripped.
  assert.deepEqual(many(resolve(index, wb("foo"))).map(versionOf), [9, 10]);
  // The same query asked of a reordered index gives the same answer.
  const flipped: PlaceIndex = { ...index, seats: [...index.seats].reverse() };
  assert.deepEqual(many(resolve(flipped, wb("twin"))).map(versionOf), [7, 8]);
  assert.deepEqual(many(resolve(flipped, wb("foo"))).map(versionOf), [9, 10]);
  // A district in the path breaks the tie, because the district is part of what the path asserted.
  assert.equal(versionOf(one(resolve(index, wb("twin", { district: "bankura" })))), 7);
  assert.equal(versionOf(one(resolve(index, wb("twin", { district: "kolkata" })))), 8);
});

test("D25: seats of different bodies are ordered assembly first, then by number", () => {
  const f = many(resolve(index, { level: "seat", state: "wb", name: "bishnupur" }));
  // Exact tier, no body asked: Bankura's BISHNUPUR and the Lok Sabha Bishnupur. The SC seat waits in the second tier.
  assert.deepEqual(f.map(versionOf), [266, 337]);
});

// ── seats that share a name are addressed by their registry id ───────────────────────────────────

const tie = (versionId: number, placeId: string, name: string, over: Partial<SeatRow> = {}) => ({
  versionId,
  placeId,
  stateId: "wb",
  kind: "ac" as const,
  name,
  current: true,
  ...over,
});

test("tiedVersions: the current seats of a state and a body whose name, read as words, is shared by two places", () => {
  const tied = (...rows: ReturnType<typeof tie>[]): number[] => [...tiedVersions(rows)].sort((a, b) => a - b);
  assert.deepEqual(tied(tie(1, "wb.ac.001", "Twin"), tie(2, "wb.ac.002", "TWIN"), tie(3, "wb.ac.003", "Other")), [1, 2]);
  // a name is its words: punctuation and case are not part of a spelling, as they are not for the resolver
  assert.deepEqual(tied(tie(1, "wb.ac.001", "St. Thomas Mount"), tie(2, "wb.ac.002", "St Thomas Mount")), [1, 2]);
  assert.deepEqual(tied(tie(1, "wb.ac.001", "A"), tie(2, "wb.ac.002", "A"), tie(3, "wb.ac.003", "a")), [1, 2, 3]);
  // the marker is part of the name a canonical href carries, so two seats that differ by it are not tied
  assert.deepEqual(tied(tie(1, "wb.ac.001", "FOO(SC)"), tie(2, "wb.ac.002", "FOO(ST)")), []);
  assert.deepEqual(tied(tie(1, "wb.ac.001", "BISHNUPUR"), tie(2, "wb.ac.002", "BISHNUPUR(SC)")), []);
  // another body and another state are other names for the same words
  assert.deepEqual(tied(tie(1, "wb.ac.001", "Twin"), tie(2, "wb.pc.02", "Twin", { kind: "pc" })), []);
  assert.deepEqual(tied(tie(1, "wb.ac.001", "Twin"), tie(2, "ka.ac.002", "Twin", { stateId: "ka" })), []);
  // A retired version is never tied, with another retired version or with a current one: no address is built for it
  // from a tie, because the registry id of a retired version opens the CURRENT seat of that number.
  assert.deepEqual(tied(tie(1, "wb.ac.001", "Twin", { current: false }), tie(2, "wb.ac.002", "Twin", { current: false })), []);
  assert.deepEqual(tied(tie(1, "wb.ac.001", "Twin"), tie(2, "wb.ac.002", "Twin", { current: false })), []);
  assert.deepEqual(
    tied(tie(1, "wb.ac.001", "Twin"), tie(2, "wb.ac.002", "Twin"), tie(3, "wb.ac.003", "Twin", { current: false })),
    [1, 2],
  );
  // one place twice in an epoch is not two seats, and a blank name is no name to share
  assert.deepEqual(tied(tie(1, "wb.ac.001", "Twin"), tie(2, "wb.ac.001", "Twin")), []);
  assert.deepEqual(tied(tie(1, "wb.ac.001", ""), tie(2, "wb.ac.002", " ")), []);
});

test("seatHref: the name's address, or the registry id's for a seat whose name is shared", () => {
  const tied = new Set([7, 50]);
  const twin = { versionId: 7, placeId: "wb.ac.007", stateId: "wb", kind: "ac", name: "Twin" };
  assert.equal(seatHref(tied, twin), "/constituency/wb/assembly/wb.ac.007");
  assert.equal(seatHref(tied, { versionId: 50, placeId: "wb.pc.50", stateId: "wb", kind: "pc", name: "Dual" }), "/constituency/wb/lok-sabha/wb.pc.50");
  // a seat that is not tied is addressed exactly as constituencyHref addresses it, whatever else is
  const plain = { versionId: 1, placeId: "wb.ac.001", stateId: "wb", kind: "ac", name: "Mekliganj" };
  assert.equal(seatHref(tied, plain), constituencyHref({ jurisdictionId: "wb", kind: "ac", canonicalName: "Mekliganj" }));
  assert.equal(seatHref(new Set(), twin), constituencyHref({ jurisdictionId: "wb", kind: "ac", canonicalName: "Twin" }));
});

test("D25: two seats of one body that tie have two addresses, and each opens its own seat", () => {
  const twins = many(resolve(index, wb("twin")));
  assert.equal(new Set(twins.map((p) => p.href)).size, 2, "the entries of a tie are distinct links");
  for (const p of twins) {
    assert.deepEqual(resolve(index, askedBy(p.href)), { found: "one", place: p }, `${p.href} is not its own seat's address`);
  }
  // the district breaks the tie and the seat it finds is addressed as it is when it is asked among its twin
  assert.equal(one(resolve(index, wb("twin", { district: "bankura" }))).href, twins[0]?.href);
  assert.equal(one(resolve(index, wb("twin", { district: "kolkata" }))).href, twins[1]?.href);
  // a body in the id is part of what the path asserted, so the address does not open under the other body
  assert.deepEqual(resolve(index, { level: "seat", state: "wb", body: "lok-sabha", placeId: "wb.ac.007" }), { found: "none" });
});

test("D25: a tie is a tie within a body, and a Lok Sabha pair is addressed by id as an assembly pair is", () => {
  const more: PlaceIndex = {
    ...index,
    seats: [
      ...index.seats,
      seat({ versionId: 950, placeId: "wb.pc.50", stateId: "wb", kind: "pc", name: "Dual", number: 50, reservation: null }),
      seat({ versionId: 951, placeId: "wb.pc.51", stateId: "wb", kind: "pc", name: "Dual", number: 51, reservation: null }),
      seat({ versionId: 952, placeId: "wb.ac.952", stateId: "wb", name: "Dual", number: 952, districtId: "wb.kolkata" }),
    ],
  };
  const pair = many(resolve(more, wb("dual", { body: "lok-sabha" })));
  assert.deepEqual(pair.map((p) => p.href), ["/constituency/wb/lok-sabha/wb.pc.50", "/constituency/wb/lok-sabha/wb.pc.51"]);
  // the assembly seat of the same name is alone in its body: its address is its name's
  assert.equal(one(resolve(more, wb("dual", { body: "assembly" }))).href, "/constituency/wb/assembly/dual");
  // asked in both bodies, the three are many, each with an address that opens it
  const all3 = many(resolve(more, wb("dual")));
  assert.deepEqual(all3.map(versionOf), [952, 950, 951]);
  for (const p of all3) assert.deepEqual(resolve(more, askedBy(p.href)), { found: "one", place: p });
  // a retired pair does not tie anything: only the seats that answer are compared
  const retired: PlaceIndex = {
    ...index,
    seats: [
      ...index.seats,
      seat({ versionId: 960, placeId: "wb.ac.960", stateId: "wb", name: "Gone Twin", number: 960, epochId: "delim-1976", current: false }),
      seat({ versionId: 961, placeId: "wb.ac.961", stateId: "wb", name: "Gone Twin", number: 961, epochId: "delim-1976", current: false }),
    ],
  };
  assert.deepEqual(resolve(retired, wb("gone twin")), { found: "none" });
});

test("D26: a retired pair that shares a name is addressed by its name and not its registry id, which opens another seat", () => {
  // Under delim-2002 Karnataka's seats 214 and 215 were both Foo. The house votes under delim-2008, where 214 is
  // Nanjangud and 215 is Bar, and a registry id answers with the CURRENT seat of that number: linking the retired
  // pair by id would send a reader looking for Foo to Nanjangud.
  const more: PlaceIndex = {
    ...index,
    seats: [
      ...index.seats,
      seat({ versionId: 2214, placeId: "ka.ac.214", stateId: "ka", name: "Foo", number: 214, epochId: "delim-2002", current: false }),
      seat({ versionId: 2215, placeId: "ka.ac.215", stateId: "ka", name: "Foo", number: 215, epochId: "delim-2002", current: false }),
      seat({ versionId: 215, placeId: "ka.ac.215", stateId: "ka", name: "Bar", number: 215, districtId: "ka.bangalore" }),
    ],
  };
  const tied = tiedVersions(more.seats);
  assert.ok(!tied.has(2214) && !tied.has(2215), "a retired pair is not tied");
  for (const v of [2214, 2215]) {
    const href = seatHref(tied, more.seats.find((s) => s.versionId === v) as SeatRow);
    assert.equal(href, constituencyHref({ jurisdictionId: "ka", kind: "ac", canonicalName: "Foo" }));
    assert.deepEqual(resolve(more, askedBy(href)), { found: "none" }, "a retired name is declined, not answered with another seat");
  }
  // And the rule that holds for every version in the index, current or retired, tied or not: its address opens
  // that place's seat or nothing, never a seat of another place.
  for (const s of more.seats) {
    const f = resolve(more, askedBy(seatHref(tied, s)));
    const opened = f.found === "one" ? [f.place] : f.found === "many" ? f.places : [];
    for (const p of opened) assert.equal(p.level === "seat" ? p.placeId : null, s.placeId, `version ${s.versionId} opens ${p.href}`);
  }
  // The pair that does answer is tied as before, and the retired one beside it does not join it.
  const withLive: PlaceIndex = {
    ...more,
    seats: [
      ...more.seats,
      seat({ versionId: 216, placeId: "ka.ac.216", stateId: "ka", name: "Foo", number: 216, districtId: "ka.bangalore" }),
      seat({ versionId: 217, placeId: "ka.ac.217", stateId: "ka", name: "Foo", number: 217, districtId: "ka.bangalore" }),
    ],
  };
  assert.deepEqual([...tiedVersions(withLive.seats)].filter((v) => v > 200).sort(), [216, 217]);
  assert.deepEqual(many(resolve(withLive, { level: "seat", state: "ka", name: "foo" })).map(versionOf), [216, 217]);
});

// ── D26: a retired name does not resolve ─────────────────────────────────────────────────────────

test("D26: a name an earlier delimitation gave a seat number does not resolve, and the current name does", () => {
  // search.ts's own account: ka.ac.214 was Badami under one order and is Nanjangud now. "Was BADAMI" asserted a
  // renaming that never happened, because a place id is a seat NUMBER and not a constituency.
  assert.deepEqual(resolve(index, { level: "seat", state: "ka", name: "badami" }), { found: "none" });
  const p = one(resolve(index, { level: "seat", state: "ka", name: "nanjangud" }));
  assert.equal(versionOf(p), 214, "the current version, not the retired one that shares its place id");
  assert.equal(p.level === "seat" ? p.epochId : null, "delim-2008");
});

test("D26: a seat that no longer exists does not resolve by number or by name", () => {
  assert.deepEqual(resolve(index, { level: "seat", state: "ka", name: "gone" }), { found: "none" });
  assert.deepEqual(resolve(index, { level: "seat", state: "ka", number: 300 }), { found: "none" });
  // and the number that was Badami's is Nanjangud's, whichever way it is asked
  assert.equal(versionOf(one(resolve(index, { level: "seat", state: "ka", number: 214 }))), 214);
});

// ── spelling ─────────────────────────────────────────────────────────────────────────────────────

test("a name matches however a reader or a slug spells its spaces, hyphens and case", () => {
  for (const q of ["Jaynagar-Majilpur", "jaynagar-majilpur", "jaynagar majilpur", "  JAYNAGAR  MAJILPUR ", "jaynagar--majilpur"]) {
    assert.equal(versionOf(one(resolve(index, wb(q)))), 3, q);
  }
  for (const q of ["st. thomas mount", "st-thomas-mount", "St Thomas Mount"]) {
    assert.equal(versionOf(one(resolve(index, wb(q)))), 4, q);
  }
  // but a different word is a different name
  assert.deepEqual(resolve(index, wb("jaynagar")), { found: "none" });
  assert.deepEqual(resolve(index, wb("majilpur")), { found: "none" });
});

test("a name in Bengali is not split at its vowel signs, and matches itself", () => {
  assert.equal(versionOf(one(resolve(index, wb("মেখলিগঞ্জ")))), 5);
  assert.equal(versionOf(one(resolve(index, wb("কুচবিহার-উত্তর")))), 6);
  assert.equal(versionOf(one(resolve(index, wb("কুচবিহার উত্তর")))), 6);
  assert.deepEqual(resolve(index, wb("কুচবিহার")), { found: "none" });
  assert.equal(versionOf(one(resolve(index, wb("কাল")))), 11);
  assert.equal(versionOf(one(resolve(index, wb("কূল")))), 12);
});

const bodyOf = (s: SeatRow): "assembly" | "lok-sabha" => (s.kind === "pc" ? "lok-sabha" : "assembly");

/** What a route does with the last segment of a seat's address: a registry id is asked as one, anything else as a name. */
function askedBy(href: string): PlaceQuery {
  const [, , state, body, segment] = href.split("/") as string[];
  const written = decodeURIComponent(segment as string);
  const scope = { level: "seat", state: state as string, body: body === "lok-sabha" ? "lok-sabha" : "assembly" } as const;
  return /^[^.\s]+\.(?:ac|pc)\.\d+$/.test(written) ? { ...scope, placeId: written } : { ...scope, name: written };
}

test("every current seat's own canonical href resolves back to that seat and to no other", () => {
  // The round trip a link relies on: take the href the resolver gave the seat, read its last segment as a route would,
  // ask again. An address names one seat, which for two seats that share a name is why it is not their name.
  for (const s of seats.filter((x) => x.current)) {
    const first = resolve(index, { level: "seat", placeId: s.placeId, state: s.stateId, body: bodyOf(s) });
    const href = one(first).href;
    const hits = resolve(index, askedBy(href));
    assert.deepEqual(hits, { found: "one", place: one(first) }, `${href} did not resolve back to version ${s.versionId}`);
  }
});


test("resolve does not edit the index it was given, and the same question gets the same answer", () => {
  const q = wb("twin");
  assert.deepEqual(resolve(index, q), resolve(index, q));
  // `index` is deep-frozen above: an in-place sort of `seats` would already have thrown.
  assert.equal(index.seats.length, seats.length);
});

// ── the loader, on a registry built through the real migrations ──────────────────────────────────

const NOW = "2026-08-12T00:00:00.000Z";

type Spec = {
  v: number;
  place: string;
  j: string;
  kind: "ac" | "pc";
  epoch: string;
  name: string;
  number: number;
  district?: string | null;
  /** The place row's own parent, which is the state unless the case is about a parent that is something else. */
  parent?: string;
  reservation?: "general" | "sc" | "st" | null;
};

/**
 * West Bengal with a district and two Bishnupurs; Karnataka, where seat 214 was Badami and is Nanjangud; Assam,
 * whose assembly votes on delim-2008 while its Lok Sabha seats vote on delim-2023-as; and Goa, which has seats and
 * no election at all.
 */
function fixture(): DatabaseSync {
  const d = open(":memory:");
  migrate(d, NOW);
  d.exec(`
    INSERT INTO place (id, kind, canonical_name) VALUES ('in', 'nation', 'India');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('wb', 'state', 'West Bengal', 'in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('ka', 'state', 'Karnataka', 'in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('as', 'state', 'Assam', 'in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('ga', 'state', 'Goa', 'in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('dl', 'ut', 'Delhi', 'in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('wb.bankura', 'district', 'Bankura', 'wb');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('wb.cooch-behar', 'district', 'Cooch Behar', 'wb');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('ka.bangalore', 'district', 'Bangalore', 'ka');
  `);
  ensureEpochs(d, ["delim-1976", "delim-2008", "delim-2023-as"]);
  const seats: Spec[] = [
    { v: 1, place: "wb.ac.001", j: "wb", kind: "ac", epoch: "delim-2008", name: "Mekliganj", number: 1, district: "wb.cooch-behar", reservation: "sc" },
    { v: 2, place: "wb.ac.266", j: "wb", kind: "ac", epoch: "delim-2008", name: "BISHNUPUR", number: 266, district: "wb.bankura" },
    // No district on the version: the place's own parent is the district, as getPlaceBrief reads it.
    { v: 3, place: "wb.ac.267", j: "wb", kind: "ac", epoch: "delim-2008", name: "BISHNUPUR(SC)", number: 267, district: null, parent: "wb.bankura", reservation: "sc" },
    // A parliamentary seat whose place row happens to sit under a district: the fallback is for assembly seats only.
    { v: 4, place: "wb.pc.37", j: "wb", kind: "pc", epoch: "delim-2008", name: "Bishnupur", number: 37, parent: "wb.bankura", reservation: null },
    { v: 10, place: "ka.ac.214", j: "ka", kind: "ac", epoch: "delim-1976", name: "BADAMI", number: 214, district: "ka.bangalore" },
    { v: 11, place: "ka.ac.214", j: "ka", kind: "ac", epoch: "delim-2008", name: "NANJANGUD", number: 214, district: "ka.bangalore" },
    { v: 12, place: "ka.ac.300", j: "ka", kind: "ac", epoch: "delim-1976", name: "GONE", number: 300, district: "ka.bangalore" },
    { v: 20, place: "as.ac.001", j: "as", kind: "ac", epoch: "delim-2008", name: "Dibrugarh", number: 1 },
    { v: 21, place: "as.pc.001", j: "as", kind: "pc", epoch: "delim-2008", name: "Dibrugarh", number: 1, reservation: null },
    { v: 22, place: "as.pc.001", j: "as", kind: "pc", epoch: "delim-2023-as", name: "Dibrugarh", number: 1, reservation: null },
    { v: 30, place: "ga.ac.001", j: "ga", kind: "ac", epoch: "delim-2008", name: "Mapusa", number: 1 },
  ];
  const insertPlace = d.prepare("INSERT OR IGNORE INTO place (id, kind, canonical_name, parent_id) VALUES (?, ?, ?, ?)");
  const insertVersion = d.prepare(
    `INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, district_place_id, reservation)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const s of seats) {
    insertPlace.run(s.place, s.kind, s.name, s.parent ?? s.j);
    insertVersion.run(s.v, s.place, s.j, s.kind, s.epoch, s.number, s.name, s.district ?? null, s.reservation === undefined ? "general" : s.reservation);
  }
  const election = d.prepare(
    `INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, polling_month, occurrence)
     VALUES (?, ?, ?, ?, ?, ?, 'declared', ?, ?, ?, 1)`,
  );
  const contest = d.prepare("INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES (?, ?, ?, 'declared')");
  election.run("wb-assembly-2021", "assembly", "state", "wb", "delim-2008", "WB 2021", "ac", 2021, 4);
  election.run("ka-assembly-2018", "assembly", "state", "ka", "delim-2008", "KA 2018", "ac", 2018, 5);
  election.run("as-assembly-2021", "assembly", "state", "as", "delim-2008", "AS 2021", "ac", 2021, 4);
  election.run("ls-2019", "general", "union", "in", "delim-2008", "LS 2019", "pc", 2019, 4);
  election.run("ls-2024", "general", "union", "in", "delim-2023-as", "LS 2024", "pc", 2024, 4);
  for (const [e, v] of [
    ["wb-assembly-2021", 1], ["wb-assembly-2021", 2], ["wb-assembly-2021", 3],
    ["ka-assembly-2018", 11], ["as-assembly-2021", 20],
    ["ls-2019", 4], ["ls-2019", 21],
    ["ls-2024", 4], ["ls-2024", 22],
  ] as const) {
    contest.run(`${e}:${v}`, e, v);
  }
  return d;
}

test("the loader reads every state, district and seat version, and marks the ones that are current", () => {
  const d = fixture();
  try {
    const ix = loadPlaceIndex(d);
    assert.deepEqual(
      ix.states,
      [
        { id: "as", kind: "state", name: "Assam" },
        { id: "dl", kind: "ut", name: "Delhi" },
        { id: "ga", kind: "state", name: "Goa" },
        { id: "ka", kind: "state", name: "Karnataka" },
        { id: "wb", kind: "state", name: "West Bengal" },
      ],
    );
    assert.deepEqual(
      ix.districts,
      [
        { id: "ka.bangalore", stateId: "ka", name: "Bangalore" },
        { id: "wb.bankura", stateId: "wb", name: "Bankura" },
        { id: "wb.cooch-behar", stateId: "wb", name: "Cooch Behar" },
      ],
    );
    assert.equal(ix.seats.length, 11, "retired versions are in the index too: they are what the resolver declines");
    const by = new Map(ix.seats.map((s) => [s.versionId, s]));
    assert.deepEqual(by.get(1), {
      versionId: 1, placeId: "wb.ac.001", stateId: "wb", kind: "ac", name: "Mekliganj", number: 1,
      reservation: "sc", epochId: "delim-2008", districtId: "wb.cooch-behar", current: true,
    });
    assert.equal(by.get(4)?.districtId, null, "a parliamentary seat has no district");
    assert.equal(by.get(3)?.districtId, "wb.bankura", "the place's own parent stands in for a version with none");
    assert.equal(by.get(20)?.districtId, null, "a parent that is a state is not a district");
  } finally {
    d.close();
  }
});

test("the loader: a seat is current when its epoch is the one its house votes under, not the newest order", () => {
  const d = fixture();
  try {
    const cur = new Map(loadPlaceIndex(d).seats.map((s) => [s.versionId, s.current]));
    // Karnataka: the 2008 version votes; the 1976 versions are retired, the abolished seat with them.
    assert.deepEqual([cur.get(10), cur.get(11), cur.get(12)], [false, true, false]);
    // Assam: its assembly still votes on delim-2008, so that stays current although a later order is in force
    // there; its Lok Sabha seats voted on delim-2023-as, so the 2008 version of the same seat is retired.
    assert.deepEqual([cur.get(20), cur.get(21), cur.get(22)], [true, false, true]);
  } finally {
    d.close();
  }
});

test("the loader: a house that has never held a full-house election has no current seat", () => {
  // Goa has a seat and no election. Nothing says which order it votes under, so nothing is current: recorded here
  // because the old resolvers answered it, and it is the loader's rule to revisit, not the resolver's.
  const d = fixture();
  try {
    const ix = loadPlaceIndex(d);
    assert.equal(ix.seats.find((s) => s.stateId === "ga")?.current, false);
    assert.deepEqual(resolve(ix, { level: "seat", state: "ga", name: "mapusa" }), { found: "none" });
  } finally {
    d.close();
  }
});

test("the resolver over a loaded index answers the questions the fixtures above ask of literals", () => {
  const d = fixture();
  try {
    const ix = loadPlaceIndex(d);
    // D25 over real rows: the exact BISHNUPUR, then the Lok Sabha one beside it; the SC seat by its own name.
    assert.deepEqual(
      many(resolve(ix, { level: "seat", state: "wb", name: "bishnupur" })).map(versionOf),
      [2, 4],
    );
    assert.equal(versionOf(one(resolve(ix, { level: "seat", state: "wb", body: "assembly", name: "bishnupur-sc" }))), 3);
    assert.equal(
      versionOf(one(resolve(ix, { level: "seat", state: "wb", body: "assembly", district: "bankura", name: "bishnupur(sc)" }))),
      3,
    );
    // D26 over real rows.
    assert.deepEqual(resolve(ix, { level: "seat", state: "ka", name: "badami" }), { found: "none" });
    assert.equal(versionOf(one(resolve(ix, { level: "seat", state: "ka", name: "nanjangud" }))), 11);
    // Assam's two houses, each on its own epoch.
    assert.equal(versionOf(one(resolve(ix, { level: "seat", state: "as", body: "assembly", name: "dibrugarh" }))), 20);
    assert.equal(versionOf(one(resolve(ix, { level: "seat", state: "as", body: "lok-sabha", name: "dibrugarh" }))), 22);
    assert.equal(one(resolve(ix, { level: "state", id: "dl" })).href, "/state/dl");
    assert.equal(one(resolve(ix, { level: "district", state: "wb", district: "bankura" })).href, "/district/wb/bankura");
  } finally {
    d.close();
  }
});

test("seatTies: the ties the index finds, read from the seat versions alone", () => {
  const d = fixture();
  try {
    // a second Bishnupur in the assembly, beside Bankura's, under another district
    d.exec(`
      INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('wb.ac.268', 'ac', 'Bishnupur', 'wb.cooch-behar');
      INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, district_place_id, reservation)
        VALUES (5, 'wb.ac.268', 'wb', 'ac', 'delim-2008', 268, 'Bishnupur', 'wb.cooch-behar', 'general');
      INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES ('wb-assembly-2021:5', 'wb-assembly-2021', 5, 'declared');
    `);
    const ix = loadPlaceIndex(d);
    assert.deepEqual([...seatTies(d)], [2, 5]);
    assert.deepEqual([...tiedVersions(ix.seats)], [2, 5], "the index and the registry agree on which seats are tied");
    assert.deepEqual(
      many(resolve(ix, { level: "seat", state: "wb", body: "assembly", name: "bishnupur" })).map((p) => p.href),
      ["/constituency/wb/assembly/wb.ac.266", "/constituency/wb/assembly/wb.ac.268"],
    );
    // and for every current seat, the address a page builds from the registry is the address the resolver gives it
    const ties = seatTies(d);
    for (const s of ix.seats.filter((x) => x.current)) {
      const f = resolve(ix, { level: "seat", placeId: s.placeId, state: s.stateId, body: bodyOf(s) });
      assert.equal(seatHref(ties, s), one(f).href, s.placeId);
    }
  } finally {
    d.close();
  }
});

test("seatTies: a retired pair that shares a name is not tied, a current pair is", () => {
  const d = fixture();
  try {
    d.exec(`
      INSERT INTO place (id, kind, canonical_name, parent_id) VALUES
        ('ka.ac.301', 'ac', 'Old Twin', 'ka'), ('ka.ac.302', 'ac', 'Old Twin', 'ka'),
        ('ka.ac.303', 'ac', 'Twin', 'ka'), ('ka.ac.304', 'ac', 'Twin', 'ka');
      INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, district_place_id, reservation)
        VALUES (50, 'ka.ac.301', 'ka', 'ac', 'delim-1976', 301, 'Old Twin', 'ka.bangalore', 'general'),
               (51, 'ka.ac.302', 'ka', 'ac', 'delim-1976', 302, 'Old Twin', 'ka.bangalore', 'general'),
               (52, 'ka.ac.303', 'ka', 'ac', 'delim-2008', 303, 'Twin', 'ka.bangalore', 'general'),
               (53, 'ka.ac.304', 'ka', 'ac', 'delim-2008', 304, 'Twin', 'ka.bangalore', 'general');
    `);
    const ix = loadPlaceIndex(d);
    const ties = seatTies(d);
    assert.deepEqual([...ties], [52, 53], "the retired pair is left out");
    assert.deepEqual([...tiedVersions(ix.seats)], [52, 53], "the index and the registry agree");
    // the retired pair is linked by its name, which a retired name does not answer, and not by an id that would
    // open the current seat of that number
    const old = ix.seats.find((s) => s.versionId === 50) as SeatRow;
    assert.equal(seatHref(ties, old), constituencyHref({ jurisdictionId: "ka", kind: "ac", canonicalName: "Old Twin" }));
    assert.deepEqual(resolve(ix, askedBy(seatHref(ties, old))), { found: "none" });
  } finally {
    d.close();
  }
});

test("seatTies on a registry without voting_epoch: no seat is current, so none is tied and nothing throws", () => {
  // A registry that predates migration 017 cannot say which seats answer, and the resolver cannot be built on it. A
  // page that only links seats still renders there, with every link a seat's name, as it was before any seat was
  // addressed by id.
  const d = fixture();
  try {
    d.exec(`
      INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('wb.ac.268', 'ac', 'Bishnupur', 'wb.cooch-behar');
      INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, district_place_id, reservation)
        VALUES (5, 'wb.ac.268', 'wb', 'ac', 'delim-2008', 268, 'Bishnupur', 'wb.cooch-behar', 'general');
    `);
    assert.deepEqual([...seatTies(d)], [2, 5], "with the view, the two Bishnupurs are tied");
  } finally {
    d.close();
  }
  const bare = fixture();
  try {
    bare.exec(`
      INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('wb.ac.268', 'ac', 'Bishnupur', 'wb.cooch-behar');
      INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, district_place_id, reservation)
        VALUES (5, 'wb.ac.268', 'wb', 'ac', 'delim-2008', 268, 'Bishnupur', 'wb.cooch-behar', 'general');
      DROP VIEW voting_epoch;
    `);
    assert.deepEqual([...seatTies(bare)], []);
    assert.throws(() => loadPlaceIndex(bare), { name: "RegistryUnavailableError" });
  } finally {
    bare.close();
  }
});

test("seatTies is kept while the registry file stands and read again when it is written to", () => {
  const path = registryFile("Mekliganj");
  const tiesAt = (): ReadonlySet<number> => {
    const d = openRead(path);
    try {
      return seatTies(d);
    } finally {
      d.close();
    }
  };
  const first = tiesAt();
  assert.equal(tiesAt(), first);
  assert.deepEqual([...first], []);
  const w = open(path);
  w.exec(`
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('wb.ac.002','ac','Mekliganj','wb');
    INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name)
      VALUES (2,'wb.ac.002','wb','ac','delim-2008',2,'Mekliganj');
  `);
  w.close();
  assert.deepEqual([...tiesAt()], [1, 2], "a write is seen by the next request, not answered from the old copy");
});

// ── a seat with no state: the v1 API's two forms ─────────────────────────────────────────────────

test("a seat by its registry id keeps what the path asserted: its state, its body and its district", () => {
  const byId = (placeId: string, more: { state?: string; body?: "assembly" | "lok-sabha"; district?: string } = {}): Found =>
    resolve(index, { level: "seat", placeId, ...more } as PlaceQuery);
  assert.equal(versionOf(one(byId("wb.ac.001", { state: "wb", body: "assembly" }))), 1);
  assert.equal(versionOf(one(byId("wb.ac.001", { state: "wb" }))), 1);
  assert.equal(versionOf(one(byId("wb.ac.001", { state: "wb", district: "cooch-behar" }))), 1);
  assert.equal(versionOf(one(byId("wb.pc.37", { state: "wb", body: "lok-sabha" }))), 337);
  // the other body, the other state, the other district: none, and never the seat the id would otherwise name
  assert.deepEqual(byId("wb.ac.001", { state: "wb", body: "lok-sabha" }), { found: "none" });
  assert.deepEqual(byId("wb.pc.37", { state: "wb", body: "assembly" }), { found: "none" });
  assert.deepEqual(byId("wb.ac.001", { state: "ka" }), { found: "none" });
  assert.deepEqual(byId("wb.ac.001", { state: "wb", district: "nadia" }), { found: "none" });
  // a Lok Sabha seat has no district, so one asked under a district is none
  assert.deepEqual(byId("wb.pc.37", { state: "wb", district: "bankura" }), { found: "none" });
  // and a retired version is no more answerable by its id when the path asserts a state
  assert.deepEqual(byId("ka.ac.300", { state: "ka" }), { found: "none" });
});

test("a seat by the registry's own id is its current version, and a retired or unknown id is none", () => {
  const p = one(resolve(index, { level: "seat", placeId: "ka.ac.214" }));
  assert.equal(versionOf(p), 214, "the current version, not the retired one that shares its place id");
  assert.equal(p.href, "/constituency/ka/assembly/nanjangud");
  assert.equal(versionOf(one(resolve(index, { level: "seat", placeId: "wb.pc.37" }))), 337);
  // A seat that only exists as retired versions, a place that is not a seat, and an id as the registry does not spell it.
  assert.deepEqual(resolve(index, { level: "seat", placeId: "ka.ac.300" }), { found: "none" });
  assert.deepEqual(resolve(index, { level: "seat", placeId: "wb.cooch-behar" }), { found: "none" });
  assert.deepEqual(resolve(index, { level: "seat", placeId: "KA.AC.214" }), { found: "none" });
  assert.deepEqual(resolve(index, { level: "seat", placeId: "" }), { found: "none" });
});

test("a bare name asks every state: one seat is one, a name two states share is many, and a body narrows it", () => {
  assert.equal(versionOf(one(resolve(index, { level: "seat", name: "mekliganj" }))), 1);
  assert.deepEqual(many(resolve(index, { level: "seat", name: "jayanagar" })).map(versionOf), [43, 21]);
  assert.deepEqual(many(resolve(index, { level: "seat", name: "saharanpur" })).map(versionOf), [41, 441]);
  assert.equal(versionOf(one(resolve(index, { level: "seat", name: "saharanpur", body: "lok-sabha" }))), 441);
  assert.deepEqual(resolve(index, { level: "seat", name: "jayanagar", body: "lok-sabha" }), { found: "none" });
  // D25 holds across states as it does inside one: the exact name first, the marker-stripped name only when empty.
  assert.equal(versionOf(one(resolve(index, { level: "seat", name: "khanapur" }))), 22);
  // and a retired name is none in every state
  assert.deepEqual(resolve(index, { level: "seat", name: "badami" }), { found: "none" });
});

// ── the index, kept ──────────────────────────────────────────────────────────────────────────────

/** A registry file of one state and one seat, with the contest that makes the seat current. */
function registryFile(seatName: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "mandate-placeindex-")), "registry.db");
  const d = open(path);
  migrate(d, NOW);
  d.exec(`
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('delim-2008','Delimitation 2008','2008-02-19');
    INSERT INTO place (id, kind, canonical_name) VALUES ('wb','state','West Bengal');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('wb.ac.001','ac','${seatName}','wb');
    INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name)
      VALUES (1,'wb.ac.001','wb','ac','delim-2008',1,'${seatName}');
    INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
      VALUES ('wb-assembly-2021','assembly','state','wb','delim-2008','WB 2021','declared','ac',2021,1);
    INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES ('wb-assembly-2021:1','wb-assembly-2021',1,'declared');
  `);
  d.close();
  return path;
}

/** The versions a name resolves to in the registry at `path`, read through a connection of its own, as a request does. */
function versionsNamed(path: string, name: string): number[] {
  const d = openRead(path);
  try {
    const f = resolve(placeIndex(d), { level: "seat", name });
    const versions = f.found === "one" ? [f.place] : f.found === "many" ? f.places : [];
    return versions.flatMap((p) => (p.level === "seat" ? [p.versionId] : []));
  } finally {
    d.close();
  }
}

test("placeIndex reads a registry once and answers every later request from what it read", () => {
  const path = registryFile("Mekliganj");
  const request = (): PlaceIndex => {
    const d = openRead(path);
    try {
      return placeIndex(d);
    } finally {
      d.close();
    }
  };
  // Requests one after another, each opening and closing its own connection, as a server's do.
  const first = request();
  assert.equal(request(), first);
  assert.equal(request(), first);
  // And two in flight at once. The first to read leaves an empty WAL behind while the other is still open, and that
  // is not a write: the second must be answered from what the first read.
  const other = registryFile("Barasat");
  const a = openRead(other);
  const b = openRead(other);
  try {
    const ia = placeIndex(a);
    assert.notEqual(ia, first, "a different registry is a different index");
    assert.equal(placeIndex(b), ia);
  } finally {
    a.close();
    b.close();
  }
});

test("placeIndex reads the registry again when it has been written to, and never answers from a stale copy", () => {
  const path = registryFile("Mekliganj");
  assert.deepEqual(versionsNamed(path, "mekliganj"), [1]);
  assert.deepEqual(versionsNamed(path, "jadavpur"), []);

  // A seat is added while the process runs, as an ingest does to a registry a server is reading.
  const w = open(path);
  w.exec(`
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('wb.ac.002','ac','Jadavpur','wb');
    INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name)
      VALUES (2,'wb.ac.002','wb','ac','delim-2008',2,'Jadavpur');
  `);
  w.close();
  assert.deepEqual(versionsNamed(path, "jadavpur"), [2]);

  // And a registry file replaced by another is read afresh, not answered with the first one's seats.
  const other = registryFile("Barasat");
  assert.deepEqual(versionsNamed(other, "barasat"), [1]);
  assert.deepEqual(versionsNamed(other, "mekliganj"), []);
  assert.deepEqual(versionsNamed(path, "mekliganj"), [1]);
});

test("placeIndex keeps nothing for a registry that has no file, because nothing says when it changes", () => {
  const d = fixture();
  try {
    assert.notEqual(placeIndex(d), placeIndex(d));
    assert.deepEqual(placeIndex(d), placeIndex(d));
  } finally {
    d.close();
  }
});

test("the loader's index is plain data: it survives a JSON round trip and resolves the same", () => {
  const d = fixture();
  try {
    const ix = loadPlaceIndex(d);
    const copy = JSON.parse(JSON.stringify(ix)) as PlaceIndex;
    const q: PlaceQuery = { level: "seat", state: "wb", name: "bishnupur" };
    assert.deepEqual(resolve(copy, q), resolve(ix, q));
  } finally {
    d.close();
  }
});

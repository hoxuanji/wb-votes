// The place resolver, on literals. `resolve` is pure, so every rule below is a ten-row array and runs anywhere; the
// loader needs a registry and is built through the real migrations in memory, because the live one cannot show a
// retired name, a house that never voted, or a state whose two houses vote under different epochs.
//
// The cases come from the two suites the SQL resolvers answer to: place-page.test.ts (a duplicated name resolved by
// the district in the path, the path's ancestry must be true, the number form) and constituency.test.ts (one name in
// two bodies is two seats; the pre-body URL asks rather than choosing). What they could not say, because the SQL
// resolvers could not do it, is D25 (the exact name wins, the marker-stripped name applies only when it is empty, a
// tie is many and never LIMIT 1) and D26 (a retired name does not resolve).

import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { ensureEpochs } from "../db/epochs.ts";
import { open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { loadPlaceIndex, resolve } from "./place-resolve.ts";
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

test("D25: a tie is many, in a stable order, and is never cut to the first row", () => {
  const twins = many(resolve(index, wb("twin")));
  assert.deepEqual(twins.map(versionOf), [7, 8]);
  // RECORDED, NOT SETTLED: two seats of one body that tie on name have one canonical href, because the URL carries
  // the state, the body and the name and nothing that tells them apart. A page that lists them has no distinct link.
  assert.equal(twins[0]?.href, twins[1]?.href);
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

test("every current seat's own canonical href resolves back to it", () => {
  // The round trip a link relies on: build the href from the seat, read the name segment as a route would, ask again.
  for (const s of seats.filter((x) => x.current)) {
    const href = constituencyHref({ jurisdictionId: s.stateId, kind: s.kind, canonicalName: s.name });
    const [, , state, body, name] = href.split("/") as string[];
    const f = resolve(index, {
      level: "seat",
      state: state as string,
      body: body === "lok-sabha" ? "lok-sabha" : "assembly",
      name: decodeURIComponent(name as string),
    });
    const hits = f.found === "one" ? [f.place] : f.found === "many" ? f.places : [];
    assert.ok(
      hits.some((p) => versionOf(p) === s.versionId),
      `${href} did not resolve back to version ${s.versionId}: ${JSON.stringify(f)}`,
    );
    assert.ok(hits.every((p) => p.href === href), `${href} resolved to a different address`);
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

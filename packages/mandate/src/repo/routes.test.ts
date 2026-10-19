// routes.ts: the shape of every URL the product hands a reader, and that each one comes back to what it was
// built from.
//
// The builders are pure, so their shapes are pinned literally. The round trips are the point, though: a link
// that is well-formed and resolves to nothing, or to a neighbour, passes any test that only looks at the string.
// So each href is read back the way a request reads it, through `resolvePlace` and `placeView`, over a registry
// built here. That keeps them out of the registry-gated tests: they run on a bare checkout.

import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { placeView, resolvePlace } from "./place-page.ts";
import type { PlaceQuery } from "./place-resolve.ts";
import {
  asBody,
  bodyOfKind,
  constituencyHref,
  constituencyIdHref,
  coverageHref,
  districtHref,
  electionHref,
  kindOfBody,
  personHref,
  slugOf,
  stateHref,
} from "./routes.ts";
import type { readRegistry } from "./session.ts";

// ── the shapes ───────────────────────────────────────────────────────────────────────────────────

test("slugOf: trimmed, lower-cased, and one hyphen between words", () => {
  assert.equal(slugOf("Cooch Behar Uttar"), "cooch-behar-uttar");
  assert.equal(slugOf("  Mekliganj "), "mekliganj");
  assert.equal(slugOf("Dum   Dum"), "dum-dum");
  assert.equal(slugOf("Jaynagar-Majilpur"), "jaynagar-majilpur");
});

test("each builder emits one path shape", () => {
  assert.equal(stateHref("wb"), "/state/wb");
  assert.equal(districtHref("wb.cooch-behar"), "/district/wb/cooch-behar");
  assert.equal(
    constituencyHref({ jurisdictionId: "wb", kind: "ac", canonicalName: "Mekliganj" }),
    "/constituency/wb/assembly/mekliganj",
  );
  assert.equal(
    constituencyHref({ jurisdictionId: "up", kind: "pc", canonicalName: "Saharanpur" }),
    "/constituency/up/lok-sabha/saharanpur",
  );
  assert.equal(electionHref("ka-assembly-2023"), "/election/ka-assembly-2023");
  assert.equal(personHref("md-salim"), "/p/md-salim");
  assert.equal(coverageHref("ls-2024"), "/coverage?election=ls-2024#election");
});

test("districtHref: a district id with no state in it falls back to the state route, never `/district//x`", () => {
  assert.equal(districtHref("cooch-behar"), "/state/cooch-behar");
});

test("constituencyHref: the body in the path is the seat's kind, and a seat it cannot place is the front page", () => {
  const seat = { jurisdictionId: "wb", canonicalName: "Bankura" };
  assert.equal(constituencyHref({ ...seat, kind: "ac" }), "/constituency/wb/assembly/bankura");
  assert.equal(constituencyHref({ ...seat, kind: "pc" }), "/constituency/wb/lok-sabha/bankura");
  // Anything but 'pc' is an assembly seat, as bodyOfKind says.
  assert.equal(constituencyHref({ ...seat, kind: "district" }), "/constituency/wb/assembly/bankura");
  assert.equal(constituencyHref({ ...seat, jurisdictionId: null, kind: "ac" }), "/");
  assert.equal(constituencyHref({ ...seat, jurisdictionId: "", kind: "ac" }), "/");
  assert.equal(constituencyHref({ ...seat, canonicalName: "", kind: "ac" }), "/");
});

test("constituencyIdHref: the same route with the registry id where the name goes, and the body still in the path", () => {
  assert.equal(
    constituencyIdHref({ jurisdictionId: "wb", kind: "ac", placeId: "wb.ac.266" }),
    "/constituency/wb/assembly/wb.ac.266",
  );
  assert.equal(
    constituencyIdHref({ jurisdictionId: "wb", kind: "pc", placeId: "wb.pc.37" }),
    "/constituency/wb/lok-sabha/wb.pc.37",
  );
});

test("a body is spelt `assembly` or `lok-sabha` in a URL and `ac` or `pc` in the registry, and nothing between", () => {
  for (const [body, kind] of [["assembly", "ac"], ["lok-sabha", "pc"]] as const) {
    assert.equal(kindOfBody(body), kind);
    assert.equal(bodyOfKind(kind), body);
    assert.equal(asBody(body), body);
  }
  // The registry's spelling is not a URL body, and a near-miss is not normalised into one.
  for (const near of ["ac", "pc", "ls", "parliament", "Assembly", "lok_sabha", "", undefined]) {
    assert.equal(asBody(near), null, `${near} must not be a body`);
  }
});

test("a reservation marker stays in the slug as the source wrote it, and both spellings of it read back", async () => {
  // The source appends the marker to the name with no space: 'BISHNUPUR(SC)'. The slug keeps it, lower-cased,
  // with the parentheses as they are; the matching that strips the marker is the resolver's, not the link's.
  assert.equal(
    constituencyHref({ jurisdictionId: "wb", kind: "ac", canonicalName: "BISHNUPUR(SC)" }),
    "/constituency/wb/assembly/bishnupur(sc)",
  );
  // A spaced marker is a second word like any other.
  assert.equal(
    constituencyHref({ jurisdictionId: "wb", kind: "ac", canonicalName: "Bishnupur (SC)" }),
    "/constituency/wb/assembly/bishnupur-(sc)",
  );
  // A browser may send the parentheses raw or escaped, and Next hands the route either; both are one name.
  const d = fixture();
  try {
    for (const segment of ["bishnupur(sc)", "bishnupur%28sc%29"]) {
      const found = await resolvePlace({ level: "seat", state: "wb", body: "assembly", name: segment }, over(d));
      assert.equal(found.found === "one" ? found.place.href : found.found, "/constituency/wb/assembly/bishnupur(sc)", segment);
    }
  } finally {
    d.close();
  }
});

test("coverageHref: the election is the query's `election`, and the panel is the fragment", () => {
  const url = new URL(coverageHref("ls-2024"), "http://mandate.test");
  assert.equal(url.pathname, "/coverage");
  assert.equal(url.searchParams.get("election"), "ls-2024");
  assert.equal(url.hash, "#election");
});

// ── the round trips ──────────────────────────────────────────────────────────────────────────────

type Seat = { place: string; state: string; kind: "ac" | "pc"; name: string; district: string | null };

// Two bodies sharing a name (Bankura), a pc sharing a district's name (Cooch Behar), a two-word name, a marked
// name beside the plain name it differs from by the marker alone (Bishnupur, which the exact name settles: each
// answers to its own), a name in a script with no case, and a second state.
const SEATS: Seat[] = [
  { place: "wb.ac.001", state: "wb", kind: "ac", name: "Mekliganj", district: "wb.cooch-behar" },
  { place: "wb.ac.002", state: "wb", kind: "ac", name: "Cooch Behar Uttar", district: "wb.cooch-behar" },
  { place: "wb.ac.146", state: "wb", kind: "ac", name: "BISHNUPUR(SC)", district: "wb.south-24-parganas" },
  { place: "wb.ac.267", state: "wb", kind: "ac", name: "Bishnupur", district: "wb.bankura" },
  { place: "wb.ac.050", state: "wb", kind: "ac", name: "মেখলিগঞ্জ", district: "wb.cooch-behar" },
  { place: "wb.ac.266", state: "wb", kind: "ac", name: "Bankura", district: "wb.bankura" },
  { place: "wb.pc.08", state: "wb", kind: "pc", name: "Bankura", district: null },
  { place: "wb.pc.01", state: "wb", kind: "pc", name: "Cooch Behar", district: null },
  { place: "ka.ac.001", state: "ka", kind: "ac", name: "Jayanagar", district: "ka.bangalore" },
  { place: "ka.pc.001", state: "ka", kind: "pc", name: "Bangalore South", district: null },
];

function fixture(): DatabaseSync {
  const d = open(":memory:");
  migrate(d, "2026-08-12T00:00:00.000Z");
  d.exec(`
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e1','Delimitation','2008-02-19');
    INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('wb','state','West Bengal','in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('ka','state','Karnataka','in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('dl','ut','Delhi','in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('wb.cooch-behar','district','Cooch Behar','wb');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('wb.south-24-parganas','district','South 24 Parganas','wb');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('wb.bankura','district','Bankura','wb');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('ka.bangalore','district','Bangalore','ka');
  `);
  const place = d.prepare(`INSERT INTO place (id, kind, canonical_name, parent_id) VALUES (?, ?, ?, ?)`);
  const version = d.prepare(
    `INSERT INTO place_version (id, place_id, jurisdiction_id, district_place_id, kind, epoch_id, number, canonical_name,
                                reservation)
     VALUES (?, ?, ?, ?, ?, 'e1', ?, ?, 'general')`,
  );
  SEATS.forEach((s, i) => {
    place.run(s.place, s.kind, s.name, s.district ?? s.state);
    version.run(i + 1, s.place, s.state, s.district, s.kind, i + 1, s.name);
  });
  // A house with no election has no epoch it votes under, and a seat of no epoch is not current and does not
  // resolve. One contest per seat is all it takes to be a seat a link can reach.
  const election = d.prepare(
    `INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, polling_month, occurrence)
     VALUES (?, ?, ?, ?, 'e1', ?, 'declared', ?, ?, 4, 1)`,
  );
  election.run("wb-assembly-2021", "assembly", "state", "wb", "WB 2021", "ac", 2021);
  election.run("ka-assembly-2018", "assembly", "state", "ka", "KA 2018", "ac", 2018);
  election.run("ls-2024", "general", "union", "in", "LS 2024", "pc", 2024);
  const contest = d.prepare("INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES (?, ?, ?, 'declared')");
  SEATS.forEach((s, i) => {
    const e = s.kind === "pc" ? "ls-2024" : s.state === "wb" ? "wb-assembly-2021" : "ka-assembly-2018";
    contest.run(`${e}:${i + 1}`, e, i + 1);
  });
  return d;
}

/** A reader over a handle the test holds, so a `:memory:` registry can stand where the file would. */
const over =
  (d: DatabaseSync): typeof readRegistry =>
  (fn) => ({ ok: true, value: fn(d) });

/** The segments after `/constituency/`, as a request carries them: state, body, name. */
function constituencyPath(href: string): [string, string, string] {
  const [, route, state, body, name] = href.split("/");
  assert.equal(route, "constituency", href);
  return [state as string, body as string, name as string];
}

/** The escaped spelling of a segment, parentheses included, which encodeURIComponent leaves alone. */
const escaped = (segment: string): string =>
  encodeURIComponent(segment).replace(/[()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

test("a seat's href carries its state, its body and its name's slug", () => {
  for (const s of SEATS) {
    const [state, body, name] = constituencyPath(
      constituencyHref({ jurisdictionId: s.state, kind: s.kind, canonicalName: s.name }),
    );
    assert.equal(state, s.state, s.place);
    assert.equal(asBody(body) === null ? null : kindOfBody(asBody(body) as "assembly"), s.kind, s.place);
    assert.equal(name, slugOf(s.name), s.place);
  }
});

test("a seat's href resolves to that seat, spelt or escaped, and its analysis base extends the href", async () => {
  const d = fixture();
  try {
    for (const s of SEATS) {
      const href = constituencyHref({ jurisdictionId: s.state, kind: s.kind, canonicalName: s.name });
      const [state, body, name] = constituencyPath(href);
      for (const segment of [name, escaped(name)]) {
        const v = await placeView({ level: "seat", state, body: asBody(body) ?? "assembly", name: segment }, {}, over(d));
        if (v.kind !== "ac") return assert.fail(`${href} (${segment}) resolved to a ${v.kind} view`);
        assert.equal(v.brief.place.id, s.place, `${href} (${segment})`);
        assert.equal(v.base, `${href}/analysis`, `${href} (${segment})`);
      }
    }
  } finally {
    d.close();
  }
});

test("a state's and a district's href resolve to the place it was built from", async () => {
  const d = fixture();
  try {
    const built: [string, string, "state" | "district"][] = [
      [stateHref("wb"), "wb", "state"],
      [stateHref("ka"), "ka", "state"],
      // A union territory is a state as far as its route goes.
      [stateHref("dl"), "dl", "state"],
      [districtHref("wb.cooch-behar"), "wb.cooch-behar", "district"],
      [districtHref("wb.south-24-parganas"), "wb.south-24-parganas", "district"],
      [districtHref("ka.bangalore"), "ka.bangalore", "district"],
    ];
    for (const [href, id, level] of built) {
      const [state, district] = href.split("/").slice(2) as [string, string | undefined];
      const query: PlaceQuery =
        district === undefined ? { level: "state", id: state } : { level: "district", state, district };
      const v = await placeView(query, {}, over(d));
      if (v.kind !== "parent") return assert.fail(`${href} resolved to a ${v.kind} view`);
      assert.deepEqual([v.level, v.placeId], [level, id], href);
    }
  } finally {
    d.close();
  }
});

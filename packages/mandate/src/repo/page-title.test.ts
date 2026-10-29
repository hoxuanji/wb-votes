// What a page's title says. The tab, the history entry, the bookmark and a screen reader's announcement of a page
// that has loaded all read it, and before this every page but three said "India Election Intelligence", whatever it
// was about. The registry is built here from literal data.

import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { legacyTarget } from "./legacy.ts";
import { electionTitle, legacyTitle, personTitle, placeTitle } from "./page-title.ts";
import type { readRegistry } from "./session.ts";

/** A reader over a handle the test holds, so a `:memory:` registry can stand where the file would. */
const over =
  (d: DatabaseSync): typeof readRegistry =>
  (fn) => ({ ok: true, value: fn(d) });

/** The outage a reader meets before the registry is built. */
const outage: typeof readRegistry = () => ({ ok: false, detail: "not built", cause: new Error("not built") });

/**
 * Two assembly seats called Twin in different districts of Tw State (a tie), a seat of its own, a Lok Sabha seat, two
 * elections and one person. A state whose id is not its name, so a title that fell back to the id would show.
 */
function registry(): DatabaseSync {
  const d = open(":memory:");
  migrate(d, "2026-08-12T00:00:00.000Z");
  d.exec(`
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e1','Delimitation 2008','2008-02-19');
    INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('tw','state','Tw State','in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('tw.north','district','North','tw');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('tw.south','district','South','tw');
    INSERT INTO person (id, canonical_name, created_at) VALUES ('ann-lee-0a1b2c','Ann Lee','2026-08-12');
  `);
  const place = d.prepare("INSERT INTO place (id, kind, canonical_name, parent_id) VALUES (?, ?, ?, ?)");
  const version = d.prepare(
    `INSERT INTO place_version (id, place_id, jurisdiction_id, district_place_id, kind, epoch_id, number, canonical_name, reservation)
     VALUES (?, ?, 'tw', ?, ?, 'e1', ?, ?, 'general')`,
  );
  const seats: [number, string, string, string | null, number, string][] = [
    [1, "tw.ac.001", "ac", "tw.north", 1, "Twin"],
    [2, "tw.ac.002", "ac", "tw.south", 2, "Twin"],
    [3, "tw.ac.003", "ac", "tw.north", 3, "Solo"],
    [4, "tw.pc.01", "pc", null, 1, "Wide"],
  ];
  for (const [id, placeId, kind, district, number, name] of seats) {
    place.run(placeId, kind, name, district ?? "tw");
    version.run(id, placeId, district, kind, number, name);
  }
  d.exec(`
    INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
    VALUES ('tw-assembly-2021','assembly','state','tw','e1','TW 2021','declared','ac',2021,1);
    INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES ('c1','tw-assembly-2021',1,'declared');
    INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES ('c2','tw-assembly-2021',2,'declared');
    INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES ('c3','tw-assembly-2021',3,'declared');
    INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
    VALUES ('ls-2024','general','union','in','e1','LS 2024','declared','pc',2024,1);
    INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES ('c4','ls-2024',4,'declared');
  `);
  return d;
}

test("a state's title is its name, not its id", () => {
  const d = registry();
  try {
    assert.equal(placeTitle({ level: "state", id: "tw" }, {}, over(d)), "Tw State");
    // the segment is read as the request spelled it, in any case, as the page is
    assert.equal(placeTitle({ level: "state", id: "TW" }, {}, over(d)), "Tw State");
  } finally {
    d.close();
  }
});

test("a district's title names its state, and a seat's names its body and its state", () => {
  const d = registry();
  try {
    assert.equal(placeTitle({ level: "district", state: "tw", district: "north" }, {}, over(d)), "North · District, Tw State");
    assert.equal(
      placeTitle({ level: "seat", state: "tw", body: "assembly", name: "solo" }, {}, over(d)),
      "Solo · Assembly Constituency, Tw State",
    );
    assert.equal(
      placeTitle({ level: "seat", state: "tw", body: "lok-sabha", name: "wide" }, {}, over(d)),
      "Wide · Lok Sabha Constituency, Tw State",
    );
  } finally {
    d.close();
  }
});

test("the analysis floor of a seat is titled as the analysis, so it is not the seat's own tab twice", () => {
  const d = registry();
  try {
    const brief = placeTitle({ level: "seat", state: "tw", body: "assembly", name: "solo" }, {}, over(d));
    const floor = placeTitle({ level: "seat", state: "tw", body: "assembly", name: "solo" }, { analysis: true }, over(d));
    assert.equal(floor, "Solo · Assembly Constituency analysis, Tw State");
    assert.notEqual(floor, brief);
  } finally {
    d.close();
  }
});

test("a name two seats answer to is titled as the question it asks, not as either seat", () => {
  const d = registry();
  try {
    const title = placeTitle({ level: "seat", state: "tw", body: "assembly", name: "twin" }, {}, over(d));
    assert.equal(title, "Twin · Which constituency?");
  } finally {
    d.close();
  }
});

test("an address that names no place has no title of its own, and neither has an unreadable registry", () => {
  const d = registry();
  try {
    assert.equal(placeTitle({ level: "state", id: "zz" }, {}, over(d)), undefined);
    assert.equal(placeTitle({ level: "district", state: "tw", district: "nowhere" }, {}, over(d)), undefined);
    assert.equal(placeTitle({ level: "seat", state: "tw", body: "assembly", name: "nowhere" }, {}, over(d)), undefined);
    assert.equal(placeTitle({ level: "state", id: "tw" }, {}, outage), undefined);
  } finally {
    d.close();
  }
});

test("a malformed percent-escape is no place, not a crashed tab title", () => {
  const d = registry();
  try {
    assert.equal(placeTitle({ level: "seat", state: "tw", body: "assembly", name: "50%" }, {}, over(d)), undefined);
    assert.equal(electionTitle("50%", over(d)), undefined);
    assert.equal(personTitle("50%", over(d)), undefined);
  } finally {
    d.close();
  }
});

test("a legacy address that asks which seat was meant is titled as the question, and a redirect or a miss has none", () => {
  const d = registry();
  try {
    const ask = (body: string) => legacyTarget({ route: "constituency-name", state: "tw", body }, over(d));
    assert.equal(ask("twin").kind, "choose");
    assert.equal(legacyTitle(ask("twin")), "Twin · Which constituency?");
    assert.equal(ask("solo").kind, "redirect");
    assert.equal(legacyTitle(ask("solo")), undefined);
    assert.equal(ask("nowhere").kind, "not-found");
    assert.equal(legacyTitle(ask("nowhere")), undefined);
  } finally {
    d.close();
  }
});

test("an election's title is the label the election carries, and a person's is their name", () => {
  const d = registry();
  try {
    assert.equal(electionTitle("tw-assembly-2021", over(d)), "Tw State Assembly Election 2021");
    assert.equal(electionTitle("tw-assembly-1999", over(d)), undefined);
    assert.equal(electionTitle("tw-assembly-2021", outage), undefined);
    assert.equal(personTitle("ann-lee-0a1b2c", over(d)), "Ann Lee");
    // the segment arrives still escaped, and is read as the page reads it
    assert.equal(personTitle(encodeURIComponent("ann-lee-0a1b2c"), over(d)), "Ann Lee");
    assert.equal(personTitle("nobody-000000", over(d)), undefined);
    assert.equal(personTitle("ann-lee-0a1b2c", outage), undefined);
  } finally {
    d.close();
  }
});

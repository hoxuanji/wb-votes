// The command bar's data layer, against the real registry.
//
// WHY THESE ASSERTIONS AND NOT OTHERS. A search result is a NAVIGATION OFFER, so the property that matters
// is not relevance but resolvability: every hit must point at a URL that exists. The audit found a link to
// `/pl/in` sitting on the front page behind a query string, and this suite's first job is that a search page
// cannot grow the same class of defect at eight rows a group.
//
// The second job is the two decisions in search.ts that could quietly rot: the wildcards are escaped, and
// constituencies are matched on the name a seat carries NOW rather than on any name any delimitation gave a
// place row that groups seats by number.
//
// The third is that "now" is the resolver's now. The stock registry has one epoch, so on it the newest version of
// a seat and the version its house votes under are the same row and the property above cannot fail; `orders()`
// below builds the registry on which they part.

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { ensureEpochs } from "../db/epochs.ts";
import { DEV_DB_PATH, all, open, openRead } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { PER_GROUP, partyAnchor, searchAll } from "./search.ts";
import type { Hit, Results } from "./search.ts";
import { placeView } from "./place-view.ts";
import { seatHref, seatTies } from "./place-resolve.ts";
import type { PlaceQuery } from "./place-resolve.ts";
import { electionMapView } from "./election-map.ts";
import { readRegistry } from "./session.ts";

const live = { skip: existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH) ? false : "no .data/registry.db" };
const db = () => openRead(DEV_DB_PATH);

test("an election hit is named in the type label, whichever of the four kinds it is", () => {
  // In memory, so it runs without a registry: the real one holds all four, but only when it has been ingested.
  const d = open(":memory:");
  migrate(d, "2026-08-12T00:00:00.000Z");
  d.exec(`
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e1','Delimitation','2008-02-19');
    INSERT INTO place (id, kind, canonical_name) VALUES ('ka','state','Karnataka');
    INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
      VALUES ('ka-assembly-2023','assembly','state','ka','e1','KA 2023','declared','ac',2023,1);
    INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
      VALUES ('ka-general-2019','general','state','ka','e1','KA LS 2019','declared','pc',2019,1);
    INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
      VALUES ('ka-bypoll-ae-2021','bypoll','state','ka','e1','KA AE by 2021','declared','ac',2021,1);
    INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
      VALUES ('ka-bypoll-ge-2018','bypoll','state','ka','e1','KA LS by 2018','declared','pc',2018,1);
  `);
  try {
    // Newest first, so the order is part of the assertion as well.
    assert.deepEqual(
      searchAll(d, "Karnataka").elections.map((h) => [h.id, h.label]),
      [
        ["ka-assembly-2023", "Karnataka Assembly Election 2023"],
        ["ka-bypoll-ae-2021", "Karnataka Assembly By-election 2021"],
        ["ka-general-2019", "Karnataka Lok Sabha Election 2019"],
        ["ka-bypoll-ge-2018", "Karnataka Lok Sabha By-election 2018"],
      ],
    );
  } finally {
    d.close();
  }
});

test("an election hit opens the election's own page", () => {
  const d = open(":memory:");
  migrate(d, "2026-08-12T00:00:00.000Z");
  d.exec(`
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e1','Delimitation','2008-02-19');
    INSERT INTO place (id, kind, canonical_name) VALUES ('ka','state','Karnataka');
    INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
      VALUES ('ka-assembly-2023','assembly','state','ka','e1','KA 2023','declared','ac',2023,1);
  `);
  try {
    assert.deepEqual(
      searchAll(d, "Karnataka").elections.map((h) => h.href),
      ["/election/ka-assembly-2023"],
    );
  } finally {
    d.close();
  }
});

test("an empty query returns nothing, rather than the whole registry", live, () => {
  const d = db();
  try {
    for (const q of ["", "   ", "\t"]) {
      const r = searchAll(d, q);
      assert.equal(r.total, 0, `"${q}" matched something`);
      assert.equal(r.states.length + r.elections.length + r.constituencies.length + r.parties.length, 0);
      assert.equal(r.people.length + r.alike.length, 0);
    }
  } finally {
    d.close();
  }
});

test("a LIKE wildcard is escaped, not honoured", live, () => {
  const d = db();
  try {
    // "%" and "_" are LIKE metacharacters. Unescaped, "%" matched every row in the registry — 36 states, 24
    // elections, eight seats and eight parties — which is a search page acting as a database dump.
    for (const q of ["%", "_", "%%", "_a_"]) {
      const r = searchAll(d, q);
      assert.equal(r.states.length, 0, `"${q}" matched states as a wildcard`);
      assert.equal(r.constituencies.length, 0, `"${q}" matched constituencies as a wildcard`);
      assert.equal(r.parties.length, 0, `"${q}" matched parties as a wildcard`);
    }
    // And a name that really does contain an underscore is still findable, which is why they are escaped
    // rather than stripped.
    assert.doesNotThrow(() => searchAll(d, "a_b"));
  } finally {
    d.close();
  }
});

test("every group caps at PER_GROUP, so no one query can flood the page", live, () => {
  const d = db();
  try {
    // "a" appears in almost every name in the registry.
    const r = searchAll(d, "a");
    for (const [group, hits] of [
      ["states", r.states],
      ["elections", r.elections],
      ["constituencies", r.constituencies],
      ["parties", r.parties],
    ] as const) {
      assert.ok(hits.length <= PER_GROUP, `${group} returned ${hits.length}, cap is ${PER_GROUP}`);
    }
    assert.ok(r.people.length <= PER_GROUP, `people returned ${r.people.length}`);
  } finally {
    d.close();
  }
});

/**
 * The property this file is for, asked of the registry at `path`: every hit the queries produce opens a page.
 *
 * `search` is what offers the hits, so that a control can hand it another query and watch this fail.
 */
async function everyHitResolves(
  path: string,
  queries: string[],
  search: (d: DatabaseSync, q: string) => Results = searchAll,
): Promise<void> {
  const d = openRead(path);
  let states: string[] = [];
  let seats: string[] = [];
  let elections: string[] = [];
  let parties: string[] = [];
  try {
    for (const q of queries) {
      const r = search(d, q);
      states.push(...r.states.map((h) => h.href));
      seats.push(...r.constituencies.map((h) => h.href));
      elections.push(...r.elections.map((h) => h.href));
      parties.push(...r.parties.map((h) => h.href));
      for (const p of [...r.people, ...r.alike]) {
        assert.match(`/p/${p.id}`, /^\/p\/[^/]+$/, "a person hit has no id");
      }
    }
    assert.ok(states.length > 0 && seats.length > 0, "the fixture queries matched no place at all");
  } finally {
    d.close();
  }

  // A place hit is only an offer if placeView resolves it. This is the assertion the whole file is for.
  for (const href of [...new Set([...states, ...seats])]) {
    /**
     * RESOLVED THE WAY THE ROUTE RESOLVES IT.
     *
     * A canonical route names what it asks for, so the hit is read back into the query the reader's click will
     * make: a state by its id, a seat by its state, its body and its name. A name two seats answer to is a page
     * that asks, which is not a 404.
     */
    // /constituency/<state>/<body>/<name> — the BODY is part of the identity now, so a hit is resolved with
    // the body it advertises rather than with a name alone.
    const parts = href.split("/").filter(Boolean);
    const query: PlaceQuery =
      parts[0] === "constituency"
        ? {
            level: "seat",
            state: parts[1] as string,
            body: parts[2] === "lok-sabha" ? "lok-sabha" : "assembly",
            name: parts[3] as string,
          }
        : { level: "state", id: parts[1] as string };
    const view = await placeView(query, {}, (fn) => readRegistry(fn, { path }));
    assert.notEqual(view.kind, "not-found", `${href} is offered by search and 404s`);
    assert.notEqual(view.kind, "unavailable", `${href} could not be read`);
  }

  // An election hit goes to the election's own page, which answers for it; a party hit goes to a landscape row anchor.
  const registry = openRead(path);
  try {
    for (const href of new Set(elections)) {
      const id = /^\/election\/([^/]+)$/.exec(href)?.[1];
      assert.ok(id !== undefined, `${href} is not an election's page`);
      assert.notEqual(electionMapView(registry, id).election, null, `${href} is offered by search and 404s`);
    }
  } finally {
    registry.close();
  }
  for (const href of new Set(parties)) {
    assert.match(href, /^\/#party-[a-z0-9-]+$/, `${href} is not a landscape anchor`);
  }
}

test("every hit points at a URL that resolves", live, async () => {
  // Queries chosen to hit all five groups: a state, a seat, a party, a year, and a letter that is
  // everywhere. Nothing here names a jurisdiction the product started with.
  await everyHitResolves(DEV_DB_PATH, ["a", "north", "congress", "assembly", "2023"]);
});

// ── a seat's newest order is not always the one its house votes under ────────────────────────────

const NOW = "2026-08-12T00:00:00.000Z";

/**
 * A registry in which the newest order of some places is not the one their house votes under, which the stock
 * registry, having one epoch, cannot show.
 *
 *   Assam      its assembly votes under delim-2008, and delim-2023-as redraws seat 1 as "Dibrugarh East" without any
 *              election having been held on it; its Lok Sabha seat voted under delim-2023-as, so there the newest
 *              order is the voting one
 *   Karnataka  seat 214 was BADAMI and is NANJANGUD; seat 300 existed under delim-1976 only; two seats are named Twin
 *   Goa        a seat and no election at all
 */
function orders(): DatabaseSync {
  const d = open(":memory:");
  migrate(d, NOW);
  d.exec(`
    INSERT INTO place (id, kind, canonical_name) VALUES ('in', 'nation', 'India');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('as', 'state', 'Assam', 'in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('ka', 'state', 'Karnataka', 'in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('ga', 'state', 'Goa', 'in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('as.dibrugarh', 'district', 'Dibrugarh', 'as');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('ka.bangalore', 'district', 'Bangalore', 'ka');
  `);
  ensureEpochs(d, ["delim-1976", "delim-2008", "delim-2023-as"]);
  const insertPlace = d.prepare("INSERT OR IGNORE INTO place (id, kind, canonical_name, parent_id) VALUES (?, ?, ?, ?)");
  const insertVersion = d.prepare(
    `INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, district_place_id, reservation)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'general')`,
  );
  for (const [v, place, epoch, name, district] of [
    [1, "as.ac.001", "delim-2008", "Dibrugarh", "as.dibrugarh"],
    [2, "as.ac.001", "delim-2023-as", "Dibrugarh East", "as.dibrugarh"],
    [3, "as.pc.001", "delim-2008", "Dibrugarh", null],
    [4, "as.pc.001", "delim-2023-as", "Dibrugarh", null],
    [10, "ka.ac.214", "delim-1976", "BADAMI", "ka.bangalore"],
    [11, "ka.ac.214", "delim-2008", "NANJANGUD", "ka.bangalore"],
    [12, "ka.ac.300", "delim-1976", "GONE", "ka.bangalore"],
    [13, "ka.ac.302", "delim-2008", "Twin", "ka.bangalore"],
    [14, "ka.ac.301", "delim-2008", "Twin", "ka.bangalore"],
    [20, "ga.ac.001", "delim-2008", "Mapusa", null],
  ] as const) {
    const [state, kind, number] = [place.slice(0, 2), place.slice(3, 5), Number(place.slice(6))];
    insertPlace.run(place, kind, name, state);
    insertVersion.run(v, place, state, kind, epoch, number, name, district);
  }
  const election = d.prepare(
    `INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, polling_month, occurrence)
     VALUES (?, ?, ?, ?, ?, ?, 'declared', ?, ?, 4, 1)`,
  );
  const contest = d.prepare("INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES (?, ?, ?, 'declared')");
  election.run("as-assembly-2021", "assembly", "state", "as", "delim-2008", "AS 2021", "ac", 2021);
  election.run("ka-assembly-2018", "assembly", "state", "ka", "delim-2008", "KA 2018", "ac", 2018);
  election.run("ls-2019", "general", "union", "in", "delim-2008", "LS 2019", "pc", 2019);
  election.run("ls-2024", "general", "union", "in", "delim-2023-as", "LS 2024", "pc", 2024);
  for (const [e, v] of [
    ["as-assembly-2021", 1], ["ka-assembly-2018", 11], ["ka-assembly-2018", 13], ["ka-assembly-2018", 14],
    ["ls-2019", 3], ["ls-2024", 4],
  ] as const) {
    contest.run(`${e}:${v}`, e, v);
  }
  return d;
}

/** `orders()` as a file, because a page reads a path; `bare` is the registry as migration 016 left it: no view. */
function ordersFile(bare = false): string {
  const d = orders();
  if (bare) d.exec("DROP VIEW voting_epoch");
  const path = join(mkdtempSync(join(tmpdir(), "mandate-search-")), "registry.db");
  d.exec(`VACUUM INTO '${path}'`);
  d.close();
  return path;
}

/** What `orders()` can be asked: a state, a seat of each kind, and the letter that matches nearly all of it. */
const ORDER_QUERIES = ["a", "assam", "karnataka", "dibrugarh", "east", "badami", "nanjangud", "gone", "twin", "mapusa"];

function seatsFor(d: DatabaseSync, q: string): Hit[] {
  return searchAll(d, q).constituencies;
}

test("search offers the seat its house votes under, not the newest order of its place", () => {
  const d = orders();
  try {
    // Assam's assembly votes under delim-2008, so seat 1 is Dibrugarh; the "Dibrugarh East" that delim-2023-as made of
    // it has no page. The Lok Sabha seat voted under delim-2023-as, which is its newest version as well.
    const hits = seatsFor(d, "dibrugarh");
    assert.deepEqual(
      hits.map((h) => [h.id, h.label, h.href]),
      [
        ["as.pc.001", "Dibrugarh", "/constituency/as/lok-sabha/dibrugarh"],
        ["as.ac.001", "Dibrugarh", "/constituency/as/assembly/dibrugarh"],
      ],
    );
    // and the row says what the page it leads to says: its district, its state and the elections of the seat number
    assert.equal(hits[1]?.detail, "Assembly constituency no. 1 · Dibrugarh, Assam · 1 election");
    assert.deepEqual(seatsFor(d, "east"), [], "the version nobody has voted under is not offered");
  } finally {
    d.close();
  }
});

test("a place with no version under the order its house votes under is not offered", () => {
  const d = orders();
  try {
    assert.deepEqual(seatsFor(d, "mapusa"), [], "Goa has a seat and no election, so none is its voting order");
    assert.deepEqual(seatsFor(d, "gone"), [], "a seat number that exists under delim-1976 only");
    assert.deepEqual(seatsFor(d, "badami"), [], "a retired name is declined, as it always was");
    assert.deepEqual(seatsFor(d, "nanjangud").map((h) => h.href), ["/constituency/ka/assembly/nanjangud"]);
  } finally {
    d.close();
  }
});

test("two current seats of one name are each offered by their registry id", () => {
  const d = orders();
  try {
    // as many elections each, so the place id says which comes first
    assert.deepEqual(
      seatsFor(d, "twin").map((h) => h.href),
      ["/constituency/ka/assembly/ka.ac.301", "/constituency/ka/assembly/ka.ac.302"],
    );
  } finally {
    d.close();
  }
});

test("every hit points at a URL that resolves, where the newest order is not the voting one", async () => {
  await everyHitResolves(ordersFile(), ORDER_QUERIES);
});

test("a registry without migration 017 offers the newest version of each place, and the pages answer it", async () => {
  // The resolver takes the newest version of a place there, because it cannot say which order a house votes under, and
  // search asks the resolver: the two cannot part, whichever way the registry is built.
  const path = ordersFile(true);
  const d = openRead(path);
  try {
    assert.deepEqual(seatsFor(d, "east").map((h) => h.href), ["/constituency/as/assembly/dibrugarh-east"]);
    assert.deepEqual(seatsFor(d, "mapusa").map((h) => h.href), ["/constituency/ga/assembly/mapusa"]);
  } finally {
    d.close();
  }
  await everyHitResolves(path, ORDER_QUERIES);
});

/**
 * What search offered before it asked the resolver: the newest version of each place by its epoch's start, whatever
 * its house votes under. Kept as the control for the property above, which a query that offers nothing passes.
 */
function newestOfEachPlace(d: DatabaseSync, q: string): Results {
  const tied = seatTies(d);
  const constituencies = all<{ place: string; version: number; name: string; kind: string; state: string }>(
    d,
    `SELECT place, version, name, kind, state FROM (
       SELECT pv.place_id AS place, pv.id AS version, pv.canonical_name AS name, pv.kind AS kind, pv.jurisdiction_id AS state,
              row_number() OVER (PARTITION BY pv.place_id ORDER BY be.effective_from DESC, pv.id DESC) AS rn
         FROM place_version pv JOIN boundary_epoch be ON be.id = pv.epoch_id
        WHERE pv.kind IN ('ac', 'pc')
     ) WHERE rn = 1 AND name LIKE ?`,
    `%${q}%`,
  ).map((r): Hit => ({
    id: r.place,
    label: r.name,
    detail: "",
    href: seatHref(tied, { versionId: r.version, placeId: r.place, stateId: r.state, kind: r.kind, name: r.name }),
  }));
  return { ...searchAll(d, q), constituencies };
}

test("the property can fail: the newest version of each place 404s where an order is unvoted", async () => {
  // The negative control of the two tests above. Without it a property that was asked nothing would pass.
  await assert.rejects(
    everyHitResolves(ordersFile(), ORDER_QUERIES, newestOfEachPlace),
    /\/constituency\/as\/assembly\/dibrugarh-east is offered by search and 404s/,
  );
  // and on a registry with no view it is the one search always was, so the same query passes
  await everyHitResolves(ordersFile(true), ORDER_QUERIES, newestOfEachPlace);
});

test("a constituency hit is the seat that carries the name now", live, () => {
  const d = db();
  try {
    // The defect this replaced: matching every version of a place row returned "NANJANGUD · no. 214 ·
    // MYSORE · was BADAMI", because `place` groups seats by NUMBER across delimitations and 214 was a
    // different constituency in an earlier one. Badami is in Bagalkot. So a hit's label must be a name the
    // seat's CURRENT version carries, and the district in its path must be that version's district.
    for (const q of ["badami", "north", "east"]) {
      for (const h of searchAll(d, q).constituencies) {
        assert.ok(
          h.label.toLowerCase().includes(q.toLowerCase()),
          `"${q}" returned ${h.label}, which does not contain the query`,
        );
        assert.match(h.href, /^\/constituency\/[a-z]{2}\/(assembly|lok-sabha)\/[^/]+$/, `${h.href} is not a canonical constituency path`);
        // The detail names the district, and the path's district segment must be the same district.
        const segment = h.href.split("/")[3] ?? "";
        assert.ok(segment.length > 0, `${h.href} has an empty district segment`);
      }
    }
  } finally {
    d.close();
  }
});

test("a party anchor is a legal fragment, whatever the party id looks like", () => {
  // A party id can contain spaces: "BHARATIYA NYAY-ADHIKAR RAKSHA PARTY" is one in this registry, and a
  // fragment with a space in it is not a fragment.
  for (const [id, want] of [
    ["BJP", "party-bjp"],
    ["BHARATIYA NYAY-ADHIKAR RAKSHA PARTY", "party-bharatiya-nyay-adhikar-raksha-party"],
    ["JD(S)", "party-jd-s"],
    ["  ", "party"],
  ] as const) {
    assert.equal(partyAnchor(id), want);
    assert.match(partyAnchor(id), /^[a-z0-9-]+$/, `${id} produced an illegal fragment`);
  }
});

test("an Indic query reaches the four text groups through transliteration", live, () => {
  const d = db();
  try {
    // The people tier folds scripts onto shared blocking keys. The other four are text matches over a
    // registry that holds no Indic name strings at all, so a Bengali query can only reach them through the
    // Latin form — and the page says which form it used.
    const r = searchAll(d, "মমতা");
    assert.equal(r.script, "beng");
    assert.ok(r.transliterated !== null && r.transliterated.length > 0, "a Bengali query was not romanised");
    assert.notEqual(r.transliterated, "মমতা", "the transliteration returned the input");
  } finally {
    d.close();
  }
});

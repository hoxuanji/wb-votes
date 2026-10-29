// Tests for where the legacy routes send a request: the WB Votes -> MANDATE redirects and the old `/pl` tree.
//
// Two layers. The first runs on a small registry built in memory with TWO states, because the question a legacy id
// has to answer ("which seat is c0001?") has a different answer in each state that numbers a seat 1, and a registry
// that holds one state cannot tell the right seat from the wrong one. Every assertion there is on the seat's NAME.
// The second walks the whole old URL space against the seed registry: coverage, not a sample. A redirect that
// resolves for the three ids someone happened to try, and 404s for the other 291, is worse than no redirect at all:
// it looks fixed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { open, openRead, DEV_DB_PATH } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { acNumber, legacyTarget, pathQuery } from "./legacy.ts";
import type { LegacyRequest, LegacyTarget } from "./legacy.ts";
import { readRegistry } from "./session.ts";
import { slugOf } from "./routes.ts";

const HAVE_DB = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const opts = { skip: HAVE_DB ? false : "no .data/registry.db — run npm run registry:ingest" };

const seed = <T,>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../../../../data/seed/${name}.json`, import.meta.url), "utf8")) as T;

// ── the fixture ──────────────────────────────────────────────────────────────────────────────────

/** A reader over a handle the test holds, so a `:memory:` registry can stand where the file would. */
const over =
  (d: DatabaseSync): typeof readRegistry =>
  (fn) => ({ ok: true, value: fn(d) });

/** A reader bound to one file. */
const at =
  (path: string): typeof readRegistry =>
  (fn) =>
    readRegistry(fn, { path });

/** The reader of a route that must not open the registry at all. */
const never: typeof readRegistry = () => assert.fail("the registry was opened");

type SeatSpec = {
  v: number;
  id: string;
  state: "wb" | "ka";
  kind: "ac" | "pc";
  epoch: "delim-1976" | "delim-2008";
  name: string;
  number: number;
  district: string | null;
  /** What the place row is called, where it is not what its version is called (migration 011). */
  grouping?: string;
};

const SEATS: SeatSpec[] = [
  { v: 1, id: "wb.ac.001", state: "wb", kind: "ac", epoch: "delim-2008", name: "Mekliganj", number: 1, district: "wb.cooch-behar" },
  { v: 2, id: "wb.ac.002", state: "wb", kind: "ac", epoch: "delim-2008", name: "Mathabhanga", number: 2, district: "wb.cooch-behar", grouping: "GROUPING TWO" },
  // two seats of one body and one district that answer to one name: a tie, so each is addressed by its registry id
  { v: 3, id: "wb.ac.003", state: "wb", kind: "ac", epoch: "delim-2008", name: "Twin", number: 3, district: "wb.bankura" },
  { v: 4, id: "wb.ac.004", state: "wb", kind: "ac", epoch: "delim-2008", name: "Twin", number: 4, district: "wb.bankura" },
  // no winner declared in its newest election
  { v: 5, id: "wb.ac.005", state: "wb", kind: "ac", epoch: "delim-2008", name: "Hooghly", number: 5, district: "wb.bankura" },
  // a seat number only an earlier order held
  { v: 6, id: "wb.ac.006", state: "wb", kind: "ac", epoch: "delim-1976", name: "Old Name", number: 6, district: "wb.bankura" },
  // an assembly seat and a Lok Sabha seat of one name
  { v: 7, id: "wb.ac.007", state: "wb", kind: "ac", epoch: "delim-2008", name: "Baharampur", number: 7, district: "wb.cooch-behar" },
  { v: 8, id: "wb.pc.001", state: "wb", kind: "pc", epoch: "delim-2008", name: "Cooch Behar", number: 1, district: null },
  { v: 9, id: "wb.pc.002", state: "wb", kind: "pc", epoch: "delim-2008", name: "Baharampur", number: 2, district: null },
  // the seats Karnataka numbers 1 and 9: West Bengal has no assembly seat 9, and c0001 is not Karnataka's
  { v: 10, id: "ka.ac.001", state: "ka", kind: "ac", epoch: "delim-2008", name: "Aland", number: 1, district: "ka.bangalore" },
  { v: 11, id: "ka.ac.009", state: "ka", kind: "ac", epoch: "delim-2008", name: "Kolar", number: 9, district: "ka.bangalore" },
  { v: 12, id: "ka.pc.001", state: "ka", kind: "pc", epoch: "delim-2008", name: "Bidar", number: 1, district: null },
];

/** [election, house, state, epoch, year] and the version -> winner of each contest; a null winner is undeclared. */
const ELECTIONS = [
  ["wb-assembly-1977", "ac", "wb", "delim-1976", 1977],
  ["wb-assembly-2021", "ac", "wb", "delim-2008", 2021],
  ["wb-assembly-2026", "ac", "wb", "delim-2008", 2026],
  ["ls-2029", "pc", "in", "delim-2008", 2029],
  ["ka-assembly-2027", "ac", "ka", "delim-2008", 2027],
] as const;

const CONTESTS: [election: string, version: number, winner: string | null][] = [
  ["wb-assembly-1977", 6, "w-1977-6"],
  ...[1, 2, 3, 4, 5, 7].map((v): [string, number, string | null] => ["wb-assembly-2021", v, `w-2021-${v}`]),
  ...[1, 2, 3, 4].map((v): [string, number, string | null] => ["wb-assembly-2026", v, `w-2026-${v}`]),
  ["wb-assembly-2026", 5, null],
  ["ls-2029", 8, "w-ls29-wb1"],
  ["ls-2029", 9, "w-ls29-wb2"],
  ["ls-2029", 12, "w-ls29-ka1"],
  ["ka-assembly-2027", 10, "w-ka27-1"],
  ["ka-assembly-2027", 11, "w-ka27-9"],
];

/** West Bengal and Karnataka, an earlier order and the current one, and a winner (or none) per contest. */
function registry(d: DatabaseSync = open(":memory:")): DatabaseSync {
  migrate(d, "2026-08-12T00:00:00.000Z");
  d.exec(`
    INSERT INTO source (id, kind, retrieved_at, doc_hash) VALUES ('s1','static_module','2026-08-12','sha256:0');
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('delim-1976','Delimitation 1976','1976-01-01');
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('delim-2008','Delimitation 2008','2008-02-19');
    INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('wb','state','West Bengal','in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('ka','state','Karnataka','in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('wb.cooch-behar','district','Cooch Behar','wb');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('wb.bankura','district','Bankura','wb');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('ka.bangalore','district','Bangalore','ka');
  `);
  const place = d.prepare("INSERT INTO place (id, kind, canonical_name, parent_id) VALUES (?, ?, ?, ?)");
  const version = d.prepare(
    `INSERT INTO place_version (id, place_id, jurisdiction_id, district_place_id, kind, epoch_id, number, canonical_name,
                                reservation)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'general')`,
  );
  for (const s of SEATS) {
    place.run(s.id, s.kind, s.grouping ?? s.name, s.district ?? s.state);
    version.run(s.v, s.id, s.state, s.district, s.kind, s.epoch, s.number, s.name);
  }
  const election = d.prepare(
    `INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, polling_month, occurrence)
     VALUES (?, ?, ?, ?, ?, ?, 'declared', ?, ?, 4, 1)`,
  );
  for (const [id, house, state, epoch, year] of ELECTIONS) {
    election.run(id, house === "pc" ? "general" : "assembly", house === "pc" ? "union" : "state", state, epoch, id, house, year);
  }
  const person = d.prepare(`INSERT INTO person (id, canonical_name, created_at) VALUES (?, ?, '2026-08-12')`);
  const contest = d.prepare(`INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES (?, ?, ?, 'declared')`);
  const candidacy = d.prepare(
    `INSERT INTO candidacy (id, contest_id, person_id, status, party_raw) VALUES (?, ?, ?, ?, 'X')`,
  );
  const result = d.prepare(
    `INSERT INTO result (contest_id, candidacy_id, revision, votes, "rank", is_winner, margin, source_id, ingested_at)
     VALUES (?, ?, 0, ?, ?, ?, NULL, 's1', '2026-08-12')`,
  );
  for (const [e, v, winner] of CONTESTS) {
    const c = `${e}:${v}`;
    contest.run(c, e, v);
    // every contest has a runner-up; only a declared one has a winner
    person.run(`r-${c}`, `Runner ${c}`);
    candidacy.run(`d-r-${c}`, c, `r-${c}`, "defeated");
    result.run(c, `d-r-${c}`, 100, 2, 0);
    if (winner !== null) {
      person.run(winner, `Person ${winner}`);
      candidacy.run(`d-${c}`, c, winner, "elected");
      result.run(c, `d-${c}`, 200, 1, 1);
    }
  }
  d.exec(`
    INSERT INTO person_identifier (person_id, scheme, value, source_id) VALUES ('w-2026-1','myneta_id','wb26_52','s1');
  `);
  return d;
}

const redirect = (to: string, permanent = true): LegacyTarget => ({ kind: "redirect", to, permanent });
const NOT_FOUND: LegacyTarget = { kind: "not-found" };

/** A request answered over a fresh fixture. */
function ask(request: LegacyRequest, d?: DatabaseSync): LegacyTarget {
  const own = d === undefined;
  const db = d ?? registry();
  try {
    return legacyTarget(request, over(db));
  } finally {
    if (own) db.close();
  }
}

/** The places a `choose` target lists, by registry id and href. */
function choices(t: LegacyTarget): string[] {
  if (t.kind !== "choose") return assert.fail(`expected a question for the reader, got ${JSON.stringify(t)}`);
  return t.places.map((p) => (p.level === "seat" ? `${p.placeId} ${p.href}` : p.href));
}

// ── the id grammar and the /pl grammar ───────────────────────────────────────────────────────────

test("acNumber accepts the old id shape and rejects everything else", () => {
  assert.equal(acNumber("c0001"), 1);
  assert.equal(acNumber("c0294"), 294);
  assert.equal(acNumber("c42"), 42);
  assert.equal(acNumber(" c0007 "), 7);
  for (const bad of ["", "c0000", "c", "cabc", "0001", "c1234", "c-1", "../../etc/passwd", "c0001;--"]) {
    assert.equal(acNumber(bad), null, `${bad} must not resolve to a seat`);
  }
});

test("pathQuery: the three levels of §7's grammar, and nothing else", () => {
  assert.deepEqual(pathQuery(["wb"]), { level: "state", id: "wb" });
  assert.deepEqual(pathQuery(["wb", "Cooch-Behar"]), { level: "district", state: "wb", district: "Cooch-Behar" });
  assert.deepEqual(pathQuery(["wb", "cooch-behar", "mekliganj"]), {
    level: "seat",
    state: "wb",
    district: "cooch-behar",
    name: "mekliganj",
  });
  // What each level asks is the resolver's to read: it lower-cases ids, and compares a name by its words.
  assert.equal(pathQuery([]), null);
  assert.equal(pathQuery(["", " "]), null);
  assert.equal(pathQuery(["wb", "a", "b", "c"]), null);
  // %-encoded Bengali segment survives
  assert.deepEqual(pathQuery(["wb", "cooch-behar", encodeURIComponent("মেখলিগঞ্জ")]), {
    level: "seat",
    state: "wb",
    district: "cooch-behar",
    name: "মেখলিগঞ্জ",
  });
  // A stray percent is a name no place has, not a URIError out of the page: Next hands the route a
  // once-decoded segment, so "%25zz" arrives as "%zz" and decodeURIComponent throws on it.
  assert.deepEqual(pathQuery(["wb", "%zz"]), { level: "district", state: "wb", district: "%zz" });
  assert.deepEqual(pathQuery(["wb", "cooch-behar", "50%"]), {
    level: "seat",
    state: "wb",
    district: "cooch-behar",
    name: "50%",
  });
});

// ── an old constituency id ───────────────────────────────────────────────────────────────────────

test("a constituency id is West Bengal's assembly seat of that number, named as the registry names it", () => {
  const d = registry();
  try {
    const to = (id: string): LegacyTarget => ask({ route: "constituency-id", id }, d);
    // Karnataka's seat 1 is Aland and West Bengal's Lok Sabha seat 1 is Cooch Behar: neither is c0001.
    assert.deepEqual(to("c0001"), redirect("/constituency/wb/assembly/mekliganj"));
    // the name is the seat VERSION's, where the place row carries a grouping name migration 011 forbids reading
    assert.deepEqual(to("c0002"), redirect("/constituency/wb/assembly/mathabhanga"));
    assert.deepEqual(to("c0007"), redirect("/constituency/wb/assembly/baharampur"));
    assert.deepEqual(to(" C0001 "), redirect("/constituency/wb/assembly/mekliganj"));
    // two seats that share a name are each addressed by their registry id, so c0003 does not land on a page that asks
    assert.deepEqual(to("c0003"), redirect("/constituency/wb/assembly/wb.ac.003"));
    assert.deepEqual(to("c0004"), redirect("/constituency/wb/assembly/wb.ac.004"));
  } finally {
    d.close();
  }
});

test("a constituency id that names no current West Bengal assembly seat is a 404, never another state's seat", () => {
  const d = registry();
  try {
    for (const id of [
      "c0009", // Karnataka numbers a seat 9 and West Bengal does not
      "c0006", // a number only the 1976 order held
      "c0008", // no seat of that number at all
      "c0000",
      "wb.ac.001",
      "",
      "'; DROP TABLE person; --",
    ]) {
      assert.deepEqual(ask({ route: "constituency-id", id }, d), NOT_FOUND, id);
    }
  } finally {
    d.close();
  }
});

// ── an old MLA id ────────────────────────────────────────────────────────────────────────────────

test("an MLA id is the newest declared winner of that West Bengal assembly seat", () => {
  const d = registry();
  try {
    const to = (id: string): LegacyTarget => ask({ route: "mla", id }, d);
    // not Karnataka's winner of seat 1 (w-ka27-1), and not West Bengal's Lok Sabha seat 1 (w-ls29-wb1)
    assert.deepEqual(to("c0001"), redirect("/p/w-2026-1"));
    assert.deepEqual(to("c0003"), redirect("/p/w-2026-3"));
    // 2026 declared nobody here, so the one before it is the sitting member
    assert.deepEqual(to("c0005"), redirect("/p/w-2021-5"));
    // 2021 is all there is
    assert.deepEqual(to("c0007"), redirect("/p/w-2021-7"));
    // a number only a retired seat held has a winner in 1977 and no sitting member
    for (const id of ["c0006", "c0009", "c0000", "", "wb26_52"]) assert.deepEqual(to(id), NOT_FOUND, id);
  } finally {
    d.close();
  }
});

// ── an old candidate id ──────────────────────────────────────────────────────────────────────────

test("a candidate id follows the person, and one the registry lacks goes to search as a temporary redirect", () => {
  const d = registry();
  try {
    assert.deepEqual(ask({ route: "candidate", id: "wb26_52" }, d), redirect("/p/w-2026-1"));
    assert.deepEqual(ask({ route: "candidate", id: " wb26_52 " }, d), redirect("/p/w-2026-1"));
    for (const id of ["wb26_999999", "", "   ", "'; DROP TABLE person; --"]) {
      assert.deepEqual(ask({ route: "candidate", id }, d), redirect("/search", false), id);
    }
  } finally {
    d.close();
  }
});

// ── the routes that do not read the registry ─────────────────────────────────────────────────────

test("the /pl picker answers without opening the registry", () => {
  assert.deepEqual(legacyTarget({ route: "pl-picker", to: "ka" }, never), redirect("/state/ka"));
  for (const to of [undefined, "", "KA", "kar", "k", "ka/x", "k1"]) {
    assert.deepEqual(legacyTarget({ route: "pl-picker", to }, never), NOT_FOUND, String(to));
  }
});

// ── the old /pl tree ─────────────────────────────────────────────────────────────────────────────

const pl = (path: string[], search: Record<string, string | string[] | undefined> = {}): LegacyRequest => ({
  route: "pl-path",
  path,
  search,
});

test("a /pl path is resolved, and its destination is the address the resolver gave the place", () => {
  const d = registry();
  try {
    const to = (path: string[]): LegacyTarget => ask(pl(path), d);
    assert.deepEqual(to(["wb"]), redirect("/state/wb"));
    assert.deepEqual(to(["wb", "bankura"]), redirect("/district/wb/bankura"));
    assert.deepEqual(to(["wb", "cooch-behar", "mekliganj"]), redirect("/constituency/wb/assembly/mekliganj"));
    // A seat is an assembly seat here and is named by the district in the path; a Lok Sabha seat of its name is not it.
    assert.deepEqual(to(["wb", "cooch-behar", "baharampur"]), redirect("/constituency/wb/assembly/baharampur"));
    // the seat's number, as the old links wrote it
    assert.deepEqual(to(["wb", "cooch-behar", "1"]), redirect("/constituency/wb/assembly/mekliganj"));
    // Spelled in another case, or by name: the destination is the registry's spelling and never the path's.
    assert.deepEqual(to(["WB"]), redirect("/state/wb"));
    assert.deepEqual(to(["wb", "Cooch Behar"]), redirect("/district/wb/cooch-behar"));
    assert.deepEqual(to(["wb", "cooch-behar", "MEKLIGANJ"]), redirect("/constituency/wb/assembly/mekliganj"));
  } finally {
    d.close();
  }
});

test("a /pl path keeps its Analysis lens and its query", () => {
  const d = registry();
  try {
    const seat = ["wb", "cooch-behar", "mekliganj"];
    assert.deepEqual(ask(pl([...seat, "analysis"]), d), redirect("/constituency/wb/assembly/mekliganj/analysis"));
    assert.deepEqual(
      ask(pl(["wb"], { election: "wb-assembly-2021", party: ["INC", "BJP"], mode: undefined, seat: "a b" }), d),
      redirect("/state/wb?election=wb-assembly-2021&party=INC&seat=a+b"),
    );
    assert.deepEqual(
      ask(pl([...seat, "analysis"], { from: "2016" }), d),
      redirect("/constituency/wb/assembly/mekliganj/analysis?from=2016"),
    );
  } finally {
    d.close();
  }
});

test("a /pl path that names no place is a 404, never a redirect up the tree", () => {
  const d = registry();
  try {
    for (const path of [
      ["zz"],
      ["wb", "no-such-district"],
      ["wb", "cooch-behar", "no-such-seat"],
      // the seat exists, in another district
      ["wb", "bankura", "mekliganj"],
      // a seat only an earlier order held
      ["wb", "bankura", "old-name"],
      // a Karnataka seat under West Bengal
      ["wb", "cooch-behar", "aland"],
      ["wb", "cooch-behar", "mekliganj", "extra"],
      ["wb", "%zz"],
      [],
      ["", " "],
    ]) {
      assert.deepEqual(ask(pl(path), d), NOT_FOUND, `/pl/${path.join("/")}`);
    }
  } finally {
    d.close();
  }
});

test("a /pl path that names two seats asks which, and does not guess", () => {
  const found = choices(ask(pl(["wb", "bankura", "twin"])));
  assert.deepEqual(found, ["wb.ac.003 /constituency/wb/assembly/wb.ac.003", "wb.ac.004 /constituency/wb/assembly/wb.ac.004"]);
});

// ── the pre-body form ────────────────────────────────────────────────────────────────────────────

test("the pre-body URL answers to a name, matches its state exactly, and asks when two offices share the name", () => {
  const d = registry();
  try {
    const to = (state: string, body: string): LegacyTarget => ask({ route: "constituency-name", state, body }, d);
    assert.deepEqual(to("wb", "mekliganj"), redirect("/constituency/wb/assembly/mekliganj"));
    assert.deepEqual(to("wb", "cooch-behar"), redirect("/constituency/wb/lok-sabha/cooch-behar"));
    // an assembly seat and a Lok Sabha seat of one name: the reader is asked, assembly first
    assert.deepEqual(choices(to("wb", "baharampur")), [
      "wb.ac.007 /constituency/wb/assembly/baharampur",
      "wb.pc.002 /constituency/wb/lok-sabha/baharampur",
    ]);
    assert.deepEqual(choices(to("wb", "twin")), [
      "wb.ac.003 /constituency/wb/assembly/wb.ac.003",
      "wb.ac.004 /constituency/wb/assembly/wb.ac.004",
    ]);
    // `WB` is a 404 here, where a route that names a body ignores the state's case
    assert.deepEqual(to("WB", "mekliganj"), NOT_FOUND);
    // and it has only ever answered to a name: no id, no number, no words joined, no retired name, no other state's
    for (const body of ["wb.ac.001", "1", "001", "coochbehar", "old-name", "aland", "nowhere"]) {
      assert.deepEqual(to("wb", body), NOT_FOUND, body);
    }
    assert.deepEqual(to("ka", "mekliganj"), NOT_FOUND);
  } finally {
    d.close();
  }
});

// ── what each route does about a miss ────────────────────────────────────────────────────────────

test("a request that names nothing: a 404 on every route but one, and a temporary search for that one", () => {
  const d = registry();
  try {
    const misses: [LegacyRequest, LegacyTarget][] = [
      [{ route: "pl-picker", to: "zzz" }, NOT_FOUND],
      [pl(["zz"]), NOT_FOUND],
      [{ route: "mla", id: "c0009" }, NOT_FOUND],
      [{ route: "constituency-id", id: "c0009" }, NOT_FOUND],
      [{ route: "constituency-name", state: "wb", body: "nowhere" }, NOT_FOUND],
      [{ route: "candidate", id: "nobody" }, redirect("/search", false)],
    ];
    for (const [request, want] of misses) assert.deepEqual(ask(request, d), want, JSON.stringify(request));
  } finally {
    d.close();
  }
});

// ── an outage is thrown, a defect is thrown differently, and neither is a 404 ────────────────────

/** Every route that reads the registry, with a request that would otherwise have been answered. */
const READING: LegacyRequest[] = [
  pl(["wb"]),
  { route: "mla", id: "c0001" },
  { route: "candidate", id: "wb26_52" },
  { route: "constituency-id", id: "c0001" },
  { route: "constituency-name", state: "wb", body: "mekliganj" },
];

const scratch = (): string => join(mkdtempSync(join(tmpdir(), "mandate-legacy-")), "registry.db");

test("a registry that cannot be read is thrown by every route that needs it, not answered as a 404 or a redirect", () => {
  const unmigrated = scratch();
  open(unmigrated).close();
  for (const read of [at(scratch()), at(unmigrated)]) {
    for (const request of READING) {
      assert.throws(
        () => legacyTarget(request, read),
        (e: Error) => e.name === "RegistryUnavailableError" && /npm run registry:migrate/.test(e.message),
        JSON.stringify(request),
      );
    }
  }
});

test("a request that needs no registry is answered while the registry is down", () => {
  const gone = at(scratch());
  assert.deepEqual(legacyTarget({ route: "pl-picker", to: "ka" }, gone), redirect("/state/ka"));
  // a path that is no place cannot match anything, so it is a 404 whether or not there is a registry
  assert.deepEqual(legacyTarget(pl(["wb", "a", "b", "c"]), gone), NOT_FOUND);
});

test("a defect in a query is thrown as itself, on every route that reads", () => {
  // The lookups behind a legacy route used to catch everything and answer null, so a bug in their SQL read as
  // "no such constituency" and the route answered 404 for every id in the registry.
  const path = scratch();
  const d = registry(open(path));
  // A table other rows point at cannot be dropped while foreign keys are enforced.
  d.exec("PRAGMA foreign_keys = OFF");
  for (const table of ["place", "person_identifier"]) {
    d.exec(`DROP TABLE ${table}; CREATE VIEW ${table} AS SELECT no_such_function() AS id`);
  }
  d.close();
  for (const request of READING) {
    assert.throws(() => legacyTarget(request, at(path)), /no such function/, JSON.stringify(request));
  }
  // The control: the same registry before the break answers.
  const fine = scratch();
  registry(open(fine)).close();
  for (const request of READING) assert.equal(legacyTarget(request, at(fine)).kind, "redirect", JSON.stringify(request));
});

// ── the whole old URL space, against the seed registry ───────────────────────────────────────────

test("every constituency id in the seed redirects to the assembly seat of that number", opts, () => {
  const rows = seed<{ id: string; name: string }[]>("constituencies");
  assert.ok(rows.length >= 294, `seed has only ${rows.length} constituencies`);

  const missing: string[] = [];
  const wrongName: string[] = [];
  for (const c of rows) {
    const target = legacyTarget({ route: "constituency-id", id: c.id });
    if (target.kind !== "redirect") {
      missing.push(c.id);
      continue;
    }
    assert.equal(target.permanent, true, `${c.id} is a temporary redirect`);
    // CANONICAL, so an old id redirects once. `/constituency/wb/assembly/<name>`, and the district is no longer in
    // the path because a delimitation can move a seat between districts.
    assert.match(target.to, /^\/constituency\/wb\/assembly\/[^/?#]+$/, `${c.id} -> ${target.to} is not a seat route`);
    // The seat is the one the id names, by name, or by its registry id where another seat shares the name.
    const last = target.to.split("/").at(-1) as string;
    if (last !== slugOf(c.name) && !/^wb\.ac\.\d+$/.test(last)) wrongName.push(`${c.id} ${c.name} -> ${last}`);
  }
  assert.deepEqual(missing, [], `${missing.length} constituency ids resolve to nothing`);
  assert.deepEqual(wrongName, [], "an id redirected to a seat of another name");
});

test("every candidate id in the seed redirects to a person", opts, () => {
  const rows = seed<{ id: string; name: string }[]>("candidates");
  assert.ok(rows.length > 2000, `seed has only ${rows.length} candidates`);

  const missing: string[] = [];
  // One handle for all of them, where a session of its own per id would open the registry that many times.
  const d = openRead();
  try {
    for (const c of rows) {
      const target = legacyTarget({ route: "candidate", id: c.id }, over(d));
      if (target.kind !== "redirect" || !target.permanent || !target.to.startsWith("/p/")) missing.push(c.id);
    }
  } finally {
    d.close();
  }
  assert.deepEqual(
    missing.slice(0, 10),
    [],
    `${missing.length} of ${rows.length} candidate ids resolve to nothing`,
  );
});

test("a sitting member resolves for every seat", opts, () => {
  const rows = seed<{ id: string }[]>("constituencies");
  const missing = rows
    .filter((c) => legacyTarget({ route: "mla", id: c.id }).kind !== "redirect")
    .map((c) => c.id);
  // 2026 recorded 293 of 294 winners, so exactly one seat is allowed to have no sitting member.
  assert.ok(
    missing.length <= 1,
    `${missing.length} seats have no resolvable member: ${missing.slice(0, 5).join(", ")}`,
  );
});

test("garbage ids resolve to a 404 rather than throwing", opts, () => {
  for (const bad of ["", "   ", "c9999", "wb26_999999", "'; DROP TABLE person; --", "\u0000"]) {
    assert.deepEqual(legacyTarget({ route: "constituency-id", id: bad }), NOT_FOUND, bad);
    assert.deepEqual(legacyTarget({ route: "mla", id: bad }), NOT_FOUND, bad);
    assert.deepEqual(legacyTarget({ route: "candidate", id: bad }), redirect("/search", false), bad);
  }
});

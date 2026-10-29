// The candidates index: counts equal the registry's own, nothing is ranked, every parameter is read by membership, and the work is bounded.
//
// The registry-backed tests skip without .data/registry.db and take their expectations from SQL of their own, not from the figures a design was
// drawn from: the index's claim is that its counts are the registry's.

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { DEV_DB_PATH, openRead } from "../db/open.ts";
import { all, get } from "../db/index.ts";
import { PAGE_SIZE, SORTS, candidatesIndex } from "./candidates-index.ts";
import { CAREER_SHAPES } from "./person-story.ts";

const HAVE_DB = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const live = { skip: HAVE_DB ? false : "no .data/registry.db — run npm run registry:ingest" };
const db = HAVE_DB ? openRead() : (null as unknown as ReturnType<typeof openRead>);

function counting(real: DatabaseSync): { db: DatabaseSync; count: () => number } {
  let n = 0;
  const proxy = new Proxy(real, {
    get(target, prop) {
      if (prop === "prepare") {
        return (sql: string) => {
          n += 1;
          return target.prepare(sql);
        };
      }
      const v = Reflect.get(target, prop, target) as unknown;
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
  });
  return { db: proxy, count: () => n };
}

const view = (search: Record<string, string> = {}) => candidatesIndex(db, search)!;

test("the counts are the registry's: candidates, seats, winners, and people who had stood before", live, () => {
  const v = view();
  const id = v.election.id;
  const n = (sql: string, ...p: string[]): number => (get<{ n: number }>(db, sql, ...p) as { n: number }).n;
  assert.equal(v.election.candidates, n("SELECT COUNT(*) AS n FROM candidacy ca JOIN contest c ON c.id = ca.contest_id WHERE c.election_id = ?", id));
  assert.equal(v.election.seats, n("SELECT COUNT(*) AS n FROM contest WHERE election_id = ?", id));
  assert.equal(
    v.election.before,
    n(
      `SELECT COUNT(DISTINCT ca.person_id) AS n FROM candidacy ca JOIN contest c ON c.id = ca.contest_id
        WHERE c.election_id = ? AND EXISTS (SELECT 1 FROM candidacy b JOIN contest d ON d.id = b.contest_id JOIN election e2 ON e2.id = d.election_id
                                             JOIN election e1 ON e1.id = ? WHERE b.person_id = ca.person_id AND e2.year < e1.year)`,
      id,
      id,
    ),
  );
  // Every candidate is a row of the list, once, over every page.
  let seen = 0;
  for (let page = 1; page <= v.pages; page++) seen += view({ page: String(page) }).rows.length;
  assert.equal(seen, v.election.candidates);
  assert.equal(v.rows.length, Math.min(PAGE_SIZE, v.election.candidates));
});

test("party facets add up to the candidates, and a party's count is the SQL's", live, () => {
  const v = view();
  assert.equal(v.parties.reduce((a, f) => a + f.n, 0), v.election.candidates, "a candidate is in no party facet or in two");
  const top = v.parties[0]!;
  const sql = (get<{ n: number }>(
    db,
    `SELECT COUNT(*) AS n FROM candidacy ca JOIN contest c ON c.id = ca.contest_id
       LEFT JOIN party_version pv ON pv.id = ca.party_version_id
      WHERE c.election_id = ? AND COALESCE(pv.party_id, NULLIF(ca.party_raw, ''), 'unattached') = ?`,
    v.election.id,
    top.key,
  ) as { n: number }).n;
  assert.equal(top.n, sql);
  assert.ok(v.parties.every((f, i, a) => i === 0 || (a[i - 1] as { n: number }).n >= f.n), "the party facet is not largest first");
});

test("a facet's count honours the other filters and not its own", live, () => {
  const base = view();
  const party = base.parties[1]!;
  const filtered = view({ party: party.key });
  assert.equal(filtered.total, party.n);
  // Another party is still offered, with its own full count: a facet drops only its own filter.
  assert.equal(filtered.parties.length, base.parties.length);
  assert.equal(filtered.parties.find((f) => f.key === party.key)?.on, true);
  // Districts now count only that party's candidates.
  assert.equal(filtered.districts.reduce((a, f) => a + f.n, 0), party.n);
  // And pressing the selected value removes it.
  assert.equal(filtered.parties.find((f) => f.key === party.key)?.href, "/candidates");
});

test("the only orders are name and seat, and a person is never ordered by what they declared", live, () => {
  assert.deepEqual([...SORTS], ["name", "seat"]);
  for (const sort of ["age", "assets", "cases", "margin", "name; DROP TABLE x", ""]) {
    const v = view({ sort });
    assert.equal(v.query.sort, "name", `sort=${sort} was honoured`);
  }
  const byName = view({ sort: "name" }).rows.map((r) => r.display.toLowerCase());
  assert.deepEqual(byName, [...byName].sort(), "the list is not A to Z");
  const bySeat = view({ sort: "seat" }).rows.map((r) => r.seatNumber ?? 1e9);
  assert.deepEqual(bySeat, [...bySeat].sort((a, b) => a - b), "the list is not in seat order");
});

test("every parameter is read by membership: an unknown value is ignored, said so, and never reaches the SQL", live, () => {
  const hostile = ["'; DROP TABLE candidacy; --", "zz", "../../x", "<script>"];
  for (const h of hostile) {
    const v = view({ election: h, party: h, district: h, career: h, page: h });
    assert.equal(v.query.party, null);
    assert.equal(v.query.district, null);
    assert.equal(v.query.career, null);
    assert.equal(v.query.page, 1);
    assert.equal(v.election.id, view().election.id, "an unknown election opened something");
    assert.ok(v.notes.length >= 4, `no note for ${h}: ${JSON.stringify(v.notes)}`);
  }
  assert.ok((get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM candidacy") as { n: number }).n > 0);
  // A page past the end is the last page.
  const v = view();
  assert.equal(view({ page: "999999" }).query.page, v.pages);
});

test("a filter that finds nobody says so, and keeps what was asked in front of the reader", live, () => {
  const v = view({ q: "zzzzzz-nobody" });
  assert.equal(v.total, 0);
  assert.equal(v.rows.length, 0);
  assert.deepEqual(v.chips.map((c) => c.label), ["Name contains “zzzzzz-nobody”"]);
  assert.equal(v.chips[0]?.href, "/candidates");
});

test("career shapes are the five exclusive ones, and Lok Sabha 2024 is only its declared winners", live, () => {
  const v = view({ repeat: "1" });
  assert.ok(v.shapes.every((s) => CAREER_SHAPES.some((c) => c.key === s.key)));
  assert.equal(v.shapes.reduce((a, s) => a + s.n, 0), v.total, "a repeat contestant is in no shape or in two");
  const ls = view({ election: "ls-2024" });
  assert.equal(ls.election.winners, ls.election.candidates, "Lok Sabha 2024 holds more than its winners");
  assert.equal(ls.election.candidates, 42);
});

test("the work is bounded: a handful of statements however many candidates there are, none per row", live, () => {
  const c = counting(db);
  candidatesIndex(c.db, {});
  const first = c.count();
  assert.ok(first <= 8, `${first} statements for a page of ${PAGE_SIZE} rows`);
  const d = counting(db);
  candidatesIndex(d.db, { repeat: "1", sort: "seat", page: "3" });
  assert.equal(d.count(), first, "the number of statements depends on the query");
});

test("every row's links are a person and a seat the registry has", live, () => {
  const v = view();
  for (const r of v.rows) {
    assert.ok(get(db, "SELECT 1 FROM person WHERE id = ?", r.personId) !== undefined, r.personId);
    assert.match(r.seatHref, /^\/constituency\/[a-z]{2}\/(assembly|lok-sabha)\//);
    assert.equal(r.ladder.length, v.columns.length);
  }
  assert.ok(all(db, "SELECT 1 FROM election LIMIT 1").length === 1);
});

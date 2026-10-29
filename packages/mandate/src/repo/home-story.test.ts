// The front page's story, as claims about the data it is built from. The page opens on a sentence, so the sentence has to be true of the
// registry: its numbers are re-derived here from the result table by a different route, and every picture's parts have to add up.
//
// The registry-backed tests skip when there is no .data/registry.db, as the others in this folder do, and take their expected values FROM the
// registry rather than from a name: the story is chosen by rule, and a test that named West Bengal would be asserting the rule's output.

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { DEV_DB_PATH, openRead } from "../db/open.ts";
import { all, get } from "../db/index.ts";
import { storyView } from "./home-story.ts";

const HAVE_DB = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const live = { skip: HAVE_DB ? false : "no .data/registry.db — run npm run registry:ingest" };
const db = HAVE_DB ? openRead() : (null as unknown as ReturnType<typeof openRead>);

/** Every jurisdiction that has an assembly election with a declared winner, as the page would offer them. */
function candidates(): { id: string; name: string }[] {
  return all<{ id: string; name: string }>(
    db,
    `SELECT DISTINCT e.jurisdiction_place_id AS id, COALESCE(p.canonical_name, e.jurisdiction_place_id) AS name
       FROM election e JOIN contest c ON c.election_id = e.id JOIN result r ON r.contest_id = c.id
       LEFT JOIN place p ON p.id = e.jurisdiction_place_id
      WHERE e.house = 'ac' AND r.is_winner = 1`,
  );
}

test("the lead's seats in the sentence are the declared winners of its party, counted from the result table", live, () => {
  const v = storyView(db, { candidates: candidates() });
  assert.ok(v !== null, "the registry has an assembly with results and the page has no story");
  // By a different route from the view's: the winner rows at the current revision, and the party a winner's candidacy names (the id of its
  // party version's party, else the string the source printed), straight from the tables.
  const [{ n }] = all<{ n: number }>(
    db,
    `SELECT COUNT(*) AS n
       FROM result r JOIN contest c ON c.id = r.contest_id JOIN candidacy k ON k.id = r.candidacy_id
       LEFT JOIN party_version pv ON pv.id = k.party_version_id
      WHERE c.election_id = ? AND r.is_winner = 1 AND r.revision = 0
        AND COALESCE(pv.party_id, NULLIF(k.party_raw, ''), 'unattached') = ?`,
    v.latest.id,
    v.lead.key,
  ) as [{ n: number }];
  assert.equal(v.sentence.seats, n, "the sentence's seat count is not the result table's");
});

test("every bar is the whole house: its segments add up to the seats, and the half-house is half of them", live, () => {
  const v = storyView(db, { candidates: candidates() })!;
  assert.ok(v.houses.length >= 1);
  for (const h of v.houses) {
    assert.equal(h.segments.reduce((n, s) => n + s.n, 0), h.total, `${h.year}: the segments are not the house`);
    assert.ok(Math.abs(h.segments.reduce((n, s) => n + s.share, 0) - 1) < 1e-9, `${h.year}: shares do not sum to 1`);
    assert.equal(h.tally.reduce((n, t) => n + t.seats, 0) + h.undeclared, h.total, `${h.year}: the table twin is not the picture`);
    assert.ok(h.segments.every((s) => s.n > 0), `${h.year}: a segment with no seat is drawn`);
  }
  assert.equal(v.half, v.total / 2);
  assert.equal(v.houses.at(-1)?.year, v.latest.year);
});

test("an election with no vote counts has no vote share: the votes are null, never zero", live, () => {
  const v = storyView(db, { candidates: candidates() })!;
  const latest = v.votes.lead.at(-1)!;
  if (v.countsLatest) {
    assert.ok(latest.votePct !== null);
    return;
  }
  assert.equal(latest.votePct, null, "a vote share is printed for an election that published no counts");
  for (const pt of v.votes.partner ?? []) if (pt.electionId === latest.electionId) assert.equal(pt.votePct, null);
  for (const a of v.votes.all) assert.equal(a.points.at(-1)?.votePct, null);
  assert.ok(v.scope.includes("never votes"), "the scope sentence does not say the votes were not published");
});

test("a margin from an election with no counts is declared, kept apart from the counted ones, and has no share", live, () => {
  const v = storyView(db, { candidates: candidates() })!;
  const shares = v.close.counted.map((c) => c.share);
  assert.deepEqual(shares, [...shares].sort((a, b) => a - b), "the counted list is not closest first");
  assert.ok(v.close.counted.length <= 5 && v.close.declared.length <= 3);
  const votes = v.close.declared.map((d) => d.votes);
  assert.deepEqual(votes, [...votes].sort((a, b) => a - b), "the declared list is not smallest first");
  for (const d of v.close.declared) assert.ok(!("share" in d), "a declared margin carries a share");
  assert.ok(v.close.declared.length === 0 || v.countsLatest === false, "declared margins listed for an election that has counts");
});

test("the people who were always there each won one seat for one party at every election of the house", live, () => {
  const v = storyView(db, { candidates: candidates() })!;
  if (v.streak === null) return;
  assert.ok(v.streak.rows.length >= 3, "a streak under three people is drawn");
  for (const r of v.streak.rows) {
    assert.equal(r.cells.length, v.houses.length, `${r.name}: a cell is missing`);
    assert.equal(new Set(r.cells.map((c) => c.party.key)).size, 1, `${r.name}: changed party, so is not one party's streak`);
    assert.ok(r.personHref.startsWith("/p/") && r.href.startsWith("/constituency/"));
  }
  const last = v.streak.rows.map((r) => r.cells.at(-1)?.margin?.votes ?? 0);
  assert.deepEqual(last, [...last].sort((a, b) => b - a), "the table is not ordered by the latest margin");
});

test("a name that is not a candidate is ignored, and a hostile one never reaches the query", live, () => {
  const c = candidates();
  const plain = storyView(db, { candidates: c });
  for (const chosen of ["zz", "'; DROP TABLE election; --", "wb' OR '1'='1", "", "../../etc/passwd"]) {
    const v = storyView(db, { candidates: c, chosen });
    assert.deepEqual(v?.jurisdiction, plain?.jurisdiction, `chosen=${JSON.stringify(chosen)} changed the story`);
  }
  assert.equal(all<{ n: number }>(db, "SELECT COUNT(*) AS n FROM election")[0]!.n > 0, true, "the election table is gone");
});

test("a registry with no assembly result tells no story", live, () => {
  assert.equal(storyView(db, { candidates: [] }), null);
  assert.equal(storyView(db, { candidates: [{ id: "no-such-place", name: "Nowhere" }] }), null);
});

test("the story reads no turnout: the word is nowhere in the code that builds it", () => {
  const code = readFileSync(new URL("./home-story.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /turnoutPct|\.turnout\b|electors/, "home-story.ts reads a turnout or an electors figure");
});

test("the story is the reader's state when they chose one and the most recent election when they did not, and the view says which", live, () => {
  const c = candidates();
  const byDefault = storyView(db, { candidates: c })!;
  assert.equal(byDefault.basis, "latest");
  assert.equal(byDefault.choices, c.length, "the view does not say how many states there were to choose between");
  // The default is a rule about the data: no candidate has a more recent election than the one shown.
  const year = (id: string): number => (get<{ y: number }>(db, "SELECT MAX(year) AS y FROM election WHERE jurisdiction_place_id = ? AND house = 'ac'", id) as { y: number }).y;
  assert.ok(c.every((x) => year(x.id) <= year(byDefault.jurisdiction.id)), "a more recent election than the default's exists");
  for (const x of c) {
    const asked = storyView(db, { candidates: c, chosen: x.id })!;
    assert.equal(asked.basis, "asked");
    assert.equal(asked.jurisdiction.id, x.id, "the reader's state was not the one shown");
  }
  assert.equal(storyView(db, { candidates: c, chosen: "zz" })?.basis, "latest", "an unknown state was taken for a choice");
});

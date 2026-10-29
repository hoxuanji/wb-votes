// What the person page says, on the registry's own examples and on every person in it.
//
// The sentence is composed from rules, so the claims worth holding are the ones eyes cannot: it is never empty, every number is in the person's rows,
// a margin with no counts behind it is called declared, and no sentence uses a pronoun, "never", "first time" or "only". They are held on all 6,167
// people, not on the nine the design was drawn from.

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { DEV_DB_PATH, openRead } from "../db/open.ts";
import { all } from "../db/index.ts";
import { auditFinding, plain } from "./finding.ts";
import { getPersonBrief } from "./person.ts";
import { CAREER_SHAPES, careerShape, marginCols, personFinding, runColumns, won } from "./person-story.ts";
import { readSeatHistory } from "./seat-history.ts";
import { marginColumns } from "../viz/margin-columns.ts";

const HAVE_DB = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const live = { skip: HAVE_DB ? false : "no .data/registry.db — run npm run registry:ingest" };
const db = HAVE_DB ? openRead() : (null as unknown as ReturnType<typeof openRead>);

function load(id: string) {
  const brief = getPersonBrief(db, id)!;
  const latest = brief.candidacies[0];
  const history = latest === undefined ? null : readSeatHistory(db, latest.versionId);
  return { brief, latest, history };
}
const said = (id: string): string => {
  const { brief, history } = load(id);
  const f = personFinding(brief, { history });
  return plain([...f.parts, ...(f.standfirst === undefined ? [] : [{ t: " | " }, ...f.standfirst])]);
};

test("four wins, three counted and one declared: the sentence and the margins it rests on", live, () => {
  assert.equal(
    said("pulak-roy-0d657a"),
    "Won Uluberia Dakshin for TMC at all 4 elections on record, 2011 to 2026. | Counted margins: 11,832 (2011), 35,344 (2016), 28,438 (2021). 2026: a declared margin of 17,187; no vote counts are published.",
  );
});

test("lost first, then won: the loss is stated by its counted margin", live, () => {
  assert.match(said("niamot-sheikh-21a0df"), /^Lost Hariharpara by 6,358 votes in 2011, won it in 2016 and has held it since\./);
});

test("shares rising across counted losses, then a declared win", live, () => {
  assert.match(said("dadhiram-ray-a22815"), /^Rose from 12\.9% to 42\.6% of the vote at Mekliganj, then won the seat in 2026\./);
});

test("won three times, then the seat went to another: named, with the declared margin", live, () => {
  assert.match(said("dr-shashi-panja-80cf23"), /^Won Shyampukur three times for TMC, 2011 to 2021\. In 2026 the seat went to Purnima Chakraborty BJP by a declared 14,633 votes\./);
});

test("a 2026-only non-winner is not said to have lost, and the seat's winner is named with the declared margin", live, () => {
  const s = said("hiten-barman-ca794e");
  assert.match(s, /^Stood for SUCI\(C\) at Mekliganj in 2026\. The seat was won by Dadhiram Ray BJP by a declared 29,584 votes\./);
  assert.match(s, /no vote count, rank or share is on record for Hiten Barman/);
  assert.doesNotMatch(s, /\blost\b|defeated/i);
});

test("a winner with no result row is won, said once, with no press margin", live, () => {
  const s = said("debangshu-panda-208a83");
  assert.match(s, /^Won Falta \(Assembly\) for BJP in 2026\./);
  assert.match(s, /result table holds no row for this contest/);
  assert.doesNotMatch(s, /109,021/);
});

test("a Lok Sabha-only winner and a press-only person", live, () => {
  assert.match(said("manoj-tigga-9fd1fd"), /^Won Alipurduars \(Lok Sabha\) for BJP in 2024 by a declared 75,447 votes\./);
  assert.match(said("humayun-kabir-1af54d"), /^Named as a member of the .* in a press report; no contest is on record for Humayun Kabir\./);
});

test("every person in the registry gets a sentence that keeps the rules", live, () => {
  const ids = all<{ id: string }>(db, "SELECT id FROM person ORDER BY id").map((r) => r.id);
  assert.ok(ids.length > 6000, `only ${ids.length} people`);
  const shapes = new Map<string, number>();
  for (const id of ids) {
    const { brief, history } = load(id);
    const f = personFinding(brief, { history });
    shapes.set(f.shape, (shapes.get(f.shape) ?? 0) + 1);
    const problems = auditFinding(f, {
      haystack: JSON.stringify(brief) + JSON.stringify(history),
      hasCounts: brief.candidacies.every((c) => c.votes !== null || c.margin === null),
    });
    assert.deepEqual(problems, [], `${id}: ${plain(f.parts)}`);
    const all2 = plain([...f.parts, ...(f.standfirst ?? [])]);
    assert.doesNotMatch(all2, /\b(never|first time|only|ever|veteran|defector|new face)\b/i, `${id}: ${all2}`);
    assert.doesNotMatch(all2, /Standing at|Awaiting a result/, `${id}: a retired phrase is back`);
  }
  for (const k of ["won-all", "lost-then-won", "rose", "won-then-not", "won-one", "stood-one", "press"]) assert.ok((shapes.get(k) ?? 0) > 0, `no person has a ${k} sentence: ${JSON.stringify([...shapes])}`);
});

test("careers of two or more contests fall into five exclusive shapes that account for every one", live, () => {
  const ids = all<{ id: string }>(db, "SELECT person_id AS id FROM candidacy GROUP BY person_id HAVING COUNT(*) >= 2").map((r) => r.id);
  const counts = new Map<string, number>();
  for (const id of ids) {
    const b = getPersonBrief(db, id)!;
    const shape = careerShape([...b.candidacies].reverse().map(won));
    assert.ok(shape !== null);
    counts.set(shape, (counts.get(shape) ?? 0) + 1);
  }
  assert.equal([...counts.values()].reduce((a, b) => a + b, 0), ids.length);
  assert.deepEqual(CAREER_SHAPES.map((s) => counts.get(s.key) ?? 0), [162, 48, 136, 299, 14], "the shapes are not the ones the registry was measured to hold");
});

test("a career is shaped from its outcomes oldest first, and one contest has no shape", () => {
  assert.equal(careerShape([true]), null);
  assert.equal(careerShape([true, true, true]), "every");
  assert.equal(careerShape([false, false]), "none");
  assert.equal(careerShape([false, true, true]), "lost-then-won");
  assert.equal(careerShape([true, true, false]), "won-then-not");
  assert.equal(careerShape([true, false, true]), "mixed");
});

test("the run has a column per election of the seat, blank where the person has no candidacy, and dashed exactly where the margin is declared", live, () => {
  const { brief, latest, history } = load("niamot-sheikh-21a0df");
  const cols = runColumns(brief, history!, latest!.versionId);
  assert.deepEqual(cols.map((c) => [c.year, c.mine?.glyph, c.mine?.margin?.votes, c.mine?.margin?.basis]), [
    [2011, "rank", -6358, "counted"],
    [2016, "won", 5003, "counted"],
    [2021, "won", 14066, "counted"],
    [2026, "won", 12665, "declared"],
  ]);
  const placed = marginColumns(marginCols(cols), { signed: true });
  assert.deepEqual(placed.cols.map((c) => c.dir), ["down", "up", "up", "up"]);
  assert.deepEqual(placed.cols.map((c) => c.dashed), [false, false, false, true]);

  const d = load("dadhiram-ray-a22815");
  const dc = runColumns(d.brief, d.history!, d.latest!.versionId);
  assert.equal(dc[0]?.mine, null, "a year the person has no candidacy for is blank, not a loss");
  assert.deepEqual(dc.slice(1).map((c) => [c.year, c.mine?.glyph, c.mine?.rank]), [[2016, "rank", 3], [2021, "rank", 2], [2026, "won", 1]]);

  const f = load("debangshu-panda-208a83");
  const fc = runColumns(f.brief, f.history!, f.latest!.versionId);
  assert.equal(fc.at(-1)?.mine?.namedAsElected, true);
  assert.equal(fc.at(-1)?.holder?.label, "BJP", "the column of a win with no result row has a holder from the candidacy record");
});

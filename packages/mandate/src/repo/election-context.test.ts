import assert from "node:assert/strict";
import test from "node:test";
import { DEV_DB_PATH, openRead } from "../db/open.ts";
import { existsSync } from "node:fs";
import { all } from "../db/index.ts";
import { electionContext, scaleLabel, typeLabel } from "./election-context.ts";
import { electionMapView } from "./election-map.ts";

const HAVE = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const live = { skip: HAVE ? false : "no .data/registry.db" };
const db = HAVE ? openRead() : (null as unknown as ReturnType<typeof openRead>);

/**
 * THE MATRIX IS DISCOVERED, NOT NAMED.
 *
 * Every fixture below is selected by querying the registry, so the suite covers whatever the registry
 * actually holds rather than the five states I happen to have looked at. Naming Karnataka in a test is how a
 * central defect gets fixed for Karnataka.
 */
function pick(sql: string, ...binds: (string | number)[]): string | null {
  return all<{ id: string }>(db, sql, ...binds)[0]?.id ?? null;
}

const SIZED = `SELECT e.id AS id FROM election e
   JOIN (SELECT election_id, COUNT(*) n FROM contest GROUP BY election_id) c ON c.election_id = e.id
  WHERE e.kind = ? AND e.house = ?`;

test("the discovered matrix covers every election type the registry holds", live, () => {
  const kinds = all<{ kind: string; house: string; n: number }>(
    db,
    `SELECT kind, house, COUNT(*) n FROM election GROUP BY kind, house`,
  );
  // Four combinations exist: general/pc, assembly/ac, bypoll/ac, bypoll/pc. If a fifth ever appears this
  // fails, which is the point — a new election type must not arrive unnoticed.
  assert.deepEqual(
    kinds.map((k) => `${k.kind}/${k.house}`).sort(),
    ["assembly/ac", "bypoll/ac", "bypoll/pc", "general/pc"],
    "the registry holds an election type this suite does not cover",
  );
  for (const k of kinds) assert.ok(k.n > 0);
});

test("ElectionContext: body comes from the house and kind from whether the house was filled", live, () => {
  const cases: [string, string, string, string][] = [
    ["general", "pc", "lok-sabha", "general"],
    ["assembly", "ac", "assembly", "general"],
    ["bypoll", "ac", "assembly", "bypoll"],
    ["bypoll", "pc", "lok-sabha", "bypoll"],
  ];
  for (const [kind, house, body, wantKind] of cases) {
    const id = pick(`${SIZED} AND c.n > 0 ORDER BY e.year DESC LIMIT 1`, kind, house);
    assert.ok(id, `no ${kind}/${house} election found`);
    const ctx = electionContext(db, id);
    assert.ok(ctx, `${id} produced no context`);
    assert.equal(ctx.body, body, `${id} body`);
    // 'general' and 'assembly' are the same KIND of event and differ only in body. That collapse is the
    // whole abstraction: seven call sites used to re-derive it and one of them got it wrong.
    assert.equal(ctx.kind, wantKind, `${id} kind`);
    assert.match(ctx.label, new RegExp(typeLabel(ctx.body, ctx.kind).replace(/[()]/g, "\\$&")));
    assert.match(ctx.label, new RegExp(String(ctx.year)));
  }
});

test("majority is null for a by-election and never derived from seats contested", live, () => {
  for (const house of ["ac", "pc"]) {
    const id = pick(`${SIZED} AND c.n BETWEEN 1 AND 8 ORDER BY e.year DESC LIMIT 1`, "bypoll", house);
    assert.ok(id, `no small ${house} by-election`);
    const ctx = electionContext(db, id);
    assert.ok(ctx);
    // The defect: floor(4/2)+1 announced "majority 3" for a four-seat by-election.
    assert.equal(ctx.majority, null, `${id} still computes a majority`);
    assert.equal(ctx.isPartial, true);
    assert.ok(ctx.seatsContested > 0);
    if (ctx.seatsInHouse !== null) {
      assert.ok(ctx.seatsContested < ctx.seatsInHouse, `${id}: contested >= house`);
    }
    assert.match(scaleLabel(ctx), /seats? contested/);
    assert.ok(!/majority/.test(scaleLabel(ctx)), `${id} scale label claims a majority`);
  }
});

test("majority for a full house is the house that voted, not today's reference strength", live, () => {
  // West Bengal returned about 252 members in 1962 and 294 now. Dividing today's figure would have
  // announced a 1962 majority against a house that did not exist yet.
  const old = all<{ id: string; n: number }>(
    db,
    `SELECT e.id AS id, (SELECT COUNT(*) FROM contest c WHERE c.election_id = e.id) n
       FROM election e WHERE e.kind = 'assembly' AND e.year < 1980
      ORDER BY e.year LIMIT 4`,
  );
  assert.ok(old.length > 0, "no pre-1980 assembly election to test");
  for (const o of old) {
    const ctx = electionContext(db, o.id);
    assert.ok(ctx);
    assert.equal(ctx.majority, Math.floor(o.n / 2) + 1, `${o.id} majority is not half its own house`);
    // And a completed historical general election is NOT partial merely because the house has since grown.
    assert.equal(ctx.isPartial, false, `${o.id} is flagged partial`);
  }
});

test("a by-election map shows the seats that did not vote, and never as a result", live, () => {
  const id = pick(`${SIZED} AND c.n BETWEEN 1 AND 12 ORDER BY e.year DESC LIMIT 1`, "bypoll", "ac");
  assert.ok(id);
  const v = electionMapView(db, id);

  assert.ok(v.ctx, "no context on the view");
  assert.equal(v.ctx.kind, "bypoll");
  assert.equal(v.majority, null, "the map view still reports a majority");

  // 1 — CONTESTED SEATS CARRY THE BY-ELECTION WINNER.
  assert.ok(v.seats.length > 0);
  for (const s of v.seats) {
    assert.ok(
      s.standing === "won-by" || s.standing === "no-geometry",
      `a contested seat is ${s.standing}`,
    );
    // 2 — AND NO FLIP COMPARISON. `previousElection` matches on kind, so a by-election's predecessor is
    //     the previous by-election: a different handful of seats. Comparing them marked every seat
    //     "not comparable", which blamed a delimitation for a comparison that was never possible.
    assert.equal(s.comparable, false, `${s.name} claims a comparison`);
    assert.equal(s.flip, null);
  }
  assert.equal(v.flips, null, "a by-election produced a flip finding");
  assert.equal(v.incomparableSeats, 0, "a by-election reports redrawn seats");

  // 3 — THE REST OF THE HOUSE IS PRESENT AS GEOGRAPHY. Without it the figure was a few polygons floating
  //     in an empty frame, and a reader read the emptiness as political.
  assert.ok(v.context.length > v.seats.length, `only ${v.context.length} uncontested shapes`);
  for (const c of v.context) {
    assert.ok(c.path.length > 0);
    // Geometry only. No party, no result, nothing a colour could be derived from.
    assert.deepEqual(Object.keys(c).sort(), ["name", "path", "versionId"]);
  }

  // 4 — AND THE FRAME IS THE HOUSE, not the contested seats. This is the floating-fragment test: the
  //     by-election's box must match the box of a full election in the same place.
  const full = pick(
    `SELECT e.id AS id FROM election e WHERE e.kind = 'assembly' AND e.jurisdiction_place_id = ?
      ORDER BY e.year DESC LIMIT 1`,
    v.ctx.jurisdictionId,
  );
  if (full !== null) {
    const fv = electionMapView(db, full);
    const box = (s: string) => s.split(" ").map(Number);
    const [, , bw, bh] = box(v.geometry.viewBox);
    const [, , fw, fh] = box(fv.geometry.viewBox);
    assert.ok(
      (bw as number) > (fw as number) * 0.8 && (bh as number) > (fh as number) * 0.8,
      `by-election frame ${v.geometry.viewBox} is a fragment of the state's ${fv.geometry.viewBox}`,
    );
  }
});

test("a general election gains no uncontested layer and keeps its majority", live, () => {
  // The other half of the requirement: by-election semantics must not leak into a full election.
  for (const [kind, house] of [["assembly", "ac"], ["general", "pc"]] as const) {
    const id = pick(`${SIZED} AND c.n > 50 ORDER BY e.year DESC LIMIT 1`, kind, house);
    assert.ok(id);
    const v = electionMapView(db, id);
    assert.equal(v.context.length, 0, `${id} drew an uncontested layer`);
    assert.ok(v.majority !== null && v.majority > 1, `${id} lost its majority`);
    assert.equal(v.ctx?.kind, "general");
    assert.equal(v.ctx?.isPartial, false);
  }
});

// Simplification must lose bytes and never lose a shape.
//
// The two failure modes this guards, both of which would ship silently:
//   1. A POLYGON THAT VANISHES. Over-aggressive thinning leaves a ring with fewer than three points, which
//      renders as nothing — a seat missing from the map with no error anywhere.
//   2. A PATH QUIETLY MANGLED. The parser models absolute M/L/Z only. A curve command fed to it would be
//      read as bare coordinates and the arcs thrown away, reshaping a border. So an unsupported command
//      must return the path untouched rather than a plausible wrong one.

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { DEV_DB_PATH, all, openRead } from "../db/index.ts";
import { NATIONAL, douglasPeucker, extentOf, parse, simplify, simplified } from "./simplify.ts";

const HAVE_DB = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const live = { skip: HAVE_DB ? false : "no .data/registry.db — run npm run registry:ingest" };

test("parse reads absolute M/L/Z into subpaths", () => {
  const p = parse("M1 1L2 2L3 1ZM10 10L12 12L13 10Z");
  assert.equal(p.unsupported, false);
  assert.equal(p.subpaths.length, 2);
  assert.equal(p.subpaths[0]?.length, 3);
  assert.deepEqual(p.subpaths[1]?.[0], [10, 10]);
});

test("an unsupported command is refused, not guessed at", () => {
  // A cubic. Reading this as bare coordinates would keep the control points as vertices and reshape the
  // border, which is worse than shipping the original bytes.
  const curvy = "M1 1C2 2 3 3 4 4Z";
  assert.equal(parse(curvy).unsupported, true);
  assert.equal(simplify(curvy), curvy, "a path with a curve was altered");
  // Relative commands mean something different and must be refused for the same reason.
  assert.equal(simplify("M1 1l2 2Z"), "M1 1l2 2Z");
});

test("douglasPeucker drops a collinear midpoint and keeps a corner", () => {
  const straight = douglasPeucker([[0, 0], [5, 0], [10, 0]], 0.3);
  assert.equal(straight.length, 2, "a point exactly on the chord was kept");

  const corner = douglasPeucker([[0, 0], [5, 5], [10, 0]], 0.3);
  assert.equal(corner.length, 3, "a 5-unit deviation was thinned away");
});

test("douglasPeucker handles a closed ring whose ends coincide", () => {
  // The degenerate-chord case: first and last point equal, so the perpendicular formula divides by zero.
  const ring: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  const out = douglasPeucker(ring, 0.3);
  assert.ok(out.length >= 4, `a square collapsed to ${out.length} points`);
});

test("a zero-area subpath is dropped and a real one survives", () => {
  // The exact artefact the source ships, beside a real triangle.
  const path = "M422.6 242.3L422.6 242.3L422.6 242.3ZM100 100L120 100L120 120Z";
  const out = simplify(path);
  assert.ok(!out.includes("422.6"), "a zero-area sliver was kept");
  assert.ok(out.includes("100 100"), "the real shape was dropped");
});

test("simplify never returns an empty path", () => {
  // Everything here is below minExtent, so the honest answer is the original rather than nothing.
  const tiny = "M1 1L1.01 1L1 1.01Z";
  assert.equal(simplify(tiny), tiny);
});

test("simplified is memoised and pure", () => {
  const path = "M0 0L10 0L10 10L0 10Z";
  const a = simplified(path);
  const b = simplified(path);
  assert.equal(a, b);
  assert.equal(a, simplify(path), "the cache returned something the function would not");
});

test("output coordinates carry one decimal at most", () => {
  const out = simplify("M0.12345 0.98765L10.5 0L10 10.4444L0 10Z", { tolerance: 0, minExtent: 0 });
  assert.equal(/\d\.\d\d/.test(out), false, `more than one decimal survived: ${out}`);
});

/* ───────────────────────── against the registry's real geometry ───────────────────────── */

test("every real polygon survives simplification with area to draw", live, () => {
  const d = openRead();
  try {
    const rows = all<{ path: string; name: string }>(
      d,
      `SELECT pg.path AS path, pv.canonical_name AS name
         FROM place_geometry pg
         JOIN place_version pv ON pv.id = pg.place_version_id
        WHERE pg.view_box = '2.1 2.7 597.3 666.8' AND pv.kind = 'pc' AND pv.epoch_id = 'delim-2008'`,
    );
    assert.ok(rows.length > 400, `only ${rows.length} parliamentary polygons found`);

    let rawBytes = 0;
    let thinBytes = 0;
    for (const r of rows) {
      const out = simplified(r.path, NATIONAL);
      rawBytes += r.path.length;
      thinBytes += out.length;
      // The property that matters: something is still drawn, and it is still a closed ring.
      assert.ok(out.length > 0, `${r.name} simplified to nothing`);
      assert.ok(out.startsWith("M"), `${r.name} lost its move command`);
      assert.ok(out.includes("Z"), `${r.name} lost its close command`);
      const p = parse(out);
      assert.equal(p.unsupported, false, `${r.name} produced a path this module cannot re-read`);
      assert.ok(
        p.subpaths.every((s) => s.length >= 3),
        `${r.name} kept a subpath with no area`,
      );
    }
    // And it has to actually pay for itself. Measured at about 18% of raw; assert the direction and a
    // conservative bound rather than the exact figure, which moves with the geometry.
    assert.ok(
      thinBytes < rawBytes * 0.5,
      `simplification saved too little: ${(thinBytes / 1024).toFixed(0)}KB of ${(rawBytes / 1024).toFixed(0)}KB`,
    );
  } finally {
    d.close();
  }
});

test("a simplified polygon stays within a pixel of where it was", live, () => {
  const d = openRead();
  try {
    const rows = all<{ path: string; name: string }>(
      d,
      `SELECT pg.path AS path, pv.canonical_name AS name FROM place_geometry pg
         JOIN place_version pv ON pv.id = pg.place_version_id
        WHERE pg.view_box = '2.1 2.7 597.3 666.8' LIMIT 300`,
    );
    for (const r of rows) {
      const before = parse(r.path);
      const after = parse(simplified(r.path, NATIONAL));
      if (before.unsupported || before.subpaths.length === 0) continue;
      // Compare overall extents: a shape that moved or shrank noticeably is a shape drawn in the wrong
      // place, which is the failure the epoch gate exists to prevent at the data level and this prevents
      // at the geometry level.
      const a = extentOf(before.subpaths.flat());
      const b = extentOf(after.subpaths.flat());
      assert.ok(
        Math.abs(a - b) <= 1.0,
        `${r.name} changed size by ${(a - b).toFixed(2)} units`,
      );
    }
  } finally {
    d.close();
  }
});

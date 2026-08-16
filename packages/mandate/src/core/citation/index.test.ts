import test from "node:test";
import assert from "node:assert/strict";
import { cited } from "./index.ts";
import type { Cited, Citation } from "./index.ts";

const c: Citation = {
  claimId: 1,
  sourceId: "eci-form20-wb2021-c0001",
  pageNo: 3,
  rect: null,
  parserVersion: "form20@1",
  extractedAt: "2026-08-07T03:00:00Z",
};

test("cited carries the value and its citations", () => {
  assert.deepEqual(cited(72.8, [c]), { value: 72.8, citations: [c] });
});

test("cited throws without provenance — P2 is not advisory", () => {
  assert.throws(() => cited(72.8, []), /P2/);
  // The runtime path that matters: an array built by a query that returned nothing.
  const fromQuery: Citation[] = [];
  assert.throws(() => cited(72.8, fromQuery), /P2/);
});

test("Cited<T> cannot be written by hand without a citation", () => {
  // Half of P2 is compile-time: the object literal below is the sidestep — construct the shape
  // directly and never call cited(). It must not typecheck. @ts-expect-error IS the assertion:
  // registry:typecheck fails if this line ever becomes legal, i.e. if `citations` stops being a
  // non-empty tuple. Deleting this test deletes the only check on that.
  // @ts-expect-error Type '[]' is not assignable to type '[Citation, ...Citation[]]'
  const empty: Cited<number> = { value: 72.8, citations: [] };
  assert.deepEqual(empty.citations, [], "the value still exists at runtime; only the type refuses");

  // And the honest one compiles, so the tuple is not merely unsatisfiable.
  const ok: Cited<number> = { value: 72.8, citations: [c] };
  assert.equal(ok.citations[0].sourceId, "eci-form20-wb2021-c0001");
});

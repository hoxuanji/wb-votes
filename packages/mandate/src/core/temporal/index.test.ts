import test from "node:test";
import assert from "node:assert/strict";
import { asOf, contains } from "./index.ts";

// The boundary semantics, spelled out because every temporal bug in this domain is an inclusive
// bound that should have been exclusive: WB polled on 2011-05-20 and a version that ended that day
// must not answer for it.
const versions = [
  { id: 1, validFrom: "1998-01-01", validTo: "2011-05-20" },
  { id: 2, validFrom: "2011-05-20", validTo: null },
];

test("asOf: validFrom inclusive, validTo exclusive", () => {
  assert.equal(asOf(versions, "1998-01-01")?.id, 1, "exactly on validFrom is IN");
  assert.equal(asOf(versions, "2011-05-19")?.id, 1, "the day before validTo is IN");
  assert.equal(asOf(versions, "2011-05-20")?.id, 2, "exactly on validTo belongs to the NEXT version");
  assert.equal(asOf(versions, "2026-08-07")?.id, 2, "open-ended validTo runs forever");
  assert.equal(asOf(versions, "1997-12-31"), undefined, "before every window");
  assert.equal(asOf([], "2026-08-07"), undefined, "no versions at all");
});

test("contains handles the open window", () => {
  assert.equal(contains({ validFrom: "2011-05-20", validTo: null }, "9999-12-31"), true);
  assert.equal(contains({ validFrom: "2011-05-20", validTo: null }, "2011-05-19"), false);
  assert.equal(contains({ validFrom: "2011-05-20", validTo: null }, "2011-05-20"), true);
});

test("a zero-length window contains nothing, including its own date", () => {
  // A party renamed and renamed back on the same day: the middle version was never in force, and
  // half-open [x, x) is what makes that fall out rather than needing a special case.
  const zero = { validFrom: "2021-05-05", validTo: "2021-05-05" };
  assert.equal(contains(zero, "2021-05-04"), false);
  assert.equal(contains(zero, "2021-05-05"), false, "validFrom == validTo excludes the day itself");
  assert.equal(contains(zero, "2021-05-06"), false);
  assert.equal(
    asOf([zero, { validFrom: "2021-05-05", validTo: null }], "2021-05-05")?.validTo,
    null,
    "asOf skips the zero-length window and finds the live one",
  );
});

test("string compare is the whole implementation — no Date, no timezone", () => {
  // Zero-padding is what makes lexicographic == chronological. 2011-09-01 < 2011-10-01 as strings
  // only because the month is padded; "9" > "10" would invert it.
  assert.equal(contains({ validFrom: "2011-09-01", validTo: "2011-10-01" }, "2011-09-30"), true);
  assert.equal(contains({ validFrom: "2011-09-01", validTo: "2011-10-01" }, "2011-10-01"), false);
  // An ISO timestamp compares correctly against a date prefix, which is how declaredAt columns sort.
  assert.equal(contains({ validFrom: "2021-05-02", validTo: null }, "2021-05-02T18:30:00Z"), true);
});

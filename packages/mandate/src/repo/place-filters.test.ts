import assert from "node:assert/strict";
import test from "node:test";
import { parseFilters } from "./place-filters.ts";

const base = "/constituency/wb/assembly/mekliganj/analysis";
const opts = { base, years: [2026, 2021, 2016, 2011], parties: ["AIFB", "BJP", "TMC"] };

test("parseFilters: valid params pass, chips drop exactly one param each", () => {
  const p = parseFilters({ from: "2016", to: "2026", party: "bjp" }, opts);
  assert.deepEqual(p.filters, { fromYear: 2016, toYear: 2026, party: "BJP" });
  assert.deepEqual(p.ignored, []);
  assert.deepEqual(
    p.chips.map((c) => c.href),
    [`${base}?to=2026&party=BJP`, `${base}?from=2016&party=BJP`, `${base}?from=2016&to=2026`],
  );
  assert.deepEqual(p.chips.map((c) => c.label), ["From 2016", "To 2026", "Party BJP"]);
});

test("parseFilters: a lone filter's chip returns to the unfiltered view", () => {
  const p = parseFilters({ party: "TMC" }, opts);
  assert.deepEqual(p.chips, [{ label: "Party TMC", href: base }]);
});

test("parseFilters: invalid params are rejected with a reason, never silently applied", () => {
  const bad = parseFilters({ from: "abc", to: "1999", party: "XYZ" }, opts);
  assert.deepEqual(bad.filters, { fromYear: undefined, toYear: undefined, party: undefined });
  assert.equal(bad.chips.length, 0);
  assert.equal(bad.ignored.length, 3);
  assert.match(bad.ignored[0] ?? "", /from=abc ignored.*2011–2026/);
  assert.match(bad.ignored[1] ?? "", /to=1999 ignored/);
  assert.match(bad.ignored[2] ?? "", /party=XYZ ignored.*AIFB, BJP, TMC/);
});

test("parseFilters: from after to drops from, keeps to", () => {
  const p = parseFilters({ from: "2026", to: "2011" }, opts);
  assert.deepEqual(p.filters, { fromYear: undefined, toYear: 2011, party: undefined });
  assert.match(p.ignored[0] ?? "", /from=2026 ignored: it is after to=2011/);
});

test("parseFilters: a repeated param takes the first, a blank one is absent", () => {
  const p = parseFilters({ from: ["2016", "2021"], party: "  " }, opts);
  assert.deepEqual(p.filters, { fromYear: 2016, toYear: undefined, party: undefined });
  assert.deepEqual(p.ignored, []);
});

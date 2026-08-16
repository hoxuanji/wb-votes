import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { DEV_DB_PATH, openRead } from "../db/index.ts";
import { RegistryUnavailableError } from "./index.ts";
import { PARTY_CAP, getPlaceAnalysis } from "./place-analysis.ts";

// Guard on the schema, not on the file: openRead on a missing path throws, and an existsSync guard
// is defeated by any read that creates an empty database (person.test.ts learned this).
function haveRegistry(): boolean {
  try {
    const d = openRead(DEV_DB_PATH);
    try {
      d.prepare("SELECT 1 FROM place LIMIT 1").get();
      return true;
    } finally {
      d.close();
    }
  } catch {
    return false;
  }
}
const skip = haveRegistry() ? false : `no registry at ${DEV_DB_PATH} — run npm run registry:migrate`;

function counting(real: DatabaseSync): { db: DatabaseSync; count: () => number } {
  let n = 0;
  const proxy = new Proxy(real, {
    get(target, prop, recv) {
      if (prop === "prepare") {
        return (sql: string) => {
          n += 1;
          return target.prepare(sql);
        };
      }
      return Reflect.get(target, prop, recv) as unknown;
    },
  });
  return { db: proxy, count: () => n };
}

test("getPlaceAnalysis: five fixed queries, four elections newest-first, cited", { skip }, () => {
  const d = openRead(DEV_DB_PATH);
  const { db, count } = counting(d);
  const a = getPlaceAnalysis(db, "wb.ac.001");
  assert.ok(a);
  assert.equal(count(), 5, "place · contests · baselines · demographics · sources");

  assert.equal(a.place.id, "wb.ac.001");
  assert.equal(a.place.districtId, "wb.cooch-behar");
  assert.equal(a.place.stateId, "wb");
  const years = a.turnoutSeries.map((t) => t.year);
  assert.deepEqual(years, [2026, 2021, 2016, 2011]);
  for (const series of [a.partyShareSeries, a.marginSeries, a.enpSeries]) {
    assert.deepEqual(
      series.map((x) => x.year),
      years,
      "every series is newest-first and the same length",
    );
  }
  assert.ok(a.sources.length > 0, "a non-null analysis is never uncited");
  assert.ok(a.caveats.length > 0);
  assert.deepEqual(a.epochIds, ["delim-2008"], "no epoch break in 2011–2026");
  assert.ok(!a.caveats.some((c) => c.includes("boundary epochs")), "no break, no break caveat");
  d.close();
});

test("getPlaceAnalysis: turnout reads against the district and state baseline", { skip }, () => {
  const d = openRead(DEV_DB_PATH);
  const a = getPlaceAnalysis(d, "Mekliganj");
  assert.ok(a);
  const t2026 = a.turnoutSeries.find((x) => x.year === 2026);
  assert.ok(t2026);
  assert.equal(t2026.turnoutPct, 96.6, "Mekliganj 2026, the upstream figure");
  // §6.5: a bare 96.6% means nothing. The baselines must be real, different, and plausible.
  assert.ok(t2026.districtTurnoutPct !== null && t2026.stateTurnoutPct !== null);
  assert.notEqual(t2026.districtTurnoutPct, t2026.turnoutPct);
  assert.notEqual(t2026.stateTurnoutPct, t2026.turnoutPct);
  assert.notEqual(t2026.stateTurnoutPct, t2026.districtTurnoutPct);
  for (const t of a.turnoutSeries) {
    for (const v of [t.turnoutPct, t.districtTurnoutPct, t.stateTurnoutPct]) {
      assert.ok(v !== null && v > 50 && v <= 100, `${t.year}: ${String(v)}`);
    }
  }
  d.close();
});

test("getPlaceAnalysis: party fold caps at three and its count reconciles", { skip }, () => {
  const d = openRead(DEV_DB_PATH);
  const a = getPlaceAnalysis(d, "wb.ac.001");
  assert.ok(a);
  const p2021 = a.partyShareSeries.find((x) => x.year === 2021);
  assert.ok(p2021);
  assert.equal(p2021.parties.length, PARTY_CAP);
  assert.deepEqual(
    p2021.parties.map((x) => x.shortName),
    ["TMC", "BJP", "AIFB"],
  );
  assert.ok(p2021.others);
  assert.equal(p2021.others.count, 2, "SUCI(C) and BSP folded");
  assert.equal(p2021.others.votes, 1768 + 1025);
  assert.equal(p2021.others.voteSharePct, 1.4, "0.89 + 0.52 to one dp");
  // The fold accounts for the whole recorded field: named + others = contestants on record.
  const enp2021 = a.enpSeries.find((x) => x.year === 2021);
  assert.equal(p2021.parties.length + p2021.others.count, enp2021?.contestants);

  // 2026 is a declared seat with one result row and no count: nothing to fold.
  const p2026 = a.partyShareSeries.find((x) => x.year === 2026);
  assert.equal(p2026?.parties.length, 1);
  assert.equal(p2026?.others, null);
  assert.equal(p2026?.parties[0]?.votes, null, "declared, not counted — not zero votes");
  d.close();
});

test("getPlaceAnalysis: swing is null for a first-time contestant, not −100", { skip }, () => {
  const d = openRead(DEV_DB_PATH);
  const a = getPlaceAnalysis(d, "wb.ac.001");
  assert.ok(a);
  const s2016 = a.swingSeries.filter((s) => s.year === 2016);
  const tmc = s2016.find((s) => s.shortName === "TMC");
  assert.ok(tmc);
  assert.equal(tmc.previousYear, 2011);
  assert.equal(tmc.previousVoteSharePct, null, "TMC has no 2011 row in this seat");
  assert.equal(tmc.swingPp, null, "absent ≠ a −100pp collapse");
  const bjp = s2016.find((s) => s.shortName === "BJP");
  assert.equal(bjp?.swingPp, 10.4, "2.52 → 12.91");
  const aifb = s2016.find((s) => s.shortName === "AIFB");
  assert.equal(aifb?.swingPp, -11.2, "48.89 → 37.68");
  d.close();
});

test("getPlaceAnalysis: a party label that repeats inside an election has no swing, not an arbitrary one", { skip }, () => {
  const d = openRead(DEV_DB_PATH);
  // Kalimpong 2016 ran four independents — 40.8%, 4.1%, 2.3% and 1.3%. Matching 2021's independents
  // on the party id alone kept whichever row the map wrote last, so every IND swing was measured from
  // the 1.3% one and the card promoted "IND swung +36.3 pp" to its headline.
  const a = getPlaceAnalysis(d, "wb.ac.022");
  assert.ok(a);
  const ind = a.swingSeries.filter((s) => s.year === 2021 && s.shortName === "IND");
  assert.ok(ind.length > 1, `Kalimpong 2021 has ${ind.length} independents`);
  for (const s of ind) {
    assert.equal(s.previousVoteSharePct, null, "no single 2016 predecessor is identifiable");
    assert.equal(s.swingPp, null, "unresolvable is null, never a figure from an arbitrary row");
  }
  // The unambiguous parties in the same pair are unaffected.
  const bgpm = a.swingSeries.filter((s) => s.year === 2016 && s.shortName === "BGPM")[0];
  assert.equal(bgpm?.swingPp, -38.3, "87.44 → 49.11");
  d.close();
});

test("getPlaceAnalysis: margin, enp and retention per election", { skip }, () => {
  const d = openRead(DEV_DB_PATH);
  const a = getPlaceAnalysis(d, "wb.ac.001");
  assert.ok(a);
  const m2011 = a.marginSeries.find((x) => x.year === 2011);
  assert.equal(m2011?.marginVotes, 32632);
  assert.equal(m2011?.marginPct, 22.1, "32632 / 147357");
  assert.equal(m2011?.winner?.shortName, "AIFB");
  assert.equal(m2011?.runnerUp?.shortName, "INC");
  // 2026: votes are 0 (declared, uncounted) but the margin is on record, so marginPct survives.
  assert.equal(a.marginSeries.find((x) => x.year === 2026)?.marginPct, 13.6);

  const e = a.enpSeries.find((x) => x.year === 2021);
  assert.ok(e && e.enp !== null && e.enp > 1 && e.enp < 3, `two-horse 2021: ${String(e?.enp)}`);

  assert.deepEqual(
    a.retention.map((r) => [r.year, r.previousYear, r.held]),
    [
      [2026, 2021, 0], // TMC → BJP
      [2021, 2016, 1], // TMC held
      [2016, 2011, 0], // AIFB → TMC
    ],
  );
  d.close();
});

test("getPlaceAnalysis: demographics carry their vintage and provenance", { skip }, () => {
  const d = openRead(DEV_DB_PATH);
  const a = getPlaceAnalysis(d, "wb.ac.001");
  assert.ok(a);
  assert.ok(a.demographics.length >= 6);
  for (const f of a.demographics) {
    assert.equal(f.value.sourceYear, 2011, `${f.value.key} carries its census year`);
    assert.ok(f.sources.length > 0, `${f.value.key} carries provenance`);
  }
  d.close();
});

test("getPlaceAnalysis: filters narrow the result", { skip }, () => {
  const d = openRead(DEV_DB_PATH);
  const { db, count } = counting(openRead(DEV_DB_PATH));
  const narrow = getPlaceAnalysis(db, "wb.ac.001", { fromYear: 2016, toYear: 2021 });
  assert.ok(narrow);
  assert.equal(count(), 5, "filters do not cost a query");
  assert.deepEqual(
    narrow.turnoutSeries.map((t) => t.year),
    [2021, 2016],
  );
  assert.deepEqual(
    narrow.retention.map((r) => r.year),
    [2021],
    "only the pair whose newer election is in range",
  );

  const bjp = getPlaceAnalysis(d, "wb.ac.001", { party: "BJP" });
  assert.ok(bjp);
  for (const p of bjp.partyShareSeries) {
    assert.ok(p.parties.every((x) => x.shortName === "BJP"));
    assert.ok(p.parties.length <= 1);
  }
  assert.ok(bjp.swingSeries.every((s) => s.shortName === "BJP"));
  assert.equal(bjp.swingSeries.filter((s) => s.year === 2021)[0]?.swingPp, 29.7, "12.91 → 42.59");
  // The tail the filter hides is still counted, not dropped.
  const f2021 = bjp.partyShareSeries.find((x) => x.year === 2021);
  assert.equal(f2021?.others?.count, 4);
  d.close();
});

test("getPlaceAnalysis: unknown slug is null, unmigrated database throws", { skip }, () => {
  const d = openRead(DEV_DB_PATH);
  assert.equal(getPlaceAnalysis(d, "wb.ac.999-nope"), null);
  d.close();
});

test("getPlaceAnalysis on an unmigrated database throws RegistryUnavailableError", () => {
  const empty = new DatabaseSync(":memory:");
  assert.throws(() => getPlaceAnalysis(empty, "wb.ac.001"), RegistryUnavailableError);
  empty.close();
});

test("getPlaceAnalysis reads only: the database file is byte-identical after", { skip }, () => {
  // openRead does NOT open with a readonly flag (db/open.ts) — a `CREATE TABLE` through it really
  // does write — so read-only-ness is a property of THIS function's SQL, and hashing is the check.
  const before = createHash("sha256").update(readFileSync(DEV_DB_PATH)).digest("hex");
  const d = openRead(DEV_DB_PATH);
  assert.ok(getPlaceAnalysis(d, "wb.ac.001"));
  assert.ok(getPlaceAnalysis(d, "wb.ac.150", { fromYear: 2016, party: "BJP" }));
  d.close();
  assert.equal(createHash("sha256").update(readFileSync(DEV_DB_PATH)).digest("hex"), before);
});

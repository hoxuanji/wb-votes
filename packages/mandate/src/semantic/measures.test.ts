import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEV_DB_PATH, openRead } from "../db/index.ts";
import {
  MEASURES,
  enp,
  incumbency_retention,
  inr,
  margin_pct,
  modelCardProblems,
  percent,
  percentagePoints,
  rupees,
  swing_pp,
  turnout_pct,
  vote_share_pct,
} from "./index.ts";

test("enp: hand-computed cases", () => {
  // Two parties at 50/50 have exactly two effective parties; one party at 100 has exactly one.
  assert.equal(enp.compute({ sharesPct: [50, 50] }), 2);
  assert.equal(enp.compute({ sharesPct: [100, 0] }), 1);
  assert.equal(enp.compute({ sharesPct: [100] }), 1);
  // 1 / (0.5^2 + 0.25^2 + 0.25^2) = 1 / 0.375 = 2.666… → 2.67
  assert.equal(enp.compute({ sharesPct: [50, 25, 25] }), 2.67);
  // Renormalisation is what makes the truncated field usable at all: a top-3 field summing to 80
  // gives the same figure as the same three shares scaled to 100.
  assert.equal(enp.compute({ sharesPct: [40, 20, 20] }), 2.67);
  assert.equal(enp.compute({ sharesPct: [] }), null);
  assert.equal(enp.compute({ sharesPct: [0, 0] }), null);
  assert.equal(enp.format(2.666), "2.67");
});

test("swing_pp: a party that did not previously contest is null, not −100", () => {
  assert.equal(swing_pp.compute({ sharePct: 12.5, previousSharePct: null, sameEpoch: true }), null);
  assert.equal(swing_pp.compute({ sharePct: null, previousSharePct: 40, sameEpoch: true }), null);
  // Present in both: a plain subtraction in percentage points.
  assert.equal(swing_pp.compute({ sharePct: 45.3, previousSharePct: 38.1, sameEpoch: true }), 7.2);
  assert.equal(swing_pp.compute({ sharePct: 30, previousSharePct: 41.5, sameEpoch: true }), -11.5);
  // A boundary-epoch change makes it undefined even when both shares exist.
  assert.equal(swing_pp.compute({ sharePct: 45, previousSharePct: 38, sameEpoch: false }), null);
});

test("turnout_pct against three real contests", { skip: skipWithoutRegistry() }, () => {
  const db = openRead(DEV_DB_PATH);
  try {
    const rows = db
      .prepare(
        // Scoped to the election it names. Unscoped, `ORDER BY contest_id LIMIT 3` was the three lowest
        // ids in the whole registry, which pan-India loading turned into Andhra Pradesh 1951 — a test
        // still passing on identity while measuring something else entirely is worse than a red one.
        `SELECT contest_id, electors, voters FROM turnout
          WHERE scope = 'contest' AND electors > 0 AND voters IS NOT NULL
            AND contest_id LIKE 'wb-assembly-2011:%'
          ORDER BY contest_id LIMIT 3`,
      )
      .all() as { contest_id: string; electors: number; voters: number }[];
    assert.equal(rows.length, 3);
    const seen = rows.map((r) => turnout_pct.compute(r));
    // Hand-checked from the registry: alipurduars 172969/201029, amdanga 162052/177905,
    // amta 170337/206749 — the three lowest contest ids in wb-assembly-2011.
    assert.deepEqual(seen, [86, 91.1, 82.4]);
    // And the stored claim agrees with the measure — the one cross-check cycle 2 did by hand.
    for (const r of rows) {
      const stored = db
        .prepare(
          `SELECT CAST(object_value AS REAL) AS v FROM claim
            WHERE subject_ref = 'contest:' || ? AND predicate = 'turnout_pct' LIMIT 1`,
        )
        .get(r.contest_id) as { v: number } | undefined;
      if (stored === undefined) continue;
      const computed = turnout_pct.compute(r);
      assert.notEqual(computed, null);
      assert.ok(Math.abs((computed ?? 0) - stored.v) <= 0.15, `${r.contest_id}: ${computed} vs ${stored.v}`);
    }
  } finally {
    db.close();
  }
});

test("margin_pct, vote_share_pct, incumbency_retention", () => {
  assert.equal(margin_pct.compute({ rank1Votes: 90000, rank2Votes: 60000, validVotes: 200000 }), 15);
  // Uncontested: no rank-2, so null — not a 100% margin.
  assert.equal(margin_pct.compute({ rank1Votes: 90000, rank2Votes: null, validVotes: 200000 }), null);
  assert.equal(margin_pct.compute({ rank1Votes: 9, rank2Votes: 6, validVotes: 0 }), null);
  assert.equal(vote_share_pct.compute({ votes: 71093, validVotes: 200000 }), 35.5);
  assert.equal(vote_share_pct.compute({ votes: null, validVotes: 200000 }), null);
  assert.equal(
    incumbency_retention.compute({ winningPartyId: "aitc", previousWinningPartyId: "aitc", sameEpoch: true }),
    1,
  );
  // A member who switched party and held the seat is a LOSS for the old party.
  assert.equal(
    incumbency_retention.compute({ winningPartyId: "bjp", previousWinningPartyId: "aitc", sameEpoch: true }),
    0,
  );
  assert.equal(
    incumbency_retention.compute({ winningPartyId: "bjp", previousWinningPartyId: null, sameEpoch: true }),
    null,
  );
  assert.equal(incumbency_retention.format(1), "held");
  assert.equal(incumbency_retention.format(0), "changed hands");
  assert.equal(incumbency_retention.format(0.62), "62.0%");
});

test("formatters: one decimal, sign first, Indian grouping and units", () => {
  assert.equal(percent(86.042), "86.0%");
  assert.equal(percent(null), "—");
  // Sign first so direction survives greyscale; U+2212 for negatives.
  assert.equal(percentagePoints(7.24), "+7.2 pp");
  assert.equal(percentagePoints(-11.5), "−11.5 pp");
  assert.equal(percentagePoints(0), "±0.0 pp");
  assert.equal(percentagePoints(null), "—");
  assert.equal(inr(710930), "7,10,930");
  assert.equal(rupees(98000000), "Rs 9.8 cr");
  assert.equal(rupees(4200000), "Rs 42 lakh");
});

test("every measure declares a formula, caveats and its provenance caveat", () => {
  assert.equal(MEASURES.length, 6);
  for (const m of MEASURES) {
    assert.ok(m.formula.length > 30, `${m.id}: formula is not exact prose`);
    assert.ok(m.caveats.length >= 2, `${m.id}: fewer than two caveats`);
    assert.ok(
      m.caveats.some((c) => c.includes("provisional")),
      `${m.id}: does not inherit the provenance caveat`,
    );
  }
  // The two truncation-bound measures must state the DIRECTION of the bias, not just its existence.
  assert.ok(enp.caveats.some((c) => /BIASED DOWNWARD/.test(c) && /OVERSTATES concentration/.test(c)));
  assert.ok(vote_share_pct.caveats.some((c) => c.includes("do not sum to 100")));
});

test("§18: every measure has a real model card, and no card is stale", () => {
  assert.deepEqual(modelCardProblems(), []);
});

test("§18: the model-card check fails when a card is missing or orphaned", () => {
  // A temp directory, never the real cards.
  const dir = mkdtempSync(join(tmpdir(), "methodology-"));
  assert.deepEqual(modelCardProblems(dir).length, 6, "an empty directory must fail every measure");
  writeFileSync(join(dir, "enp.md"), "# enp\n\n## What would make this number wrong\n\nTruncation.\n");
  assert.deepEqual(
    modelCardProblems(dir).filter((p) => p.startsWith("enp:")),
    [],
  );
  // A card with no failure-mode section is the same failure as no card.
  writeFileSync(join(dir, "swing_pp.md"), "# swing_pp\n\nA swing.\n");
  assert.ok(modelCardProblems(dir).some((p) => p.startsWith("swing_pp: model card has no")));
  // Stale card: no such measure.
  writeFileSync(join(dir, "index.md"), "# index\n");
  writeFileSync(join(dir, "index_of_opposition_unity.md"), "# iou\n");
  assert.ok(modelCardProblems(dir).includes("index_of_opposition_unity.md: model card for no exported measure"));
  assert.ok(!modelCardProblems(dir).some((p) => p.startsWith("index.md")), "index.md is not a measure card");
  assert.equal(modelCardProblems(join(dir, "nope")).length, 1);
});

/** Guard on the schema, not on the file: a read can create an empty database (see person.test.ts). */
function skipWithoutRegistry(): false | string {
  try {
    const d = openRead(DEV_DB_PATH);
    try {
      d.prepare("SELECT 1 FROM turnout LIMIT 1").get();
      return false;
    } finally {
      d.close();
    }
  } catch {
    return `no registry at ${DEV_DB_PATH} — run npm run registry:migrate`;
  }
}

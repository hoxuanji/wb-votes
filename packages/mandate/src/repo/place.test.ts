import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { DEV_DB_PATH, openRead } from "../db/index.ts";
import { RegistryUnavailableError, getPlaceBrief } from "./index.ts";

// Guard on the schema, not on the file: an existsSync guard is defeated by any read that creates
// an empty database (see person.test.ts).
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

test("getPlaceBrief: four elections, winner/runner-up/margin/turnout, sitting member", { skip }, () => {
  const d = openRead(DEV_DB_PATH);
  const { db: counted, count } = counting(d);
  const brief = getPlaceBrief(counted, "wb.ac.001");
  assert.ok(brief);
  // FIXED, which is the property — not the number. Five now: the fifth asks, in ONE query for every
  // election in the history at once, which of their turnouts the registry can corroborate. What must never
  // return is a per-election or per-contest probe, because that is the N+1 this assertion exists to catch.
  assert.equal(count(), 5, "one place Brief costs five fixed queries, and never one per election");

  assert.equal(brief.place.id, "wb.ac.001");
  assert.ok(brief.place.districtName);
  assert.ok(brief.place.number !== null);
  assert.ok(brief.place.epochId);

  assert.equal(brief.contests.length, 4, "2011/2016/2021/2026");
  const years = brief.contests.map((c) => c.year);
  assert.deepEqual(years, [...years].sort((a, b) => b - a), "newest election first");
  const declared = brief.contests.filter((c) => c.winner !== null);
  assert.ok(declared.length >= 3);
  for (const c of declared) {
    assert.ok(c.winner);
    // 2026 result rows carry votes=0 (declared seat, no count ingested). The repo maps that to
    // null, so the API cannot publish "won with 0 votes" the way the page never would.
    if (c.year <= 2021) {
      assert.ok((c.winner.votes ?? 0) > 0, `${c.year} winner has votes`);
    } else {
      assert.equal(c.winner.votes, null, `${c.year} reported no count, so votes is null`);
      assert.equal(c.winner.voteShare, null);
    }
    /**
     * A reading now, not a number — and the SAME branch as the votes check above, which is the point.
     *
     * Turnout is corroborated by the vote counts of its own election. The lines above have just
     * established that 2026 has none, so 2026's turnout is exactly the figure that cannot be checked, and
     * every earlier contest's can be. The two conditions are one condition; if they ever disagree here,
     * the corroboration rule has stopped measuring what it claims to.
     */
    if (c.year <= 2021) {
      assert.equal(c.turnout.state, "reported", `${c.year} published counts, so its turnout is checkable`);
      if (c.turnout.state === "reported") {
        assert.ok(c.turnout.pct > 0 && c.turnout.pct <= 100);
      }
    } else {
      assert.equal(c.turnout.state, "unverified", `${c.year} has no counts, so its turnout is not checkable`);
      // AND THE VALUE SURVIVES. Withheld from the surface, never dropped from the record.
      if (c.turnout.state === "unverified") {
        assert.ok(c.turnout.evidence.pct > 0, "the sourced figure was discarded rather than withheld");
      }
    }
    if (c.runnerUp !== null) {
      assert.ok((c.winner.votes ?? 0) >= (c.runnerUp.votes ?? 0), "rank 1 outpolls rank 2");
      assert.notEqual(c.winner.personId, c.runnerUp.personId);
    }
    assert.ok(c.margin !== null);
  }
  const sitting = brief.sittingMember;
  assert.ok(sitting);
  assert.equal(sitting.personId, brief.contests[0]?.winner?.personId);
  d.close();
});

test("getPlaceBrief: demographics carry their census vintage and provenance", { skip }, () => {
  const d = openRead(DEV_DB_PATH);
  const brief = getPlaceBrief(d, "wb.ac.001");
  assert.ok(brief);
  assert.ok(brief.demographics.length >= 6, "population, literacy, sex ratio, sc, st, urban");
  const keys = brief.demographics.map((x) => x.value.key);
  assert.deepEqual(keys, [...keys].sort(), "deterministic order");
  for (const figure of brief.demographics) {
    // §6.5: no demographic figure without its year, and none without a source.
    assert.equal(figure.value.sourceYear, 2011, `${figure.value.key} carries its census year`);
    assert.ok(figure.sources.length > 0, `${figure.value.key} carries provenance`);
    assert.ok(figure.sources.every((s) => s.kind === "census"));
  }
  assert.ok(brief.sources.length > 0, "Brief-level source union is never empty");
  d.close();
});

test("getPlaceBrief: name slug resolves, unknown slug is null", { skip }, () => {
  const d = openRead(DEV_DB_PATH);
  const byId = getPlaceBrief(d, "wb.ac.001");
  assert.ok(byId);
  const byName = getPlaceBrief(d, byId.place.canonicalName.toLowerCase());
  assert.equal(byName?.place.id, byId.place.id);
  assert.equal(getPlaceBrief(d, "wb.ac.999-nope"), null);
  d.close();
});

test("getPlaceBrief on an unmigrated database throws RegistryUnavailableError", () => {
  const empty = new DatabaseSync(":memory:");
  assert.throws(() => getPlaceBrief(empty, "wb.ac.001"), RegistryUnavailableError);
  empty.close();
});

import assert from "node:assert/strict";
import test from "node:test";
import { DEV_DB_PATH, openRead } from "../db/index.ts";
import { getPlaceAnalysis } from "./place-analysis.ts";
import type { PlaceBrief, SourceRef } from "./index.ts";
import { anomalies, placeHeadline, placeTiles, provenance, tally } from "./place-presentation.ts";

// Same guard idiom as place-analysis.test.ts: the schema, not the file.
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

// ── the headline ─────────────────────────────────────────────────────────────────────────────────

type Contest = PlaceBrief["contests"][number];

function contest(year: number, party: string | null, margin: number | null, voters: number): Contest {
  return {
    contestId: `c${year}`,
    electionId: `wb-assembly-${year}`,
    electionName: `election ${year}`,
    year,
    electors: voters + 10_000,
    voters,
    turnout: { state: "reported" as const, pct: 80 },
    winner:
      party === null
        ? null
        : {
            candidacyId: `cd${year}`,
            personId: `p${year}`,
            personName: `Winner ${year}`,
            partyShortName: party,
            votes: 100,
            voteShare: 40,
          },
    runnerUp: null,
    margin,
  };
}

function brief(contests: Contest[]): PlaceBrief {
  return {
    place: {
      id: "wb.ac.001",
    kind: "ac",
    jurisdictionId: "wb",
      canonicalName: "Testganj",
      names: { en: "Testganj" },
      districtId: "wb.test",
      districtName: "Test",
      number: 1,
      reservation: "general",
      epochId: "delim-2008",
      epochName: "Delimitation 2008",
      electors: 200_000,
    },
    contests,
    sittingMember: null,
    demographics: [],
    sources: [],
  };
}

test("placeHeadline: no contest on record says so", () => {
  assert.match(placeHeadline(brief([])), /No contest is on record for Testganj/);
});

test("placeHeadline: one election on record refuses to imply a trend", () => {
  const h = placeHeadline(brief([contest(2026, "BJP", 1_000, 100_000)]));
  assert.match(h, /the only election on record here, so no trend is computable/);
});

test("placeHeadline: an unbroken hold names the party, the run and the margin's direction", () => {
  const h = placeHeadline(
    brief([
      contest(2026, "AITC", 5_000, 100_000), // 5.0%
      contest(2021, "AITC", 10_000, 100_000),
      contest(2016, "AITC", 14_000, 100_000),
      contest(2011, "AITC", 15_000, 100_000), // 15.0%
    ]),
  );
  assert.equal(
    h,
    "AITC has held Testganj in all 4 elections since 2011, but its margin fell 66.7% over that " +
      "run, from 15.0% of votes cast to 5.0%.",
  );
});

test("placeHeadline: a seat that turns over every time lists the sequence", () => {
  const h = placeHeadline(
    brief([
      contest(2026, "BJP", 27_716, 200_000),
      contest(2021, "AITC", 8_000, 200_000),
      contest(2016, "CPM", 3_000, 200_000),
      contest(2011, "AITC", 4_000, 200_000),
    ]),
  );
  assert.match(h, /changed hands at every one of its 4 recorded elections/);
  assert.match(h, /AITC 2011, CPM 2016, AITC 2021, BJP 2026/);
});

test("placeHeadline: silence is not continuity — undeclared elections are counted out loud", () => {
  const h = placeHeadline(
    brief([
      contest(2026, "BJP", 13_938, 200_000),
      contest(2021, "AITC", 8_000, 200_000),
      contest(2016, null, null, 200_000),
      contest(2011, null, null, 200_000),
    ]),
  );
  assert.match(h, /changed hands once since 2011/);
  assert.match(h, /2 of the 4 elections on record have no declared winner/);
});

test("placeHeadline: an unbroken party run with a gap does NOT claim it held them all", () => {
  const h = placeHeadline(
    brief([contest(2026, "AITC", 5_000, 100_000), contest(2021, null, null, 100_000)]),
  );
  assert.doesNotMatch(h, /held Testganj in all/);
  assert.match(h, /no declared winner/);
});

test("provenance: counts what was never fetched, so the page can say it in words", () => {
  const s = (id: string, kind: "fetched" | "asserted_by_upstream", url: string | null): SourceRef => ({
    id,
    kind: "eci_declaration" as const,
    publisher: null,
    title: null,
    licence: null,
    url,
    retrievedAt: `2026-05-1${id}T00:00:00Z`,
    publishedOn: null,
    hashKind: "document_bytes" as const,
    retrievalKind: kind,
  });
  const p = provenance([s("1", "fetched", "repo:data/seed/x.json"), s("2", "asserted_by_upstream", null)]);
  assert.deepEqual(p, { total: 2, fetched: 1, repoFiles: 1, retrievedAt: "2026-05-12T00:00:00Z" });
  assert.deepEqual(provenance([]), { total: 0, fetched: 0, repoFiles: 0, retrievedAt: null });
});

test("tally: seat counts descending, blanks are not a party", () => {
  assert.deepEqual(tally(["BJP", "TMC", "BJP", null, "", "TMC", "BJP"]), [
    ["BJP", 3],
    ["TMC", 2],
  ]);
  assert.deepEqual(tally([]), []);
});

test("placeTiles and anomalies survive an analysis that is null", { skip }, () => {
  const db = openRead(DEV_DB_PATH);
  try {
    // getPlaceAnalysis is an AC measure; the Brief must not require it to render. The version of a district is not
    // a seat, so it has no Analysis.
    const district = db.prepare("SELECT id FROM place_version WHERE place_id = 'wb.cooch-behar'").get() as { id: number };
    assert.equal(getPlaceAnalysis(db, district.id), null);
  } finally {
    db.close();
  }
  const b = brief([contest(2026, "BJP", 500, 100_000)]);
  const tiles = placeTiles(b, null);
  assert.ok(tiles.length >= 2);
  assert.ok(tiles.every((t) => typeof t.value === "string"));
  assert.deepEqual(anomalies(b, null), [
    "2026's margin was 0.5% of votes cast — under one point, so a recount-scale error would change the winner.",
  ]);
});

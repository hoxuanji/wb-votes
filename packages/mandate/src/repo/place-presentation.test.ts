import assert from "node:assert/strict";
import test from "node:test";
import { DEV_DB_PATH, openRead } from "../db/index.ts";
import { getPlaceAnalysis } from "./place-analysis.ts";
import type { PlaceAnalysis } from "./place-analysis.ts";
import type { PlaceBrief, SourceRef } from "./index.ts";
import { analysisCards, anomalies, placeHeadline, placeTiles, provenance, tally } from "./place-presentation.ts";

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

/** The same contest, its turnout one the registry holds and cannot corroborate (West Bengal 2026). */
function unverified(c: Contest): Contest {
  return {
    ...c,
    turnout: {
      state: "unverified" as const,
      reason: "No candidate vote counts were published for this election.",
      evidence: { pct: 80, voters: c.voters ?? 0, electors: c.electors ?? 0 },
    },
  };
}

/** The same contest as a declaration publishes it: a winner and a margin, no vote counts and no turnout (ls-2024). */
function declaredOnly(c: Contest): Contest {
  return {
    ...c,
    voters: null,
    electors: null,
    turnout: { state: "absent" as const },
    winner: c.winner === null ? null : { ...c.winner, votes: null, voteShare: null },
  };
}

const tileOf = (b: PlaceBrief, label: RegExp, a: PlaceAnalysis | null = null) => {
  const t = placeTiles(b, a).find((x) => label.test(x.label));
  assert.ok(t, `no tile ${String(label)}`);
  return t;
};

/** Just what placeTiles and analysisCards read of an analysis: enough to put retention and the margin series in. */
function analysisOf(parts: Partial<PlaceAnalysis>): PlaceAnalysis {
  return {
    place: { canonicalName: "Testganj", districtName: "Test", stateName: "West Bengal" },
    turnoutSeries: [],
    partyShareSeries: [],
    swingSeries: [],
    marginSeries: [],
    enpSeries: [],
    retention: [],
    demographics: [],
    filters: {},
    ...parts,
  } as unknown as PlaceAnalysis;
}

test("placeTiles: an unverified election's margin keeps its votes and withholds the share of votes it cannot stand behind", () => {
  const b = brief([unverified(contest(2026, "BJP", 29_584, 216_733))]);
  const t = tileOf(b, /^Winning margin/);
  assert.equal(t.value, "29,584");
  assert.equal(t.unit, "votes (declared)");
  assert.match(t.note ?? "", /share of votes polled\u00a0— verification pending/);
  assert.doesNotMatch(t.note ?? "", /\d%/, "no percentage is built from the votes polled the same page calls unverified");
  assert.match(t.note ?? "", /BJP/);
});

test("placeTiles: a declaration with no turnout says the share is not reported, and never opens a note with a dash", () => {
  const b = brief([declaredOnly(contest(2024, "TMC", 85_022, 100_000))]);
  const margin = tileOf(b, /^Winning margin/);
  assert.equal(margin.value, "85,022");
  assert.match(margin.note ?? "", /^share of votes polled not reported · TMC$/);
  const turnout = tileOf(b, /^Turnout/);
  assert.equal(turnout.note, "no turnout is on record for this election", "the gap is the turnout, not a district baseline");
});

test("placeTiles: a seat with no declared winner has no margin, and its tiles say that and nothing about a share", () => {
  const b = brief([declaredOnly(contest(2026, null, null, 100_000)), contest(2021, "AITC", 4_000, 100_000)]);
  const margin = tileOf(b, /^Winning margin/);
  assert.equal(margin.value, "—");
  assert.equal(margin.note, "no result declared");
  assert.doesNotMatch(tileOf(b, /^Turnout/).note ?? "", /district baseline/);
});

test("placeTiles: a counted margin is not labelled declared, and a verified share is still given", () => {
  const c = contest(2021, "AITC", 4_000, 100_000);
  const counted = { ...c, runnerUp: { ...c.winner!, partyShortName: "BJP", votes: 36_000 } };
  const t = tileOf(brief([counted]), /^Winning margin/);
  assert.equal(t.unit, "votes");
  assert.equal(t.note, "4.0% of votes cast · AITC over BJP");
});

test("placeTiles: Changed hands says 'never' only where every election declared a winner and there are two to compare", () => {
  const tile = (cs: Contest[], held: number[]) =>
    tileOf(brief(cs), /^Changed hands/, analysisOf({ retention: held.map((h) => ({ held: h })) as PlaceAnalysis["retention"] }));
  const all = tile([contest(2021, "AITC", 1, 1), contest(2016, "AITC", 1, 1)], [1]);
  assert.equal(all.value, "never");
  assert.equal(all.note, "across 2 elections since 2016");
  const gap = tile([contest(2026, "BJP", 1, 1), contest(2021, null, null, 1), contest(2016, null, null, 1), contest(2011, null, null, 1)], []);
  assert.equal(gap.value, "none on record");
  assert.equal(gap.note, "across 4 elections since 2011; 3 with no declared winner");
  const one = tile([declaredOnly(contest(2024, "TMC", 85_022, 1))], []);
  assert.equal(one.value, "not comparable");
  assert.doesNotMatch(one.note ?? "", /1 elections/);
  assert.equal(tile([contest(2021, "BJP", 1, 1), contest(2016, "AITC", 1, 1), contest(2011, "BJP", 1, 1)], [0, 0]).value, "twice");
});

test("placeHeadline: an unbroken hold over an unverified latest election compares votes, never shares of its votes polled", () => {
  const h = placeHeadline(
    brief([
      unverified(contest(2026, "AITC", 5_000, 100_000)),
      contest(2021, "AITC", 10_000, 100_000),
      contest(2016, "AITC", 14_000, 100_000),
      contest(2011, "AITC", 15_000, 100_000),
    ]),
  );
  assert.equal(h, "AITC has held Testganj in all 4 elections since 2011, most recently by 5,000 votes (declared).");
});

test("placeHeadline: where earlier elections declared nobody, it does not say the seat changed hands 0 times or took it from a holder", () => {
  const h = placeHeadline(
    brief([
      contest(2026, "TMC", 36_925, 100_000),
      contest(2021, null, null, 100_000),
      contest(2016, null, null, 100_000),
      contest(2011, null, null, 100_000),
    ]),
  );
  assert.equal(
    h,
    "TMC won Testganj in 2026 by 36,925 votes (declared) — no change of hands is on record since 2011. " +
      "3 of the 4 elections on record have no declared winner.",
  );
  const falta = placeHeadline(
    brief([
      contest(2026, null, null, 100_000),
      contest(2021, "AITC", 1_000, 100_000),
      contest(2016, "AITC", 1_000, 100_000),
      contest(2011, "AITC", 1_000, 100_000),
    ]),
  );
  assert.match(falta, /no change of hands is on record across the 4 elections on record since 2011/);
  assert.match(falta, /1 of the 4 elections on record has no declared winner\./);
  assert.doesNotMatch(falta, /0 times|\bhave no declared/);
});

test("placeHeadline: a seat that was taken from a declared holder still says so", () => {
  const h = placeHeadline(
    brief([contest(2026, "BJP", 1_000, 100_000), contest(2021, "AITC", 1_000, 100_000), contest(2016, "AITC", 1_000, 100_000)]),
  );
  assert.equal(h, "BJP took Testganj from AITC in 2026 by 1,000 votes (declared) — the seat has changed hands once since 2016.");
});

test("anomalies: no recount-scale flag is built from an unverified election's votes polled", () => {
  assert.deepEqual(anomalies(brief([unverified(contest(2026, "BJP", 309, 300_000))]), null), []);
  assert.equal(anomalies(brief([contest(2026, "BJP", 309, 300_000)]), null).length, 1, "the same margin over a verified turnout is still flagged");
});

test("analysisCards: where a margin is on record and its share is not, the card says the margin in votes and tabulates it", () => {
  const winner = { partyId: "AITC", shortName: "TMC", personName: "Yusuf Pathan", votes: null, voteSharePct: null, rank: 1, won: true };
  const cards = analysisCards(
    analysisOf({ marginSeries: [{ electionId: "ls-2024", year: 2024, marginVotes: 85_022, marginPct: null, winner, runnerUp: null, unverified: false }] }),
  );
  const card = cards.find((c) => /safer or closer/.test(c.question));
  assert.ok(card);
  assert.doesNotMatch(card.chart.fact ?? card.chart.table.caption, /No margin is on record/);
  assert.match(card.chart.fact ?? card.chart.table.caption, /2024: 85,022 votes, to TMC; no share of votes cast is shown/);
  assert.deepEqual(card.chart.table.rows, [["2024", "85,022"]]);
  assert.doesNotMatch(card.note ?? "", /denominator is votes cast/);
});

test("analysisCards: a repeated label's swing rows are named, and the share note no longer claims a card that does not name them", () => {
  const row = (shortName: string, personName: string | null, share: number) => ({
    electionId: "e21", year: 2021, previousElectionId: "e16", previousYear: 2016, partyId: shortName, shortName, personName,
    voteSharePct: share, previousVoteSharePct: null, swingPp: null,
  });
  const cards = analysisCards(
    analysisOf({
      swingSeries: [row("IND", "Ruden Sada Lepcha", 37.6), row("BJP", "Suva Pradhan", 35.1), row("IND", "Dr. R.B. Bhujel", 20.6)],
    }),
  );
  const swing = cards.find((c) => /What moved between/.test(c.question));
  assert.ok(swing);
  const labels = swing.chart.table.rows.map((r) => r[0]);
  assert.deepEqual(labels, ["IND · Ruden Sada Lepcha", "BJP", "IND · Dr. R.B. Bhujel"]);
  assert.match(swing.chart.fact ?? "", /a single recorded 2016 share/);
  const share = cards.find((c) => /Who took what share/.test(c.question));
  assert.ok(share === undefined || !/votes card below names each of them/.test(share.note ?? ""));
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

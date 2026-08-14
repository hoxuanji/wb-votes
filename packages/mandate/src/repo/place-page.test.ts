import assert from "node:assert/strict";
import test from "node:test";
import { DEV_DB_PATH, openRead } from "../db/index.ts";
import { turnout_pct } from "../semantic/index.ts";
import { getPlaceAnalysis } from "./place-analysis.ts";
import type { PlaceBrief, SourceRef } from "./index.ts";
import {
  analysisCards,
  anomalies,
  parseFilters,
  parsePath,
  placeHeadline,
  placeHref,
  placeTiles,
  placeView,
  provenance,
  tally,
} from "./place-page.ts";

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

// ── the URL ──────────────────────────────────────────────────────────────────────────────────────

test("parsePath: the three levels of §7's grammar, and nothing else", () => {
  assert.deepEqual(parsePath(["wb"]), { level: "state", ids: ["wb"], name: "wb", parentId: null });
  assert.deepEqual(parsePath(["wb", "Cooch-Behar"]), {
    level: "district",
    ids: ["wb.cooch-behar", "cooch-behar"],
    name: "cooch behar",
    parentId: "wb",
  });
  assert.deepEqual(parsePath(["wb", "cooch-behar", "1"]), {
    level: "ac",
    ids: ["1", "wb.ac.001"],
    name: "1",
    parentId: "wb.cooch-behar",
  });
  assert.equal(parsePath(["wb", "cooch-behar", "mekliganj"])?.parentId, "wb.cooch-behar");
  assert.equal(parsePath([]), null);
  assert.equal(parsePath(["", " "]), null);
  assert.equal(parsePath(["wb", "a", "b", "c"]), null);
  // %-encoded Bengali segment survives
  assert.equal(parsePath(["wb", "cooch-behar", encodeURIComponent("মেখলিগঞ্জ")])?.name, "মেখলিগঞ্জ");
  // A stray percent is a name no place has, not a URIError out of the page: Next hands the route a
  // once-decoded segment, so "%25zz" arrives as "%zz" and decodeURIComponent throws on it.
  assert.equal(parsePath(["wb", "%zz"])?.name, "%zz");
  assert.equal(parsePath(["wb", "cooch-behar", "50%"])?.name, "50%");
});

test("placeView: a malformed percent-escape is not-found, not a server error", { skip }, async () => {
  assert.equal((await placeView(["wb", "50%"], {})).kind, "not-found");
  assert.equal((await placeView(["wb", "cooch-behar", "%zz"], {})).kind, "not-found");
});

test("placeHref: one canonical path per level, from ids alone", () => {
  assert.equal(placeHref({ kind: "state", id: "wb", canonicalName: "West Bengal", parentId: null }), "/state/wb");
  assert.equal(
    placeHref({ kind: "district", id: "wb.cooch-behar", canonicalName: "Cooch Behar", parentId: "wb" }),
    "/district/wb/cooch-behar",
  );
  assert.equal(
    placeHref({ kind: "ac", id: "wb.ac.001", canonicalName: "Mekliganj", parentId: "wb.cooch-behar" }),
    "/constituency/wb/mekliganj",
  );
  // and the path it produces parses back to the place it came from
  assert.deepEqual(parsePath(["wb", "cooch-behar", "mekliganj"])?.level, "ac");
});

// ── filters ──────────────────────────────────────────────────────────────────────────────────────

const base = "/constituency/wb/mekliganj/analysis";
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

// ── tiles, anomalies, cards, against the live registry ───────────────────────────────────────────

test("placeView: Mekliganj renders six tiles, each cited, census vintage in the tile", { skip }, async () => {
  const v = await placeView(["wb", "cooch-behar", "mekliganj"], {});
  assert.equal(v.kind, "ac");
  if (v.kind !== "ac") return;
  const tiles = placeTiles(v.brief, v.analysis);
  assert.ok(tiles.length >= 4 && tiles.length <= 6, `tiles: ${tiles.length}`);
  assert.ok(tiles.every((t) => t.source !== null), "every tile carries its source");
  const turnout = tiles.find((t) => t.label.startsWith("Turnout"));
  /**
   * THIS ASSERTION USED TO READ `96.6%`, AND THAT WAS THE DEFECT, not the fixture.
   *
   * Mekliganj's newest contest is West Bengal 2026, whose turnout import is the seed defect the whole
   * `turnout-trust.ts` rule exists for — a state aggregate of 93.0% against 82.1% in 2021, with per-seat
   * figures running to 97.5%. So 96.6% was one of the bad numbers, and the tile asserted it as fact with a
   * district comparison underneath, which made it two assertions instead of one.
   *
   * A tile is a claim. This one now declines to make it, and says why in the space the number occupied.
   */
  assert.equal(turnout?.label, "Turnout 2026", "fixture changed: Mekliganj's newest contest is not 2026");
  assert.equal(turnout?.value, "verification pending");
  assert.match(turnout?.note ?? "", /published no candidate vote counts/);
  assert.ok(
    !/vs Cooch Behar/.test(turnout?.note ?? ""),
    "the tile still compares an uncorroborated figure against a district baseline",
  );
  // §6.5: the vintage AND the grain are in the tile — the registry's census figure is district-wide
  const pop = tiles.find((t) => t.label === "District population");
  assert.match(pop?.note ?? "", /Census 2011/);
  assert.match(pop?.note ?? "", /Cooch Behar-wide, not this seat's/);
});

// Bishnupur is a duplicated AC name: wb.ac.146 (South 24 Parganas, which the source spells
// 'BISHNUPUR(SC)') and wb.ac.266 (Bankura). The district page links both by slug, so the district in
// the path — not the lower id — has to decide which one the name means.
//
// It was wb.ac.154 before the electoral-geography repair. That was the SEED's numbering, which runs 1-307
// across a 294-seat assembly and disagrees with ECI's from seat 100 on; wb.ac.154 holds Behala Paschim's
// results and Partha Chatterjee's 2021 win, and is now named accordingly. The seat did not move — the
// registry stopped using a numbering no authority uses. docs/model/electoral-geography.md §4.
test("placeView: a duplicated AC name resolves by the district in the path", { skip }, async () => {
  const bankura = await placeView(["wb", "bankura", "bishnupur"], {});
  assert.equal(bankura.kind, "ac");
  if (bankura.kind !== "ac") return;
  assert.equal(bankura.brief.place.id, "wb.ac.266");

  const south = await placeView(["wb", "south-24-parganas", "bishnupur"], {});
  assert.equal(south.kind, "ac");
  if (south.kind !== "ac") return;
  assert.equal(south.brief.place.id, "wb.ac.146");

  // A name that exists, but not in the named district, is still not-found.
  assert.equal((await placeView(["wb", "kolkata", "bishnupur"], {})).kind, "not-found");
});

test("placeView: an anomaly is never derived from a figure we decline to assert", { skip }, async () => {
  /**
   * THIS TEST USED TO REQUIRE THE OPPOSITE, and its own premise was the defect.
   *
   * It asserted that Mekliganj's turnout was flagged as "at or above 95% (96.6%)" — and 96.6% is one of
   * West Bengal 2026's uncorroborated figures, the same import whose 93.0% state aggregate this release
   * withdrew from the hero. So the page said "verification pending" in the turnout tile and then, four lines
   * down, made a confident claim about the state's range using the number it had just declined to print.
   * A reader who noticed the caveat was given a reason to distrust the caveat.
   *
   * An anomaly is a CLAIM. It waits on the same reading the tile uses.
   */
  const v = await placeView(["wb", "cooch-behar", "mekliganj"], {});
  assert.equal(v.kind, "ac");
  if (v.kind !== "ac") return;
  const flags = anomalies(v.brief, v.analysis);
  assert.ok(
    !flags.some((f) => /at or above 95%|Turnout of /.test(f)),
    `a turnout claim survived on an uncorroborated figure: ${flags.join(" | ")}`,
  );
  // AND THE REAL ANOMALY STILL FIRES. The missing vote counts are a fact about the record itself, not a
  // figure needing corroboration, so suppressing it would be the over-correction.
  assert.ok(flags.some((f) => /no.*vote count is/.test(f)), flags.join(" | "));

  // A seat whose turnout IS corroborated still gets its turnout anomalies. Karnataka 2023 published counts.
  const ka = await placeView(["ka", "bangalore", "jayanagar"], {});
  if (ka.kind === "ac") {
    const t = ka.brief.contests.at(0);
    assert.equal(t?.turnout.state, "reported", "fixture changed: Jayanagar's newest turnout is not checkable");
  }
});

test("analysisCards: six to twelve question-titled cards, each with a table", { skip }, async () => {
  const v = await placeView(["wb", "kolkata", "jadavpur"], {});
  assert.equal(v.kind, "ac");
  if (v.kind !== "ac") return;
  const cards = analysisCards(v.analysis);
  assert.ok(cards.length >= 6 && cards.length <= 12, `cards: ${cards.length}`);
  for (const c of cards) {
    assert.match(c.question, /\?$/);
    assert.ok(c.chart.table.rows.length > 0, `${c.question} has no table rows`);
    assert.ok(c.chart.svg !== "" || c.chart.fact !== null, `${c.question} renders nothing`);
    assert.doesNotMatch(c.chart.table.caption, /coming soon/i);
  }
  // the ENP caveat is ON the card, not in a footnote
  const enpCard = cards.find((c) => /how many parties/i.test(c.question));
  assert.match(enpCard?.note ?? "", /OVERSTATES concentration/);
});

test("analysisCards: a one-election window has no swing card, and does not fake one", { skip }, async () => {
  const v = await placeView(["wb", "kolkata", "jadavpur"], { from: "2026", to: "2026" });
  assert.equal(v.kind, "ac");
  if (v.kind !== "ac") return;
  assert.deepEqual(v.filters.filters, { fromYear: 2026, toYear: 2026, party: undefined });
  const cards = analysisCards(v.analysis);
  assert.equal(cards.filter((c) => /What moved between/.test(c.question)).length, 0);
  assert.ok(cards.length >= 1);
});

test("analysisCards: the share chart reconciles with the data when two contestants share a label", { skip }, async () => {
  // Kalimpong 2021: IND 37.6% (RUDEN SADA LEPCHA), BJP 35.1%, IND 20.6% (DR. R.B. BHUJEL), rest 2.3%.
  // Keying the series by label and taking the FIRST match dropped the third-placed 20.6% out of the
  // chart and out of the Others bucket both, so the rendered row totalled 75.0% against 95.6%.
  const v = await placeView(["wb", "kalimpong", "kalimpong"], {});
  assert.equal(v.kind, "ac");
  if (v.kind !== "ac") return;
  const share = analysisCards(v.analysis).find((c) => /Who took what share/.test(c.question));
  assert.ok(share);
  const row = share.chart.table.rows.find((r) => r[0] === "2021");
  assert.ok(row);
  const drawn = row.slice(1).reduce((s, cell) => s + (cell === "—" ? 0 : Number.parseFloat(cell)), 0);
  const data = v.analysis.partyShareSeries.find((p) => p.year === 2021);
  assert.ok(data);
  const recorded =
    data.parties.reduce((s, p) => s + (p.voteSharePct ?? 0), 0) + (data.others?.voteSharePct ?? 0);
  assert.ok(Math.abs(drawn - recorded) <= 0.2, `chart ${drawn} vs data ${recorded}`);
  assert.equal(drawn.toFixed(1), "95.6");
  assert.deepEqual(row, ["2021", "—", "58.2%", "35.1%", "2.3%"], "the two independents are summed, not dropped");
});

test("analysisCards: a party-filtered pair says the party has no earlier share, not that votes are missing", { skip }, async () => {
  const v = await placeView(["wb", "cooch-behar", "mekliganj"], { party: "TMC" });
  assert.equal(v.kind, "ac");
  if (v.kind !== "ac") return;
  const card = analysisCards(v.analysis).find((c) => /between 2011 and 2016/.test(c.question));
  assert.ok(card);
  // Mekliganj 2011 has 147,357 votes on record for five contestants — the reason is TMC's absence.
  assert.match(card.chart.table.caption, /TMC has no recorded 2011 share to measure from/);
  assert.doesNotMatch(card.chart.table.caption, /no vote count on record/);
});

test("placeView: a district's turnout column IS turnout_pct, the same measure the Analysis floor uses", { skip }, async () => {
  const d = await placeView(["wb", "cooch-behar"], {});
  const seat = await placeView(["wb", "cooch-behar", "mekliganj"], {});
  assert.equal(d.kind, "parent");
  assert.equal(seat.kind, "ac");
  if (d.kind !== "parent" || seat.kind !== "ac") return;
  const turnout = d.children.headers.indexOf("Turnout");
  const latest = seat.analysis.turnoutSeries.at(0);
  assert.equal(d.children.rows[0]?.cols[turnout], turnout_pct.format(latest?.turnoutPct ?? null));
});

test("placeView: a district lists its seats, a state its districts", { skip }, async () => {
  const d = await placeView(["wb", "cooch-behar"], {});
  assert.equal(d.kind, "parent");
  if (d.kind !== "parent") return;
  assert.equal(d.level, "district");
  assert.equal(d.children.rows.length, 9);
  assert.match(d.headline, /9 assembly seats/);
  assert.equal(d.children.rows[0]?.href, "/constituency/wb/mekliganj");
  assert.ok(d.sources.length > 0, "a parent level is cited too");

  const s = await placeView(["wb"], {});
  assert.equal(s.kind, "parent");
  if (s.kind !== "parent") return;
  assert.equal(s.level, "state");
  assert.equal(s.children.rows.length, 23);
  assert.match(s.headline, /294 assembly seats across 23 districts/);
  assert.equal(s.children.rows[0]?.href, "/district/wb/alipurduar");
});

test("placeView: the path's ancestry must be true, and an unknown place is not-found", { skip }, async () => {
  assert.equal((await placeView(["wb", "nadia", "mekliganj"], {})).kind, "not-found");
  assert.equal((await placeView(["wb", "cooch-behar", "nowhere"], {})).kind, "not-found");
  assert.equal((await placeView(["xx"], {})).kind, "not-found");
  // the number form resolves to the same seat as the name form
  const byNumber = await placeView(["wb", "cooch-behar", "001"], {});
  assert.equal(byNumber.kind, "ac");
  if (byNumber.kind === "ac") assert.equal(byNumber.brief.place.canonicalName, "Mekliganj");
});

test("placeView: a missing registry is a handled state naming the fix, never a throw", async () => {
  const cwd = process.cwd();
  try {
    process.chdir("/");
    const v = await placeView(["wb"], {});
    // /: no packages/mandate to import and no .data/registry.db — either way it is `unavailable`.
    assert.equal(v.kind, "unavailable");
    if (v.kind === "unavailable") assert.match(v.detail, /npm run registry:migrate/);
  } finally {
    process.chdir(cwd);
  }
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
    // getPlaceAnalysis is an AC measure; the Brief must not require it to render.
    assert.equal(getPlaceAnalysis(db, "wb.cooch-behar"), null);
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

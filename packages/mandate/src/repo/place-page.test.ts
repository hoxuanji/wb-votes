import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { DEV_DB_PATH, open, openRead } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { turnout_pct } from "../semantic/index.ts";
import { getPlaceAnalysis } from "./place-analysis.ts";
import type { PlaceBrief, SourceRef } from "./index.ts";
import {
  analysisCards,
  anomalies,
  parseFilters,
  pathQuery,
  placeHeadline,
  placeTiles,
  placeView,
  provenance,
  resolvePlace,
  tally,
} from "./place-page.ts";
import type { PlaceQuery } from "./place-resolve.ts";
import { readRegistry } from "./session.ts";
import { skipUnlessVotingEpoch } from "./testkit.ts";

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
/** A place is resolved against migration 017's `voting_epoch` view, which a registry built before it lacks. */
const skipIndex = skipUnlessVotingEpoch();

/** A `/pl` path, as the query it makes. */
function pathOf(...segments: string[]): PlaceQuery {
  const q = pathQuery(segments);
  assert.ok(q !== null, `/pl/${segments.join("/")} is not a path`);
  return q;
}

// ── the URL ──────────────────────────────────────────────────────────────────────────────────────

test("pathQuery: the three levels of §7's grammar, and nothing else", () => {
  assert.deepEqual(pathQuery(["wb"]), { level: "state", id: "wb" });
  assert.deepEqual(pathQuery(["wb", "Cooch-Behar"]), { level: "district", state: "wb", district: "Cooch-Behar" });
  assert.deepEqual(pathQuery(["wb", "cooch-behar", "mekliganj"]), {
    level: "seat",
    state: "wb",
    district: "cooch-behar",
    name: "mekliganj",
  });
  // What each level asks is the resolver's to read: it lower-cases ids, and compares a name by its words.
  assert.equal(pathQuery([]), null);
  assert.equal(pathQuery(["", " "]), null);
  assert.equal(pathQuery(["wb", "a", "b", "c"]), null);
  // %-encoded Bengali segment survives
  assert.deepEqual(pathQuery(["wb", "cooch-behar", encodeURIComponent("মেখলিগঞ্জ")]), {
    level: "seat",
    state: "wb",
    district: "cooch-behar",
    name: "মেখলিগঞ্জ",
  });
  // A stray percent is a name no place has, not a URIError out of the page: Next hands the route a
  // once-decoded segment, so "%25zz" arrives as "%zz" and decodeURIComponent throws on it.
  assert.deepEqual(pathQuery(["wb", "%zz"]), { level: "district", state: "wb", district: "%zz" });
  assert.deepEqual(pathQuery(["wb", "cooch-behar", "50%"]), {
    level: "seat",
    state: "wb",
    district: "cooch-behar",
    name: "50%",
  });
});

test("placeView: a malformed percent-escape is not-found, not a server error", { skip: skipIndex }, async () => {
  assert.equal((await placeView(pathOf("wb", "50%"), {})).kind, "not-found");
  assert.equal((await placeView(pathOf("wb", "cooch-behar", "%zz"), {})).kind, "not-found");
});

// ── filters ──────────────────────────────────────────────────────────────────────────────────────

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

// ── tiles, anomalies, cards, against the live registry ───────────────────────────────────────────

test("placeView: Mekliganj renders six tiles, each cited, census vintage in the tile", { skip: skipIndex }, async () => {
  const v = await placeView(pathOf("wb", "cooch-behar", "mekliganj"), {});
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
test("placeView: a duplicated AC name resolves by the district in the path", { skip: skipIndex }, async () => {
  const bankura = await placeView(pathOf("wb", "bankura", "bishnupur"), {});
  assert.equal(bankura.kind, "ac");
  if (bankura.kind !== "ac") return;
  assert.equal(bankura.brief.place.id, "wb.ac.266");

  const south = await placeView(pathOf("wb", "south-24-parganas", "bishnupur"), {});
  assert.equal(south.kind, "ac");
  if (south.kind !== "ac") return;
  assert.equal(south.brief.place.id, "wb.ac.146");

  // A name that exists, but not in the named district, is still not-found.
  assert.equal((await placeView(pathOf("wb", "kolkata", "bishnupur"), {})).kind, "not-found");
});

test("placeView: an anomaly is never derived from a figure we decline to assert", { skip: skipIndex }, async () => {
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
  const v = await placeView(pathOf("wb", "cooch-behar", "mekliganj"), {});
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
  const ka = await placeView(pathOf("ka", "bangalore", "jayanagar"), {});
  if (ka.kind === "ac") {
    const t = ka.brief.contests.at(0);
    assert.equal(t?.turnout.state, "reported", "fixture changed: Jayanagar's newest turnout is not checkable");
  }
});

test("analysisCards: six to twelve question-titled cards, each with a table", { skip: skipIndex }, async () => {
  const v = await placeView(pathOf("wb", "kolkata", "jadavpur"), {});
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

test("analysisCards: a one-election window has no swing card, and does not fake one", { skip: skipIndex }, async () => {
  const v = await placeView(pathOf("wb", "kolkata", "jadavpur"), { from: "2026", to: "2026" });
  assert.equal(v.kind, "ac");
  if (v.kind !== "ac") return;
  assert.deepEqual(v.filters.filters, { fromYear: 2026, toYear: 2026, party: undefined });
  const cards = analysisCards(v.analysis);
  assert.equal(cards.filter((c) => /What moved between/.test(c.question)).length, 0);
  assert.ok(cards.length >= 1);
});

test("analysisCards: the share chart reconciles with the data when two contestants share a label", { skip: skipIndex }, async () => {
  // Kalimpong 2021: IND 37.6% (RUDEN SADA LEPCHA), BJP 35.1%, IND 20.6% (DR. R.B. BHUJEL), rest 2.3%.
  // Keying the series by label and taking the FIRST match dropped the third-placed 20.6% out of the
  // chart and out of the Others bucket both, so the rendered row totalled 75.0% against 95.6%.
  const v = await placeView(pathOf("wb", "kalimpong", "kalimpong"), {});
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

test("analysisCards: a party-filtered pair says the party has no earlier share, not that votes are missing", { skip: skipIndex }, async () => {
  const v = await placeView(pathOf("wb", "cooch-behar", "mekliganj"), { party: "TMC" });
  assert.equal(v.kind, "ac");
  if (v.kind !== "ac") return;
  const card = analysisCards(v.analysis).find((c) => /between 2011 and 2016/.test(c.question));
  assert.ok(card);
  // Mekliganj 2011 has 147,357 votes on record for five contestants — the reason is TMC's absence.
  assert.match(card.chart.table.caption, /TMC has no recorded 2011 share to measure from/);
  assert.doesNotMatch(card.chart.table.caption, /no vote count on record/);
});

test("placeView: a district's turnout column IS turnout_pct, the same measure the Analysis floor uses", { skip: skipIndex }, async () => {
  const d = await placeView(pathOf("wb", "cooch-behar"), {});
  const seat = await placeView(pathOf("wb", "cooch-behar", "mekliganj"), {});
  assert.equal(d.kind, "parent");
  assert.equal(seat.kind, "ac");
  if (d.kind !== "parent" || d.level !== "district" || seat.kind !== "ac") return;
  const turnout = d.children.headers.indexOf("Turnout");
  const latest = seat.analysis.turnoutSeries.at(0);
  assert.equal(d.children.rows[0]?.cols[turnout], turnout_pct.format(latest?.turnoutPct ?? null));
});

test("placeView: a district lists its seats", { skip: skipIndex }, async () => {
  const d = await placeView(pathOf("wb", "cooch-behar"), {});
  assert.equal(d.kind, "parent");
  if (d.kind !== "parent" || d.level !== "district") return assert.fail("not a district view");
  assert.equal(d.children.rows.length, 9);
  assert.match(d.headline, /9 assembly seats/);
  assert.equal(d.children.rows[0]?.href, "/constituency/wb/assembly/mekliganj");
  assert.ok(d.sources.length > 0, "a parent level is cited too");
});

test("placeView: the path's ancestry must be true, and an unknown place is not-found", { skip: skipIndex }, async () => {
  assert.equal((await placeView(pathOf("wb", "nadia", "mekliganj"), {})).kind, "not-found");
  assert.equal((await placeView(pathOf("wb", "cooch-behar", "nowhere"), {})).kind, "not-found");
  assert.equal((await placeView(pathOf("xx"), {})).kind, "not-found");
  // the number form resolves to the same seat as the name form
  const byNumber = await placeView(pathOf("wb", "cooch-behar", "001"), {});
  assert.equal(byNumber.kind, "ac");
  if (byNumber.kind === "ac") assert.equal(byNumber.brief.place.canonicalName, "Mekliganj");
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

// ── the registry session: an outage is a state, a defect is thrown ──────────────────────────────

/** A reader bound to one file, so a test needs neither the environment nor the cwd to point at it. */
const at =
  (path: string): typeof readRegistry =>
  (fn) =>
    readRegistry(fn, { path });

/** A migrated registry holding West Bengal, one district and one seat, and no election at all. */
function bareRegistry(): string {
  const path = join(mkdtempSync(join(tmpdir(), "mandate-placepage-")), "registry.db");
  const d = open(path);
  migrate(d, "2026-08-12T00:00:00.000Z");
  d.exec(`
    INSERT INTO place (id, kind, canonical_name) VALUES ('wb', 'state', 'West Bengal');
    INSERT INTO place (id, kind, parent_id, canonical_name) VALUES ('wb.coochbehar', 'district', 'wb', 'Cooch Behar');
    INSERT INTO place (id, kind, parent_id, canonical_name) VALUES ('wb.ac.001', 'ac', 'wb.coochbehar', 'Mekliganj');
  `);
  d.close();
  return path;
}

/** A registry whose `place` is a view over a function SQLite does not have: a bug in a query, not an outage. */
function defectiveRegistry(): string {
  const path = join(mkdtempSync(join(tmpdir(), "mandate-placepage-")), "registry.db");
  const d = open(path);
  d.exec(`
    CREATE VIEW place AS
      SELECT no_such_function() AS id, 'state' AS kind, 'x' AS canonical_name, NULL AS parent_id;
    CREATE TABLE place_version (id INTEGER, place_id TEXT, jurisdiction_id TEXT, kind TEXT, epoch_id TEXT,
                                canonical_name TEXT);
    CREATE TABLE boundary_epoch (id TEXT, effective_from TEXT);
    CREATE TABLE voting_epoch (jurisdiction_id TEXT, house TEXT, epoch_id TEXT);
  `);
  d.close();
  return path;
}

test("placeView on a fixture registry: a state is its name and trail, and a district its seats", async () => {
  const read = at(bareRegistry());
  const s = await placeView(pathOf("wb"), {}, read);
  assert.equal(s.kind, "parent");
  if (s.kind === "parent") {
    assert.equal(s.level, "state");
    assert.equal(s.name, "West Bengal");
    assert.deepEqual(s.trail, [{ label: "India", href: "/" }, { label: "West Bengal" }]);
    // Nothing else: a state does not read its districts, because no state page renders them.
    assert.deepEqual(Object.keys(s).sort(), ["kind", "level", "name", "placeId", "trail"]);
  }
  const d = await placeView(pathOf("wb", "coochbehar"), {}, read);
  assert.equal(d.kind, "parent");
  if (d.kind === "parent") assert.equal(d.level, "district");
  assert.equal((await placeView(pathOf("xx"), {}, read)).kind, "not-found");
});

test("placeView says an unreadable registry is unavailable, and resolvePlace throws it", async () => {
  const gone = at(join(mkdtempSync(join(tmpdir(), "mandate-placepage-")), "registry.db"));
  const unmigrated = at(
    (() => {
      const path = join(mkdtempSync(join(tmpdir(), "mandate-placepage-")), "registry.db");
      open(path).close();
      return path;
    })(),
  );
  for (const read of [gone, unmigrated]) {
    const v = await placeView(pathOf("wb"), {}, read);
    assert.equal(v.kind, "unavailable");
    if (v.kind === "unavailable") assert.match(v.detail, /npm run registry:migrate/);
    // resolvePlace answers legacy redirect routes, where "none" is a 404 and a crawler keeps a 404 for good.
    // An unreadable registry is not "no such constituency", so it is thrown.
    await assert.rejects(resolvePlace({ level: "seat", state: "wb", name: "mekliganj" }, read), /npm run registry:migrate/);
  }
});

test("resolvePlace still answers none for a name the registry does not hold", async () => {
  const read = at(bareRegistry());
  assert.deepEqual(await resolvePlace({ level: "seat", state: "wb", name: "nowhere" }, read), { found: "none" });
});

test("placeView and resolvePlace: a defect in a query is thrown, not hidden as unavailable or 404", async () => {
  // The lookups behind a legacy route used to catch everything and answer [] / null, so a bug in their SQL read as
  // "no such constituency" and the route answered 404 for every name in India.
  const read = at(defectiveRegistry());
  await assert.rejects(placeView(pathOf("wb"), {}, read), /no such function/);
  await assert.rejects(resolvePlace({ level: "seat", state: "wb", name: "mekliganj" }, read), /no such function/);
});

// ── a place is read as the one version it resolved to ────────────────────────────────────────────

/** A reader over a handle the test holds, so a `:memory:` registry can stand where the file would. */
const over =
  (d: DatabaseSync): typeof readRegistry =>
  (fn) => ({ ok: true, value: fn(d) });

/**
 * Two Bishnupurs and a Lok Sabha seat of the name, a tie, and a seat number that was Badami and is Nanjangud. The
 * Lok Sabha seat has a later version under an order nobody has voted under. A Lok Sabha id is two digits here
 * (`wb.pc.37`) and three there (`ka.pc.001`). Each (state, house) holds a contest, which is what makes its seats current.
 */
function seatRegistry(): DatabaseSync {
  const d = open(":memory:");
  migrate(d, "2026-08-12T00:00:00.000Z");
  d.exec(`
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('delim-1976','Delimitation 1976','1976-01-01');
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('delim-2008','Delimitation 2008','2008-02-19');
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('delim-2023','Delimitation 2023','2023-03-01');
    INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('wb','state','West Bengal','in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('ka','state','Karnataka','in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('wb.bankura','district','Bankura','wb');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('wb.south-24-parganas','district','South 24 Parganas','wb');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('ka.bangalore','district','Bangalore','ka');
  `);
  const seats: [v: number, place: string, j: string, kind: "ac" | "pc", epoch: string, name: string, number: number, district: string | null][] = [
    [1, "wb.ac.266", "wb", "ac", "delim-2008", "Bishnupur", 266, "wb.bankura"],
    [2, "wb.ac.146", "wb", "ac", "delim-2008", "BISHNUPUR(SC)", 146, "wb.south-24-parganas"],
    [3, "wb.pc.37", "wb", "pc", "delim-2008", "Bishnupur", 37, null],
    [4, "wb.ac.007", "wb", "ac", "delim-2008", "Twin", 7, "wb.bankura"],
    [5, "wb.ac.008", "wb", "ac", "delim-2008", "Twin", 8, "wb.south-24-parganas"],
    [6, "ka.ac.214", "ka", "ac", "delim-2008", "NANJANGUD", 214, "ka.bangalore"],
    [7, "ka.ac.214", "ka", "ac", "delim-1976", "BADAMI", 214, "ka.bangalore"],
    [8, "wb.ac.020", "wb", "ac", "delim-2008", "Coochbehar Uttar", 20, "wb.bankura"],
    [9, "ka.pc.001", "ka", "pc", "delim-2008", "Bidar", 1, null],
    // A later order that nobody has voted under yet: the newest version of wb.pc.37, and not the one that resolves.
    [10, "wb.pc.37", "wb", "pc", "delim-2023", "Bishnupur West", 37, null],
  ];
  const place = d.prepare("INSERT OR IGNORE INTO place (id, kind, canonical_name, parent_id) VALUES (?, ?, ?, ?)");
  const version = d.prepare(
    `INSERT INTO place_version (id, place_id, jurisdiction_id, district_place_id, kind, epoch_id, number, canonical_name,
                                reservation)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'general')`,
  );
  for (const [v, p, j, kind, epoch, name, number, district] of seats) {
    place.run(p, kind, name, district ?? j);
    version.run(v, p, j, district, kind, epoch, number, name);
  }
  const election = d.prepare(
    `INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, polling_month, occurrence)
     VALUES (?, ?, ?, ?, ?, ?, 'declared', ?, ?, 4, 1)`,
  );
  const contest = d.prepare("INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES (?, ?, ?, 'declared')");
  election.run("wb-assembly-2021", "assembly", "state", "wb", "delim-2008", "WB 2021", "ac", 2021);
  election.run("ls-2024", "general", "union", "in", "delim-2008", "LS 2024", "pc", 2024);
  election.run("ka-assembly-2018", "assembly", "state", "ka", "delim-2008", "KA 2018", "ac", 2018);
  election.run("ka-assembly-1978", "assembly", "state", "ka", "delim-1976", "KA 1978", "ac", 1978);
  for (const [e, v] of [
    ["wb-assembly-2021", 1], ["wb-assembly-2021", 2], ["wb-assembly-2021", 4], ["wb-assembly-2021", 5],
    ["ls-2024", 3], ["ka-assembly-2018", 6], ["ka-assembly-1978", 7], ["wb-assembly-2021", 8], ["ls-2024", 9],
  ] as const) {
    contest.run(`${e}:${v}`, e, v);
  }
  return d;
}

const seat = (name: string, more: { body?: "assembly" | "lok-sabha"; district?: string } = {}): PlaceQuery => ({
  level: "seat",
  state: "wb",
  name,
  ...more,
});

test("placeView: the exact name wins, and the seat that only matches without its marker answers to its own", async () => {
  const d = seatRegistry();
  try {
    const exact = await placeView(seat("bishnupur", { body: "assembly" }), {}, over(d));
    assert.equal(exact.kind === "ac" ? exact.brief.place.id : exact.kind, "wb.ac.266");
    // Its own name, with the marker, however it is written in a link.
    for (const written of ["bishnupur(sc)", "bishnupur-sc", "Bishnupur (SC)"]) {
      const sc = await placeView(seat(written, { body: "assembly" }), {}, over(d));
      assert.equal(sc.kind === "ac" ? sc.brief.place.id : sc.kind, "wb.ac.146", written);
    }
    const pc = await placeView(seat("bishnupur", { body: "lok-sabha" }), {}, over(d));
    assert.equal(pc.kind === "ac" ? pc.brief.place.id : pc.kind, "wb.pc.37");
  } finally {
    d.close();
  }
});

test("placeView: a name two seats of one body answer to is many, and neither is read", async () => {
  const d = seatRegistry();
  try {
    const v = await placeView(seat("twin", { body: "assembly" }), {}, over(d));
    assert.equal(v.kind, "many");
    if (v.kind !== "many") return;
    assert.deepEqual(v.places.map((p) => (p.level === "seat" ? p.placeId : null)), ["wb.ac.007", "wb.ac.008"]);
    // The district in the path is part of what it asserted, so it breaks the tie.
    const one = await placeView(seat("twin", { body: "assembly", district: "bankura" }), {}, over(d));
    assert.equal(one.kind === "ac" ? one.brief.place.id : one.kind, "wb.ac.007");
  } finally {
    d.close();
  }
});

test("placeView: the entries of a tie are distinct addresses, and each opens its own seat", async () => {
  const d = seatRegistry();
  try {
    const v = await placeView(seat("twin", { body: "assembly" }), {}, over(d));
    assert.equal(v.kind, "many");
    if (v.kind !== "many") return;
    const hrefs = v.places.map((p) => p.href);
    assert.deepEqual(hrefs, ["/constituency/wb/assembly/wb.ac.007", "/constituency/wb/assembly/wb.ac.008"]);
    for (const [i, href] of hrefs.entries()) {
      // the route reads the last segment as a name, so this is the request the link makes
      const opened = await placeView(seat(href.split("/").at(-1) as string, { body: "assembly" }), {}, over(d));
      if (opened.kind !== "ac") return assert.fail(`${href} opened a ${opened.kind} view`);
      assert.equal(opened.brief.place.id, i === 0 ? "wb.ac.007" : "wb.ac.008", href);
      assert.equal(opened.base, `${href}/analysis`, "the page's own base is the address that opened it");
    }
    // the path's body and state still limit the id, so an id is not a way into another body or state
    assert.equal((await placeView(seat("wb.ac.007", { body: "lok-sabha" }), {}, over(d))).kind, "not-found");
    assert.equal((await placeView({ level: "seat", state: "ka", body: "assembly", name: "wb.ac.007" }, {}, over(d))).kind, "not-found");
    // the district in the path reaches the same seat, and is sent to the same address
    const bankura = await placeView(seat("twin", { body: "assembly", district: "bankura" }), {}, over(d));
    assert.equal(bankura.kind === "ac" ? bankura.base : bankura.kind, `${hrefs[0]}/analysis`);
  } finally {
    d.close();
  }
});

test("placeView: a district's row for a seat whose name is shared opens that seat, and its other rows keep their names", async () => {
  const d = seatRegistry();
  try {
    for (const [district, twin] of [["bankura", "wb.ac.007"], ["south-24-parganas", "wb.ac.008"]] as const) {
      const v = await placeView({ level: "district", state: "wb", district }, {}, over(d));
      if (v.kind !== "parent" || v.level !== "district") return assert.fail(`${district} is not a district view`);
      const row = v.children.rows.find((r) => r.cols[1]?.startsWith("Twin"));
      assert.equal(row?.href, `/constituency/wb/assembly/${twin}`, district);
      // and the link reaches that seat, not a page that asks which
      const opened = await placeView(seat(twin, { body: "assembly" }), {}, over(d));
      assert.equal(opened.kind === "ac" ? opened.brief.place.id : opened.kind, twin);
      // a row whose name no other seat of the assembly has is addressed by that name, as it always was
      for (const other of v.children.rows.filter((r) => !r.cols[1]?.startsWith("Twin"))) {
        assert.match(other.href, /^\/constituency\/wb\/assembly\/[a-z()-]+$/, `${district}: ${other.cols[1]}`);
      }
    }
    const bankura = await placeView({ level: "district", state: "wb", district: "bankura" }, {}, over(d));
    if (bankura.kind !== "parent" || bankura.level !== "district") return assert.fail("not a district view");
    assert.ok(bankura.children.rows.some((r) => r.href === "/constituency/wb/assembly/bishnupur"));
  } finally {
    d.close();
  }
});

test("resolvePlace: a name in both bodies is many, and in one body it is one", async () => {
  const d = seatRegistry();
  try {
    const both = await resolvePlace(seat("bishnupur"), over(d));
    assert.equal(both.found, "many");
    if (both.found === "many") {
      assert.deepEqual(both.places.map((p) => p.href), [
        "/constituency/wb/assembly/bishnupur",
        "/constituency/wb/lok-sabha/bishnupur",
      ]);
    }
    const one = await resolvePlace(seat("bishnupur", { body: "lok-sabha" }), over(d));
    assert.equal(one.found === "one" ? one.place.href : one.found, "/constituency/wb/lok-sabha/bishnupur");
  } finally {
    d.close();
  }
});

test("resolvePlace: an exact name is read as a name alone, never as an id, a number, a stripped marker or joined words", async () => {
  const d = seatRegistry();
  try {
    const found = async (name: string, state = "wb"): Promise<string> => {
      const f = await resolvePlace({ level: "seat", state, name, exact: true }, over(d));
      return f.found === "one" ? f.place.href : f.found;
    };
    assert.equal(await found("coochbehar-uttar"), "/constituency/wb/assembly/coochbehar-uttar");
    assert.equal(await found("bishnupur(sc)"), "/constituency/wb/assembly/bishnupur(sc)");
    for (const written of ["coochbeharuttar", "266", "wb.ac.266", "WB.AC.266", "37", "wb.pc.37"]) {
      assert.equal(await found(written), "none", written);
    }
    assert.equal(await found("1", "ka"), "none");
    // The same words are found when the name is not asked exact, so it is the flag that narrows them.
    const loose = await resolvePlace({ level: "seat", state: "wb", name: "coochbeharuttar" }, over(d));
    assert.equal(loose.found, "one");
  } finally {
    d.close();
  }
});

test("placeView: a retired name is not found, and the current name is the current version's page and no other's", async () => {
  const d = seatRegistry();
  try {
    // ka.ac.214 was Badami under delim-1976 and is Nanjangud under delim-2008. This used to resolve the old name to the
    // place id and then render the NEWEST version under it, so /constituency/ka/assembly/badami showed Nanjangud.
    const retired = await placeView({ level: "seat", state: "ka", body: "assembly", name: "badami" }, {}, over(d));
    assert.equal(retired.kind, "not-found");
    const now = await placeView({ level: "seat", state: "ka", body: "assembly", name: "nanjangud" }, {}, over(d));
    assert.equal(now.kind, "ac");
    if (now.kind !== "ac") return;
    assert.equal(now.brief.place.canonicalName, "NANJANGUD");
    assert.deepEqual(now.brief.contests.map((c) => c.year), [2018], "the 1978 contest belongs to the retired version");
    assert.equal(now.base, "/constituency/ka/assembly/nanjangud/analysis");
  } finally {
    d.close();
  }
});

test("placeView: a state is its id, in any case, and never its name", async () => {
  const d = seatRegistry();
  try {
    for (const id of ["wb", "WB", " wb "]) {
      const v = await placeView({ level: "state", id }, {}, over(d));
      assert.equal(v.kind === "parent" ? v.placeId : v.kind, "wb", id);
    }
    assert.equal((await placeView({ level: "state", id: "west-bengal" }, {}, over(d))).kind, "not-found");
    assert.equal((await placeView({ level: "state", id: "West Bengal" }, {}, over(d))).kind, "not-found");
  } finally {
    d.close();
  }
});

test("placeView: a trail links the state as the request spelled it and names it from the registry", async () => {
  const d = seatRegistry();
  try {
    // `WB` is the same state as `wb` to every route that names a body, and it has always been labelled as the segment
    // spelled it, because the registry has no state called "WB".
    for (const [state, label, href] of [["wb", "West Bengal", "/state/wb"], ["WB", "WB", "/state/WB"]] as const) {
      const v = await placeView({ level: "seat", state, body: "assembly", name: "BISHNUPUR" }, {}, over(d));
      assert.equal(v.kind, "ac");
      if (v.kind !== "ac") return;
      assert.deepEqual(v.trail, [{ label: "India", href: "/" }, { label, href }, { label: "Bishnupur" }]);
      const dist = await placeView({ level: "district", state, district: "Bankura" }, {}, over(d));
      assert.equal(dist.kind, "parent");
      if (dist.kind === "parent") {
        assert.deepEqual(dist.trail, [{ label: "India", href: "/" }, { label, href }, { label: "Bankura" }]);
      }
    }
  } finally {
    d.close();
  }
});

test("placeView: a seat written as its registry id, or as the number in it, is that seat in that state and body", async () => {
  const d = seatRegistry();
  try {
    const idOf = async (q: PlaceQuery): Promise<string> => {
      const v = await placeView(q, {}, over(d));
      return v.kind === "ac" ? v.brief.place.id : v.kind;
    };
    // The id whole, in any case, and the number in it, with or without its zeros up to three digits.
    for (const written of ["266", "wb.ac.266", "WB.AC.266", " wb.ac.266 "]) {
      assert.equal(await idOf(seat(written)), "wb.ac.266", written);
      assert.equal(await idOf(seat(written, { body: "assembly" })), "wb.ac.266", written);
    }
    assert.equal(await idOf(seat("020", { body: "assembly" })), "wb.ac.020");
    assert.equal(await idOf(seat("20", { body: "assembly" })), "wb.ac.020");
    // A number is padded to three digits and no further, as it always was: not "0266".
    assert.equal(await idOf(seat("0266")), "not-found");
    // The id keeps its body. An assembly id under /lok-sabha, and a Lok Sabha id under /assembly, are no seat.
    assert.equal(await idOf(seat("wb.ac.266", { body: "lok-sabha" })), "not-found");
    assert.equal(await idOf(seat("wb.pc.37", { body: "assembly" })), "not-found");
    assert.equal(await idOf(seat("wb.pc.37", { body: "lok-sabha" })), "wb.pc.37");
    assert.equal(await idOf(seat("wb.pc.37")), "wb.pc.37");
    // And it keeps its state: the id of a seat in another state is no way to ask for this state's.
    assert.equal(await idOf(seat("ka.ac.214")), "not-found");
    // A bare number is the id in this state, of the body asked: assembly when none is, and padded to three digits, so a
    // Lok Sabha seat whose id is not (wb.pc.37) is not found by its number, and one whose id is (ka.pc.001) is.
    assert.equal(await idOf(seat("37", { body: "lok-sabha" })), "not-found");
    assert.equal(await idOf(seat("37")), "not-found");
    assert.equal(await idOf({ level: "seat", state: "ka", body: "lok-sabha", name: "1" }), "ka.pc.001");
    assert.equal(await idOf({ level: "seat", state: "ka", name: "1" }), "not-found");
    assert.equal(await idOf({ level: "seat", state: "ka", body: "assembly", name: "1" }), "not-found");
    // A number under a district asks that district's seats only.
    assert.equal(await idOf(seat("266", { district: "bankura" })), "wb.ac.266");
    assert.equal(await idOf(seat("266", { district: "south-24-parganas" })), "not-found");
  } finally {
    d.close();
  }
});

test("placeView: a district answers to its id, to its whole id and to its name; D27 is about states", async () => {
  const d = seatRegistry();
  try {
    for (const written of ["south-24-parganas", "SOUTH-24-PARGANAS", "wb.south-24-parganas", "South 24 Parganas", "south%2024%20parganas", "south24parganas"]) {
      const v = await placeView({ level: "district", state: "wb", district: written }, {}, over(d));
      assert.equal(v.kind === "parent" ? v.placeId : v.kind, "wb.south-24-parganas", written);
    }
    // under the state that has it, and no other's
    assert.equal((await placeView({ level: "district", state: "ka", district: "bankura" }, {}, over(d))).kind, "not-found");
    assert.equal((await placeView({ level: "district", state: "wb", district: "ka.bangalore" }, {}, over(d))).kind, "not-found");
    // and /pl reads a district the same way
    assert.equal((await placeView(pathOf("wb", "South 24 Parganas"), {}, over(d))).kind, "parent");
    // A state, which D27 does take by its id alone, is still not read by its name.
    assert.equal((await placeView({ level: "state", id: "west-bengal" }, {}, over(d))).kind, "not-found");
  } finally {
    d.close();
  }
});

test("placeView: a seat's words may be joined, as old links wrote them, when no seat is called that", async () => {
  const d = seatRegistry();
  try {
    // The registry's "Coochbehar Uttar" is `coochbeharuttar` to the SQL that squashed both sides of the comparison.
    for (const written of ["coochbehar-uttar", "Coochbehar Uttar", "coochbeharuttar", "COOCHBEHARUTTAR"]) {
      const v = await placeView(seat(written, { body: "assembly" }), {}, over(d));
      assert.equal(v.kind === "ac" ? v.brief.place.id : v.kind, "wb.ac.020", written);
    }
    assert.equal((await placeView(seat("coochbehar", { body: "assembly" }), {}, over(d))).kind, "not-found");
  } finally {
    d.close();
  }
});

test("placeView reads the version it resolved, not the newest version of its place id", async () => {
  const d = seatRegistry();
  try {
    // wb.pc.37 has a later version under an order nobody has voted under. The seat that votes is the one the query
    // resolved, and its Brief and Analysis are about that version and no other.
    const v = await placeView(seat("bishnupur", { body: "lok-sabha" }), {}, over(d));
    assert.equal(v.kind, "ac");
    if (v.kind !== "ac") return;
    assert.equal(v.brief.place.canonicalName, "Bishnupur");
    assert.equal(v.brief.place.epochId, "delim-2008");
    assert.deepEqual(v.brief.contests.map((c) => c.year), [2024]);
    assert.equal(v.trail.at(-1)?.label, "Bishnupur");
    // and the newest version's name is not a name: that order has not been voted under
    assert.equal((await placeView(seat("bishnupur-west", { body: "lok-sabha" }), {}, over(d))).kind, "not-found");
    assert.equal((await placeView(seat("wb.pc.37", { body: "lok-sabha" }), {}, over(d))).kind, "ac");
  } finally {
    d.close();
  }
});
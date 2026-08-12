/**
 * Real-registry smoke tests: every read function, executed against the actual database.
 *
 * WHY THIS EXISTS. `recent()` compiled, typechecked and shipped inside a passing production build while
 * throwing `datatype mismatch` on its first real call. `npx tsc` cannot see inside a SQL string, and the
 * Next build renders no dynamic route, so a query that names a dropped column or binds a parameter in the
 * wrong order is invisible until someone loads the page. This suite closes that gap: it calls every
 * DB-touching read function with arguments taken FROM the registry and asserts it does not throw.
 *
 * DISCOVERED FIXTURES, NOT HARD-CODED ONES. The arguments come from queries against whatever registry is
 * present — a jurisdiction with data, its newest and an older election, a seat, a person, a party. Nothing
 * here names West Bengal, so the suite exercises the shapes that actually exist rather than the one state
 * this project started with. A query that works for `wb` and fails for `ml` is exactly the class of defect
 * `recent()` was.
 *
 * SEVERAL JURISDICTIONS, DELIBERATELY. `recent()` returned nothing but West Bengal for months because
 * `ORDER BY id` is alphabetical by state; one-jurisdiction coverage would have called that healthy.
 */

import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { DEV_DB_PATH, all, get, openRead } from "../db/index.ts";
import * as elections from "./elections.ts";
import * as place from "./place.ts";
import * as placeAnalysis from "./place-analysis.ts";
import * as person from "./person.ts";
import * as home from "./home.ts";
import * as review from "./review.ts";
import * as coverage from "./coverage.ts";
import * as legacy from "./legacy.ts";
import { placeView } from "./place-page.ts";
import { personReply, placeReply, searchReply } from "./envelope.ts";

function haveRegistry(): boolean {
  try {
    const d = openRead(DEV_DB_PATH);
    try {
      d.prepare("SELECT 1 FROM election WHERE year IS NOT NULL LIMIT 1").get();
      return true;
    } finally {
      d.close();
    }
  } catch {
    return false;
  }
}
const skip = haveRegistry() ? false : `no registry at ${DEV_DB_PATH}`;
const db = (): DatabaseSync => openRead(DEV_DB_PATH);

/** Everything the suite needs to call a read function, read out of the registry itself. */
type Fixtures = {
  /** Jurisdictions with results, most seats first — a big one, a small one, and a mid one. */
  jurisdictions: string[];
  /** Newest election per jurisdiction, by real chronology. */
  latest: Map<string, string>;
  /** An election with a predecessor, so swings/previousElection have something to compare. */
  withPrevious: string | null;
  parliamentary: string | null;
  bypoll: string | null;
  /** A constituency place id and the seat number behind it. */
  placeId: string | null;
  personSlug: string | null;
  personName: string | null;
};

function fixtures(d: DatabaseSync): Fixtures {
  const js = all<{ j: string; n: number }>(
    d,
    `SELECT e.jurisdiction_place_id AS j, COUNT(*) AS n FROM election e
      WHERE e.level = 'state' GROUP BY j ORDER BY n DESC`,
  ).map((r) => r.j);
  // Biggest, smallest and middle, so the suite is not only exercising the fattest state's shape.
  const pick = [js[0], js[js.length - 1], js[Math.floor(js.length / 2)]].filter(
    (x): x is string => x !== undefined,
  );
  const latest = new Map<string, string>();
  for (const j of pick) {
    const row = get<{ id: string }>(
      d,
      `SELECT id FROM election WHERE jurisdiction_place_id = ? AND kind <> 'bypoll'
        ORDER BY year DESC, polling_month DESC, occurrence DESC LIMIT 1`,
      j,
    );
    if (row !== undefined) latest.set(j, row.id);
  }
  const withPrevious =
    get<{ id: string }>(
      d,
      `SELECT b.id FROM election a JOIN election b
         ON b.jurisdiction_place_id = a.jurisdiction_place_id AND b.kind = a.kind AND b.house = a.house
        AND b.year > a.year
       WHERE a.kind = 'assembly'
       ORDER BY b.year DESC LIMIT 1`,
    )?.id ?? null;
  return {
    jurisdictions: pick,
    latest,
    withPrevious,
    parliamentary: get<{ id: string }>(d, `SELECT id FROM election WHERE kind = 'general' ORDER BY year DESC LIMIT 1`)?.id ?? null,
    bypoll: get<{ id: string }>(d, `SELECT id FROM election WHERE kind = 'bypoll' ORDER BY year DESC LIMIT 1`)?.id ?? null,
    placeId: get<{ id: string }>(
      d,
      `SELECT v.place_id AS id FROM place_version v
        JOIN contest c ON c.place_version_id = v.id WHERE v.kind = 'ac' LIMIT 1`,
    )?.id ?? null,
    personSlug: get<{ id: string }>(
      d,
      `SELECT p.id FROM person p JOIN candidacy ca ON ca.person_id = p.id LIMIT 1`,
    )?.id ?? null,
    personName: get<{ n: string }>(
      d,
      `SELECT p.canonical_name AS n FROM person p JOIN candidacy ca ON ca.person_id = p.id LIMIT 1`,
    )?.n ?? null,
  };
}

/** Call it and let any throw fail the test with the function's name attached. */
function ran<T>(label: string, fn: () => T): T {
  try {
    return fn();
  } catch (cause) {
    assert.fail(`${label} threw against the real registry: ${(cause as Error).message}`);
  }
}

test("fixtures: the registry offers everything the read layer needs", { skip }, () => {
  const d = db();
  const f = fixtures(d);
  assert.ok(f.jurisdictions.length >= 3, `expected several jurisdictions, got ${f.jurisdictions.length}`);
  assert.equal(f.latest.size, f.jurisdictions.length, "each sampled jurisdiction has a latest election");
  assert.ok(f.withPrevious !== null, "at least one election has a predecessor");
  assert.ok(f.placeId !== null && f.personSlug !== null);
  d.close();
});

test("elections: every query runs, for a big, a small and a middling jurisdiction", { skip }, () => {
  const d = db();
  const f = fixtures(d);

  // National, no arguments — the ones a home page calls.
  const recent = ran("recent", () => elections.recent(d, 6));
  assert.ok(recent.length > 0, "recent() returns rows");
  assert.ok(new Set(recent.map((r) => r.jurisdictionId)).size > 1, "recent() spans more than one jurisdiction");
  for (const r of recent) assert.ok(r.year > 1900, `recent() year ${r.year}`);
  // Newest first, by real chronology.
  const years = recent.map((r) => r.year);
  assert.deepEqual(years, [...years].sort((a, b) => b - a), "recent() is newest first");

  for (const kind of ["assembly", "general"] as const) {
    ran(`currentStandings(${kind})`, () => elections.currentStandings(d, kind));
    ran(`swings(${kind})`, () => elections.swings(d, kind, 5));
    ran(`closeFights(${kind})`, () => elections.closeFights(d, kind, 5));
  }
  ran("bypolls", () => elections.bypolls(d, 5));
  ran("upcoming", () => elections.upcoming(d, 2026, "assembly", 5));

  for (const j of f.jurisdictions) {
    const id = f.latest.get(j);
    assert.ok(id !== undefined);
    const list = ran(`electionsIn(${j})`, () => elections.electionsIn(d, j));
    assert.ok(list.length > 0, `electionsIn(${j}) returns rows`);
    const summary = ran(`electionSummary(${id})`, () => elections.electionSummary(d, id, j));
    assert.ok(summary !== null, `electionSummary(${id}) is not null`);
    const seats = ran(`seatResults(${id}, ${j})`, () => elections.seatResults(d, id, j));
    assert.ok(seats.length > 0, `seatResults(${id}) returns rows`);
    for (const s of seats.slice(0, 5)) {
      assert.ok(s.placeName !== null && s.placeName !== "", `seat ${s.number} is named`);
    }
    ran(`statePage(${j})`, () => elections.statePage(d, j));
    ran(`statePage(${j}, ${id})`, () => elections.statePage(d, j, id));
    ran(`previousElection(${id})`, () => elections.previousElection(d, id));
  }

  if (f.withPrevious !== null) {
    const prev = ran("previousElection", () => elections.previousElection(d, f.withPrevious ?? ""));
    assert.ok(prev !== null, "the chosen election has a predecessor");
    ran("swingRows", () => elections.swingRows(d, f.withPrevious ?? "", prev ?? ""));
  }
  if (f.parliamentary !== null) {
    ran("electionSummary(parliamentary)", () => elections.electionSummary(d, f.parliamentary ?? ""));
  }
  if (f.bypoll !== null) {
    ran("electionSummary(bypoll)", () => elections.electionSummary(d, f.bypoll ?? ""));
  }
  d.close();
});

test("places: brief, analysis and demographics run for a real seat", { skip }, () => {
  const d = db();
  const f = fixtures(d);
  const id = f.placeId ?? "";
  const brief = ran("getPlaceBrief", () => place.getPlaceBrief(d, id));
  assert.ok(brief !== null, `getPlaceBrief(${id}) is not null`);
  assert.ok(brief.place.canonicalName !== "", "the seat is named");
  assert.ok(brief.contests.length > 0, "the seat has contests");
  // Scoped to one delimitation: a seat cannot have held more elections than its epoch has.
  assert.ok(brief.contests.length < 30, `${brief.contests.length} contests is too many for one epoch`);

  // By name as well as by id — a different code path in the same function.
  ran("getPlaceBrief(by name)", () => place.getPlaceBrief(d, brief.place.canonicalName));

  ran("demographicClaims", () => place.demographicClaims(d, id));
  ran("getPlaceAnalysis", () => placeAnalysis.getPlaceAnalysis(d, id));
  ran("getPlaceAnalysis(filtered)", () =>
    placeAnalysis.getPlaceAnalysis(d, id, { fromYear: 2000, toYear: 2030 }),
  );
  d.close();
});

test("people: brief and search run for a real person", { skip }, () => {
  const d = db();
  const f = fixtures(d);
  const brief = ran("getPersonBrief", () => person.getPersonBrief(d, f.personSlug ?? ""));
  assert.ok(brief !== null, "getPersonBrief returns a person");
  assert.ok(brief.candidacies.length > 0, "the person has a career");
  // Candidate history is newest first, by real chronology.
  const ys = brief.candidacies.map((c) => c.year);
  assert.deepEqual(ys, [...ys].sort((a, b) => b - a), "candidate history is newest first");
  for (const c of brief.candidacies) assert.ok(c.placeName !== "", "each candidacy names its seat");

  ran("searchPersons", () => person.searchPersons(d, f.personName ?? "", 10));
  ran("getPersonBrief(unknown)", () => person.getPersonBrief(d, "no-such-person-zzzz"));
  d.close();
});

test("party history: a party's record across elections runs", { skip }, () => {
  const d = db();
  // There is no `partyHistory()` in the repo layer; the party record is what standings and swings
  // compute per election. Assert the underlying shape runs and reconciles, so the state page's
  // party-wise section has something to stand on — and so this suite fails if it stops working.
  const f = fixtures(d);
  for (const j of f.jurisdictions) {
    const id = f.latest.get(j) ?? "";
    const summary = elections.electionSummary(d, id, j);
    assert.ok(summary !== null);
    ran(`party rows for ${id}`, () => summary.parties);
    const seatsFromParties = summary.parties.reduce((n, p) => n + p.seats, 0);
    assert.ok(
      seatsFromParties <= summary.seatsContested,
      `${id}: party seats ${seatsFromParties} exceed ${summary.seatsContested} contested`,
    );
  }
  d.close();
});

/**
 * The homepage's data layer, every layer and every section, against the real registry.
 *
 * It was not in this suite before, which was the gap that mattered most: `/` is the one route every
 * reader hits, `homeView` fans out to eight queries, and six of them are only reachable through a
 * `?layer=` the tests never varied. A sequential layer that throws on a state with no turnout row would
 * have been invisible until someone clicked "Turnout".
 */
test("the homepage's every layer and section run", { skip }, () => {
  const d = db();
  for (const l of home.LAYERS) {
    const view = ran(`homeView(layer=${l.key})`, () =>
      home.homeView(d, { layer: l.key, thisYear: 2026 }),
    );
    assert.ok(view.layer.cells.length > 0, `layer ${l.key} produced no cells`);
    // Every cell must carry a destination, because the map is the page's navigation.
    for (const c of view.layer.cells) {
      assert.match(c.href, /^\/pl\//, `layer ${l.key}: ${c.jurisdictionId} has no place link`);
    }
  }
  // Per-election coverage is /coverage's data layer now. Exercise every election it offers, not just the
  // newest: the panel used to be reachable only through a <select> whose other 23 options no test opened.
  const offered = home.electionCoverageView(d, undefined);
  assert.ok(offered.choices.length > 0, "no election is on offer for the coverage page");
  for (const c of offered.choices) {
    const got = ran(`electionCoverageView(${c.id})`, () => home.electionCoverageView(d, c.id));
    assert.equal(got.chosen?.electionId, c.id, `${c.id} did not resolve to itself`);
  }
  d.close();
});

test("state and national summaries run", { skip }, () => {
  const d = db();
  ran("getCoverage", () => coverage.getCoverage(d));
  ran("coverage.verticals", () => coverage.verticals(d));
  ran("coverage.jurisdictions", () => coverage.jurisdictions(d));
  ran("coverage.geography", () => coverage.geography(d));
  d.close();
});

test("review queue and legacy adapters run", { skip }, () => {
  const d = db();
  ran("review.progress", () => review.progress(d));
  ran("review.nextForReview", () => review.nextForReview(d));
  ran("review.recallEstimate", () => review.recallEstimate(d));
  ran("legacy.placePathForLegacyId", () => legacy.placePathForLegacyId(d, "1"));
  ran("legacy.sittingMemberForLegacyId", () => legacy.sittingMemberForLegacyId(d, "1"));
  ran("legacy.personForMynetaId", () => legacy.personForMynetaId(d, "0"));
  d.close();
});

test("the API envelope answers 200 for real ids", { skip }, async () => {
  const d = db();
  const f = fixtures(d);
  d.close();
  const person = await personReply(f.personSlug ?? "");
  assert.equal(person.status, 200, `personReply: ${JSON.stringify(person.body).slice(0, 160)}`);
  const pl = await placeReply(f.placeId ?? "");
  assert.equal(pl.status, 200, `placeReply: ${JSON.stringify(pl.body).slice(0, 160)}`);
  const search = await searchReply(f.personName ?? "", 5);
  assert.equal(search.status, 200, `searchReply: ${JSON.stringify(search.body).slice(0, 160)}`);
});

test("placeView renders every level of the path grammar", { skip }, async () => {
  const d = db();
  const f = fixtures(d);
  // The path grammar is /pl/:state · /pl/:state/:district · /pl/:state/:district/:ac, so build a real
  // three-segment path out of the registry rather than assuming one.
  const row = get<{ state: string; district: string; seat: string }>(
    d,
    `SELECT j.id AS state,
            substr(dist.id, length(j.id) + 2) AS district,
            LOWER(REPLACE(v.canonical_name, ' ', '-')) AS seat
       FROM place_version v
       JOIN place dist ON dist.id = v.district_place_id
       JOIN place j    ON j.id = v.jurisdiction_id
       JOIN contest c  ON c.place_version_id = v.id
      WHERE v.kind = 'ac' LIMIT 1`,
  );
  d.close();
  assert.ok(row !== undefined, "the registry has a seat inside a district");

  const state = await placeView([row.state], {});
  assert.notEqual(state.kind, "not-found", `/pl/${row.state}`);
  const district = await placeView([row.state, row.district], {});
  assert.notEqual(district.kind, "not-found", `/pl/${row.state}/${row.district}`);
  const seat = await placeView([row.state, row.district, row.seat], {});
  assert.notEqual(seat.kind, "not-found", `/pl/${row.state}/${row.district}/${row.seat}`);
  // A path that asserts a false ancestry must 404 rather than resolve.
  const wrong = await placeView([row.state, "no-such-district-zzz", row.seat], {});
  assert.equal(wrong.kind, "not-found", "a false district in the path is not-found");
});

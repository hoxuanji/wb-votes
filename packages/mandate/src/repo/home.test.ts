// Tests for the national front page's data contract.
//
// THREE THINGS THIS SUITE EXISTS TO CATCH, all of them defects this codebase has actually shipped:
//
//  1. A RANKING THAT IS ALPHABETICAL. `recent()` returned four West Bengal elections in a row for months
//     because `ORDER BY id DESC` sorts by the middle of the string. The chronology assertions here bind the
//     specific pair the brief names — `wb-bypoll-ae-2021` against `wb-bypoll-ge-2016` — so the fix cannot
//     be undone by someone reaching for `ORDER BY id` again.
//  2. A FABRICATED FIGURE. Every "null means the source published nothing" rule is asserted against the
//     live registry, because the one place it fails is the place nobody checked: West Bengal 2026 carries
//     winners and no vote counts, and a 0 there would look like a measurement.
//  3. A COLOUR CLAIM THAT WAS NEVER MEASURED. The palette comment in home.ts states a worst-case CVD
//     separation. That number is computed here — OKLab ΔE under normal, protan, deutan and tritan vision —
//     so it is a test rather than a paragraph. This is the one check that cannot be done by reading code.
//
// The registry-backed tests skip when there is no .data/registry.db, and take their fixtures FROM the
// registry: nothing here names a state, so the suite exercises whatever has been loaded.

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { DEV_DB_PATH, all, get, openRead } from "../db/index.ts";
import {
  ARRIVAL_SEATS,
  DEFAULT_LAYER,
  KNIFE_PP,
  LAYERS,
  NO_DATA_HUE,
  MOVE_PP,
  PER_RULE,
  SEQUENTIAL,
  availability,
  electionCoverage,
  electionCoverageView,
  homeView,
  isLayer,
  layer,
  partyLandscape,
  snapshot,
  spine,
  watchSignals,
  type LayerKey,
} from "./home.ts";
import {
  closeFights,
  currentStandings,
  latestPerJurisdiction,
  previousElection,
  recent,
  seatsWonBy,
  upcoming,
} from "./elections.ts";
import { INDIA_TOTALS } from "../ingest/india.ts";
import { open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";

const HAVE_DB = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const live = { skip: HAVE_DB ? false : "no .data/registry.db — run npm run registry:ingest" };
const db = (): DatabaseSync => openRead();
const THIS_YEAR = 2026;

/* ────────────────────────────── the colour claim, computed ────────────────────────────── */

const PANEL = "#0f0e15";

const hex = (h: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lin = (h: string): [number, number, number] => hex(h).map(toLinear) as [number, number, number];

/** OKLab, from linear sRGB. */
function oklab([r, g, b]: readonly [number, number, number]): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Dichromat simulation in LMS. The three matrices are the standard protan/deutan/tritan projections. */
const RGB_LMS = [
  [0.31399, 0.63951, 0.04649],
  [0.15537, 0.75789, 0.0867],
  [0.01775, 0.10944, 0.87252],
] as const;
const LMS_RGB = [
  [5.47221, -4.64196, 0.16963],
  [-1.12524, 2.29317, -0.16789],
  [0.0298, -0.19318, 1.16364],
] as const;
const SIM = {
  protan: [
    [0, 1.05118294, -0.05116099],
    [0, 1, 0],
    [0, 0, 1],
  ],
  deutan: [
    [1, 0, 0],
    [0.9513092, 0, 0.04866992],
    [0, 0, 1],
  ],
  tritan: [
    [1, 0, 0],
    [0, 1, 0],
    [-0.86744736, 1.86727089, 0],
  ],
} as const;
type Mode = "normal" | keyof typeof SIM;
const MODES: readonly Mode[] = ["normal", "protan", "deutan", "tritan"];

const apply = (m: readonly (readonly number[])[], v: readonly number[]): [number, number, number] =>
  m.map((row) => (row[0] as number) * (v[0] as number) + (row[1] as number) * (v[1] as number) + (row[2] as number) * (v[2] as number)) as [number, number, number];

function seen(h: string, mode: Mode): [number, number, number] {
  const rgb = lin(h);
  if (mode === "normal") return oklab(rgb);
  const out = apply(LMS_RGB, apply(SIM[mode], apply(RGB_LMS, rgb)));
  return oklab(out.map((c) => Math.max(0, Math.min(1, c))) as [number, number, number]);
}

/** OKLab distance, ×100 — the scale the dataviz separation floors are stated on. */
function deltaE(a: string, b: string, mode: Mode): number {
  const [l1, a1, b1] = seen(a, mode);
  const [l2, a2, b2] = seen(b, mode);
  return 100 * Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

const luminance = (h: string): number => {
  const [r, g, b] = lin(h);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/* ────────────────────────────── the palette moved, and so did its tests ──────────────────────────────
 *
 * Four tests lived here: all-pairs CVD separation of PARTY_HUES, mark contrast on the panel, assignment by
 * rank, and stability when a jurisdiction drops out. The first two are now in viz/party-ink.test.ts, over the
 * real 23-colour curated set and a 600-party sample of the generated one. The other two asserted the defect:
 * "party ink is assigned by rank" and "colour follows the party, not its position" were describing a system
 * where rank determined colour and the mitigation was that rank happened to be stable. Rank no longer touches
 * colour at all, and the test for that is party-ink.test.ts's first one.
 */

/* ────────────────────────────── chronology ────────────────────────────── */

test("chronology comes from columns, not from the id string", live, () => {
  const d = db();
  try {
    // The exact pair the brief names. By id, 'wb-bypoll-ge-2016' sorts ABOVE 'wb-bypoll-ae-2021', so a
    // lexical ranking calls a 2016 result the current state of play.
    const byKind = currentStandings(d, "bypoll").find((s) => s.jurisdictionId === "wb");
    if (byKind !== undefined) {
      const years = all<{ id: string; year: number }>(
        d,
        "SELECT id, year FROM election WHERE kind = 'bypoll' AND jurisdiction_place_id = 'wb'",
      );
      const newest = Math.max(...years.map((y) => y.year));
      assert.equal(byKind.year, newest, `latest by-election is ${byKind.electionId}, but ${newest} exists`);
    }

    // And the general rule, for every jurisdiction and both houses: nothing older may be reported as latest.
    for (const kind of ["assembly", "bypoll"]) {
      for (const s of currentStandings(d, kind)) {
        const newer = get<{ n: number }>(
          d,
          `SELECT COUNT(*) AS n FROM election
            WHERE kind = ? AND jurisdiction_place_id = ? AND year > ?`,
          kind,
          s.jurisdictionId,
          s.year,
        );
        assert.equal(newer?.n, 0, `${s.electionId} is reported as latest ${kind} but a later one exists`);
      }
    }

    // previousElection must be strictly earlier, same kind, same jurisdiction.
    for (const l of latestPerJurisdiction(d, "assembly")) {
      const prev = previousElection(d, l.id);
      if (prev === null) continue;
      const p = get<{ year: number; kind: string; j: string }>(
        d,
        "SELECT year, kind, jurisdiction_place_id AS j FROM election WHERE id = ?",
        prev,
      );
      assert.ok((p?.year ?? 0) <= l.year, `${prev} is not earlier than ${l.id}`);
      assert.equal(p?.j, l.jurisdictionId, `${prev} is a different jurisdiction from ${l.id}`);
      assert.equal(p?.kind, "assembly", `${prev} is a different kind from ${l.id}`);
    }
  } finally {
    d.close();
  }
});

test("recent elections are ordered by the calendar and span more than one state", live, () => {
  const d = db();
  try {
    const rows = recent(d, 8);
    assert.ok(rows.length > 1, "no recent elections");
    for (let i = 1; i < rows.length; i += 1) {
      assert.ok(
        (rows[i]?.year ?? 0) <= (rows[i - 1]?.year ?? 0),
        `out of order: ${rows[i - 1]?.id} then ${rows[i]?.id}`,
      );
    }
    // The defect this replaced returned one state's four elections. A national page must not.
    assert.ok(
      new Set(rows.map((r) => r.jurisdictionId)).size > 1,
      `every recent election is in ${rows[0]?.jurisdictionId} — this is the ORDER BY id defect`,
    );
  } finally {
    d.close();
  }
});

/* ────────────────────────────── announced beats derived ────────────────────────────── */

/**
 * An election the Commission has announced must displace the derived guess at it.
 *
 * This is the one rule on the page with NO live example: `announced_on` is NULL for all 1,202 rows, so the
 * announced branch of `upcoming()` never runs against the real registry and a defect in it would ship
 * invisibly — right up until the ECI schedule is ingested, at which point the front page would print a
 * five-year term beside a date the Commission actually set. So the fixture is built by hand.
 */
function fixture(): DatabaseSync {
  const d = open(":memory:");
  migrate(d, "2026-08-12T00:00:00.000Z");
  d.exec(`
    INSERT INTO source (id, kind, retrieved_at, doc_hash) VALUES ('s1','static_module','2026-08-12','sha256:0');
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e1','Delimitation','2008-02-19');
    INSERT INTO place (id, kind, canonical_name) VALUES ('ka','state','Karnataka');
    INSERT INTO place (id, kind, canonical_name) VALUES ('kl','state','Kerala');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('ka.ac.001','ac','SEAT A','ka');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('kl.ac.001','ac','SEAT B','kl');
    INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
      VALUES (1,'ka.ac.001','ka','ac','e1',1,'SEAT A','general');
    INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
      VALUES (2,'kl.ac.001','kl','ac','e1',1,'SEAT B','general');
    -- Karnataka: an election held in 2023, and its successor ANNOUNCED for 2028.
    INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
      VALUES ('ka-assembly-2023','assembly','state','ka','e1','KA 2023','declared','ac',2023,1);
    INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year,
                          occurrence, announced_on, counting_on)
      VALUES ('ka-assembly-2028','assembly','state','ka','e1','KA 2028','declared','ac',2028,1,
              '2028-03-01','2028-05-13');
    -- Kerala: an election held in 2021 and nothing announced, so it must appear as DERIVED for 2026.
    INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
      VALUES ('kl-assembly-2021','assembly','state','kl','e1','KL 2021','declared','ac',2021,1);
    INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES ('c1','ka-assembly-2023',1,'declared');
    INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES ('c2','kl-assembly-2021',2,'declared');
    INSERT INTO person (id, canonical_name, created_at) VALUES ('p1','A','2026-08-12');
    INSERT INTO person (id, canonical_name, created_at) VALUES ('p2','B','2026-08-12');
    INSERT INTO party (id, name, short_name) VALUES ('PARTY','A Party','PTY');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (1,'PARTY','1990-01-01','A Party');
    INSERT INTO candidacy (id, contest_id, person_id, party_version_id, status) VALUES ('d1','c1','p1',1,'elected');
    INSERT INTO candidacy (id, contest_id, person_id, party_version_id, status) VALUES ('d2','c2','p2',1,'elected');
    INSERT INTO result (contest_id, candidacy_id, votes, rank, is_winner, source_id, ingested_at)
      VALUES ('c1','d1',100,1,1,'s1','2026-08-12');
    INSERT INTO result (contest_id, candidacy_id, votes, rank, is_winner, source_id, ingested_at)
      VALUES ('c2','d2',100,1,1,'s1','2026-08-12');
  `);
  return d;
}

test("an announced election displaces the derived guess at it, and is marked differently", () => {
  const d = fixture();
  try {
    const next = upcoming(d, 2026);
    // The announced one is present, carries the Commission's own date, and is not a five-year count.
    assert.equal(next.announced.length, 1, "the announced election is missing");
    assert.equal(next.announced[0]?.id, "ka-assembly-2028");
    assert.equal(next.announced[0]?.announcedOn, "2028-03-01");
    assert.equal(next.announced[0]?.countingOn, "2028-05-13");
    // Karnataka must NOT also appear as a derived 2028 row: one jurisdiction, one answer.
    assert.equal(
      next.derived.filter((r) => r.jurisdictionId === "ka").length,
      0,
      "Karnataka appears both announced and derived",
    );
    // Kerala has nothing announced, so it is derived — 2021 plus a five-year term.
    const kl = next.derived.find((r) => r.jurisdictionId === "kl");
    assert.equal(kl?.year, 2026, "Kerala's derived year is not the term expiry");
    assert.equal(kl?.announcedOn, null, "a derived row must carry no announced date");
    assert.deepEqual(next.overdue, [], "nothing expired before 2026 in this fixture");
  } finally {
    d.close();
  }
});

test("the live registry holds no announced date, so every upcoming row is derived", live, () => {
  const d = db();
  try {
    const next = upcoming(d, THIS_YEAR);
    const claimed = get<{ n: number }>(
      d,
      "SELECT COUNT(*) AS n FROM election WHERE announced_on IS NOT NULL OR notified_on IS NOT NULL",
    );
    assert.equal(next.announced.length === 0, (claimed?.n ?? 0) === 0, "announced rows disagree with the registry");
    for (const r of next.derived) {
      assert.equal(r.announcedOn, null, `${r.jurisdictionId} carries a date nobody announced`);
      assert.ok(r.year >= THIS_YEAR, `${r.jurisdictionId} is in the upcoming list with a past year`);
    }
    // Overdue is a statement about coverage, not an upcoming election, and must be kept separate.
    for (const r of next.overdue) assert.ok(r.year < THIS_YEAR, `${r.jurisdictionId} is not overdue`);
    assert.equal(
      new Set([...next.derived, ...next.overdue].map((r) => r.jurisdictionId)).size,
      next.derived.length + next.overdue.length,
      "a jurisdiction is both upcoming and overdue",
    );
  } finally {
    d.close();
  }
});

/* ────────────────────────────── the map ────────────────────────────── */

test("every layer covers every jurisdiction exactly once, and never invents a value", live, () => {
  const d = db();
  try {
    const sp = spine(d);
    for (const meta of LAYERS) {
      const l = layer(d, meta.key, sp);
      assert.equal(l.cells.length, INDIA_TOTALS.jurisdictions, `${meta.key} does not cover all jurisdictions`);
      assert.equal(
        new Set(l.cells.map((c) => c.jurisdictionId)).size,
        l.cells.length,
        `${meta.key} lists a jurisdiction twice`,
      );
      for (const c of l.cells) {
        // An unlabelled cell is an ABSENCE and must wear the no-data ink. A labelled one must not.
        if (c.label === null) {
          assert.equal(c.fill, NO_DATA_HUE, `${meta.key}/${c.jurisdictionId} has no label but a real fill`);
        } else {
          assert.notEqual(c.fill, NO_DATA_HUE, `${meta.key}/${c.jurisdictionId} is labelled but unlit`);
          assert.ok(c.detail.length > 0, `${meta.key}/${c.jurisdictionId} has a value and no hover card`);
        }
        assert.match(c.href, /^\/state\/[a-z]{2}$/, `${c.jurisdictionId} does not link to its state page`);
      }
      assert.equal(l.unknown, l.cells.filter((c) => c.label === null).length);
      // A layer with anything behind it must carry a legend, because colour is never the only channel.
      if (l.available) assert.ok(l.legend.length > 0, `${meta.key} is available with no legend`);
      assert.ok(l.unknownWhy.trim().length > 0, `${meta.key} does not say why a cell is unlit`);
    }
  } finally {
    d.close();
  }
});

test("layer availability is measured from the registry, not declared", live, () => {
  const d = db();
  try {
    const sp = spine(d);
    const can = availability(sp);
    for (const meta of LAYERS) {
      assert.equal(
        can.get(meta.key),
        layer(d, meta.key, sp).available,
        `${meta.key}: the cheap probe and the built layer disagree about availability`,
      );
    }
  } finally {
    d.close();
  }
});

test("the vote-share layer prints an absence, not a zero, where no counts were published", live, () => {
  const d = db();
  try {
    const sp = spine(d);
    const l = layer(d, "voteshare", sp);
    // Any jurisdiction whose latest assembly has no vote counts must be unlit AND must say which case it
    // is: "no counts published" is a different fact from "no election loaded".
    for (const s of sp.standings) {
      if (sp.counted.has(s.electionId)) continue;
      const cell = l.cells.find((c) => c.jurisdictionId === s.jurisdictionId);
      assert.equal(cell?.label, null, `${s.jurisdictionId} shows a share for an election with no counts`);
      assert.ok(
        (cell?.detail ?? []).some((line) => /no vote counts/.test(line)),
        `${s.jurisdictionId} is unlit without saying its source published no counts`,
      );
    }
    for (const c of l.cells) {
      if (c.label !== null) assert.doesNotMatch(c.label, /^0\.0%$/, `${c.jurisdictionId} shows a 0.0% share`);
    }
  } finally {
    d.close();
  }
});

/* ────────────────────────────── coverage ────────────────────────────── */

test("election coverage counts rows and never asserts a total", live, () => {
  const d = db();
  try {
    // Every election of every shape the registry holds: a general election, an assembly, a by-election.
    const pick = (where: string, n: number): string[] =>
      all<{ id: string }>(
        d,
        `SELECT id FROM election WHERE ${where} ORDER BY year DESC, id LIMIT ?`,
        n,
      ).map((r) => r.id);
    const ids = [
      ...pick("house = 'pc' AND kind <> 'bypoll'", 2),
      ...pick("house = 'ac' AND kind <> 'bypoll'", 4),
      ...pick("kind = 'bypoll'", 2),
    ];
    assert.ok(ids.length >= 3, "not enough elections to exercise coverage");
    for (const id of ids) {
      const c = electionCoverage(d, id);
      assert.ok(c !== null, `${id} has no coverage`);
      assert.ok(c.expectedBasis.trim().length > 0, `${id} does not say where its expectation comes from`);
      // The counts must be counts: each is bounded by the contests it describes.
      assert.ok(c.numericResults <= c.contests, `${id}: more numeric results than contests`);
      assert.ok(c.declaredWinners <= c.contests, `${id}: more winners than contests`);
      assert.ok(c.unopposed <= c.contests, `${id}: more unopposed than contests`);
      assert.ok(c.turnoutRows <= c.contests, `${id}: more turnout rows than contests`);
      // "Complete" is only reachable when there is something to be complete against.
      if (c.completeness === "complete") {
        assert.notEqual(c.expected, null, `${id} is complete against no expectation`);
        assert.deepEqual(c.gaps, [], `${id} is complete with gaps`);
      }
      if (c.contests === 0) assert.equal(c.completeness, "unavailable");
      if (c.gaps.length > 0) assert.notEqual(c.completeness, "complete");
      assert.ok(c.epochs.reduce((n, e) => n + e.contests, 0) === c.contests, `${id}: epochs do not sum to contests`);
    }
  } finally {
    d.close();
  }
});

test("an unopposed seat is counted as unopposed, and never as a numeric result", live, () => {
  const d = db();
  try {
    // Found from the registry, not named: the claim is what makes a seat unopposed rather than missing.
    const row = get<{ id: string }>(
      d,
      `SELECT c.election_id AS id FROM claim cl
         JOIN contest c ON 'contest:' || c.id = cl.subject_ref
        WHERE cl.predicate = 'elected_unopposed' LIMIT 1`,
    );
    if (row === undefined) return; // nothing unopposed is loaded; the rule is still asserted above
    const c = electionCoverage(d, row.id);
    assert.ok((c?.unopposed ?? 0) >= 1, `${row.id} holds an elected_unopposed claim that coverage misses`);
    // THE RULE FROM THE BRIEF: 542 numeric plus one unopposed must never be reported as 543 numeric.
    assert.equal(
      c?.numericResults,
      (c?.contests ?? 0) - (c?.unopposed ?? 0),
      `${row.id}: the unopposed seat is being counted among the numeric results`,
    );
    assert.equal(c?.declaredWinners, (c?.contests ?? 0) - (c?.unopposed ?? 0), "an unopposed seat has no result row");
  } finally {
    d.close();
  }
});

/* ────────────────────────────── signals ────────────────────────────── */

test("every watch signal is traceable, thresholded and honest about its basis", live, () => {
  const d = db();
  try {
    const sp = spine(d);
    const signals = watchSignals(d, sp, THIS_YEAR);
    assert.ok(signals.length > 0, "no signals at all");
    const perRule = new Map<string, number>();
    for (const s of signals) {
      assert.ok(s.rule.trim().length > 0, "a signal with no rule");
      assert.ok(s.threshold.trim().length > 0, `${s.rule} states no threshold`);
      assert.ok(s.detail.trim().length > 0, `${s.rule} has no detail`);
      assert.match(s.href, /^\/(state|district|constituency)\//, `${s.subject} does not link anywhere`);
      // EVERY SIGNAL IS MEASURED, and that is a deliberate property rather than an accident of the data.
      // The one derived rule was a five-year term expiry, which is what the Upcoming section prints, from
      // the same arithmetic on the same rows, labelled derived there too. It outranked every measured
      // count and fired for eleven jurisdictions. If a derived rule comes back, it needs a reason to be
      // here rather than there.
      assert.equal(s.basis, "measured", `${s.subject} is ${s.basis} — is it Upcoming's fact under another name?`);
      // Nothing here may read as a forecast.
      assert.doesNotMatch(
        `${s.rule} ${s.detail}`,
        /\b(will win|predict|forecast|likely to|expected to win|projected)\b/i,
        `${s.subject} reads as a prediction`,
      );
      perRule.set(s.rule, (perRule.get(s.rule) ?? 0) + 1);
    }
    for (const [rule, n] of perRule) assert.ok(n <= PER_RULE, `${rule} contributes ${n} rows, cap is ${PER_RULE}`);
    // One row per subject: eight rows about eight places, not eight about two.
    assert.equal(new Set(signals.map((s) => s.subject)).size, signals.length, "a subject appears twice");
    // And the section must be a MIX. All-one-rule is the defect the quota exists to prevent.
    assert.ok(perRule.size >= 2, `every signal came from one rule: ${[...perRule.keys()]}`);
    // The thresholds the rules name must be the exported constants, so the page and the rule agree.
    const text = signals.map((s) => s.threshold).join(" ");
    if (signals.some((s) => /margin under/.test(s.rule))) assert.match(text, new RegExp(`${KNIFE_PP}%`));
    if (signals.some((s) => /vote share moved/.test(s.rule))) assert.match(text, new RegExp(`${MOVE_PP} percentage`));
    if (signals.some((s) => /won none last time/.test(s.rule))) assert.match(text, new RegExp(`${ARRIVAL_SEATS} seats`));
  } finally {
    d.close();
  }
});

test("a seat that changed hands really did change hands", live, () => {
  const d = db();
  try {
    const sp = spine(d);
    const flip = watchSignals(d, sp, THIS_YEAR).find((s) => /differs from the previous election/.test(s.rule));
    if (flip === undefined) return;
    const stand = sp.standings.find((s) => s.jurisdictionName === flip.subject);
    assert.ok(stand !== undefined, `${flip.subject} is not a jurisdiction in the standings`);
    const thenId = sp.previousOf(stand.electionId);
    assert.ok(thenId !== null, `${flip.subject} has no previous election to have flipped against`);
    // Recount independently: same place, same house, consecutive elections, both winners known.
    const before = new Map(
      sp.seats.filter((x) => x.electionId === thenId).map((x) => [x.placeId, x.winnerKey]),
    );
    const flipped = sp.seats.filter((x) => {
      if (x.electionId !== stand.electionId) return false;
      const was = before.get(x.placeId);
      return was != null && x.winnerKey != null && was !== x.winnerKey;
    }).length;
    assert.match(flip.detail, new RegExp(`^${flipped} of `), `the signal's count is not the recount (${flipped})`);
  } finally {
    d.close();
  }
});

/* ────────────────────────────── party landscape and history ────────────────────────────── */

test("the party landscape totals reconcile with the seats the registry holds", live, () => {
  const d = db();
  try {
    const sp = spine(d);
    const p = partyLandscape(d, sp, 40);
    assert.ok(p.rows.length > 0, "no parties");
    // Seats in the latest Lok Sabha, as this section reports them, must equal the winners actually held —
    // which for 2024 is 542 and not 543, because Surat's unopposed seat has no result row to count.
    if (p.houseElectionId !== null) {
      const winners = get<{ n: number }>(
        d,
        `SELECT COUNT(*) AS n FROM result r JOIN contest c ON c.id = r.contest_id
          WHERE r.revision = 0 AND r.is_winner = 1 AND c.election_id = ?`,
        p.houseElectionId,
      );
      assert.equal(p.houseSeats, winners?.n, "the house total is not the winners the registry holds");
      assert.ok(p.houseSeats <= INDIA_TOTALS.lokSabhaSeats, "more seats than the Lok Sabha has");
    }
    // Ranked by presence across the country, and every row must be non-empty.
    for (let i = 1; i < p.rows.length; i += 1) {
      const a = p.rows[i - 1];
      const b = p.rows[i];
      assert.ok(
        (a?.governs ?? 0) > (b?.governs ?? 0) ||
          ((a?.governs ?? 0) === (b?.governs ?? 0) && (a?.houseSeats ?? 0) >= (b?.houseSeats ?? 0)),
        `${a?.key} ranks above ${b?.key} on neither jurisdictions nor seats`,
      );
    }
    for (const r of p.rows) {
      assert.ok(r.governs > 0 || r.houseSeats > 0 || r.assemblySeats > 0, `${r.key} is an empty row`);
      assert.ok(r.governsMajority <= r.governs, `${r.key} holds more majorities than jurisdictions`);
      // A party absent from one side of a comparison gets a null, never a ±100.
      if (r.houseSharePct === null) assert.equal(r.houseSharePp, null, `${r.key} has a change with no share`);
      // The sparkline reaches back through the Lok Sabha elections in calendar order.
      for (let i = 1; i < r.spark.length; i += 1) {
        assert.ok((r.spark[i]?.year ?? 0) > (r.spark[i - 1]?.year ?? 0), `${r.key}'s sparkline is out of order`);
      }
    }
  } finally {
    d.close();
  }
});

/* ────────────────────────────── the whole view ────────────────────────────── */

test("homeView renders for every layer, and falls back rather than throwing on a bad parameter", live, () => {
  const d = db();
  try {
    for (const l of [...LAYERS.map((x) => x.key), "nonsense", undefined] as (LayerKey | string | undefined)[]) {
      const v = homeView(d, { layer: l as string | undefined, thisYear: THIS_YEAR });
      const expected = isLayer(l as string | undefined) ? l : DEFAULT_LAYER;
      assert.equal(v.layer.key, expected, `layer=${String(l)} resolved to ${v.layer.key}`);
    }
    // `layer` is the ONLY parameter the front page still takes. `?election=` and `?house=` went with the
    // coverage panel and the history grid; the membership check that made a hand-edited `?election=` safe
    // moved to electionCoverageView, and is asserted below rather than lost.
    assert.deepEqual(
      Object.keys(homeView(d, { thisYear: THIS_YEAR })).sort(),
      // No `ink`. A party's colour is a pure function of its key now (viz/party-ink.ts), so there is nothing
      // to thread through a view model — which is the shape of the fix as well as its consequence.
      // `fights` and `heldTop` arrived with the final design pass: the front page reaches a SEAT now (five
      // closest contests, each a link to a constituency) and a recent-result card names a runner-up, because
      // "BJP 240" alone does not tell a reader what the election was.
      ["announced", "coverageOf", "fights", "headline", "held", "heldTop", "layer", "layers", "overdue", "parties", "signals", "snapshot", "standings", "states", "upcoming"],
      "homeView returns something the page does not render, or has stopped returning something it does",
    );
  } finally {
    d.close();
  }
});

test("a hand-edited election id falls back to the newest rather than reaching the SQL", live, () => {
  const d = db();
  try {
    const bogus = electionCoverageView(d, "'; DROP TABLE result; --");
    assert.ok(bogus.choices.length > 0, "no elections are on offer at all");
    assert.equal(bogus.chosen?.electionId, bogus.choices[0]?.id, "a bogus election id did not fall back");
    for (let i = 1; i < bogus.choices.length; i += 1) {
      assert.ok(
        (bogus.choices[i]?.year ?? 0) <= (bogus.choices[i - 1]?.year ?? 0),
        "the election list is out of order",
      );
    }
    // And a real one is honoured, or the fallback is doing all the work.
    const real = bogus.choices.at(-1);
    assert.ok(real !== undefined);
    assert.equal(electionCoverageView(d, real.id).chosen?.electionId, real.id, "a real id was not honoured");
  } finally {
    d.close();
  }
});

test("the snapshot's ratios cannot exceed the country, and the live flag is never decorative", live, () => {
  const d = db();
  try {
    const sp = spine(d);
    const s = snapshot(d, sp.standings, sp.states, sp.houseStandings, null, THIS_YEAR);
    assert.equal(s.jurisdictionsTotal, INDIA_TOTALS.jurisdictions);
    assert.equal(s.assemblySeatsTotal, INDIA_TOTALS.assemblySeats);
    assert.equal(s.lokSabhaSeatsTotal, INDIA_TOTALS.lokSabhaSeats);
    // A percentage that can exceed 100 is not a measurement: the held counts are scoped to each
    // jurisdiction's newest election precisely so undivided Bihar's 324 seats cannot inflate them.
    assert.ok(s.assemblySeatsHeld <= s.assemblySeatsTotal, `${s.assemblySeatsHeld} of ${s.assemblySeatsTotal}`);
    assert.ok(s.lokSabhaSeatsHeld <= s.lokSabhaSeatsTotal, `${s.lokSabhaSeatsHeld} of ${s.lokSabhaSeatsTotal}`);
    assert.ok(s.jurisdictionsWithResults <= s.jurisdictionsTotal);
    // The strip must not contradict the map beside it.
    assert.equal(
      s.jurisdictionsWithResults,
      new Set([...sp.standings, ...sp.houseStandings].map((x) => x.jurisdictionId)).size,
    );
    // `live` is read off election.lifecycle. Nothing in this registry is running, and a decorative
    // indicator is exactly what the brief forbids.
    const running = get<{ n: number }>(
      d,
      "SELECT COUNT(*) AS n FROM election WHERE lifecycle IN ('polling', 'counting')",
    );
    assert.equal(s.live, (running?.n ?? 0) > 0);
  } finally {
    d.close();
  }
});

test("the headline counts assemblies, not jurisdictions with any result", live, () => {
  const d = db();
  try {
    const v = homeView(d, { thisYear: THIS_YEAR });
    // The denominator in a sentence about who governs must be the assemblies on record. 36 jurisdictions
    // have a Lok Sabha result and only 31 have an assembly; the first draft printed "of 36 on record" and
    // overstated the coverage of the very table underneath it by five.
    assert.equal(v.snapshot.assembliesOnRecord, v.standings.length);
    assert.ok(
      v.snapshot.assembliesOnRecord <= v.snapshot.jurisdictionsWithResults,
      "more assemblies on record than jurisdictions with results",
    );
    if (v.snapshot.assembliesOnRecord !== v.snapshot.jurisdictionsWithResults) {
      assert.doesNotMatch(
        v.headline,
        new RegExp(`of the ${v.snapshot.jurisdictionsWithResults} assemblies`),
        "the headline uses the wrong denominator",
      );
    }
    // AND THE SENTENCE MUST STILL SAY THE DUE DATES ARE ARITHMETIC, without the words "derived, not
    // announced" — which the final design pass removed as a methodology clause inside the largest type on the
    // page. "on a five-year count" carries it: a five-year count from a past election is not a schedule.
    // Where a reader ACTS on one of these dates, in the Upcoming module, the year is prefixed with `Expected`
    // and the panel states the basis in one sentence. That is asserted in render.test.ts.
    if (v.snapshot.dueSoon > 0) {
      assert.match(v.headline, /on a five-year count/, "the headline stops saying the due dates are counted");
      assert.doesNotMatch(v.headline, /derived/, "a provenance class label is back in the hero");
    }
  } finally {
    d.close();
  }
});

test("close fights are the closest results held, with a runner-up where one was published", live, () => {
  const d = db();
  try {
    const rows = closeFights(d, "assembly", 10);
    assert.ok(rows.length > 0, "no close fights");
    for (let i = 1; i < rows.length; i += 1) {
      assert.ok((rows[i]?.marginPct ?? 0) >= (rows[i - 1]?.marginPct ?? 0), "not sorted by margin");
    }
    for (const r of rows) {
      assert.ok(r.marginPct >= 0, `${r.placeName} has a negative margin`);
      assert.match(r.jurisdictionId, /^[a-z]{2}$/, `${r.placeName}'s jurisdiction came out as '${r.jurisdictionId}'`);
      // The winner and runner-up must be different parties, or the row is a join gone wrong.
      if (r.runnerUp !== null) {
        assert.ok(
          (r.winnerPct ?? 0) >= (r.runnerUpPct ?? 0),
          `${r.placeName}: the runner-up outpolled the winner`,
        );
      }
      // The margin must be reachable from the election that produced it.
      assert.ok(r.electionId.length > 0 && r.year > 1900, `${r.placeName} carries no election`);
    }
  } finally {
    d.close();
  }
});

test("the bulk seat reads agree with the per-election ones they replaced", live, () => {
  const d = db();
  try {
    // The optimisation that turned 62 scans into one must not have changed a single number.
    const latest = latestPerJurisdiction(d, "assembly").slice(0, 6);
    const won = seatsWonBy(d, latest.map((l) => l.id));
    for (const l of latest) {
      const mine = won.filter((w) => w.electionId === l.id);
      const total = mine.reduce((n, w) => n + w.seats, 0);
      const direct = get<{ n: number }>(
        d,
        `SELECT COUNT(*) AS n FROM result r JOIN contest c ON c.id = r.contest_id
          WHERE r.revision = 0 AND r.is_winner = 1 AND c.election_id = ?`,
        l.id,
      );
      assert.equal(total, direct?.n, `${l.id}: the bulk read counts ${total} winners, the registry has ${direct?.n}`);
      // And every seat must be attributed to a real jurisdiction, never to the nation.
      for (const w of mine) {
        assert.match(w.jurisdictionId, /^[a-z]{2}$/, `${l.id}: a seat is filed under '${w.jurisdictionId}'`);
      }
    }
  } finally {
    d.close();
  }
});

// Tests for the Situation Room's computations.
//
// Two of these exist because the first working version of situation.ts got both wrong, and both
// wrongs rendered as a confident number rather than an error:
//
//   1. margin percentage divided by `sum(result.votes)`. For 2011-2021 the registry holds only the
//      top contestants, so that sum is 1-4% short of votes cast and every margin came out inflated.
//      For 2026 every `result.votes` is 0, so the sum was 0, every marginPct was null, and the
//      entire latest election silently disappeared from the page's two rankings.
//   2. "seats contested" read from `count(*)`. 2026 stores winners only, so that count equals wins
//      and the table printed "192 of 192" — a party that won every seat it fielded.
//
// Both are shape-of-the-data bugs, not logic bugs, which is why they are pinned against the live
// registry rather than a fixture: a fixture would have had the shape I assumed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { openRead, DEV_DB_PATH } from "../db/open.ts";
import { all } from "../db/index.ts";
import { getSituation, partyMomentum, slug, MARGINAL_PP } from "./situation.ts";

const HAVE_DB = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const opts = { skip: HAVE_DB ? false : "no .data/registry.db — run npm run registry:ingest" };

test("slug matches the path segments /pl resolves against", () => {
  assert.equal(slug("Cooch Behar"), "cooch-behar");
  assert.equal(slug("North 24 Parganas"), "north-24-parganas");
  assert.equal(slug("Rajarhat New Town"), "rajarhat-new-town");
  assert.equal(slug("Raiganj"), "raiganj");
  // No leading or trailing separator can survive, or the URL gains an empty segment.
  assert.equal(slug(" Nadia. "), "nadia");
});

test("the Situation Room is computable from the live registry", opts, () => {
  const s = getSituation(openRead());
  assert.ok(s !== null, "registry has results but getSituation returned null");

  // ── trap 1: the latest election must not vanish ──────────────────────────────────────────────
  assert.ok(s.latestYear >= 2026, `latest year ${s.latestYear} is older than the seeded election`);
  assert.ok(
    s.seatsDecided > 250,
    `only ${s.seatsDecided} seats have a margin — the latest election is missing from the rankings, ` +
      "which is what happens when the margin denominator comes from result.votes",
  );
  assert.ok(s.marginal.length > 0, "no marginal seats ranked");
  assert.ok(s.volatile.length > 0, "no volatile seats ranked");

  // ── a margin share is a share: bounded, positive, and never fabricated ───────────────────────
  for (const r of [...s.marginal, ...s.volatile]) {
    assert.ok(r.marginPct !== null, `${r.name} ranked with a null margin`);
    const pct = r.marginPct ?? 0;
    assert.ok(pct >= 0 && pct <= 100, `${r.name} margin ${pct}pp is outside 0-100`);
    assert.ok(r.flips <= r.contests, `${r.name} has ${r.flips} flips across ${r.contests} contests`);
    assert.ok(r.href.startsWith("/pl/wb/"), `${r.name} href ${r.href} is not a place path`);
  }

  // Ascending by margin, and the tightest seat is genuinely tight.
  const margins = s.marginal.map((r) => r.marginPct ?? 0);
  assert.deepEqual(margins, [...margins].sort((a, b) => a - b), "marginal list is not sorted");
  assert.ok((margins[0] ?? 99) < 1, `tightest seat is ${margins[0]}pp — expected under 1pp`);

  // The headline's number must be the headline's number.
  const under = margins.filter((m) => m < MARGINAL_PP).length;
  assert.ok(under > 0, "every ranked seat is above the marginal threshold");
  assert.match(s.headline, new RegExp(`under ${MARGINAL_PP} percentage points`));

  // ── every flag is a lead with a rule attached, never a bare accusation ──────────────────────
  for (const f of s.flags) {
    assert.ok(f.rule.length > 0, "a flag arrived without its rule");
    assert.ok(f.detail.length > 0, `flag ${f.subject} has no detail`);
    assert.doesNotMatch(f.detail + f.rule, /criminal/i, "flags must never use the word criminal");
  }

  // ── the corpus panel is the registry, not a constant ────────────────────────────────────────
  assert.ok(s.corpus.persons > 0 && s.corpus.claims > 0);
  assert.ok(
    s.corpus.fetched <= s.corpus.sources,
    "more sources fetched than exist, which would mean the honesty columns are wrong",
  );
});

test("momentum never prints a 0 where the source reported nothing", opts, () => {
  const db = openRead();
  const s = getSituation(db);
  assert.ok(s !== null);
  const m = s.momentum;
  assert.ok(m.length > 0, "no parties in the momentum table");

  // trap 2: contested is unmeasured for a winners-only election, and must not equal won.
  for (const p of m) {
    if (p.seatsContested === null) continue;
    assert.ok(
      p.seatsContested >= p.seatsWon,
      `${p.short} won ${p.seatsWon} of ${p.seatsContested} contested`,
    );
  }
  if (!s.voteCountsPresent) {
    assert.ok(
      m.every((p) => p.sharePct === null),
      "the latest election has no candidate vote counts, so no party can have a vote share",
    );
    assert.ok(
      m.every((p) => p.seatsContested === null),
      "the latest election stores winners only, so seats contested cannot be known",
    );
  }

  // Ranked by seats, because share is the field that can be absent.
  const won = m.map((p) => p.seatsWon);
  assert.deepEqual(won, [...won].sort((a, b) => b - a), "momentum is not ranked by seats won");

  // The winner of the latest election holds a plurality of the seats that were decided.
  const top = m[0];
  assert.ok(top !== undefined && top.seatsWon > s.seatsDecided / 3, "no party holds a plurality");

  // A party absent from the previous election gets null, not a delta from zero.
  for (const p of m) {
    if (p.prevSeatsWon === null) assert.equal(p.deltaSeats, null, `${p.short} invented a delta`);
    else assert.equal(p.deltaSeats, p.seatsWon - p.prevSeatsWon);
  }
});

test("a year with real vote counts does produce shares", opts, () => {
  // The 2021 election has candidate votes, so this is the both-directions check on the null: the
  // nulls above must come from the data, not from partyMomentum being unable to divide.
  const m = partyMomentum(openRead(), 2021);
  assert.ok(m.length > 0, "no parties in 2021");
  assert.ok(
    m.some((p) => p.sharePct !== null),
    "2021 has vote counts but every share came back null — the divisor is broken, not the data",
  );
  const total = m.reduce((n, p) => n + (p.sharePct ?? 0), 0);
  assert.ok(total > 90 && total <= 100.01, `2021 shares sum to ${total.toFixed(2)}%, expected ~100`);
  assert.ok(
    m.every((p) => p.seatsContested !== null && p.seatsContested >= p.seatsWon),
    "2021 has losing rows, so seats contested is knowable and must be at least seats won",
  );
});

// ── the bug that loading a second election kind created ──────────────────────────────────────────
// "The previous election" was the previous YEAR with data. Adding Lok Sabha 2024 made that the 2024
// parliamentary result rather than the 2021 assembly, so the Situation Room reported BJP's previous
// seats as 12 — its Lok Sabha total in this state — instead of 76, and printed "BJP +180". Every
// party-footprint flag disappeared at the same time, for the same reason. An assembly result is only
// comparable to another assembly result.
test("the previous election is the previous election OF THE SAME KIND", opts, () => {
  const db = openRead();
  const kinds = all<{ kind: string; n: number }>(
    db,
    "SELECT kind, count(*) AS n FROM election GROUP BY kind",
  );
  assert.ok(
    kinds.length >= 2,
    `only ${kinds.length} election kind(s) loaded — this test cannot detect the cross-kind bug it exists for`,
  );

  const s = getSituation(db);
  assert.ok(s !== null);
  const top = s.momentum.find((p) => p.prevSeatsWon !== null);
  assert.ok(top !== undefined, "no party has a previous-election figure to check");

  // The comparison baseline must be an election of the latest election's own kind. The assembly has
  // 294 seats and this state returns 42 MPs, so a parliamentary baseline is detectable by size: no
  // party can hold more than 42 seats in a Lok Sabha comparison for West Bengal.
  const assemblyTotal = s.seatsDecided;
  const prevMax = Math.max(...s.momentum.map((p) => p.prevSeatsWon ?? 0));
  assert.ok(
    prevMax > 42,
    `the largest previous-election seat count is ${prevMax}, which is within Lok Sabha range — the ` +
      "baseline is almost certainly the wrong election kind",
  );
  assert.ok(prevMax <= assemblyTotal + 1, `previous seats ${prevMax} exceeds the seats available`);

  // Both sides of the delta must reconcile, whatever the baseline turns out to be.
  for (const p of s.momentum) {
    if (p.prevSeatsWon === null) continue;
    assert.equal(p.deltaSeats, p.seatsWon - p.prevSeatsWon, `${p.short} delta does not reconcile`);
  }

  // And asking for a kind that exists must not silently fall back to another one.
  const general = partyMomentum(db, 2024, "general");
  assert.ok(general.length > 0, "no parties in the 2024 general election");
  assert.ok(
    general.every((p) => p.seatsWon <= 42),
    "a general-election momentum row reports more seats than this state sends to the Lok Sabha",
  );
  assert.equal(
    general.reduce((n, p) => n + p.seatsWon, 0),
    42,
    "the general election's seats won must sum to this state's 42 parliamentary seats",
  );
});

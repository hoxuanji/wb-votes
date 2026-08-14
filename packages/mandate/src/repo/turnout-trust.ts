// Whether a turnout figure has earned the right to be printed as a fact.
//
// ── THE DEFECT THIS EXISTS TO CONTAIN ──
//
// West Bengal 2026 is in the registry with a turnout of 93.0%. It is wrong. West Bengal polled 82.1% in
// 2021 — a figure that matches the ECI's own — and 84.5% at its historical peak in 2011. The 2026 import
// puts the per-seat floor at 82.7%, which is higher than any WEST BENGAL SEAT-LEVEL FLOOR ever recorded
// across sixteen elections since 1962 (previous maximum: 54.4%), and puts 66 seats above 95% where the
// state's whole history contains one. It is a seed defect, and it predates this module.
//
// The value is sourced, so it is not ours to delete or to overwrite with an estimate. But a page that
// prints "93.0% turnout" beside a real majority count is making an assertion, and we do not believe it.
// So the figure keeps its value and loses its AUTHORITY.
//
// ── THE RULE, AND WHY IT IS NOT A THRESHOLD ──
//
// The obvious move is a statistical outlier test, and it is a trap. Measured across all 372 elections in
// this registry that publish turnout: a rule flagging any election whose seat-level floor jumps more than
// 10pp above its own series' historical maximum flags NINETEEN, and most of them are real — Madhya Pradesh
// 2003, Gujarat 2012, Assam 2016. Turnout genuinely rose over decades. Tightening the threshold until only
// West Bengal 2026 survives is fitting a rule to one answer, and the next bad import lands just under it.
//
// So the rule is CORROBORATION, not plausibility, and it needs no magic number:
//
//   A turnout figure is VERIFIED when the same election published vote counts that reconcile against it.
//   It is UNVERIFIED when there is nothing to reconcile it against.
//
// `voters` and the sum of candidate votes are two independent measurements of the same event, so one
// checks the other. Measured: of the 372 elections with turnout, 371 reconcile — the sum of votes lands
// between 96.4% and 100.0% of voters, every one of them inside 90–105%. Exactly ONE publishes turnout with
// zero countable votes: wb-assembly-2026, whose 293 result rows carry no votes at all.
//
// That rule is definitional rather than fitted. It cannot defame an election that published its counts, it
// needs no tuning, and any future import that arrives with turnout but no results is caught by the same
// sentence rather than by a threshold somebody has to remember to move.

import type { DatabaseSync } from "node:sqlite";
import { all } from "../db/index.ts";

/**
 * A turnout figure and its standing.
 *
 * ── WHY THE UNVERIFIED VALUE LIVES UNDER `evidence` ──
 *
 * The number is still here — the brief is explicit that a sourced value must not be deleted, and the
 * evidence drawer has to be able to show it. But it is not reachable as `.pct`, so no renderer can print
 * it beside a majority count by writing the same expression it writes for every other election. Reaching
 * the figure at all means typing the word `evidence`, which is where it belongs. This is the same move the
 * epoch gate makes for cross-delimitation comparisons: make the wrong output hard to WRITE, not merely
 * absent from today's markup.
 */
export type Turnout =
  | { state: "reported"; pct: number }
  | {
      state: "unverified";
      /** Why, in one user-facing sentence. Never a schema term. */
      reason: string;
      /** The registry's figure, preserved for the evidence drawer and withheld from everywhere else. */
      evidence: { pct: number; voters: number; electors: number };
    }
  | { state: "absent" };

/**
 * The elections in `ids` whose turnout has nothing to corroborate it.
 *
 * One query for the whole set, so a list of sixty elections on the front page costs the same as one. An id
 * that publishes no turnout at all is not returned: there is no figure to distrust.
 */
export function unverifiedTurnout(db: DatabaseSync, ids: readonly string[]): Set<string> {
  if (ids.length === 0) return new Set();
  const marks = ids.map(() => "?").join(",");
  const rows = all<{ id: string }>(
    db,
    `SELECT e.id AS id
       FROM election e
      WHERE e.id IN (${marks})
        AND EXISTS (SELECT 1 FROM contest c JOIN turnout t ON t.contest_id = c.id AND t.scope = 'contest'
                     WHERE c.election_id = e.id AND t.voters > 0 AND t.electors > 0)
        AND NOT EXISTS (SELECT 1 FROM contest c JOIN result r ON r.contest_id = c.id AND r.revision = 0
                         WHERE c.election_id = e.id AND r.votes > 0)`,
    ...ids,
  );
  return new Set(rows.map((r) => r.id));
}

/** The one sentence a surface says instead of a number, and the reason behind it. */
export const UNVERIFIED_REASON =
  "No candidate vote counts were published for this election, so the turnout figure cannot be " +
  "reconciled against votes cast.";

/**
 * A reading from its parts. `unverified` comes from `unverifiedTurnout`, so the decision is made once per
 * election rather than re-derived at each of the five places turnout is rendered.
 */
export function turnoutReading(
  voters: number | null,
  electors: number | null,
  unverified: boolean,
): Turnout {
  if (electors === null || electors <= 0 || voters === null || voters <= 0) return { state: "absent" };
  const pct = (100 * voters) / electors;
  return unverified
    ? { state: "unverified", reason: UNVERIFIED_REASON, evidence: { pct, voters, electors } }
    : { state: "reported", pct };
}

/**
 * What a hero, a tile or a dense list may print — and it is never a figure the registry cannot corroborate.
 *
 * Returns null for `absent` so a caller renders nothing at all rather than the words "not reported", which
 * on a page about an election that DID report is its own small lie.
 */
export function turnoutHeadline(t: Turnout): string | null {
  switch (t.state) {
    case "reported":
      return `${t.pct.toFixed(1)}% turnout`;
    case "unverified":
      // Deliberately not a number, and deliberately not "unavailable": the figure exists and is shown in
      // the evidence drawer. What is missing is our confidence in it.
      return "turnout — verification pending";
    case "absent":
      return null;
  }
}

/**
 * The full account, for the evidence drawer and nowhere else.
 *
 * FOUR THINGS, because the brief asks for exactly four and each one is a thing a reader is owed: the value
 * the registry holds, why it is doubted, that no replacement is being asserted, and — by living inside the
 * drawer beside the citation list — which source it came from.
 *
 * Returns null unless the reading is unverified. A caveat printed when there is nothing wrong is the
 * provenance clutter this product spent a phase removing.
 */
export function turnoutCaveat(t: Turnout): string[] | null {
  if (t.state !== "unverified") return null;
  return [
    `The registry holds a turnout of ${t.evidence.pct.toFixed(1)}% for this election, from the source ` +
      "listed below. It is shown here and not in the summary above because we do not currently trust it.",
    t.reason,
    "No corrected or estimated figure is being asserted in its place, and the earlier election's turnout " +
      "is not a substitute for this one's.",
  ];
}

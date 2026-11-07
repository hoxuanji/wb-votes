// How much of India a front-page panel is looking at, said in words.
//
// THE DEFECT THIS EXISTS FOR. The front page is built for a whole country and is shown, today, a registry that holds one state. Its panels are
// honest about every figure and silent about the denominator: "India · Lok Sabha 2024 — TMC 29 · BJP 12 of 42" reads as a national result to a
// reader who does not know there are 543 seats, and "Party landscape" ranks BJP first on the seats of one assembly. A screenshot, or a jump
// to #parties from the rail, carries that picture away from the page that qualifies it.
//
// So a panel that sums or ranks says what it counted over. Both sentences ADAPT: on a registry that holds every seat, neither is produced,
// because a page with nothing to qualify should not say so. They are pure, over the numbers the page already holds (`Snapshot`'s reference
// totals against what the registry holds), and tested on literals.

import type { Body } from "../core/election-kind.ts";
import type { Snapshot } from "./home.ts";

const IN_NUM = new Intl.NumberFormat("en-IN");

type Held = Pick<Snapshot, "assemblySeatsHeld" | "assemblySeatsTotal" | "lokSabhaSeatsHeld" | "lokSabhaSeatsTotal">;

/**
 * What the party landscape counted over: the seats the registry holds against the seats the houses have, for each house that is not whole.
 * `null` when both are whole. A house with no reference total is not described: there is no denominator to say.
 */
export function landscapeScope(s: Held): string | null {
  const parts: string[] = [];
  if (s.assemblySeatsTotal > 0 && s.assemblySeatsHeld < s.assemblySeatsTotal) {
    parts.push(`${IN_NUM.format(s.assemblySeatsHeld)} of ${IN_NUM.format(s.assemblySeatsTotal)} assembly seats`);
  }
  if (s.lokSabhaSeatsTotal > 0 && s.lokSabhaSeatsHeld < s.lokSabhaSeatsTotal) {
    parts.push(`${IN_NUM.format(s.lokSabhaSeatsHeld)} of ${IN_NUM.format(s.lokSabhaSeatsTotal)} Lok Sabha seats`);
  }
  return parts.length === 0 ? null : `Counted over the ${parts.join(" and ")} the registry holds.`;
}

/**
 * The scope of a Lok Sabha election's row in "Recent results": "42 of 543 seats", where the registry holds fewer contests than the house has.
 *
 * `null` for everything else. An assembly row's "of 294" is its own house and needs no more. A by-election fills a few vacancies and not the
 * house, so "1 of 543" would say something false about it, and the test is on the election's FILL as well as its body.
 */
export function houseScope(e: { body: Body; fill: string; loaded: number; houseTotal: number }): string | null {
  if (e.body !== "lok-sabha" || e.fill === "bypoll") return null;
  if (e.houseTotal <= 0 || e.loaded >= e.houseTotal) return null;
  return `${IN_NUM.format(e.loaded)} of ${IN_NUM.format(e.houseTotal)} seats`;
}

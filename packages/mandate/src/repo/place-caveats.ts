// The limits of the Analysis page's figures, said once and in a reader's words: grouped under the name of the measure they
// qualify, only for the measures the page draws, and with the limits this seat's own window adds (a withheld election, a
// boundary break). The measures' own `caveats` stay as the exact wording an API consumer is given; these come from their
// `reader` text. Pure, so place-caveats.test.ts runs it under node:test.

import { enp, margin_pct, swing_pp, turnout_pct, vote_share_pct } from "../semantic/index.ts";
import type { PlaceAnalysis } from "./place-analysis.ts";

export type Caveat = { label: string; text: string };

function yearsOf(years: readonly number[]): string {
  return [...years].sort((a, b) => a - b).join(" and ");
}

export function analysisCaveats(a: PlaceAnalysis): Caveat[] {
  const held = yearsOf(a.turnoutSeries.filter((p) => p.unverified).map((p) => p.year));
  return [
    {
      label: turnout_pct.label,
      text: [
        ...(held === ""
          ? []
          : [`Turnout for ${held} is withheld: that election published no candidate vote counts to check it against.`]),
        ...turnout_pct.reader,
      ].join(" "),
    },
    { label: vote_share_pct.label, text: vote_share_pct.reader.join(" ") },
    {
      label: margin_pct.label,
      text: [
        ...(held === ""
          ? []
          : [`The margin share for ${held} is withheld for the same reason; the margin in votes is as the source declared it.`]),
        ...margin_pct.reader,
      ].join(" "),
    },
    // Only where a swing card is drawn: a window of one election has no swing to qualify.
    ...(a.swingSeries.length === 0 ? [] : [{ label: swing_pp.label, text: swing_pp.reader.join(" ") }]),
    { label: enp.label, text: enp.reader.join(" ") },
    ...(a.epochIds.length > 1
      ? [
          {
            label: "Boundaries",
            text:
              `This window spans ${a.epochIds.length} sets of constituency boundaries, so swing is blank across the ` +
              "break: the two electorates are not the same voters.",
          },
        ]
      : []),
    {
      label: "Sources",
      text: "Every figure here is as its source published it. None is marked as independently checked.",
    },
  ];
}

// The time machine's frames: what the map and the tally look like at each stop of the scrubber, decided on the server so the client carries
// no palette and no rules, only a list of frames to move between.
//
// A frame is a pure function of one LandscapeYear (repo/landscape.ts). The rules it holds are the ones the page must not break, and they are
// tested here and not left to a browser:
//   · a state with no election on record by that year is the no-election ink (`NOT_HELD`) and its tooltip says so. It is never given a party's colour.
//   · a state whose parties are level for most seats has no leader, and is drawn in a hatch that stands for "level"; the page does not pick a winner.
//   · a tooltip prints only what the row holds: the leader's seats of the seats contested, and the year of the election it came from, which is
//     older than the stop when the state has not voted since.

import type { Landscape, LandscapeYear } from "./situation-types.ts";
import { fillFor, NOT_HELD } from "../viz/party-ink.ts";

/** The pattern id the map's `<defs>` defines for a state with no single leader. */
export const LEVEL_FILL = "url(#iei-tm-level)";

export type Frame = {
  year: number;
  /** A CSS fill per jurisdiction id. */
  fills: Record<string, string>;
  /** A tooltip per jurisdiction id. */
  titles: Record<string, string>;
  /** Parties by states led, most first, each with the colour it wears on the map. */
  tally: { key: string; label: string; fill: string; states: number }[];
  /** States with an election on record by this stop, and the states there are. */
  withResult: number;
  total: number;
};

const IN = new Intl.NumberFormat("en-IN");

function title(name: string, year: number, s: LandscapeYear["states"][number]): string {
  if (s.held === null) return `${name.toUpperCase()}\nno assembly election on record by ${year}`;
  const h = s.held;
  if (h.leader === null) return `${name.toUpperCase()}\nno single leader: the parties are level for most of ${IN.format(h.seats)} seats\nelected ${h.year}`;
  return `${name.toUpperCase()}\n${h.leader.label} ${IN.format(h.leaderSeats)} of ${IN.format(h.seats)} seats${h.majority ? " · majority" : ""}\nelected ${h.year}`;
}

export function framesOf(landscape: Landscape): Frame[] {
  return landscape.byYear.map((y) => {
    const fills: Record<string, string> = {};
    const titles: Record<string, string> = {};
    for (const s of y.states) {
      fills[s.id] = s.held === null ? NOT_HELD : s.held.leader === null ? LEVEL_FILL : fillFor(s.held.leader.key);
      titles[s.id] = title(s.name, y.year, s);
    }
    return {
      year: y.year,
      fills,
      titles,
      tally: y.tally.map((t) => ({ key: t.party.key, label: t.party.label, fill: fillFor(t.party.key), states: t.states })),
      withResult: y.withResult,
      total: y.states.length,
    };
  });
}

/**
 * The one sentence a stop says, computed from its own frame: how many states have a result by then, and which party leads the most of them.
 * Used as the scrubber's live-region text, so a screen-reader user hears what a sighted one sees change.
 */
export function frameSentence(f: Frame): string {
  const lead = f.tally[0];
  if (f.withResult === 0 || lead === undefined) return `${f.year}: no state in the registry has an assembly election on record by this year.`;
  const level = f.tally.filter((t) => t.states === lead.states).length > 1;
  const states = (n: number): string => `${IN.format(n)} ${n === 1 ? "state" : "states"}`;
  return level
    ? `${f.year}: ${states(f.withResult)} of ${f.total} with a result; no party leads more than the others, each of the leading parties has ${states(lead.states)}.`
    : `${f.year}: ${states(f.withResult)} of ${f.total} with a result; ${lead.label} leads ${states(lead.states)}.`;
}

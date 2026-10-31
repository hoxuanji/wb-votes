// The front page's glance: the latest election of every state that has one, side by side, and the card for one state the reader has chosen.
//
// A page that opens on one state's result is a page that has picked that state. The glance is the opposite: every jurisdiction the registry has a result
// for, each by its latest assembly election and its slice of the latest Lok Sabha, in ONE order that is not a judgement of any of them: the most recent
// election first, then by name. Never by size, never by who governs, never by whom the page would like to show.

import type { JurisdictionState } from "./coverage.ts";
import type { Standing } from "./elections.ts";

export type HouseGlance = {
  electionId: string;
  year: number;
  /** The party with most seats, or null where the election declared no winner anywhere. */
  leader: { key: string; label: string } | null;
  seats: number;
  /** The seats the election contested in this jurisdiction. */
  of: number;
  /** The leader holds more than half of them. */
  majority: boolean;
};

export type GlanceRow = { id: string; name: string; assembly: HouseGlance | null; loksabha: HouseGlance | null };

export type StateChoice =
  | { status: "loaded"; row: GlanceRow }
  | { status: "unloaded"; id: string; name: string; seats: number | null; ut: boolean };

const house = (s: Standing | undefined): HouseGlance | null =>
  s === undefined
    ? null
    : {
        electionId: s.electionId,
        year: s.year,
        leader: s.leaderKey === null || s.leaderLabel === null ? null : { key: s.leaderKey, label: s.leaderLabel },
        seats: s.leaderSeats,
        of: s.seatsContested,
        majority: s.majority,
      };

const newest = (r: GlanceRow): number => Math.max(r.assembly?.year ?? 0, r.loksabha?.year ?? 0);

/** One row per jurisdiction with a result, the most recent election first and then by name. */
export function glanceOf(i: { standings: readonly Standing[]; houseStandings: readonly Standing[] }): GlanceRow[] {
  const ids = new Map<string, string>();
  for (const s of [...i.standings, ...i.houseStandings]) ids.set(s.jurisdictionId, s.jurisdictionName);
  return [...ids.entries()]
    .map(([id, name]): GlanceRow => ({
      id,
      name,
      assembly: house(i.standings.find((s) => s.jurisdictionId === id)),
      loksabha: house(i.houseStandings.find((s) => s.jurisdictionId === id)),
    }))
    .sort((a, b) => newest(b) - newest(a) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * The jurisdiction a reader chose, by MEMBERSHIP: an id that is not one of the registry's jurisdictions is nothing, and is never looked up anywhere
 * else. A jurisdiction with no result is said to be one, with the seats the reference data gives it, and is not drawn as though it had a result.
 */
export function stateChoice(
  i: { standings: readonly Standing[]; houseStandings: readonly Standing[]; states: readonly JurisdictionState[] },
  id: string | null | undefined,
): StateChoice | null {
  if (id === null || id === undefined) return null;
  const row = glanceOf(i).find((r) => r.id === id);
  if (row !== undefined) return { status: "loaded", row };
  const j = i.states.find((s) => s.id === id);
  return j === undefined ? null : { status: "unloaded", id: j.id, name: j.name, seats: j.seats, ut: j.kind === "ut" };
}

/**
 * The page's first sentence, about the country and not about any state in it. It names every jurisdiction with a result when there are few enough to name
 * (and so names each one, in the glance's order), and counts them, with the years they span, when there are not.
 */
export function indiaSentence(rows: readonly GlanceRow[], total: number): string {
  if (rows.length === 0) return `The registry holds no election result yet for any of India's ${total} states and territories.`;
  const of = `${rows.length} of India's ${total} states and territories`;
  if (rows.length <= 5) {
    const names = rows.map((r) => r.name);
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
    return `The registry holds election results for ${of}: ${list}.`;
  }
  const years = rows.flatMap((r) => [r.assembly?.year, r.loksabha?.year]).filter((y): y is number => y !== undefined);
  return `The registry holds election results for ${of}, from ${Math.min(...years)} to ${Math.max(...years)}.`;
}

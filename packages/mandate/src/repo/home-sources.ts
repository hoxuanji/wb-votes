// The sources behind the front page's figures: one list for each module that shows registry results.
//
// WHY THESE THREE AND NOT SIX. The page has six panels, and `render.test.ts` holds it to three evidence drawers ("one per
// module is the rule"): twenty-eight provenance words ran down the page before the final design pass, and the drawer is how the
// evidence stays one click away without being said again beside every figure. The three modules that put a result in front
// of a reader are the map (with the state card and the table beside it), the recent elections, and the party landscape. Each gets the sources
// of the result rows it reads; the map's drawer keeps the boundary file it always had, which the page adds to this list.
//
// What the others are covered by, so that nobody reads the gap as an oversight:
//  · NEXT UP counts a five-year term from each jurisdiction's last election, and says on the surface that the date is inferred. The
//    elections it counts from are the ones the map reads, so their sources are in the map's drawer.
//  · THE HERO'S COUNTS are `glanceOf` over the same standings the map reads.
//  · CLOSEST CONTESTS is a list of seat pages, and a seat page carries its own evidence.
//
// The sets are not guesses at what a panel "probably" reads. Each is the election ids the panel's own code reads: the standings and
// house standings the map's cells and the party panel are built from, the elections `Recent results` lists, and the Lok Sabha run the
// party sparklines span (`houseRun`, shared with the party landscape so the two cannot drift apart).

import type { DatabaseSync } from "node:sqlite";
import { houseRun } from "./home.ts";
import type { HomeView } from "./home.ts";
import { read } from "./index.ts";
import type { SourceRef } from "./index.ts";
import { sourcesFor } from "./seat-results.ts";

export type HomeSources = {
  /** What the map, the state card and the table beside it read, whichever layer is chosen: results and turnout. */
  map: SourceRef[];
  /** The elections `Recent results` lists, with the turnout it prints. */
  recent: SourceRef[];
  /** Every election the party landscape sums seats over or draws a sparkline from. */
  parties: SourceRef[];
};

const once = (ids: readonly string[]): string[] => [...new Set(ids)];

export function homeSources(db: DatabaseSync, view: Pick<HomeView, "standings" | "houseStandings" | "held">): HomeSources {
  const current = [...view.standings, ...view.houseStandings].map((s) => s.electionId);
  const run = read(() => houseRun(db)).map((e) => e.id);
  return {
    map: sourcesFor(db, { elections: once(current) }, { turnout: true }),
    recent: sourcesFor(db, { elections: once(view.held.map((h) => h.id)) }, { turnout: true }),
    parties: sourcesFor(db, { elections: once([...current, ...run]) }),
  };
}

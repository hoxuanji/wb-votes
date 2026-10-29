// The state page's one read: which election a state opens on, and everything that election needs.
//
// ── WHAT THIS REPLACES ──
//
// The page used to decide this in its own route file, in SQL: which elections a state had, which house it
// opened on, whether an election named in the URL was real, and which to show when it was not. That left the
// rule where a test could only reach it by rendering HTML, with the registry's `house` and `kind` codes decoded
// by hand, and it left two further listings of "this state's elections" (the map's `siblings`, and the
// fallback's own query) that disagreed about candidates, tie-breaks and what to do when there were none.
//
// ── THE THREE DECISIONS A STATE PAGE MAKES, AND WHERE EACH IS MADE ──
//
//   OWN HOUSE     A state opens on its assembly. A jurisdiction with no full-house assembly election (Andaman,
//                 Chandigarh, Dadra & Nagar Haveli and Daman & Diu, Ladakh, Lakshadweep) opens on its Lok Sabha
//                 seats instead, which are the only house it has. `?house=` can ask for the other one; it is
//                 never inferred.
//   DEFAULT       The current election of that house (`currentElection`), or, where the jurisdiction took no part
//                 in it, the newest it did. Never a by-election, which fills a few vacant seats and says nothing
//                 about who governs.
//   ASKED         `?election=` is honoured when it names an election of the house that the jurisdiction contested,
//                 a by-election included. Anything else opens the default and says so (`asked: "defaulted"`),
//                 because substituting one election for another and saying nothing is worse than a 404: the page
//                 looks right and is about something else.
//
// A GENERAL ELECTION BELONGS TO THE NATION, so "which elections does this state have" cannot be read off the
// election's own jurisdiction: `ls-2024` is the union's, and a state's Lok Sabha view of it is that election
// narrowed to the seats inside the state (42 of West Bengal's, not 543). The question is therefore "which
// elections contested a seat inside this jurisdiction", asked once, and it serves both houses.
//
// Eager on purpose: the map and the trajectory are always read, because a page that gets `ready` renders both.
// Read-only, no clock, portable SQL (ADR 0001); imports nothing from `src/` (ADR 0002) and no React.

import type { DatabaseSync } from "node:sqlite";
import { all, get } from "../db/index.ts";
import { read } from "./index.ts";
import { CHRONO_DESC } from "../core/election-kind.ts";
import type { Body, Fill } from "../core/election-kind.ts";
import { currentElection } from "./elections.ts";
import { choiceOf, electionMapView } from "./election-map.ts";
import type { ChoiceRow, ElectionChoice, ElectionMapView } from "./election-map.ts";
import { bodyOfKind, kindOfBody } from "./routes.ts";
import { stateTrajectory } from "./trajectory.ts";
import type { StateTrajectory } from "./trajectory.ts";

/** The place a state view is about. The breadcrumb trail is still `placeView`'s. */
export type Jurisdiction = { id: string; name: string };

/**
 * What became of the election the URL asked for.
 *
 *   none        the URL asked for none
 *   honoured    it names an election of this house that the jurisdiction contested, and that is what opened
 *   defaulted   it named something else, and the default opened instead; the page says so
 */
export type Asked = "none" | "honoured" | "defaulted";

export type StateView =
  | { kind: "not-found" }
  /** The jurisdiction exists and has no election to open on, for the house asked (or for either, if none was). */
  | { kind: "no-elections"; jurisdiction: Jurisdiction }
  | {
      kind: "ready";
      jurisdiction: Jurisdiction;
      /** The house being shown. */
      house: Body;
      /**
       * The houses this jurisdiction can be switched between, assembly first: those it has a full-house election
       * of, and the one being shown. One entry for a jurisdiction with no assembly.
       */
      houses: Body[];
      /**
       * The offers the page switches between, newest first, each with its seat count INSIDE the jurisdiction:
       * West Bengal's row for `ls-2024` says 42. The full-house elections of `house`, or, on a by-election, that
       * house's by-elections: the strip a reader is on, never the two mixed, because a state's tab row of
       * single-seat by-polls buries the four elections a reader came for.
       */
      choices: ElectionChoice[];
      asked: Asked;
      /** The chosen election's seats, scoped to the jurisdiction. */
      map: ElectionMapView;
      trajectory: StateTrajectory;
    };

/** The houses in the order they are offered: a state's own is its assembly. */
const HOUSES: readonly Body[] = ["assembly", "lok-sabha"];

/** The `?house=` URL value as a body, or null when the URL names none. The URL says `ac` and `pc`. */
function houseOf(param: string | undefined): Body | null {
  return param === "ac" || param === "pc" ? bodyOfKind(param) : null;
}

/**
 * The election a jurisdiction opens on for `house`: the current election of that house, or, where the
 * jurisdiction took no part in it, the newest it did.
 *
 * A state's assembly election belongs to the state, so the current one is asked for within it. The Lok Sabha's
 * is the union's, so it is asked for unscoped and used only if the jurisdiction contested it: one the newest
 * general election did not reach opens on the newest it has seats in, not on an election of zero seats.
 */
function defaultOf(
  db: DatabaseSync,
  jurisdictionId: string,
  house: Body,
  fullHouse: readonly ElectionChoice[],
): ElectionChoice | undefined {
  const current = currentElection(db, house, house === "assembly" ? jurisdictionId : undefined);
  return fullHouse.find((c) => c.id === current?.id) ?? fullHouse[0];
}

/**
 * What a state page opens on, from the jurisdiction's id and the two things the URL can ask for.
 *
 * `jurisdictionId` is a place id as the registry spells it, already resolved: `ka`, not `KA` and not
 * "Karnataka". Resolving a path to a place is the caller's, so that two spellings cannot reach two
 * different answers here.
 */
export function stateView(
  db: DatabaseSync,
  jurisdictionId: string,
  req: { house?: string | undefined; election?: string | undefined } = {},
): StateView {
  return read((): StateView => {
    const name = get<{ name: string }>(
      db,
      `SELECT canonical_name AS name FROM place WHERE id = ? AND kind IN ('state', 'ut')`,
      jurisdictionId,
    )?.name;
    if (name === undefined) return { kind: "not-found" };
    const jurisdiction: Jurisdiction = { id: jurisdictionId, name };

    // EVERY ELECTION THAT CONTESTED A SEAT IN THIS JURISDICTION, both houses and both fills in one read. The seat
    // count is of the seats inside it, which is what makes the Lok Sabha's row a state's share.
    const contested = all<ChoiceRow>(
      db,
      `SELECT e.id AS id, e.name AS name, e.year AS year, e.house AS house, e.kind AS kind, COUNT(*) AS seats
         FROM election e
         JOIN contest c ON c.election_id = e.id
         JOIN place_version pv ON pv.id = c.place_version_id
        WHERE pv.jurisdiction_id = ?
        GROUP BY e.id
        ORDER BY ${CHRONO_DESC}`,
      jurisdictionId,
    ).map(choiceOf);
    const strip = (body: Body, fill: Fill): ElectionChoice[] =>
      contested.filter((c) => c.body === body && c.fill === fill);

    // OWN HOUSE, unless the URL asks for the other. An asked house that offers nothing is not swapped for the
    // one that does: that is the same silent substitution `asked` exists to prevent, so it opens nothing. A
    // jurisdiction with no full-house election at all is asked about as an assembly, which is where a by-election
    // named in the URL is looked for.
    const house = houseOf(req.house) ?? HOUSES.find((h) => strip(h, "general").length > 0) ?? "assembly";
    const fullHouse = strip(house, "general");

    // A by-election is not a default and is still a real destination, so one named in the URL is honoured.
    const wanted = req.election === undefined || req.election === "" ? null : req.election;
    const honoured = wanted === null ? undefined : contested.find((c) => c.id === wanted && c.body === house);
    const chosen = honoured ?? defaultOf(db, jurisdictionId, house, fullHouse);
    if (chosen === undefined) return { kind: "no-elections", jurisdiction };

    const map = electionMapView(db, chosen.id, jurisdictionId);
    if (map.election === null) return { kind: "no-elections", jurisdiction };

    return {
      kind: "ready",
      jurisdiction,
      house,
      houses: HOUSES.filter((h) => h === house || strip(h, "general").length > 0),
      choices: strip(house, chosen.fill),
      asked: wanted === null ? "none" : honoured === undefined ? "defaulted" : "honoured",
      map,
      trajectory: stateTrajectory(db, jurisdictionId, kindOfBody(house)),
    };
  });
}

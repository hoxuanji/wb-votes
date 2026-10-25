// The loader of a PLACE page: resolve a query to the place it names and read what that place's level has, as plain
// data for place-presentation.ts to word and for the route to draw. No React anywhere, so place-view.test.ts runs it
// under node:test.
//
// It lives in the package, not beside the route, for the reason cycle 2 paid for: a module under
// src/app/ that the page reaches through a dynamic import is not statically analysable by webpack,
// which compiled the binding to `undefined` and 500'd every slug in a production build while the
// build itself reported success. Here it is a static import from the page and a checked file under
// registry:typecheck.

import type { DatabaseSync } from "node:sqlite";
import { inr, turnout_pct } from "../semantic/index.ts";
import { all, get } from "../db/index.ts";
// A const string, not a query: importing it here opens no database and keeps one definition of what
// "newest first" means across every module that orders elections.
import { CHRONO_DESC } from "./elections.ts";
import { kindOfBody, stateHref } from "./routes.ts";
import type { PlaceBrief, SourceRef } from "./index.ts";
import { getPlaceBrief, loadSources, marks, yearOf } from "./index.ts";
import type { PlaceAnalysis } from "./place-analysis.ts";
import { getPlaceAnalysis } from "./place-analysis.ts";
import type { ParsedFilters, Search } from "./place-filters.ts";
import { parseFilters } from "./place-filters.ts";
import { tally } from "./place-presentation.ts";
import type { Found, Place, PlaceIndex, PlaceQuery, SeatPlace } from "./place-resolve.ts";
import { placeIndex, resolve, seatHref, seatTies } from "./place-resolve.ts";
import { readRegistry } from "./session.ts";
import { seatLocator } from "./seat-locator.ts";
import type { SeatLocatorView } from "./seat-locator.ts";
import { readSeats, sourceIdsFor } from "./seat-results.ts";
import type { SeatResult } from "./seat-results.ts";

// ── the URL ──────────────────────────────────────────────────────────────────────────────────────

/** A stray percent in the path is a name no place has, not a crashed page: /pl/wb/50%25 must 404 the
 *  way every other unresolvable path does, so a malformed escape keeps its raw text and fails to
 *  match. */
export function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * The query a request makes, as the resolver reads it: every string decoded, and a seat written as its registry id —
 * whole (`wb.ac.001`) or as its number (`1`, `001`) — asked by that id.
 *
 * Next hands a route its segments once decoded, and place-resolve.ts takes strings as it finds them, so the
 * decoding that must not throw is done here, where a request enters.
 *
 * A name asked `exact` is a name and nothing else, so it is never read as an id or a number.
 *
 * THE ID KEEPS ITS STATE AND ITS BODY. The resolver narrows by what the path names before it compares an id, so
 * `wb.ac.001` under /lok-sabha and `wb.pc.01` under /assembly are no seat. A bare number is the id in that state,
 * of the body's kind (an assembly seat's when the path names none), padded to three digits as an assembly id is.
 * A Lok Sabha id is two digits in the seed (`wb.pc.01`), so a bare number has never found one there.
 */
function asked(query: PlaceQuery): PlaceQuery {
  const q = Object.fromEntries(
    Object.entries(query).map(([k, v]) => [k, typeof v === "string" && k !== "level" ? decode(v) : v]),
  ) as PlaceQuery;
  if (q.level !== "seat" || !("name" in q) || q.exact) return q;
  const written = q.name.trim().toLowerCase();
  const placeId = /^[^.\s]+\.(?:ac|pc)\.\d+$/.test(written)
    ? written
    : /^\d+$/.test(written) && q.state !== undefined
      ? `${q.state.trim().toLowerCase()}.${q.body === undefined ? "ac" : kindOfBody(q.body)}.${written.padStart(3, "0")}`
      : null;
  if (placeId === null) return q;
  const { name: _name, ...scope } = q;
  return { ...scope, placeId };
}

// ── the loader ───────────────────────────────────────────────────────────────────────────────────

export type ChildTable = {
  caption: string;
  headers: string[];
  /**
   * Which columns hold a figure, per header, so the page can align them right without guessing.
   *
   * The page used to guess with `i > 1`, which is true for both of these tables' numeric columns and also
   * for "Won most", "Won by" and "Member" — so a state page right-aligned "INC 5 of 7" as though it were a
   * number, in a table whose other columns are numbers. The layer that builds the columns is the layer that
   * knows which is which.
   */
  numeric: boolean[];
  rows: { href: string; cols: string[] }[];
};

/** One step of the place path, walkable. The last has no href, because it is the page you are on. */
export type Crumb = { label: string; href?: string };

export type PlaceView =
  | { kind: "unavailable"; detail: string }
  | { kind: "not-found" }
  | {
      /** The query names more than one seat equally well, so the reader is asked which. See `Found`. */
      kind: "many";
      places: readonly Place[];
    }
  | {
      kind: "ac";
      brief: PlaceBrief;
      analysis: PlaceAnalysis;
      base: string;
      years: number[];
      parties: string[];
      filters: ParsedFilters;
      /** The seat's outline among its neighbours, or null where there is nothing to draw (seat-locator.ts). */
      locator: SeatLocatorView | null;
      trail: Crumb[];
    }
  | {
      /**
       * A state or union territory: a name, a trail, and the id to read its page with.
       *
       * Nothing else, on purpose. What a state page shows is `stateView`'s to read (repo/state-view.ts), so this
       * does not pay for a district table that no state page renders.
       */
      kind: "parent";
      level: "state";
      /**
       * The place this path resolved to, as the registry spells it: `ka` for `/state/KA`. What a caller reads the
       * registry with, rather than the segment it was reached by, which is any case and may be a name.
       */
      placeId: string;
      name: string;
      trail: Crumb[];
    }
  | {
      kind: "parent";
      level: "district";
      placeId: string;
      name: string;
      headline: string;
      children: ChildTable;
      sources: SourceRef[];
      electionId: string | null;
      trail: Crumb[];
    };

/**
 * The place as a walkable trail, with the registry's names rather than the URL's slugs.
 *
 * `/pl/ka/bagalkot/badami` used to render its breadcrumb as "Mandate · ka / bagalkot / badami" — a
 * technical id, a slug, and no way at all back to the country. India is the first crumb and it is a real
 * link, which is the fix for the defect the audit found: a reader who arrived at a seat could reach that
 * seat's ancestors and nothing else.
 *
 * The state's href comes from the segment, because that is what the request spelled; its label comes from the
 * registry, because a slug is not a name. A label that cannot be found falls back to the segment with its hyphens
 * opened out, so a crumb is never blank: `/constituency/WB/assembly/mekliganj` has always labelled its state "WB",
 * because "WB" is no state's id.
 *
 * Every ancestor is a link; the place itself is the page you are on and carries no href. A district's trail and a
 * seat's both name the state and nothing between: a constituency's canonical address carries no district.
 */
function trailOf(index: PlaceIndex, place: Place, spelled?: string): Crumb[] {
  const trail: Crumb[] = [{ label: "India", href: "/" }];
  if (place.level === "state") return [...trail, { label: place.name }];
  const state = spelled ?? place.stateId;
  const label = index.states.find((s) => s.id === state)?.name ?? state.replace(/-/g, " ");
  return [...trail, { label, href: stateHref(state) }, { label: place.name }];
}

/**
 * Resolve a place query to the place or places it names, over the registry `db` holds, for a route that only
 * redirects or asks and has no use for the rest of a view.
 *
 * The caller owns the session, and so what an unreadable registry means: legacy.ts throws it, where `placeView`
 * answers `unavailable`.
 */
export function resolveRequest(db: DatabaseSync, query: PlaceQuery): Found {
  return resolve(placeIndex(db), asked(query));
}

/**
 * Resolve a place query and read everything its level actually has. One DB open, closed in
 * `finally`; a missing or unmigrated registry comes back as `unavailable` with the command that
 * fixes it, never a thrown build error (constraint 7).
 *
 * A query that names more than one seat equally well is `many` and is not read: the reader is asked which.
 *
 * A seat is read as the version the query resolved to and no other. Its Brief and Analysis are handed that
 * version's id rather than a place id or a name, because a place id is a seat NUMBER and a name may have belonged
 * to an earlier constituency: resolving either again could render a different seat than the one the reader was
 * sent to.
 */
export async function placeView(
  place: PlaceQuery,
  search: Search,
  read = readRegistry,
): Promise<PlaceView> {
  // An unreadable registry comes back as `unavailable`; a bug in this process is thrown.
  const r = read((db): PlaceView => {
    const index = placeIndex(db);
    const q = asked(place);
    // The state as the request spelled it, which is what the trail's state link is made from.
    const spelled = "state" in q ? q.state : undefined;
    const found = resolve(index, q);
    if (found.found === "none") return { kind: "not-found" };
    if (found.found === "many") return { kind: "many", places: found.places };
    const hit = found.place;
    /**
     * EITHER BODY IS A CONSTITUENCY. This read `place.kind !== "ac"`, so a parliamentary seat resolved
     * correctly and was then handed to `parentView` — the state/district renderer — and 606 Lok Sabha seats
     * rendered as their own state's assembly page. A pc is a constituency; what differs is its body, and the
     * body is data the surface reads rather than a branch in the router.
     */
    if (hit.level !== "seat") return parentView(db, index, hit, spelled);

    const brief = getPlaceBrief(db, hit.versionId);
    if (brief === null) return { kind: "not-found" };
    const parties = all<{ name: string | null }>(
      db,
      `SELECT DISTINCT COALESCE(pt.short_name, ca.party_raw) AS name
         FROM contest c
         JOIN place_version pv ON pv.id = c.place_version_id
         JOIN result r ON r.contest_id = c.id AND r.revision = 0
         JOIN candidacy ca ON ca.id = r.candidacy_id
         LEFT JOIN party_version pver ON pver.id = ca.party_version_id
         LEFT JOIN party pt ON pt.id = pver.party_id
        WHERE pv.place_id = ?
        ORDER BY name`,
      hit.placeId,
    )
      .map((row) => row.name)
      .filter((n): n is string => n !== null);
    const years = brief.contests.map((c) => c.year);
    // THE SEAT'S OWN ADDRESS, body included. Hardcoding "ac" here made a parliamentary page link to an ASSEMBLY
    // seat of the same name — its own base URL pointing at a different office, or at nothing.
    const base = `${hit.href}/analysis`;
    const filters = parseFilters(search, { base, years, parties });
    const analysis = getPlaceAnalysis(db, hit.versionId, filters.filters);
    if (analysis === null) return { kind: "not-found" };
    return {
      kind: "ac",
      brief,
      analysis,
      base,
      years,
      parties,
      filters,
      locator: seatLocator(db, hit.versionId),
      trail: trailOf(index, hit, spelled),
    };
  });
  return r.ok ? r.value : { kind: "unavailable", detail: r.detail };
}

/**
 * The turnout the registry holds for these seats, whether or not it is corroborated.
 *
 * Read here rather than taken from the seat results because those withhold an uncorroborated turnout and this
 * table has always printed it: the Analysis floor does too, and a test holds the two equal. Whether a district
 * should print West Bengal 2026's 93.0% is a separate decision from where its winners come from.
 */
function heldTurnout(
  db: DatabaseSync,
  election: string | null,
  seats: readonly SeatResult[],
): Map<number, { voters: number | null; electors: number | null }> {
  if (election === null || seats.length === 0) return new Map();
  return new Map(
    all<{ versionId: number; voters: number | null; electors: number | null }>(
      db,
      `SELECT c.place_version_id AS versionId, t.voters AS voters, t.electors AS electors
         FROM contest c
         JOIN turnout t ON t.contest_id = c.id AND t.scope = 'contest'
        WHERE c.election_id = ? AND c.place_version_id IN (${marks(seats.length)})`,
      election,
      ...seats.map((x) => x.versionId),
    ).map((t) => [t.versionId, t]),
  );
}

/** Seats in the order a table lists them: by number, then name. A seat with no number goes first, as in SQL. */
function bySeat(seats: readonly SeatResult[]): SeatResult[] {
  return [...seats].sort(
    (a, b) =>
      (a.number === b.number ? 0 : a.number === null ? -1 : b.number === null ? 1 : a.number - b.number) ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
}

const RESERVATION: Record<string, string> = { general: "General", sc: "Reserved SC", st: "Reserved ST" };

/**
 * A district gets what the registry genuinely holds for it: its seats, each with its latest declared result.
 * getPlaceAnalysis is an AC measure, so there are no charts here and no placeholder saying there will be.
 *
 * A state gets its name and its trail and nothing else. What its page shows is `stateView`'s to read, and a
 * state that read the district table too would pay for a table no state page renders.
 */
function parentView(
  db: DatabaseSync,
  index: PlaceIndex,
  place: Exclude<Place, SeatPlace>,
  spelled: string | undefined,
): PlaceView {
  if (place.level === "state") {
    return {
      kind: "parent",
      level: "state",
      placeId: place.id,
      name: place.name,
      trail: trailOf(index, place),
    };
  }

  // The latest assembly election IN THIS DISTRICT'S STATE, by year.
  //
  // This was `SELECT MAX(election_id) FROM contest`, which was survivable while the registry held one
  // state and became wrong the moment it held thirty-one: ids sort lexically, so the maximum is whichever
  // state's name happens to sort last, and a West Bengal district asked for its seats' results in an
  // election held somewhere else — returning nothing at all. The year is the last four characters of every
  // election id (see repo/index.ts yearOf) and `place_version.jurisdiction_id` is what scopes it.
  const jurisdiction = place.stateId;
  const election =
    get<{ id: string | null }>(
      db,
      `SELECT c.election_id AS id
         FROM contest c
         JOIN place_version pv ON pv.id = c.place_version_id
         JOIN election e ON e.id = c.election_id AND e.kind = 'assembly'
        WHERE pv.jurisdiction_id = ?
        ORDER BY ${CHRONO_DESC}
        LIMIT 1`,
      jurisdiction,
    )?.id ?? null;
  const year = election === null ? "" : yearOf(election);


  // The seats of the latest election, as the seat results define them. A page that has no election has no seats.
  const asked = election === null ? [] : [election];

  const scope = { elections: asked, district: place.id };
  const rows = bySeat(readSeats(db, scope));
  const held = heldTurnout(db, election, rows);
  const tied = seatTies(db);
  // No place above an AC carries a claim, so `loadSources` on the subject ref alone comes back empty: a parent
  // level is cited from the same fact rows it renders.
  const sources = loadSources(db, sourceIdsFor(db, scope, { turnout: true }), [`place:${place.id}`]);
  const counts = tally(rows.map((x) => x.winner?.party.label ?? null));
  const lead = counts.at(0);
  return {
    kind: "parent",
    level: "district",
    placeId: place.id,
    name: place.name,
    headline:
      rows.length === 0
        ? `No assembly seat in ${place.name} has a contest on record.`
        : `${place.name} has ${inr(rows.length)} assembly seats` +
          (lead === undefined
            ? `, and no declared winner in ${year}.`
            : `; ${lead[0]} won ${inr(lead[1])} of them in ${year}.`),
    children: {
      caption:
        `Every assembly seat in ${place.name} with its ${year} result — ` +
        `${inr(rows.length)} seat${rows.length === 1 ? "" : "s"}. Open one for its brief.`,
      headers: ["No.", "Seat", "Won by", "Member", "Margin", "Turnout"],
      numeric: [true, false, false, false, true, true],
      rows: rows.map((x) => ({
        // By registry id where another seat of the state's assembly has this name, so the row opens its own seat.
        href: seatHref(tied, {
          versionId: x.versionId,
          placeId: x.placeId,
          stateId: x.jurisdictionId,
          kind: "ac",
          name: x.name,
        }),
        cols: [
          x.number === null ? "—" : String(x.number),
          x.name + (x.reservation == null ? "" : ` · ${RESERVATION[x.reservation] ?? x.reservation}`),
          x.winner?.party.label ?? "no result declared",
          x.winner?.name ?? "—",
          x.margin === null ? "—" : inr(Math.abs(x.margin.votes)),
          turnout_pct.format(
            turnout_pct.compute({
              voters: held.get(x.versionId)?.voters ?? null,
              electors: held.get(x.versionId)?.electors ?? null,
            }),
          ),
        ],
      })),
    },
    sources,
    electionId: election,
    trail: trailOf(index, place, spelled),
  };
}

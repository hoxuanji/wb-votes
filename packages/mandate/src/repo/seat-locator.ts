// Where a seat is: its outline among the other seats of its house in its state, in one frame.
//
// A seat page used to say where a seat is in words (a district, a number) and in no picture, while the registry holds an
// outline for 288 of West Bengal's 294 assembly seats and 41 of its 42 parliamentary ones. This reads those outlines for
// one seat's page: the seat, and every other seat of the same house in the same state and boundary epoch, so a reader sees
// the seat in the state it sits in. No React and no new table; the component that draws it is SeatLocator.tsx.
//
// THE OUTLINES ARE THE MAPS' OWN. Read from `place_geometry` as election-map.ts reads them, kept only when they are in the
// shared frame (an outline in another projection is withheld, never drawn in this one), and simplified by the same
// `NATIONAL` setting, so a seat's shape here is the shape on the state page.
//
// A SEAT IS LOCATED AMONG ITS OWN HOUSE. `kind` is part of the question, so a Lok Sabha seat sits among the state's Lok
// Sabha seats and an assembly seat among its assembly seats; the epoch is as well, because a seat number is not a seat
// across a delimitation (place-resolve.ts, D26) and two orders' outlines overlap.
//
// NOTHING TO LOCATE IS NULL, not an empty frame: the seat has no outline (6 of West Bengal's assembly seats, and every seat
// of a registry that holds no boundaries), or no other seat of its house is drawn, so the picture would be one shape and no
// "among".

import type { DatabaseSync } from "node:sqlite";
import type { Body } from "../core/election-kind.ts";
import { all, get } from "../db/index.ts";
import { inr } from "../semantic/index.ts";
import { NATIONAL, parse, simplified } from "../viz/simplify.ts";
import { SHARED_FRAME, frameOf } from "./election-map.ts";
import { CHRONO_DESC } from "./elections.ts";
import { read } from "./index.ts";
import { seatHref, seatTies } from "./place-resolve.ts";
import { bodyOfKind } from "./routes.ts";
import { readSeats } from "./seat-results.ts";
import type { PartyRef } from "./seat-results.ts";

/** One seat's outline in the locator's frame. `id` is the registry's seat id (`wb.ac.001`). */
export type LocatorOutline = { id: string; name: string; path: string };

export type SeatLocatorView = {
  /** The one frame every outline is drawn in: square, so a state taller than it is wide still fills a square box, and fitted to the seats drawn. */
  viewBox: string;
  body: Body;
  state: { id: string; name: string };
  /** The seats this house has in this state and epoch, drawn or not: the "among" of the caption. */
  seats: number;
  /** The seat the page is about, with the box its outline occupies in the frame and what it was at its latest election. */
  seat: LocatorOutline & {
    bounds: { x0: number; y0: number; x1: number; y1: number };
    /** Null for a seat with no contest on record. `winner` is null where the latest contest declared none. */
    latest: { year: number; winner: PartyRef | null } | null;
  };
  /** The other seats drawn, each at its own address: its name's, or its registry id's where another seat of the state and body has the name. */
  neighbours: (LocatorOutline & { href: string })[];
};

/** A frame grown on its short side to a square about the same centre. */
export function squareFrame(viewBox: string): string {
  const [x, y, w, h] = viewBox.split(" ").map(Number) as [number, number, number, number];
  const side = Math.max(w, h);
  return `${(x - (side - w) / 2).toFixed(1)} ${(y - (side - h) / 2).toFixed(1)} ${side.toFixed(1)} ${side.toFixed(1)}`;
}

type SeatSql = {
  versionId: number;
  placeId: string;
  kind: string;
  stateId: string | null;
  stateName: string | null;
  name: string;
};

type OutlineSql = {
  versionId: number;
  placeId: string;
  kind: string;
  name: string;
  path: string | null;
  viewBox: string | null;
};

/** The box a path occupies. A path with no point, which `frameOf` ignores as well, has none. */
function boundsOf(path: string): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const pts of parse(path).subpaths) {
    for (const [x, y] of pts) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
}

/**
 * The locator for the seat version `versionId`, or null where there is nothing to locate (see the top of the file).
 *
 * The party is the seat's winner at its newest contest, read by the seat results (`readSeats`) so it is the winner the maps
 * colour the seat with: the same party key, hence the same ink. A newest contest with no declared winner leaves the seat
 * without a party, and the picture says so rather than falling back to an older winner.
 */
export function seatLocator(db: DatabaseSync, versionId: number): SeatLocatorView | null {
  return read(() => {
    const here = get<SeatSql>(
      db,
      `SELECT pv.id AS versionId, pv.place_id AS placeId, pv.kind AS kind, pv.jurisdiction_id AS stateId,
              j.canonical_name AS stateName, pv.canonical_name AS name
         FROM place_version pv
         LEFT JOIN place j ON j.id = pv.jurisdiction_id
        WHERE pv.id = ? AND pv.kind IN ('ac', 'pc')`,
      versionId,
    );
    if (here === undefined || here.stateId === null) return null;

    // Every seat of this house, state and epoch, with the outline it has. `epoch_id IS ?` because the column may be null.
    const house = all<OutlineSql>(
      db,
      `SELECT pv.id AS versionId, pv.place_id AS placeId, pv.kind AS kind, pv.canonical_name AS name,
              pg.path AS path, pg.view_box AS viewBox
         FROM place_version pv
         LEFT JOIN place_geometry pg ON pg.place_version_id = pv.id
        WHERE pv.kind = ? AND pv.jurisdiction_id = ?
          AND pv.epoch_id IS (SELECT epoch_id FROM place_version WHERE id = ?)
        ORDER BY pv.number, pv.id`,
      here.kind,
      here.stateId,
      versionId,
    );
    const drawn = house.flatMap((o) =>
      // An outline in another projection is withheld rather than drawn, as the election map withholds it.
      o.path === null || o.viewBox !== SHARED_FRAME ? [] : [{ ...o, path: simplified(o.path, NATIONAL) }],
    );
    const seat = drawn.find((o) => o.versionId === versionId);
    const bounds = seat === undefined ? null : boundsOf(seat.path);
    if (seat === undefined || bounds === null || drawn.length < 2) return null;

    const tied = seatTies(db);
    const newest = get<{ id: string; year: number }>(
      db,
      `SELECT e.id AS id, e.year AS year
         FROM contest c JOIN election e ON e.id = c.election_id
        WHERE c.place_version_id = ?
        ORDER BY ${CHRONO_DESC}
        LIMIT 1`,
      versionId,
    );
    const result =
      newest === undefined
        ? undefined
        : readSeats(db, { elections: [newest.id], within: here.stateId }).find((r) => r.versionId === versionId);

    return {
      viewBox: squareFrame(frameOf(drawn.map((o) => o.path))),
      body: bodyOfKind(here.kind),
      state: { id: here.stateId, name: here.stateName ?? here.stateId },
      seats: house.length,
      seat: {
        id: seat.placeId,
        name: seat.name,
        path: seat.path,
        bounds,
        latest: newest === undefined ? null : { year: newest.year, winner: result?.winner?.party ?? null },
      },
      neighbours: drawn
        .filter((o) => o.versionId !== versionId)
        .map((o) => ({
          id: o.placeId,
          name: o.name,
          path: o.path,
          href: seatHref(tied, { versionId: o.versionId, placeId: o.placeId, stateId: here.stateId as string, kind: o.kind, name: o.name }),
        })),
    };
  });
}

/** The house as it reads in a sentence: "assembly seats", "Lok Sabha seats". */
function houseWord(body: Body): string {
  return body === "lok-sabha" ? "Lok Sabha" : "assembly";
}

/** What the figure is of, for a screen reader: "Mekliganj, among the 294 assembly seats of West Bengal". */
export function locatorDescription(v: SeatLocatorView): string {
  return `${v.seat.name}, among the ${inr(v.seats)} ${houseWord(v.body)} seats of ${v.state.name}`;
}

/**
 * What the figure does not draw, in the caption under it: all of the house, or how many of it and why the rest are missing.
 * Said every time, because a state with one seat missing is a different picture from one with none.
 */
export function locatorCaption(v: SeatLocatorView): string {
  const drawn = v.neighbours.length + 1;
  return drawn === v.seats
    ? `All ${inr(v.seats)} ${houseWord(v.body)} seats of ${v.state.name} drawn.`
    : `${inr(drawn)} of ${inr(v.seats)} ${houseWord(v.body)} seats drawn — no boundary on record for the other ${inr(v.seats - drawn)}.`;
}

/** The seat's tooltip: its name, and who won it at its latest election, which is what its colour is. */
export function locatorSeatTitle(v: SeatLocatorView): string {
  const { name, latest } = v.seat;
  if (latest === null) return name;
  return latest.winner === null
    ? `${name} — no winner declared in ${latest.year}`
    : `${name} — won by ${latest.winner.label} in ${latest.year}`;
}

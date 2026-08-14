// What an election IS, decided once.
//
// ── THE SEAM THIS CLOSES ──
//
// The registry stores two facts on `election`: `house` ('ac' | 'pc') and `kind` ('general' | 'assembly' |
// 'bypoll'). Those two columns encode THREE independent things, and `kind` conflates two of them:
//
//   WHICH BODY        an assembly, or the Lok Sabha
//   WHETHER IT WAS    the whole house, or a handful of seats falling vacant
//   (and 'general' vs 'assembly' is not that distinction — it is the body again, spelled differently)
//
// So every caller had to decode it, and seven of them did, independently:
//
//   election-map.ts   kind IN ('general','assembly')      -- and so REFUSED all 829 by-elections
//   elections.ts      kind <> 'bypoll'    (recent)
//   elections.ts      kind =  'bypoll'    (bypolls)
//   trajectory.ts     kind <> 'bypoll'
//   readState()       kind =  'assembly' OR (general AND pc)
//   page.tsx  x3      kind === 'bypoll' ? ' by-election' : ''
//
// Seven readings of one concept is seven chances to disagree, and they did: a by-election was a first-class
// row in the registry and unreachable in the product, while `majority` was computed as half the seats
// CONTESTED — which for a four-seat by-election announced "majority 3".
//
// ── WHAT THIS MODULE ASSERTS ──
//
//   body      from `house`, never from `kind`. 'assembly' and 'general' both describe a body.
//   kind      'general' | 'bypoll'. Whether the whole house was elected. Nothing else.
//   majority  NULL for a by-election, and null is the point: a majority is a property of a full house.
//             Making it nullable means a surface cannot print one without handling the absence.
//
// No consumer re-reads `house` or `kind` after this.

import type { DatabaseSync } from "node:sqlite";
import { get } from "../db/index.ts";
import { read } from "./index.ts";
import { previousElection } from "./elections.ts";
import { JURISDICTIONS } from "../ingest/india.ts";

/** Which body was elected. From `house`, which is the column that actually says so. */
export type Body = "assembly" | "lok-sabha";

/**
 * Whether the whole house was elected or a few vacant seats were.
 *
 * The registry's `kind` has three values and only one of them is about this; 'general' and 'assembly' are
 * both full-house events and differ only in body, which `body` already carries.
 */
export type ElectionKind = "general" | "bypoll";

/**
 * What happened to ONE SEAT in the context of ONE election.
 *
 * NOT a rendering flag. `not-contested` is a domain fact with no previous home, and its absence is why a
 * by-election had nowhere to put the other 290 seats of the house except the ink that means "no data" — so
 * a reader saw absence and read it as a political result. These five are exhaustive and mutually exclusive:
 *
 *   won-by          contested at this election, and a winner is recorded
 *   held            contested, and the same party that held it kept it
 *   not-contested   THE SEAT WAS NOT UP. Not a loss, not a blank, not missing data.
 *   not-comparable  contested, but the boundary was redrawn since the comparison election
 *   no-geometry     contested, but the registry holds no polygon for this version
 */
export type SeatStanding = "won-by" | "held" | "not-contested" | "not-comparable" | "no-geometry";

export type ElectionContext = {
  id: string;
  jurisdictionId: string;
  jurisdictionName: string;
  body: Body;
  kind: ElectionKind;
  /** "Karnataka Assembly Election 2023", "Karnataka Assembly By-election 2024". Never assembled by a page. */
  label: string;
  year: number;
  /** The tuple `CHRONO_DESC` orders by, so a caller can sort without re-deriving the rule. */
  chronology: { year: number; pollingMonth: number | null; occurrence: number };
  /** Seats this election actually put to a vote. */
  seatsContested: number;
  /** The house's elected strength as reference data holds it TODAY. Null where none is on record. */
  seatsInHouse: number | null;
  /** Seats a majority needs — NULL for a by-election, because a by-election does not decide a house. */
  majority: number | null;
  previous: { id: string; year: number } | null;
  epochId: string | null;
  /** The jurisdiction the seats were narrowed to, or null for the whole election. */
  scope: string | null;
  /**
   * True when this election did not fill its house — which, knowably, means a by-election.
   *
   * Not derived from `seatsContested < seatsInHouse`: reference data holds only today's house strength, so
   * that comparison flags every historical election whose house has since grown.
   */
  isPartial: boolean;
};

const HOUSE_SEATS = new Map(JURISDICTIONS.map((j) => [j.id, j]));
/** The Lok Sabha's elected strength. Reference data holds per-state figures; the national total is this. */
const LOK_SABHA = 543;

function bodyOf(house: string): Body {
  return house === "pc" ? "lok-sabha" : "assembly";
}

function kindOf(kind: string): ElectionKind {
  return kind === "bypoll" ? "bypoll" : "general";
}

/** "Assembly Election", "Lok Sabha By-election" — the type, in the words a reader uses for it. */
export function typeLabel(body: Body, kind: ElectionKind): string {
  const house = body === "lok-sabha" ? "Lok Sabha" : "Assembly";
  return kind === "bypoll" ? `${house} By-election` : `${house} Election`;
}

/**
 * The house strength this election was fought for, as reference data holds it today.
 *
 * `scope` matters: a general election read through one state is 28 of 543 seats, and the house that state
 * is a part of is the Lok Sabha, but the strength a reader compares 28 against is Karnataka's OWN
 * entitlement. So a scoped parliamentary view reports that state's seats, not the national total.
 */
function houseSeats(body: Body, jurisdictionId: string, scope: string | null): number | null {
  const j = HOUSE_SEATS.get(scope ?? jurisdictionId);
  if (body === "assembly") return j?.assemblySeats ?? null;
  if (scope !== null) return j?.lokSabhaSeats ?? null;
  return jurisdictionId === "in" ? LOK_SABHA : (j?.lokSabhaSeats ?? null);
}

/**
 * One election's semantics. `jurisdictionId` scopes a general election to one state, exactly as
 * `electionMapView` does, so the two can never describe the same view differently.
 *
 * Returns null for an unknown id — and for NO other reason. The predecessor of this logic refused every
 * by-election here, which is how 829 elections came to 404.
 */
export function electionContext(
  db: DatabaseSync,
  electionId: string,
  jurisdictionId?: string,
): ElectionContext | null {
  return read(() => {
    const e = get<{
      id: string;
      name: string;
      year: number;
      house: string;
      kind: string;
      pollingMonth: number | null;
      occurrence: number;
      epochId: string | null;
      j: string;
      jName: string;
      seats: number;
    }>(
      db,
      `SELECT e.id AS id, e.name AS name, e.year AS year, e.house AS house, e.kind AS kind,
              e.polling_month AS pollingMonth, e.occurrence AS occurrence, e.epoch_id AS epochId,
              e.jurisdiction_place_id AS j, p.canonical_name AS jName,
              (SELECT COUNT(*) FROM contest c
                 JOIN place_version pv ON pv.id = c.place_version_id
                WHERE c.election_id = e.id${jurisdictionId === undefined ? "" : " AND pv.jurisdiction_id = ?"}
              ) AS seats
         FROM election e JOIN place p ON p.id = e.jurisdiction_place_id
        WHERE e.id = ?`,
      ...(jurisdictionId === undefined ? [] : [jurisdictionId]),
      electionId,
    );
    if (e === undefined) return null;

    const body = bodyOf(e.house);
    const kind = kindOf(e.kind);
    const scope = jurisdictionId ?? null;
    const seatsInHouse = houseSeats(body, e.j, scope);
    const where = scope === null ? e.jName : (HOUSE_SEATS.get(scope)?.name ?? e.jName);

    const prevId = previousElection(db, electionId);
    const prev =
      prevId === null
        ? null
        : (get<{ year: number }>(db, `SELECT year FROM election WHERE id = ?`, prevId) ?? null);

    return {
      id: e.id,
      jurisdictionId: e.j,
      jurisdictionName: e.jName,
      body,
      kind,
      label: `${where} ${typeLabel(body, kind)} ${e.year}`,
      year: e.year,
      chronology: { year: e.year, pollingMonth: e.pollingMonth, occurrence: e.occurrence },
      seatsContested: e.seats,
      seatsInHouse,
      /**
       * MAJORITY, AND THE TWO REASONS IT IS SHAPED LIKE THIS.
       *
       * Null for a by-election: four seats falling vacant do not decide who governs, and "majority 3" was
       * the product saying they did. Nullable rather than zero or absent, so a renderer has to answer for
       * the case rather than printing whatever arithmetic returns.
       *
       * And from seatsCONTESTED for a general election, not from `seatsInHouse` — deliberately. Reference
       * data holds only TODAY'S house strength, while West Bengal returned 251 seats in 1962 and 294 now.
       * Dividing today's figure would have announced a 1962 majority of 148 against a house of 251.
       * A full-house election's contest count IS its house.
       */
      majority: kind === "bypoll" ? null : Math.floor(e.seats / 2) + 1,
      previous: prevId === null || prev === null ? null : { id: prevId, year: prev.year },
      epochId: e.epochId,
      scope,
      /**
       * PARTIAL MEANS "DID NOT FILL ITS HOUSE", and only a by-election can be known to be that.
       *
       * This read `seatsContested < seatsInHouse` and flagged West Bengal 1962 — a completed general
       * election that returned 252 members to a house that HAD about 252 seats then and has 294 now.
       * Reference data holds only today's strength, so for any election but the most recent that comparison
       * measures how much the house has GROWN, not whether the event was partial. A by-election is partial
       * by definition and needs no arithmetic to say so.
       */
      isPartial: kind === "bypoll",
    };
  });
}

/**
 * How a surface describes the SIZE of what happened, which differs by kind and must not be one sentence
 * with a branch inside it.
 *
 *   general   "224 seats · majority 113"
 *   bypoll    "4 of 224 seats contested"
 */
export function scaleLabel(ctx: ElectionContext): string {
  if (ctx.kind === "bypoll") {
    return ctx.seatsInHouse === null
      ? `${ctx.seatsContested} seat${ctx.seatsContested === 1 ? "" : "s"} contested`
      : `${ctx.seatsContested} of ${ctx.seatsInHouse} seats contested`;
  }
  return `${ctx.seatsContested} seats · majority ${ctx.majority ?? "—"}`;
}

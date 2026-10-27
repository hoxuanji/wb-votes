// The election map: every seat of one election, with what a reader would ask about it.
//
// GENERAL FROM THE START, because a general election and a state assembly are the same shape of thing. This
// module knows nothing about `kind`: it reads the contests of whatever election it is given, resolves each to
// the place_version the result was recorded under, and takes the polygon keyed to that version. A general
// election frames the country; an assembly frames its own state, from the bounding box of the polygons it
// actually holds. Neither branch exists in the code — the box is computed from what was loaded.
//
// WHAT IT ADDS OVER A LIST OF WINNERS, and each one is a question no surface has answered:
//
//   THE RUNNER-UP.  `result.margin` exists for winners only, but rank-1 and rank-2 vote counts exist for
//                   63,334 of 64,021 contests. So the margin AND who it was over are both computable, and
//                   the second half has never been shown anywhere.
//   THE FLIP.       Per seat, the party that held it before — THROUGH THE EPOCH GATE, so a seat whose
//                   boundary was redrawn is `comparable: false` and carries no flip rather than a false one.
//   VOTE TO SEATS.  Each party's share of the vote against its share of the seats. Karnataka 2023: INC
//                   43.2% of the vote and 60.3% of the seats; BJP 36.1% and 29.0%. Neither figure appears
//                   anywhere in the product today.
//   THE MARGIN'S SHAPE. 63,334 computable margins currently surface as a list of five. Binned here, so the
//                   distribution is drawable and a bin is addressable from a URL.
//
// ONE READ FOR THE SEATS (seat-results.ts), one for the previous election's winners, one for the outlines the
// seats are drawn with, and everything else is folded in memory. What a seat's winner, runner-up and margin are
// is not decided here: this module adds geometry, the flip and the standing to a seat result.

import type { DatabaseSync } from "node:sqlite";
import { seatHref, seatTies } from "./place-resolve.ts";
import { all, get } from "../db/index.ts";
import { read } from "./index.ts";
import type { SourceRef } from "./index.ts";
import { facetOf } from "../core/election-kind.ts";
import type { Body, Fill } from "../core/election-kind.ts";
import { CHRONO_DESC, previousElection } from "./elections.ts";
import type { Finding, PartyRef, SeatFlips, VoteSeatEfficiency } from "./findings.ts";
import { NATIONAL, parse, simplified } from "../viz/simplify.ts";
import { compareSeats } from "./seat-comparison.ts";
import { partyVotes, readSeats, sourcesFor, tally, turnoutOf, votesByParty } from "./seat-results.ts";
import { electionContext } from "./election-context.ts";
import type { ElectionContext, SeatStanding } from "./election-context.ts";
import { tally as tallySeats } from "./map-selection.ts";
import type { Choices } from "./map-selection.ts";
import type { Turnout } from "./turnout-trust.ts";

/** The frame the state outlines and every constituency outline share. Anything else cannot be overlaid. */
export const SHARED_FRAME = "2.1 2.7 597.3 666.8";

/** Margin bins, in percentage points of votes polled. Uniform width, so the bars are comparable. */
export const BIN_WIDTH = 2;
/** Everything at or above this lands in one overflow bin: a 60-point margin is not 30 bars of detail. */
export const BIN_MAX = 40;

/** Which bin a margin falls in. `null` for an unknown margin, which is not a bin. */
export function binOf(marginPct: number | null): number | null {
  if (marginPct === null) return null;
  if (marginPct >= BIN_MAX) return BIN_MAX;
  return Math.floor(marginPct / BIN_WIDTH) * BIN_WIDTH;
}

/** One bar of the margin distribution. `lo` doubles as the bin's URL key. */
export type MarginBin = {
  lo: number;
  hi: number | null;
  /** Null `hi` is the overflow bin. */
  n: number;
  overflow: boolean;
};

export type SeatFlip = {
  /** The party that held this seat at the previous election of the same house. */
  from: PartyRef;
  /** False when the winner is unchanged — a hold, which the map draws differently from a gain. */
  changed: boolean;
};

/** One constituency, as the map draws it and as the panels list it. */
export type ElectionSeat = {
  placeId: string;
  versionId: number;
  epochId: string;
  contestId: string;
  name: string;
  number: number | null;
  reservation: string | null;
  jurisdictionId: string;
  jurisdictionName: string | null;
  /**
   * The district this seat sits in, as a GROUPING and nothing more.
   *
   * A district does not elect anybody — its constituencies do — so nothing downstream may colour a
   * district by a winner. What it is good for is focus: selecting one reframes the map to the bounding box
   * of ITS OWN SEATS, which needs no district geometry at all. That matters, because the registry holds
   * district outlines for West Bengal only (19 of 25) and in a different projection from the
   * constituencies, so drawing them is not an option this data supports.
   */
  districtId: string | null;
  districtName: string | null;
  partyKey: string | null;
  partyLabel: string | null;
  winnerName: string | null;
  votes: number | null;
  runnerUpKey: string | null;
  runnerUpLabel: string | null;
  runnerUpName: string | null;
  runnerUpVotes: number | null;
  /**
   * Winner minus runner-up: from the two vote counts where both exist, else the margin the source declared. Null
   * for a seat with no declared winner, or one the source gave no margin for.
   */
  marginVotes: number | null;
  /**
   * Which of the two `marginVotes` is, so a page does not present a margin nobody can check against the votes as
   * though it were one. West Bengal 2026 publishes no vote counts, and every one of its margins is declared.
   */
  marginBasis: "declared" | "counted" | null;
  /**
   * Over votes polled, never over the sum of the result rows. Null where the election's votes polled are
   * unverified, whatever the margin: a share is only as good as the figure it divides by.
   */
  marginPct: number | null;
  /** `binOf(marginPct)`, carried so the map and the histogram agree without recomputing. */
  marginBin: number | null;
  /**
   * This seat's turnout AND its standing. A typed reading rather than a number, because West Bengal 2026
   * publishes 293 seat-level turnouts that nothing in the registry can corroborate — see `turnout-trust.ts`.
   * A dense list renders `turnoutHeadline`, which cannot print an uncorroborated figure.
   */
  turnout: Turnout;
  /**
   * Whether this seat could be compared with the previous election at all.
   *
   * False means the boundary was redrawn between the two, so there is no predecessor to have flipped from.
   * The map must not colour it as a hold — a redrawn seat is neither. A seat whose winner is undeclared at
   * either election is comparable and has no flip: nothing was redrawn, one of the two results is missing.
   */
  comparable: boolean;
  flip: SeatFlip | null;
  /**
   * WHAT HAPPENED TO THIS SEAT, as one of five exhaustive facts rather than as several nullable fields a
   * renderer has to combine correctly. Every seat in `seats` was contested at this election, so
   * `not-contested` never appears here — it describes the shapes in `context` instead.
   */
  standing: SeatStanding;
  /** Simplified for this zoom. Null where the registry holds no polygon for this version. */
  path: string | null;
  href: string | null;
};

/**
 * An election as a picker offers it. The one declaration: a map's election and siblings and the state view's
 * choices are all this.
 */
export type ElectionChoice = {
  id: string;
  name: string;
  year: number;
  /** The registry's `house` and `kind`, decoded once in `choiceOf`. The codes themselves do not leave it. */
  body: Body;
  fill: Fill;
  seats: number;
};

/** The columns a choice is selected with. */
export type ChoiceRow = Omit<ElectionChoice, "body" | "fill"> & { house: string; kind: string };

/** A selected row with its body and fill decoded. Throws for a house/kind pair the product does not label. */
export function choiceOf(r: ChoiceRow): ElectionChoice {
  const { body, fill } = facetOf(r.house, r.kind);
  return { id: r.id, name: r.name, year: r.year, body, fill, seats: r.seats };
}

/**
 * Whether an election's map is drawn and, where it is not, why. Decided here from the data, so a page does not have to
 * guess a reason from a count of zero.
 *
 *   drawn        at least one seat has an outline in the shared frame.
 *   redrawn      none does, and the registry holds outlines of this house's seats, in the jurisdictions these seats lie in,
 *                for older epochs only: the seats' own epoch is newer than every epoch that has any. They were redrawn
 *                since, and the new boundaries are not on record. It is the only case in which saying so is true.
 *   no-geometry  none does and that is not so: the registry holds no outline for these seats' epoch or any older one, so
 *                nothing was redrawn and there is simply nothing to draw.
 *
 * An outline in another projection is withheld rather than drawn, but it is still a boundary on record, so it counts as
 * an epoch that has boundaries.
 */
export type MapStatus = "drawn" | "no-geometry" | "redrawn";

export type ElectionMapView = {
  election: (ElectionChoice & { jurisdictionId: string; jurisdictionName: string }) | null;
  /**
   * The jurisdiction the seats were narrowed to, or null for the whole election.
   *
   * Distinct from `election.jurisdictionId`, which is where the ELECTION belongs — 'in' for a general
   * election even when this view holds only West Bengal's 42 seats. A renderer needs the scope, not the
   * election's home, to decide whether to draw the country underneath.
   */
  scope: string | null;
  /** Sibling elections of the same jurisdiction and house, newest first. The selector's options. */
  siblings: ElectionChoice[];
  previous: { id: string; year: number } | null;
  seats: ElectionSeat[];
  /** Parties that won a seat, biggest first. The contextual legend. */
  legend: { key: string; label: string; n: number }[];
  /**
   * The election's own semantics — body, kind, label, majority — from `election-context.ts`.
   *
   * Null only for an unknown id. Every consumer reads type and majority from HERE rather than re-deciding
   * from `house` and `kind`, which is the seam this replaced.
   */
  ctx: ElectionContext | null;
  /** Seats a majority needs. NULL for a by-election: it does not decide a house. */
  majority: number | null;
  /**
   * GEOGRAPHY THAT DID NOT VOTE, for a partial election.
   *
   * A by-election contests four seats of a house of sixty. The other fifty-six are not results, not losses
   * and not missing data — they are the map. Without them the figure was four polygons floating in nothing;
   * with them it is four seats highlighted in their state. Empty for a general election, which has no
   * unaffected seats by definition.
   */
  context: { versionId: number; name: string; path: string }[];
  /**
   * Turnout across the election and whether it is believable, from `turnout-trust.ts`.
   *
   * A reading, not a number: West Bengal 2026's 93.0% is a seed defect that no page may print as a fact,
   * and making it unreachable as `.pct` is what stops a hero from doing so by accident.
   */
  turnout: Turnout;
  voteSeat: VoteSeatEfficiency[];
  marginBins: MarginBin[];
  /** The flip summary and the refusal, both from `findings.ts`, both epoch-gated. */
  flips: SeatFlips | null;
  incomparableSeats: number;
  sources: SourceRef[];
  geometry: {
    /** The frame that fits the polygons actually held — the country, or one state. */
    viewBox: string;
    drawable: number;
    total: number;
    undrawableEpochs: string[];
    otherFrames: number;
    pathBytes: number;
    /** Whether the map is drawn and, if not, why. A page decides what it says and offers from this, not from `drawable`. */
    status: MapStatus;
  };
};

/** An outline for a seat's place version, and the name of the jurisdiction the seat is in. */
type OutlineRow = {
  versionId: number;
  jurisdictionName: string | null;
  path: string | null;
  viewBox: string | null;
};

/** Every election addressable on this route, newest first. */
export function electionChoices(db: DatabaseSync, limit = 60): ElectionChoice[] {
  return read(() =>
    all<ChoiceRow>(
      db,
      `SELECT e.id AS id, e.name AS name, e.year AS year, e.house AS house, e.kind AS kind,
              (SELECT COUNT(*) FROM contest c WHERE c.election_id = e.id) AS seats
         FROM election e
        WHERE 1 = 1
        ORDER BY ${CHRONO_DESC}
        LIMIT ?`,
      limit,
    ).map(choiceOf),
  );
}

/** A frame that fits these paths, with a margin, in the shared projection. */
export function frameOf(paths: readonly string[], padFraction = 0.04): string {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const d of paths) {
    const { subpaths, unsupported } = parse(d);
    if (unsupported) continue;
    for (const pts of subpaths) {
      for (const [x, y] of pts) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (!Number.isFinite(x0)) return SHARED_FRAME;
  const w = x1 - x0;
  const h = y1 - y0;
  // A margin proportional to the larger side, so a small state and the whole country both breathe equally.
  //
  // `padFraction` exists for the DISTRICT frame. 4% is right for a whole state, whose shape a reader already
  // recognises, and wrong for one district: cropping to Bangalore's own bounding box filled the viewport with
  // eight magnified polygons and no answer to "where in Karnataka is this". A district needs its surroundings
  // in frame to be located at all, so the caller asks for a wider margin and the neighbours come with it.
  const m = Math.max(w, h) * padFraction;
  return `${(x0 - m).toFixed(1)} ${(y0 - m).toFixed(1)} ${(w + 2 * m).toFixed(1)} ${(h + 2 * m).toFixed(1)}`;
}

/**
 * Everything one election's map and panels need, from one open handle.
 *
 * `electionId` is validated by MEMBERSHIP against the elections this route serves, so an id from a URL that
 * names nothing comes back as a null election rather than reaching the SQL.
 */
export function electionMapView(
  db: DatabaseSync,
  electionId: string,
  /**
   * Narrow to the seats inside one jurisdiction.
   *
   * A GENERAL ELECTION IS FOUGHT IN EVERY STATE, so "West Bengal's Lok Sabha result" is a real view of
   * `ls-2024` and not a different election: 42 of its 543 seats. Without this the state page asked for
   * ls-2024 and got the whole country — a map of India on a page titled West Bengal.
   *
   * EVERY AGGREGATE BELOW IS RECOMPUTED OVER THE SCOPED SET, which is the part that is easy to get wrong.
   * A majority is of the seats IN SCOPE (22 of West Bengal's 42, not 272 of 543), vote share is over the
   * votes cast in those contests, and the flip count compares only those seats. Scoping the map and leaving
   * the numbers national would be worse than not scoping at all.
   */
  jurisdictionId?: string,
): ElectionMapView {
  return read(() => {
    // `pv.jurisdiction_id` rather than the election's own: a general election's jurisdiction is the nation,
    // and what is being filtered is where each SEAT is.
    const scope = jurisdictionId === undefined ? "" : " AND pv.jurisdiction_id = ?";
    const scopeBind: string[] = jurisdictionId === undefined ? [] : [jurisdictionId];
    const empty: ElectionMapView = {
      election: null,
      scope: jurisdictionId ?? null,
      siblings: [],
      previous: null,
      seats: [],
      legend: [],
      ctx: null,
      majority: null,
      context: [],
      turnout: { state: "absent" },
      voteSeat: [],
      marginBins: [],
      flips: null,
      incomparableSeats: 0,
      sources: [],
      geometry: {
        viewBox: SHARED_FRAME,
        drawable: 0,
        total: 0,
        undrawableEpochs: [],
        otherFrames: 0,
        pathBytes: 0,
        status: "no-geometry",
      },
    };

    const e = get<{
      id: string;
      name: string;
      year: number;
      house: string;
      kind: string;
      jurisdictionId: string;
      jurisdictionName: string;
    }>(
      db,
      `SELECT e.id AS id, e.name AS name, e.year AS year, e.house AS house, e.kind AS kind,
              e.jurisdiction_place_id AS jurisdictionId, p.canonical_name AS jurisdictionName
         FROM election e JOIN place p ON p.id = e.jurisdiction_place_id
        -- NO KIND FILTER. This read kind IN ('general','assembly'), which refused all 829 by-elections in
        -- the registry and is why the by-election route answered 404. What a by-election needs is different
        -- SEMANTICS, carried by ElectionContext and the seat standing below -- not exclusion.
        WHERE e.id = ?`,
      electionId,
    );
    if (e === undefined) return empty;

    // The election's own semantics, decided once. Nothing below re-reads `house` or `kind`.
    const ctx = electionContext(db, electionId, jurisdictionId);

    // The seats are a seat result each, in seat order. A result does not know its polygon, so the outline is its
    // own join, keyed by the version the contest was fought under.
    const within = jurisdictionId === undefined ? {} : { within: jurisdictionId };
    const results = readSeats(db, { elections: [electionId], ...within });
    const outlines = new Map(
      all<OutlineRow>(
        db,
        `SELECT pv.id AS versionId, j.canonical_name AS jurisdictionName,
                pg.path AS path, pg.view_box AS viewBox
           FROM contest c
           JOIN place_version pv ON pv.id = c.place_version_id
           LEFT JOIN place j     ON j.id = pv.jurisdiction_id
           LEFT JOIN place_geometry pg ON pg.place_version_id = pv.id
          WHERE c.election_id = ?${scope}`,
        electionId,
        ...scopeBind,
      ).map((o) => [o.versionId, o]),
    );
    const rows = [...results].sort(
      (a, b) =>
        (a.jurisdictionId < b.jurisdictionId ? -1 : a.jurisdictionId > b.jurisdictionId ? 1 : 0) ||
        // A seat with no number sorts first, as it does in SQL.
        (a.number === b.number ? 0 : a.number === null ? -1 : b.number === null ? 1 : a.number - b.number),
    );

    /**
     * The previous election of the same house, and the seats compared with it — through the epoch gate.
     *
     * NOT FOR A BY-ELECTION. `previousElection` matches on `kind`, so a by-election's predecessor is the
     * PREVIOUS BY-ELECTION — a different handful of seats, usually in a different epoch. Comparing the two
     * marked all four of Tripura 2022's seats "not comparable", which reads as a data limitation when the
     * truth is that the comparison is not a thing: two by-elections are not two readings of one house.
     *
     * A by-election therefore produces no flips and no previous-holder comparison here. Previous holder is
     * a genuinely useful fact, but it is a SEPARATE metric about each seat's last general election, and the
     * brief is explicit that it must stay subordinate to the result rather than be smuggled in as one.
     */
    const previousId = ctx?.kind === "bypoll" ? null : previousElection(db, electionId);
    const compared = compareSeats(
      rows,
      previousId === null ? [] : readSeats(db, { elections: [previousId], ...within }),
    );

    const tied = seatTies(db);
    let otherFrames = 0;
    let pathBytes = 0;
    const undrawable = new Set<string>();
    const kept: string[] = [];

    const seats: ElectionSeat[] = compared.verdicts.map((verdict) => {
      const r = verdict.now;
      const outline = outlines.get(r.versionId);
      const outlined = outline?.path ?? null;
      // A polygon in another projection is WITHHELD, never drawn: two geometry sources need not share a
      // frame, and drawing one in the other's puts a seat somewhere it is not.
      const wrongFrame = outlined !== null && outline?.viewBox !== SHARED_FRAME;
      if (wrongFrame) otherFrames += 1;
      const usable = outlined !== null && !wrongFrame;
      if (!usable) undrawable.add(r.epochId);
      const path = usable ? simplified(outlined, NATIONAL) : null;
      if (path !== null) {
        pathBytes += path.length;
        kept.push(path);
      }

      // A seat with no declared winner belongs to no party. It used to read as one called "Unattached".
      const party = r.winner?.party ?? null;
      const partyKey = party?.key ?? null;

      // False for every by-election seat: there is no comparison event, so nothing is comparable to it.
      // True for a seat whose winner is undeclared on either side: its boundary did not move, it only has no
      // flip to report.
      const comparable = ctx?.kind !== "bypoll" && verdict.kind !== "incomparable";

      return {
        placeId: r.placeId,
        versionId: r.versionId,
        epochId: r.epochId,
        contestId: r.contestId,
        name: r.name,
        number: r.number,
        reservation: r.reservation,
        jurisdictionId: r.jurisdictionId,
        jurisdictionName: outline?.jurisdictionName ?? null,
        districtId: r.districtId,
        districtName: r.districtName,
        partyKey,
        partyLabel: party?.label ?? null,
        winnerName: r.winner?.name ?? null,
        votes: r.winner?.votes ?? null,
        runnerUpKey: r.runnerUp?.party.key ?? null,
        runnerUpLabel: r.runnerUp?.party.label ?? null,
        runnerUpName: r.runnerUp?.name ?? null,
        runnerUpVotes: r.runnerUp?.votes ?? null,
        marginVotes: r.margin?.votes ?? null,
        marginBasis: r.margin?.basis ?? null,
        marginPct: r.marginShare,
        marginBin: binOf(r.marginShare),
        turnout: r.turnout,
        /**
         * Order matters, and it is an order of KNOWABILITY. A seat we cannot draw is undrawable whatever
         * else is true of it; a seat we cannot compare has a winner but no predecessor; and only then does
         * the hold/gain distinction apply. `not-contested` cannot occur here — every row is a contest.
         */
        standing:
          path === null
            ? "no-geometry"
            // A by-election is not compared with anything, so every seat it contested is simply won.
            : ctx?.kind === "bypoll"
              ? "won-by"
              : !comparable
              ? "not-comparable"
              : verdict.kind === "held"
                ? "held"
                : "won-by",
        comparable,
        flip:
          verdict.kind === "held" || verdict.kind === "flipped"
            ? { from: verdict.from, changed: verdict.kind === "flipped" }
            : null,
        path,
        /**
         * THE CONSTITUENCY'S OWN PAGE — and this link used to go nowhere useful at all.
         *
         * It was `/pl/${jurisdictionId}?seat=${slug(name)}`, which did two wrong things at once. It never
         * left the state page, so INDIA -> STATE -> DISTRICT -> SEAT was severed at the last hop and no
         * surface in the product linked to a constituency any more. And the parameter did not even work as
         * a focus: the page compares `?seat=` against a `placeId`, never against a name slug, so clicking a
         * seat on the map or in the list set a value that matched nothing and highlighted nothing.
         *
         * Through `seatHref`, so this is the SAME url the district page and the breadcrumb build.
         * Inventing a second convention for the same destination is how a link 404s while its own test passes.
         *
         * A PARLIAMENTARY SEAT HAS A PAGE NOW, so this no longer branches on whether a district exists.
         * It did: place pages were `pv.kind = 'ac'` and a pc carries no district, so every one of Lok Sabha
         * 2024's 543 seats linked to its state instead of to itself. The canonical constituency URL takes the
         * JURISDICTION and the name, which is what both bodies have, and the registry id where two seats of one
         * state and body share the name.
         */
        // THE ELECTION'S BODY DECIDES, never the seat's name. A Lok Sabha election contests pc seats
        // and an assembly election contests ac seats, so the link builder is told rather than guessing.
        href: seatHref(tied, {
          versionId: r.versionId,
          placeId: r.placeId,
          stateId: r.jurisdictionId,
          kind: e.house,
          name: r.name,
        }),
      };
    });

    /**
     * ── THE HOUSE THAT DID NOT VOTE ──
     *
     * Only for a partial election, which today means a by-election. The other seats of the same body,
     * jurisdiction and boundary epoch, as geometry and nothing else: no party, no result, no hover card,
     * because they have none. Four contested seats floating in an empty frame was the figure before this,
     * and a reader completed the picture by assuming the emptiness meant something.
     *
     * From `place_version` rather than from another election's contests: the house is a property of the
     * geography, so this needs no second election to exist and works for a jurisdiction whose general
     * election is not in the registry.
     */
    const contextShapes: ElectionMapView["context"] =
      ctx === null || !ctx.isPartial
        ? []
        : (() => {
            const taken = new Set(rows.map((r) => r.versionId));
            return all<{ versionId: number; name: string; path: string }>(
              db,
              `SELECT pv.id AS versionId, pv.canonical_name AS name, pg.path AS path
                 FROM place_version pv
                 JOIN place_geometry pg ON pg.place_version_id = pv.id
                WHERE pv.kind = ? AND pv.jurisdiction_id = ? AND pv.epoch_id IS ?`,
              e.house,
              ctx.scope ?? ctx.jurisdictionId,
              ctx.epochId,
            )
              .filter((x) => !taken.has(x.versionId))
              .map((x) => ({ versionId: x.versionId, name: x.name, path: simplified(x.path, NATIONAL) }));
          })();

    /* ── party aggregates: seats, votes, and the gap between the two shares ── */

    const won = tally(results);
    const legend = won.map((p) => ({ key: p.key, label: p.label, n: p.seats }));
    const seatsWon = new Map(won.map((p) => [p.key, p.seats]));

    // Votes per party across the whole election. Its own read: a seat result holds the winner and the
    // runner-up, and a party's vote share is over every candidate it ran, not just the ones who won.
    const voted = votesByParty(partyVotes(db, { elections: [electionId], ...within }));
    const totalVotes = voted.reduce((t, r) => t + (r.votes ?? 0), 0);
    const contested = seats.length;
    const voteSeat: VoteSeatEfficiency[] = voted
      .map((r) => {
        const seatCount = seatsWon.get(r.party.key) ?? 0;
        const votePct = totalVotes > 0 && r.votes !== null ? (100 * r.votes) / totalVotes : null;
        const seatPct = contested > 0 ? (100 * seatCount) / contested : 0;
        return {
          type: "vote_seat_efficiency" as const,
          party: { key: r.party.key, label: r.party.label },
          votePct,
          seatPct,
          deltaPp: votePct === null ? null : seatPct - votePct,
          seats: seatCount,
          contested,
          seatsPerPoint: votePct === null || votePct === 0 ? null : seatCount / votePct,
        };
      })
      // A party with no seats AND no measurable share is noise on a scatter plot.
      .filter((r) => r.seats > 0 || (r.votePct ?? 0) >= 1)
      .sort((a, b) => (b.votePct ?? 0) - (a.votePct ?? 0));

    /* ── the margin distribution ── */

    const binCounts = new Map<number, number>();
    for (const s of seats) {
      if (s.marginBin === null) continue;
      binCounts.set(s.marginBin, (binCounts.get(s.marginBin) ?? 0) + 1);
    }
    const marginBins: MarginBin[] = [];
    for (let lo = 0; lo < BIN_MAX; lo += BIN_WIDTH) {
      marginBins.push({ lo, hi: lo + BIN_WIDTH, n: binCounts.get(lo) ?? 0, overflow: false });
    }
    marginBins.push({ lo: BIN_MAX, hi: null, n: binCounts.get(BIN_MAX) ?? 0, overflow: true });

    /* ── flips, from the gated comparison ── */

    const previousYear =
      previousId === null
        ? null
        : (get<{ y: number }>(db, `SELECT year AS y FROM election WHERE id = ?`, previousId)?.y ?? null);

    const flips: SeatFlips | null =
      compared.comparable === 0
        ? null
        : {
            type: "seat_flips",
            flipped: compared.flipped.length,
            held: compared.held.length,
            comparable: compared.comparable,
            pairs: compared.matrix,
            previousYear,
            year: e.year,
          };

    /* ── provenance: the sources of the results read and of the outlines drawn ── */

    const sources = sourcesFor(db, { elections: [electionId], ...within }, { geometry: true });

    /**
     * WHETHER SEATS WITH NO OUTLINE WERE REDRAWN, asked only when no seat has one.
     *
     * The newest epoch in which this house's seats have an outline, in the jurisdictions these seats lie in, against the
     * oldest epoch the seats are under: redrawn only if the first is strictly the earlier. Registry-wide would blame a
     * redraw on West Bengal because Karnataka has an older outline; a district's outline is not a constituency's, and
     * `gv.kind` leaves it out. Epochs are compared by `effective_from`, as `place-resolve.ts` ranks them. With no outline
     * at all `held` is null and nothing was redrawn.
     */
    const redrawn = (): boolean => {
      const span = get<{ held: string | null; seated: string | null }>(
        db,
        `SELECT (SELECT MAX(be.effective_from)
                   FROM place_version gv
                   JOIN place_geometry pg ON pg.place_version_id = gv.id
                   JOIN boundary_epoch be ON be.id = gv.epoch_id
                  WHERE gv.kind = ?
                    AND gv.jurisdiction_id IN (SELECT pv.jurisdiction_id
                                                 FROM contest c JOIN place_version pv ON pv.id = c.place_version_id
                                                WHERE c.election_id = ?${scope})) AS held,
                (SELECT MIN(be.effective_from)
                   FROM contest c
                   JOIN place_version pv ON pv.id = c.place_version_id
                   JOIN boundary_epoch be ON be.id = pv.epoch_id
                  WHERE c.election_id = ?${scope}) AS seated`,
        e.house,
        electionId,
        ...scopeBind,
        electionId,
        ...scopeBind,
      );
      return span !== undefined && span.held !== null && span.seated !== null && span.held < span.seated;
    };

    const siblings = all<ChoiceRow>(
      db,
      `SELECT e.id AS id, e.name AS name, e.year AS year, e.house AS house, e.kind AS kind,
              (SELECT COUNT(*) FROM contest c WHERE c.election_id = e.id) AS seats
         FROM election e
        WHERE e.jurisdiction_place_id = ? AND e.house = ? AND e.kind = ?
        ORDER BY ${CHRONO_DESC}`,
      e.jurisdictionId,
      e.house,
      e.kind,
    ).map(choiceOf);

    return {
      scope: jurisdictionId ?? null,
      election: {
        ...choiceOf({ id: e.id, name: e.name, year: e.year, house: e.house, kind: e.kind, seats: seats.length }),
        jurisdictionId: e.jurisdictionId,
        jurisdictionName: e.jurisdictionName,
      },
      siblings,
      previous: previousId === null || previousYear === null ? null : { id: previousId, year: previousYear },
      seats,
      legend,
      ctx,
      // FROM THE CONTEXT, not from `seats.length`. Half the seats contested is a majority only when the
      // contest count IS the house — which is exactly what a by-election is not.
      majority: ctx?.majority ?? null,
      context: contextShapes,
      turnout: turnoutOf(results),
      voteSeat,
      marginBins,
      flips,
      // ZERO FOR A BY-ELECTION, not "all of them". With no comparison event every seat lands in the
      // incomparable pile by construction, and the caption then blamed a delimitation for the absence of a
      // comparison that was never possible. Nothing was redrawn; there is simply nothing to compare to.
      // Only a seat with no counterpart under the same boundary is counted: one whose winner is undeclared on
      // either side is unknown, not redrawn.
      incomparableSeats: ctx?.kind === "bypoll" ? 0 : compared.incomparable.length,
      sources,
      geometry: {
        /**
         * THE FRAME INCLUDES THE SEATS THAT DID NOT VOTE.
         *
         * Framing a by-election to its own four polygons is what produced the floating fragment: a viewBox
         * around four seats, rendered at full height, showing four shapes and no state. The frame is the
         * geography being shown, and for a partial election that is the house — so the context shapes are
         * in the box even though they carry no result. Empty for a general election, so unchanged there.
         */
        viewBox: frameOf([...kept, ...contextShapes.map((c) => c.path)]),
        drawable: kept.length,
        total: seats.length,
        undrawableEpochs: [...undrawable].sort(),
        otherFrames,
        pathBytes,
        status: kept.length > 0 ? "drawn" : seats.length > 0 && redrawn() ? "redrawn" : "no-geometry",
      },
    };
  });
}


/* ───────────────────── competitiveness bands, and districts as groupings ───────────────────── */

/**
 * Named margin bands, for SELECTING rather than for comparing area.
 *
 * The 2-point histogram bins show the distribution's SHAPE and are uniform because area in a histogram is
 * read whether the axis invites it or not. These are a different instrument: a filter with five rungs a
 * reader already thinks in — under a point, a point or two, up to five, up to ten, and safe. They are
 * deliberately NOT uniform, which is exactly why they are drawn as a segmented bar of counts and never as
 * a histogram: the width of a segment here encodes how many seats fall in it, not how wide the band is.
 */
export const MARGIN_BANDS: readonly { key: string; label: string; lo: number; hi: number | null }[] = [
  { key: "under1", label: "under 1%", lo: 0, hi: 1 },
  { key: "1to2", label: "1–2%", lo: 1, hi: 2 },
  { key: "2to5", label: "2–5%", lo: 2, hi: 5 },
  { key: "5to10", label: "5–10%", lo: 5, hi: 10 },
  { key: "over10", label: "10% and safer", lo: 10, hi: null },
];

export function bandOf(marginPct: number | null): string | null {
  if (marginPct === null) return null;
  for (const b of MARGIN_BANDS) {
    if (marginPct >= b.lo && (b.hi === null || marginPct < b.hi)) return b.key;
  }
  return null;
}

export type BandCount = { key: string; label: string; n: number };

export function marginBandCounts(seats: readonly ElectionSeat[]): BandCount[] {
  const counts = new Map<string, number>();
  for (const s of seats) {
    const k = bandOf(s.marginPct);
    if (k !== null) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return MARGIN_BANDS.map((b) => ({ key: b.key, label: b.label, n: counts.get(b.key) ?? 0 }));
}

/**
 * A district, as the set of seats inside it.
 *
 * Note what is absent, and it is the same absence the state map's district tally carried before this replaced it:
 * there is no `winner` field. A district elects nobody. `parties` is plural because the honest
 * sentence is "12 of 18 constituencies went to INC".
 */
export type DistrictGroup = {
  id: string;
  name: string;
  seats: number;
  parties: { key: string; label: string; n: number }[];
};

export function districtGroups(seats: readonly ElectionSeat[]): DistrictGroup[] {
  const byId = new Map<string, { id: string; name: string; rows: ElectionSeat[] }>();
  for (const s of seats) {
    if (s.districtId === null) continue;
    const at = byId.get(s.districtId) ?? {
      id: s.districtId,
      name: s.districtName ?? s.districtId,
      rows: [],
    };
    at.rows.push(s);
    byId.set(s.districtId, at);
  }
  return [...byId.values()]
    .map((d) => ({ id: d.id, name: d.name, seats: d.rows.length, parties: tallySeats(d.rows, "winner") }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The findings a header can state without re-deriving anything. */
export function headlineFindings(v: ElectionMapView): Finding[] {
  const out: Finding[] = [];
  const top = v.legend[0];
  // A MAJORITY FINDING IS A CLAIM ABOUT A HOUSE, so a by-election makes none. Skipped rather than emitted
  // with a fabricated threshold: the previous arithmetic gave a four-seat by-election "majority 3", and a
  // finding that says a party "holds a majority" of four vacant seats is false in a way prose cannot fix.
  if (top !== undefined && v.majority !== null) {
    const needed = v.majority;
    out.push({
      type: "majority",
      party: { key: top.key, label: top.label },
      seats: top.n,
      contested: v.seats.length,
      needed,
      holds: top.n >= needed,
    });
  }
  if (v.flips !== null) out.push(v.flips);
  if (v.incomparableSeats > 0) {
    out.push({
      type: "seats_incomparable",
      count: v.incomparableSeats,
      previousYear: v.previous?.year ?? null,
      previousEpochId: null,
      epochId: null,
    });
  }
  return out;
}

/** How wide the widest bar is, so a histogram can scale without the component doing arithmetic. */
export function peakBin(bins: readonly MarginBin[]): number {
  return bins.reduce((m, b) => (b.n > m ? b.n : m), 0);
}

/**
 * What an election's map can be narrowed to: the `Choices` its page hands `readSelection`.
 *
 * A party is selectable if it won a seat, has a row in the vote-to-seat plot, or came second in a seat. The runner-up
 * parties are here because the runner-up legend lists every one of them, and one that only ever came second is in
 * neither of the other two (the plot leaves out a party with no seat and under 1% of the vote), so its link led nowhere.
 * The margin is judged in two-point bins, every bin the distribution holds, and flips is a mode only where a previous
 * election can be compared. Bands, districts and seats are the state page's (`stateChoicesOf`), and are not offered.
 */
export function choicesOf(v: {
  legend: readonly { key: string }[];
  voteSeat: readonly { party: { key: string } }[];
  seats: readonly { runnerUpKey: string | null; path?: string | null }[];
  marginBins: readonly { lo: number }[];
  flips: unknown;
}): Choices {
  return { parties: partiesOf(v), bins: v.marginBins.map((b) => b.lo), flips: v.flips !== null, tiles: canTile(v.seats) };
}

/** The most seats a tile view is offered for: the biggest house in India has 543, and past a thousand a tile is a speck. */
const MOST_TILES = 1000;

/**
 * Tiles are placed by where the seats are, so they need at least two outlines (one tile locates nothing), and they are for a house
 * one can read: the layout compares seats in pairs, which is instant at the Lok Sabha's 543 and slow at several thousand.
 */
export function canTile(seats: readonly { path?: string | null }[]): boolean {
  const drawn = seats.filter((s) => s.path !== null && s.path !== undefined).length;
  return drawn >= 2 && drawn <= MOST_TILES;
}

function partiesOf(v: {
  legend: readonly { key: string }[];
  voteSeat: readonly { party: { key: string } }[];
  seats: readonly { runnerUpKey: string | null }[];
}): Set<string> {
  const parties = new Set([...v.legend.map((l) => l.key), ...v.voteSeat.map((r) => r.party.key)]);
  for (const s of v.seats) if (s.runnerUpKey !== null) parties.add(s.runnerUpKey);
  return parties;
}

/**
 * What a state's map can be narrowed to: the same parties and the same rule for flips, but the margin is judged in the
 * five named bands (D19: the two vocabularies stay), and a district or a seat of the election can be focused. A district
 * is offered only if a seat lies in it, which is the districts the map's own list of them holds.
 */
export function stateChoicesOf(v: {
  legend: readonly { key: string }[];
  voteSeat: readonly { party: { key: string } }[];
  seats: readonly { runnerUpKey: string | null; districtId: string | null; placeId: string; path?: string | null }[];
  flips: unknown;
}): Choices {
  const districts = new Set<string>();
  for (const s of v.seats) if (s.districtId !== null) districts.add(s.districtId);
  return {
    parties: partiesOf(v),
    bands: MARGIN_BANDS,
    districts,
    seats: new Set(v.seats.map((s) => s.placeId)),
    flips: v.flips !== null,
    tiles: canTile(v.seats),
  };
}

// The map. 294 constituency outlines, one SVG, no client JS.
//
// The outlines have been in data/seed/ since the first commit and migration 008 finally stored them.
// This is the read side: one query joining geometry to the latest result, and a choropleth.
//
// Colour follows the dataviz rules rather than taste. Two modes, because they are different jobs:
//   · `party`  — CATEGORICAL. Identity, so a fixed hue order capped at three, everything else neutral,
//                and the party name carries identity in the legend so colour is never the only channel.
//   · `margin` — SEQUENTIAL. Magnitude, so ONE hue light-to-dark. Never a rainbow, never two hues.
// There is deliberately no diverging mode: a margin has no meaningful zero to diverge around, and a
// two-hue scale would imply one.

import type { DatabaseSync } from "node:sqlite";
import { all } from "../db/index.ts";
import { read } from "./index.ts";
import { escapeXml } from "../viz/marks.ts";

export type MapMode = "party" | "margin" | "turnout";

export type Seat = {
  placeId: string;
  name: string;
  district: string | null;
  number: number | null;
  path: string;
  centroidX: number;
  centroidY: number;
  winnerParty: string | null;
  winnerName: string | null;
  marginPct: number | null;
  turnoutPct: number | null;
  href: string;
};

export type Swatch = { label: string; fill: string; note?: string };

export type MapView = {
  mode: MapMode;
  year: number;
  viewBox: string;
  seats: Seat[];
  /** Always present, because identity must never be colour alone. */
  legend: Swatch[];
  finding: string;
  /** Seats the mode cannot colour, stated rather than rendered as if they were zero. */
  unknown: number;
};

/**
 * The ink ramp from §24, light to dark. Used for magnitude only. Five steps because a reader cannot
 * hold more than about five in their head against a legend, and a continuous ramp would need a
 * colourbar this page has no room for.
 */
const SEQUENTIAL = ["#2a2140", "#432f6b", "#5d3f99", "#7a5bc4", "#a98bf2"] as const;

/**
 * Categorical hues in FIXED order, capped at three. The fourth party and beyond is neutral: a fourth
 * hue would not clear the CVD separation floor against these three on this surface, and a generated
 * hue for "party 9" is exactly the anti-pattern the palette rules forbid. Ranked by seats won, so the
 * cap falls on the parties with fewest seats.
 */
const CATEGORICAL = ["#a98bf2", "#5ec8c8", "#e0a458"] as const;
const NEUTRAL = "#4a4459";
const NO_DATA = "#221e2e";

type Row = {
  place_id: string;
  name: string;
  district: string | null;
  state_id: string | null;
  number: number | null;
  path: string;
  cx: number;
  cy: number;
  view_box: string;
  party: string | null;
  winner: string | null;
  margin: number | null;
  voters: number | null;
  electors: number | null;
};

const slug = (s: string): string =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * Every constituency with a shape, its latest result, and its turnout.
 *
 * Scoped to `e.kind = 'assembly'`: a parliamentary contest covers several of these seats, so mixing the
 * two would paint an assembly outline with a Lok Sabha winner. The same cross-kind mistake reported
 * "BJP +180" on the Situation Room before it was scoped.
 */
export function getMap(db: DatabaseSync, mode: MapMode): MapView | null {
  return read(() => {
    const rows = all<Row>(
      db,
      `WITH latest AS (
         SELECT place_id, election_id FROM (
           SELECT pv.place_id AS place_id, c.election_id AS election_id,
                  row_number() OVER (PARTITION BY pv.place_id
                                     ORDER BY substr(c.election_id, -4) DESC, c.election_id DESC) AS rn
             FROM contest c
             JOIN election e       ON e.id = c.election_id AND e.kind = 'assembly'
             JOIN place_version pv ON pv.id = c.place_version_id)
          WHERE rn = 1
       )
       SELECT p.id                AS place_id,
              pv.canonical_name   AS name,
              d.canonical_name    AS district,
              d.parent_id         AS state_id,
              pv.number           AS number,
              g.path              AS path,
              g.centroid_x        AS cx,
              g.centroid_y        AS cy,
              g.view_box          AS view_box,
              pt.id               AS party,
              per.canonical_name  AS winner,
              r.margin            AS margin,
              t.voters            AS voters,
              t.electors          AS electors
         FROM place_geometry g
         JOIN place_version pv ON pv.id = g.place_version_id
         JOIN place p          ON p.id = pv.place_id AND p.kind = 'ac'
         LEFT JOIN place d     ON d.id = COALESCE(pv.district_place_id, p.parent_id)
         LEFT JOIN latest l    ON l.place_id = p.id
         LEFT JOIN contest c   ON c.election_id = l.election_id AND c.place_version_id = pv.id
         LEFT JOIN result r    ON r.contest_id = c.id AND r.is_winner = 1 AND r.revision = 0
         LEFT JOIN candidacy ca ON ca.id = r.candidacy_id
         LEFT JOIN person per  ON per.id = ca.person_id
         LEFT JOIN party_version pver ON pver.id = ca.party_version_id
         LEFT JOIN party pt    ON pt.id = pver.party_id
         LEFT JOIN turnout t   ON t.contest_id = c.id AND t.scope = 'contest'
        ORDER BY pv.number`,
    );
    if (rows.length === 0) return null;

    const year = Math.max(
      ...all<{ y: string }>(
        db,
        `SELECT id AS y FROM election WHERE kind = 'assembly'
          ORDER BY substr(id, -4) DESC, id DESC LIMIT 1`,
      ).map((r) => Number(/(\d{4})/.exec(r.y)?.[1] ?? 0)),
    );

    const seats: Seat[] = rows.map((r) => {
      const marginPct =
        r.margin === null || r.voters === null || r.voters <= 0 ? null : (r.margin / r.voters) * 100;
      const turnoutPct =
        r.voters === null || r.electors === null || r.electors <= 0
          ? null
          : (r.voters / r.electors) * 100;
      const stateSeg = r.state_id ?? "";
      return {
        placeId: r.place_id,
        name: r.name,
        district: r.district,
        number: r.number,
        path: r.path,
        centroidX: r.cx,
        centroidY: r.cy,
        winnerParty: r.party,
        winnerName: r.winner,
        marginPct,
        turnoutPct,
        href:
          r.district === null || stateSeg === ""
            ? "/pl/wb"
            : `/pl/${stateSeg}/${slug(r.district)}/${slug(r.name)}`,
      };
    });

    const viewBox = rows[0]?.view_box ?? "0 0 400 580";
    return { mode, year, viewBox, seats, ...paint(seats, mode) };
  });
}

/** Fill per seat plus the legend that explains it. Kept beside the ramps so the two cannot disagree. */
function paint(
  seats: readonly Seat[],
  mode: MapMode,
): { legend: Swatch[]; finding: string; unknown: number } {
  if (mode === "party") {
    const bySeats = new Map<string, number>();
    for (const s of seats) {
      if (s.winnerParty === null) continue;
      bySeats.set(s.winnerParty, (bySeats.get(s.winnerParty) ?? 0) + 1);
    }
    const ranked = [...bySeats.entries()].sort((a, b) => b[1] - a[1]);
    const top = ranked.slice(0, CATEGORICAL.length);
    const rest = ranked.slice(CATEGORICAL.length);
    const legend: Swatch[] = top.map(([id, n], i) => ({
      label: `${id} · ${n}`,
      fill: CATEGORICAL[i] ?? NEUTRAL,
    }));
    if (rest.length > 0) {
      legend.push({
        label: `Other · ${rest.reduce((n, [, c]) => n + c, 0)}`,
        fill: NEUTRAL,
        note: `${rest.length} parties, capped rather than given generated hues`,
      });
    }
    const unknown = seats.filter((s) => s.winnerParty === null).length;
    if (unknown > 0) legend.push({ label: `Not reported · ${unknown}`, fill: NO_DATA });
    const lead = top[0];
    return {
      legend,
      finding:
        lead === undefined
          ? "No winner is recorded for any seat."
          : `${lead[0]} holds ${lead[1]} of ${seats.length} seats.`,
      unknown,
    };
  }

  const value = (s: Seat): number | null => (mode === "margin" ? s.marginPct : s.turnoutPct);
  const known = seats.map(value).filter((v): v is number => v !== null);
  const unknown = seats.length - known.length;
  if (known.length === 0) {
    return { legend: [{ label: "Not reported", fill: NO_DATA }], finding: "Nothing to draw.", unknown };
  }
  const lo = Math.min(...known);
  const hi = Math.max(...known);
  const step = (hi - lo) / SEQUENTIAL.length;
  const unit = mode === "margin" ? "pp" : "%";
  const legend: Swatch[] = SEQUENTIAL.map((fill, i) => ({
    label: `${(lo + step * i).toFixed(1)}–${(lo + step * (i + 1)).toFixed(1)}${unit}`,
    fill,
  }));
  if (unknown > 0) legend.push({ label: `Not reported · ${unknown}`, fill: NO_DATA });
  return {
    legend,
    finding:
      mode === "margin"
        ? `Margins run from ${lo.toFixed(2)}${unit} to ${hi.toFixed(1)}${unit}.`
        : `Turnout runs from ${lo.toFixed(1)}${unit} to ${hi.toFixed(1)}${unit}.`,
    unknown,
  };
}

/** The fill for one seat, using the same ramps and the same ranking the legend was built from. */
export function fillFor(view: MapView, seat: Seat): string {
  if (view.mode === "party") {
    if (seat.winnerParty === null) return NO_DATA;
    const idx = view.legend.findIndex((l) => l.label.startsWith(`${seat.winnerParty} ·`));
    return idx >= 0 && idx < CATEGORICAL.length ? (CATEGORICAL[idx] ?? NEUTRAL) : NEUTRAL;
  }
  const v = view.mode === "margin" ? seat.marginPct : seat.turnoutPct;
  if (v === null) return NO_DATA;
  const known = view.seats
    .map((s) => (view.mode === "margin" ? s.marginPct : s.turnoutPct))
    .filter((x): x is number => x !== null);
  const lo = Math.min(...known);
  const hi = Math.max(...known);
  if (hi === lo) return SEQUENTIAL[SEQUENTIAL.length - 1] ?? NEUTRAL;
  const i = Math.min(SEQUENTIAL.length - 1, Math.floor(((v - lo) / (hi - lo)) * SEQUENTIAL.length));
  return SEQUENTIAL[i] ?? NEUTRAL;
}

/** Accessible name for one shape. Read out instead of the colour, which a screen reader cannot see. */
export function seatTitle(view: MapView, s: Seat): string {
  const bits = [s.name];
  if (s.district !== null) bits.push(s.district);
  if (view.mode === "party") bits.push(s.winnerParty === null ? "winner not reported" : s.winnerParty);
  else if (view.mode === "margin")
    bits.push(s.marginPct === null ? "margin not reported" : `${s.marginPct.toFixed(2)}pp margin`);
  else bits.push(s.turnoutPct === null ? "turnout not reported" : `${s.turnoutPct.toFixed(1)}% turnout`);
  return escapeXml(bits.join(", "));
}

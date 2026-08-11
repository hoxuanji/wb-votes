// The national front page's data contract. Every figure it prints is computed here, at request time.
//
// WHAT THIS MODULE IS FOR. `/` has to answer, in about ten seconds: who governs India, what is coming,
// what just happened, where the fights are, and how much of it we actually hold. Those are five different
// questions over one registry, and the temptation is to answer each with its own query in its own
// component. This module is the alternative: one pass over the spine every section shares, then a small
// pure function per section. No SQL reaches a React component, and no component knows a state's name.
//
// THREE RULES IT ENFORCES, all of them learned upstream in this codebase:
//
//  1. NOTHING IS INVENTED. A figure the source did not publish is `null` and renders as an absence, never
//     as a 0. A date nobody announced is marked DERIVED at the point of use. A layer with nothing behind
//     it reports itself unavailable rather than shading a country in a colour that means nothing.
//  2. CHRONOLOGY COMES FROM COLUMNS. Every ranking binds `CHRONO_DESC`. An election id sorts by the middle
//     of the string, which is how "the current state of play" for by-elections became a 2016 result.
//  3. THE SEAT COUNTS ARE REFERENCE DATA, NOT LITERALS. 543 and 4,123 come from `india.ts`, which changes
//     when Parliament passes a reorganisation act. There is no list of states in this file, and there must
//     never be one: importing Kerala's next assembly makes it appear on the front page with no code change.

import type { DatabaseSync } from "node:sqlite";
import { all, get } from "../db/index.ts";
import { loadSources, read, type SourceRef } from "./index.ts";
import {
  CHRONO_DESC,
  closeFights,
  currentStandings,
  foldStandings,
  latestPerJurisdiction,
  previousElection,
  recent,
  seatsByParty,
  seatsWonBy,
  type CloseFight,
  type Dated,
  type LatestElection,
  type PartyStanding,
  type SeatsByParty,
  type SeatsWon,
  type Standing,
  type SwingRow,
} from "./elections.ts";
import { INDIA, jurisdictions, type JurisdictionState } from "./coverage.ts";
import { INDIA_TOTALS, JURISDICTIONS } from "../ingest/india.ts";

/* ────────────────────────────── palette ──────────────────────────────
   Three identity hues, one neutral, computed rather than chosen.

   The map is a choropleth of 36 polygons that all touch each other, so adjacency is unknown and the
   separation test is ALL PAIRS, not neighbours-in-a-legend. These four were found by searching OKLCH at
   restrained chroma (≤0.14) and lightness (0.56–0.80) for the set whose worst-case OKLab ΔE across
   normal, protan, deutan and tritan vision is largest. That worst case is 14.8 — above the ≥8 target and
   above the 15-point normal-vision floor on every pair but one, which is why the figure is asserted in
   home.test.ts rather than described here. Every hue also clears 3:1 against the panel.

   Lightness varies on purpose. A dichromat loses one chromatic axis, so hue alone cannot separate a set
   under both deuteranopia and tritanopia; the project's own three-hue cap (viz/palette.ts) is what
   happens when only hue is allowed to vary.

   Slots are handed out by RANK — jurisdictions governed — not by a party lookup table. A table mapping
   BJP to saffron would be a hardcoded list of parties and would also read as campaign livery; ranking
   means the country's largest governing party takes slot 1 whoever that turns out to be. */
export const PARTY_HUES = ["#cd702f", "#6fa4fc", "#e1a6a2"] as const;

/** The fold target: a party that leads exactly one jurisdiction. Chroma-poor because it is not an
 *  identity — thirteen different parties share it, and that fact is the category. */
export const REGIONAL_HUE = "#7b7490";

/** No election of this kind is loaded here. Never a fill that could be mistaken for a result. */
export const NO_DATA_HUE = "#1d1b26";

/** The single hue every magnitude layer ramps along, light to dark. One hue, never a rainbow. */
export const SEQUENTIAL = ["#241d38", "#3a2c5c", "#523d80", "#6e54a8", "#8f74cf", "#b39ae8"] as const;

export type Swatch = { label: string; fill: string; note?: string };

/**
 * Party colour for the WHOLE PAGE, assigned once so a party wears one hue in the map, the table and the
 * party landscape alike. Ranked by jurisdictions governed, then by name so the order is deterministic
 * when two parties govern the same number.
 */
export type PartyInk = {
  /** party key -> hue, for the parties that earned a slot. Plain data rather than a closure: a view model
   *  holding a function cannot cross a cache, an API boundary or a server/client boundary, and this one
   *  will eventually have to do all three. `hueOf` applies it. */
  hues: Record<string, string>;
  legend: Swatch[];
  /** Parties that lead exactly one jurisdiction — the neutral's constituency, counted. */
  regional: number;
};

/** The hue a party wears, with the two fold cases named rather than implied. */
export function hueOf(ink: PartyInk, partyKey: string | null): string {
  if (partyKey === null) return NO_DATA_HUE;
  return ink.hues[partyKey] ?? REGIONAL_HUE;
}

export function partyInk(standings: readonly Standing[]): PartyInk {
  const govern = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const s of standings) {
    if (s.leaderKey === null) continue;
    govern.set(s.leaderKey, (govern.get(s.leaderKey) ?? 0) + 1);
    labels.set(s.leaderKey, s.leaderLabel ?? s.leaderKey);
  }
  const ranked = [...govern].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const named = ranked.filter(([, n]) => n > 1).slice(0, PARTY_HUES.length);
  const assigned = new Map(named.map(([k], i) => [k, PARTY_HUES[i] as string]));
  const regional = ranked.filter(([k]) => !assigned.has(k)).length;
  return {
    hues: Object.fromEntries(assigned),
    legend: [
      ...named.map(([k, n]) => ({
        label: labels.get(k) ?? k,
        fill: assigned.get(k) as string,
        note: `${n} jurisdictions`,
      })),
      ...(regional > 0
        ? [{ label: "Leads one only", fill: REGIONAL_HUE, note: `${regional} parties` }]
        : []),
    ],
    regional,
  };
}

/* ────────────────────────────── the national snapshot ────────────────────────────── */

export type Snapshot = {
  /** Reference totals: what India has, against what the registry holds. */
  jurisdictionsTotal: number;
  jurisdictionsWithResults: number;
  assemblySeatsTotal: number;
  assemblySeatsHeld: number;
  lokSabhaSeatsTotal: number;
  lokSabhaSeatsHeld: number;
  /** Elections on record, and how far back they reach. */
  elections: number;
  earliestYear: number | null;
  /** The newest election held, of any kind. */
  latest: Dated | null;
  /** Distinct parties leading a jurisdiction's most recent assembly. */
  governingParties: number;
  /** Terms derived to expire this year or next — DERIVED, and labelled that way wherever shown. */
  dueSoon: number;
  /** True only while an election's own lifecycle says it is running. Nothing is live today, and the
   *  indicator is absent rather than decorative. */
  live: boolean;
};

export function snapshot(
  db: DatabaseSync,
  standings: readonly Standing[],
  states: readonly JurisdictionState[],
  houseStandings: readonly Standing[],
  latest: Dated | null,
  thisYear: number,
): Snapshot {
  return read(() => {
    const n = (sql: string): number => Number(get<{ n: number }>(db, sql)?.n ?? 0);
    const seatsHeld = (house: string): number =>
      Number(
        get<{ n: number }>(
          db,
          // Seats in the NEWEST election of this house per jurisdiction — the only denominator that
          // compares with today's India. Every place row would exceed 100%: undivided Bihar's 324
          // assembly seats are real, just not current.
          `SELECT COUNT(DISTINCT c.place_version_id) AS n
             FROM contest c
            WHERE c.election_id IN (
              SELECT id FROM (
                SELECT e.id AS id,
                       row_number() OVER (PARTITION BY e.jurisdiction_place_id ORDER BY ${CHRONO_DESC}) AS rn
                  FROM election e WHERE e.house = ? AND e.kind <> 'bypoll'
              ) WHERE rn = 1)`,
          house,
        )?.n ?? 0,
      );
    return {
      jurisdictionsTotal: INDIA.states,
      // Counted from the elections themselves, not from `hasData`. The two disagree, and the one that
      // matters here is "we can show you a result": a jurisdiction the map lights has a standing, so the
      // strip must count standings or it contradicts the picture beside it.
      jurisdictionsWithResults: new Set([
        ...standings.map((s) => s.jurisdictionId),
        ...houseStandings.map((s) => s.jurisdictionId),
      ]).size,
      assemblySeatsTotal: INDIA.assemblySeats,
      assemblySeatsHeld: seatsHeld("ac"),
      lokSabhaSeatsTotal: INDIA.lokSabhaSeats,
      lokSabhaSeatsHeld: seatsHeld("pc"),
      elections: n("SELECT COUNT(*) AS n FROM election"),
      earliestYear: get<{ y: number }>(db, "SELECT MIN(year) AS y FROM election")?.y ?? null,
      latest,
      governingParties: new Set(standings.map((s) => s.leaderKey).filter((k) => k !== null)).size,
      dueSoon: standings.filter((s) => s.year + 5 >= thisYear && s.year + 5 <= thisYear + 1).length,
      live: n("SELECT COUNT(*) AS n FROM election WHERE lifecycle IN ('polling', 'counting')") > 0,
    };
  });
}

/* ────────────────────────────── map layers ────────────────────────────── */

export type LayerKey = "assembly" | "loksabha" | "voteshare" | "turnout" | "margin" | "year";

export const DEFAULT_LAYER: LayerKey = "assembly";

/** A jurisdiction as one layer sees it. `label` is what a reader reads; `fill` is reinforcement. */
export type Cell = {
  jurisdictionId: string;
  jurisdictionName: string;
  /** Direct label on the polygon — the abbreviation, or a formatted number. Null when nothing is held. */
  label: string | null;
  fill: string;
  /** The lines of the hover card, in reading order. Empty when nothing is held. */
  detail: string[];
  /** Where the polygon links to. Always present: a gap still deserves a page. */
  href: string;
  electionId: string | null;
  year: number | null;
};

export type Layer = {
  key: LayerKey;
  label: string;
  /** The question the layer answers, shown beside the legend. */
  question: string;
  encoding: "categorical" | "sequential";
  cells: Cell[];
  legend: Swatch[];
  /** Jurisdictions the layer cannot colour, and why. Stated, never shaded. */
  unknown: number;
  unknownWhy: string;
  /** False when NOTHING in the registry can feed this layer. Computed from the cells, never declared. */
  available: boolean;
};

export const LAYERS: readonly { key: LayerKey; label: string; question: string; encoding: "categorical" | "sequential" }[] = [
  { key: "assembly", label: "Assembly control", question: "Which party leads each assembly now?", encoding: "categorical" },
  { key: "loksabha", label: "Latest Lok Sabha", question: "Which party took most of each state's parliamentary seats?", encoding: "categorical" },
  { key: "voteshare", label: "Vote share", question: "What share of the vote did the leading party take?", encoding: "sequential" },
  { key: "turnout", label: "Turnout", question: "What share of electors voted?", encoding: "sequential" },
  { key: "margin", label: "Margin", question: "How close was the median seat?", encoding: "sequential" },
  { key: "year", label: "Election year", question: "How recent is each result?", encoding: "sequential" },
];

export function isLayer(v: string | undefined): v is LayerKey {
  return LAYERS.some((l) => l.key === v);
}

/** Per-seat facts for a set of elections: the winner, the margin and the turnout of every contest. */
type SeatFact = {
  electionId: string;
  jurisdictionId: string;
  placeId: string;
  placeName: string;
  winnerKey: string | null;
  winnerLabel: string | null;
  marginVotes: number | null;
  voters: number | null;
  electors: number | null;
};

function seatFacts(db: DatabaseSync, electionIds: readonly string[]): SeatFact[] {
  if (electionIds.length === 0) return [];
  return read(() =>
    all<SeatFact>(
      db,
      `SELECT c.election_id AS electionId,
              CASE WHEN dis.kind = 'district' THEN dis.parent_id ELSE pl.parent_id END AS jurisdictionId,
              pl.id AS placeId, pvv.canonical_name AS placeName,
              pt.id AS winnerKey,
              COALESCE(NULLIF(pt.short_name, ''), NULLIF(pt.name, ''), NULLIF(cd.party_raw, '')) AS winnerLabel,
              r.margin AS marginVotes, t.voters AS voters, t.electors AS electors
         FROM contest c
         JOIN place_version pvv ON pvv.id = c.place_version_id
         JOIN place pl          ON pl.id = pvv.place_id
         LEFT JOIN place dis    ON dis.id = COALESCE(pvv.district_place_id, pl.parent_id)
         LEFT JOIN result r     ON r.contest_id = c.id AND r.revision = 0 AND r.is_winner = 1
         LEFT JOIN candidacy cd ON cd.id = r.candidacy_id
         LEFT JOIN party_version pv ON pv.id = cd.party_version_id
         LEFT JOIN party pt         ON pt.id = pv.party_id
         LEFT JOIN turnout t    ON t.contest_id = c.id AND t.scope = 'contest'
        WHERE c.election_id IN (${electionIds.map(() => "?").join(",")})`,
      ...electionIds,
    ),
  );
}

const IN_NUM = new Intl.NumberFormat("en-IN");

/** Median, or null for an empty set. The median rather than the mean: one uncontested landslide moves a
 *  mean by several points and says nothing about the typical seat. */
function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

/** Ramp a value onto SEQUENTIAL. `invert` puts the darkest step at the LOW end, which is right for a
 *  margin — a knife-edge seat is the signal, so it must be the loud one. */
function ramp(value: number, lo: number, hi: number, invert = false): string {
  const t = hi === lo ? 1 : Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
  const i = Math.min(SEQUENTIAL.length - 1, Math.floor((invert ? 1 - t : t) * SEQUENTIAL.length));
  return SEQUENTIAL[i] as string;
}

function bandLegend(lo: number, hi: number, unit: string, invert = false): Swatch[] {
  const step = (hi - lo) / SEQUENTIAL.length;
  return SEQUENTIAL.map((_, i) => ({
    label: `${(lo + i * step).toFixed(step < 1 ? 1 : 0)}–${(lo + (i + 1) * step).toFixed(step < 1 ? 1 : 0)}${unit}`,
    fill: ramp(lo + (i + 0.5) * step, lo, hi, invert),
  }));
}

/**
 * Build one map layer.
 *
 * `spine` carries the reads every layer shares, so switching layer costs one extra query at most and the
 * six of them never read `result` six times.
 */
export function layer(db: DatabaseSync, key: LayerKey, spine: Spine): Layer {
  const meta = LAYERS.find((l) => l.key === key) ?? LAYERS[0] as (typeof LAYERS)[number];
  const cells: Cell[] = [];
  let legend: Swatch[] = [];
  let unknownWhy = "no election of this kind is loaded for them";

  const base = (j: JurisdictionState): Omit<Cell, "label" | "fill" | "detail"> & { detail: string[] } => ({
    jurisdictionId: j.id,
    jurisdictionName: j.name,
    href: `/pl/${j.id}`,
    electionId: null,
    year: null,
    detail: [],
  });

  if (key === "assembly" || key === "loksabha") {
    const ink = key === "assembly" ? spine.ink : partyInk(spine.houseStandings);
    const rows = key === "assembly" ? spine.standings : spine.houseStandings;
    const byId = new Map(rows.map((r) => [r.jurisdictionId, r]));
    for (const j of spine.states) {
      const s = byId.get(j.id);
      if (s === undefined || s.leaderKey === null) {
        cells.push({ ...base(j), label: null, fill: NO_DATA_HUE, detail: [] });
        continue;
      }
      cells.push({
        ...base(j),
        label: s.leaderLabel,
        fill: hueOf(ink, s.leaderKey),
        electionId: s.electionId,
        year: s.year,
        detail: [
          `${key === "assembly" ? "Assembly" : "Lok Sabha"} ${s.year}`,
          `${s.leaderLabel} ${s.leaderSeats} of ${s.seatsContested} seats`,
          s.majority ? "outright majority" : "no outright majority of the seats contested",
        ],
      });
    }
    legend = ink.legend;
    unknownWhy =
      key === "assembly"
        ? "no assembly election is loaded for them, or they have no assembly"
        : "no seat of the latest Lok Sabha is loaded for them";
  } else if (key === "year") {
    const byId = new Map(spine.standings.map((r) => [r.jurisdictionId, r]));
    const years = spine.standings.map((s) => s.year);
    const lo = Math.min(...years, 9999);
    const hi = Math.max(...years, 0);
    for (const j of spine.states) {
      const s = byId.get(j.id);
      cells.push(
        s === undefined
          ? { ...base(j), label: null, fill: NO_DATA_HUE, detail: [] }
          : {
              ...base(j),
              label: String(s.year),
              fill: ramp(s.year, lo, hi),
              electionId: s.electionId,
              year: s.year,
              detail: [`Assembly ${s.year}`, `${s.leaderLabel} led with ${s.leaderSeats} seats`],
            },
      );
    }
    legend = spine.standings.length === 0 ? [] : bandLegend(lo, hi + 1, "");
  } else {
    // The three magnitude layers, all read off the same per-seat facts. The shares are pulled ONLY for the
    // layer that shows them: `leaderShare()` is the 62-election party read, and turnout and margin have no
    // use for it.
    const shareOf = key === "voteshare" ? spine.leaderShare() : null;
    const perElection = new Map<string, SeatFact[]>();
    for (const x of spine.seats) {
      perElection.set(x.electionId, [...(perElection.get(x.electionId) ?? []), x]);
    }
    const per = new Map<string, { turnout: number | null; margin: number | null; share: number | null; s: Standing }>();
    for (const s of spine.standings) {
      const seats = perElection.get(s.electionId) ?? [];
      const voters = seats.reduce((n, x) => n + (x.voters ?? 0), 0);
      const electors = seats.reduce((n, x) => n + (x.electors ?? 0), 0);
      const margins = seats.flatMap((x) =>
        x.marginVotes === null || x.voters === null || x.voters <= 0 ? [] : [(100 * Math.abs(x.marginVotes)) / x.voters],
      );
      per.set(s.jurisdictionId, {
        turnout: electors > 0 && voters > 0 ? (100 * voters) / electors : null,
        margin: median(margins),
        share: key === "voteshare" ? (shareOf?.get(s.electionId) ?? null) : null,
        s,
      });
    }
    const pick = (v: { turnout: number | null; margin: number | null; share: number | null }): number | null =>
      key === "turnout" ? v.turnout : key === "margin" ? v.margin : v.share;
    const values = [...per.values()].flatMap((v) => (pick(v) === null ? [] : [pick(v) as number]));
    const lo = values.length === 0 ? 0 : Math.floor(Math.min(...values));
    const hi = values.length === 0 ? 1 : Math.ceil(Math.max(...values));
    const unit = "%";
    for (const j of spine.states) {
      const v = per.get(j.id);
      const value = v === undefined ? null : pick(v);
      if (v === undefined || value === null) {
        cells.push({
          ...base(j),
          label: null,
          fill: NO_DATA_HUE,
          // A jurisdiction whose election is loaded but whose source published no counts is a DIFFERENT
          // fact from one with no election at all, and the card says which.
          detail:
            v === undefined
              ? []
              : [`Assembly ${v.s.year}`, key === "voteshare" ? "no vote counts published" : "not reported by the source"],
          electionId: v?.s.electionId ?? null,
          year: v?.s.year ?? null,
        });
        continue;
      }
      cells.push({
        ...base(j),
        label: `${value.toFixed(1)}${unit}`,
        fill: ramp(value, lo, hi, key === "margin"),
        electionId: v.s.electionId,
        year: v.s.year,
        detail: [
          `Assembly ${v.s.year}`,
          key === "turnout"
            ? `${value.toFixed(1)}% of electors voted`
            : key === "margin"
              ? `median winning margin ${value.toFixed(1)}% of votes polled, across ${v.s.seatsContested} seats`
              : `${v.s.leaderLabel} took ${value.toFixed(1)}% of counted votes`,
        ],
      });
    }
    legend = values.length === 0 ? [] : bandLegend(lo, hi, unit, key === "margin");
    unknownWhy =
      key === "voteshare"
        ? "their source published a winner and no vote counts, which is not a share of zero"
        : "their source reports no figure, which is not a figure of zero";
  }

  const unknown = cells.filter((c) => c.label === null).length;
  return {
    key,
    label: meta.label,
    question: meta.question,
    encoding: meta.encoding,
    cells,
    legend,
    unknown,
    unknownWhy,
    // Derived, never declared: a layer is unavailable when nothing in the registry can colour a single
    // jurisdiction. That is the seam a future layer with no data arrives through.
    available: unknown < cells.length,
  };
}

/**
 * Which layers have anything behind them — MEASURED, not declared, and without building six choropleths.
 *
 * The first version answered this by calling `layer()` for each of the six and reading `available` off
 * the result, which meant every request built five maps nobody asked for; the vote-share one alone read
 * `result` once per jurisdiction. These are the same predicates the layers themselves use, applied to the
 * spine that is already in hand.
 *
 * This is also the seam a future layer arrives through. A layer whose data has not been ingested reports
 * `false` here and is offered as unavailable rather than shading a country in a colour that means nothing.
 */
export function availability(spine: Spine): Map<LayerKey, boolean> {
  const anyTurnout = spine.seats.some((x) => x.voters !== null && x.voters > 0 && x.electors !== null && x.electors > 0);
  const anyMargin = spine.seats.some((x) => x.marginVotes !== null && x.voters !== null && x.voters > 0);
  return new Map<LayerKey, boolean>([
    ["assembly", spine.standings.some((s) => s.leaderKey !== null)],
    ["loksabha", spine.houseStandings.some((s) => s.leaderKey !== null)],
    // `counted`, not `leaderShare()`. Asking the shares whether they exist would compute all 31 of them —
    // a 550ms read to answer a yes/no question the strip needs on every request, including the five
    // requests that are not for this layer.
    ["voteshare", spine.counted.size > 0],
    ["turnout", anyTurnout],
    ["margin", anyMargin],
    ["year", spine.standings.length > 0],
  ]);
}

export type PartyLine = {
  key: string;
  label: string;
  /** Jurisdictions where this party leads the most recent assembly, and where it holds a majority. */
  governs: number;
  governsMajority: number;
  /** Assembly seats across every jurisdiction's most recent assembly, and the seats those contested. */
  assemblySeats: number;
  /** The latest Lok Sabha: seats and share, and the change against the one before it. */
  houseSeats: number;
  houseSharePct: number | null;
  houseSeatsChange: number | null;
  houseSharePp: number | null;
  /** Seats in each of the last few Lok Sabha elections, oldest first — the sparkline's data. */
  spark: { year: number; seats: number }[];
};

export type PartyLandscape = {
  rows: PartyLine[];
  houseElectionId: string | null;
  houseYear: number | null;
  previousHouseYear: number | null;
  /** Seats the latest Lok Sabha actually contested here — the denominator for every seat figure. */
  houseSeats: number;
  assemblySeats: number;
  /** True when the latest Lok Sabha published candidate vote counts. */
  houseCounted: boolean;
};

/** How many Lok Sabha elections the sparkline reaches back over. */
const SPARK = 5;

export function partyLandscape(db: DatabaseSync, spine: Spine, limit = 10): PartyLandscape {
  return read(() => {
    const houseId = spine.house?.id ?? null;
    const previousId = houseId === null ? null : previousElection(db, houseId);
    const now = houseId === null ? [] : spine.partiesOf(houseId);
    const then = previousId === null ? [] : foldStandings(seatsByParty(db, [previousId])).parties;
    const thenBy = new Map(then.map((p) => [p.key, p]));

    // Assembly seats a party holds across the country: every jurisdiction's most recent assembly, summed.
    const assembly = new Map<string, number>();
    for (const r of spine.latestAssemblySeats) {
      assembly.set(r.key, (assembly.get(r.key) ?? 0) + r.seats);
    }
    const governs = new Map<string, { n: number; majority: number }>();
    for (const s of spine.standings) {
      if (s.leaderKey === null) continue;
      const at = governs.get(s.leaderKey) ?? { n: 0, majority: 0 };
      governs.set(s.leaderKey, { n: at.n + 1, majority: at.majority + (s.majority ? 1 : 0) });
    }

    // Sparkline: the last SPARK Lok Sabha elections, winners only.
    const houseRun = all<{ id: string; year: number }>(
      db,
      `SELECT id, year FROM election e WHERE e.house = 'pc' AND e.kind <> 'bypoll'
        ORDER BY ${CHRONO_DESC} LIMIT ?`,
      SPARK,
    ).reverse();
    const sparkRows = seatsWonBy(db, houseRun.map((e) => e.id));
    const sparkOf = (key: string): { year: number; seats: number }[] =>
      houseRun.map((e) => ({
        year: e.year,
        seats: sparkRows.filter((r) => r.electionId === e.id && r.key === key).reduce((n, r) => n + r.seats, 0),
      }));

    const keys = new Set([...now.map((p) => p.key), ...assembly.keys(), ...governs.keys()]);
    const rows = [...keys]
      .map((key): PartyLine => {
        const a = now.find((p) => p.key === key);
        const b = thenBy.get(key);
        const g = governs.get(key) ?? { n: 0, majority: 0 };
        return {
          key,
          label: a?.label ?? spine.labelOf(key) ?? key,
          governs: g.n,
          governsMajority: g.majority,
          assemblySeats: assembly.get(key) ?? 0,
          houseSeats: a?.seats ?? 0,
          houseSharePct: a?.votePct ?? null,
          // Null, not a negative, when the party is absent from one side: not contesting is not a
          // collapse, and a first outing is not a gain of everything.
          houseSeatsChange: a === undefined || b === undefined ? null : a.seats - b.seats,
          houseSharePp:
            a?.votePct == null || b?.votePct == null ? null : Number((a.votePct - b.votePct).toFixed(1)),
          spark: sparkOf(key),
        };
      })
      // Ranked on what the section is about: presence across the country. Lok Sabha seats break ties,
      // then assembly seats, then the key so the order never wobbles between requests.
      .sort(
        (x, y) =>
          y.governs - x.governs ||
          y.houseSeats - x.houseSeats ||
          y.assemblySeats - x.assemblySeats ||
          x.key.localeCompare(y.key),
      )
      .filter((r) => r.governs > 0 || r.houseSeats > 0 || r.assemblySeats > 0)
      .slice(0, limit);

    return {
      rows,
      houseElectionId: houseId,
      houseYear: spine.house?.year ?? null,
      previousHouseYear: previousId === null ? (null) : (get<{ y: number }>(db, "SELECT year AS y FROM election WHERE id = ?", previousId)?.y ?? null),
      houseSeats: now.reduce((n, p) => n + p.seats, 0),
      assemblySeats: [...assembly.values()].reduce((n, v) => n + v, 0),
      houseCounted: now.some((p) => p.votePct !== null),
    };
  });
}

/* ────────────────────────────── watch signals ────────────────────────────── */

/**
 * A measurable signal, never a prediction.
 *
 * Nothing here forecasts anything. Each row is a count or a difference over rows the registry holds,
 * carrying the rule that produced it and the threshold that rule uses, so a reader can disagree with the
 * threshold rather than with an oracle. `basis` separates the one signal derived from a five-year term
 * from the ones measured off results — the term is arithmetic on a past date, not an announcement.
 */
export type Signal = {
  rule: string;
  /** The threshold in the rule, stated so it can be argued with. */
  threshold: string;
  subject: string;
  href: string;
  detail: string;
  basis: "measured" | "derived";
  /** Ranking magnitude — the count or the size of the movement. */
  weight: number;
};

/** A seat decided by less than this is a knife-edge. */
export const KNIFE_PP = 1;
/** A party's vote share moving by at least this is a movement worth naming. */
export const MOVE_PP = 5;
/** Seats a party must win to count as arriving, having won none last time. */
export const ARRIVAL_SEATS = 5;

/** How many rows any one rule may contribute, so the section is a mix of ways of looking. */
export const PER_RULE = 2;

export function watchSignals(db: DatabaseSync, spine: Spine, thisYear: number, limit = 8): Signal[] {
  return read(() => {
    const out: Signal[] = [];

    for (const s of spine.standings) {
      const href = `/pl/${s.jurisdictionId}`;
      const seats = spine.seats.filter((x) => x.electionId === s.electionId);

      // 1. A term derived to expire. DERIVED: the Commission announces dates and this registry holds none.
      const dueYear = s.year + 5;
      if (dueYear >= thisYear && dueYear <= thisYear + 1) {
        out.push({
          rule: "five-year term from the last election",
          threshold: `expiring in ${thisYear} or ${thisYear + 1}`,
          subject: s.jurisdictionName,
          href,
          detail: `Assembly last elected in ${s.year}, so a term of five years ends in ${dueYear}. No date has been announced and none is held here.`,
          basis: "derived",
          weight: 1_000 - (dueYear - thisYear),
        });
      }

      // 2. Knife-edge seats in the most recent election.
      const knife = seats.filter(
        (x) => x.marginVotes !== null && x.voters !== null && x.voters > 0 && (100 * Math.abs(x.marginVotes)) / x.voters < KNIFE_PP,
      );
      if (knife.length > 0) {
        out.push({
          rule: "seats decided by a margin under the threshold",
          threshold: `< ${KNIFE_PP}% of votes polled`,
          subject: s.jurisdictionName,
          href,
          detail: `${knife.length} of ${s.seatsContested} seats in ${s.year} were decided by under ${KNIFE_PP}% of the votes polled — ${knife
            .slice(0, 3)
            .map((x) => x.placeName)
            .join(", ")}${knife.length > 3 ? " and others" : ""}.`,
          basis: "measured",
          weight: knife.length,
        });
      }

      // 3. Seats that changed hands against the previous election of the same kind, seat by seat.
      const thenId = spine.previousOf(s.electionId);
      if (thenId !== null) {
        const before = new Map(
          spine.seats.filter((x) => x.electionId === thenId).map((x) => [x.placeId, x.winnerKey]),
        );
        const flipped = seats.filter((x) => {
          const was = before.get(x.placeId);
          // An unknown party on either side is neither a flip nor a hold. It is unknown.
          return was != null && x.winnerKey != null && was !== x.winnerKey;
        });
        if (flipped.length > 0) {
          out.push({
            rule: "seats whose winning party differs from the previous election",
            threshold: "same seat, same house, consecutive elections",
            subject: s.jurisdictionName,
            href,
            detail: `${flipped.length} of ${before.size} seats changed hands between ${spine.yearOf(thenId) ?? "the previous election"} and ${s.year}.`,
            basis: "measured",
            weight: flipped.length,
          });
        }

        // 4 and 5. Vote-share movement, and a party arriving from nothing.
        for (const r of spine.swingOf(s.electionId, thenId)) {
          if (r.changePp !== null && Math.abs(r.changePp) >= MOVE_PP) {
            out.push({
              rule: "a party's vote share moved between consecutive elections",
              threshold: `≥ ${MOVE_PP} percentage points`,
              subject: `${r.label} in ${s.jurisdictionName}`,
              href,
              detail: `${r.thenPct}% in ${spine.yearOf(thenId)} to ${r.nowPct}% in ${s.year} — ${r.changePp > 0 ? "+" : ""}${r.changePp}pp, with ${r.thenSeats} seats becoming ${r.nowSeats}.`,
              basis: "measured",
              weight: Math.abs(r.changePp),
            });
          }
          if (r.thenSeats === 0 && r.nowSeats >= ARRIVAL_SEATS) {
            out.push({
              rule: "a party won seats having won none last time",
              threshold: `≥ ${ARRIVAL_SEATS} seats`,
              subject: `${r.label} in ${s.jurisdictionName}`,
              href,
              detail: `${r.nowSeats} seats in ${s.year} against none in ${spine.yearOf(thenId)}.`,
              basis: "measured",
              weight: r.nowSeats,
            });
          }
        }
      }
    }

    // 6. The most recent by-election, which is its own kind of signal.
    const poll = spine.bypoll;
    if (poll !== null) {
      out.push({
        rule: "the most recent by-election held",
        threshold: "newest by chronology",
        subject: `${poll.jurisdictionName} by-election, ${poll.year}`,
        href: `/pl/${poll.jurisdictionId}`,
        detail:
          poll.leaderLabel === null
            ? `${poll.seatsContested} seat${poll.seatsContested === 1 ? "" : "s"}, no winner recorded here.`
            : `${poll.leaderLabel} took ${poll.leaderSeats} of ${poll.seatsContested} seat${poll.seatsContested === 1 ? "" : "s"}.`,
        basis: "measured",
        weight: 900,
      });
    }

    // One signal per subject, and at most PER_RULE of any one rule.
    //
    // Without the quota this section was eight rows of "a term expires" — the derived rule fires for every
    // one of the eleven jurisdictions due in 2026 or 2027, and a term expiry outranks any measured count
    // because it is the thing a reader most wants at the top. Eight rows about eight places, each found a
    // different way, is the section the brief describes; eight rows of one rule is a list of due dates.
    const perRule = new Map<string, number>();
    const seen = new Set<string>();
    return out
      .sort((a, b) => b.weight - a.weight || a.subject.localeCompare(b.subject))
      .filter((s) => {
        if (seen.has(s.subject)) return false;
        const n = perRule.get(s.rule) ?? 0;
        if (n >= PER_RULE) return false;
        perRule.set(s.rule, n + 1);
        seen.add(s.subject);
        return true;
      })
      .slice(0, limit);
  });
}

/* ────────────────────────────── coverage, per election ────────────────────────────── */

export type Completeness = "complete" | "partial" | "unavailable";

export type ElectionCoverage = {
  electionId: string;
  name: string;
  kind: string;
  house: string;
  year: number;
  jurisdictionId: string;
  jurisdictionName: string;
  /** Constituencies the registry holds a contest for. */
  contests: number;
  /** What the house should hold, from reference data — null when this registry cannot establish it. */
  expected: number | null;
  /** Where `expected` came from, or in one line why there is none. */
  expectedBasis: string;
  /** Today's elected strength for this house, from reference data — a different question from `expected`,
   *  and printed beside it so the two disagreeing is visible rather than averaged away. */
  referenceSeats: number | null;
  /** Contests carrying at least one result row with a vote count. */
  numericResults: number;
  declaredWinners: number;
  /** Contests with an elected candidacy, no result row, and a cited claim saying why. */
  unopposed: number;
  candidacies: number;
  turnoutRows: number;
  /** The delimitations this election's seats were drawn under. More than one is not a defect. */
  epochs: { id: string; contests: number }[];
  sources: SourceRef[];
  completeness: Completeness;
  /** What is missing, in the words of the counts. Empty when nothing is. */
  gaps: string[];
};

/**
 * What the registry holds for one election, counted — never asserted.
 *
 * `expected` is the honest half of this. It comes from `india.ts` reference data, which describes India
 * TODAY, so it is reported only for the newest election of a house in a jurisdiction. For anything older
 * the historical house size is not something this registry holds, and printing today's would describe a
 * different country; the contest count is still reported, and the basis line says which case applies.
 */
export function electionCoverage(db: DatabaseSync, electionId: string): ElectionCoverage | null {
  return read(() => {
    const e = get<{
      id: string; name: string; kind: string; house: string; year: number; j: string;
    }>(
      db,
      "SELECT id, name, kind, house, year, jurisdiction_place_id AS j FROM election WHERE id = ?",
      electionId,
    );
    if (e === undefined) return null;

    const n = (sql: string, ...p: (string | number)[]): number =>
      Number(get<{ n: number }>(db, sql, ...p)?.n ?? 0);
    const contests = n("SELECT COUNT(*) AS n FROM contest WHERE election_id = ?", e.id);
    const numericResults = n(
      `SELECT COUNT(DISTINCT c.id) AS n FROM contest c
         JOIN result r ON r.contest_id = c.id AND r.revision = 0
        WHERE c.election_id = ? AND r.votes IS NOT NULL`,
      e.id,
    );
    const declaredWinners = n(
      `SELECT COUNT(DISTINCT c.id) AS n FROM contest c
         JOIN result r ON r.contest_id = c.id AND r.revision = 0 AND r.is_winner = 1
        WHERE c.election_id = ?`,
      e.id,
    );
    // An unopposed seat: an elected candidacy, no result row of any kind, and a claim that says so. All
    // three, because the first two alone are also what a missing import looks like.
    const unopposed = n(
      `SELECT COUNT(*) AS n FROM contest c
        WHERE c.election_id = ?
          AND EXISTS (SELECT 1 FROM candidacy cd WHERE cd.contest_id = c.id AND cd.status = 'elected')
          AND NOT EXISTS (SELECT 1 FROM result r WHERE r.contest_id = c.id)
          AND EXISTS (SELECT 1 FROM claim cl WHERE cl.subject_ref = 'contest:' || c.id
                        AND cl.predicate = 'elected_unopposed')`,
      e.id,
    );
    const candidacies = n(
      "SELECT COUNT(*) AS n FROM candidacy cd JOIN contest c ON c.id = cd.contest_id WHERE c.election_id = ?",
      e.id,
    );
    const turnoutRows = n(
      `SELECT COUNT(*) AS n FROM turnout t JOIN contest c ON c.id = t.contest_id
        WHERE c.election_id = ? AND t.scope = 'contest'`,
      e.id,
    );
    const epochs = all<{ id: string; contests: number }>(
      db,
      `SELECT pv.epoch_id AS id, COUNT(*) AS contests
         FROM contest c JOIN place_version pv ON pv.id = c.place_version_id
        WHERE c.election_id = ? GROUP BY 1 ORDER BY 2 DESC`,
      e.id,
    );

    // Is this the newest election of its house in its jurisdiction? Only then does today's reference
    // seat count describe the same house.
    const newest = get<{ id: string }>(
      db,
      `SELECT id FROM election e WHERE e.house = ? AND e.jurisdiction_place_id = ? AND e.kind <> 'bypoll'
        ORDER BY ${CHRONO_DESC} LIMIT 1`,
      e.house,
      e.j,
    )?.id;
    const ref = JURISDICTIONS.find((x) => x.id === e.j);
    let expected: number | null = null;
    let expectedBasis: string;
    if (e.kind === "bypoll") {
      expectedBasis = "a by-election has no expected seat count — the seats that fell vacant are the fact";
    } else if (newest !== e.id) {
      expectedBasis = `the ${e.year} house's own size is not held as reference data — only today's is, and this is not the most recent ${e.house === "pc" ? "Lok Sabha" : "assembly"} election here`;
    } else if (e.house === "pc" && e.j === "in") {
      expected = INDIA_TOTALS.lokSabhaSeats;
      expectedBasis = `elected strength of the Lok Sabha, from reference data (${INDIA_TOTALS.lokSabhaSeats} across ${INDIA_TOTALS.jurisdictions} states and union territories)`;
    } else if (e.house === "ac" && ref?.assemblySeats != null) {
      expected = ref.assemblySeats;
      expectedBasis = `elected strength of the ${ref.name} assembly, from reference data`;
    } else if (e.house === "pc" && ref !== undefined) {
      expected = ref.lokSabhaSeats;
      expectedBasis = `${ref.name}'s Lok Sabha seats, from reference data`;
    } else {
      expectedBasis = "no reference seat count exists for this house and jurisdiction";
    }

    // Today's elected strength for this house, whether or not `expected` could be established. It is a
    // separate field because it answers a different question: `expected` is "what should be loaded", this
    // is "what the house holds now", and the two disagreeing is itself worth printing. West Bengal's
    // 2011/2016/2021 elections each hold 307 contests for a 294-seat assembly — a pre-existing defect in
    // the imported geography that this line surfaces instead of averaging away.
    const referenceSeats =
      e.kind === "bypoll" ? null : e.house === "pc" && e.j === "in"
        ? INDIA_TOTALS.lokSabhaSeats
        : e.house === "ac"
          ? (ref?.assemblySeats ?? null)
          : (ref?.lokSabhaSeats ?? null);

    const gaps: string[] = [];
    const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
    if (expected !== null && contests < expected) {
      gaps.push(`${expected - contests} of ${expected} constituencies are not loaded`);
    }
    if (referenceSeats !== null && contests > referenceSeats) {
      gaps.push(
        `${contests} contests for a house of ${referenceSeats} — ${contests - referenceSeats} more constituencies than this jurisdiction elects`,
      );
    }
    const accounted = numericResults + unopposed;
    if (contests > 0 && accounted < contests) {
      gaps.push(`${plural(contests - accounted, "contest", "contests")} carry no vote count and no stated reason`);
    }
    if (contests > 0 && turnoutRows < contests) {
      gaps.push(`${plural(contests - turnoutRows, "contest has", "contests have")} no turnout row`);
    }
    const completeness: Completeness =
      contests === 0 ? "unavailable" : gaps.length === 0 && expected !== null ? "complete" : "partial";

    return {
      electionId: e.id,
      name: e.name,
      kind: e.kind,
      house: e.house,
      year: e.year,
      jurisdictionId: e.j,
      jurisdictionName: e.j === "in" ? "India" : (ref?.name ?? e.j),
      contests,
      expected,
      expectedBasis,
      referenceSeats,
      numericResults,
      declaredWinners,
      unopposed,
      candidacies,
      turnoutRows,
      epochs,
      sources: loadSources(db, sourceIdsOf(db, e.id), []),
      completeness,
      gaps,
    };
  });
}

/** The distinct sources behind an election's results and turnout. Capped, because a Lokdhaba import can
 *  cite one source per row and the panel shows publishers, not a bibliography. */
function sourceIdsOf(db: DatabaseSync, electionId: string): string[] {
  return all<{ id: string }>(
    db,
    `SELECT id FROM (
       SELECT DISTINCT r.source_id AS id FROM result r JOIN contest c ON c.id = r.contest_id
         WHERE c.election_id = ?
       UNION
       SELECT DISTINCT t.source_id AS id FROM turnout t JOIN contest c ON c.id = t.contest_id
         WHERE c.election_id = ?
     ) LIMIT 12`,
    electionId,
    electionId,
  ).map((r) => r.id);
}

/** Completeness for many elections at once, for the recent-elections cards. */
export function completenessOf(db: DatabaseSync, electionIds: readonly string[]): Map<string, Completeness> {
  const out = new Map<string, Completeness>();
  for (const id of electionIds) out.set(id, electionCoverage(db, id)?.completeness ?? "unavailable");
  return out;
}

/* ────────────────────────────── historical exploration ────────────────────────────── */

export type HistoryCell = {
  electionId: string;
  year: number;
  /** 1 for the newest, ascending backwards. From row_number over CHRONO_DESC, so two elections in one
   *  year keep their calendar order — Bihar held one in February 2005 and another in October. */
  rank: number;
  leaderLabel: string | null;
  leaderSeats: number;
  seatsContested: number;
};

export type HistoryRow = {
  jurisdictionId: string;
  jurisdictionName: string;
  /** Newest first, up to `depth`. Shorter than `depth` where the registry holds fewer — never padded. */
  cells: HistoryCell[];
};

/** How many elections back the history grid reaches. */
export const HISTORY_DEPTH = 5;

/**
 * The last few elections of one house in every jurisdiction that has any.
 *
 * Winners only — the grid shows who led and by how many seats, and reading every losing row of 155
 * elections to compute a share nothing displays is the difference between 300,000 rows and 31,000.
 *
 * Coverage is honest by construction: a jurisdiction with two elections on record gets two cells. There
 * is no padding, no "n/a" column and no assumption that everyone has five.
 */
export function history(db: DatabaseSync, house: "ac" | "pc", depth = HISTORY_DEPTH): HistoryRow[] {
  return read(() => {
    const rows = all<{ id: string; j: string; year: number; seats: number; rn: number }>(
      db,
      // For a general election the contests are spread across every jurisdiction, so the grid is keyed on
      // the jurisdiction the SEATS are in, not the one that called the election — which is 'in' for all
      // eighteen of them and would make one row of the whole country.
      house === "pc"
        ? `SELECT id, j, year, seats, rn FROM (
             SELECT e.id AS id, x.j AS j, e.year AS year, x.n AS seats,
                    row_number() OVER (PARTITION BY x.j ORDER BY ${CHRONO_DESC}) AS rn
               FROM election e
               JOIN (SELECT c.election_id AS eid,
                            CASE WHEN dis.kind = 'district' THEN dis.parent_id ELSE pl.parent_id END AS j,
                            COUNT(*) AS n
                       FROM contest c
                       JOIN place_version pvv ON pvv.id = c.place_version_id
                       JOIN place pl          ON pl.id = pvv.place_id
                       LEFT JOIN place dis    ON dis.id = COALESCE(pvv.district_place_id, pl.parent_id)
                      GROUP BY 1, 2) x ON x.eid = e.id
              WHERE e.house = 'pc' AND e.kind <> 'bypoll'
           ) WHERE rn <= ?`
        : `SELECT id, j, year, seats, rn FROM (
             SELECT e.id AS id, e.jurisdiction_place_id AS j, e.year AS year,
                    (SELECT COUNT(*) FROM contest c WHERE c.election_id = e.id) AS seats,
                    row_number() OVER (PARTITION BY e.jurisdiction_place_id ORDER BY ${CHRONO_DESC}) AS rn
               FROM election e WHERE e.house = 'ac' AND e.kind <> 'bypoll'
           ) WHERE rn <= ?`,
      depth,
    );
    const won = seatsWonBy(db, [...new Set(rows.map((r) => r.id))]);
    const byJurisdiction = new Map<string, HistoryRow>();
    for (const r of rows) {
      const name = r.j === "in" ? "India" : (JURISDICTIONS.find((x) => x.id === r.j)?.name ?? r.j);
      const at = byJurisdiction.get(r.j) ?? { jurisdictionId: r.j, jurisdictionName: name, cells: [] };
      const top = won
        .filter((w) => w.electionId === r.id && w.jurisdictionId === r.j)
        .sort((a, b) => b.seats - a.seats || a.key.localeCompare(b.key))[0];
      at.cells.push({
        electionId: r.id,
        year: r.year,
        rank: r.rn,
        leaderLabel: top?.label ?? null,
        leaderSeats: top?.seats ?? 0,
        seatsContested: r.seats,
      });
      byJurisdiction.set(r.j, at);
    }
    return [...byJurisdiction.values()]
      // BY RANK, not by year. Bihar's February and October 2005 elections share a year, and sorting on
      // year alone left their order to whatever the array happened to hold — which is the same collapse
      // migration 013 split those two ids apart to prevent. `rank` is row_number over CHRONO_DESC.
      .map((row) => ({ ...row, cells: [...row.cells].sort((a, b) => a.rank - b.rank) }))
      .filter((row) => row.cells.length > 0)
      .sort(
        (a, b) =>
          (b.cells[0]?.year ?? 0) - (a.cells[0]?.year ?? 0) ||
          a.jurisdictionName.localeCompare(b.jurisdictionName),
      );
  });
}

/* ────────────────────────────── the spine ────────────────────────────── */

/**
 * The reads every section shares, done once.
 *
 * The front page used to call `currentStandings` four times — once for the map, once for the calendar,
 * once for close fights, once for swings — and each call was 62 scans of `result`. This holds the one
 * pass and hands out memoised views of it, which is why adding four more sections did not cost four more
 * passes.
 */
export type Spine = {
  states: readonly JurisdictionState[];
  standings: readonly Standing[];
  /** Each jurisdiction's slice of the latest Lok Sabha, in the same shape as an assembly standing. */
  houseStandings: readonly Standing[];
  house: LatestElection | null;
  ink: PartyInk;
  seats: readonly SeatFact[];
  latestAssemblySeats: readonly SeatsWon[];
  /**
   * The leading party's share of counted votes in each jurisdiction's most recent assembly election.
   *
   * Its own field rather than a `partiesOf()` call per jurisdiction: the vote-share layer needs 31 of
   * these, and each `partiesOf` is a full pass over one election's results. One bulk read fills the map.
   * Null where the source published a winner and no counts — West Bengal 2026 is the live example, and a
   * 0 there would be a fabrication.
   */
  leaderShare: () => Map<string, number | null>;
  /** Of the elections the page ranks on, the ones whose source published candidate vote counts. An EXISTS
   *  probe per election, which short-circuits — the cheap answer to "can a share be computed at all". */
  counted: Set<string>;
  bypoll: Dated | null;
  partiesOf: (electionId: string) => readonly PartyStanding[];
  previousOf: (electionId: string) => string | null;
  swingOf: (nowId: string, thenId: string) => SwingRow[];
  yearOf: (electionId: string) => number | null;
  labelOf: (partyKey: string) => string | null;
};

export function spine(db: DatabaseSync): Spine {
  const states = jurisdictions(db);
  const standings = currentStandings(db);
  const latest = latestPerJurisdiction(db, "assembly");
  const houseRow =
    all<LatestElection>(
      db,
      `SELECT e.id AS id, e.jurisdiction_place_id AS jurisdictionId, e.year AS year,
              (SELECT COUNT(*) FROM contest c WHERE c.election_id = e.id) AS seatsContested
         FROM election e WHERE e.house = 'pc' AND e.kind <> 'bypoll' ORDER BY ${CHRONO_DESC} LIMIT 1`,
    )[0] ?? null;

  // Previous elections, resolved once: both the flip comparison and the swing table need them.
  const previous = new Map<string, string | null>();
  for (const l of latest) previous.set(l.id, previousElection(db, l.id));
  const years = new Map<string, number>();
  for (const r of all<{ id: string; year: number }>(db, "SELECT id, year FROM election")) {
    years.set(r.id, r.year);
  }

  const facts = seatFacts(db, [
    ...latest.map((l) => l.id),
    ...[...previous.values()].filter((v): v is string => v !== null),
  ]);

  const latestAssemblySeats = seatsWonBy(db, latest.map((l) => l.id));

  const ids = latest.map((l) => l.id);
  const counted = new Set(
    ids.length === 0
      ? []
      : all<{ id: string }>(
          db,
          `SELECT e.id AS id FROM election e
            WHERE e.id IN (${ids.map(() => "?").join(",")})
              AND EXISTS (SELECT 1 FROM contest c
                            JOIN result r ON r.contest_id = c.id AND r.revision = 0
                           WHERE c.election_id = e.id AND r.votes IS NOT NULL)`,
          ...ids,
        ).map((r) => r.id),
  );

  /**
   * Party rows with votes for the 31 latest assemblies AND the 31 before them — ONE read, done LAZILY.
   *
   * This is the most expensive query on the page and it replaces the worst thing the first draft did.
   * `swingRows()` calls `standings()` twice, so asking it for a swing per jurisdiction was 62 full passes
   * over `result`; the vote-share layer added 31 more. Everything downstream — the leader's share, the
   * swing table, the movement signals — is folded out of these rows in memory.
   *
   * Lazy because only two things need it: the vote-share layer, and the share-movement signals. A surface
   * that reuses this spine for the map and the calendar alone should not pay 550ms for shares it never
   * prints, and the state page is that surface.
   */
  const priorIds = [...previous.values()].filter((v): v is string => v !== null);
  let bulkRows: SeatsByParty[] | null = null;
  const bulk = (): SeatsByParty[] => {
    bulkRows ??= seatsByParty(db, [...new Set([...latest.map((l) => l.id), ...priorIds])]);
    return bulkRows;
  };
  const partyCache = new Map<string, readonly PartyStanding[]>();
  const partiesOf = (electionId: string): readonly PartyStanding[] => {
    const hit = partyCache.get(electionId);
    if (hit !== undefined) return hit;
    // In the bulk read for the 62 elections the page ranks on; a one-off (a chosen Lok Sabha, say) still
    // gets its own query rather than silently returning nothing.
    const known = latest.some((l) => l.id === electionId) || priorIds.includes(electionId);
    const rows = foldStandings(
      known ? bulk().filter((r) => r.electionId === electionId) : seatsByParty(db, [electionId]),
    ).parties;
    partyCache.set(electionId, rows);
    return rows;
  };

  // Lazy for the same reason, and a Map cannot be: the vote-share layer asks for all 31 at once, and the
  // other five layers ask for none of them.
  const leaderKeyOf = new Map(standings.map((s) => [s.electionId, s.leaderKey]));
  let shares: Map<string, number | null> | null = null;
  const leaderShare = (): Map<string, number | null> => {
    if (shares === null) {
      shares = new Map();
      for (const l of latest) {
        const key = leaderKeyOf.get(l.id) ?? null;
        shares.set(l.id, key === null ? null : (partiesOf(l.id).find((p) => p.key === key)?.votePct ?? null));
      }
    }
    return shares;
  };

  const houseStandings: Standing[] =
    houseRow === null
      ? []
      : (() => {
          const byJurisdiction = new Map<string, SeatsWon[]>();
          for (const r of seatsWonBy(db, [houseRow.id])) {
            byJurisdiction.set(r.jurisdictionId, [...(byJurisdiction.get(r.jurisdictionId) ?? []), r]);
          }
          return [...byJurisdiction]
            .map(([j, rows]): Standing => {
              const total = rows.reduce((n, r) => n + r.seats, 0);
              const top = [...rows].sort((a, b) => b.seats - a.seats || a.key.localeCompare(b.key))[0];
              return {
                jurisdictionId: j,
                jurisdictionName: j === "in" ? "India" : (JURISDICTIONS.find((x) => x.id === j)?.name ?? j),
                electionId: houseRow.id,
                year: houseRow.year,
                seatsContested: total,
                leaderKey: top?.key ?? null,
                leaderLabel: top?.label ?? null,
                leaderSeats: top?.seats ?? 0,
                majority: top !== undefined && total > 0 && top.seats > total / 2,
              };
            })
            .sort((a, b) => b.leaderSeats - a.leaderSeats || a.jurisdictionName.localeCompare(b.jurisdictionName));
        })();

  const labels = new Map<string, string>();
  for (const r of latestAssemblySeats) labels.set(r.key, r.label);

  const swingCache = new Map<string, SwingRow[]>();
  const swingOf = (nowId: string, thenId: string): SwingRow[] => {
    const k = `${nowId}|${thenId}`;
    const hit = swingCache.get(k);
    if (hit !== undefined) return hit;
    // The same diff `swingRows` computes, over party rows already in memory. A party present on only one
    // side gets a null change rather than a ±100: not contesting is not a collapse, and a first outing is
    // not a gain of everything.
    const now = new Map(partiesOf(nowId).map((p) => [p.key, p]));
    const then = new Map(partiesOf(thenId).map((p) => [p.key, p]));
    const rows = [...new Set([...now.keys(), ...then.keys()])]
      .map((key): SwingRow => {
        const a = now.get(key);
        const b = then.get(key);
        const nowPct = a?.votePct ?? null;
        const thenPct = b?.votePct ?? null;
        return {
          key,
          label: a?.label ?? b?.label ?? key,
          nowPct,
          thenPct,
          changePp: nowPct === null || thenPct === null ? null : Number((nowPct - thenPct).toFixed(1)),
          nowSeats: a?.seats ?? 0,
          thenSeats: b?.seats ?? 0,
        };
      })
      .sort((x, y) => (y.nowPct ?? 0) - (x.nowPct ?? 0) || y.nowSeats - x.nowSeats);
    swingCache.set(k, rows);
    return rows;
  };

  return {
    states,
    standings,
    houseStandings,
    house: houseRow,
    ink: partyInk(standings),
    seats: facts,
    latestAssemblySeats,
    leaderShare,
    counted,
    bypoll: null,
    partiesOf,
    previousOf: (id) => previous.get(id) ?? null,
    swingOf,
    yearOf: (id) => years.get(id) ?? null,
    labelOf: (key) => labels.get(key) ?? null,
  };
}

/* ────────────────────────────── the page ────────────────────────────── */

export type HomeParams = {
  layer?: string | undefined;
  /** The election the coverage panel reports on. Validated against the registry, never trusted. */
  election?: string | undefined;
  /** The house the history grid shows. */
  house?: string | undefined;
  /** The year the page reasons about, injected so a term-expiry list cannot change under a test. */
  thisYear: number;
};

export type HomeView = {
  snapshot: Snapshot;
  states: readonly JurisdictionState[];
  standings: readonly Standing[];
  layer: Layer;
  layers: readonly { key: LayerKey; label: string; available: boolean }[];
  upcoming: Dated[];
  overdue: Dated[];
  held: Dated[];
  coverageOf: Map<string, Completeness>;
  parties: PartyLandscape;
  fights: CloseFight[];
  signals: Signal[];
  historyHouse: "ac" | "pc";
  history: HistoryRow[];
  coverage: ElectionCoverage | null;
  /** Elections the coverage panel offers, newest first. */
  choices: { id: string; name: string; year: number }[];
  ink: PartyInk;
};

/**
 * Everything `/` renders, from one open database handle.
 *
 * Parameters arrive from the query string and are validated by MEMBERSHIP, not by parsing: an unknown
 * layer or an election id that is not in `choices` falls back to the default, which is why a hand-edited
 * URL cannot reach the SQL or produce a broken page.
 */
export function homeView(db: DatabaseSync, p: HomeParams): HomeView {
  const sp = spine(db);
  const held = recent(db, 8);
  const polls = recentBypolls(db, 1);
  const withPoll: Spine = { ...sp, bypoll: polls[0] ?? null };

  const key: LayerKey = isLayer(p.layer) ? p.layer : DEFAULT_LAYER;
  const chosen = layer(db, key, withPoll);
  // ONE choropleth is built — the one that is shown. Availability for the other five comes from the same
  // predicates applied to the spine, because the first version of this line called `layer()` six times and
  // the vote-share build alone read `result` once per jurisdiction.
  const can = availability(withPoll);
  const layers = LAYERS.map((l) => ({
    key: l.key,
    label: l.label,
    available: l.key === key ? chosen.available : (can.get(l.key) ?? false),
  }));

  const historyHouse: "ac" | "pc" = p.house === "pc" ? "pc" : "ac";
  const choices = all<{ id: string; name: string; year: number }>(
    db,
    `SELECT id, name, year FROM election e WHERE e.kind <> 'bypoll' ORDER BY ${CHRONO_DESC} LIMIT 24`,
  );
  const asked = choices.find((c) => c.id === p.election);
  const coverageId = asked?.id ?? choices[0]?.id ?? null;

  const dueRows = dueFrom(sp.standings, p.thisYear);
  return {
    snapshot: snapshot(db, sp.standings, sp.states, sp.houseStandings, held[0] ?? null, p.thisYear),
    states: sp.states,
    standings: sp.standings,
    layer: chosen,
    layers,
    upcoming: dueRows.upcoming,
    overdue: dueRows.overdue,
    held,
    coverageOf: completenessOf(db, held.map((h) => h.id)),
    parties: partyLandscape(db, withPoll),
    fights: closeFights(db, "assembly", 10),
    signals: watchSignals(db, withPoll, p.thisYear),
    historyHouse,
    history: history(db, historyHouse),
    coverage: coverageId === null ? null : electionCoverage(db, coverageId),
    choices,
    ink: sp.ink,
  };
}

/** The newest by-elections, by chronology. */
function recentBypolls(db: DatabaseSync, limit: number): Dated[] {
  return read(() =>
    all<{ id: string; name: string; j: string; year: number; seats: number }>(
      db,
      `SELECT e.id AS id, e.name AS name, e.jurisdiction_place_id AS j, e.year AS year,
              (SELECT COUNT(*) FROM contest c WHERE c.election_id = e.id) AS seats
         FROM election e WHERE e.kind = 'bypoll' ORDER BY ${CHRONO_DESC} LIMIT ?`,
      limit,
    ).map((e) => {
      const won = seatsWonBy(db, [e.id]);
      const top = [...won].sort((a, b) => b.seats - a.seats || a.key.localeCompare(b.key))[0];
      return {
        id: e.id,
        name: e.name,
        jurisdictionId: e.j,
        jurisdictionName: e.j === "in" ? "India" : (JURISDICTIONS.find((x) => x.id === e.j)?.name ?? e.j),
        kind: "bypoll",
        year: e.year,
        status: "declared" as const,
        leaderLabel: top?.label ?? null,
        leaderSeats: top?.seats ?? 0,
        seatsContested: e.seats,
      };
    }),
  );
}

/**
 * When each assembly is next DUE, from the standings already in hand.
 *
 * DERIVED, and labelled that way everywhere it is shown. The Commission announces dates; `election`
 * holds a NULL in every `announced_on`, and `election_phase` holds no rows at all, so there is nothing
 * authoritative to prefer over this arithmetic — and the moment there is, this list gives way to it
 * rather than being reconciled with it.
 *
 * A term that expired BEFORE `thisYear` is not an upcoming election. It is a statement about where our
 * data stops, and the two must not be printed as one list.
 */
export function dueFrom(standings: readonly Standing[], thisYear: number, limit = 8): { upcoming: Dated[]; overdue: Dated[] } {
  const rows = standings.map(
    (s): Dated => ({
      id: s.electionId,
      name: `${s.jurisdictionName} — next assembly election`,
      jurisdictionId: s.jurisdictionId,
      jurisdictionName: s.jurisdictionName,
      kind: "assembly",
      year: s.year + 5,
      status: "due",
      leaderLabel: s.leaderLabel,
      leaderSeats: s.leaderSeats,
      seatsContested: s.seatsContested,
    }),
  );
  const byYear = (a: Dated, b: Dated): number =>
    a.year - b.year || a.jurisdictionName.localeCompare(b.jurisdictionName);
  return {
    upcoming: rows.filter((r) => r.year >= thisYear).sort(byYear).slice(0, limit),
    overdue: rows.filter((r) => r.year < thisYear).sort(byYear).slice(0, limit),
  };
}

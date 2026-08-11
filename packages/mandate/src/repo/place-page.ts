// Floor 1 (Brief) + Floor 2 (Analysis) logic for a PLACE: the computed headline, the stat tiles,
// the flagged anomalies, the URL filter grammar, and the eight question-titled cards. Pure
// functions plus one loader — no React anywhere, so place-page.test.ts runs the lot under node:test.
//
// It lives in the package, not beside the route, for the reason cycle 2 paid for: a module under
// src/app/ that the page reaches through a dynamic import is not statically analysable by webpack,
// which compiled the binding to `undefined` and 500'd every slug in a production build while the
// build itself reported success. Here it is a static import from the page and a checked file under
// registry:typecheck.

import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { DatabaseSync } from "node:sqlite";
import {
  enp as enpMeasure,
  inr,
  margin_pct,
  percent,
  percentagePoints,
  turnout_pct,
} from "../semantic/index.ts";
import type { Chart, Series, SlopeRow } from "../viz/charts.ts";
import { bars, lines, slope } from "../viz/charts.ts";
import type { Tile } from "./brief.ts";
import { fromRepo } from "./brief.ts";
import { unavailable } from "./envelope.ts";
import type { PlaceBrief, SourceRef } from "./index.ts";
import type { PartyPoint, PlaceAnalysis, PlaceAnalysisFilters } from "./place-analysis.ts";

// ── the URL ──────────────────────────────────────────────────────────────────────────────────────

/** §7's grammar: /pl/:state · /pl/:state/:district · /pl/:state/:district/:ac. */
export type PathTarget = {
  level: "state" | "district" | "ac";
  /** Place ids to try, in order, before falling back to a name match. */
  ids: string[];
  /** The last segment as a name would be written: "north-24-parganas" → "north 24 parganas". */
  name: string;
  /** The district id an AC path asserts, so /pl/wb/nadia/mekliganj cannot resolve. */
  parentId: string | null;
};

/** A stray percent in the path is a name no place has, not a crashed page: /pl/wb/50%25 must 404 the
 *  way every other unresolvable path does, so a malformed escape keeps its raw text and fails to
 *  match. */
function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function parsePath(segments: readonly string[]): PathTarget | null {
  const clean = segments
    .map((s) => decode(s).trim().toLowerCase())
    .filter((s) => s !== "");
  const last = clean.at(-1);
  const state = clean.at(0);
  if (last === undefined || state === undefined || clean.length > 3) return null;
  const name = last.replace(/-/g, " ");
  if (clean.length === 1) return { level: "state", ids: [state], name, parentId: null };
  if (clean.length === 2) {
    return { level: "district", ids: [clean.join("."), last], name, parentId: state };
  }
  // An AC is addressable by name ("mekliganj"), by its full id, or by its number ("1", "001").
  const ids = [last, `${state}.ac.${last.padStart(3, "0")}`];
  return { level: "ac", ids, name, parentId: `${state}.${clean[1] ?? ""}` };
}

/** The canonical path for a place, built from ids alone — there is no slug column (see place.ts). */
export function placeHref(p: {
  kind: "state" | "district" | "ac";
  id: string;
  canonicalName: string;
  parentId: string | null;
}): string {
  if (p.kind === "state") return `/pl/${p.id}`;
  const parent = p.parentId ?? "";
  if (p.kind === "district") return `/pl/${parent}/${parent === "" ? p.id : p.id.slice(parent.length + 1)}`;
  // `?? "wb"` used to sit here and read as a West Bengal default. It was dead — String.split always
  // returns at least one element — but an empty parent still produced `/pl///seat`, a URL with two
  // empty segments that resolves to nothing. A seat with no district has no place path, so say so.
  const state = parent.split(".")[0] ?? "";
  // A seat needs a state AND a district to have a four-segment path. Missing either used to produce
  // `/pl///seat` — a URL with empty segments that resolves to nothing — because a dead `?? "wb"` here
  // read as a West Bengal default while String.split can never return undefined. Fall back up the tree
  // instead of emitting a broken link.
  if (state === "" || parent === state) return state === "" ? "/pl" : `/pl/${state}`;
  const districtSeg = parent.slice(state.length + 1);
  return `/pl/${state}/${districtSeg}/${slugOf(p.canonicalName)}`;
}

function slugOf(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

// ── the filter grammar: ?from=2011&to=2026&party=AITC ────────────────────────────────────────────

/** A visible, removable filter: `href` is the same view with this one param dropped (§11). */
export type Chip = { label: string; href: string };

export type ParsedFilters = {
  filters: PlaceAnalysisFilters;
  chips: Chip[];
  /** Rejected params, in plain words, rendered on the page — never silently dropped. */
  ignored: string[];
};

type Search = Readonly<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s === undefined || s.trim() === "" ? undefined : s.trim();
}

/**
 * Parse and validate the three params. `years` and `parties` are what this seat actually has, so a
 * filter that names an election or a party the seat never had is REJECTED with a reason rather than
 * silently returning an empty chart.
 */
export function parseFilters(
  search: Search,
  o: { base: string; years: readonly number[]; parties: readonly string[] },
): ParsedFilters {
  const ignored: string[] = [];
  const lo = Math.min(...(o.years.length > 0 ? o.years : [0]));
  const hi = Math.max(...(o.years.length > 0 ? o.years : [0]));
  const span = o.years.length === 0 ? "none on record" : `${lo}–${hi}`;

  const year = (key: "from" | "to"): number | undefined => {
    const raw = one(search[key]);
    if (raw === undefined) return undefined;
    const n = /^\d{4}$/.test(raw) ? Number(raw) : NaN;
    if (Number.isNaN(n) || n < lo || n > hi) {
      ignored.push(`${key}=${raw} ignored: this seat's elections are ${span}.`);
      return undefined;
    }
    return n;
  };
  let fromYear = year("from");
  const toYear = year("to");
  if (fromYear !== undefined && toYear !== undefined && fromYear > toYear) {
    ignored.push(`from=${fromYear} ignored: it is after to=${toYear}.`);
    fromYear = undefined;
  }

  let party = one(search["party"]);
  if (party !== undefined) {
    const hit = o.parties.find((p) => p.toLowerCase() === party?.toLowerCase());
    if (hit === undefined) {
      ignored.push(
        `party=${party} ignored: no party by that name has a result at this seat` +
          (o.parties.length === 0 ? "." : ` (on record: ${o.parties.join(", ")}).`),
      );
      party = undefined;
    } else party = hit;
  }

  const active: [string, string][] = [
    ...(fromYear === undefined ? [] : [["from", String(fromYear)] as [string, string]]),
    ...(toYear === undefined ? [] : [["to", String(toYear)] as [string, string]]),
    ...(party === undefined ? [] : [["party", party] as [string, string]]),
  ];
  const chips = active.map(([k, v]) => {
    const rest = active.filter((a) => a[0] !== k);
    const q = rest.map(([rk, rv]) => `${rk}=${encodeURIComponent(rv)}`).join("&");
    return {
      label: k === "from" ? `From ${v}` : k === "to" ? `To ${v}` : `Party ${v}`,
      href: q === "" ? o.base : `${o.base}?${q}`,
    };
  });

  return { filters: { fromYear, toYear, party }, chips, ignored };
}

// ── provenance ───────────────────────────────────────────────────────────────────────────────────

export type Provenance = { total: number; fetched: number; repoFiles: number; retrievedAt: string | null };

/** ponytail: brief.ts's `freshness` is typed to PersonBrief; this one takes the sources. Unify the
 *  two the moment a third surface needs it. */
export function provenance(sources: readonly SourceRef[]): Provenance {
  const stamps = sources.map((s) => s.retrievedAt).sort();
  const fetched = sources.filter((s) => s.retrievalKind === "fetched");
  return {
    total: sources.length,
    fetched: fetched.length,
    repoFiles: fetched.filter(fromRepo).length,
    retrievedAt: stamps.at(-1) ?? null,
  };
}

// ── Floor 1: the headline ────────────────────────────────────────────────────────────────────────

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Margin as a share of votes cast — the only comparable form, because the electorate grew 32%.
 * THE measure, not a second definition of it: `result.margin` is already (rank-1 − rank-2), which is
 * margin_pct's numerator, so it goes in as rank1Votes against a rank2Votes of 0 — exactly what
 * place-analysis.ts does for marginSeries. Anything computed here instead would be a figure the
 * measure's caveats do not cover.
 */
function marginPct(c: PlaceBrief["contests"][number]): number | null {
  return margin_pct.compute({
    rank1Votes: c.margin === null ? null : Math.abs(c.margin),
    rank2Votes: 0,
    validVotes: c.voters,
  });
}

function times(n: number): string {
  return n === 1 ? "once" : n === 2 ? "twice" : `${inr(n)} times`;
}

/**
 * §6.5's question — what makes this seat important? — answered as a CLAIM, computed, never a label.
 * Three shapes, because the register of the honest sentence differs: an unbroken hold, a seat that
 * turns over every time, and everything in between. One election on record says so and stops.
 */
export function placeHeadline(b: PlaceBrief): string {
  const cs = b.contests; // newest first
  const name = b.place.canonicalName;
  const latest = cs.at(0);
  const oldest = cs.at(-1);
  if (latest === undefined || oldest === undefined) {
    return `No contest is on record for ${name}, so there is nothing to judge yet.`;
  }
  const won = (c: PlaceBrief["contests"][number]): string | null => c.winner?.partyShortName ?? null;
  const w = won(latest);
  if (cs.length === 1) {
    return w === null
      ? `${name} has one election on record, ${latest.year}, and no declared winner in it.`
      : `${w} won ${name} in ${latest.year} by ${inr(Math.abs(latest.margin ?? 0))} votes — the only ` +
          `election on record here, so no trend is computable.`;
  }

  const flips = cs
    .slice(0, -1)
    .filter((c, i) => {
      const prev = cs[i + 1];
      return prev !== undefined && won(c) !== null && won(prev) !== null && won(c) !== won(prev);
    }).length;
  const parties = new Set(cs.map(won).filter((p): p is string => p !== null));
  // An election with no declared winner is not an election the seat "held": every claim below is
  // qualified by how many of them there are, rather than counting silence as continuity.
  const unknown = cs.filter((c) => won(c) === null).length;
  const gap =
    unknown === 0
      ? ""
      : ` ${inr(unknown)} of the ${inr(cs.length)} elections on record have no declared winner.`;

  if (flips === 0 && parties.size === 1 && w !== null && unknown === 0) {
    const now = marginPct(latest);
    const then = marginPct(oldest);
    const trend =
      now === null || then === null || then === 0
        ? `on margins of ${percent(now)} of votes cast in ${latest.year}`
        : now < then
          ? `but its margin fell ${percent(round1(((then - now) / then) * 100))} over that run, ` +
            `from ${percent(then)} of votes cast to ${percent(now)}`
          : `and its margin grew from ${percent(then)} of votes cast to ${percent(now)}`;
    return `${w} has held ${name} in all ${inr(cs.length)} elections since ${oldest.year}, ${trend}.`;
  }

  if (flips === cs.length - 1 && w !== null) {
    return (
      `${name} has changed hands at every one of its ${inr(cs.length)} recorded elections — ` +
      `${[...cs].reverse().map((c) => `${won(c) ?? "no result"} ${c.year}`).join(", ")} — and ` +
      `${w} holds it by ${inr(Math.abs(latest.margin ?? 0))} votes.`
    );
  }

  const prev = cs.at(1);
  const held = prev !== undefined && won(prev) === w && w !== null;
  const run = held ? cs.filter((c, i) => cs.slice(0, i + 1).every((x) => won(x) === w)).length : 0;
  if (w === null) {
    return (
      `${name} has no declared winner for ${latest.year}; the seat changed hands ${times(flips)} ` +
      `across the ${inr(cs.length)} elections on record since ${oldest.year}.${gap}`
    );
  }
  return held
    ? `${w} has held ${name} for ${inr(run)} straight elections, by ${inr(Math.abs(latest.margin ?? 0))} ` +
        `votes in ${latest.year}, and the seat changed hands ${times(flips)} since ${oldest.year}.${gap}`
    : `${w} took ${name} from ${(prev === undefined ? null : won(prev)) ?? "the previous holder"} in ${latest.year} by ` +
        `${inr(Math.abs(latest.margin ?? 0))} votes — the seat has changed hands ${times(flips)} ` +
        `since ${oldest.year}.${gap}`;
}

// ── Floor 1: the tiles ───────────────────────────────────────────────────────────────────────────

function sourceOf(sources: readonly SourceRef[], kinds: readonly string[]): SourceRef | null {
  return sources.find((s) => kinds.includes(s.kind)) ?? null;
}

const RESERVATION: Record<string, string> = { general: "General", sc: "Reserved SC", st: "Reserved ST" };

/**
 * Six tiles, and each one differentiates THIS seat: turnout against its district, the latest
 * margin, how often it turned over, the electorate's growth, how many parties really contested, and
 * one census figure. §6.5: a demographic figure carries its vintage IN the tile.
 */
export function placeTiles(b: PlaceBrief, a: PlaceAnalysis | null): Tile[] {
  const latest = b.contests.at(0);
  const oldest = b.contests.at(-1);
  const t0 = a?.turnoutSeries.at(0) ?? null;
  const result = sourceOf(b.sources, ["eci_declaration", "eci_form20"]);
  const out: Tile[] = [];

  if (latest !== undefined) {
    const d = t0?.districtTurnoutPct ?? null;
    const s = t0?.stateTurnoutPct ?? null;
    out.push({
      label: `Turnout ${latest.year}`,
      value: percent(latest.turnoutPct),
      unit: latest.electors === null ? null : `of ${inr(latest.electors)} electors`,
      note:
        latest.turnoutPct === null || d === null
          ? "no district baseline on record"
          : `${percentagePoints(round1(latest.turnoutPct - d))} vs ${b.place.districtName ?? "district"}` +
            (s === null ? "" : ` · state ${percent(s)}`),
      source: result,
    });
    out.push({
      label: `Winning margin ${latest.year}`,
      value: latest.margin === null ? "—" : inr(Math.abs(latest.margin)),
      unit: "votes",
      note:
        `${percent(marginPct(latest))} of votes cast` +
        (latest.winner?.partyShortName == null
          ? ""
          : ` · ${latest.winner.partyShortName}${
              latest.runnerUp?.partyShortName == null ? "" : ` over ${latest.runnerUp.partyShortName}`
            }`),
      source: result,
    });
  }

  const flips =
    a === null
      ? null
      : a.retention.filter((r) => r.held === 0).length;
  out.push({
    label: "Changed hands",
    value: flips === null ? "—" : flips === 0 ? "never" : times(flips),
    unit: null,
    note:
      b.contests.length === 0 || oldest === undefined
        ? "no elections on record"
        : `across ${inr(b.contests.length)} elections since ${oldest.year}`,
    source: result,
  });

  if (latest !== undefined && oldest !== undefined && latest.electors !== null && oldest.electors !== null) {
    const growth = round1(((latest.electors - oldest.electors) / oldest.electors) * 100);
    out.push({
      label: "Electors",
      value: inr(latest.electors),
      unit: `roll of ${latest.year}`,
      note:
        b.contests.length === 1
          ? "one roll on record"
          : `${growth > 0 ? "up" : growth < 0 ? "down" : "unchanged"} ${percent(Math.abs(growth))} since ${oldest.year}`,
      source: result,
    });
  }

  // The most recent election with a computable figure, not necessarily the latest: 2026 is a
  // declaration with no vote counts, so its ENP is null and a tile reading "— over 0 contestants"
  // would be a frame with nothing in it.
  const e0 = a?.enpSeries.find((e) => e.enp !== null) ?? null;
  if (e0 !== null) {
    out.push({
      label: "Effective parties",
      value: enpMeasure.format(e0.enp),
      unit: `${e0.year}`,
      note: `over ${inr(e0.contestants)} contestants on record — a truncated field overstates concentration`,
      source: result,
    });
  }

  // The registry holds 294 population claims with 23 distinct values — one per district — so this is
  // the DISTRICT's census figure attached to the seat, and the tile says so. §6.5: the vintage and
  // the grain travel with the number, in the tile, not in a tooltip.
  const pop = a?.demographics.find((d) => d.value.key === "population") ?? null;
  const note = a?.demographics.find((d) => d.value.key === "source_note")?.value.value ?? null;
  if (pop !== null) {
    out.push({
      label: "District population",
      value: typeof pop.value.value === "number" ? inr(pop.value.value) : String(pop.value.value),
      unit: pop.value.unit ?? null,
      note:
        `Census ${pop.value.sourceYear ?? "vintage not recorded"} · ` +
        `${b.place.districtName ?? "district"}-wide, not this seat's — the registry holds no ` +
        `seat-level census figure` +
        (typeof note === "string" ? ` · ${note}` : ""),
      source: pop.sources.at(0) ?? null,
    });
  }
  return out;
}

// ── Floor 1: flagged anomalies ───────────────────────────────────────────────────────────────────

/** What is unusual about this seat, stated as facts with their figures. Empty is a legitimate
 *  answer, and the page prints one line of fact rather than an empty frame. */
export function anomalies(b: PlaceBrief, a: PlaceAnalysis | null): string[] {
  const out: string[] = [];
  const latest = b.contests.at(0);
  const t0 = a?.turnoutSeries.at(0) ?? null;
  if (t0?.turnoutPct != null && t0.districtTurnoutPct !== null) {
    const gap = round1(t0.turnoutPct - t0.districtTurnoutPct);
    if (Math.abs(gap) >= 5) {
      out.push(
        `Turnout of ${percent(t0.turnoutPct)} in ${t0.year} is ${percentagePoints(gap)} against ` +
          `${a?.place.districtName ?? "the district"}'s ${percent(t0.districtTurnoutPct)}. The ` +
          `registry records the figures, not the reason.`,
      );
    }
  }
  if (t0?.turnoutPct != null && t0.turnoutPct >= 95) {
    out.push(`Turnout at or above 95% (${percent(t0.turnoutPct)}) is at the top of the state's range.`);
  }
  const m = latest === undefined ? null : marginPct(latest);
  if (m !== null && m < 1) {
    out.push(
      `${latest?.year ?? ""}'s margin was ${percent(m)} of votes cast — under one point, so a ` +
        `recount-scale error would change the winner.`,
    );
  }
  if (latest !== undefined && latest.winner !== null && latest.winner.votes === null) {
    out.push(
      `The ${latest.year} result is a declaration: the winning margin is on record but no ` +
        `candidate's vote count is, so every ${latest.year} share here is blank rather than zero.`,
    );
  }
  if (a !== null && a.retention.every((r) => r.held === 0) && a.retention.length > 1) {
    out.push(`The seat has changed hands at every election pair on record — no party has held it twice.`);
  }
  if (a !== null && a.epochIds.length > 1) {
    out.push(
      `This seat's history spans ${inr(a.epochIds.length)} boundary epochs, so swing and retention ` +
        `are undefined across the break: the two electorates are not the same voters.`,
    );
  }
  return out;
}

// ── Floor 2: the cards ───────────────────────────────────────────────────────────────────────────

/** A question, its chart (svg or one line of fact, plus the table §27 makes primary), and the
 *  measure caveat that must be visible ON the card. */
export type Card = { question: string; chart: Chart; note: string | null };

function asc<T extends { year: number }>(rows: readonly T[]): T[] {
  return [...rows].reverse();
}

/** Eight cards at most, fewer when a filter narrows the window — the swing cards are per election
 *  pair, so a single-election window has none, and that is the honest count, not a gap to fill. */
export function analysisCards(a: PlaceAnalysis): Card[] {
  const cards: Card[] = [];
  const seat = a.place.canonicalName;
  const district = a.place.districtName ?? "its district";
  // Never a literal: the state baseline is computed per state, so labelling it "West Bengal"
  // would silently mislabel every other state's chart rather than fail loudly.
  const stateLabel = a.place.stateName ?? "state";

  const turnout = asc(a.turnoutSeries);
  const years = turnout.map((p) => String(p.year));
  const t0 = a.turnoutSeries.at(0);
  cards.push({
    question: `Did ${seat} turn out more than ${district}?`,
    chart: lines({
      title: `Turnout, seat against district and state`,
      finding:
        t0?.turnoutPct == null
          ? "No turnout figure is on record for the latest election in this window."
          : t0.districtTurnoutPct === null
            ? `${t0.year}: ${percent(t0.turnoutPct)} here; no district baseline on record.`
            : `${t0.year}: ${percent(t0.turnoutPct)} here against ${percent(t0.districtTurnoutPct)} in ` +
              `${district} (${percentagePoints(round1(t0.turnoutPct - t0.districtTurnoutPct))}).`,
      x: years,
      xHeader: "Election",
      series: [
        { key: "seat", label: seat, values: turnout.map((p) => p.turnoutPct) },
        { key: "district", label: district, values: turnout.map((p) => p.districtTurnoutPct) },
        { key: "state", label: stateLabel, values: turnout.map((p) => p.stateTurnoutPct) },
      ],
      format: percent,
    }),
    note: null,
  });

  const shares = asc(a.partyShareSeries);
  // Keyed by label, with every runner under that label in that election SUMMED into it. Taking the
  // first match instead dropped the second of two contestants sharing a label ("IND", most often) out
  // of the chart AND out of the Others bucket, so the rendered total stopped reconciling with the
  // data — 22.7 pp of Kalimpong's 2021 vote vanished. Keying per candidacy would instead break a
  // party's line at every candidate change, so the party stays the series and the note below says
  // when a line stands for more than one contestant.
  const keys = [...new Set(shares.flatMap((s) => s.parties.map((p) => p.shortName)))];
  const sumBy = (parties: readonly PartyPoint[], k: string): number | null => {
    const hit = parties.filter((p) => p.shortName === k && p.voteSharePct !== null);
    return hit.length === 0 ? null : round1(hit.reduce((n, p) => n + (p.voteSharePct ?? 0), 0));
  };
  const series: Series[] = keys.map((k) => ({
    key: k,
    label: k,
    values: shares.map((s) => sumBy(s.parties, k)),
  }));
  if (shares.some((s) => s.others !== null)) {
    series.push({
      key: "rest",
      label: `Rest of the field`,
      values: shares.map((s) => s.others?.voteSharePct ?? null),
    });
  }
  const latestShare = a.partyShareSeries.at(0);
  const top = latestShare?.parties.at(0);
  cards.push({
    question: "Who took what share, election by election?",
    chart: lines({
      title: "Vote share by party",
      finding:
        top === undefined || top.voteSharePct === null
          ? "No vote count is on record for the latest election in this window, so no share is computable."
          : `${top.shortName}${top.personName === null ? "" : ` (${top.personName})`} took ` +
            `${percent(top.voteSharePct)} in ${latestShare?.year ?? ""}.`,
      x: years,
      xHeader: "Election",
      series,
      format: percent,
    }),
    note:
      "Share is votes over the contest's valid votes from the turnout row. The published field is a " +
      "truncated top-N, so the named shares do not sum to 100 and the rest of the field is only as " +
      "complete as the source. Where several contestants at one election share a label — " +
      "independents, most often — the line is their combined share for that election, and the votes " +
      "card below names each of them.",
  });

  if (latestShare !== undefined) {
    cards.push({
      question: `Who got the votes in ${latestShare.year}?`,
      chart: bars({
        title: `Votes polled, ${latestShare.year}`,
        finding:
          top?.votes == null
            ? `No candidate's vote count is on record for ${latestShare.year}; the margin is.`
            : `${top.shortName}${top.personName === null ? "" : ` (${top.personName})`} polled ` +
              `${inr(top.votes)}.`,
        dimension: "Party",
        valueHeader: "Votes",
        points: [
          ...latestShare.parties.map((p) => ({
            label: `${p.shortName}${p.personName === null ? "" : ` · ${p.personName}`}`,
            value: p.votes,
            key: p.shortName,
          })),
          ...(latestShare.others === null
            ? []
            : [
                {
                  label: `Rest of the field (${inr(latestShare.others.count)})`,
                  value: latestShare.others.votes,
                },
              ]),
        ],
        format: (v) => (v === null ? "—" : inr(v)),
      }),
      note: null,
    });
  }

  // One card per consecutive pair: swing is a two-point measure and pretending otherwise is how a
  // chart starts lying about which election moved.
  const pairs = [...new Set(a.swingSeries.map((s) => `${s.previousYear}-${s.year}`))].reverse();
  for (const pair of pairs) {
    const rows = a.swingSeries.filter((s) => `${s.previousYear}-${s.year}` === pair);
    const first = rows.at(0);
    if (first === undefined) continue;
    const biggest = rows.reduce<(typeof rows)[number] | null>(
      (best, r) =>
        r.swingPp !== null && (best?.swingPp == null || Math.abs(r.swingPp) > Math.abs(best.swingPp))
          ? r
          : best,
      null,
    );
    const slopeRows: SlopeRow[] = rows.map((r) => ({
      label: r.shortName,
      from: r.previousVoteSharePct,
      to: r.voteSharePct,
    }));
    // Why nothing is computable differs, and the accessible name states the reason, so it has to be
    // the true one: under ?party= the usual cause is that the pinned party has no earlier share, not a
    // missing vote count, and 181 party-filtered cards used to claim the latter.
    const why =
      rows.every((r) => r.voteSharePct === null)
        ? `${first.year} has no vote count on record`
        : rows.every((r) => r.previousVoteSharePct === null)
          ? rows.length === 1
            ? `${first.shortName} has no recorded ${first.previousYear} share to measure from`
            : `none of the ${inr(rows.length)} contestants shown has a recorded ` +
              `${first.previousYear} share to measure from`
          : `every contestant shown is missing one of the two shares, or the pair crosses a ` +
            `boundary epoch`;
    cards.push({
      question: `What moved between ${first.previousYear} and ${first.year}?`,
      chart: slope({
        title: `Vote share, ${first.previousYear} to ${first.year}`,
        finding:
          biggest?.swingPp == null
            ? `No swing is computable across this pair: ${why}.`
            : `${biggest.shortName} swung ${percentagePoints(biggest.swingPp)}.`,
        dimension: "Party",
        fromLabel: String(first.previousYear),
        toLabel: String(first.year),
        rows: slopeRows,
        format: percent,
        delta: percentagePoints,
      }),
      note:
        "A party absent from the earlier election has no swing, not a swing of −100. Where a label " +
        "repeats inside either election — two independents, say — no single predecessor is " +
        "identifiable, so that row's earlier share and swing are blank rather than measured from " +
        "whichever of them the record happens to list last.",
    });
  }

  const margins = asc(a.marginSeries);
  const m0 = a.marginSeries.at(0);
  cards.push({
    question: "Is the seat getting safer or closer?",
    chart: lines({
      title: "Winning margin as a share of votes cast",
      finding:
        m0?.marginPct == null
          ? "No margin is on record for the latest election in this window."
          : `${m0.year}: ${percent(m0.marginPct)} of votes cast` +
            (m0.marginVotes === null ? "" : `, ${inr(m0.marginVotes)} votes`) +
            (m0.winner?.shortName === undefined ? "" : `, to ${m0.winner.shortName}`) +
            ".",
      x: margins.map((p) => String(p.year)),
      xHeader: "Election",
      series: [{ key: "margin", label: "Margin", values: margins.map((p) => p.marginPct) }],
      format: percent,
    }),
    note:
      "The denominator is votes cast, not the electorate, so the trend is comparable across a roll " +
      "that grew.",
  });

  const enps = asc(a.enpSeries);
  const e0 = a.enpSeries.at(0);
  cards.push({
    question: "How many parties really contested?",
    chart: lines({
      title: "Effective number of parties (Laakso–Taagepera)",
      finding:
        e0?.enp == null
          ? "No vote count is on record for the latest election in this window, so no ENP is computable."
          : `${e0.year}: ${enpMeasure.format(e0.enp)}, over ${inr(e0.contestants)} contestants on record.`,
      x: enps.map((p) => String(p.year)),
      xHeader: "Election",
      series: [{ key: "enp", label: "Effective parties", values: enps.map((p) => p.enp) }],
      format: (v) => enpMeasure.format(v),
    }),
    // §13.2: the truncation bias is the measure's validity condition, so it is ON the card.
    note: enpMeasure.caveats.at(0) ?? null,
  });

  return cards;
}

// ── the loader ───────────────────────────────────────────────────────────────────────────────────

export type ChildTable = {
  caption: string;
  headers: string[];
  rows: { href: string; cols: string[] }[];
};

export type PlaceView =
  | { kind: "unavailable"; detail: string }
  | { kind: "not-found" }
  | {
      kind: "ac";
      brief: PlaceBrief;
      analysis: PlaceAnalysis;
      base: string;
      years: number[];
      parties: string[];
      filters: ParsedFilters;
    }
  | {
      kind: "parent";
      level: "state" | "district";
      name: string;
      headline: string;
      children: ChildTable;
      sources: SourceRef[];
      electionId: string | null;
    };

type RepoMod = typeof import("./index.ts");
type DbMod = typeof import("../db/index.ts");
type AnalysisMod = typeof import("./place-analysis.ts");

let mods: Promise<[RepoMod, DbMod, AnalysisMod]> | undefined;

/** ponytail: a second copy of envelope.ts's runtime loader, because `load()` there is not exported
 *  and this cycle does not own that file. Export it there when a third caller appears.
 *  webpackIgnore + an absolute file URL is the form webpack leaves alone (see envelope.ts). */
function load(): Promise<[RepoMod, DbMod, AnalysisMod]> {
  const base = pathToFileURL(join(process.cwd(), "packages/mandate/src/")).href;
  mods ??= Promise.all([
    import(/* webpackIgnore: true */ `${base}repo/index.ts`) as Promise<RepoMod>,
    import(/* webpackIgnore: true */ `${base}db/index.ts`) as Promise<DbMod>,
    import(/* webpackIgnore: true */ `${base}repo/place-analysis.ts`) as Promise<AnalysisMod>,
  ]).catch((cause: unknown) => {
    mods = undefined;
    throw cause;
  });
  return mods;
}

type PlaceRow = { id: string; kind: string; canonical_name: string; parent_id: string | null };

/**
 * Resolve a URL path to a place and read everything its level actually has. One DB open, closed in
 * `finally`; a missing or unmigrated registry comes back as `unavailable` with the command that
 * fixes it, never a thrown build error (constraint 7).
 */
export async function placeView(segments: readonly string[], search: Search): Promise<PlaceView> {
  const target = parsePath(segments);
  if (target === null) return { kind: "not-found" };
  let db: DatabaseSync | undefined;
  let repo: RepoMod | undefined;
  try {
    const [r, sql, an] = await load();
    repo = r;
    db = r.read(() => sql.openRead());
    const idA = target.ids.at(0) ?? "";
    const idB = target.ids.at(1) ?? idA;
    // A CONSTITUENCY IS RESOLVED THROUGH ITS VERSION, not through `place`.
    //
    // `place.canonical_name` is a legacy seat-number grouping and its name is whichever delimitation
    // created the row (migrations 011/012). Arunachal's ar.ac.001 is LUMLA on both of its versions and
    // TAWANG-I on the place row, so matching `place` made /pl/ar/tawang/lumla a 404 while
    // /pl/ar/tawang/tawang-i resolved to a page the rest of the code correctly titles LUMLA. Found by
    // repo/smoke.test.ts, which is the whole reason that suite exists.
    //
    // Newest epoch first, so a name means the seat that carries it NOW. Ancestry narrows on the version's
    // district, because district membership changes with delimitation too.
    const place = r.read(() =>
      sql.get<PlaceRow>(
        db as DatabaseSync,
        target.level === "ac"
          ? `SELECT pl.id, pv.kind, pv.canonical_name, COALESCE(pv.district_place_id, pl.parent_id) AS parent_id
               FROM place_version pv
               JOIN place pl ON pl.id = pv.place_id
               JOIN boundary_epoch be ON be.id = pv.epoch_id
              -- Two placeholders here as well, so both branches of this ternary take the SAME bind list.
              -- Adding one to the jurisdiction branch alone made every AC path raise "column index out of
              -- range" — the binds are positional and shared, and node:sqlite counts them.
              WHERE pv.kind IN (?, ?)
                AND (pl.id = ? OR pl.id = ? OR LOWER(pv.canonical_name) = ?
                     OR LOWER(REPLACE(pv.canonical_name, ' ', '-')) = ?
                     -- The source appends the reservation to the name — 'BISHNUPUR(SC)', 'KHANAPUR(ST)',
                     -- 102 of 16,785 versions — so a name-based URL for one of those never resolved. The
                     -- marker is stripped for MATCHING only; canonical_name keeps whatever the source
                     -- wrote, and pv.reservation is where the reservation is actually read from. (For 25 of
                     -- them the name carries a marker the column does not: a data-quality note, recorded
                     -- rather than reconciled here.)
                     OR REPLACE(REPLACE(REPLACE(REPLACE(UPPER(pv.canonical_name),
                        '(SC)', ''), '(ST)', ''), ' ', ''), '-', '') = ?)
                -- The path asserts an ancestry, and it must narrow the match BEFORE the LIMIT: two ACs
                -- are named Bishnupur, and the lower id is in the other district.
                AND (? IS NULL OR COALESCE(pv.district_place_id, pl.parent_id) = ?)
              ORDER BY CASE WHEN pl.id = ? THEN 0 WHEN pl.id = ? THEN 1 ELSE 2 END,
                       be.effective_from DESC, pl.id
              LIMIT 1`
          // `kind IN (?, ?)`, not `kind = ?`. A one-segment path is a JURISDICTION, and eight of India's
          // thirty-six are union territories with `kind = 'ut'` — so matching 'state' alone 404'd Jammu &
          // Kashmir, Delhi, Puducherry, Ladakh, Chandigarh, Andaman & Nicobar, Lakshadweep and Dadra &
          // Nagar Haveli. Survivable while nothing linked to them; a dead end on the primary navigation
          // surface the moment the national map did, which is how it was found.
          : `SELECT id, kind, canonical_name, parent_id
               FROM place
              WHERE kind IN (?, ?)
                AND (id = ? OR id = ? OR LOWER(canonical_name) = ? OR LOWER(REPLACE(canonical_name, ' ', '-')) = ?
                     OR REPLACE(REPLACE(UPPER(canonical_name), ' ', ''), '-', '') = ?)
                AND (? IS NULL OR parent_id = ?)
              ORDER BY CASE WHEN id = ? THEN 0 WHEN id = ? THEN 1 ELSE 2 END, id
              LIMIT 1`,
        target.level,
        // 'ut' only for a one-segment path; every other level repeats itself, and `IN (x, x)` is `= x`.
        target.level === "state" ? "ut" : target.level,
        idA,
        idB,
        target.name,
        target.name.replace(/\s+/g, "-"),
        target.name.toUpperCase().replace(/[^A-Z0-9]/g, ""),
        target.parentId,
        target.parentId,
        idA,
        idB,
      ),
    );
    if (place === undefined) return { kind: "not-found" };

    if (place.kind !== "ac") return parentView(db, sql, r, place);

    const brief = r.getPlaceBrief(db, place.id);
    if (brief === null) return { kind: "not-found" };
    const parties = r
      .read(() =>
        sql.all<{ name: string | null }>(
          db as DatabaseSync,
          `SELECT DISTINCT COALESCE(pt.short_name, ca.party_raw) AS name
             FROM contest c
             JOIN place_version pv ON pv.id = c.place_version_id
             JOIN result r ON r.contest_id = c.id AND r.revision = 0
             JOIN candidacy ca ON ca.id = r.candidacy_id
             LEFT JOIN party_version pver ON pver.id = ca.party_version_id
             LEFT JOIN party pt ON pt.id = pver.party_id
            WHERE pv.place_id = ?
            ORDER BY name`,
          place.id,
        ),
      )
      .map((row) => row.name)
      .filter((n): n is string => n !== null);
    const years = brief.contests.map((c) => c.year);
    const base = `${placeHref({
      kind: "ac",
      id: place.id,
      canonicalName: place.canonical_name,
      parentId: place.parent_id,
    })}/analysis`;
    const filters = parseFilters(search, { base, years, parties });
    const analysis = an.getPlaceAnalysis(db, place.id, filters.filters);
    if (analysis === null) return { kind: "not-found" };
    return { kind: "ac", brief, analysis, base, years, parties, filters };
  } catch (e) {
    if (repo !== undefined && e instanceof repo.RegistryUnavailableError) {
      return { kind: "unavailable", detail: e.message };
    }
    if (repo === undefined) {
      console.error("mandate: packages/mandate failed to load", e);
      return { kind: "unavailable", detail: unavailable().detail };
    }
    throw e;
  } finally {
    db?.close();
  }
}

type DistrictChildSql = {
  id: string;
  canonical_name: string;
  number: number | null;
  reservation: string | null;
  voters: number | null;
  electors: number | null;
  margin: number | null;
  person_name: string | null;
  party: string | null;
  source_ids: string | null;
};

type StateChildSql = {
  id: string;
  canonical_name: string;
  acs: number;
  voters: number | null;
  electors: number | null;
  winners: string | null;
  source_ids: string | null;
};

/** The ids behind the rows, so a parent level is cited from the same fact rows it renders — no place
 *  above an AC carries a claim, so `loadSources` on the subject ref alone comes back empty. */
function ids(rows: readonly { source_ids: string | null }[]): string[] {
  return [...new Set(rows.flatMap((r) => (r.source_ids ?? "").split(",")))].filter((s) => s !== "");
}

/**
 * A state and a district get what the registry genuinely holds for them: their children, each with
 * its latest declared result. getPlaceAnalysis is an AC measure, so there are no charts here and no
 * placeholder saying there will be.
 */
function parentView(db: DatabaseSync, sql: DbMod, repo: RepoMod, place: PlaceRow): PlaceView {
  // The latest assembly election IN THIS JURISDICTION, by year.
  //
  // This was `SELECT MAX(election_id) FROM contest`, which was survivable while the registry held one
  // state and became wrong the moment it held thirty-one: ids sort lexically, so the maximum is whichever
  // state's name happens to sort last, and a West Bengal district asked for its seats' results in an
  // election held somewhere else — returning nothing at all. The year is the last four characters of every
  // election id (see repo/index.ts yearOf) and `place_version.jurisdiction_id` is what scopes it.
  const jurisdiction = place.kind === "district" ? (place.parent_id ?? place.id) : place.id;
  const election =
    repo.read(() =>
      sql.get<{ id: string | null }>(
        db,
        `SELECT c.election_id AS id
           FROM contest c
           JOIN place_version pv ON pv.id = c.place_version_id
           JOIN election e ON e.id = c.election_id AND e.kind = 'assembly'
          WHERE pv.jurisdiction_id = ?
          ORDER BY e.year DESC, e.polling_month DESC, e.occurrence DESC
          LIMIT 1`,
        jurisdiction,
      ),
    )?.id ?? null;
  const year = election === null ? "" : repo.yearOf(election);


  if (place.kind === "district") {
    const rows = repo.read(() =>
      sql.all<DistrictChildSql>(
        db,
        `SELECT pl.id, pv.canonical_name, pv.number, pv.reservation,
                t.voters, t.electors, r.margin,
                per.canonical_name AS person_name,
                COALESCE(pt.short_name, ca.party_raw) AS party,
                t.source_id || ',' || COALESCE(r.source_id, '') AS source_ids
           FROM place pl
           JOIN place_version pv ON pv.place_id = pl.id
           JOIN contest c ON c.place_version_id = pv.id AND c.election_id = ?
           LEFT JOIN turnout t ON t.contest_id = c.id AND t.scope = 'contest'
           LEFT JOIN result r ON r.contest_id = c.id AND r.revision = 0 AND r.rank = 1
           LEFT JOIN candidacy ca ON ca.id = r.candidacy_id
           LEFT JOIN person per ON per.id = ca.person_id
           LEFT JOIN party_version pver ON pver.id = ca.party_version_id
           LEFT JOIN party pt ON pt.id = pver.party_id
          WHERE pl.parent_id = ? AND pl.kind = 'ac'
          ORDER BY pv.number, pv.canonical_name`,
        election ?? "",
        place.id,
      ),
    );
    const sources = repo.read(() => repo.loadSources(db, ids(rows), [`place:${place.id}`]));
    const counts = tally(rows.map((x) => x.party));
    const lead = counts.at(0);
    return {
      kind: "parent",
      level: "district",
      name: place.canonical_name,
      headline:
        rows.length === 0
          ? `No assembly seat in ${place.canonical_name} has a contest on record.`
          : `${place.canonical_name} has ${inr(rows.length)} assembly seats` +
            (lead === undefined
              ? `, and no declared winner in ${year}.`
              : `; ${lead[0]} won ${inr(lead[1])} of them in ${year}.`),
      children: {
        caption:
          `Every assembly seat in ${place.canonical_name} with its ${year} result — ` +
          `${inr(rows.length)} seat${rows.length === 1 ? "" : "s"}. Open one for its brief.`,
        headers: ["No.", "Seat", "Won by", "Member", "Margin", "Turnout"],
        rows: rows.map((x) => ({
          href: placeHref({
            kind: "ac",
            id: x.id,
            canonicalName: x.canonical_name,
            parentId: place.id,
          }),
          cols: [
            x.number === null ? "—" : String(x.number),
            x.canonical_name + (x.reservation == null ? "" : ` · ${RESERVATION[x.reservation] ?? x.reservation}`),
            x.party ?? "no result declared",
            x.person_name ?? "—",
            x.margin === null ? "—" : inr(Math.abs(x.margin)),
            turnout_pct.format(turnout_pct.compute({ voters: x.voters, electors: x.electors })),
          ],
        })),
      },
      sources,
      electionId: election,
    };
  }

  const rows = repo.read(() =>
    sql.all<StateChildSql>(
      db,
      `SELECT d.id, d.canonical_name, COUNT(DISTINCT pl.id) AS acs,
              SUM(t.voters) AS voters, SUM(t.electors) AS electors,
              GROUP_CONCAT(CASE WHEN r.rank = 1 THEN COALESCE(pt.short_name, ca.party_raw) END) AS winners,
              GROUP_CONCAT(DISTINCT t.source_id) AS source_ids
         FROM place d
         JOIN place pl ON pl.parent_id = d.id AND pl.kind = 'ac'
         JOIN place_version pv ON pv.place_id = pl.id
         JOIN contest c ON c.place_version_id = pv.id AND c.election_id = ?
         LEFT JOIN turnout t ON t.contest_id = c.id AND t.scope = 'contest'
         LEFT JOIN result r ON r.contest_id = c.id AND r.revision = 0 AND r.rank = 1
         LEFT JOIN candidacy ca ON ca.id = r.candidacy_id
         LEFT JOIN party_version pver ON pver.id = ca.party_version_id
         LEFT JOIN party pt ON pt.id = pver.party_id
        WHERE d.parent_id = ? AND d.kind = 'district'
        GROUP BY d.id
        ORDER BY d.canonical_name`,
      election ?? "",
      place.id,
    ),
  );
  const sources = repo.read(() => repo.loadSources(db, ids(rows), [`place:${place.id}`]));
  const seats = rows.reduce((a, x) => a + x.acs, 0);
  const statewide = tally(rows.flatMap((x) => (x.winners ?? "").split(",")));
  const lead = statewide.at(0);
  return {
    kind: "parent",
    level: "state",
    name: place.canonical_name,
    headline:
      rows.length === 0
        ? `No district in ${place.canonical_name} has a contest on record.`
        : `${place.canonical_name} has ${inr(seats)} assembly seats across ${inr(rows.length)} districts` +
          (lead === undefined
            ? `, and no declared winner in ${year}.`
            : `; ${lead[0]} won ${inr(lead[1])} of them in ${year}.`),
    children: {
      caption:
        `Every district with its ${year} seat count and turnout — ${inr(rows.length)} districts, ` +
        `${inr(seats)} seats. Open one for its seats.`,
      headers: ["District", "Seats", "Won most", "Turnout"],
      rows: rows.map((x) => {
        const t = tally((x.winners ?? "").split(","));
        const top = t.at(0);
        return {
          href: placeHref({
            kind: "district",
            id: x.id,
            canonicalName: x.canonical_name,
            parentId: place.id,
          }),
          cols: [
            x.canonical_name,
            inr(x.acs),
            top === undefined ? "no result declared" : `${top[0]} ${inr(top[1])} of ${inr(x.acs)}`,
            turnout_pct.format(turnout_pct.compute({ voters: x.voters, electors: x.electors })),
          ],
        };
      }),
    },
    sources,
    electionId: election,
  };
}

/** Seat counts by party, descending. Blank entries are contests with no declared winner. */
export function tally(names: readonly (string | null)[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const n of names) {
    if (n === null || n.trim() === "") continue;
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

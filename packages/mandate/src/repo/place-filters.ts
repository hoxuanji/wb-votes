// The filter grammar of a seat's pages: ?from=2011&to=2026&party=AITC, read against what the seat actually has. Pure,
// so place-filters.test.ts runs it under node:test.

import type { PlaceAnalysis, PlaceAnalysisFilters } from "./place-analysis.ts";

/** A visible, removable filter: `href` is the same view with this one param dropped (§11). */
export type Chip = { label: string; href: string };

export type ParsedFilters = {
  filters: PlaceAnalysisFilters;
  chips: Chip[];
  /** Rejected params, in plain words, rendered on the page — never silently dropped. */
  ignored: string[];
};

export type Search = Readonly<Record<string, string | string[] | undefined>>;

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

/**
 * What the party filter did to the cards, in words. It narrows the share, votes and swing cards and nothing else, and a
 * party the seat never fielded in the window empties them: a card that is missing, or names no one, with no sentence
 * to say why, reads as a fault. Not `ignored`: the filter was accepted, and it is not a rejected parameter.
 */
export function partyNotices(a: PlaceAnalysis): string[] {
  const party = a.filters.party;
  if (party === undefined) return [];
  const notices = [
    `${party} narrows the share, votes and swing cards. Turnout, margin and effective parties are for every party.`,
  ];
  const years = a.turnoutSeries.map((t) => t.year);
  const [lo, hi] = [Math.min(...years), Math.max(...years)];
  if (a.partyShareSeries.length > 0 && a.partyShareSeries.every((s) => s.parties.length === 0)) {
    notices.push(
      `${party} has no result at ${a.place.canonicalName} in ${lo === hi ? lo : `${lo}–${hi}`}, so the cards ` +
        `below show everyone else together and no swing is drawn.`,
    );
    return notices;
  }
  // A swing is drawn for the parties of the LATER election of a pair, so a pair whose later election has no result for
  // the party has no card.
  for (const r of a.retention) {
    if (!a.swingSeries.some((s) => s.year === r.year && s.previousYear === r.previousYear)) {
      notices.push(`No swing card for ${r.previousYear}–${r.year}: ${party} has no result in ${r.year}.`);
    }
  }
  return notices;
}

/* ─────────────────────────── the roster's order ─────────────────────────── */

/** How a seat's roster of candidates may be ordered. Not by assets, cases or margin: a list sorted by what people declared they owe or are accused of is a leaderboard. */
export type RosterOrder = "default" | "party" | "age";
export const ROSTER_ORDERS: readonly { key: RosterOrder; label: string }[] = [
  { key: "default", label: "Winner, then name" },
  { key: "party", label: "Party" },
  { key: "age", label: "Age" },
];

/** `?order=party|age` and `&dir=desc`, read by MEMBERSHIP: an unknown value falls back to the default and is never parsed or used in SQL. */
export function readOrder(search: Search | undefined): { order: RosterOrder; dir: "asc" | "desc" } {
  const one = (k: string): string | undefined => {
    const v = search?.[k];
    return typeof v === "string" ? v : undefined;
  };
  const order = ROSTER_ORDERS.find((o) => o.key === one("order"))?.key ?? "default";
  return { order, dir: order !== "default" && one("dir") === "desc" ? "desc" : "asc" };
}

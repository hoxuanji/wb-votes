// What the seat page says, computed from the record: the finding (one sentence), the hero and two tiles, the Flagged notes, and the list of what
// the record does not say. Pure functions over what place-view.ts has already loaded: no React, no database, so seat-story.test.ts runs them on
// literals and on every seat of the registry.
//
// THE RULES A SENTENCE KEEPS (`auditFinding` holds them): every number is read from the inputs, a margin with no counts behind it is printed with
// the word "declared", nobody who stood in 2026 is said to have been defeated, and no sentence says "first time" or uses a pronoun. A finding that
// cannot be said falls back to `placeHeadline`, so the page never invents a story: about 137 of the 294 seats have none.

import { inr } from "../semantic/index.ts";
import { sparkline } from "../viz/spark.ts";
import type { Spark } from "../viz/spark.ts";
import { bullet } from "../viz/bullet.ts";
import type { Bullet } from "../viz/bullet.ts";
import { FLAG_POINTS, NARROW_POINTS, marginShareText } from "./close-call.ts";
import { displayName } from "./display-name.ts";
import { figure, text } from "./finding.ts";
import type { Finding, Part } from "./finding.ts";
import type { PlaceBrief } from "./place.ts";
import { placeHeadline } from "./place-presentation.ts";
import type { FieldElection, SeatField } from "./seat-field.ts";
import type { ContestResult, SeatHistory } from "./seat-history.ts";
import type { PartyRef, SeatMargin } from "./seat-results.ts";

const IN = new Intl.NumberFormat("en-IN");

export function ordinal(n: number): string {
  const rest = n % 100;
  const suffix = rest >= 11 && rest <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

const TRY = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

/** Where the seat stands among the margins of its election, for a seat with one election on record. */
export type Widest = { rank: number; of: number; scope: string };

export type SeatStoryInput = {
  brief: PlaceBrief;
  history: SeatHistory;
  field: SeatField;
  widest: Widest | null;
};

const party = (p: PartyRef): Part => ({ party: { key: p.key, code: p.label } });

/** A winner's share of the votes polled for a counted result, where the turnout can be stood behind. */
function marginShareOf(r: ContestResult, brief: PlaceBrief): number | null {
  const c = brief.contests.find((x) => x.contestId === r.contestId);
  if (r.margin === null || r.margin.basis !== "counted" || c === undefined || c.turnout.state !== "reported" || c.voters === null || c.voters <= 0) return null;
  return (100 * Math.abs(r.margin.votes)) / c.voters;
}

/** The counted election decided by the smallest share of the votes polled, with that share. */
export function closestCounted(brief: PlaceBrief, history: SeatHistory): { result: ContestResult; share: number } | null {
  let best: { result: ContestResult; share: number } | null = null;
  for (const r of history.results) {
    const share = marginShareOf(r, brief);
    if (share !== null && r.winner !== null && (best === null || share < best.share)) best = { result: r, share };
  }
  return best;
}

/** What the page says when its newest election has no declared winner: the year, and what the candidacy record says, in words. */
function unloadedNote(input: SeatStoryInput): Part[] | null {
  const newest = input.history.results.at(0);
  if (newest === undefined || newest.winner !== null) return null;
  const e = input.field.elections.find((x) => x.contestId === newest.contestId);
  const named = e?.namedAsElected ?? null;
  return [
    text(
      `No ${newest.year} result is loaded` +
        (named === null ? "." : `; the candidacy record names ${named.display} as elected, but no result row is loaded.`),
    ),
  ];
}

const marginWords = (m: SeatMargin | null): string => (m === null ? "" : `, by ${m.basis === "declared" ? "a declared " : ""}${inr(Math.abs(m.votes))} votes`);

export function seatFinding(input: SeatStoryInput): Finding {
  const { brief, history, field, widest } = input;
  const name = brief.place.canonicalName;
  const headline = placeHeadline(brief);
  const note = unloadedNote(input);
  const plain = (shape: string): Finding => ({ shape, parts: [text(headline)], ...(note === null ? {} : { standfirst: note }) });
  const fieldOf = (contestId: string): FieldElection | undefined => field.elections.find((e) => e.contestId === contestId);

  // 1 · narrow: a counted election decided by under half a point of the votes polled.
  const close = closestCounted(brief, history);
  const r = close?.result;
  if (close !== null && r !== undefined && close.share < NARROW_POINTS && r.runnerUp !== null && r.winner !== null && r.margin !== null) {
    const fe = fieldOf(r.contestId);
    const second = fe?.candidates.find((c) => c.rank === 2);
    const w = fe?.winner ?? null;
    return {
      shape: "narrow",
      parts: [
        text(`${name} was decided by `),
        figure(inr(Math.abs(r.margin.votes))),
        text(` votes in ${r.year}: `),
        { person: { id: w?.personId ?? null, name: displayName(r.winner.name) } },
        text(" "),
        party(r.winner.party),
        text(" "),
        figure(inr(r.winner.votes ?? 0)),
        text(", "),
        { person: { id: second?.personId ?? null, name: displayName(r.runnerUp.name) } },
        text(" "),
        party(r.runnerUp.party),
        text(" "),
        figure(inr(r.runnerUp.votes ?? 0)),
        text("."),
      ],
      standfirst: [text(headline)],
    };
  }

  // 2 · rise: the latest declared winner stood here before, as the same person, and had never won it.
  const decided = history.results.find((r) => r.winner !== null);
  const fe = decided === undefined ? undefined : fieldOf(decided.contestId);
  const winner = fe?.winner ?? null;
  if (decided !== undefined && decided.winner !== null && winner !== null) {
    const earlier = winner.elsewhere.filter((e) => e.year < decided.year);
    if (earlier.length >= 1 && earlier.every((e) => !e.won)) {
      const trail = [
        ...earlier.map((e) => (e.rank === null ? `stood in ${e.year}` : `${ordinal(e.rank)} in ${e.year}`)),
        `${ordinal(winner.rank ?? 1)} in ${decided.year}`,
      ];
      return {
        shape: "rise",
        parts: [
          { person: { id: winner.personId, name: winner.display } },
          text(" "),
          party(decided.winner.party),
          text(` won ${name} at the ${TRY[earlier.length + 1] ?? `${ordinal(earlier.length + 1)}`} try: ${trail.join(", ")}${marginWords(decided.margin)}.`),
        ],
        standfirst: [text(headline), ...(note === null ? [] : [text(" "), ...note])],
      };
    }
  }

  // 3 / 4 · hands and hold are the headline, promoted unchanged.
  if (history.handOffs >= 2) return plain("hands");
  if (history.results.length >= 2 && history.undeclared === 0 && new Set(history.held.map((b) => b.party?.key)).size === 1) return plain("hold");

  // 5 · lone: one election on record, and where its margin stands among those of its election.
  const only = history.results.length === 1 ? history.results[0] : undefined;
  if (only !== undefined && only.winner !== null && only.margin !== null && widest !== null) {
    const c = brief.contests[0];
    return {
      shape: "lone",
      parts: [
        { person: { id: c?.winner?.personId ?? null, name: displayName(only.winner.name) } },
        text(" "),
        party(only.winner.party),
        text(` won ${name} in ${only.year}${marginWords(only.margin)}, the ${ordinal(widest.rank)} widest of the `),
        figure(String(widest.of)),
        text(` ${widest.scope} margins.`),
      ],
    };
  }
  return plain("plain");
}

/** The day the results of this seat were retrieved, as a reader writes it ("15 May 2026"), or null where no result source is recorded. */
export function resultRetrieved(brief: PlaceBrief): string | null {
  const source = brief.sources.find((x) => x.kind === "eci_declaration" || x.kind === "eci_form20");
  return source === undefined
    ? null
    : new Date(source.retrievedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/* ───────────────────────────── the numbers: hero and tiles ───────────────────────────── */

export type Hero = {
  year: number;
  votes: number;
  basis: SeatMargin["basis"];
  party: PartyRef;
  /** The change on the previous election that has a margin, with both of the figures it compares in view. */
  delta: { votes: number; vs: { year: number; votes: number; basis: SeatMargin["basis"]; party: PartyRef } } | null;
  /** Why there is no delta, in words, where there is none. */
  noDelta: string | null;
  spark: Spark;
  /** The list that is the exact form of the line: newest first. */
  twin: { year: string; party: PartyRef | null; votes: number | null; basis: SeatMargin["basis"] | null }[];
  /** The newest election has no declared winner, so the hero shows the last one that has: its year, said. */
  newerMissing: number | null;
};

export type ShareTile = {
  year: number;
  share: number;
  party: PartyRef;
  votes: number | null;
  polled: number | null;
  bar: Bullet;
  delta: { pp: number; year: number; share: number; party: PartyRef } | null;
  /** How many counted elections, and in how many the winner had more than half the votes polled. */
  counted: number;
  overHalf: number;
};

export type TurnoutTile = {
  /** The newest election with a turnout that can be stood behind. */
  year: number;
  pct: number;
  electors: number | null;
  delta: { pp: number; year: number } | null;
  spark: Spark;
  /** Set where a newer election's turnout is withheld: its year, said as a gap and never drawn. */
  pending: number | null;
};

export type SeatNumbers = {
  hero: Hero | null;
  share: ShareTile | null;
  turnout: TurnoutTile | null;
  /** The tiles the record cannot fill, merged into one note, when two or more are absent. */
  absent: string[] | null;
  /** The closest counted margin, where it is narrow enough to say. */
  closest: { votes: number; year: number } | null;
};

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function seatNumbers(input: Pick<SeatStoryInput, "brief" | "history" | "field">): SeatNumbers {
  const { brief, history, field } = input;
  const rs = history.results; // newest first
  const latest = rs.find((r) => r.winner !== null && r.margin !== null);
  let hero: Hero | null = null;
  if (latest !== undefined && latest.winner !== null && latest.margin !== null) {
    const after = rs.slice(rs.indexOf(latest) + 1);
    const prev = after.find((r) => r.winner !== null && r.margin !== null);
    const next = after.at(0);
    const newest = rs[0];
    const points = [...rs].reverse().map((r) => ({
      label: String(r.year),
      value: r.winner !== null && r.margin !== null ? Math.abs(r.margin.votes) : null,
      basis: (r.margin?.basis ?? "counted") as SeatMargin["basis"],
      key: r.winner?.party.key ?? null,
      tip:
        r.winner !== null && r.margin !== null
          ? `${r.year}: ${r.winner.party.label} won by ${IN.format(Math.abs(r.margin.votes))} votes (${r.margin.basis})`
          : `${r.year}: no margin on record`,
    }));
    hero = {
      year: latest.year,
      votes: Math.abs(latest.margin.votes),
      basis: latest.margin.basis,
      party: latest.winner.party,
      delta:
        prev === undefined || prev.winner === null || prev.margin === null
          ? null
          : {
              votes: Math.abs(latest.margin.votes) - Math.abs(prev.margin.votes),
              vs: { year: prev.year, votes: Math.abs(prev.margin.votes), basis: prev.margin.basis, party: prev.winner.party },
            },
      noDelta:
        prev !== undefined
          ? null
          : rs.length === 1
            ? "no comparison: one election on record"
            : next !== undefined && next.winner === null
              ? `no comparison: ${next.year} declared no winner`
              : "no comparison: no earlier election has a margin",
      spark: sparkline({ width: 400, height: 110, zero: true, points }),
      twin: rs.map((r) => ({
        year: r.label,
        party: r.winner?.party ?? null,
        votes: r.winner !== null && r.margin !== null ? Math.abs(r.margin.votes) : null,
        basis: r.winner !== null && r.margin !== null ? r.margin.basis : null,
      })),
      newerMissing: newest !== undefined && newest.winner === null ? newest.year : null,
    };
  }

  // The winner's share of the votes polled, for the newest COUNTED election: never a declared one.
  const countedWins = rs.flatMap((r) => {
    if (r.evidence !== "counted" || r.winner === null) return [];
    const fe = field.elections.find((e) => e.contestId === r.contestId);
    const w = fe?.winner ?? null;
    return w !== null && w.share !== null ? [{ r, w, polled: fe?.votesPolled ?? null }] : [];
  });
  let share: ShareTile | null = null;
  const top = countedWins[0];
  if (top !== undefined && top.w.share !== null) {
    const prev = countedWins[1];
    share = {
      year: top.r.year,
      share: top.w.share,
      party: top.w.party,
      votes: top.w.votes,
      polled: top.polled,
      bar: bullet({ value: top.w.share, target: 50, scale: 100 }),
      delta: prev === undefined || prev.w.share === null ? null : { pp: round1(top.w.share - prev.w.share), year: prev.r.year, share: prev.w.share, party: prev.w.party },
      counted: countedWins.length,
      overHalf: countedWins.filter((c) => (c.w.share ?? 0) > 50).length,
    };
  }

  // Turnout is a point for each election whose turnout is reported; one that is withheld is a gap, and is said to be one.
  const cs = [...brief.contests].reverse();
  const tpoints = cs.map((c) => ({
    label: String(c.year),
    value: c.turnout.state === "reported" ? round1(c.turnout.pct) : null,
    basis: "counted" as const,
    key: null,
    tip: c.turnout.state === "reported" ? `${c.year}: ${round1(c.turnout.pct)}% turnout` : `${c.year}: turnout not drawn`,
  }));
  const reported = brief.contests.filter((c) => c.turnout.state === "reported");
  let turnout: TurnoutTile | null = null;
  const t0 = reported[0];
  if (t0 !== undefined && t0.turnout.state === "reported") {
    const t1 = reported[1];
    turnout = {
      year: t0.year,
      pct: t0.turnout.pct,
      electors: t0.electors,
      delta: t1 !== undefined && t1.turnout.state === "reported" ? { pp: round1(t0.turnout.pct - t1.turnout.pct), year: t1.year } : null,
      spark: sparkline({ width: 400, height: 90, zero: false, points: tpoints }),
      pending: brief.contests[0] !== undefined && brief.contests[0].turnout.state === "unverified" ? brief.contests[0].year : null,
    };
  }

  const absent = [
    ...(share === null ? ["The winner's share of the votes polled"] : []),
    ...(share === null ? ["Every other candidate's votes, and the runner-up"] : []),
    ...(turnout === null ? ["Turnout and electors"] : []),
  ];
  const close = closestCounted(brief, history);
  return {
    hero,
    share,
    turnout,
    absent: share === null && turnout === null ? absent : null,
    closest: close !== null && close.share < NARROW_POINTS && close.result.margin !== null ? { votes: Math.abs(close.result.margin.votes), year: close.result.year } : null,
  };
}

/* ───────────────────────────── panels, roster, notes ───────────────────────────── */

/**
 * One scale for every counted panel of a seat, so the bars compare across elections: the smallest multiple of ten that leaves the largest share
 * clear of the edge (at least five points of room), and never under 60, so the 50% line always has ground on both sides of it.
 */
export function panelScale(field: SeatField): number {
  const shares = field.elections.flatMap((e) => (e.evidence === "counted" ? e.candidates.flatMap((c) => (c.share === null ? [] : [c.share])) : []));
  if (shares.length === 0) return 60;
  return Math.max(60, Math.ceil((Math.max(...shares) + 5) / 10) * 10);
}

/** A sentence over the roster that is computed from it: who stood, how old, what they declared. */
export function rosterLead(e: FieldElection): string {
  const n = e.candidates.length;
  const independents = e.candidates.filter((c) => c.party.label === "IND").length;
  const ages = e.candidates.flatMap((c) => (c.age === null ? [] : [c.age]));
  const assets = e.candidates.flatMap((c) => (c.assets === null ? [] : [c.assets]));
  const said = [
    n === 1
      ? `One candidate is on record for ${e.year}.`
      : `${n} candidates stood in ${e.year}: ${n - independents} for named parties and ${independents} ${independents === 1 ? "independent" : "independents"}.`,
    ages.length === 0 ? null : `Ages ${Math.min(...ages)} to ${Math.max(...ages)}.`,
    assets.length === 0
      ? null
      : `Declared assets run from ${money(Math.min(...assets))} to ${money(Math.max(...assets))}${assets.length < n ? `, of the ${assets.length} who declared` : ""}.`,
  ].filter((s): s is string => s !== null);
  return said.join(" ");
}

/** Rupees as the reader says them: Rs 40,627, Rs 63.4 lakh, Rs 4.37 crore. */
export function money(n: number): string {
  if (n >= 1e7) return `Rs ${round2(n / 1e7)} crore`;
  if (n >= 1e5) return `Rs ${round2(n / 1e5)} lakh`;
  return `Rs ${IN.format(n)}`;
}
const round2 = (n: number): string => (Math.round(n * 100) / 100).toString();

export type Flag = { text: string; rule: string };

/** The stated-rule notes for a seat, over EVERY election on record (the old Flagged looked at the newest only). Empty when no rule fires. */
export function seatFlags(input: Pick<SeatStoryInput, "brief" | "history" | "field">): Flag[] {
  const out: Flag[] = [];
  for (const r of input.history.results) {
    const share = marginShareOf(r, input.brief);
    if (share !== null && share < FLAG_POINTS && r.margin !== null) {
      out.push({
        rule: `a counted winning margin under ${FLAG_POINTS}% of the votes polled`,
        text: `${r.year}: decided by ${inr(Math.abs(r.margin.votes))} votes, ${marginShareText(share)}% of the votes polled.`,
      });
    }
  }
  for (const e of input.field.elections) {
    if (e.evidence === "none") out.push({ rule: "a contest with nobody in it", text: `${e.year}: the contest has no candidates on record.` });
    if (e.namedAsElected !== null && e.winner === null) {
      out.push({
        rule: "a candidacy and a result that disagree",
        text: `${e.year}: the candidacy record names ${e.namedAsElected.display} as elected, and no result row declares a winner.`,
      });
    }
  }
  return out;
}

export type Limit = { id: string; text: string };

/** What the record cannot say about this seat, each absence once, and each only where it is true. */
export function seatLimits(input: Pick<SeatStoryInput, "brief" | "history" | "field">): Limit[] {
  const { brief, history, field } = input;
  const out: Limit[] = [];
  const declared = field.elections.filter((e) => e.evidence === "declared");
  if (declared.length > 0) {
    out.push({
      id: "declared",
      text: `${declared.map((e) => e.year).join(" and ")}: the registry holds the declared winner and the declared margin, and no candidate's votes, no runner-up, no order of finish and no verified turnout.`,
    });
  }
  const roster = field.elections.filter((e) => e.evidence === "roster");
  if (roster.length > 0) {
    out.push({ id: "roster", text: `${roster.map((e) => e.year).join(" and ")}: the registry holds the people who stood and no result for the seat.` });
  }
  const capped = field.elections.filter((e) => e.evidence === "counted" && e.candidates.length >= 5).map((e) => e.year).sort((a, b) => a - b);
  if (capped.length > 0) {
    out.push({
      id: "cap",
      text: `${capped.join(", ")}: the registry holds the leading five candidates only, so nobody below fifth place appears and the shares do not add up to the votes polled.`,
    });
  }
  for (const l of field.lookAlikes) {
    out.push({
      id: `look-${l.name}`,
      text: `${l.records.map((r) => `"${r.name}" (${r.years.join(", ")})`).join(", ")} are ${l.records.length} separate records with similar names. No line joins them, and this page does not say they are one person.`,
    });
  }
  const pop = brief.demographics.find((d) => d.value.key === "population");
  if (pop !== undefined && typeof pop.value.value === "number") {
    out.push({
      id: "census",
      text: `Population on record is ${brief.place.districtName ?? "the district"}'s (Census ${pop.value.sourceYear ?? "year not recorded"}: ${IN.format(pop.value.value)}), not this seat's.`,
    });
  }
  if (history.results.length === 0) out.push({ id: "none", text: "No contest is on record for this seat." });
  return out;
}

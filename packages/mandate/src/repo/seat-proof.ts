// The three proof figures the redesign left until last, as data and words: the seat's photo-finish ruler (a narrow result), the margin-rank figure
// (a lone margin among every other seat's of its election) and the Analysis's margin field strip. Pure functions over what place-view.ts has already
// loaded: no React, no database, so seat-proof.test.ts runs them on every seat of the registry.
//
// EACH FIGURE EXISTS BECAUSE A SENTENCE SAYS SOMETHING IT CANNOT SHOW BY ITSELF. "Decided by 57 votes" is a number a reader cannot picture against a
// total of 1.16 lakh; "the 24th widest of 42" says nothing about how the 42 are spread. So a figure is built only when the finding that needs it was
// chosen (`seatFinding`'s own `shape`), and from the same inputs, so the page cannot draw a ruler for a seat whose sentence is about something else.
//
// THE RULES THEY KEEP (the property tests hold them on every seat):
//  · the close-call rule is the one rule (close-call.ts) and the rank is the one rank (place-baselines.ts): a figure never orders seats another way;
//  · a ruler is drawn for a COUNTED election only, from the two candidates' votes; a margin that was only declared has no totals to put on a ruler;
//  · a list of every margin is drawn only if every contest of the election is in it, because a place among some of the seats is not a place among
//    all of them; otherwise one sentence says how many are missing, and nothing is drawn;
//  · a margin without counts behind it is dashed in a bar and hollow in a dot, and the figure's caption says so;
//  · a seat with no declared winner has no margin, so it has no bar and no dot: it is counted in a sentence, never drawn at zero;
//  · the words keep the finding's rules: every number is read from the inputs or from the geometry, no pronoun, no causal reading.

import { inr } from "../semantic/index.ts";
import { marginColumns } from "../viz/margin-columns.ts";
import { photoFinish } from "../viz/seat-ruler.ts";
import type { Finish } from "../viz/seat-ruler.ts";
import { seatStrip } from "../viz/seat-strip.ts";
import type { Strip } from "../viz/seat-strip.ts";
import { marginShareText } from "./close-call.ts";
import { displayName } from "./display-name.ts";
import type { Finding } from "./finding.ts";
import type { MarginField, MarginRank, RankedSeat } from "./place-baselines.ts";
import type { PlaceBrief } from "./place.ts";
import type { PlaceStory } from "./place-story.ts";
import type { PartyRef } from "./seat-results.ts";
import { closestCounted, ordinal } from "./seat-story.ts";
import type { SeatStoryInput } from "./seat-story.ts";

/** The parties of a set of seats with how many each won, largest first, then by code: the key of a figure whose dots are inked by party. */
export type PartyCount = { key: string; code: string; n: number };

function partyCounts(parties: readonly PartyRef[]): PartyCount[] {
  const by = new Map<string, PartyCount>();
  for (const p of parties) {
    const have = by.get(p.key);
    if (have === undefined) by.set(p.key, { key: p.key, code: p.label, n: 1 });
    else have.n += 1;
  }
  return [...by.values()].sort((a, b) => b.n - a.n || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}


/* ───────────────────────────── the photo finish ───────────────────────────── */

export type FinishSide = { name: string; display: string; personId: string | null; party: PartyRef; votes: number };

export type PhotoFinish = {
  year: number;
  label: string;
  winner: FinishSide;
  runnerUp: FinishSide;
  /** Votes between them. */
  gap: number;
  /** The gap as points of the votes polled, in the close-call rule's own words ("0.02"), or null where the votes polled cannot be stood behind. */
  share: string | null;
  geometry: Finish;
  /** Under the figure: what the bars are, what the ruler is, and that the ruler is not a bar. */
  caption: string;
  /** What a screen reader hears for the ruler, which is not a list of its parts. */
  ariaLabel: string;
};

/**
 * The ruler for a seat whose finding is `narrow`, from the counted election that finding cites, or null for every other seat. A tie (a gap of 0) has
 * nothing to magnify and is drawn as nothing.
 */
export function photoFinishOf(input: SeatStoryInput, finding: Finding): PhotoFinish | null {
  if (finding.shape !== "narrow") return null;
  const close = closestCounted(input.brief, input.history);
  const r = close?.result;
  if (close === null || r === undefined || r.winner === null || r.runnerUp === null || r.margin === null || r.margin.basis !== "counted") return null;
  if (r.winner.votes === null || r.runnerUp.votes === null) return null;
  const field = input.field.elections.find((e) => e.contestId === r.contestId);
  const w = field?.winner ?? null;
  const second = field?.candidates.find((c) => c.rank === 2) ?? null;
  const a = r.winner.votes;
  const b = r.runnerUp.votes;
  const gap = Math.abs(a - b);
  if (gap === 0) return null;
  const geometry = photoFinish(a, b);
  const side = (c: { name: string; party: PartyRef; votes: number }, personId: string | null): FinishSide => ({
    name: c.name,
    display: displayName(c.name),
    personId,
    party: c.party,
    votes: c.votes,
  });
  const winner = side({ name: r.winner.name, party: r.winner.party, votes: a }, w?.personId ?? null);
  const runnerUp = side({ name: r.runnerUp.name, party: r.runnerUp.party, votes: b }, second?.personId ?? null);
  const ru = geometry.ruler;
  return {
    year: r.year,
    label: r.label,
    winner,
    runnerUp,
    gap,
    share: marginShareText(close.share),
    geometry,
    caption:
      `The bars are the two totals measured from zero on one scale, so they are the same length to the eye. The ruler magnifies the stretch from ${inr(ru.lo)} to ${inr(ru.hi)} votes, and the winner's dot is the ringed one. ` +
      (ru.startsAtZero ? "It is a ruler and not a bar." : "It is a ruler and not a bar, so it does not start at zero."),
    ariaLabel: `${winner.display} ${winner.party.label} ${inr(a)} votes and ${runnerUp.display} ${runnerUp.party.label} ${inr(b)} votes in ${r.year}: ${inr(gap)} votes apart, ${marginShareText(close.share)}% of the votes polled. The ruler runs from ${inr(ru.lo)} to ${inr(ru.hi)}.`,
  };
}

/* ───────────────────────────── the margin among all ───────────────────────────── */

export type RankBar = {
  id: string;
  name: string;
  href: string;
  party: PartyRef;
  votes: number;
  basis: "counted" | "declared";
  /** Of the widest bar, 0 to 1; the bars start at zero. */
  frac: number;
  dashed: boolean;
  /** 1 is the widest. */
  rank: number;
  self: boolean;
};

export type MarginRankFigure =
  | {
      shape: "drawn";
      year: number;
      scope: string;
      of: number;
      /** The seat's place, counted from the widest: the sentence's own number. */
      rank: number;
      /** Widest first. */
      bars: RankBar[];
      max: number;
      self: RankBar;
      /** The seat's label sits at the left, the middle or the right of the plot, whichever keeps it inside. */
      align: "start" | "center" | "end";
      keys: PartyCount[];
      widest: RankBar;
      narrowest: RankBar;
      caption: string;
      ariaLabel: string;
    }
  | { shape: "withheld"; year: number; text: string };

/**
 * The figure for a seat whose finding is `lone`: every margin of its election in its state, widest first, the seat's outlined. Null for every other
 * seat. If the election has a contest with no declared margin the list would be a list of some of the seats, so the answer is a sentence that says so.
 */
export function marginRankFigure(input: SeatStoryInput, finding: Finding, margins: ReadonlyMap<string, MarginField>): MarginRankFigure | null {
  if (finding.shape !== "lone" || input.widest === null) return null;
  const only = input.brief.contests[0];
  const field = only === undefined ? undefined : margins.get(only.electionId);
  if (only === undefined || field === undefined) return null;
  const missing = field.contests - field.seats.length;
  if (missing > 0) {
    return {
      shape: "withheld",
      year: only.year,
      text: `${missing} of the ${field.contests} contests of ${only.year} ${missing === 1 ? "has" : "have"} no declared margin, so a place among all of them cannot be drawn.`,
    };
  }
  // Widest first: the reverse of the one order.
  const ranked = [...field.seats].reverse();
  const placed = marginColumns(
    ranked.map((s) => ({ id: s.placeId, label: s.name, votes: s.votes, basis: s.basis, key: s.party.key, changedHands: false })),
    { signed: false },
  );
  const here = input.brief.place.id;
  const bars = ranked.map(
    (s, i): RankBar => ({
      id: s.placeId,
      name: s.name,
      href: s.href,
      party: s.party,
      votes: s.votes,
      basis: s.basis,
      frac: (placed.cols[i] as { frac: number }).frac,
      dashed: (placed.cols[i] as { dashed: boolean }).dashed,
      rank: i + 1,
      self: s.placeId === here,
    }),
  );
  const self = bars.find((b) => b.self);
  const widest = bars[0];
  const narrowest = bars.at(-1);
  if (self === undefined || widest === undefined || narrowest === undefined) return null;
  const centre = (self.rank - 0.5) / bars.length;
  const anyDeclared = bars.some((b) => b.dashed);
  return {
    shape: "drawn",
    year: only.year,
    scope: field.scope,
    of: bars.length,
    rank: self.rank,
    bars,
    max: placed.max,
    self,
    align: centre < 0.3 ? "start" : centre > 0.7 ? "end" : "center",
    keys: partyCounts(bars.map((b) => b.party)),
    widest,
    narrowest,
    caption:
      `Each bar is one seat's winning margin in votes, measured from zero, widest first. ${self.name} is outlined.` +
      (anyDeclared ? ` ${bars.every((b) => b.dashed) ? "Every bar is dashed, because every margin was declared by the source with no counts behind it." : "A dashed bar is a margin the source declared with no counts behind it."}` : ""),
    ariaLabel: `${self.name}'s margin of ${inr(self.votes)} votes is the ${ordinal(self.rank)} widest of the ${bars.length} ${field.scope} margins of ${only.year}.`,
  };
}

/* ───────────────────────────── the margin field strip ───────────────────────────── */

export type MarginStrip = {
  electionId: string;
  year: number;
  scope: string;
  /** The seats on the strip, and the contests of the election: the difference have no declared winner and so no margin. */
  of: number;
  contests: number;
  noMargin: number;
  /** The seat's rank from the closest, the one rank the hero prints. */
  rank: MarginRank;
  self: RankedSeat;
  strip: Strip;
  keys: PartyCount[];
  declared: number;
  counted: number;
  /** Closest first: the exact form of the strip, one row for each dot. */
  rows: RankedSeat[];
  /** The label beside the seat's ring. */
  selfLabel: string;
  /** What is left off the strip, in words, or null where nothing is. */
  left: string | null;
  caption: string;
  ariaLabel: string;
};

const tipOf = (s: RankedSeat): string => `${s.name} · ${s.party.label} · ${inr(s.votes)} votes (${s.basis})`;

/**
 * The strip for the election the Analysis's margin hero is about: a dot for each seat of that election in the state, inked by the winner's party, the
 * seat ringed. Null where the seat is not ranked (no hero, or a registry with no margins for the election).
 */
export function marginStripOf(story: PlaceStory, margins: ReadonlyMap<string, MarginField>, brief: PlaceBrief): MarginStrip | null {
  const placeId = brief.place.id;
  const rank = story.hero?.rank ?? null;
  const field = rank === null ? undefined : margins.get(rank.electionId);
  if (rank === null || field === undefined || story.hero === null) return null;
  const self = field.seats.find((s) => s.placeId === placeId);
  if (self === undefined) return null;
  const strip = seatStrip(field.seats.map((s) => ({ id: s.placeId, value: s.votes, key: s.party.key, basis: s.basis, self: s.placeId === placeId, tip: tipOf(s) })));
  const noMargin = field.contests - field.seats.length;
  const declared = field.seats.filter((s) => s.basis === "declared").length;
  const year = story.hero.year;
  const scope = field.scope;
  const left = [
    noMargin === 0 ? null : `${noMargin} of the ${field.contests} contests of ${year} ${noMargin === 1 ? "has" : "have"} no declared winner and so no margin, and no dot.`,
    strip.unplaced === 0 ? null : `${strip.unplaced} ${strip.unplaced === 1 ? "margin is" : "margins are"} 0 votes, which is no place on a log axis, and has no dot.`,
  ].filter((s): s is string => s !== null);
  return {
    electionId: field.electionId,
    year,
    scope,
    of: field.seats.length,
    contests: field.contests,
    noMargin,
    rank,
    self,
    strip,
    keys: partyCounts(field.seats.map((s) => s.party)),
    declared,
    counted: field.seats.length - declared,
    rows: field.seats,
    selfLabel: `${self.name} · ${inr(self.votes)} votes`,
    left: left.length === 0 ? null : left.join(" "),
    caption:
      `One dot for each ${scope} seat's winning margin in ${year}, inked by the winner's party. ${self.name} is ringed. The axis is logarithmic: each labelled tick is ten times the one before it, so equal distances are equal ratios.` +
      (declared === 0 ? "" : declared === field.seats.length ? " Every dot is hollow, because every margin was declared by the source with no counts behind it." : " A hollow dot is a margin the source declared with no counts behind it."),
    ariaLabel: `${self.name}'s margin of ${inr(self.votes)} votes is the ${rank.rank === 1 ? "closest" : `${ordinal(rank.rank)} closest`} of the ${field.seats.length} ${scope} margins of ${year}.`,
  };
}

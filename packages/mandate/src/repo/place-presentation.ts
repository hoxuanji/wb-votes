// Floor 1 (Brief) + Floor 2 (Analysis) wording for a PLACE: the computed headline, the stat tiles, the flagged
// anomalies and the eight question-titled cards. Pure functions over what place-view.ts loaded — no React and no
// database, so place-presentation.test.ts runs the lot under node:test.

import { enp as enpMeasure, inr, margin_pct, percent, percentagePoints } from "../semantic/index.ts";
import type { Chart, Series, SlopeRow } from "../viz/charts.ts";
import { bars, lines, slope } from "../viz/charts.ts";
import { OTHERS } from "../viz/palette.ts";
import { fillFor } from "../viz/party-ink.ts";
import type { Tile } from "./brief.ts";
import { fromRepo } from "./brief.ts";
import type { PlaceBrief, SourceRef } from "./index.ts";
import type { PartyPoint, PartySharePoint, PlaceAnalysis } from "./place-analysis.ts";
import { gaps } from "./seat-list.ts";
import { marginFrom } from "./seat-results.ts";

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
 *
 * Votes polled is the turnout row's, so a share of it is exactly as trustworthy as the turnout: null unless the
 * election's turnout is `reported`, and what a caller says instead is the margin in votes, a sourced fact.
 */
function marginPct(c: PlaceBrief["contests"][number]): number | null {
  if (c.turnout.state !== "reported") return null;
  return margin_pct.compute({
    rank1Votes: c.margin === null ? null : Math.abs(c.margin),
    rank2Votes: 0,
    validVotes: c.voters,
  });
}

export function times(n: number): string {
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
      : ` ${inr(unknown)} of the ${inr(cs.length)} elections on record ${unknown === 1 ? "has" : "have"} no declared winner.`;
  // "Changed hands 0 times" counts an election nobody won as one nobody lost. Past a gap only "none is on record" is
  // true, which is what the strip over the seat says. The branches that use this come after the unbroken hold, so
  // 0 flips here always means there is a gap.
  const since = `since ${oldest.year}`;
  const hands = (verb: "changed" | "has changed") =>
    flips === 0 ? `no change of hands is on record ${since}` : `the seat ${verb} hands ${times(flips)} ${since}`;

  if (flips === 0 && parties.size === 1 && w !== null && unknown === 0) {
    const now = marginPct(latest);
    const then = marginPct(oldest);
    // Shares need both ends: an election whose votes polled are unverified is compared in votes, which are on record.
    const trend =
      now === null
        ? latest.margin === null
          ? null
          : `most recently by ${inr(Math.abs(latest.margin))} votes`
        : then === null || then === 0
          ? `on margins of ${percent(now)} of votes cast in ${latest.year}`
          : now < then
            ? `but its margin fell ${percent(round1(((then - now) / then) * 100))} over that run, ` +
              `from ${percent(then)} of votes cast to ${percent(now)}`
            : `and its margin grew from ${percent(then)} of votes cast to ${percent(now)}`;
    return `${w} has held ${name} in all ${inr(cs.length)} elections ${since}${trend === null ? "" : `, ${trend}`}.`;
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
      `${name} has no declared winner for ${latest.year}; ` +
      (flips === 0 ? "no change of hands is on record" : `the seat changed hands ${times(flips)}`) +
      ` across the ${inr(cs.length)} elections on record ${since}.${gap}`
    );
  }
  if (held) {
    return (
      `${w} has held ${name} for ${inr(run)} straight elections, by ${inr(Math.abs(latest.margin ?? 0))} ` +
      `votes in ${latest.year}, and ${hands("changed")}.${gap}`
    );
  }
  // An election with no declared winner before this one has no holder to take the seat from.
  const from = prev === undefined ? null : won(prev);
  return (
    `${from === null ? `${w} won ${name}` : `${w} took ${name} from ${from}`} in ${latest.year} by ` +
    `${inr(Math.abs(latest.margin ?? 0))} votes — ${hands("has changed")}.${gap}`
  );
}

// ── Floor 1: the tiles ───────────────────────────────────────────────────────────────────────────

function sourceOf(sources: readonly SourceRef[], kinds: readonly string[]): SourceRef | null {
  return sources.find((s) => kinds.includes(s.kind)) ?? null;
}

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
    /**
     * A TILE IS A CLAIM, so an uncorroborated figure cannot fill one.
     *
     * West Bengal 2026's seat turnouts are part of the same defective import as its 93.0% aggregate, and a
     * tile that reads "93.4%" with "+1.2pp vs Murshidabad" underneath is TWO assertions built on it — the
     * comparison implies both sides are sound. So the value becomes the pending state and the note stops
     * comparing, rather than the tile quietly disappearing: a reader looking for turnout should find out
     * why it is missing at the place they went looking.
     */
    const shown = latest.turnout.state === "reported" ? latest.turnout.pct : null;
    out.push({
      label: `Turnout ${latest.year}`,
      value: latest.turnout.state === "unverified" ? "verification pending" : percent(shown),
      unit:
        latest.turnout.state === "unverified"
          ? "not reconciled against votes cast"
          : latest.electors === null
            ? null
            : `of ${inr(latest.electors)} electors`,
      note:
        latest.turnout.state === "unverified"
          ? "this election published no candidate vote counts"
          : latest.turnout.state === "absent"
            ? "no turnout is on record for this election"
            : shown === null || d === null
              ? "no district baseline on record"
              : `${percentagePoints(round1(shown - d))} vs ${b.place.districtName ?? "district"}` +
                (s === null ? "" : ` · state ${percent(s)}`),
      source: result,
    });
    // The margin in votes is a sourced fact and is always said; its share of votes cast is said only where votes
    // cast can be stood behind, and where it cannot the note says which gap it is (seat-list's words for it).
    const share = marginPct(latest);
    const basis = marginFrom(latest.winner?.votes ?? null, latest.runnerUp?.votes ?? null, latest.margin)?.basis ?? null;
    const gap = gaps({
      partyLabel: latest.winner?.partyShortName ?? null,
      runnerUpLabel: latest.runnerUp?.partyShortName ?? null,
      marginVotes: latest.margin === null ? null : Math.abs(latest.margin),
      marginBasis: basis,
      marginPct: share,
      turnout: latest.turnout,
    }).share;
    const parties =
      latest.winner?.partyShortName == null
        ? null
        : `${latest.winner.partyShortName}${
            latest.runnerUp?.partyShortName == null ? "" : ` over ${latest.runnerUp.partyShortName}`
          }`;
    const said =
      latest.margin === null
        ? latest.winner === null
          ? "no result declared"
          : null
        : share === null
          ? gap
          : `${percent(share)} of votes cast`;
    out.push({
      label: `Winning margin ${latest.year}`,
      value: latest.margin === null ? "—" : inr(Math.abs(latest.margin)),
      unit: basis === "declared" ? "votes (declared)" : "votes",
      note: [said, parties].filter((x): x is string => x !== null).join(" · ") || null,
      source: result,
    });
  }

  const flips =
    a === null
      ? null
      : a.retention.filter((r) => r.held === 0).length;
  // "Never" is a claim about every election, so it is made only where each declared a winner and there are two to
  // compare: the strip over the seat (heldCaption) says the same, and the tile may not say more than it does.
  const undeclared = b.contests.filter((c) => c.winner === null).length;
  out.push({
    label: "Changed hands",
    value:
      flips === null
        ? "—"
        : flips > 0
          ? times(flips)
          : b.contests.length < 2
            ? "not comparable"
            : undeclared > 0
              ? "none on record"
              : "never",
    unit: null,
    note:
      b.contests.length === 0 || oldest === undefined
        ? "no elections on record"
        : b.contests.length === 1
          ? `one election on record, ${oldest.year}; no earlier one to compare`
          : `across ${inr(b.contests.length)} elections since ${oldest.year}` +
            (undeclared === 0 ? "" : `; ${inr(undeclared)} with no declared winner`),
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
        // "the registry holds no..." was our word for it, not the reader's. The FACT is material — a
        // district figure standing in for a seat figure changes what a reader may conclude from it, which
        // is exactly the contextual exception the provenance rule allows — so the sentence stays and the
        // schema noun goes.
        `${b.place.districtName ?? "district"}-wide, not this seat's — no seat-level census figure is ` +
        `published` +
        (typeof note === "string" ? ` · ${note}` : ""),
      source: pop.sources.at(0) ?? null,
    });
  }
  return out;
}

// ── Floor 1: flagged anomalies ───────────────────────────────────────────────────────────────────

/** What is unusual about this seat, stated as facts with their figures. Empty is a legitimate
 *  answer, and the page says that no rule fired rather than printing an empty frame. */
export function anomalies(b: PlaceBrief, a: PlaceAnalysis | null): string[] {
  const out: string[] = [];
  const latest = b.contests.at(0);
  const t0 = a?.turnoutSeries.at(0) ?? null;
  /**
   * AN ANOMALY IS A CLAIM, AND A CLAIM NEEDS A FIGURE WE STAND BEHIND.
   *
   * Both sentences below are turnout claims, so both wait on the same reading the tile uses. They once waited on
   * nothing, and the page CONTRADICTED ITSELF — "verification pending" in the turnout tile and "Turnout at or above
   * 95% (96.6%) is at the top of the state's range" four lines underneath — which gives a reader who noticed the
   * caveat a reason to distrust it. `turnoutSeries` withholds an unverified election's turnout too now, so the two
   * agree; the reading stays the authority here because the Brief's contests carry it.
   */
  const trusted = t0 !== null && b.contests.find((c) => c.year === t0.year)?.turnout.state === "reported";
  if (trusted && t0?.turnoutPct != null && t0.districtTurnoutPct !== null) {
    const gap = round1(t0.turnoutPct - t0.districtTurnoutPct);
    if (Math.abs(gap) >= 5) {
      out.push(
        `Turnout of ${percent(t0.turnoutPct)} in ${t0.year} is ${percentagePoints(gap)} against ` +
          `${a?.place.districtName ?? "the district"}'s ${percent(t0.districtTurnoutPct)}. ` +
          `That gap is in the record; the reason for it is not.`,
      );
    }
  }
  if (trusted && t0?.turnoutPct != null && t0.turnoutPct >= 95) {
    out.push(`Turnout at or above 95% (${percent(t0.turnoutPct)}) is at the top of the state's range.`);
  }
  // A share of votes polled waits on the same reading (marginPct): over an unverified turnout it is no claim to flag.
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

/** What a table says where a figure is missing and the reason is known; where it is not, the dash stays. */
const WITHHELD = "withheld"; // the election's votes cast are unverified (turnout-trust.ts)
const NO_COUNTS = "no counts"; // the election declared a winner and published no candidate vote counts
const NO_RESULT = "no result"; // the election declared nothing for this seat

/** Every candidate on record at an election, whether the fold named it or put it in the bucket. */
function fieldOf(s: PartySharePoint): PartyPoint[] {
  return [...s.parties, ...(s.others?.parties ?? [])];
}

/** Why an election has no vote share to print, when it has none at all. */
function noShare(s: PartySharePoint | undefined): string | undefined {
  const field = s === undefined ? [] : fieldOf(s);
  return s === undefined || field.length === 0
    ? NO_RESULT
    : field.every((p) => p.voteSharePct === null)
      ? NO_COUNTS
      : undefined;
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
  const against = (year: number, pct: number, d: number | null): string =>
    d === null
      ? `${year}: ${percent(pct)} here; no district baseline on record.`
      : `${year}: ${percent(pct)} here against ${percent(d)} in ${district} (${percentagePoints(round1(pct - d))}).`;
  // A withheld election is not one with no turnout, so the card says which it is, and compares for the newest
  // election whose turnout can be checked.
  const checked = a.turnoutSeries.find((p) => !p.unverified && p.turnoutPct !== null);
  // The seat's own cell says withheld only where the source gave a turnout to withhold: a seat with none (a repoll) has
  // no figure to hold back, and the district and state, which sum the other seats, do.
  const held = turnout.map((p) => (p.unverified ? WITHHELD : undefined));
  const heldSeat = turnout.map((p) => (p.unverified && p.voters !== null && p.electors !== null ? WITHHELD : undefined));
  cards.push({
    question: `Did ${seat} turn out more than ${district}?`,
    chart: lines({
      title: `Turnout, seat against district and state`,
      finding:
        t0?.unverified === true
          ? `${t0.year}: turnout is withheld (verification pending), because that election published no ` +
            `candidate vote counts to check it against.` +
            (checked?.turnoutPct == null
              ? ""
              : ` Verified most recently, ${against(checked.year, checked.turnoutPct, checked.districtTurnoutPct)}`)
          : t0?.turnoutPct == null
            ? "No turnout figure is on record for the latest election in this window."
            : against(t0.year, t0.turnoutPct, t0.districtTurnoutPct),
      x: years,
      xHeader: "Election",
      series: [
        { key: "seat", label: seat, values: turnout.map((p) => p.turnoutPct), absent: heldSeat },
        { key: "district", label: district, values: turnout.map((p) => p.districtTurnoutPct), absent: held },
        { key: "state", label: stateLabel, values: turnout.map((p) => p.stateTurnoutPct), absent: held },
      ],
      format: percent,
    }),
    note: null,
  });

  const shares = asc(a.partyShareSeries);
  const pinned = a.filters.party !== undefined;
  // Keyed by label, with every runner under that label in that election SUMMED into it. Taking the
  // first match instead dropped the second of two contestants sharing a label ("IND", most often) out
  // of the chart AND out of the Others bucket, so the rendered total stopped reconciling with the
  // data — 22.7 pp of Kalimpong's 2021 vote vanished. Keying per candidacy would instead break a
  // party's line at every candidate change, so the party stays the series and the note below says
  // when a line stands for more than one contestant.
  //
  // Every candidate on record is a series, not just the three each election's fold named, so the fold happens once, in
  // lines(), on each party's peak: folding twice put BJP's 2.5% of 2011 in a bucket and printed a dash beside it,
  // and the runner-up of that year in a grey line that changed its members from one election to the next. Under a
  // party filter the point is the one party against everyone else, so only that party is a series.
  const pool = (s: PartySharePoint): PartyPoint[] => (pinned ? s.parties : fieldOf(s));
  const keys = [...new Set(shares.flatMap((s) => pool(s).map((p) => p.shortName)))];
  const sumBy = (parties: readonly PartyPoint[], k: string): number | null => {
    const hit = parties.filter((p) => p.shortName === k && p.voteSharePct !== null);
    return hit.length === 0 ? null : round1(hit.reduce((n, p) => n + (p.voteSharePct ?? 0), 0));
  };
  // A party's ink is its identity's: looked up by party id, so it is the colour the Brief and the maps give it, not
  // one that depends on how this window ranks it.
  const ink = new Map<string, string>();
  for (const p of shares.flatMap(fieldOf)) if (!ink.has(p.shortName)) ink.set(p.shortName, fillFor(p.partyId));
  const nothingFor = shares.map(noShare);
  const series: Series[] = keys.map((k) => ({
    key: k,
    label: k,
    colour: ink.get(k),
    values: shares.map((s) => sumBy(pool(s), k)),
    absent: nothingFor,
  }));
  if (pinned && shares.some((s) => s.others !== null)) {
    series.push({
      key: "rest",
      label: "Others",
      // Everyone else is an aggregate and not a party, so it wears the neutral and never a party's hue or the first of the capped ones.
      colour: OTHERS,
      values: shares.map((s) => s.others?.voteSharePct ?? null),
      absent: nothingFor,
    });
  }
  const latestShare = a.partyShareSeries.at(0);
  const top = latestShare?.parties.at(0);
  // Under a party filter the pinned party may simply have no result at the latest election: the counts are there.
  const absentParty = pinned && top === undefined && noShare(latestShare) === undefined;
  cards.push({
    question: "Who took what share, election by election?",
    chart: lines({
      title: "Vote share by party",
      finding: absentParty
        ? `${a.filters.party ?? ""} has no result in ${latestShare?.year ?? ""}.`
        : top === undefined || top.voteSharePct === null
          ? "No vote count is on record for the latest election in this window, so no share is computable."
          : `${top.shortName}${top.personName === null ? "" : ` (${top.personName})`} took ` +
            `${percent(top.voteSharePct)} in ${latestShare?.year ?? ""}.`,
      x: years,
      xHeader: "Election",
      series,
      format: percent,
    }),
    note:
      "Share is a candidate's votes over the votes polled at that election. The source lists only its leading " +
      "candidates, so the shares add up to less than 100. Where several candidates at one election share a " +
      "label — independents, most often — the line is their combined share, so it can move without any one of " +
      "them moving. " +
      (pinned
        ? "Others is every other candidate on record, added together."
        : "Others adds together the parties not drawn on their own, which the table lists one by one."),
  });

  if (latestShare !== undefined) {
    // Under a party filter the winner may sit in the bucket; the card still says who won.
    const winner = fieldOf(latestShare).find((p) => p.won);
    const shown =
      pinned && winner !== undefined && !latestShare.parties.includes(winner)
        ? [...latestShare.parties, winner]
        : latestShare.parties;
    const rest = (latestShare.others?.parties ?? []).filter((p) => !shown.includes(p));
    const counted = rest.filter((p) => p.votes !== null);
    const lead = shown.at(0);
    cards.push({
      question: `Who got the votes in ${latestShare.year}?`,
      chart: bars({
        title: `Votes polled, ${latestShare.year}`,
        finding:
          lead?.votes == null
            ? `No candidate's vote count is on record for ${latestShare.year}; the margin is.`
            : `${lead.shortName}${lead.personName === null ? "" : ` (${lead.personName})`} polled ` +
              `${inr(lead.votes)}.`,
        dimension: "Party",
        valueHeader: "Votes",
        points: [
          ...shown.map((p) => ({
            label: `${p.shortName}${p.personName === null ? "" : ` · ${p.personName}`}`,
            value: p.votes,
            key: p.shortName,
            colour: fillFor(p.partyId),
            absent: NO_COUNTS,
          })),
          ...(rest.length === 0
            ? []
            : [
                {
                  label: `Others (${inr(rest.length)})`,
                  value: counted.length === 0 ? null : counted.reduce((n, p) => n + (p.votes ?? 0), 0),
                  absent: NO_COUNTS,
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
  for (const [n, pair] of pairs.entries()) {
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
    // A repeated label (two independents) is told apart by the contestant, as the votes card does: four rows that
    // all read "IND" are four numbers nobody can attribute.
    // A label that repeats inside either election has shares on record but no single one to measure from.
    const nowShare = a.partyShareSeries.find((s) => s.electionId === first.electionId);
    const prevShare = a.partyShareSeries.find((s) => s.electionId === first.previousElectionId);
    const twice = (s: PartySharePoint | undefined, id: string): boolean =>
      s !== undefined && fieldOf(s).filter((p) => p.partyId === id).length > 1;
    const slopeRows: SlopeRow[] = rows.map((r) => ({
      label:
        r.personName !== null && rows.filter((x) => x.shortName === r.shortName).length > 1
          ? `${r.shortName} · ${r.personName}`
          : r.shortName,
      from: r.previousVoteSharePct,
      to: r.voteSharePct,
      absent: {
        from: twice(nowShare, r.partyId) || twice(prevShare, r.partyId) ? "not matched" : undefined,
        to: NO_COUNTS,
        change: "no swing",
      },
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
            : `none of the ${inr(rows.length)} contestants shown has a single recorded ` +
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
      // Said once, under the first of the swing cards: the same three sentences under each of them is how a reader
      // learns to stop reading them.
      note:
        n > 0
          ? null
          : "A party absent from the earlier election has no swing, not a swing of −100. Where a label " +
            "repeats inside either election — two independents, say — no single predecessor is " +
            "identifiable, so that row's earlier share and swing are blank rather than measured from " +
            "whichever of them the record happens to list last.",
    });
  }

  const margins = asc(a.marginSeries);
  const m0 = a.marginSeries.at(0);
  const votes0 = m0?.marginVotes ?? null;
  // A margin in votes can be on record where its share is not: a declaration publishes the winner and the margin and
  // no votes cast. The card then says the margin and tabulates it, instead of saying none is on record.
  const votesOnly = margins.every((p) => p.marginPct === null) && margins.some((p) => p.marginVotes !== null);
  const margin0Party = m0?.winner?.shortName === undefined ? "" : `, to ${m0.winner.shortName}`;
  cards.push({
    question: "Is the seat getting safer or closer?",
    chart: lines({
      title: votesOnly ? "Winning margin in votes" : "Winning margin as a share of votes cast",
      finding:
        m0 === undefined || votes0 === null
          ? "No margin is on record for the latest election in this window."
          : m0.marginPct === null
            ? m0.unverified === true
              ? // The declared margin in votes is on record and stays; its share divides by votes cast that are withheld.
                `${m0.year}: ${inr(votes0)} votes${margin0Party}; its share of votes cast is withheld (verification pending).`
              : `${m0.year}: ${inr(votes0)} votes${margin0Party}; no share of votes cast is shown.`
            : `${m0.year}: ${percent(m0.marginPct)} of votes cast, ${inr(votes0)} votes${margin0Party}.`,
      x: margins.map((p) => String(p.year)),
      xHeader: "Election",
      series: votesOnly
        ? [{ key: "margin", label: "Margin (votes)", values: margins.map((p) => p.marginVotes) }]
        : [
            {
              key: "margin",
              label: "Margin",
              values: margins.map((p) => p.marginPct),
              absent: margins.map((p, i) =>
                noShare(shares[i]) === NO_RESULT ? NO_RESULT : p.unverified ? WITHHELD : undefined,
              ),
            },
          ],
      format: votesOnly ? (v) => (v === null ? "—" : inr(v)) : percent,
    }),
    note: votesOnly
      ? "A share of votes cast needs votes cast that are on record and verified, and this window has none, " +
        "so the margin is shown in votes, as published."
      : "The denominator is votes cast, not the electorate, so the trend is comparable across a roll " +
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
      series: [
        {
          key: "enp",
          label: "Effective parties",
          values: enps.map((p) => p.enp),
          absent: enps.map((_, i) => noShare(shares[i])),
        },
      ],
      format: (v) => enpMeasure.format(v),
    }),
    // §13.2: the truncation bias is the measure's validity condition, so it is ON the card.
    note: enpMeasure.reader.at(0) ?? null,
  });

  return cards;
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

// A seat's own history, ready to draw: who held it at each election, and how each election divided the vote.
//
// The seat page gave each election one row of a table, while the registry holds every candidate the source listed, the
// runner-up and the margin. This turns those rows into the data of two pictures: a strip of who held the seat, oldest first,
// with the places it changed hands, and a bar per election of each candidate's share. No React and no new table; the
// components that draw them are in components/iei/SeatHistory.tsx.
//
// A SHARE IS OF THE VOTES POLLED, never of the candidates' own total. The registry holds only the leading candidates of a
// contest (five in West Bengal, two in some sources), so a total of the rows it has would give the leaders the whole bar; this
// is the denominator of the vote_share_pct measure (docs/methodology/vote_share_pct.md). A candidate's share is therefore the
// one the source published, which is of the votes polled, or else the measure's own quotient: the candidate's votes over the
// votes polled where both are held. What no candidate accounts for is left unfilled and said to be "not itemised": candidates
// the registry does not hold, and the votes it does not break down. It is never called "Others", which would invent a category
// (the same document); "Others (n)" is only the lowest candidates ON RECORD added together, when a seat has too many to draw.
//
// NOTHING IS DRAWN THAT IS NOT ON RECORD. A contest whose source published no candidate vote counts (West Bengal 2026: a
// winner and a margin only) has no bar, and says so in words; so has a contest whose shares cannot be stated, or whose shares
// contradict the votes polled. A bar is never made from a margin.
//
// WHO HOLDS A SEAT is its declared winner's party, by the key the maps colour it with. An election with no declared winner
// belongs to no party, and the seat is not said to have changed hands across it: that is the headline's rule (place-presentation
// placeHeadline) and the comparison's ("unknown" is neither held nor flipped). The headline reads the party's short name and
// the strip its key, so the two can differ for a winner the registry names only by the source's own string; a test holds them
// equal on every seat of the dev registry, the headline's and the tile's counts as well.

import type { DatabaseSync } from "node:sqlite";
import { chronoDesc, facetOf } from "../core/election-kind.ts";
import { all } from "../db/index.ts";
import { inr, margin_pct, percent } from "../semantic/index.ts";
import { displayName } from "./display-name.ts";
import { read, yearOf } from "./index.ts";
import { counted } from "./person.ts";
import { times } from "./place-presentation.ts";
import { CURRENT_REVISION, marginFrom, partyRef } from "./seat-results.ts";
import type { PartyColumns, PartyRef, SeatMargin } from "./seat-results.ts";

/** One candidate's result row, as stored. A null or zero count is "no count was published" (person.ts `counted`). */
export type HistoryCandidate = {
  name: string;
  /** The person the candidacy belongs to, so a name can be a link and a person can be found in a bar; null in a record that has none. */
  personId?: string | null;
  party: PartyColumns;
  rank: number | null;
  /** The declared winner: the `is_winner = 1` row. */
  isWinner: boolean;
  votes: number | null;
  /** The share of the votes polled the source published. */
  voteShare: number | null;
};

/** One contest of the seat, with everything the page draws it from. */
export type HistoryRecord = {
  contestId: string;
  year: number;
  /** A by-election fills a few vacancies in the middle of a term: it is a block of the strip, and says so. */
  byPoll: boolean;
  candidates: readonly HistoryCandidate[];
  /** The winner's own `result.margin`: what the source declared, which needs no counts. */
  declaredMargin: number | null;
  /** The contest's votes polled (its turnout row's `voters`): null when the contest has none on record. */
  votesPolled: number | null;
};

/** The most segments a bar has: six candidates, or five and the tail of the rest added together as "Others (n)". */
export const SEGMENTS = 6;

/** A remainder under this is what a share printed to a tenth cannot show: rounding, not a part of the vote. */
const ROUNDING = 0.05;

/** Shares that add up to more than this are not rounding but a record at odds with its votes polled (turnout-trust.ts: counts reconcile inside 90 to 105%). */
const WINDOW = 105;

export type BarSegment = {
  /** The person this segment is, or null for the tail added together (and for a record with no person id). */
  personId: string | null;
  /** The candidate's party, or null for the tail added together. */
  party: PartyRef | null;
  /** The candidate, or null for the tail. */
  name: string | null;
  /** One for a candidate; the size of the tail. */
  candidates: number;
  winner: boolean;
  /** Percent of the votes polled. */
  share: number;
  votes: number | null;
};

export type ResultBar = {
  /** Leader first. */
  segments: BarSegment[];
  /** Percent of the votes polled that no segment accounts for: 0 where the shares fill it (or run over it by rounding). */
  unitemised: number;
  /** The shares added together; above 100 the bar is drawn to that total. */
  total: number;
};

export type ContestResult = {
  contestId: string;
  year: number;
  /** "2021", or "2021 by-poll". */
  label: string;
  byPoll: boolean;
  winner: { name: string; party: PartyRef; votes: number | null } | null;
  runnerUp: { name: string; party: PartyRef; votes: number | null } | null;
  margin: SeatMargin | null;
  /** What the registry holds of the contest: candidate vote counts, a declared winner and not a count, or neither. */
  evidence: "counted" | "declared" | "none";
  /** Null wherever no share can be stated; `note` then says why. */
  bar: ResultBar | null;
  /** Who won, against whom and by how much, in words. */
  statement: string;
  /** What is not drawn, or how the bar was fitted, in words; null when the bar says it all. */
  note: string | null;
};

export type HeldBlock = {
  contestId: string;
  year: number;
  label: string;
  byPoll: boolean;
  /** The declared winner's party, or null where none is declared. */
  party: PartyRef | null;
  /** The declared winner's name, which the block's tooltip gives. */
  winner: string | null;
  /** This election's winner and the one before it are both declared and are of different parties. */
  changedHands: boolean;
};

export type SeatHistory = {
  /** Oldest first: one block per election the seat stood in. */
  held: HeldBlock[];
  /** How many times the seat changed hands between two elections. */
  handOffs: number;
  /** How many of its elections declared no winner. */
  undeclared: number;
  /** Newest first, as the election table under them is. */
  results: ContestResult[];
};

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const hasCount = (c: HistoryCandidate): boolean => counted(c.votes) !== null || counted(c.voteShare) !== null;

/** Leaders first: by the source's rank, then by votes, then by name so that the order is total. */
function leaders(candidates: readonly HistoryCandidate[]): HistoryCandidate[] {
  return [...candidates].sort(
    (a, b) =>
      (a.rank === null ? 1 : 0) - (b.rank === null ? 1 : 0) ||
      (a.rank ?? 0) - (b.rank ?? 0) ||
      (counted(b.votes) ?? 0) - (counted(a.votes) ?? 0) ||
      compare(a.name, b.name),
  );
}

/**
 * A candidate's share of the votes polled: the one published, else the candidate's votes over the votes polled, else none.
 *
 * The quotient is `vote_share_pct`'s before it rounds to a tenth. The bar adds shares together to find what no candidate
 * accounts for, and ten shares each rounded to a tenth would leave up to half a point of "not itemised" that is rounding;
 * what is PRINTED is rounded once, by `shareText`, which gives the measure's own figure (a test holds the two equal).
 */
function shareOf(c: HistoryCandidate, polled: number | null): number | null {
  const published = counted(c.voteShare);
  if (published !== null) return published;
  const votes = counted(c.votes);
  return votes !== null && polled !== null && polled > 0 ? (100 * votes) / polled : null;
}

/** "49.9", or "<0.1" for a share a tenth cannot show without calling it nothing. */
export function shareText(share: number): string {
  return share > 0 && share < ROUNDING ? "<0.1" : share.toFixed(1);
}

/** What a segment is called: its party's label, or the tail's. */
export function segmentLabel(s: BarSegment): string {
  return s.party === null ? `Others (${s.candidates})` : s.party.label;
}

type Bar = { bar: ResultBar } | { why: "no-base" | "over-base"; total: number };

/**
 * The bar of a contest that has counts: a segment per candidate with a share, the tail added together past `SEGMENTS`, and
 * the unfilled remainder. Or why there is none: no candidate has a share (the votes polled are not on record and none was
 * published), or the shares add up to more than the votes polled can hold.
 */
function barOf(ranked: readonly HistoryCandidate[], polled: number | null): Bar {
  const shown = ranked.flatMap((c) => {
    const share = shareOf(c, polled);
    return share === null ? [] : [{ c, share }];
  });
  if (shown.length === 0) return { why: "no-base", total: 0 };
  const total = shown.reduce((sum, s) => sum + s.share, 0);
  if (total > WINDOW) return { why: "over-base", total };

  const one = (s: { c: HistoryCandidate; share: number }): BarSegment => ({
    personId: s.c.personId ?? null,
    party: partyRef(s.c.party),
    name: s.c.name,
    candidates: 1,
    winner: s.c.isWinner,
    share: s.share,
    votes: counted(s.c.votes),
  });
  const tail = shown.length > SEGMENTS ? shown.slice(SEGMENTS - 1) : [];
  const head = shown.slice(0, shown.length - tail.length).map(one);
  const tailVotes = tail.flatMap((s) => (counted(s.c.votes) === null ? [] : [counted(s.c.votes) as number]));
  const segments: BarSegment[] =
    tail.length === 0
      ? head
      : [
          ...head,
          {
            personId: null,
            party: null,
            name: null,
            candidates: tail.length,
            winner: false,
            share: tail.reduce((sum, s) => sum + s.share, 0),
            // A sum of some of the tail's counts would be a count for the whole of it.
            votes: tailVotes.length === tail.length ? tailVotes.reduce((sum, v) => sum + v, 0) : null,
          },
        ];
  return { bar: { segments, unitemised: 100 - total < ROUNDING ? 0 : 100 - total, total } };
}

/** "Adhikary Paresh (TMC)": a candidate as the sentences name them, with the party so that colour is never the only channel. */
const named = (c: { name: string; party: PartyRef }): string => `${displayName(c.name)} (${c.party.label})`;

function statementOf(
  winner: ContestResult["winner"],
  runnerUp: ContestResult["runnerUp"],
  margin: SeatMargin | null,
  evidence: ContestResult["evidence"],
  polled: number | null,
): string {
  if (winner === null) {
    return evidence === "none"
      ? "No result is declared for this election."
      : "No winner is declared for this election, though candidate votes are on record.";
  }
  const votes = margin === null ? 0 : Math.abs(margin.votes);
  // The margin as the tile above prints it: the margin_pct measure, over the votes polled.
  const share = margin_pct.compute({ rank1Votes: votes, rank2Votes: 0, validVotes: polled });
  if (margin !== null && margin.basis === "counted" && margin.votes === 0 && runnerUp !== null) {
    return `${named(winner)} and ${named(runnerUp)} polled the same ${inr(winner.votes ?? 0)} votes; the source declares ${winner.name} the winner.`;
  }
  const by =
    margin === null
      ? ""
      : margin.basis === "declared"
        ? ` by a declared margin of ${inr(votes)} votes`
        : ` by ${inr(votes)} votes` + (share === null ? "" : `, ${percent(share)} of the votes polled`);
  return runnerUp === null ? `${named(winner)} won${by}.` : `${named(winner)} beat ${named(runnerUp)}${by}.`;
}

/** What is not drawn, or how the bar was fitted, in words; null when the bar says it all. */
function noteOf(evidence: ContestResult["evidence"], built: Bar | null): string | null {
  if (evidence === "declared") {
    return "Candidate vote counts are not on record for this election, so the shares are not on record and no bar is drawn.";
  }
  if (built === null) return "No candidate vote counts are on record, so no bar is drawn.";
  if ("why" in built) {
    return built.why === "no-base"
      ? "The votes polled are not on record and no share was published, so the shares cannot be stated and no bar is drawn."
      : `The shares add up to ${shareText(built.total)}%, more than the votes polled, so no bar is drawn.`;
  }
  const tail = built.bar.segments.find((s) => s.party === null);
  const drawn = built.bar.segments.reduce((n, s) => n + s.candidates, 0);
  const notes = [
    tail === undefined
      ? null
      : `The ${inr(tail.candidates)} lowest of ${inr(drawn)} candidates are added together as Others (${tail.candidates}).`,
    built.bar.total - 100 >= ROUNDING
      ? `The shares add up to ${shareText(built.bar.total)}%, so the bar is drawn to that total.`
      : null,
  ].filter((n): n is string => n !== null);
  return notes.length === 0 ? null : notes.join(" ");
}

/**
 * The contests of one seat, newest first (the order the seat's election table is in), as the strip and the bars draw them.
 *
 * A seat is its own record here: the contests are those of one seat version, which `place.ts` reads for the table, so
 * nothing is compared across a delimitation.
 */
export function seatHistory(records: readonly HistoryRecord[]): SeatHistory {
  const results = records.map((r): ContestResult => {
    const ranked = leaders(r.candidates);
    const w = ranked.find((c) => c.isWinner);
    // The runner-up is the rank-2 row, as the seat results read it: the next candidate down is not the runner-up when
    // that row is missing, and the margin between the two would be a margin over somebody else.
    const second = w === undefined ? undefined : ranked.find((c) => c !== w && c.rank === 2);
    const winner = w === undefined ? null : { name: w.name, party: partyRef(w.party), votes: counted(w.votes) };
    const runnerUp = second === undefined ? null : { name: second.name, party: partyRef(second.party), votes: counted(second.votes) };
    const margin = winner === null ? null : marginFrom(winner.votes, runnerUp?.votes ?? null, r.declaredMargin);
    const withCounts = ranked.filter(hasCount);
    const evidence: ContestResult["evidence"] = withCounts.length > 0 ? "counted" : winner === null ? "none" : "declared";

    const built = evidence === "counted" ? barOf(withCounts, r.votesPolled) : null;
    return {
      contestId: r.contestId,
      year: r.year,
      label: r.byPoll ? `${r.year} by-poll` : String(r.year),
      byPoll: r.byPoll,
      winner,
      runnerUp,
      margin,
      evidence,
      bar: built !== null && "bar" in built ? built.bar : null,
      // Votes polled that the shares contradict are not divided by again in words.
      statement: statementOf(
        winner,
        runnerUp,
        margin,
        evidence,
        built !== null && "why" in built && built.why === "over-base" ? null : r.votesPolled,
      ),
      note: noteOf(evidence, built),
    };
  });

  // Oldest first. A hand-off is between two adjacent elections that both declared a winner, as the headline counts it.
  const held: HeldBlock[] = [];
  for (const r of [...results].reverse()) {
    const before = held.at(-1)?.party ?? null;
    const party = r.winner?.party ?? null;
    held.push({
      contestId: r.contestId,
      year: r.year,
      label: r.label,
      byPoll: r.byPoll,
      party,
      winner: r.winner?.name ?? null,
      changedHands: before !== null && party !== null && before.key !== party.key,
    });
  }
  return {
    held,
    handOffs: held.filter((b) => b.changedHands).length,
    undeclared: held.filter((b) => b.party === null).length,
    results,
  };
}

/** The line over the strip: how many elections, over which years, and how often the seat changed hands. */
export function heldCaption(h: SeatHistory): string {
  const first = h.held.at(0);
  const last = h.held.at(-1);
  if (first === undefined || last === undefined) return "";
  const span = h.held.length === 1 ? `1 election, ${last.year}` : `${inr(h.held.length)} elections, ${first.year} to ${last.year}`;
  // "Never" is a claim about every election, so it is made only where every election declared a winner to be held or lost.
  const hands =
    h.held.length === 1
      ? "no earlier election to compare it with"
      : h.handOffs > 0
        ? `changed hands ${times(h.handOffs)}`
        : h.undeclared === 0
          ? "never changed hands"
          : "no change of hands on record";
  const gap = h.undeclared === 0 ? "" : `; ${inr(h.undeclared)} with no declared winner`;
  return `${span} — ${hands}${gap}`;
}

type Row = {
  contestId: string;
  electionId: string;
  house: string;
  kind: string;
  voters: number | null;
  rank: number | null;
  votes: number | null;
  voteShare: number | null;
  margin: number | null;
  isWinner: number | null;
  name: string | null;
  personId: string | null;
  partyId: string | null;
  shortName: string | null;
  partyName: string | null;
  raw: string | null;
};

/**
 * The history of the seat version `versionId`, from the registry.
 *
 * Every result row of every contest of the seat at `CURRENT_REVISION`, not the top two the brief reads, so a bar can hold
 * the candidates the source listed. The votes polled are the contest's turnout. An election whose turnout is unverified
 * (turnout-trust.ts) is one that published no candidate counts at all, so there is no vote here to divide by it.
 */
export function readSeatHistory(db: DatabaseSync, versionId: number): SeatHistory {
  return read(() => {
    const rows = all<Row>(
      db,
      `SELECT c.id AS contestId, c.election_id AS electionId, e.house AS house, e.kind AS kind, t.voters AS voters,
              r."rank" AS rank, r.votes AS votes, r.vote_share AS voteShare, r.margin AS margin, r.is_winner AS isWinner,
              per.canonical_name AS name, ca.person_id AS personId, pt.id AS partyId, pt.short_name AS shortName, pt.name AS partyName,
              ca.party_raw AS raw
         FROM contest c
         JOIN election e ON e.id = c.election_id
         LEFT JOIN turnout t ON t.contest_id = c.id AND t.scope = 'contest'
         LEFT JOIN result r ON r.contest_id = c.id AND r.revision = ${CURRENT_REVISION}
         LEFT JOIN candidacy ca ON ca.id = r.candidacy_id
         LEFT JOIN person per ON per.id = ca.person_id
         LEFT JOIN party_version pver ON pver.id = ca.party_version_id
         LEFT JOIN party pt ON pt.id = pver.party_id
        WHERE c.place_version_id = ?
        ORDER BY ${chronoDesc()}, r."rank", r.candidacy_id`,
      versionId,
    );
    const records: (Omit<HistoryRecord, "candidates"> & { candidates: HistoryCandidate[] })[] = [];
    for (const r of rows) {
      let rec = records.at(-1);
      if (rec === undefined || rec.contestId !== r.contestId) {
        rec = {
          contestId: r.contestId,
          year: yearOf(r.electionId),
          byPoll: facetOf(r.house, r.kind).fill === "bypoll",
          candidates: [],
          declaredMargin: null,
          votesPolled: r.voters !== null && r.voters > 0 ? r.voters : null,
        };
        records.push(rec);
      }
      // A contest with no result row comes back as one row with nobody in it.
      if (r.name === null) continue;
      if (r.isWinner === 1) rec.declaredMargin = r.margin;
      rec.candidates.push({
        name: r.name,
        personId: r.personId,
        party: { id: r.partyId, shortName: r.shortName, name: r.partyName, raw: r.raw },
        rank: r.rank,
        isWinner: r.isWinner === 1,
        votes: r.votes,
        voteShare: r.voteShare,
      });
    }
    return seatHistory(records);
  });
}

// What the Analysis page says, computed from the record: its finding and the rule that chose it, the margin hero, the ladder's rows, one party
// followed through them, the seat against the state, turnout against its district and state, the notes worth a second look, and what the page leaves
// out. Pure functions over what place-view.ts has loaded: no React and no database, so place-story.test.ts runs them on literals and on every seat.
//
// THE RULES A SENTENCE KEEPS (auditFinding holds them): every number is read from the inputs, a margin with no counts behind it is called declared,
// 2026 contributes only its winner, its party and its declared margin, and no sentence claims that voters moved ("took votes", "switched"): "took the
// seat from TMC" is about the seat and its previous declared holder, which is on record, and not about the runner-up, which is not.
//
// Every threshold below is a named constant: they are policy, and a rule that is wrong writes a false sentence.

import { inr } from "../semantic/index.ts";
import { bullet, shareText } from "../viz/bullet.ts";
import type { Bullet } from "../viz/bullet.ts";
import type { MarginCol } from "../viz/margin-columns.ts";
import type { LadderRowIn, LadderSeg } from "../viz/vote-ladder.ts";
import { NARROW_POINTS } from "./close-call.ts";
import { figure, text } from "./finding.ts";
import type { Finding, Part } from "./finding.ts";
import type { PlaceAnalysis } from "./place-analysis.ts";
import type { MarginRank } from "./place-baselines.ts";
import type { PlaceBrief } from "./place.ts";
import type { SeatHistory } from "./seat-history.ts";
import { closestCounted, ordinal } from "./seat-story.ts";
import type { PartyRef, SeatMargin } from "./seat-results.ts";
import { segmentLabel } from "./seat-history.ts";

/** A counted margin is a close call when it is within this share of its election's contests, by votes. */
export const CLOSE_SHARE = 0.05;
/** A section's heading names the election as "the close one" when its rank is within this share of its contests. */
export const CLOSE_ANSWER_SHARE = 0.25;
/** A party's share must rise by this many points across counted elections, with a change of hands, to be the finding. */
export const RISE_POINTS = 10;
/** A party's share moving this many points between two counted elections is worth a second look. */
export const MOVE_POINTS = 20;
/** A seat's turnout this many points from its district's is worth a second look. */
export const TURNOUT_GAP = 5;
/** A seat this many points from the state's share of a party is said to have run ahead of or behind it. */
export const WAVE_GAP = 5;
export const HANDS_RUN = 3;

export type StoryInput = {
  brief: PlaceBrief;
  history: SeatHistory;
  analysis: PlaceAnalysis;
  /** Each election's margin rank among its seats, by election id. */
  ranks: ReadonlyMap<string, MarginRank | null>;
  /** The state's share of the votes polled, by party key, by election id (assembly seats only). */
  stateShares: ReadonlyMap<string, ReadonlyMap<string, number>>;
  /** The party the reader asked to follow, by its label, or null. */
  asked: string | null;
};

export type Hero = {
  year: number;
  votes: number;
  basis: SeatMargin["basis"];
  party: PartyRef;
  winner: string | null;
  personId: string | null;
  rank: MarginRank | null;
  bar: Bullet | null;
  delta: { votes: number; vs: { year: number; votes: number; basis: SeatMargin["basis"]; party: PartyRef } } | null;
  columns: (MarginCol & { party: PartyRef | null })[];
  /** Every election's rank, for the table. */
  ranks: { year: number; rank: MarginRank | null }[];
};

export type FollowRow = { year: number; label: string; share: number | null; delta: number | null; note: string | null };

export type WaveRow = { year: number; label: string; seat: number | null; state: number | null; gap: number | null; note: string | null };
export type WavePanel = { party: PartyRef; rows: WaveRow[] };

export type Note = { text: string; rule: string };

export type PlaceStory = {
  finding: Finding;
  /** The rule that chose the finding, in words. */
  rule: string;
  /** The party the finding is about, if it is about one. */
  subject: PartyRef | null;
  ladder: LadderRowIn[];
  /** What each declared or empty row of the ladder says in words, by row id, and the party that won each declared one. */
  rowNotes: Record<string, string>;
  rowWinners: Record<string, PartyRef>;
  chips: PartyRef[];
  followed: PartyRef | null;
  follow: FollowRow[];
  hero: Hero | null;
  /** Why there is no hero comparison, drawn as "Not drawn, and why", for a seat with one election. */
  notDrawn: string[];
  closeAnswer: string | null;
  wave: { answer: string | null; panels: WavePanel[] };
  turnout: { answer: string | null; rows: { id: string; label: string; seat: number | null; district: number | null; state: number | null; pending: boolean }[] };
  notes: Note[];
  leavesOut: string[];
};

const pp = (n: number): string => `${Math.abs(n).toFixed(1)}`;
const party = (p: PartyRef): Part => ({ party: { key: p.key, code: p.label } });
const votesText = (m: SeatMargin): string => `${m.basis === "declared" ? "a declared " : ""}${inr(Math.abs(m.votes))} votes`;

/** The elections of the window, oldest first. */
function windowOf(history: SeatHistory, a: PlaceAnalysis): SeatHistory["results"] {
  const { fromYear, toYear } = a.filters;
  return [...history.results].reverse().filter((r) => (fromYear === undefined || r.year >= fromYear) && (toYear === undefined || r.year <= toYear));
}

export function placeStory(input: StoryInput): PlaceStory {
  const { brief, history, analysis, ranks, stateShares, asked } = input;
  const name = brief.place.canonicalName;
  const newestFirst = history.results;
  const oldestFirst = [...newestFirst].reverse();
  const declared = newestFirst.filter((r) => r.winner !== null);
  const latest = declared[0];

  /* ───────── the ladder's rows, from every election in the window ───────── */
  const rowNotes: Record<string, string> = {};
  const rowWinners: Record<string, PartyRef> = {};
  const inWindow = windowOf(history, analysis);
  const ladder: LadderRowIn[] = inWindow.map((r): LadderRowIn => {
    const before = newestFirst.slice(newestFirst.indexOf(r) + 1).find((x) => x.winner !== null);
    if (r.bar !== null) {
      const segments: LadderSeg[] = r.bar.segments.map((s) => ({
        key: s.party?.key ?? null,
        label: segmentLabel(s),
        share: s.share,
        winner: s.winner,
        tail: s.party === null,
        name: s.name,
      }));
      return { id: r.contestId, label: r.label, evidence: "counted", segments, unitemised: r.bar.unitemised, scale: Math.max(100, r.bar.total) };
    }
    if (r.winner !== null) {
      rowWinners[r.contestId] = r.winner.party;
      const from = before?.winner?.party;
      // The party's chip is drawn beside this, so the sentence does not name it again.
      rowNotes[r.contestId] =
        `won${from === undefined ? "" : from.key === r.winner.party.key ? `, holding it from ${before?.year}` : `, taking it from ${from.label}`} · no candidate votes published`;
      return { id: r.contestId, label: r.label, evidence: "declared", segments: [], unitemised: 0, scale: 100 };
    }
    rowNotes[r.contestId] = "no result declared";
    return { id: r.contestId, label: r.label, evidence: "none", segments: [], unitemised: 0, scale: 100 };
  });
  const countedRows = ladder.filter((r) => r.evidence === "counted");

  /* ───────── the finding, by the first rule that holds ───────── */
  const closest = closestCounted(brief, history);
  const subject = latest?.winner?.party ?? null;
  const shareOf = (row: LadderRowIn, key: string): number | null => {
    const m = row.segments.filter((s) => s.key === key && !s.tail);
    return m.length === 1 ? (m[0] as LadderSeg).share : null;
  };
  const allCounted = oldestFirst.flatMap((r) => (r.bar === null ? [] : [{ r, row: ladder.find((l) => l.id === r.contestId) }]));
  const prevDeclared = latest === undefined ? undefined : newestFirst.slice(newestFirst.indexOf(latest) + 1).find((x) => x.winner !== null);
  const flipped = latest !== undefined && prevDeclared !== undefined && latest.winner !== null && prevDeclared.winner !== null && latest.winner.party.key !== prevDeclared.winner.party.key;
  const newestNote: Part[] = newestFirst[0] !== undefined && newestFirst[0].winner === null ? [text(` No winner is declared for ${newestFirst[0].year}.`)] : [];

  let finding: Finding;
  let rule: string;
  const closeRank = closest === null ? undefined : ranks.get(brief.contests.find((c) => c.contestId === closest.result.contestId)?.electionId ?? "");
  if (closest !== null && closest.share < NARROW_POINTS && closest.result.margin !== null && closeRank !== undefined && closeRank !== null) {
    finding = {
      shape: "close",
      parts: [
        text(`${name} was decided by `),
        figure(inr(Math.abs(closest.result.margin.votes))),
        text(` votes in ${closest.result.year}, the ${closeRank.rank === 1 ? "closest" : `${ordinal(closeRank.rank)} closest`} of `),
        figure(String(closeRank.of)),
        text(" counted contests that year."),
      ],
    };
    rule = `A counted margin of under ${NARROW_POINTS}% of the votes polled.`;
  } else if (history.handOffs >= HANDS_RUN && history.undeclared === 0 && history.handOffs === history.results.length - 1) {
    const held = [...history.held];
    finding = {
      shape: "every",
      parts: [text(`${name} has changed hands at every election since ${held[0]?.year}: ${held.map((b) => `${b.party?.label} ${b.year}`).join(", ")}.`)],
    };
    rule = `The seat changed hands at every one of its compared elections, and there are ${HANDS_RUN} or more of them.`;
  } else {
    const first = allCounted[0];
    const last = allCounted.at(-1);
    const a = flipped && subject !== null && first?.row !== undefined ? shareOf(first.row, subject.key) : null;
    const b = flipped && subject !== null && last?.row !== undefined ? shareOf(last.row, subject.key) : null;
    if (flipped && subject !== null && latest?.margin != null && prevDeclared?.winner != null && a !== null && b !== null && first !== undefined && last !== undefined && first !== last && b - a >= RISE_POINTS) {
      finding = {
        shape: "rise",
        parts: [
          party(subject),
          text("’s share of the vote here rose from "),
          figure(`${shareText(a)}%`),
          text(` in ${first.r.year} to `),
          figure(`${shareText(b)}%`),
          text(` in ${last.r.year}, and in ${latest.year} it took the seat from ${prevDeclared.winner.party.label} by ${votesText(latest.margin)}.`),
          ...newestNote,
        ],
      };
      rule = `The winner's share rose by ${RISE_POINTS} points or more across counted elections, and the seat changed hands.`;
    } else if (history.undeclared === 0 && history.results.length >= 3 && new Set(history.held.map((h) => h.party?.key)).size === 1 && subject !== null) {
      finding = {
        shape: "held",
        parts: [party(subject), text(` has won ${name} at every one of the ${history.results.length} elections on record, ${oldestFirst[0]?.year} to ${newestFirst[0]?.year}.`)],
      };
      rule = "One party won every election on record.";
    } else if (latest !== undefined && latest.winner !== null) {
      const one = history.results.length === 1;
      const lastCounted = allCounted.at(-1);
      const w = lastCounted?.r.winner;
      finding = {
        shape: "won",
        parts: [
          party(latest.winner.party),
          text(` won ${name} in ${latest.year}${latest.margin === null ? "" : ` by ${votesText(latest.margin)}`}.`),
          ...(one
            ? [text(" One election is on record, so nothing here moves.")]
            : latest.evidence === "counted" || lastCounted === undefined || w === null || w === undefined
              ? []
              : [text(` The last counted election, ${lastCounted.r.year}, was won by ${w.party.label} with ${shareText(lastCounted.r.bar?.segments.find((s) => s.winner)?.share ?? 0)}% of the votes polled.`)]),
          ...newestNote,
        ],
      };
      rule = "Nothing in this seat's record meets the rules for a close result, a turnover or a long hold, so this is the latest result.";
    } else {
      finding = { shape: "won", parts: [text(`No winner is declared for ${name} in any election on record, so there is nothing here to follow.`)] };
      rule = "No election on record declares a winner.";
    }
  }

  /* ───────── one party, followed through the counted rows ───────── */
  const totals = new Map<string, { p: PartyRef; share: number }>();
  for (const r of countedRows) {
    for (const s of r.segments) if (s.key !== null) totals.set(s.key, { p: { key: s.key, label: s.label }, share: (totals.get(s.key)?.share ?? 0) + s.share });
  }
  const chips: PartyRef[] = [...totals.values()].sort((a, b) => b.share - a.share || (a.p.key < b.p.key ? -1 : 1)).slice(0, 5).map((t) => t.p);
  for (const p of [subject]) if (p !== null && !chips.some((c) => c.key === p.key)) chips.push(p);
  const followed = chips.find((c) => c.label === asked) ?? subject ?? chips[0] ?? null;
  const follow: FollowRow[] =
    followed === null
      ? []
      : ladder.map((r, i) => {
          if (r.evidence !== "counted") {
            const won = r.evidence === "declared" && newestFirst.find((x) => x.contestId === r.id)?.winner?.party.key === followed.key;
            return { year: Number(r.label.slice(0, 4)), label: r.label, share: null, delta: null, note: won ? "won · share not published" : r.evidence === "declared" ? "share not published" : "no result declared" };
          }
          const share = shareOf(r, followed.key);
          const prev = ladder.slice(0, i).reverse().find((x) => x.evidence === "counted");
          const before = prev === undefined ? null : shareOf(prev, followed.key);
          return {
            year: Number(r.label.slice(0, 4)),
            label: r.label,
            share,
            delta: share !== null && before !== null ? Math.round((share - before) * 10) / 10 : null,
            note: share === null ? "not among the listed candidates" : null,
          };
        });

  /* ───────── the margin hero ───────── */
  const withMargin = newestFirst.find((r) => r.winner !== null && r.margin !== null);
  const heroPrev = withMargin === undefined ? undefined : newestFirst.slice(newestFirst.indexOf(withMargin) + 1).find((r) => r.winner !== null && r.margin !== null);
  const rankOf = (r: { electionId?: string; contestId: string }): MarginRank | null => ranks.get(brief.contests.find((c) => c.contestId === r.contestId)?.electionId ?? "") ?? null;
  const heroRank = withMargin === undefined ? null : rankOf(withMargin);
  const hero: Hero | null =
    withMargin === undefined || withMargin.winner === null || withMargin.margin === null
      ? null
      : {
          year: withMargin.year,
          votes: Math.abs(withMargin.margin.votes),
          basis: withMargin.margin.basis,
          party: withMargin.winner.party,
          winner: withMargin.winner.name,
          personId: brief.contests.find((c) => c.contestId === withMargin.contestId)?.winner?.personId ?? null,
          rank: heroRank,
          bar: heroRank === null || heroRank.medianVotes <= 0 ? null : bullet({ value: Math.abs(withMargin.margin.votes), target: heroRank.medianVotes, scale: 2 * heroRank.medianVotes }),
          delta:
            heroPrev === undefined || heroPrev.winner === null || heroPrev.margin === null
              ? null
              : {
                  votes: Math.abs(withMargin.margin.votes) - Math.abs(heroPrev.margin.votes),
                  vs: { year: heroPrev.year, votes: Math.abs(heroPrev.margin.votes), basis: heroPrev.margin.basis, party: heroPrev.winner.party },
                },
          columns: oldestFirst.map((r) => ({
            id: r.contestId,
            label: r.label,
            votes: r.winner !== null && r.margin !== null ? Math.abs(r.margin.votes) : null,
            basis: r.winner !== null && r.margin !== null ? r.margin.basis : null,
            key: r.winner?.party.key ?? null,
            changedHands: history.held.find((b) => b.contestId === r.contestId)?.changedHands ?? false,
            party: r.winner?.party ?? null,
          })),
          ranks: oldestFirst.map((r) => ({ year: r.year, rank: rankOf(r) })),
        };
  const notDrawn: string[] =
    history.results.length === 1
      ? [
          "No earlier election: there is nothing to compare this margin with, and no trend.",
          "No candidate votes, shares or turnout: this election's source published the winner and the margin only.",
          ...(brief.place.kind === "pc" ? ["No link from a Lok Sabha seat to the assembly seats inside it is on record, so nothing assembly-level is drawn."] : []),
        ]
      : [];

  const ratio = (m: MarginRank): number => m.rank / m.of;
  const closeBest = [...ranks.values()].filter((m): m is MarginRank => m !== null).sort((a, b) => ratio(a) - ratio(b))[0];
  const closeAnswer =
    closeBest !== undefined && closeBest !== null && ratio(closeBest) <= CLOSE_ANSWER_SHARE
      ? `${brief.contests.find((c) => c.electionId === closeBest.electionId)?.year ?? ""} was the close one: ${closeBest.rank === 1 ? "the closest" : `${ordinal(closeBest.rank)} closest`} of ${closeBest.of}`
      : null;

  /* ───────── the seat against the state ───────── */
  const isAssembly = brief.place.kind === "ac";
  const panelFor = (p: PartyRef): WavePanel => ({
    party: p,
    rows: ladder.map((r): WaveRow => {
      const year = Number(r.label.slice(0, 4));
      const electionId = brief.contests.find((c) => c.contestId === r.id)?.electionId ?? "";
      if (r.evidence !== "counted") return { year, label: r.label, seat: null, state: null, gap: null, note: "no candidate votes published" };
      const seat = shareOf(r, p.key);
      const state = stateShares.get(electionId)?.get(p.key) ?? null;
      return { year, label: r.label, seat, state, gap: seat !== null && state !== null ? Math.round((seat - state) * 10) / 10 : null, note: seat === null ? "not listed" : null };
    }),
  });
  const priorHolder = prevDeclared?.winner?.party;
  const panels: WavePanel[] = !isAssembly || followed === null ? [] : [panelFor(followed), ...(priorHolder !== undefined && priorHolder.key !== followed.key && flipped ? [panelFor(priorHolder)] : [])];
  const waveRows = panels[0]?.rows.filter((r) => r.gap !== null) ?? [];
  const lastWave = waveRows.at(-1);
  let waveAnswer: string | null = null;
  if (followed !== null && waveRows.length >= 2 && lastWave !== undefined && lastWave.gap !== null) {
    const stateMove = (waveRows.at(-1)?.state ?? 0) - (waveRows[0]?.state ?? 0);
    const mean = waveRows.reduce((n, r) => n + (r.gap ?? 0), 0) / waveRows.length;
    if (Math.abs(lastWave.gap) >= WAVE_GAP) {
      waveAnswer = `${followed.label} ran ${pp(lastWave.gap)} points ${lastWave.gap > 0 ? "ahead of" : "behind"} the state in ${lastWave.year}`;
    } else if (waveRows.every((r) => Math.abs(r.gap ?? 0) < WAVE_GAP)) {
      const dir = stateMove >= WAVE_GAP ? "rise" : stateMove <= -WAVE_GAP ? "fall" : null;
      waveAnswer = `${followed.label} ${dir === null ? "stayed close to the state's share" : `followed the state's ${dir}`}${Math.abs(mean) >= 1 ? `, and ran a little ${mean > 0 ? "ahead of" : "behind"} it` : ""}`;
    }
  }

  /* ───────── turnout ───────── */
  const turnoutRows = [...analysis.turnoutSeries].reverse().map((t) => ({
    id: t.electionId,
    label: String(t.year),
    seat: t.unverified ? null : t.turnoutPct,
    district: t.unverified ? null : t.districtTurnoutPct,
    state: t.unverified ? null : t.stateTurnoutPct,
    pending: t.unverified,
  }));
  const verified = turnoutRows.filter((t) => t.seat !== null && t.district !== null);
  let turnoutAnswer: string | null = null;
  if (isAssembly && verified.length >= 2) {
    const d = verified.map((t) => (t.seat as number) - (t.district as number));
    const s = verified.map((t) => (t.state === null ? null : (t.seat as number) - t.state));
    if (d.every((x) => x > 0) && s.every((x) => x !== null && x > 0)) turnoutAnswer = `${name} beat the district and the state at every election on record`;
    else if (d.every((x) => x < 0)) {
      const lo = Math.min(...d.map(Math.abs));
      const hi = Math.max(...d.map(Math.abs));
      turnoutAnswer = `${name} ran ${lo.toFixed(1)} to ${hi.toFixed(1)} points below the district at every election on record`;
    }
  }

  /* ───────── notes worth a second look ───────── */
  const notes: Note[] = [];
  if (finding.shape !== "close") {
    const best = [...ranks.entries()].flatMap(([id, m]) => (m !== null && m.basis === "counted" && m.rank <= Math.max(1, Math.ceil(CLOSE_SHARE * m.of)) ? [{ id, m }] : []))[0];
    if (best !== undefined) {
      notes.push({
        text: `${brief.contests.find((c) => c.electionId === best.id)?.year}: the margin of ${inr(best.m.votes)} votes was the ${best.m.rank === 1 ? "closest" : `${ordinal(best.m.rank)} closest`} of ${best.m.of}.`,
        rule: `Rule: a counted margin in the closest ${CLOSE_SHARE * 100}% of its election's contests, by votes.`,
      });
    }
  }
  let move: { p: string; a: number; b: number; y1: string; y2: string } | null = null;
  for (let i = 1; i < countedRows.length; i++) {
    const a = countedRows[i - 1] as LadderRowIn;
    const b = countedRows[i] as LadderRowIn;
    for (const s of b.segments) {
      if (s.key === null) continue;
      const x = shareOf(a, s.key);
      const y = shareOf(b, s.key);
      if (x !== null && y !== null && Math.abs(y - x) >= MOVE_POINTS && (move === null || Math.abs(y - x) > Math.abs(move.b - move.a))) move = { p: s.label, a: x, b: y, y1: a.label, y2: b.label };
    }
  }
  if (move !== null) {
    notes.push({
      text: `${move.p} ${move.b > move.a ? "rose" : "fell"} ${pp(move.b - move.a)} points between ${move.y1} and ${move.y2}, from ${shareText(move.a)}% to ${shareText(move.b)}%.`,
      rule: `Rule: a party's share moved ${MOVE_POINTS} points or more between two counted elections.`,
    });
  }
  if (finding.shape !== "every" && history.handOffs >= HANDS_RUN) {
    notes.push({ text: `The seat changed hands ${history.handOffs} times since ${oldestFirst[0]?.year}.`, rule: `Rule: ${HANDS_RUN} or more changes of hands on record.` });
  }
  const gapT = verified.map((t) => ({ t, g: (t.seat as number) - (t.district as number) })).filter((x) => Math.abs(x.g) >= TURNOUT_GAP)[0];
  if (gapT !== undefined) {
    notes.push({
      text: `${gapT.t.label}: turnout of ${(gapT.t.seat as number).toFixed(1)}% was ${pp(gapT.g)} points ${gapT.g > 0 ? "above" : "below"} ${analysis.place.districtName ?? "the district"}'s ${(gapT.t.district as number).toFixed(1)}%.`,
      rule: `Rule: seat turnout ${TURNOUT_GAP} points or more from its district's.`,
    });
  }

  /* ───────── what the page leaves out ───────── */
  const decl = oldestFirst.filter((r) => r.winner !== null && r.bar === null).map((r) => r.year);
  const unitem = countedRows.map((r) => r.unitemised).filter((u) => u > 0);
  const leavesOut: string[] = [
    ...(decl.length === 0 ? [] : [`${decl.join(" and ")}: only the winner, the party and a declared margin are on record, so shares, swing, the runner-up and turnout are not drawn for ${decl.length === 1 ? "it" : "them"}.`]),
    ...(countedRows.length === 0
      ? []
      : [`Only the leading candidates are on record for ${countedRows.map((r) => r.label).join(", ")}, so the shares add up to less than 100%${unitem.length === 0 ? "" : `: the unfilled part is ${Math.min(...unitem).toFixed(1)}% to ${Math.max(...unitem).toFixed(1)}%`}, and it is "not itemised", never "others".`]),
    "These are parties, not people: no alliance is drawn, a party rename reads as a change of party, and a person is not followed across a change of party or seat.",
    ...(brief.place.kind === "pc" ? ["This is a Lok Sabha seat: no assembly seat's shares, swing or turnout are drawn against it, because those are other offices."] : []),
  ];

  return { finding, rule, subject, ladder, rowNotes, rowWinners, chips, followed, follow, hero, notDrawn, closeAnswer, wave: { answer: waveAnswer, panels }, turnout: { answer: turnoutAnswer, rows: turnoutRows }, notes: notes.slice(0, 3), leavesOut };
}


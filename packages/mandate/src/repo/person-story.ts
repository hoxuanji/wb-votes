// What the person page says, computed from the record: the finding (one sentence and the line under it), the run of columns the seat's elections
// make with this person marked in them, the shape of a career, and the glyphs of the index's ladder. Pure functions over `PersonBrief` and the seat's
// history: no React and no database, so person-story.test.ts runs them on literals and on every person in the registry.
//
// THE RULES A SENTENCE KEEPS (`auditFinding` holds them): every number is read from the person's rows, a margin with no counts behind it is called
// declared, nobody who stood in an election with no result of their own is said to have lost it, and no sentence uses a pronoun, "never", "first time"
// or "only". "On record" says what the registry holds; it is a partial record (the top five of three elections and a bare winner for the fourth), so
// it never says what did not happen.

import { bodyWord } from "../core/election-kind.ts";
import { inr } from "../semantic/index.ts";
import { displayName } from "./display-name.ts";
import { figure, text } from "./finding.ts";
import type { Finding, Part } from "./finding.ts";
import type { PersonBrief } from "./person.ts";
import type { HeldBlock, SeatHistory } from "./seat-history.ts";
import type { PartyRef, SeatMargin } from "./seat-results.ts";
import type { MarginCol } from "../viz/margin-columns.ts";

type Cand = PersonBrief["candidacies"][number];

/** A win: the result row says so, or the candidacy record says elected (one seat has the second and no result row at all). */
export const won = (c: Cand): boolean => c.isWinner || c.status === "elected";

/** A loss the record can state: counted, with the rank the source gave. Everything else that is not a win is only "not the declared winner". */
export const lostCounted = (c: Cand): boolean => !won(c) && c.status === "defeated";

const ordinal = (n: number): string => {
  const rest = n % 100;
  const suffix = rest >= 11 && rest <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
};

const TIMES = ["no times", "once", "twice", "three times"];
const times = (n: number): string => TIMES[n] ?? `${n} times`;

/** The body a seat elects to, in a reader's words: "Assembly" or "Lok Sabha". */
export const bodyOfPlace = (placeKind: string | null): string => bodyWord(placeKind === "pc" ? "lok-sabha" : "assembly");
const bodyOf = (c: Cand): string => bodyOfPlace(c.placeKind);

const partyPart = (c: Cand): Part | null => (c.partyShortName === null ? null : { party: { key: c.partyId ?? c.partyShortName, code: c.partyShortName } });
const seatPart = (c: Cand): Part => (c.placeHref === null ? text(c.placeName) : { seat: { href: c.placeHref, name: c.placeName } });

const decl = (margin: number, counted: boolean): string => `${counted ? "" : "a declared "}${inr(Math.abs(margin))} votes`;

/** The seat's declared winner for one contest and by how much, from the seat's history, as the words after "won by". */
function seatWinner(c: Cand, history: SeatHistory | null): { parts: Part[]; margin: SeatMargin | null } | null {
  const r = history?.results.find((x) => x.contestId === c.contestId);
  const w = c.wonBy;
  if (w === null) return null;
  const party: Part | null = r?.winner?.party ? { party: { key: r.winner.party.key, code: r.winner.party.label } } : w.partyShortName === null ? null : { party: { key: w.partyShortName, code: w.partyShortName } };
  return {
    parts: [{ person: { id: w.personId, name: displayName(w.name) } }, ...(party === null ? [] : [text(" "), party])],
    margin: r?.margin ?? null,
  };
}

const bySeat = (cs: readonly Cand[]): boolean => new Set(cs.map((c) => c.versionId)).size === 1;

export function personFinding(brief: PersonBrief, ctx: { history: SeatHistory | null }): Finding {
  const name = displayName(brief.person.canonicalName);
  const cs = [...brief.candidacies].reverse(); // oldest first
  const [first] = cs;
  const last = cs.at(-1);
  if (first === undefined || last === undefined) {
    const s = brief.sitting;
    return s === null
      ? { shape: "record", parts: [text(`No contest is on record for ${name}.`)] }
      : { shape: "press", parts: [text(`Named as a member of the ${s.term} assembly in a press report; no contest is on record for ${name}.`)] };
  }
  const party = partyPart(last);
  const seat = seatPart(last);
  const span = first.year === last.year ? `${last.year}` : `${first.year} to ${last.year}`;
  const wins = cs.filter(won);

  // Where the contest was declared for another, said as the seat's winner and by how much.
  const lostTo = (c: Cand): Part[] => {
    const sw = seatWinner(c, ctx.history);
    if (sw === null) return [];
    return [text(" The seat was won by "), ...sw.parts, ...(sw.margin === null ? [] : [text(` by ${decl(sw.margin.votes, sw.margin.basis === "counted")}`)]), text(".")];
  };

  // The line under the sentence: the margins it rests on, counted apart from declared.
  const counted = wins.filter((c) => c.votes !== null && c.margin !== null);
  const declared = wins.filter((c) => c.votes === null && c.margin !== null);
  const support: Part[] = [
    ...(counted.length === 0 ? [] : [text(`Counted margins: ${counted.map((c) => `${inr(Math.abs(c.margin as number))} (${c.year})`).join(", ")}. `)]),
    ...declared.map((c) => text(`${c.year}: a declared margin of ${inr(Math.abs(c.margin as number))}; no vote counts are published. `)),
  ];
  const noRow = cs.find((c) => won(c) && !c.isWinner);
  const supportWith = (extra: Part[]): Part[] => [...support, ...extra].filter((p) => !("t" in p) || p.t !== "");
  // The line under the sentence, or nothing: and never ending in the space its last clause was written with.
  const trim = (ps: Part[]): Part[] | undefined => {
    const end = ps.at(-1);
    if (end === undefined) return undefined;
    return "t" in end ? [...ps.slice(0, -1), text(end.t.trimEnd())] : ps;
  };

  // 2 · one contest, won.
  if (cs.length === 1 && won(last)) {
    return {
      shape: "won-one",
      parts: [
        text("Won "),
        seat,
        text(` (${bodyOf(last)}) `),
        ...(party === null ? [] : [text("for "), party, text(" ")]),
        text(`in ${last.year}`),
        ...(last.margin === null ? [] : [text(` by ${decl(last.margin, last.votes !== null)}`)]),
        text("."),
      ],
      // One contest: the margin is already in the sentence, so the line under it says only what the sentence cannot.
      standfirst: trim(noRow !== undefined ? [text(`The result table holds no row for this contest; the candidacy record names ${name} as elected.`)] : []),
    };
  }

  // 3 · one contest, not the declared winner.
  if (cs.length === 1) {
    return {
      shape: "stood-one",
      parts: [
        text("Stood "),
        ...(party === null ? [] : [text("for "), party, text(" ")]),
        text("at "),
        seat,
        text(` in ${last.year}`),
        ...(lostCounted(last) && last.rank !== null ? [text(`, finishing ${ordinal(last.rank)}`)] : []),
        text("."),
        ...lostTo(last),
      ],
      standfirst: lostCounted(last)
        ? undefined
        : [text(`The ${last.year} result publishes the winner and the margin, and no vote count, rank or share is on record for ${name}.`)],
    };
  }

  const oneSeat = bySeat(cs);
  const results = cs.map((c) => (won(c) ? "W" : "N")).join("");

  if (oneSeat) {
    // 4 · lost first, then a counted win.
    const firstWin = cs.findIndex(won);
    const lostFirst = firstWin > 0 && cs.slice(0, firstWin).every(lostCounted);
    const firstWinCandidacy = cs[firstWin];
    if (lostFirst && firstWinCandidacy !== undefined && firstWinCandidacy.votes !== null && /^N+W+$/.test(results)) {
      const losses = cs.slice(0, firstWin);
      const only = losses.length === 1 ? losses[0] : undefined;
      return {
        shape: "lost-then-won",
        parts: [
          text("Lost "),
          seat,
          ...(only !== undefined && only.margin !== null ? [text(" by "), figure(inr(Math.abs(only.margin))), text(" votes")] : []),
          text(only !== undefined ? ` in ${only.year}` : ` ${times(losses.length)}, ${losses.map((c) => c.year).join(", ")}`),
          text(`, won it in ${firstWinCandidacy.year}`),
          text(wins.length > 1 ? " and has held it since." : "."),
        ],
        standfirst: trim(supportWith([])),
      };
    }

    // 5 · shares rising across counted losses, then a win.
    const rising = cs.slice(0, Math.max(firstWin, 0)).filter((c) => lostCounted(c) && c.voteShare !== null);
    if (firstWin > 1 && rising.length === firstWin && rising.every((c, i) => i === 0 || (c.voteShare as number) > (rising[i - 1]?.voteShare as number))) {
      const a = rising[0]?.voteShare as number;
      const b = rising.at(-1)?.voteShare as number;
      return {
        shape: "rose",
        parts: [text("Rose from "), figure(`${a.toFixed(1)}%`), text(" to "), figure(`${b.toFixed(1)}%`), text(" of the vote at "), seat, text(`, then won the seat in ${cs[firstWin]?.year}.`)],
        standfirst: trim(supportWith([])),
      };
    }

    // 6 · won, then not the declared winner.
    if (/^W+N+$/.test(results) && last.wonBy !== null) {
      return {
        shape: "won-then-not",
        parts: [
          text("Won "),
          seat,
          text(` ${times(wins.length)} `),
          ...(party === null ? [] : [text("for "), party, text(", ")]),
          text(`${wins[0]?.year}${wins.length > 1 ? ` to ${wins.at(-1)?.year}` : ""}. In ${last.year} the seat went to `),
          ...(seatWinner(last, ctx.history)?.parts ?? []),
          ...(() => {
            const m = seatWinner(last, ctx.history)?.margin;
            return m === null || m === undefined ? [] : [text(` by ${decl(m.votes, m.basis === "counted")}`)];
          })(),
          text("."),
        ],
        standfirst: trim(supportWith([])),
      };
    }

    // 7 · won every contest.
    if (/^W+$/.test(results)) {
      return {
        shape: "won-all",
        parts: [text("Won "), seat, text(" "), ...(party === null ? [] : [text("for "), party, text(" ")]), text("at all "), figure(String(cs.length)), text(` elections on record, ${span}.`)],
        standfirst: trim(
          supportWith(noRow === undefined ? [] : [text(`The result table holds no row for ${noRow.year}; the candidacy record names ${name} as elected.`)]),
        ),
      };
    }
  } else if (/^W+$/.test(results)) {
    return { shape: "won-all", parts: [text("Won all "), figure(String(cs.length)), text(` contests on record, ${span}.`)], standfirst: trim(supportWith([])) };
  }

  // 8 · the fallback: what is on record, with nothing characterised.
  return {
    shape: "record",
    parts: [text(`Stood in ${cs.length} contests on record, ${span}; ${wins.length === 0 ? "none is a declared win" : `${wins.length} ${wins.length === 1 ? "is" : "are"} declared ${wins.length === 1 ? "a win" : "wins"}`}.`)],
    standfirst: trim(supportWith([])),
  };
}

/* ───────────────────────────── the run ───────────────────────────── */

export type Mine = {
  glyph: "won" | "rank" | "notWinner" | "stood";
  rank: number | null;
  party: PartyRef | null;
  /** Signed: ahead of the runner-up is positive, behind the winner negative. */
  margin: { votes: number; basis: "counted" | "declared" } | null;
  share: number | null;
  /** The whole column in a sentence, for the title and the screen reader. */
  sentence: string;
  /** The candidacy record names this person as elected and the registry has no result row: the holder is theirs by that record only. */
  namedAsElected: boolean;
};

export type RunColumn = {
  contestId: string;
  year: number;
  label: string;
  /** The seat's holder at this election, or null where none is declared. */
  holder: PartyRef | null;
  holderName: string | null;
  changedHands: boolean;
  /** This person's own result in it, or null where they have no candidacy on record (a blank column, never "did not stand"). */
  mine: Mine | null;
};

export function runColumns(brief: PersonBrief, history: SeatHistory, versionId: number): RunColumn[] {
  const name = displayName(brief.person.canonicalName);
  const mineBy = new Map(brief.candidacies.filter((c) => c.versionId === versionId).map((c) => [c.contestId, c]));
  return history.held.map((b: HeldBlock): RunColumn => {
    const c = mineBy.get(b.contestId);
    if (c === undefined) {
      return { contestId: b.contestId, year: b.year, label: b.label, holder: b.party, holderName: b.winner, changedHands: b.changedHands, mine: null };
    }
    const w = won(c);
    const party: PartyRef | null = c.partyShortName === null ? null : { key: c.partyId ?? c.partyShortName, label: c.partyShortName };
    const margin: Mine["margin"] =
      c.margin === null ? null : { votes: w ? Math.abs(c.margin) : -Math.abs(c.margin), basis: c.votes === null ? "declared" : "counted" };
    const glyph: Mine["glyph"] = w ? "won" : c.votes !== null && c.rank !== null ? "rank" : "notWinner";
    const word = glyph === "won" ? "won" : glyph === "rank" ? `rank ${c.rank}` : "not the declared winner";
    const namedAsElected = w && !c.isWinner && b.party === null;
    return {
      contestId: b.contestId,
      year: b.year,
      label: b.label,
      holder: b.party ?? (namedAsElected ? party : null),
      holderName: b.winner ?? (namedAsElected ? name : null),
      changedHands: b.changedHands,
      mine: {
        glyph,
        rank: c.rank,
        party,
        margin,
        share: c.voteShare,
        namedAsElected,
        sentence:
          `${b.label}: ${name} ${word}` +
          (party === null ? "" : ` for ${party.label}`) +
          (margin === null ? "" : `; margin ${inr(Math.abs(margin.votes))} votes ${margin.votes >= 0 ? "ahead" : "behind"}${margin.basis === "declared" ? " (declared)" : ""}`) +
          (c.voteShare === null ? "" : `; share ${c.voteShare}%`),
      },
    };
  });
}

/** The columns' margins as the geometry takes them: a column with no margin of this person's is blank. */
export function marginCols(cols: readonly RunColumn[]): MarginCol[] {
  return cols.map((c) => ({
    id: c.contestId,
    label: c.label,
    votes: c.mine?.margin?.votes ?? null,
    basis: c.mine?.margin?.basis ?? null,
    key: c.mine?.party?.key ?? null,
    changedHands: c.changedHands,
  }));
}

/* ───────────────────────────── the shape of a career ───────────────────────────── */

export type CareerShape = "every" | "lost-then-won" | "won-then-not" | "none" | "mixed";

export const CAREER_SHAPES: readonly { key: CareerShape; label: string }[] = [
  { key: "every", label: "Won every contest on record" },
  { key: "lost-then-won", label: "Did not win, then won" },
  { key: "won-then-not", label: "Won, then did not win again" },
  { key: "none", label: "No win on record" },
  { key: "mixed", label: "Won and did not win in a mixed order" },
];

/**
 * The five exclusive shapes of a career of two or more contests, from its outcomes oldest first (true is a win). The order of the tests is the
 * priority: every win, then no win, then not-winning-then-winning, then winning-then-not, and anything else is mixed. Fewer than two contests
 * is no career to shape.
 */
export function careerShape(outcomes: readonly boolean[]): CareerShape | null {
  if (outcomes.length < 2) return null;
  const s = outcomes.map((w) => (w ? "W" : "N")).join("");
  if (/^W+$/.test(s)) return "every";
  if (/^N+$/.test(s)) return "none";
  if (/^N+W+$/.test(s)) return "lost-then-won";
  if (/^W+N+$/.test(s)) return "won-then-not";
  return "mixed";
}

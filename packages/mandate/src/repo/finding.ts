// A finding: the one sentence a page says first, as parts rather than as a string, so that a person is a link, a party is a swatch with its code,
// and a figure is set in the mono face without the component having to parse prose.
//
// Written by the page's own builder (seat-story.ts, person-story.ts, place-story.ts) from rules that read the record; none of them types a number.
// `auditFinding` is what every builder's property test calls: it is the one place the rules a generated sentence must keep are written down.

export type Part =
  | { t: string }
  | { n: string }
  | { party: { key: string; code: string } }
  | { person: { id: string | null; name: string } }
  | { seat: { href: string; name: string } };

export type Finding = {
  /** Which rule said it: narrow, rise, hands, hold, lone, plain. */
  shape: string;
  parts: Part[];
  /** The smaller line under the sentence, where there is one. */
  standfirst?: Part[];
};

export const text = (t: string): Part => ({ t });
export const figure = (n: string): Part => ({ n });

/** The sentence as plain text: a party is its code, a person is their name. */
export function plain(parts: readonly Part[]): string {
  return parts
    .map((p) => ("t" in p ? p.t : "n" in p ? p.n : "party" in p ? p.party.code : "person" in p ? p.person.name : p.seat.name))
    .join("");
}

/** Shapes whose sentence this codebase composed from the record, and so the ones that must keep the rules below. */
const GENERATED = new Set(["narrow", "rise", "lone", "won-one", "stood-one", "lost-then-won", "rose", "won-then-not", "won-all", "record", "press", "close", "every", "held", "won"]);

const BANNED = /\b(defeated|lost to|beat|beaten|first time|he|she|his|her|him)\b/i;

/**
 * Everything wrong with a finding, one sentence each. Empty is clean.
 *
 *  · every digit run in the sentence occurs in `haystack`, the inputs rendered as text (commas ignored), so a number is read and never typed;
 *  · where no counts are behind a margin, the word "declared" accompanies it;
 *  · a generated sentence never says a 2026 candidate defeated, beat or lost to anyone, never says "first time", and uses no pronoun;
 *  · it is not empty.
 */
export function auditFinding(f: Finding, ctx: { haystack: string; hasCounts: boolean }): string[] {
  const bad: string[] = [];
  const said = plain([...f.parts, ...(f.standfirst ?? [])]);
  if (said.trim() === "") bad.push("the finding is empty");
  const have = ctx.haystack.replace(/,/g, "");
  for (const run of said.replace(/,/g, "").match(/\d+/g) ?? []) {
    if (!have.includes(run)) bad.push(`"${run}" is in the sentence and in none of its inputs`);
  }
  if (!ctx.hasCounts && /\d[\d,]*\s+votes/.test(said) && !/declared/i.test(said)) {
    bad.push("a margin with no counts behind it is printed without the word declared");
  }
  if (GENERATED.has(f.shape)) {
    const m = BANNED.exec(said);
    if (m !== null) bad.push(`"${m[0]}" is in a generated sentence`);
  }
  return bad;
}

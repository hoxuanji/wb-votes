// The quiet glow behind a seat's page, in the colour of the party that holds the seat. Pure: a history in, a colour or nothing out.
//
// WHAT IT IS. The page has a faint lit edge along its top (iei.css, "the skin"). On the seat page and its Analysis that light is
// tinted with the ink of the party whose candidate won the seat's newest election, and on no other page: the front page, a person,
// a list, a state, an election and the coverage page keep the neutral one. The owner objected on 2026-10-29 that a front page which
// opened on one state's story looked selective, so a colour is spent only where a page is about one seat and that seat's holder.
//
// WHAT IT IS NOT. It is decoration. The party is named by the finding, the chips and the tables on the same page, and nothing
// reads the glow; a reader who cannot see the colour has lost nothing. It therefore has three ways of being absent, and each is the
// page exactly as it was:
//
//   · the seat's NEWEST election declares no winner (Falta in 2026: a candidacy names someone as elected and no result row exists).
//     The brief for this rule said "the latest election that has a declared winner"; read literally that would colour Falta in the
//     colour of its 2021 winner, a party the record itself no longer shows as holding the seat. So an election with no declared result
//     is not skipped, it is the answer: the seat has no holder on record, and no leader is lit for it.
//   · the winner has no party identity (an independent, or a candidacy the source printed no party for): `party-ink` gives those a
//     neutral grey on purpose, and a grey glow would be a different neutral rather than no colour.
//   · the winner's party has no recorded colour. `party-ink` still draws it, in a hue taken from a hash of its id, at a lower chroma
//     ("this party's own colour is not recorded here"); a page-wide light in an invented hue would say more than the record does.
//
// A DECLARED winner is enough. The registry's 2026 and 2024 results are winners and margins with no candidate vote counts, and a
// winner declared without counts is still the winner the seat page names, so the glow does not wait for counts: waiting would leave it
// on no seat of the dev registry at all (335 of 336 current seats have exactly that result as their newest election).
//
// IT NEVER LOWERS A TEXT CONTRAST. The light sits behind text that is not on a card (the title, the crumbs, the translucent top bar),
// and `--iei-ink-3` is the dimmest ink the page may print. The alpha is therefore not a constant: it is the strongest one, up to the
// neutral glow's own 0.13, at which ink-3 still clears FLOOR over the brightest the page can get under it (the glow over the
// top-left highlight over the canvas). A pale party (Telugu Desam's yellow) gets a weaker glow than a saturated one for that reason.

import { chromaOf, tokenFor } from "../viz/party-ink.ts";
import { contrastOf } from "../viz/colour.ts";

/** The least an ink-3 label may measure against the glow at its brightest. The page's rule is 4.5; the margin is for the pixels this model does not name. */
export const FLOOR = 4.6;

/** The neutral glow's alpha (iei.css `.iei`), which no party glow exceeds. */
export const NEUTRAL_ALPHA = 0.13;

/** Below this OKLab chroma a colour is a grey (`party-ink.test.ts` calls the two neutrals "no hue by design"). */
const HUELESS = 0.02;

// The surfaces the model composites, as iei.css declares them: the canvas, the 4% white highlight at the top-left, and the label ink.
const CANVAS = "#07070b";
const HIGHLIGHT = 0.04;
const INK_3 = "#8b8ba2";

const channels = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const hex = (rgb: readonly number[]): string => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** sRGB-space "source over", which is what a browser's gradient layers do. */
const over = (top: readonly number[], a: number, under: readonly number[]): number[] => top.map((v, i) => v * a + (under[i] as number) * (1 - a));

/** The brightest the page gets under a glow of this colour and alpha: the glow over the highlight over the canvas. */
function brightest(fill: string, alpha: number): string {
  const lit = over([255, 255, 255], HIGHLIGHT, channels(CANVAS));
  return hex(over(channels(fill), alpha, lit));
}

/** The strongest alpha, in steps of 0.005 down from the neutral glow's, at which a label still measures FLOOR; null when none does. */
export function alphaFor(fill: string): number | null {
  for (let a = NEUTRAL_ALPHA; a >= 0.02; a = Math.round((a - 0.005) * 1000) / 1000) {
    if (contrastOf(brightest(fill, a), INK_3) >= FLOOR) return a;
  }
  return null;
}

/** What `Shell` is given: the party the light is in the colour of, and the colour, as a CSS value for `--iei-glow`. */
export type SeatGlow = { party: string; colour: string };

/** Only the part of a seat's history the rule reads, so a literal can stand in for one. `results` is newest first. */
export type GlowHistory = { results: readonly { winner: { party: { key: string } } | null }[] };

/**
 * The party key the glow is in the colour of, or null: the declared winner of the seat's newest election, where it has one.
 * (Whether that party has a colour to light is `seatGlow`'s question, so that this is the one place the election is chosen.)
 */
export function glowParty(history: GlowHistory): string | null {
  return history.results[0]?.winner?.party.key ?? null;
}

/** The glow for a party key: its recorded hue at the alpha its lightness allows, or null where it has none. */
export function glowOf(party: string): SeatGlow | null {
  const token = tokenFor(party);
  if (token.basis !== "curated" || chromaOf(token.fill) < HUELESS) return null;
  const alpha = alphaFor(token.fill);
  if (alpha === null) return null;
  const [r, g, b] = channels(token.fill);
  return { party: token.key, colour: `rgba(${r}, ${g}, ${b}, ${alpha})` };
}

/** The glow for a seat's page, or null when the page keeps the neutral one. Total: it reads a history and throws on none. */
export function seatGlow(history: GlowHistory): SeatGlow | null {
  const party = glowParty(history);
  return party === null ? null : glowOf(party);
}

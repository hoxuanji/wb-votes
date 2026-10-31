// The glow behind a seat's page: which party it is in the colour of, when it is absent, that it never costs a label its contrast, and which pages carry it.
//
// The rule (repo/seat-glow.ts) is held three ways: on literals, for every curated party, and on every current seat of the registry; and the
// pages are rendered, because the rule is only worth having if it reaches the seat's page and its Analysis and no other page.

import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { DEV_DB_PATH, openRead } from "../db/open.ts";
import { all } from "../db/index.ts";
import { CURATED_KEYS, chromaOf, fillFor, tokenFor } from "../viz/party-ink.ts";
import { contrastOf } from "../viz/colour.ts";
import { FLOOR, NEUTRAL_ALPHA, alphaFor, glowOf, glowParty, seatGlow } from "./seat-glow.ts";
import type { GlowHistory } from "./seat-glow.ts";
import { readSeatHistory } from "./seat-history.ts";
import { currentSeat } from "./testkit.ts";

const HAVE_DB = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const live = { skip: HAVE_DB ? false : "no .data/registry.db — run npm run registry:ingest" };
const db = HAVE_DB ? openRead() : (null as unknown as ReturnType<typeof openRead>);

const ROOT = new URL("../../../../", import.meta.url).pathname;

const won = (key: string) => ({ winner: { party: { key } } });
const none = { winner: null };

/** Every channel of an `rgba(r, g, b, a)`, and nothing else is accepted: the value goes into a style attribute. */
const RGBA = /^rgba\((\d{1,3}), (\d{1,3}), (\d{1,3}), (0\.\d{1,3})\)$/;

/** The brightest the page gets under a glow, modelled here from the channels in the colour the rule produced (not from its own helper). */
function brightestUnder(colour: string): string {
  const m = RGBA.exec(colour);
  assert.ok(m !== null, `not an rgba colour: ${colour}`);
  const [r, g, b, a] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  const lit = [7, 7, 11].map((v) => 255 * 0.04 + v * 0.96);
  const px = [r, g, b].map((v, i) => v * a + (lit[i] as number) * (1 - a));
  return `#${px.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

/* ───────────────────────────────── which party ───────────────────────────────── */

test("the glow is the declared winner of the newest election, and the newest election alone", () => {
  assert.equal(glowParty({ results: [won("BJP"), won("AITC"), won("AITC")] }), "BJP");
  assert.equal(glowParty({ results: [won("AITC")] }), "AITC");
});

test("a newest election with no declared winner lights nothing, and does not fall back to an older holder", () => {
  // Falta in 2026: a candidacy names someone as elected and no result row exists. The 2021 winner is not the seat's holder on that record.
  const falta: GlowHistory = { results: [none, won("AITC"), won("AITC")] };
  assert.equal(glowParty(falta), null);
  assert.equal(seatGlow(falta), null);
});

test("a seat with no election, and a seat whose every election declared nobody, keep the neutral light", () => {
  assert.equal(seatGlow({ results: [] }), null);
  assert.equal(seatGlow({ results: [none, none] }), null);
});

test("a winner declared with nothing counted lights the seat as a counted one does: the history does not carry the difference", () => {
  // `seat-history` marks an election "declared" when the source published a winner and no candidate votes. The rule reads only the winner, so a
  // seat whose newest election is of that kind (335 of the dev registry's 336) is lit by it.
  const g = seatGlow({ results: [won("BJP")] });
  assert.ok(g !== null);
  assert.equal(g.party, "BJP");
});

/* ───────────────────────────────── which colour ───────────────────────────────── */

test("a party with a recorded hue is lit in that hue, as an rgba the page can set as a custom property", () => {
  for (const key of ["BJP", "AITC", "INC", "CPI(M)"]) {
    const g = glowOf(key);
    assert.ok(g !== null, `${key} has a recorded hue and no glow`);
    const m = RGBA.exec(g.colour);
    assert.ok(m !== null, `${key}: ${g.colour}`);
    // The channels are the party's own fill, not a hand-picked value.
    const fill = fillFor(key);
    assert.equal(`#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, "0")).join("")}`, fill, `${key}'s glow is not its ink`);
  }
  assert.notEqual(glowOf("BJP")?.colour, glowOf("AITC")?.colour, "two parties are lit alike");
});

test("a party the page draws without a hue, or in a hue the record does not hold, keeps the neutral light", () => {
  // An independent and a candidacy with no party are neutral greys by design; a generated hue is "this party's own colour is not recorded".
  for (const key of ["IND", "unattached", "AAM JANATA UNNAYAN PARTY", "ALL INDIA SECULAR FRONT", "zzz-no-such-party", ""]) {
    assert.equal(glowOf(key), null, `${JSON.stringify(key)} is lit`);
  }
});

test("a key that is a curated party in another case is lit as that party, as every other mark is drawn", () => {
  assert.equal(glowOf("bjp")?.colour, glowOf("BJP")?.colour);
});

test("the alpha is the neutral glow's at most, and falls for a pale ink until a label still clears the floor", () => {
  assert.equal(alphaFor(fillFor("BJP")), NEUTRAL_ALPHA);
  const pale = alphaFor(fillFor("TDP"));
  assert.ok(pale !== null && pale < NEUTRAL_ALPHA, `a yellow glow is as strong as the neutral one (${pale})`);
});

test("under every curated party's glow, the dimmest label ink still clears the floor at the brightest the page gets", () => {
  let lit = 0;
  for (const key of CURATED_KEYS) {
    const g = glowOf(key);
    if (g === null) {
      assert.ok(chromaOf(tokenFor(key).fill) < 0.02, `${key} has a hue and no glow`);
      continue;
    }
    lit += 1;
    const c = contrastOf(brightestUnder(g.colour), "#8b8ba2");
    assert.ok(c >= FLOOR, `${key}: ink-3 measures ${c.toFixed(2)} under its glow, below ${FLOOR}`);
    assert.ok(c >= 4.5, `${key}: below the 4.5 small-text floor`);
    assert.ok(Number(RGBA.exec(g.colour)?.[4]) <= NEUTRAL_ALPHA, `${key}: stronger than the neutral light`);
  }
  assert.ok(lit >= 50, `only ${lit} curated parties are lit: the check has stopped reaching them`);
});

test("the neutral light itself clears the same floor, so the rule never holds a party to more than the page already meets", () => {
  const c = contrastOf(brightestUnder("rgba(132, 132, 255, 0.13)"), "#8b8ba2");
  assert.ok(c >= 4.5, `the neutral glow measures ${c.toFixed(2)}`);
});

/* ───────────────────────────────── every seat ───────────────────────────────── */

test("every current seat of the registry gets a glow or the neutral light, and never an error", live, () => {
  const seats = all<{ id: number }>(db, `SELECT a.id AS id FROM place_version a WHERE a.kind IN ('ac', 'pc') AND ${currentSeat(db, "a")} ORDER BY a.id`);
  assert.ok(seats.length >= 300, `only ${seats.length} current seats`);
  const lit = new Map<string, number>();
  let neutral = 0;
  for (const { id } of seats) {
    const history = readSeatHistory(db, id);
    const g = seatGlow(history);
    const newest = history.results[0];
    if (newest === undefined || newest.winner === null) {
      assert.equal(g, null, `seat ${id}: its newest election declares no winner and it is lit`);
    }
    if (g === null) {
      neutral += 1;
      continue;
    }
    assert.ok(newest?.winner !== null && newest?.winner !== undefined, `seat ${id}: lit with no winner`);
    assert.equal(g.party, tokenFor(newest.winner.party.key).key, `seat ${id}: lit for another party than its winner`);
    assert.match(g.colour, RGBA, `seat ${id}: ${g.colour}`);
    assert.ok(contrastOf(brightestUnder(g.colour), "#8b8ba2") >= FLOOR, `seat ${id}: a label loses its contrast`);
    lit.set(g.party, (lit.get(g.party) ?? 0) + 1);
  }
  assert.equal(neutral + [...lit.values()].reduce((a, b) => a + b, 0), seats.length);
  assert.ok(lit.size >= 3, `seats are lit in only ${lit.size} colours: ${JSON.stringify([...lit])}`);
  assert.ok([...lit.values()].reduce((a, b) => a + b, 0) >= seats.length * 0.8, `${neutral} of ${seats.length} seats keep the neutral light`);
});

/* ───────────────────────────────── which pages ───────────────────────────────── */

function render(route: string, query = "", segments = ""): string {
  try {
    return execFileSync(process.execPath, ["--import", "./ops/probe/render/register.mjs", "./ops/probe/render/render.mjs", route, query, segments], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    throw new Error(`render ${route} ${query} ${segments} failed:\n${err.stderr ?? err.message}`);
  }
}

/** The page wrapper's own style attribute, which is where `Shell` sets the light. */
function wrapperStyle(html: string): string | null {
  const m = /<div class="iei"(?: style="([^"]*)")?>/.exec(html);
  assert.ok(m !== null, "the page has no wrapper to read the light from");
  return m[1] ?? null;
}

test("a seat's page and its Analysis carry its holder's colour on the page wrapper, and nothing else carries it", live, () => {
  const bjp = glowOf("BJP")?.colour as string;
  const aitc = glowOf("AITC")?.colour as string;
  for (const [route, segments, colour] of [
    ["/constituency", "wb/assembly/mekliganj", bjp],
    ["/constituency/analysis", "wb/assembly/mekliganj", bjp],
    ["/constituency", "wb/lok-sabha/baharampur", aitc],
    ["/constituency/analysis", "wb/lok-sabha/baharampur", aitc],
  ] as const) {
    assert.equal(wrapperStyle(render(route, "", segments)), `--iei-glow:${colour}`, `${route} ${segments}`);
  }
});

test("a seat with no declared winner in its newest election, an independent's seat and a seat of a party with no recorded colour keep the neutral light", live, () => {
  for (const segments of ["wb/assembly/falta", "wb/assembly/sitalkuchi", "wb/assembly/naoda"]) {
    for (const route of ["/constituency", "/constituency/analysis"]) {
      assert.equal(wrapperStyle(render(route, "", segments)), null, `${route} ${segments} is lit`);
    }
  }
});

test("a window on the Analysis does not change whose colour the page is", live, () => {
  const bare = wrapperStyle(render("/constituency/analysis", "", "wb/assembly/mekliganj"));
  assert.ok(bare !== null);
  assert.equal(wrapperStyle(render("/constituency/analysis", "from=2011&to=2016", "wb/assembly/mekliganj")), bare);
});

test("the front page, a person, a state, an election, the candidates list, the coverage page and search stay neutral", live, () => {
  for (const [route, query, segments] of [
    ["/", "", ""],
    ["/", "state=wb", ""],
    ["/p", "", "mamata-banerjee-4a681f"],
    ["/state", "", "wb"],
    ["/election", "", "wb-assembly-2021"],
    ["/candidates", "", ""],
    ["/coverage", "", ""],
    ["/search", "q=falta", ""],
  ] as const) {
    const html = render(route, query, segments);
    assert.equal(wrapperStyle(html), null, `${route} ${query} ${segments} sets a glow`);
    assert.doesNotMatch(html, /--iei-glow/, `${route} ${query} ${segments} names the glow`);
  }
});

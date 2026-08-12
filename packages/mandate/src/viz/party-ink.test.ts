// The party visual identity system, as a set of claims.
//
// WHAT MATTERS HERE, in order. Stability first: a party's colour must not depend on its rank, its seat count,
// the order of a result set, or which page it is on — that was the defect this system replaced, and it is the
// one a test can hold permanently. Then the accessibility floors, which are hard constraints. Then separation,
// which is measured and REPORTED rather than asserted at a floor the brief itself says is unreachable: 21
// identity hues cannot be pairwise separable under dichromacy, so what is asserted is that no two are
// near-identical to a normal eye and that colour is never the only channel.

import assert from "node:assert/strict";
import test from "node:test";
import { BAND, CURATED_KEYS, DERIVED, NOT_HELD, chromaOf, fillFor, partyKey, tokenFor } from "./party-ink.ts";
import { contrastOf, deltaE, VISIONS } from "./colour.ts";

/** The three surfaces a mark is drawn on, from iei.css. */
const SURFACES = { bg: "#07070b", panel: "#0d0d13", raised: "#14141c" } as const;
/** WCAG AA for a non-text mark that has to be distinguishable from its background. */
const MARK_FLOOR = 3;
/** WCAG AA for text below 18.66px bold — which is every size this product draws. */
const TEXT_FLOOR = 4.5;

import config from "../../../../data/party-ink.json" with { type: "json" };

const CONFIG = config as unknown as {
  parties: Record<string, { name: string; l: number; c: number; h: number; note: string }>;
};

/* ────────────────────────────── stability, which is the whole point ────────────────────────────── */

test("a party's colour depends on its identity and on nothing else", () => {
  // The defect: PARTY_HUES handed out three hues by RANK, so the party leading the most jurisdictions took
  // slot one. On a map of 2004 that is a different party, and the same party was two colours on two pages.
  //
  // Simulated four ways. If any of them changes a colour, the system has a context dependency.
  const keys = ["BJP", "INC", "AITC", "JD(S)", "some-unlisted-party", "IND"];
  const once = keys.map((k) => fillFor(k));

  // 1. Reversed order.
  assert.deepEqual([...keys].reverse().map((k) => fillFor(k)).reverse(), once, "order changes colour");
  // 2. A different-sized set — rank would move for every member.
  assert.deepEqual(keys.slice(0, 3).map((k) => fillFor(k)), once.slice(0, 3), "set size changes colour");
  // 3. Called again, after everything else.
  assert.deepEqual(keys.map((k) => fillFor(k)), once, "a second call differs from the first");
  // 4. Interleaved with 400 other lookups, which is what a page render looks like.
  for (let i = 0; i < 400; i += 1) fillFor(`filler-${i}`);
  assert.deepEqual(keys.map((k) => fillFor(k)), once, "unrelated lookups changed a colour");
});

test("every party gets a token, including the ones nobody curated", () => {
  for (const k of ["BJP", "JD(S)", "Rashtriya Aam Party", "x", "आम आदमी पार्टी", "IND"]) {
    const t = tokenFor(k);
    assert.match(t.fill, /^#[0-9a-f]{6}$/, `${k} has no fill`);
    assert.match(t.on, /^#[0-9a-f]{6}$/, `${k} has no ink`);
    assert.match(t.border, /^#[0-9a-f]{6}$/, `${k} has no border`);
    assert.equal(t.key, k);
  }
  // Null, undefined and blank are one thing — a candidacy whose source printed no party — and it is a real
  // row rather than an error, so it resolves rather than throwing.
  for (const k of [null, undefined, "", "   "]) {
    assert.equal(tokenFor(k).key, "unattached", `${JSON.stringify(k)} did not fold to unattached`);
    assert.equal(partyKey(k), "unattached");
  }
});

test("an uncurated party's colour is deterministic, and its own", () => {
  // Deterministic: the same id gives the same colour, in this process and in any other, because the hash is
  // written out rather than borrowed from the runtime.
  assert.equal(fillFor("Bharatiya Nyay-Adhikar Raksha Party"), fillFor("Bharatiya Nyay-Adhikar Raksha Party"));
  // Known values, so a change to the hash or the generator fails here rather than silently repainting 2,900
  // parties. If this assertion needs updating, that is the review.
  assert.equal(fillFor("JD(S)"), "#506c88");
  assert.equal(fillFor("KRS"), "#9ec3de");
  // Its own: two uncurated parties are two colours, not one shared grey. That was the old behaviour and it
  // made a party with 19 seats look like a party with one.
  const many = ["JD(S)", "KRS", "SKM", "MNF", "NDPP", "IUML", "AIMIM", "RLD", "JMM(x)", "PDP"].map(fillFor);
  assert.equal(new Set(many).size, many.length, "two uncurated parties share a colour");
});

test("the two registers are visibly different kinds of mark", () => {
  // A curated colour says "this is the party's colour". A derived one says "this party's colour is not
  // recorded here". If the two registers overlapped in chroma, the second would be pretending to be the
  // first, and a reader would have no way to tell a known identity from a generated one.
  const curatedChroma = CURATED_KEYS.map((k) => tokenFor(k))
    .filter((t) => chromaOf(t.fill) > 0.02) // the two neutrals have no hue by design
    .map((t) => chromaOf(t.fill));
  const derivedChroma = ["JD(S)", "KRS", "SKM", "zzz", "qqq"].map((k) => chromaOf(fillFor(k)));
  assert.ok(
    Math.min(...curatedChroma) > Math.max(...derivedChroma) + 0.02,
    `the registers overlap: curated floor ${Math.min(...curatedChroma).toFixed(3)}, derived ceiling ${Math.max(...derivedChroma).toFixed(3)}`,
  );
  for (const t of CURATED_KEYS.map((k) => tokenFor(k))) {
    assert.equal(t.basis, "curated");
    assert.equal(t.confidence, "editorial", `${t.key} claims more than an editorial association`);
  }
  for (const k of ["JD(S)", "zzz"]) {
    assert.equal(tokenFor(k).basis, "derived");
    assert.equal(tokenFor(k).confidence, "deterministic");
  }
});

/* ────────────────────────────── the floors, which are not negotiable ────────────────────────────── */

test("every fill clears the mark floor on every surface it is drawn on", () => {
  const sample = [...CURATED_KEYS, ...Array.from({ length: 600 }, (_, i) => `party-${i}`)];
  for (const key of sample) {
    const fill = fillFor(key);
    for (const [name, surface] of Object.entries(SURFACES)) {
      const c = contrastOf(fill, surface);
      assert.ok(c >= MARK_FLOOR, `${key} (${fill}) is ${c.toFixed(2)}:1 on ${name} — the floor for a mark is ${MARK_FLOOR}`);
    }
  }
});

test("text on a fill clears the small-text floor, for a curated colour and a generated one alike", () => {
  const sample = [...CURATED_KEYS, ...Array.from({ length: 600 }, (_, i) => `party-${i}`)];
  for (const key of sample) {
    const t = tokenFor(key);
    const c = contrastOf(t.fill, t.on);
    assert.ok(c >= TEXT_FLOOR, `${key}: ${t.on} on ${t.fill} is ${c.toFixed(2)}:1 — the floor is ${TEXT_FLOOR}`);
  }
});

test("the absence ink is deliberately below the mark floor, because absence is not a mark", () => {
  // An unshaded polygon means "no election of this kind is loaded here". If it cleared the floor a real mark
  // has to clear, it would read as a result.
  for (const surface of Object.values(SURFACES)) {
    assert.ok(contrastOf(NOT_HELD, surface) < MARK_FLOOR, "the not-held ink reads as a mark");
  }
  assert.ok(contrastOf(NOT_HELD, SURFACES.bg) > 1.05, "the not-held ink is invisible against the canvas");
});

/* ────────────────────────────── separation: measured, and honest about its limit ─────────────── */

test("no two curated colours are near-identical to a normal eye", () => {
  const toks = CURATED_KEYS.map((k) => tokenFor(k));
  assert.equal(new Set(toks.map((t) => t.fill)).size, toks.length, "two curated parties resolve to one hex");

  // The two neutrals are excluded from EACH OTHER and only from each other: "independent" and "no party
  // recorded" are both the absence of a party, they differ on lightness alone because that is all a neutral
  // has, and holding them to the floor two identities must clear would cost a hue elsewhere.
  const neutral = new Set(toks.filter((t) => chromaOf(t.fill) < 0.02).map((t) => t.key));
  let worst = { d: Infinity, pair: "" };
  for (let i = 0; i < toks.length; i += 1) {
    for (let j = i + 1; j < toks.length; j += 1) {
      const a = toks[i] as (typeof toks)[number];
      const b = toks[j] as (typeof toks)[number];
      if (neutral.has(a.key) && neutral.has(b.key)) continue;
      const d = deltaE(a.fill, b.fill, "normal");
      if (d < worst.d) worst = { d, pair: `${a.key}/${b.key}` };
    }
  }
  assert.ok(worst.d >= 5, `${worst.pair} are ${worst.d.toFixed(1)} apart in normal vision; the floor is 5`);
});

test("dichromatic separation is measured, and its limit is stated rather than asserted away", () => {
  // THIS TEST DOES NOT ENFORCE A FLOOR, and that is the honest position. Twenty-one colours chosen to be the
  // hues a reader associates with these parties cannot be pairwise separable under protanopia, deuteranopia
  // and tritanopia — the brief says so itself ("that is impossible and unnecessary"), and earlier work in this
  // repo measured four derived hues at ΔE 14.8 and eight failing at 1.9. Trading BJP's saffron for a
  // separable beige would buy a number and lose the identity the system exists to carry.
  //
  // So what is asserted is that the measurement still runs and still finds what it found, and the mitigations
  // are what carry the reader: every mark ships its party's abbreviation, the legend names every party, and a
  // selected party is outlined rather than merely recoloured.
  const toks = CURATED_KEYS.map((k) => tokenFor(k));
  let worst = { d: Infinity, mode: "", pair: "" };
  for (let i = 0; i < toks.length; i += 1) {
    for (let j = i + 1; j < toks.length; j += 1) {
      for (const mode of VISIONS) {
        const d = deltaE((toks[i] as { fill: string }).fill, (toks[j] as { fill: string }).fill, mode);
        if (d < worst.d) {
          worst = { d, mode, pair: `${(toks[i] as { key: string }).key}/${(toks[j] as { key: string }).key}` };
        }
      }
    }
  }
  // A record of where the palette is weakest, so a change that makes it worse is visible in a diff.
  assert.ok(worst.d > 0.5, `${worst.pair} are indistinguishable under ${worst.mode} (${worst.d.toFixed(2)})`);
  assert.ok(worst.d < 5, "the palette now separates under dichromacy — update this test's premise, it is good news");
});

/* ────────────────────────────── the config is a config ────────────────────────────── */

test("the curated table is data, not code, and every entry declares what it is", () => {
  // "DO NOT create a hardcoded array like partyColors = { BJP: ... } inside a React component."
  for (const [key, entry] of Object.entries(CONFIG.parties)) {
    assert.ok(entry.name.trim().length > 0, `${key} has no name`);
    assert.ok(entry.note.trim().length > 0, `${key} does not say where its colour comes from`);
    assert.ok(entry.h >= 0 && entry.h < 360, `${key} hue ${entry.h} is not an angle`);
    if (entry.c > 0) {
      assert.ok(entry.c >= BAND.cMin && entry.c <= BAND.cMax, `${key} chroma ${entry.c} is outside the band`);
    }
    assert.ok(entry.l >= BAND.lMin && entry.l <= BAND.lMax, `${key} lightness ${entry.l} is outside the band`);
  }
  // The derived register is declared too, so its lightnesses are reviewable rather than buried in a modulo.
  assert.ok(DERIVED.lightnesses.length >= 2, "the derived register has one lightness — hues alone will collide");
  assert.ok(DERIVED.chroma > 0 && DERIVED.chroma < BAND.cMin, "the derived chroma is not below the curated band");
});

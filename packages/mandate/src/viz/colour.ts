// Colour maths, shared by the things that need it at runtime and by the tests that check them.
//
// WHY THIS EXISTS AS PRODUCTION CODE. The party visual identity system generates a colour for each of the
// 2,900 parties nobody has curated, and it has to generate them somewhere the result is guaranteed legible:
// a hue picked in sRGB can land anywhere from invisible to fluorescent, while a hue picked in OKLCH at a
// fixed lightness and chroma is perceptually bounded by construction. That is the whole reason this module is
// here rather than in a test — the generator needs OKLCH → sRGB, and the `on`-colour choice needs contrast.
//
// The dichromat simulation is exported for the tests, which is the honest place for it: nothing at runtime
// decides anything from it, because a colour that changed depending on what it was next to would not be an
// identity.

/** sRGB channel → linear light. */
function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Linear light → sRGB channel. */
function fromLinear(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** `#rrggbb` → linear-light RGB. */
export function linearOf(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => toLinear(parseInt(h.slice(i, i + 2), 16) / 255)) as [number, number, number];
}

/** Linear-light RGB → `#rrggbb`, clamped into gamut. */
export function hexOf(rgb: readonly [number, number, number]): string {
  return `#${rgb.map((c) => Math.round(clamp01(fromLinear(clamp01(c))) * 255).toString(16).padStart(2, "0")).join("")}`;
}

/** Linear-light RGB → OKLab. */
export function oklabOf(rgb: readonly [number, number, number]): [number, number, number] {
  const [r, g, b] = rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab → linear-light RGB. May be out of gamut; `hexOf` clamps. */
export function rgbOfOklab(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/**
 * OKLCH → `#rrggbb`, reduced into gamut by dropping CHROMA rather than by clipping channels.
 *
 * Clipping a channel shifts the hue, which for a system whose whole promise is "this party is this colour"
 * would mean two parties a few degrees apart resolving to the same clipped red. Reducing chroma keeps the hue
 * and the lightness — the two things the reader is actually using — and gives up the saturation, which at
 * these values is already deliberately restrained.
 */
export function oklch(L: number, C: number, hDeg: number): string {
  const rad = (hDeg * Math.PI) / 180;
  for (let c = C; c > 0.0005; c -= 0.002) {
    const rgb = rgbOfOklab(L, c * Math.cos(rad), c * Math.sin(rad));
    if (rgb.every((v) => v >= -0.0005 && v <= 1.0005)) return hexOf(rgb);
  }
  return hexOf(rgbOfOklab(L, 0, 0));
}

/** WCAG relative luminance of a hex colour. */
export function luminanceOf(hex: string): number {
  const [r, g, b] = linearOf(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours. 1 is identical, 21 is black on white. */
export function contrastOf(a: string, b: string): number {
  const [x, y] = [luminanceOf(a), luminanceOf(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/* ────────────────────────────── colour vision, for the tests ────────────────────────────── */

const RGB_LMS = [
  [0.31399, 0.63951, 0.04649],
  [0.15537, 0.75789, 0.0867],
  [0.01775, 0.10944, 0.87252],
] as const;

const LMS_RGB = [
  [5.47221, -4.64196, 0.16963],
  [-1.12524, 2.29317, -0.16789],
  [0.0298, -0.19318, 1.16364],
] as const;

/** The standard protan / deutan / tritan projections. */
const SIM = {
  protan: [
    [0, 1.05118294, -0.05116099],
    [0, 1, 0],
    [0, 0, 1],
  ],
  deutan: [
    [1, 0, 0],
    [0.9513092, 0, 0.04866992],
    [0, 0, 1],
  ],
  tritan: [
    [1, 0, 0],
    [0, 1, 0],
    [-0.86744736, 1.86727089, 0],
  ],
} as const;

export type Vision = "normal" | keyof typeof SIM;
export const VISIONS: readonly Vision[] = ["normal", "protan", "deutan", "tritan"];

function apply(m: readonly (readonly number[])[], v: readonly number[]): [number, number, number] {
  return m.map(
    (row) =>
      (row[0] as number) * (v[0] as number) + (row[1] as number) * (v[1] as number) + (row[2] as number) * (v[2] as number),
  ) as [number, number, number];
}

/** A hex colour as one kind of eye receives it, in OKLab. */
export function asSeen(hex: string, mode: Vision): [number, number, number] {
  const rgb = linearOf(hex);
  if (mode === "normal") return oklabOf(rgb);
  const out = apply(LMS_RGB, apply(SIM[mode], apply(RGB_LMS, rgb)));
  return oklabOf(out.map(clamp01) as [number, number, number]);
}

/** OKLab distance ×100 — the scale the dataviz separation floors in this repo are stated on. */
export function deltaE(a: string, b: string, mode: Vision = "normal"): number {
  const [l1, a1, b1] = asSeen(a, mode);
  const [l2, a2, b2] = asSeen(b, mode);
  return 100 * Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** The worst any pair of these colours looks to any of the four kinds of eye. */
export function worstSeparation(colours: readonly string[]): { deltaE: number; mode: Vision; pair: [string, string] } {
  let worst = { deltaE: Infinity, mode: "normal" as Vision, pair: ["", ""] as [string, string] };
  for (let i = 0; i < colours.length; i += 1) {
    for (let j = i + 1; j < colours.length; j += 1) {
      for (const mode of VISIONS) {
        const d = deltaE(colours[i] as string, colours[j] as string, mode);
        if (d < worst.deltaE) worst = { deltaE: d, mode, pair: [colours[i] as string, colours[j] as string] };
      }
    }
  }
  return worst;
}

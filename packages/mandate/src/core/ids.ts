// Deterministic identifiers. No Date.now(), no randomness: the same input yields the same id on
// every machine, forever, which is what makes an ingest re-run idempotent and an audit reproducible.

import { createHash } from "node:crypto";

/** URL-safe slug. Latin input is folded to ascii ('Mamatá Banerjee' → 'mamata-banerjee'); input with
 *  no ascii letters keeps its script and only loses whitespace and punctuation, because destroying
 *  'মমতা ব্যানার্জী' into '' is the bug this function exists to avoid. */
export function slug(s: string): string {
  const ascii = s
    .normalize("NFKD")
    .replace(/[^\p{ASCII}]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (/[a-z]/.test(ascii)) return ascii;
  // Indic path: NFC only. NFKD would decompose ড়/ঢ়/য় and NFC cannot recompose them (Unicode
  // composition exclusions), so a round trip silently corrupts Bengali names.
  return s
    .normalize("NFC")
    .replace(/[\p{P}\p{S}\s]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/** 'wb-assembly-2026' + 'krishnanagar-uttar' → 'wb-assembly-2026:krishnanagar-uttar' (§19). */
export function contestId(electionId: string, placeSlug: string): string {
  return `${slug(electionId)}:${slug(placeSlug)}`;
}

/** Mirrors the UNIQUE (contest_id, person_id) constraint the ER hard negative depends on. */
export function candidacyId(contestId: string, personId: string): string {
  return `${contestId}:${personId}`;
}

/** Content-addressed id for sources and ingest runs: sha256 of the parts, 16 hex chars (64 bits —
 *  a collision needs ~5 billion ids at p=1e-9, we will have millions).
 *  Parts are length-prefixed so ['ab','c'] and ['a','bc'] cannot collide. */
export function contentId(parts: readonly string[]): string {
  const framed = parts.map((p) => `${p.length}:${p}`).join("");
  return createHash("sha256").update(framed, "utf8").digest("hex").slice(0, 16);
}

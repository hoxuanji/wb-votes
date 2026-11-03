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

/**
 * A claim's identity: WHAT is claimed, and never what it is claimed to be (decision D29, 2026-11-01).
 *
 * The key is the claim's subject, predicate, the date it holds as of, and its unit; the value is not in it. A corrected
 * value is therefore the same claim, restated, and not a second claim beside the first that a citation of the old value
 * could survive on. Four spellings of this had grown up (wb-static hashed those four parts, ECI joined subject, predicate
 * and the VALUE, the delimitation chain joined subject and predicate, and ECI also kept a free-text note in `unit`);
 * migration 019 re-keys every stored claim to this one, in SQL, as `subject || char(31) || predicate || char(31) ||
 * COALESCE(as_of, '') || char(31) || COALESCE(unit, '')`, and a test holds the two spellings equal.
 *
 * The separator is U+001F, the ASCII unit separator, which does not occur in a subject, a predicate, a date or a unit,
 * so no two claims share a key by one's text ending where another's begins. The key is readable on purpose: it is the
 * claim's address in an audit, and SQLite cannot compute a hash in a migration.
 */
export function claimKey(subject: string, predicate: string, asOf: string | null, unit: string | null): string {
  return [subject, predicate, asOf ?? "", unit ?? ""].join("\u001f");
}

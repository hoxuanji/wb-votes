// A claim and the citation that supports it, for an importer that records a fact a document states.
//
// A claim's identity is WHAT is claimed (core/ids.ts `claimKey`: subject, predicate, as-of date, unit) and never the
// value (decision D29, 2026-11-01). ECI used to put the value in the key, so a corrected value became a second claim;
// the delimitation chain used subject and predicate alone; wb-static hashed all four parts. This is the one writer
// the two importers that share a rule use. wb-static keeps its own batch and run-citation garbage collection, which
// do not fit one call (the brief says so), and uses `claimKey` for the key.
//
// Not exported through db/index.ts, which the Next bundle imports.

import type { DatabaseSync } from "node:sqlite";
import { get } from "../db/index.ts";
import { claimKey } from "../core/ids.ts";

export type ClaimIn = {
  subject: string;
  predicate: string;
  /** JSON text. A claim's object can be any shape, so it is stored as the writer serialised it. */
  value: string;
  /** A real unit ("INR", "votes"), never a note: the unit is part of the claim's identity. */
  unit?: string | null;
  asOf?: string | null;
  confidence?: "verified" | "provisional" | "disputed" | "retracted";
};

export type CitedBy = {
  sourceId: string;
  parserVersion: string;
  extractedAt: string;
  /** 0 is "the whole document", which is what a spreadsheet or a statute has instead of pages. */
  pageNo?: number;
};

/**
 * Write the claim, and cite `by` for it. Returns the claim's id.
 *
 *  - The same claim restated with the same value is the same row, and another source citing it adds a citation.
 *  - The same claim with a DIFFERENT value is a correction: the value is replaced, and the citations that supported
 *    the old value are removed first. A citation says "this document contains this value", and a document that
 *    contained the old one does not contain the new one; wb-static's cycle 2 found exactly that in a registry that
 *    kept the citation. The citation written now is the only one left, which is the source that says the new value.
 */
export function putClaim(db: DatabaseSync, c: ClaimIn, by: CitedBy): number {
  const unit = c.unit ?? null;
  const asOf = c.asOf ?? null;
  const key = claimKey(c.subject, c.predicate, asOf, unit);
  const prior = get<{ id: number; object_value: string }>(db, "SELECT id, object_value FROM claim WHERE content_key = ?", key);
  if (prior !== undefined && prior.object_value !== c.value) {
    db.prepare("DELETE FROM citation WHERE claim_id = ?").run(prior.id);
  }
  const written = get<{ id: number }>(
    db,
    `INSERT INTO claim (subject_ref, predicate, object_value, unit, as_of, confidence, content_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (content_key) DO UPDATE SET object_value = excluded.object_value, confidence = excluded.confidence
       RETURNING id`,
    c.subject,
    c.predicate,
    c.value,
    unit,
    asOf,
    c.confidence ?? "verified",
    key,
  );
  if (written === undefined) throw new Error(`putClaim: no id came back for ${c.subject} ${c.predicate}`);
  db.prepare(
    `INSERT INTO citation (claim_id, source_id, page_no, parser_version, extracted_at)
       VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
  ).run(written.id, by.sourceId, by.pageNo ?? 0, by.parserVersion, by.extractedAt);
  return written.id;
}

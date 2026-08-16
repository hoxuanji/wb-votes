// §12 P4 — time is an axis on everything. As-of lookup over half-open [validFrom, validTo) windows.
// Dates are ISO strings end to end: lexicographic compare IS chronological compare for
// "YYYY-MM-DD", so no Date objects, no timezones, no parsing, no TZ-dependent off-by-one-day.
// ponytail: string compare — only breaks if a non-zero-padded or non-ISO date reaches here, which
// the DDL's TEXT ISO-8601 convention and the ingest contracts prevent.
// ponytail: contains + asOf only. `overlaps` lived here too and was deleted: the overlap invariant
// is enforced by the party_version_overlap view in 001_registry.sql, which is the copy wired to
// data, and two implementations of one invariant can silently disagree.

/** ISO calendar date, "YYYY-MM-DD". */
export type ISODate = string;
/** ISO instant, "YYYY-MM-DDTHH:MM:SSZ". */
export type ISOTimestamp = string;

/** Anything with a validity window: party_version, alliance_version, place_version-by-epoch. */
export type Versioned = { validFrom: ISODate; validTo: ISODate | null };

/** validFrom inclusive, validTo EXCLUSIVE; null validTo = still open. A zero-length window
 *  (validFrom === validTo) therefore contains no date at all, which is the right answer: a version
 *  superseded on the day it began was never in force. */
export function contains(window: Versioned, date: ISODate): boolean {
  return window.validFrom <= date && (window.validTo === null || date < window.validTo);
}

/** The version live on `date`. First match wins — overlapping versions are a data error, rejected
 *  by §19's EXCLUDE constraint in Postgres and detected by party_version_overlap here, so there is
 *  nothing to disambiguate. Undefined when no version covers the date; that is a real answer
 *  ("the party did not exist yet"), not a failure. */
export function asOf<T extends Versioned>(versions: readonly T[], date: ISODate): T | undefined {
  return versions.find((v) => contains(v, date));
}

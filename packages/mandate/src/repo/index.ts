// §29 Phase A — the typed read seam. Every surface (API routes, pages) reads the registry through
// this layer and never touches SQL. Read-only: there is no INSERT/UPDATE/DELETE anywhere here.
//
// P2 is structural: nothing leaves a Brief without its `sources`, and `sources` is non-empty for
// any Brief that returned non-null (repo tests assert it against the live registry).

import type { HashKind, ISODate, ISOTimestamp, RetrievalKind, SourceKind } from "../core/index.ts";
import type { DatabaseSync } from "node:sqlite";
import { all } from "../db/index.ts";

export { counted, getPersonBrief, searchPersons } from "./person.ts";
export type { PersonBrief, PersonRow } from "./person.ts";
export { getPlaceBrief } from "./place.ts";
export type { PlaceBrief } from "./place.ts";

/**
 * A source as a surface needs it: enough to render a citation line and a link, plus the two
 * honesty columns (hashKind/retrievalKind) that say whether the bytes were ever fetched.
 * ponytail: no `rect` and pageNo is only set where a citation supplied one — the PDF viewer that
 * needs page anchors does not exist yet; add the citation-level shape when it does.
 */
export type SourceRef = {
  id: string;
  kind: SourceKind;
  publisher: string | null;
  title: string | null;
  url: string | null;
  retrievedAt: ISOTimestamp;
  publishedOn: ISODate | null;
  pageNo?: number;
  hashKind: HashKind;
  retrievalKind: RetrievalKind;
};

/** A value that travels with its provenance. core/citation's `Cited<T>` carries raw `Citation`
 *  rows, which a page cannot render without a second query for the source — this carries the
 *  resolved sources instead. */
export type Provenanced<T> = { value: T; sources: SourceRef[] };

/** The one error the API layer turns into a 503. Missing .data/, an empty file, or a database that
 *  was never migrated all arrive here — never a raw sqlite error. */
export class RegistryUnavailableError extends Error {
  constructor(cause?: unknown) {
    super(
      "Registry database is unavailable or unmigrated. Run: npm run registry:migrate && " +
        "npm run registry:ingest && npm run registry:resolve",
      { cause },
    );
    this.name = "RegistryUnavailableError";
  }
}

/** Wrap every read. A missing schema is the expected failure on a fresh clone (.data is
 *  gitignored); so are a locked database (a request during ingest, or two workers) and an
 *  unwritable cwd (a read-only container) — none of them is a bug in this process, and all of them
 *  are the same answer to a caller: the registry cannot be read right now. Anything else rethrows. */
const UNAVAILABLE =
  /no such table|no such column|not a database|unable to open|database is locked|table is locked|EACCES|EPERM|EROFS|ENOENT/i;

export function read<T>(fn: () => T): T {
  try {
    return fn();
  } catch (cause) {
    const m = cause instanceof Error ? cause.message : String(cause);
    if (UNAVAILABLE.test(m)) throw new RegistryUnavailableError(cause);
    throw cause;
  }
}

type SourceRow = {
  id: string;
  kind: SourceKind;
  publisher: string | null;
  title: string | null;
  url: string | null;
  retrieved_at: string;
  published_on: string | null;
  hash_kind: HashKind;
  retrieval_kind: RetrievalKind;
};

/** `?,?,?` for an IN list. SQLite has no array binding, so the list is built, never interpolated. */
export function marks(n: number): string {
  return new Array(n).fill("?").join(",");
}

/**
 * Resolve source ids — the ones referenced directly by fact rows (result/turnout/affidavit/alias)
 * plus every source cited by a claim about one of `subjectRefs`. One query, deterministic order.
 */
export function loadSources(
  db: DatabaseSync,
  directIds: readonly string[],
  subjectRefs: readonly string[],
): SourceRef[] {
  const ids = [...new Set(directIds)];
  if (ids.length === 0 && subjectRefs.length === 0) return [];
  const rows = all<SourceRow>(
    db,
    `SELECT id, kind, publisher, title, url, retrieved_at, published_on, hash_kind, retrieval_kind
       FROM source
      WHERE id IN (${marks(ids.length)})
         OR id IN (SELECT ci.source_id FROM citation ci
                     JOIN claim cl ON cl.id = ci.claim_id
                    WHERE cl.subject_ref IN (${marks(subjectRefs.length)}))
      ORDER BY id`,
    ...ids,
    ...subjectRefs,
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    publisher: r.publisher,
    title: r.title,
    url: r.url,
    retrievedAt: r.retrieved_at,
    publishedOn: r.published_on,
    hashKind: r.hash_kind,
    retrievalKind: r.retrieval_kind,
  }));
}

/** Election year. `election` has no year column and counting_on is NULL for every historical row,
 *  so the id ('wb-assembly-2011') is the only carrier. */
export function yearOf(electionId: string): number {
  const m = /(\d{4})/.exec(electionId);
  return m?.[1] === undefined ? 0 : Number(m[1]);
}

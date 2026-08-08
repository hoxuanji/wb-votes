// §12 ring 3 — provenance. P2: no number without provenance, so `Cited<T>` cannot be constructed
// without at least one citation — the type is a non-empty tuple, so an empty array does not
// typecheck, and `cited()` throws on one built at runtime.
// Row shapes here follow the same DDL-wins rule as core/entities (see that header); the tables live
// in ops/migrations/001_registry.sql (source) and 003_provenance.sql (the rest).

import type { ISODate, ISOTimestamp } from "../temporal/index.ts";

/** Citation anchor on a source page, in PDF user-space units. */
export type Rect = { x: number; y: number; w: number; h: number };

export const SOURCE_KINDS = [
  "eci_form20",
  "eci_declaration",
  "eci_notification",
  "affidavit",
  "gazette",
  "court_order",
  "prs_record",
  "party_return",
  "census",
  "secc",
  "press",
  "factcheck",
  /** the committed data/seed/*.json files — real sources with a real hash, just not scraped yet. */
  "static_module",
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const HASH_KINDS = ["document_bytes", "url_only"] as const;
/** 'url_only' means docHash hashes the URL, not the document — the bytes were never fetched. */
export type HashKind = (typeof HASH_KINDS)[number];

export const RETRIEVAL_KINDS = ["fetched", "asserted_by_upstream"] as const;
export type RetrievalKind = (typeof RETRIEVAL_KINDS)[number];

export type Source = {
  id: string;
  kind: SourceKind;
  publisher: string | null;
  title: string | null;
  url: string | null;
  archivedUrl: string | null;
  retrievedAt: ISOTimestamp;
  publishedOn: ISODate | null;
  /** sha256 — of the retrieved bytes when hashKind is 'document_bytes', which is how a re-fetch
   *  proves the document did not change. Read hashKind before trusting it. */
  docHash: string;
  hashKind: HashKind;
  retrievalKind: RetrievalKind;
  pageCount: number | null;
  /** §12 governance: the bulk-download surface filters on this. Not decorative. */
  licence: string | null;
};

export const CONFIDENCES = ["verified", "provisional", "disputed", "retracted"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export type Claim = {
  id: number;
  /** 'person:mamata-banerjee', 'contest:wb-assembly-2026:c0001'. */
  subjectRef: string;
  predicate: string;
  /** JSON text, NOT NULL. Opaque: a claim's object can be any shape, so it is not parsed here. */
  objectValue: string;
  unit: string | null;
  asOf: ISODate | null;
  confidence: Confidence;
  /** UNIQUE content hash of (subjectRef, predicate, asOf): the claim's real identity, so a citation
   *  cannot outlive the fact it cites. Nullable — rings 1-3 predate the column (005). */
  contentKey: string | null;
};

export type Citation = {
  claimId: number;
  sourceId: string;
  /** NOT NULL DEFAULT 0 — it is in the primary key. 0 means "the whole document". */
  pageNo: number;
  rect: Rect | null;
  parserVersion: string;
  extractedAt: ISOTimestamp;
};

/** Something the pipeline could not resolve but must not drop — e.g. a declared party label with
 *  no matching party row. Recorded, then surfaced in the audit report. */
export type Anomaly = { kind: string; ref: string; detail: string };

export const INGEST_RUN_STATUSES = ["running", "ok", "partial", "failed"] as const;
/** 'partial' is the one the ingest writes whenever it records an anomaly, i.e. always so far. */
export type IngestRunStatus = (typeof INGEST_RUN_STATUSES)[number];

export type IngestRun = {
  id: number;
  pipeline: string;
  parserVersion: string;
  startedAt: ISOTimestamp;
  finishedAt: ISOTimestamp | null;
  rowsIn: number | null;
  rowsOut: number | null;
  anomalies: Anomaly[];
  status: IngestRunStatus;
};

export type Correction = {
  id: number;
  entityRef: string;
  field: string;
  /** JSON text, like claim.objectValue — opaque, nullable. */
  oldValue: string | null;
  newValue: string | null;
  reason: string;
  sourceId: string | null;
  correctedAt: ISOTimestamp;
  /** Public, permanent URL slug — a correction nobody can read is not a correction. */
  publicSlug: string;
};

/** P2 in the type system: a value travels with its provenance or it does not travel. The tuple is
 *  the point — `{ value, citations: [] }` is a type error, not a runtime surprise. */
export type Cited<T> = { value: T; citations: [Citation, ...Citation[]] };

export function cited<T>(value: T, citations: readonly Citation[]): Cited<T> {
  const [first, ...rest] = citations;
  if (first === undefined) throw new Error("P2 violation: value has no citations");
  return { value, citations: [first, ...rest] };
}

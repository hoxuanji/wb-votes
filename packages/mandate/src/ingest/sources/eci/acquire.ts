/**
 * Acquire ECI artefacts: download, hash, store the raw bytes, and record provenance in a manifest.
 *
 * Nothing downstream ever sees an HTTP response. `acquire()` writes bytes to `.data/cache/eci/…` and
 * hands back a `RawArtefact` describing what was stored; the parser reads the stored bytes. That is the
 * boundary the brief asks for — no HTTP response reaches the registry — and it is also what makes the
 * step resumable: a run that dies after 3 of 4 downloads re-reads those 3 from disk.
 *
 * THE MANIFEST IS THE PROVENANCE LEDGER. One TSV row per artefact holding url, retrieval time, content
 * type, byte length, sha256, HTTP status, ETag, Last-Modified, publisher, report number, election id and
 * filename. `ops/geo/refetch-lokdhaba.sh` proved the value of this: because every Lokdhaba source row
 * carried a hash over the exact bytes, all 62 files could later be re-fetched and shown byte-identical,
 * which is what made the electoral-geography repair defensible. The live URL is never the only record —
 * ECI's non-GE-2024 URLs carry a mutable upload epoch and would stop resolving.
 *
 * HASH DRIFT IS NOT AN ERROR TO WORK AROUND. If a cached artefact's bytes no longer match the recorded
 * hash, that means ECI edited a published report. The run records `HASH_DRIFT`, keeps both hashes, and
 * refuses to proceed silently.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Artefact, ApiAccess, Category } from "./discover.ts";
import { httpGet, type Fetcher } from "./transport.ts";

export const ECI_CACHE_DIR = ".data/cache/eci";
export const ECI_PUBLISHER = "Election Commission of India";

/**
 * ECI's own words about its statistical reports, carried on every source row built from one.
 *
 * Quoted verbatim from the reports themselves. The Commission classes these as SECONDARY data derived
 * from Index Cards and names the statutory forms as final, so the registry must not present a value from
 * here as a Form 20 value. Recording the disclaimer in the source row is how a reader of any downstream
 * page can find that out.
 */
export const ECI_STATISTICAL_DISCLAIMER =
  "ECI: these statistical reports are prepared only for academic and research purposes from the " +
  "secondary data filled in the Index Cards. The primary data is in the statutory forms maintained by " +
  "the concerned Returning Officers and the data kept in statutory forms is final.";

/** Everything recorded about one stored artefact. Written to the manifest and to `source`. */
export type RawArtefact = {
  /** Deterministic: eci:<categoryId>:r<reportNo>:<sha256[0..12]>. Same bytes → same id, forever. */
  sourceId: string;
  categoryId: number;
  /** The registry election this artefact describes, e.g. 'ls-2024'. */
  electionId: string;
  reportNo: string;
  title: string;
  url: string;
  path: string;
  filename: string;
  publisher: string;
  retrievedAt: string;
  httpStatus: number;
  contentType: string | null;
  contentLength: number | null;
  bytes: number;
  sha256: string;
  etag: string | null;
  lastModified: string | null;
  /** True when the bytes came from the cache rather than the network. */
  cached: boolean;
};

export type AcquireStatus = "OK" | "CACHED" | "HASH_DRIFT" | "FETCH_FAILED";

export type ManifestRow = RawArtefact & { status: AcquireStatus; note: string };

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

const slug = (s: string): string =>
  s.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

/** Where an artefact's bytes live. Keyed by category and report number, never by the mutable URL. */
export function artefactPath(a: Artefact, dir = ECI_CACHE_DIR): string {
  const ext = /\.(xlsx|xls|pdf|zip)(?:$|\?)/i.exec(a.spreadsheetUrl ?? a.pdfUrl ?? "")?.[1]?.toLowerCase() ?? "bin";
  return join(dir, `${a.categoryId}-${slug(a.title)}`, `report-${slug(a.reportNo) || "x"}.${ext}`);
}

export type AcquireOptions = {
  fetcher?: Fetcher;
  dir?: string;
  /** Re-download even when the bytes are cached. */
  refresh?: boolean;
  now?: () => string;
  /** Milliseconds between requests. ECI showed no throttling; this is politeness, not necessity. */
  spacingMs?: number;
};

/**
 * Download (or re-read) each artefact, verify its hash, and return what was stored.
 *
 * Serial by design. 15 rapid requests drew no throttling from ECI, so the limit is not technical — but a
 * public utility does not need this project's parallelism, and serial requests make the manifest's order
 * mean something.
 */
export async function acquire(
  access: ApiAccess,
  category: Category,
  artefacts: readonly Artefact[],
  electionId: string,
  opts: AcquireOptions = {},
): Promise<{ raw: RawArtefact[]; manifest: ManifestRow[] }> {
  const fetcher = opts.fetcher ?? httpGet;
  const dir = opts.dir ?? ECI_CACHE_DIR;
  const now = opts.now ?? (() => new Date().toISOString());
  const spacing = opts.spacingMs ?? 250;

  const raw: RawArtefact[] = [];
  const manifest: ManifestRow[] = [];
  const failures: string[] = [];

  for (const [i, a] of artefacts.entries()) {
    const url = a.spreadsheetUrl ?? a.pdfUrl;
    if (url === null) {
      failures.push(`${a.title}: no URL`);
      continue;
    }
    const path = artefactPath(a, dir);
    const metaPath = `${path}.meta.json`;

    // ── cached path ──────────────────────────────────────────────────────────────────────────────
    if (opts.refresh !== true && existsSync(path) && existsSync(metaPath)) {
      const bytes = readFileSync(path);
      const meta = JSON.parse(readFileSync(metaPath, "utf8")) as RawArtefact;
      const got = sha256(bytes);
      if (got !== meta.sha256) {
        manifest.push({ ...meta, bytes: bytes.length, sha256: got, status: "HASH_DRIFT", note: `recorded ${meta.sha256}` });
        failures.push(`${a.title}: cached bytes hash ${got}, manifest says ${meta.sha256}`);
        continue;
      }
      const entry: RawArtefact = { ...meta, bytes: bytes.length, sha256: got, cached: true };
      raw.push(entry);
      manifest.push({ ...entry, status: "CACHED", note: "" });
      continue;
    }

    // ── network path ─────────────────────────────────────────────────────────────────────────────
    if (i > 0 && spacing > 0) await sleep(spacing);
    let res: Awaited<ReturnType<Fetcher>>;
    try {
      res = await fetcher(url, { secret: access.secret });
    } catch (cause) {
      failures.push(`${a.title}: ${(cause as Error).message}  (place bytes at ${path} to work offline)`);
      continue;
    }
    if (!res.ok) {
      failures.push(`${a.title}: ${url} returned ${res.status}`);
      continue;
    }
    const bytes = res.bytes;
    // An HTML error page is the thing most likely to arrive here and be cached forever, so size and
    // shape are checked before anything is written to disk.
    if (bytes.length < 512) {
      failures.push(`${a.title}: ${url} returned only ${bytes.length} bytes — refusing to cache`);
      continue;
    }
    const entry: RawArtefact = {
      sourceId: "",
      categoryId: a.categoryId,
      electionId,
      reportNo: a.reportNo,
      title: a.title,
      url,
      path,
      filename: path.split("/").pop() ?? "",
      publisher: ECI_PUBLISHER,
      retrievedAt: now(),
      httpStatus: res.status,
      contentType: res.contentType,
      contentLength: res.contentLength,
      bytes: bytes.length,
      sha256: sha256(bytes),
      etag: res.etag,
      lastModified: res.lastModified,
      cached: false,
    };
    entry.sourceId = sourceIdOf(entry);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    writeFileSync(metaPath, `${JSON.stringify(entry, null, 2)}\n`);
    raw.push(entry);
    manifest.push({ ...entry, status: "OK", note: "" });
  }

  writeManifest(manifest, dir);
  if (failures.length > 0) {
    // A partial acquisition must never reach the parser: it would validate as "this election has fewer
    // constituencies" rather than "we failed to download a file".
    throw new Error(`ECI acquisition failed for ${failures.length} artefact(s):\n  ${failures.join("\n  ")}`);
  }
  return { raw, manifest };
}

/** Content-addressed and stable: the same bytes always produce the same source id. */
export function sourceIdOf(a: Pick<RawArtefact, "categoryId" | "reportNo" | "sha256">): string {
  return `eci:${a.categoryId}:r${a.reportNo || "x"}:${a.sha256.slice(0, 12)}`;
}

const numOrNull = (v: string | null): number | null => {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Present so the manifest reader can turn a blank TSV cell back into null. */
export const manifestNumber = numOrNull;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export const MANIFEST_COLUMNS = [
  "status", "source_id", "election_id", "category_id", "report_no", "title", "url", "filename",
  "publisher", "retrieved_at", "http_status", "content_type", "content_length", "bytes", "sha256",
  "etag", "last_modified", "note",
] as const;

export function manifestPath(dir = ECI_CACHE_DIR): string {
  return join(dir, "manifest.tsv");
}

/** Rewrite the manifest, merging with any rows a previous run wrote for other elections. */
export function writeManifest(rows: readonly ManifestRow[], dir = ECI_CACHE_DIR): void {
  const path = manifestPath(dir);
  const keep: string[] = [];
  const touched = new Set(rows.map((r) => `${r.categoryId}\t${r.reportNo}`));
  if (existsSync(path)) {
    const lines = readFileSync(path, "utf8").split("\n").filter((l) => l.trim() !== "");
    for (const line of lines.slice(1)) {
      const f = line.split("\t");
      // Columns 3 and 4 are category_id and report_no; a row this run replaced is dropped.
      if (!touched.has(`${f[3] ?? ""}\t${f[4] ?? ""}`)) keep.push(line);
    }
  }
  const body = rows.map((r) =>
    [
      r.status, r.sourceId, r.electionId, r.categoryId, r.reportNo, r.title, r.url, r.filename,
      r.publisher, r.retrievedAt, r.httpStatus, r.contentType ?? "", r.contentLength ?? "", r.bytes,
      r.sha256, r.etag ?? "", r.lastModified ?? "", r.note,
    ].map(tsv).join("\t"),
  );
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${[MANIFEST_COLUMNS.join("\t"), ...keep, ...body].join("\n")}\n`);
}

/** A tab or newline inside a title would shift every later column, so both are neutralised. */
const tsv = (v: unknown): string => String(v).replace(/[\t\r\n]+/g, " ");

/** The stored bytes of an acquired artefact, re-hashed. Throws if they no longer match the manifest. */
export function readRaw(a: RawArtefact): Uint8Array {
  const bytes = readFileSync(a.path);
  const got = sha256(bytes);
  if (got !== a.sha256) {
    throw new Error(`${a.path} hashes ${got}, manifest says ${a.sha256} — the raw store was modified`);
  }
  return bytes;
}

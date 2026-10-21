/**
 * Offline test for `acquire()`: a cache miss downloads and writes a sidecar, a second call is served from
 * the cache. A fake `Fetcher` stands in for ECI and the cache lives in a temp directory, never `.data`.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Fetcher } from "../../raw/index.ts";
import type { ApiAccess, Artefact, Category } from "./discover.ts";
import { acquire, artefactPath, manifestPath, type RawArtefact } from "./acquire.ts";

const ACCESS: ApiAccess = { base: "https://eci.test/public", secret: "s3cret", bundle: "main.test.js" };
const ARTEFACT: Artefact = {
  categoryId: 7,
  rowId: 1,
  reportNo: "33",
  title: "Detailed Results",
  spreadsheetUrl: "https://eci.test/files/r33.xlsx",
  pdfUrl: null,
};
const CATEGORY: Category = { categoryId: 7, name: "General Election 2024", headline: "", artefacts: [ARTEFACT] };
const FIRST = "2026-01-01T00:00:00.000Z";
const LATER = "2026-02-02T00:00:00.000Z";

test("acquire stores a miss with a sha256 sidecar and serves the next call from the cache", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "mandate-eci-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, "cache");
  // Over the 512-byte floor below which acquire refuses to cache.
  const body = Buffer.concat(Array.from({ length: 30 }, (_, i) => createHash("sha256").update(`r33${i}`).digest()));
  const sha256 = createHash("sha256").update(body).digest("hex");
  const calls: { url: string; headers: Record<string, string> | undefined }[] = [];
  const fetcher: Fetcher = async (url, headers) => {
    calls.push({ url, headers });
    return {
      status: 200,
      ok: true,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      etag: null,
      lastModified: null,
      contentLength: body.length,
      bytes: body,
      text: () => body.toString("utf8"),
    };
  };
  const run = (now: string) => acquire(ACCESS, CATEGORY, [ARTEFACT], "ls-2024", { fetcher, dir, now: () => now, spacingMs: 0 });

  const first = await run(FIRST);

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { url: ARTEFACT.spreadsheetUrl, headers: { secret: "s3cret" } });
  assert.equal(first.manifest[0]?.status, "OK");
  assert.equal(first.raw[0]?.cached, false);
  assert.equal(first.raw[0]?.sha256, sha256);
  assert.equal(first.raw[0]?.sourceId, `eci:7:r33:${sha256.slice(0, 12)}`);
  const path = artefactPath(ARTEFACT, dir);
  assert.deepEqual(readFileSync(path), body);
  const meta = JSON.parse(readFileSync(`${path}.meta.json`, "utf8")) as RawArtefact;
  assert.equal(meta.sha256, sha256);
  assert.equal(meta.bytes, body.length);
  assert.equal(meta.retrievedAt, FIRST);
  assert.ok(existsSync(manifestPath(dir)));

  const second = await run(LATER);

  assert.equal(calls.length, 1, "the cache answered; the fetcher was not asked again");
  assert.equal(second.manifest[0]?.status, "CACHED");
  assert.equal(second.raw[0]?.cached, true);
  assert.equal(second.raw[0]?.sha256, sha256);
  assert.equal(second.raw[0]?.retrievedAt, FIRST);
});

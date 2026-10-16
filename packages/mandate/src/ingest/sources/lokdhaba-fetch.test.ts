/**
 * Offline tests for `fetchState`: the cache, the gzip sanity check, and the sidecar.
 *
 * A fake `Fetcher` stands in for the network and every cache lives in a temp directory, never `.data`.
 * Before `fetchState` took an injectable fetcher none of this could run without Lokdhaba's server.
 */

import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import type { Fetcher } from "../raw/index.ts";
import { fetchState } from "./lokdhaba.ts";

const STATE_URL = "https://lokdhaba.ashoka.edu.in/downloads/Bihar/Bihar_AE.csv.gz";
const FIRST = "2026-01-01T00:00:00.000Z";
const LATER = "2026-02-02T00:00:00.000Z";

/** Gzip of incompressible bytes, so the result clears the 1,024-byte floor. `seed` makes two distinct files. */
function gz(seed: string): Uint8Array {
  const noise = Buffer.concat(Array.from({ length: 100 }, (_, i) => createHash("sha256").update(`${seed}${i}`).digest()));
  return gzipSync(noise);
}

const sha256 = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

/** A fetcher that answers every request with one body and records the URLs it was asked for. */
function fake(body: Uint8Array, status = 200): { fetcher: Fetcher; calls: string[] } {
  const calls: string[] = [];
  const fetcher: Fetcher = async (url) => {
    calls.push(url);
    return {
      status,
      ok: status >= 200 && status < 300,
      contentType: null,
      etag: null,
      lastModified: null,
      contentLength: body.length,
      bytes: body,
      text: () => Buffer.from(body).toString("utf8"),
    };
  };
  return { fetcher, calls };
}

/** A cache directory that does not exist yet, so "nothing was written" is checkable as "it still doesn't". */
function scratch(t: TestContext): string {
  const root = mkdtempSync(join(tmpdir(), "mandate-lokdhaba-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return join(root, "cache");
}

test("a cache miss fetches, writes the bytes, and records their sha256 in the sidecar", async (t) => {
  const cacheDir = scratch(t);
  const body = gz("a");
  const { fetcher, calls } = fake(body);

  const got = await fetchState("Bihar", "AE", { cacheDir, fetcher, now: () => FIRST });

  assert.deepEqual(calls, [STATE_URL]);
  assert.equal(got.cached, false);
  assert.equal(got.url, STATE_URL);
  assert.equal(got.sha256, sha256(body));
  assert.equal(got.retrievedAt, FIRST);
  assert.deepEqual(readFileSync(join(cacheDir, "Bihar_AE.csv.gz")), Buffer.from(body));
  const meta = JSON.parse(readFileSync(join(cacheDir, "Bihar_AE.csv.gz.meta.json"), "utf8"));
  assert.deepEqual(meta, { url: STATE_URL, retrievedAt: FIRST, bytes: body.length, sha256: sha256(body) });
});

test("a second call is served from the cache and the fetcher is not asked again", async (t) => {
  const cacheDir = scratch(t);
  const body = gz("a");
  const { fetcher, calls } = fake(body);
  await fetchState("Bihar", "AE", { cacheDir, fetcher, now: () => FIRST });

  const again = await fetchState("Bihar", "AE", { cacheDir, fetcher, now: () => LATER });

  assert.equal(calls.length, 1);
  assert.equal(again.cached, true);
  assert.equal(again.sha256, sha256(body));
  // The retrieval time is the one the sidecar recorded, not the clock of the second call.
  assert.equal(again.retrievedAt, FIRST);
});

test("an HTML error page is refused and nothing is written", async (t) => {
  const cacheDir = scratch(t);
  const html = Buffer.from("<html><body>503 Service Unavailable</body></html>");
  const { fetcher } = fake(html);

  await assert.rejects(
    fetchState("Bihar", "AE", { cacheDir, fetcher, now: () => FIRST }),
    new Error(`${STATE_URL} returned ${html.length} bytes that are not gzip — refusing to cache`),
  );
  assert.equal(existsSync(cacheDir), false, "not even the cache directory was created");
});

test("an HTTP error status is an error and nothing is written", async (t) => {
  const cacheDir = scratch(t);
  const { fetcher } = fake(Buffer.from("Not Found"), 404);

  await assert.rejects(fetchState("Bihar", "AE", { cacheDir, fetcher }), new Error(`${STATE_URL} returned 404`));
  assert.equal(existsSync(cacheDir), false);
});

test("refresh fetches again and replaces both the bytes and the sidecar", async (t) => {
  const cacheDir = scratch(t);
  const old = fake(gz("a"));
  await fetchState("Bihar", "AE", { cacheDir, fetcher: old.fetcher, now: () => FIRST });
  const body = gz("b");
  const fresh = fake(body);

  const got = await fetchState("Bihar", "AE", { cacheDir, fetcher: fresh.fetcher, refresh: true, now: () => LATER });

  assert.deepEqual(fresh.calls, [STATE_URL]);
  assert.equal(got.cached, false);
  assert.equal(got.sha256, sha256(body));
  assert.deepEqual(readFileSync(join(cacheDir, "Bihar_AE.csv.gz")), Buffer.from(body));
  const meta = JSON.parse(readFileSync(join(cacheDir, "Bihar_AE.csv.gz.meta.json"), "utf8"));
  assert.deepEqual(meta, { url: STATE_URL, retrievedAt: LATER, bytes: body.length, sha256: sha256(body) });
});

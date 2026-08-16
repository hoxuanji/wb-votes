/**
 * HTTP transport for the ECI pipeline, with a curl fallback.
 *
 * WHY THIS EXISTS. On this machine Node's `fetch` fails with `connect EPERM` while `curl` reaches
 * eci.gov.in normally: outbound traffic goes through a proxy that `fetch` does not honour. The Lokdhaba
 * importer hit the same wall and solved it by taking bytes from `--file`, which is fine for 62 files a
 * human downloads once and useless for a pipeline that must DISCOVER its own URLs. So the transport is a
 * seam: try `fetch`, and if the runtime cannot open the socket at all, shell out to curl.
 *
 * The fallback is a transport detail and nothing more. Every byte still gets hashed, the manifest records
 * the same provenance either way, and a test can inject a fetcher and never touch the network.
 *
 * ponytail: `execFileSync` with an argv array, never a shell string — a URL or header value with a quote
 * in it must not be able to become a command. The URL is checked to be https:// so it cannot be read as
 * a curl flag.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type HttpResponse = {
  status: number;
  ok: boolean;
  contentType: string | null;
  etag: string | null;
  lastModified: string | null;
  contentLength: number | null;
  bytes: Uint8Array;
  /** The body as UTF-8. Cheap: the bytes are already in memory. */
  text: () => string;
};

export type Fetcher = (url: string, headers?: Record<string, string>) => Promise<HttpResponse>;

const TIMEOUT_S = 180;

/** True once `fetch` has been shown not to work, so 42 artefacts do not each pay for the discovery. */
let fetchUnavailable = false;

export async function httpGet(url: string, headers: Record<string, string> = {}): Promise<HttpResponse> {
  if (!url.startsWith("https://")) throw new Error(`refusing to fetch a non-https URL: ${url}`);
  if (!fetchUnavailable) {
    try {
      return await viaFetch(url, headers);
    } catch (cause) {
      // Only a transport failure falls through to curl. A 404 is an answer and is returned above.
      fetchUnavailable = true;
      const why = (cause as Error).message;
      if (process.env["MANDATE_VERBOSE"] !== undefined) {
        console.error(`  (fetch unavailable: ${why} — using curl for the rest of this run)`);
      }
    }
  }
  return viaCurl(url, headers);
}

async function viaFetch(url: string, headers: Record<string, string>): Promise<HttpResponse> {
  const res = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_S * 1000) });
  const bytes = new Uint8Array(await res.arrayBuffer());
  return {
    status: res.status,
    ok: res.ok,
    contentType: res.headers.get("content-type"),
    etag: res.headers.get("etag"),
    lastModified: res.headers.get("last-modified"),
    contentLength: numOrNull(res.headers.get("content-length")),
    bytes,
    text: () => Buffer.from(bytes).toString("utf8"),
  };
}

function viaCurl(url: string, headers: Record<string, string>): HttpResponse {
  const dir = mkdtempSync(join(tmpdir(), "mandate-eci-"));
  const bodyPath = join(dir, "body");
  const headPath = join(dir, "head");
  try {
    const args = [
      "-sS", "-L", "--fail-with-body",
      "--retry", "3", "--retry-delay", "2",
      "--max-time", String(TIMEOUT_S),
      "-D", headPath, "-o", bodyPath,
      "-w", "%{http_code}",
    ];
    for (const [k, v] of Object.entries(headers)) args.push("-H", `${k}: ${v}`);
    args.push("--", url);
    let status = 0;
    try {
      status = Number(execFileSync("curl", args, { encoding: "utf8", maxBuffer: 1 << 20 }).trim());
    } catch (cause) {
      // --fail-with-body exits non-zero on 4xx/5xx but still writes the body and headers, so a real HTTP
      // answer is recoverable; anything else (no curl, DNS, timeout) is a genuine transport failure.
      const out = (cause as { stdout?: string }).stdout;
      const parsed = Number(String(out ?? "").trim());
      if (!Number.isFinite(parsed) || parsed === 0) {
        throw new Error(`curl ${url} failed: ${(cause as Error).message}`, { cause });
      }
      status = parsed;
    }
    const bytes = new Uint8Array(readFileSync(bodyPath));
    const h = parseHeaders(readFileSync(headPath, "utf8"));
    return {
      status,
      ok: status >= 200 && status < 300,
      contentType: h.get("content-type") ?? null,
      etag: h.get("etag") ?? null,
      lastModified: h.get("last-modified") ?? null,
      contentLength: numOrNull(h.get("content-length") ?? null),
      bytes,
      text: () => Buffer.from(bytes).toString("utf8"),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Header names lower-cased, LAST value winning.
 *
 * `-L` follows redirects and curl writes every hop's headers into the same file, so the first
 * `content-type` belongs to the 301, not the document. Taking the last one is what makes a redirected
 * spreadsheet report `application/vnd.ms-excel` rather than `text/html`.
 */
function parseHeaders(dump: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of dump.split(/\r?\n/)) {
    const at = line.indexOf(":");
    if (at <= 0) continue;
    out.set(line.slice(0, at).trim().toLowerCase(), line.slice(at + 1).trim());
  }
  return out;
}

const numOrNull = (v: string | null): number | null => {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

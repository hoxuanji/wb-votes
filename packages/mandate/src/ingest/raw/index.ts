/**
 * What every acquisition path shares: the transport (with its curl fallback) and the one place a
 * document is hashed.
 *
 * The sha256 is always over the bytes exactly as received or read, never over a decoded form, so anyone who
 * downloads the same URL can reproduce it. Hashing ids is a different job and stays in core/ids.ts.
 */

import { createHash } from "node:crypto";

export { httpGet, type Fetcher } from "./transport.ts";

export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

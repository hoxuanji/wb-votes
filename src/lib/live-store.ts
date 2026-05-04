/**
 * live-store.ts — Thin store abstraction for result-day live data.
 *
 * In production (Vercel with KV linked), reads/writes via the Upstash REST API
 * using env vars KV_REST_API_URL + KV_REST_API_TOKEN. These are set
 * automatically by Vercel when you link a KV store to the project.
 *
 * In dev (or any env without those vars), falls back to a process-local Map —
 * fine for local smoke tests, NOT durable across restarts. The scraper writes
 * via this module; the read API reads via this module; nothing else touches it.
 *
 * Intentionally NOT using @vercel/kv SDK — keeping zero-dep so the project
 * stays buildable without a package install step.
 */

export interface ACLiveResult {
  candidates: { candidateId: string; name: string; partyId: string; votes: number; voteShare: number }[];
  leaderId: string | null;
  leaderPartyId: string | null;
  marginVotes: number;
  totalCounted: number;
  totalElectors?: number;
  declared: boolean;
  lastUpdated: string;
}

export interface StateLiveSummary {
  totalACs: number;
  declared: number;
  leadingByParty: Record<string, number>;
  /** Aggregated vote totals per party across all reporting ACs. Only counts
   * leader+trailer per AC (ECI doesn't publish also-ran vote counts live), so
   * this is a lower-bound approximation of true state-wide vote share. */
  votesByParty?: Record<string, number>;
  /** Per-AC leader partyId (null = undeclared / no data). Used to colour the live-leader map. */
  leaderByAc?: Record<string, string | null>;
  turnoutPct?: number;
  tightestMargins: { acId: string; marginVotes: number; leaderPartyId: string | null }[];
  lastUpdated: string;
}

export interface ScraperMeta {
  lastRun: string;
  lastStatus: 'ok' | 'error' | 'partial';
  lastError?: string;
  sourceUrl?: string;
  acsParsed?: number;
}

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const hasKV    = Boolean(KV_URL && KV_TOKEN);

// In-memory fallback store
const mem = new Map<string, string>();

async function kvGet(key: string): Promise<string | null> {
  if (!hasKV) return mem.get(key) ?? null;
  const res = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const body = await res.json() as { result?: string | null };
  return body.result ?? null;
}

async function kvSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
  if (!hasKV) { mem.set(key, value); return; }
  const url = ttlSeconds
    ? `${KV_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}?EX=${ttlSeconds}`
    : `${KV_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  if (!res.ok) throw new Error(`KV set failed: ${res.status}`);
}

const KEY_AC     = (acId: string) => `results:ac:${acId}`;
const KEY_STATE  = 'results:state';
const KEY_META   = 'results:meta';

export async function readACResult(acId: string): Promise<ACLiveResult | null> {
  const raw = await kvGet(KEY_AC(acId));
  return raw ? (JSON.parse(raw) as ACLiveResult) : null;
}

export async function writeACResult(acId: string, data: ACLiveResult): Promise<void> {
  await kvSet(KEY_AC(acId), JSON.stringify(data));
}

export async function deleteACResult(acId: string): Promise<void> {
  if (!hasKV) { mem.delete(KEY_AC(acId)); return; }
  const res = await fetch(`${KV_URL}/del/${encodeURIComponent(KEY_AC(acId))}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  if (!res.ok) throw new Error(`KV del failed: ${res.status}`);
}

export async function readStateSummary(): Promise<StateLiveSummary | null> {
  const raw = await kvGet(KEY_STATE);
  return raw ? (JSON.parse(raw) as StateLiveSummary) : null;
}

export async function writeStateSummary(data: StateLiveSummary): Promise<void> {
  await kvSet(KEY_STATE, JSON.stringify(data));
}

export async function readMeta(): Promise<ScraperMeta | null> {
  const raw = await kvGet(KEY_META);
  return raw ? (JSON.parse(raw) as ScraperMeta) : null;
}

export async function writeMeta(data: ScraperMeta): Promise<void> {
  await kvSet(KEY_META, JSON.stringify(data));
}

export function isKVConfigured(): boolean {
  return hasKV;
}

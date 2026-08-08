import { NextResponse } from 'next/server';
import { searchReply } from '../../../../packages/mandate/src/repo/envelope.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * §20 search — transliteration-aware person search over canonical names and aliases, so
 * "মমতা", "Mamata" and "Mamta" reach the same rows.
 *
 * Usage:
 *   curl -s 'http://localhost:3000/v1/search?q=Mamata&limit=5' | jq '.data.results[].canonicalName'
 *   curl -s --get --data-urlencode 'q=মমতা' http://localhost:3000/v1/search | jq '.data.count'
 *
 * `limit` is clamped to 1..50. A query matching nothing is a 404 with a problem document, so a
 * 200 always carries a non-empty `sources` array.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit') ?? 20);
  const clamped = Number.isFinite(limit) ? Math.min(50, Math.max(1, Math.trunc(limit))) : 20;
  const r = await searchReply(url.searchParams.get('q') ?? '', clamped);
  return NextResponse.json(r.body, { status: r.status, headers: r.headers });
}

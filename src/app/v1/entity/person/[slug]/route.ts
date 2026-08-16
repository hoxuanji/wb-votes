import { NextResponse } from 'next/server';
import { personReply } from '../../../../../../packages/mandate/src/repo/envelope.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * §20 entity endpoint — one person, Brief lens: identity, aliases, candidacy history,
 * affidavit trail, merge provenance, and every source behind them.
 *
 * Usage:
 *   curl -s http://localhost:3000/v1/entity/person/mamata-banerjee-4a681f | jq '.meta'
 *
 * `slug` is the person id. 404 with a problem document for an unknown one, 503 while the
 * registry is unbuilt. Never a 200 with an empty `sources` array.
 */
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const r = await personReply(params.slug);
  return NextResponse.json(r.body, { status: r.status, headers: r.headers });
}

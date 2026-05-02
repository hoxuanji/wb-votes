import { NextResponse } from 'next/server';
import { readStateSummary, readMeta } from '@/lib/live-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const [summary, meta] = await Promise.all([readStateSummary(), readMeta()]);
  return NextResponse.json({
    summary: summary ?? null,
    meta:    meta    ?? null,
    status:  summary ? 'ok' : 'no-data',
  });
}

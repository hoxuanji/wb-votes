import { NextResponse } from 'next/server';
import { readACResult } from '@/lib/live-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { acId: string } },
) {
  const data = await readACResult(params.acId);
  if (!data) {
    return NextResponse.json({ data: null, status: 'no-data' }, { status: 200 });
  }
  return NextResponse.json({ data, status: 'ok' });
}

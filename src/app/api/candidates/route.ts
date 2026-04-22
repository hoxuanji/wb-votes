import { NextResponse } from 'next/server';
import { candidates } from '@/data/candidates';
import { getPartyById } from '@/data/parties';
import { getConstituencyById } from '@/data/constituencies';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const constituencyId = searchParams.get('constituencyId') ?? '';
  const partyId = searchParams.get('partyId') ?? '';

  let filtered = candidates;
  if (constituencyId) filtered = filtered.filter((c) => c.constituencyId === constituencyId);
  if (partyId) filtered = filtered.filter((c) => c.partyId === partyId);

  const enriched = filtered.map((c) => ({
    ...c,
    party: getPartyById(c.partyId),
    constituency: getConstituencyById(c.constituencyId),
  }));

  return NextResponse.json({ data: enriched, total: enriched.length });
}

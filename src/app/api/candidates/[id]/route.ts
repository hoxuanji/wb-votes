import { NextResponse } from 'next/server';
import { getCandidateById } from '@/data/candidates';
import { getPartyById } from '@/data/parties';
import { getConstituencyById } from '@/data/constituencies';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const candidate = getCandidateById(params.id);
  if (!candidate) {
    return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      ...candidate,
      party: getPartyById(candidate.partyId),
      constituency: getConstituencyById(candidate.constituencyId),
    },
  });
}

import { NextResponse } from 'next/server';
import { constituencies } from '@/data/constituencies';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.toLowerCase() ?? '';
  const district = searchParams.get('district') ?? '';

  const filtered = constituencies.filter((c) => {
    const matchQ = !q || c.name.toLowerCase().includes(q) || c.nameBn.includes(q);
    const matchDistrict = !district || c.district === district;
    return matchQ && matchDistrict;
  });

  return NextResponse.json({ data: filtered, total: filtered.length });
}

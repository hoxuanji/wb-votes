import { NextResponse } from 'next/server';
import { getCandidatesByConstituency } from '@/data/candidates';
import { generateFunFacts } from '@/lib/fun-facts';
import { getAssetBucket, getEducationTier } from '@/lib/candidate-scoring';

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function GET(_req: Request, { params }: { params: { id: string } }) {
  const candidates = getCandidatesByConstituency(params.id);
  if (candidates.length === 0) {
    return NextResponse.json({ error: 'No candidates found' }, { status: 404 });
  }

  const total = candidates.length;
  const withCriminalCases = candidates.filter(c => c.criminalCases > 0).length;
  const avgAssets = candidates.reduce((s, c) => s + c.totalAssets, 0) / total;
  const medianAssets = median(candidates.map(c => c.totalAssets));

  const eduLabels = ['Below 10th', '10th/12th', 'Graduate', 'Post Grad', 'PhD'];
  const eduCounts = [0, 0, 0, 0, 0];
  for (const c of candidates) eduCounts[getEducationTier(c.education)]++;
  const educationBreakdown = Object.fromEntries(eduLabels.map((l, i) => [l, eduCounts[i]]));

  const genderBreakdown = { Male: 0, Female: 0, Other: 0 };
  for (const c of candidates) {
    if (c.gender === 'Female') genderBreakdown.Female++;
    else if (c.gender === 'Other') genderBreakdown.Other++;
    else genderBreakdown.Male++;
  }

  const fields = ['age', 'education', 'occupation', 'totalAssets', 'affidavitUrl', 'gender'] as const;
  let filled = 0;
  for (const c of candidates) {
    for (const f of fields) {
      const v = c[f];
      if (v && v !== 'Not declared' && v !== 0) filled++;
    }
  }
  const dataQualityScore = Math.round((filled / (total * fields.length)) * 100);

  const assetBuckets: Record<string, number> = { Low: 0, Medium: 0, High: 0, 'Very High': 0 };
  for (const c of candidates) assetBuckets[getAssetBucket(c.totalAssets)]++;

  const stats = {
    totalCandidates: total,
    withCriminalCases,
    avgAssets,
    medianAssets,
    educationBreakdown,
    genderBreakdown,
    dataQualityScore,
    assetBuckets,
  };

  return NextResponse.json({
    constituencyId: params.id,
    stats,
    funFacts: generateFunFacts(candidates),
  });
}

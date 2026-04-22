import type { Candidate, FunFact } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { getEducationTier } from '@/lib/candidate-scoring';

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function generateFunFacts(candidates: Candidate[]): FunFact[] {
  if (candidates.length === 0) return [];
  const facts: FunFact[] = [];

  // 1. Wealthiest candidate
  const richest = [...candidates].sort((a, b) => b.totalAssets - a.totalAssets)[0];
  const avgAssets = candidates.reduce((s, c) => s + c.totalAssets, 0) / candidates.length;
  if (richest.totalAssets > 0) {
    const ratio = avgAssets > 0 ? (richest.totalAssets / avgAssets).toFixed(1) : null;
    facts.push({
      id: 'wealthiest',
      icon: 'TrendingUp',
      headline: `Wealthiest: ${richest.name}`,
      detail: `Declared assets of ${formatCurrency(richest.totalAssets)}${ratio ? ` — ${ratio}× the average` : ''}`,
      category: 'Finance',
      shareText: `The wealthiest candidate in this constituency is ${richest.name} with declared assets of ${formatCurrency(richest.totalAssets)}!`,
    });
  }

  // 2. Most criminal cases
  const mostCases = [...candidates].sort((a, b) => b.criminalCases - a.criminalCases)[0];
  if (mostCases.criminalCases > 0) {
    facts.push({
      id: 'most-cases',
      icon: 'AlertTriangle',
      headline: `${mostCases.criminalCases} pending case${mostCases.criminalCases > 1 ? 's' : ''}`,
      detail: `${mostCases.name} has declared the highest number of pending criminal cases in this constituency`,
      category: 'Criminal Record',
      shareText: `${mostCases.name} has declared ${mostCases.criminalCases} pending criminal case${mostCases.criminalCases > 1 ? 's' : ''} in their ECI affidavit.`,
    });
  }

  // 3. Clean record percentage
  const clean = candidates.filter(c => c.criminalCases === 0).length;
  const cleanPct = Math.round((clean / candidates.length) * 100);
  facts.push({
    id: 'clean-record',
    icon: 'ShieldCheck',
    headline: `${cleanPct}% have zero criminal cases`,
    detail: `${clean} out of ${candidates.length} candidates have declared no pending cases`,
    category: 'Criminal Record',
    shareText: `${cleanPct}% of candidates in this constituency have declared zero pending criminal cases.`,
  });

  // 4. Youngest candidate
  const withAge = candidates.filter(c => c.age > 0);
  if (withAge.length > 0) {
    const youngest = [...withAge].sort((a, b) => a.age - b.age)[0];
    facts.push({
      id: 'youngest',
      icon: 'Zap',
      headline: `Youngest: ${youngest.name}`,
      detail: `Only ${youngest.age} years old`,
      category: 'Demographics',
      shareText: `The youngest candidate in this constituency is ${youngest.name} at just ${youngest.age} years old!`,
    });

    // 5. Oldest candidate
    const oldest = [...withAge].sort((a, b) => b.age - a.age)[0];
    if (oldest.age !== youngest.age) {
      facts.push({
        id: 'oldest',
        icon: 'Star',
        headline: `Most experienced: ${oldest.name}`,
        detail: `${oldest.age} years old — bringing decades of experience`,
        category: 'Demographics',
        shareText: `The most experienced candidate in this constituency is ${oldest.name} at ${oldest.age} years old.`,
      });
    }
  }

  // 6. Women candidates
  const women = candidates.filter(c => c.gender === 'Female').length;
  if (women > 0) {
    const womenPct = Math.round((women / candidates.length) * 100);
    facts.push({
      id: 'women',
      icon: 'Users',
      headline: `${women} woman candidate${women > 1 ? 's' : ''}`,
      detail: `${womenPct}% of candidates in this constituency are women`,
      category: 'Demographics',
      shareText: `${women} out of ${candidates.length} candidates (${womenPct}%) in this constituency are women.`,
    });
  }

  // 7. Most educated
  const eduRanked = [...candidates].sort((a, b) => getEducationTier(b.education) - getEducationTier(a.education));
  const topEdu = eduRanked[0];
  if (getEducationTier(topEdu.education) >= 3) {
    facts.push({
      id: 'most-educated',
      icon: 'BookOpen',
      headline: `Highly educated: ${topEdu.name}`,
      detail: topEdu.education,
      category: 'Education',
      shareText: `${topEdu.name} is among the most educated candidates with qualification: ${topEdu.education}.`,
    });
  }

  // 8. Incumbents
  const incumbents = candidates.filter(c => c.isIncumbent);
  if (incumbents.length > 0) {
    facts.push({
      id: 'incumbents',
      icon: 'RefreshCw',
      headline: `${incumbents.length} incumbent${incumbents.length > 1 ? 's' : ''} seeking re-election`,
      detail: incumbents.length === 1
        ? `${incumbents[0].name} is the sitting MLA`
        : `Including: ${incumbents.slice(0, 2).map(c => c.name).join(', ')}${incumbents.length > 2 ? ` +${incumbents.length - 2} more` : ''}`,
      category: 'Incumbency',
      shareText: `${incumbents.length} sitting MLA${incumbents.length > 1 ? 's are' : ' is'} seeking re-election in this constituency.`,
    });
  }

  // 9. Asset spread: avg vs median
  const allAssets = candidates.map(c => c.totalAssets);
  const med = median(allAssets);
  if (med > 0 && avgAssets > 0) {
    const ratio = (avgAssets / med).toFixed(1);
    if (parseFloat(ratio) > 1.5) {
      facts.push({
        id: 'asset-spread',
        icon: 'BarChart2',
        headline: `High wealth gap among candidates`,
        detail: `Average assets (${formatCurrency(avgAssets)}) are ${ratio}× the median (${formatCurrency(med)})`,
        category: 'Finance',
        shareText: `There's a significant wealth gap — average assets are ${ratio}× the median in this constituency.`,
      });
    }
  }

  // 10. Party count
  const parties = new Set(candidates.map(c => c.partyId)).size;
  facts.push({
    id: 'party-count',
    icon: 'Flag',
    headline: `${parties} parties contesting`,
    detail: `${candidates.length} candidates from ${parties} different parties and groups`,
    category: 'Overview',
    shareText: `${parties} different parties are contesting in this constituency with ${candidates.length} total candidates.`,
  });

  return facts;
}

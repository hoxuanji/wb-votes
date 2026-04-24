import Image from 'next/image';
import Link from 'next/link';
import { Eye, Zap, Shield, Sparkles, Users, AlertTriangle, Clock, Banknote, RefreshCw } from 'lucide-react';
import { candidates } from '@/data/candidates';
import { constituencies } from '@/data/constituencies';
import { parties } from '@/data/parties';
import { formatCurrency } from '@/lib/utils';
import { PartySymbol } from '@/components/ui/PartySymbol';
import type { ReactNode } from 'react';

const partyMap = Object.fromEntries(parties.map(p => [p.id, p]));
const constMap = Object.fromEntries(constituencies.map(c => [c.id, c]));

const MAJOR_PARTIES = ['AITC', 'BJP', 'CPI(M)', 'INC'];

function getDayIndex() { return Math.floor(Date.now() / 86400000); }

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed | 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    const j = ((s >>> 1) % (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface WatchEntry {
  candidate: typeof candidates[number] | undefined;
  icon: ReactNode;
  category: string;
  whyWatch: string;
  stat: string;
  accent: string;
  bg: string;
  border: string;
}

const EDUCATION_RANK: Record<string, number> = {
  'Doctorate': 5, 'Post Graduate': 4, 'Graduate Professional': 3,
  'Graduate': 3, '12th Pass': 2, '10th Pass': 1, 'Others': 0, 'Literate': 0,
};

function buildWatchPool(): WatchEntry[] {
  const countByConst: Record<string, number> = {};
  candidates.forEach(c => { countByConst[c.constituencyId] = (countByConst[c.constituencyId] || 0) + 1; });

  // 1. Young Challenger — youngest under-30, major party
  const youngChallenger = [...candidates]
    .filter(c => MAJOR_PARTIES.includes(c.partyId) && c.age >= 21 && c.age < 30)
    .sort((a, b) => a.age - b.age)[0];

  // 2. Women Frontrunner — richest woman from major party in 4-major-party seat
  const fourPartySeats = new Set(
    Object.entries(
      candidates.reduce<Record<string, Set<string>>>((acc, c) => {
        if (MAJOR_PARTIES.includes(c.partyId)) {
          if (!acc[c.constituencyId]) acc[c.constituencyId] = new Set();
          acc[c.constituencyId].add(c.partyId);
        }
        return acc;
      }, {})
    )
    .filter(([, parties]) => parties.size === 4)
    .map(([id]) => id)
  );
  const womenFrontrunner = [...candidates]
    .filter(c => c.gender === 'Female' && MAJOR_PARTIES.includes(c.partyId) && fourPartySeats.has(c.constituencyId) && c.totalAssets > 0)
    .sort((a, b) => b.totalAssets - a.totalAssets)[0];

  // 3. Clean Slate Contender — 0 criminal cases, highest education, major party
  const cleanSlate = [...candidates]
    .filter(c => MAJOR_PARTIES.includes(c.partyId) && c.criminalCases === 0 && c.totalAssets > 0)
    .sort((a, b) => (EDUCATION_RANK[b.education ?? ''] ?? 0) - (EDUCATION_RANK[a.education ?? ''] ?? 0))[0];

  // 4. Independent Wildcard — highest assets IND candidate
  const indWildcard = [...candidates]
    .filter(c => c.partyId === 'IND' && c.totalAssets > 0)
    .sort((a, b) => b.totalAssets - a.totalAssets)[0];

  // 5. Most Contested Seat — major-party candidate in most crowded constituency
  const mostContested = [...candidates]
    .filter(c => MAJOR_PARTIES.includes(c.partyId))
    .sort((a, b) => (countByConst[b.constituencyId] ?? 0) - (countByConst[a.constituencyId] ?? 0))[0];

  // 6. Controversy Spotlight — most criminal cases, major party
  const controversy = [...candidates]
    .filter(c => MAJOR_PARTIES.includes(c.partyId) && c.criminalCases > 0)
    .sort((a, b) => b.criminalCases - a.criminalCases)[0];

  // 7. Senior Statesman — oldest major-party candidate
  const seniorStatesman = [...candidates]
    .filter(c => MAJOR_PARTIES.includes(c.partyId) && (c.age ?? 0) > 0)
    .sort((a, b) => b.age - a.age)[0];

  // 8. Debt Warrior — highest liabilities
  const debtWarrior = [...candidates]
    .filter(c => (c.totalLiabilities ?? 0) > 0)
    .sort((a, b) => (b.totalLiabilities ?? 0) - (a.totalLiabilities ?? 0))[0];

  return [
    {
      candidate: youngChallenger,
      icon: <Zap className="h-4 w-4" />,
      category: 'Young Challenger',
      whyWatch: `At ${youngChallenger?.age ?? '—'}, one of the youngest major-party candidates on the ballot`,
      stat: `Age ${youngChallenger?.age ?? '—'}`,
      accent: '#7c3aed',
      bg: 'bg-violet-50',
      border: 'border-violet-200',
    },
    {
      candidate: womenFrontrunner,
      icon: <Sparkles className="h-4 w-4" />,
      category: 'Women Frontrunner',
      whyWatch: `Top-declared-assets woman in a fully contested 4-party seat`,
      stat: formatCurrency(womenFrontrunner?.totalAssets ?? 0),
      accent: '#be185d',
      bg: 'bg-pink-50',
      border: 'border-pink-200',
    },
    {
      candidate: cleanSlate,
      icon: <Shield className="h-4 w-4" />,
      category: 'Clean Slate Contender',
      whyWatch: `Zero criminal cases declared, ${cleanSlate?.education ?? 'highly educated'} — stands out in a crowded field`,
      stat: '0 cases · ' + (cleanSlate?.education ?? ''),
      accent: '#16a34a',
      bg: 'bg-green-50',
      border: 'border-green-200',
    },
    {
      candidate: indWildcard,
      icon: <Sparkles className="h-4 w-4" />,
      category: 'Independent Wildcard',
      whyWatch: `Richest independent on the ballot — a well-resourced wildcard to watch`,
      stat: formatCurrency(indWildcard?.totalAssets ?? 0),
      accent: '#4338ca',
      bg: 'bg-indigo-50',
      border: 'border-indigo-200',
    },
    {
      candidate: mostContested,
      icon: <Users className="h-4 w-4" />,
      category: 'Most Contested Seat',
      whyWatch: `${countByConst[mostContested?.constituencyId ?? ''] ?? '—'} candidates in this seat — one of the most crowded races`,
      stat: `${countByConst[mostContested?.constituencyId ?? ''] ?? '—'} candidates`,
      accent: '#0f766e',
      bg: 'bg-teal-50',
      border: 'border-teal-200',
    },
    {
      candidate: controversy,
      icon: <AlertTriangle className="h-4 w-4" />,
      category: 'Controversy Spotlight',
      whyWatch: `${controversy?.criminalCases ?? 0} pending criminal cases declared — highest among major-party candidates`,
      stat: `${controversy?.criminalCases ?? 0} cases`,
      accent: '#dc2626',
      bg: 'bg-red-50',
      border: 'border-red-200',
    },
    {
      candidate: seniorStatesman,
      icon: <Clock className="h-4 w-4" />,
      category: 'Senior Statesman',
      whyWatch: `At ${seniorStatesman?.age ?? '—'}, one of the most experienced voices on the ballot`,
      stat: `Age ${seniorStatesman?.age ?? '—'}`,
      accent: '#0284c7',
      bg: 'bg-sky-50',
      border: 'border-sky-200',
    },
    {
      candidate: debtWarrior,
      icon: <Banknote className="h-4 w-4" />,
      category: 'Debt Warrior',
      whyWatch: `${formatCurrency(debtWarrior?.totalLiabilities ?? 0)} in declared liabilities — high-stakes financial exposure`,
      stat: formatCurrency(debtWarrior?.totalLiabilities ?? 0),
      accent: '#b45309',
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
    },
  ].filter(e => e.candidate != null);
}

export function CandidatesWatch() {
  const pool = buildWatchPool();
  const shown = seededShuffle(pool, getDayIndex() + 7).slice(0, 4);

  return (
    <section className="border-t border-gray-100 px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-1 flex items-center gap-2 flex-wrap">
          <Eye className="h-5 w-5 text-blue-500" />
          <h2 className="text-xl font-bold text-gray-900">Candidates to Watch</h2>
          <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[10px] font-semibold text-blue-600">
            <RefreshCw className="h-2.5 w-2.5" /> Changes daily
          </span>
        </div>
        <p className="mb-6 text-sm text-gray-500">
          8 analytical profiles — 4 spotlighted each day, based entirely on ECI affidavit data
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {shown.map(({ candidate: c, icon, category, whyWatch, stat, accent, bg, border }) => {
            if (!c) return null;
            const party = partyMap[c.partyId];
            const constituency = constMap[c.constituencyId];

            return (
              <Link
                key={`watch-${category}-${c.id}`}
                href={`/candidate/${c.id}`}
                className={`group flex flex-col rounded-xl border ${border} ${bg} p-4 transition-all duration-150 hover:shadow-md active:scale-[0.97]`}
              >
                {/* Category */}
                <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: accent }}>
                  {icon}
                  {category}
                </div>

                {/* Photo + name */}
                <div className="mb-3 flex items-center gap-3">
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-white shadow-sm">
                    {c.photoUrl ? (
                      <Image src={c.photoUrl} alt={c.name} fill className="object-cover" sizes="48px" />
                    ) : (
                      <div
                        className="flex h-full w-full items-center justify-center text-lg font-bold text-white"
                        style={{ backgroundColor: party?.color ?? '#64748b' }}
                      >
                        {c.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-gray-900 group-hover:text-blue-700">{c.name}</p>
                    <div className="mt-0.5 flex items-center gap-1">
                      <PartySymbol party={{ abbreviation: party?.abbreviation ?? c.partyId, color: party?.color ?? '#64748b', symbolUrl: party?.symbolUrl }} size={16} />
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                        style={{ backgroundColor: party?.color ?? '#64748b' }}
                      >
                        {party?.abbreviation ?? c.partyId}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Why Watch */}
                <p className="mb-3 flex-1 text-xs leading-relaxed text-gray-600">{whyWatch}</p>

                {/* Stat */}
                <div className="rounded-lg bg-white/70 px-3 py-2">
                  <span className="text-sm font-extrabold" style={{ color: accent }}>{stat}</span>
                </div>

                {/* Constituency */}
                {constituency && (
                  <p className="mt-2 text-[11px] text-gray-400 truncate">
                    {constituency.name} · {constituency.district}
                  </p>
                )}
              </Link>
            );
          })}
        </div>

        <p className="mt-4 text-center text-[11px] italic text-gray-400">
          Profiles are based solely on ECI affidavit data. This is not an endorsement of any candidate.
        </p>
      </div>
    </section>
  );
}

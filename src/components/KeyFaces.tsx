import Image from 'next/image';
import Link from 'next/link';
import { TrendingUp, Clock, AlertTriangle, GraduationCap, Trophy, Crown, Heart, Banknote, Siren, Users, Sparkles, RefreshCw } from 'lucide-react';
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

interface SpotlightEntry {
  candidate: typeof candidates[number] | undefined;
  icon: ReactNode;
  label: string;
  stat: string;
  statLabel: string;
  accent: string;
  bg: string;
  border: string;
}

function buildSpotlightPool(): SpotlightEntry[] {
  const withAssets = candidates.filter(c => c.totalAssets > 0);
  const richest = [...withAssets].sort((a, b) => b.totalAssets - a.totalAssets)[0];

  const youngest = [...candidates]
    .filter(c => c.age >= 21 && c.age <= 35)
    .sort((a, b) => a.age - b.age)[0];

  const mostCases = [...candidates]
    .sort((a, b) => b.criminalCases - a.criminalCases)[0];

  const countByConst: Record<string, number> = {};
  candidates.forEach(c => { countByConst[c.constituencyId] = (countByConst[c.constituencyId] || 0) + 1; });
  const hotSeat = [...candidates]
    .filter(c => MAJOR_PARTIES.includes(c.partyId))
    .sort((a, b) => (countByConst[b.constituencyId] ?? 0) - (countByConst[a.constituencyId] ?? 0))[0];

  const oldest = [...candidates]
    .filter(c => (c.age ?? 0) > 0)
    .sort((a, b) => b.age - a.age)[0];

  const wealthiestWoman = [...candidates]
    .filter(c => c.gender === 'Female' && c.totalAssets > 0)
    .sort((a, b) => b.totalAssets - a.totalAssets)[0];

  const youngestWoman = [...candidates]
    .filter(c => c.gender === 'Female' && c.age >= 21)
    .sort((a, b) => a.age - b.age)[0];

  const highestDebt = [...candidates]
    .filter(c => (c.totalLiabilities ?? 0) > 0)
    .sort((a, b) => (b.totalLiabilities ?? 0) - (a.totalLiabilities ?? 0))[0];

  const wealthiestIncumbent = [...candidates]
    .filter(c => c.isIncumbent && c.totalAssets > 0)
    .sort((a, b) => b.totalAssets - a.totalAssets)[0];

  const richestInd = [...candidates]
    .filter(c => c.partyId === 'IND' && c.totalAssets > 0)
    .sort((a, b) => b.totalAssets - a.totalAssets)[0];

  const mostContested = [...candidates]
    .filter(c => MAJOR_PARTIES.includes(c.partyId))
    .sort((a, b) => (countByConst[b.constituencyId] ?? 0) - (countByConst[a.constituencyId] ?? 0))[0];

  const EDUCATION_RANK: Record<string, number> = {
    'Doctorate': 5, 'Post Graduate': 4, 'Graduate': 3, 'Graduate Professional': 3,
    '12th Pass': 2, '10th Pass': 1, 'Others': 0, 'Literate': 0,
  };
  const cleanMajor = [...candidates]
    .filter(c => MAJOR_PARTIES.includes(c.partyId) && c.criminalCases === 0)
    .sort((a, b) => (EDUCATION_RANK[b.education ?? ''] ?? 0) - (EDUCATION_RANK[a.education ?? ''] ?? 0))[0];

  return [
    {
      candidate: richest,
      icon: <TrendingUp className="h-4 w-4" />,
      label: 'Wealthiest Declared',
      stat: formatCurrency(richest?.totalAssets ?? 0),
      statLabel: 'in declared assets',
      accent: '#059669',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
    },
    {
      candidate: youngest,
      icon: <Clock className="h-4 w-4" />,
      label: 'Youngest on the Ballot',
      stat: `${youngest?.age ?? '—'} yrs`,
      statLabel: 'old',
      accent: '#7c3aed',
      bg: 'bg-violet-50',
      border: 'border-violet-200',
    },
    {
      candidate: mostCases,
      icon: <AlertTriangle className="h-4 w-4" />,
      label: 'Most Cases Declared',
      stat: `${mostCases?.criminalCases ?? 0}`,
      statLabel: 'pending cases',
      accent: '#dc2626',
      bg: 'bg-red-50',
      border: 'border-red-200',
    },
    {
      candidate: hotSeat,
      icon: <GraduationCap className="h-4 w-4" />,
      label: 'Hottest Seat (Major Party)',
      stat: `${countByConst[hotSeat?.constituencyId ?? ''] ?? '—'}`,
      statLabel: 'candidates in seat',
      accent: '#d97706',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
    },
    {
      candidate: oldest,
      icon: <Trophy className="h-4 w-4" />,
      label: 'Oldest Candidate',
      stat: `${oldest?.age ?? '—'} yrs`,
      statLabel: 'old',
      accent: '#0284c7',
      bg: 'bg-sky-50',
      border: 'border-sky-200',
    },
    {
      candidate: wealthiestWoman,
      icon: <Crown className="h-4 w-4" />,
      label: 'Wealthiest Woman Candidate',
      stat: formatCurrency(wealthiestWoman?.totalAssets ?? 0),
      statLabel: 'declared assets',
      accent: '#be185d',
      bg: 'bg-pink-50',
      border: 'border-pink-200',
    },
    {
      candidate: youngestWoman,
      icon: <Heart className="h-4 w-4" />,
      label: 'Youngest Woman on Ballot',
      stat: `${youngestWoman?.age ?? '—'} yrs`,
      statLabel: 'old',
      accent: '#9d174d',
      bg: 'bg-rose-50',
      border: 'border-rose-200',
    },
    {
      candidate: highestDebt,
      icon: <Banknote className="h-4 w-4" />,
      label: 'Highest Declared Liabilities',
      stat: formatCurrency(highestDebt?.totalLiabilities ?? 0),
      statLabel: 'in liabilities',
      accent: '#b45309',
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
    },
    {
      candidate: wealthiestIncumbent,
      icon: <Siren className="h-4 w-4" />,
      label: 'Wealthiest Incumbent',
      stat: formatCurrency(wealthiestIncumbent?.totalAssets ?? 0),
      statLabel: 'declared assets',
      accent: '#991b1b',
      bg: 'bg-red-50',
      border: 'border-red-300',
    },
    {
      candidate: richestInd,
      icon: <Sparkles className="h-4 w-4" />,
      label: 'Richest Independent',
      stat: formatCurrency(richestInd?.totalAssets ?? 0),
      statLabel: 'declared assets',
      accent: '#4338ca',
      bg: 'bg-indigo-50',
      border: 'border-indigo-200',
    },
    {
      candidate: mostContested,
      icon: <Users className="h-4 w-4" />,
      label: 'Most Contested Seat',
      stat: `${countByConst[mostContested?.constituencyId ?? ''] ?? '—'}`,
      statLabel: 'total candidates',
      accent: '#0f766e',
      bg: 'bg-teal-50',
      border: 'border-teal-200',
    },
    {
      candidate: cleanMajor,
      icon: <GraduationCap className="h-4 w-4" />,
      label: 'Clean Slate (Major Party)',
      stat: cleanMajor?.education ?? '—',
      statLabel: '· 0 criminal cases',
      accent: '#16a34a',
      bg: 'bg-green-50',
      border: 'border-green-200',
    },
  ].filter(s => s.candidate != null);
}

export function KeyFaces() {
  const pool = buildSpotlightPool();
  const spotlights = seededShuffle(pool, getDayIndex()).slice(0, 4);

  return (
    <section className="bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-1 flex items-center gap-2 flex-wrap">
          <h2 className="text-xl font-bold text-gray-900">Spotlight: Notable Candidates</h2>
          <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[10px] font-semibold text-blue-600">
            <RefreshCw className="h-2.5 w-2.5" /> Refreshes daily
          </span>
        </div>
        <p className="mb-6 text-sm text-gray-500">
          Real data from ECI affidavits — 4 of 12 spotlight angles, rotating every day
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {spotlights.map(({ candidate: c, icon, label, stat, statLabel, accent, bg, border }) => {
            if (!c) return null;
            const party = partyMap[c.partyId];
            const constituency = constMap[c.constituencyId];

            return (
              <Link
                key={`${label}-${c.id}`}
                href={`/candidate/${c.id}`}
                className={`group rounded-xl border ${border} ${bg} p-4 transition-all duration-150 hover:shadow-md active:scale-[0.97] active:shadow-sm`}
              >
                {/* Label */}
                <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: accent }}>
                  {icon}
                  {label}
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
                    <p className="truncate text-sm font-bold text-gray-900 group-hover:text-blue-700">
                      {c.name}
                    </p>
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

                {/* Stat */}
                <div className="rounded-lg bg-white/70 px-3 py-2">
                  <span className="text-lg font-extrabold" style={{ color: accent }}>{stat}</span>
                  <span className="ml-1.5 text-xs text-gray-500">{statLabel}</span>
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
      </div>
    </section>
  );
}

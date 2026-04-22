import Image from 'next/image';
import Link from 'next/link';
import { TrendingUp, Clock, AlertTriangle, GraduationCap } from 'lucide-react';
import { candidates } from '@/data/candidates';
import { constituencies } from '@/data/constituencies';
import { parties } from '@/data/parties';
import { formatCurrency } from '@/lib/utils';

const partyMap = Object.fromEntries(parties.map(p => [p.id, p]));
const constMap = Object.fromEntries(constituencies.map(c => [c.id, c]));

function pickSpotlights() {
  const withAssets = candidates.filter(c => c.totalAssets > 0);
  const richest = [...withAssets].sort((a, b) => b.totalAssets - a.totalAssets)[0];

  const youngest = [...candidates]
    .filter(c => c.age >= 21 && c.age <= 35)
    .sort((a, b) => a.age - b.age)[0];

  const mostCases = [...candidates]
    .sort((a, b) => b.criminalCases - a.criminalCases)[0];

  // Most candidates in their seat (most contested individual)
  const countByConst: Record<string, number> = {};
  candidates.forEach(c => { countByConst[c.constituencyId] = (countByConst[c.constituencyId] || 0) + 1; });
  const hotSeat = [...candidates]
    .filter(c => ['AITC', 'BJP', 'CPI(M)', 'INC'].includes(c.partyId))
    .sort((a, b) => (countByConst[b.constituencyId] ?? 0) - (countByConst[a.constituencyId] ?? 0))[0];

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
  ].filter(s => s.candidate != null);
}

export function KeyFaces() {
  const spotlights = pickSpotlights();

  return (
    <section className="bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-1 text-xl font-bold text-gray-900">Spotlight: Notable Candidates</h2>
        <p className="mb-6 text-sm text-gray-500">
          Real data from ECI affidavits — who stands out on the ballot?
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {spotlights.map(({ candidate: c, icon, label, stat, statLabel, accent, bg, border }) => {
            if (!c) return null;
            const party = partyMap[c.partyId];
            const constituency = constMap[c.constituencyId];

            return (
              <Link
                key={c.id}
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
                    <span
                      className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                      style={{ backgroundColor: party?.color ?? '#64748b' }}
                    >
                      {party?.abbreviation ?? c.partyId}
                    </span>
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

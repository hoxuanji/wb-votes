import Link from 'next/link';
import { Flame, Users } from 'lucide-react';
import { candidates } from '@/data/candidates';
import { constituencies } from '@/data/constituencies';
import { parties } from '@/data/parties';

const MAJOR_PARTIES = ['AITC', 'BJP', 'CPI(M)', 'INC'];
const PARTY_COLORS: Record<string, string> = {
  'AITC': '#1B5E20', 'BJP': '#E65100', 'CPI(M)': '#B71C1C', 'INC': '#1565C0',
};

const partyMap = Object.fromEntries(parties.map(p => [p.id, p]));
const constMap = Object.fromEntries(constituencies.map(c => [c.id, c]));

function computeHardFought() {
  const byConst: Record<string, typeof candidates> = {};
  for (const c of candidates) {
    if (!byConst[c.constituencyId]) byConst[c.constituencyId] = [];
    byConst[c.constituencyId].push(c);
  }

  return Object.entries(byConst)
    .map(([id, cs]) => {
      const partySet = new Set(cs.map(c => c.partyId));
      const majorPresent = MAJOR_PARTIES.filter(p => partySet.has(p));
      const score = cs.length * 0.3 + majorPresent.length * 15;
      const withCriminal = cs.filter(c => c.criminalCases > 0).length;
      return { id, total: cs.length, majorPresent, score, withCriminal };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

export function HardFought() {
  const hotSeats = computeHardFought();

  return (
    <section className="px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-1 flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-500" />
          <h2 className="text-xl font-bold text-gray-900">Hard-Fought Constituencies</h2>
        </div>
        <p className="mb-6 text-sm text-gray-500">
          Seats where all four major parties — TMC, BJP, CPM, INC — are all contesting
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {hotSeats.map(({ id, total, majorPresent, withCriminal }) => {
            const c = constMap[id];
            if (!c) return null;
            return (
              <Link
                key={id}
                href={`/constituency/${id}`}
                className="group rounded-xl border border-orange-100 bg-orange-50 p-4 transition-all hover:border-orange-300 hover:shadow-md"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-gray-900 group-hover:text-blue-700">{c.name}</h3>
                    <p className="text-xs text-gray-500">{c.district} · #{c.assemblyNumber}</p>
                  </div>
                  {c.reservation !== 'General' && (
                    <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                      {c.reservation}
                    </span>
                  )}
                </div>

                {/* Party presence */}
                <div className="mb-3 flex gap-1.5 flex-wrap">
                  {majorPresent.map(pid => (
                    <span
                      key={pid}
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                      style={{ backgroundColor: PARTY_COLORS[pid] ?? '#64748b' }}
                    >
                      {partyMap[pid]?.abbreviation ?? pid}
                    </span>
                  ))}
                  {majorPresent.length === 4 && (
                    <span className="rounded-full bg-orange-200 px-2 py-0.5 text-[10px] font-bold text-orange-800">
                      All 4 majors
                    </span>
                  )}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" /> {total} candidates
                  </span>
                  {withCriminal > 0 && (
                    <span className="text-red-500">{withCriminal} with cases</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

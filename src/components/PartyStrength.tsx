import { parties } from '@/data/parties';
import { candidates } from '@/data/candidates';

const MAJOR_PARTY_IDS = ['AITC', 'BJP', 'INC', 'CPI(M)'];

export function PartyStrength() {
  const counts: Record<string, number> = {};
  for (const c of candidates) {
    const pid = c.partyId;
    counts[pid] = (counts[pid] || 0) + 1;
  }

  const partyMap = Object.fromEntries(parties.map(p => [p.id, p]));
  const rows = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id, count]) => ({
      id,
      name: partyMap[id]?.abbreviation ?? id,
      fullName: partyMap[id]?.name ?? id,
      count,
      color: partyMap[id]?.color ?? '#64748b',
    }));

  const max = rows[0]?.count ?? 1;

  return (
    <section className="mx-auto max-w-5xl px-4 py-10">
      <h2 className="mb-1 text-xl font-bold text-gray-900">Party Candidate Strength</h2>
      <p className="mb-6 text-sm text-gray-500">Number of candidates fielded per party — Phase 1 data</p>
      <div className="space-y-3">
        {rows.map(r => (
          <div key={r.id} className="flex items-center gap-3">
            <div className="w-16 shrink-0 text-right text-xs font-semibold text-gray-700">{r.name}</div>
            <div className="flex-1 overflow-hidden rounded-full bg-gray-100 h-5">
              <div
                className="flex h-full items-center rounded-full px-2 transition-all duration-500"
                style={{
                  width: `${Math.max(4, (r.count / max) * 100)}%`,
                  backgroundColor: r.color,
                }}
              >
                <span className="text-[10px] font-bold text-white drop-shadow">{r.count}</span>
              </div>
            </div>
            <div className="w-32 shrink-0 text-xs text-gray-400 truncate hidden sm:block">{r.fullName}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

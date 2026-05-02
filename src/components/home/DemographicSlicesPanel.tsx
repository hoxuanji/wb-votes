'use client';

import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { parties } from '@/data/parties';
import type { DemographicSlice, DemographicDimension } from '@/lib/election-analysis';

const partyById = Object.fromEntries(parties.map(p => [p.id, p]));

const DIMENSION_LABELS: Record<DemographicDimension, string> = {
  district:    'By district',
  reservation: 'By reservation',
  literacy:    'By literacy quartile',
  urban:       'By urban % quartile',
  scShare:     'By SC % quartile',
};

// Bucket ordering so the charts read left-to-right intuitively.
const ORDER: Record<DemographicDimension, string[]> = {
  district: [],
  reservation: ['General', 'SC', 'ST'],
  literacy:    ['Q1 (lowest)', 'Q2', 'Q3', 'Q4 (highest)'],
  urban:       ['Q1 (lowest)', 'Q2', 'Q3', 'Q4 (highest)'],
  scShare:     ['Q1 (lowest)', 'Q2', 'Q3', 'Q4 (highest)'],
};

interface Props { slices: DemographicSlice[]; }

export function DemographicSlicesPanel({ slices }: Props) {
  const dimensions = useMemo(() => {
    const seen = new Set<DemographicDimension>();
    slices.forEach(s => seen.add(s.dimension));
    const order: DemographicDimension[] = ['reservation', 'literacy', 'urban', 'scShare', 'district'];
    return order.filter(d => seen.has(d));
  }, [slices]);

  const [active, setActive] = useState<DemographicDimension | null>(dimensions[0] ?? null);

  if (!active || dimensions.length === 0) {
    return (
      <section className="border-t border-white/10 px-4 py-10">
        <div className="mx-auto max-w-6xl rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-center">
          <p className="text-sm text-gray-400">Demographic data unavailable.</p>
        </div>
      </section>
    );
  }

  // Build a chart-friendly array. Each row = a bucket; columns = each party's seat count.
  const dimSlices = slices.filter(s => s.dimension === active);
  const ordered = ORDER[active]?.length
    ? [...ORDER[active]!.filter(b => dimSlices.some(s => s.bucket === b)), ...dimSlices.map(s => s.bucket).filter(b => !ORDER[active]!.includes(b))]
    : dimSlices.map(s => s.bucket).sort();

  // Top parties by total seats in this dimension
  const partyTotals: Record<string, number> = {};
  for (const s of dimSlices) {
    for (const [partyId, n] of Object.entries(s.seatsByParty)) {
      partyTotals[partyId] = (partyTotals[partyId] ?? 0) + n;
    }
  }
  const topParties = Object.entries(partyTotals).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([partyId]) => partyId);

  const data = ordered.map(bucket => {
    const slice = dimSlices.find(s => s.bucket === bucket);
    const row: Record<string, number | string> = { bucket };
    for (const pid of topParties) {
      row[pid] = slice?.seatsByParty?.[pid] ?? 0;
    }
    return row;
  });

  return (
    <section id="demographics" className="border-t border-white/10 px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-white">Demographic slices</h2>
          <div className="flex flex-wrap gap-1.5">
            {dimensions.map(d => (
              <button
                key={d}
                onClick={() => setActive(d)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${active === d ? 'bg-blue-600 text-white' : 'bg-white/10 text-gray-400 hover:text-white'}`}
              >
                {DIMENSION_LABELS[d]}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
              <XAxis dataKey="bucket" tick={{ fill: '#94a3b8', fontSize: 11 }} angle={-12} textAnchor="end" interval={0} height={60} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              {topParties.map(partyId => (
                <Bar
                  key={partyId}
                  dataKey={partyId}
                  stackId="seats"
                  fill={partyById[partyId]?.color ?? '#64748b'}
                  name={partyById[partyId]?.abbreviation ?? partyId}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

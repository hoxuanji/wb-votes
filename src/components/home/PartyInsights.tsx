'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { StateLiveSummary } from '@/lib/live-store';
import { parties } from '@/data/parties';

const partyById = Object.fromEntries(parties.map((p) => [p.id, p]));

interface Props { summary: StateLiveSummary; }

type Slice = { partyId: string; label: string; value: number; color: string };

function toSlices(rec: Record<string, number> | undefined, total: number): Slice[] {
  if (!rec) return [];
  const entries = Object.entries(rec).sort((a, b) => b[1] - a[1]);
  // Collapse anything under 2% into an "Others" bucket so the pie is readable.
  const main: Slice[] = [];
  let otherValue = 0;
  for (const [partyId, value] of entries) {
    const party = partyById[partyId];
    const pct = total > 0 ? (value / total) * 100 : 0;
    if (pct < 2 && main.length >= 4) {
      otherValue += value;
      continue;
    }
    main.push({
      partyId,
      label: party?.abbreviation ?? partyId,
      value,
      color: party?.color ?? '#64748b',
    });
  }
  if (otherValue > 0) {
    main.push({ partyId: '__OTHER__', label: 'Others', value: otherValue, color: '#475569' });
  }
  return main;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-IN');
}

function ChartCard({ title, subtitle, slices, total, valueLabel }: {
  title: string;
  subtitle: string;
  slices: Slice[];
  total: number;
  valueLabel: (s: Slice) => string;
}) {
  if (slices.length === 0 || total === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h3 className="text-sm font-bold text-white">{title}</h3>
        <p className="mt-1 text-[11px] text-gray-500">{subtitle}</p>
        <div className="mt-6 flex h-48 items-center justify-center text-xs text-gray-500">
          Waiting for counting data…
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <h3 className="text-sm font-bold text-white">{title}</h3>
      <p className="mt-1 text-[11px] text-gray-500">{subtitle}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_minmax(0,1.2fr)]">
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="label"
                innerRadius={40}
                outerRadius={75}
                paddingAngle={1}
                strokeWidth={0}
              >
                {slices.map((s) => <Cell key={s.partyId} fill={s.color} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number, _n, ctx) => {
                  const pct = total > 0 ? ((v / total) * 100).toFixed(1) : '0';
                  return [`${formatNumber(v)} (${pct}%)`, ctx.payload.label];
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="space-y-1.5 text-xs">
          {slices.map((s) => {
            const pct = total > 0 ? (s.value / total) * 100 : 0;
            return (
              <li key={s.partyId} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
                <span className="flex-1 truncate font-medium text-white">{s.label}</span>
                <span className="tabular-nums text-gray-400">{valueLabel(s)}</span>
                <span className="w-12 text-right tabular-nums text-gray-500">{pct.toFixed(1)}%</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function PartyInsights({ summary }: Props) {
  const seatTotal = Object.values(summary.leadingByParty).reduce((a, b) => a + b, 0);
  const voteTotal = Object.values(summary.votesByParty ?? {}).reduce((a, b) => a + b, 0);
  const seatSlices = toSlices(summary.leadingByParty, seatTotal);
  const voteSlices = toSlices(summary.votesByParty, voteTotal);

  if (seatTotal === 0 && voteTotal === 0) return null;

  return (
    <section className="border-b border-white/10 px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-400">Party insights</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="Seats leading"
            subtitle={`${seatTotal} of ${summary.totalACs} ACs reporting`}
            slices={seatSlices}
            total={seatTotal}
            valueLabel={(s) => formatNumber(s.value)}
          />
          <ChartCard
            title="Live vote share"
            subtitle="Leader + trailer votes only (lower bound; live)"
            slices={voteSlices}
            total={voteTotal}
            valueLabel={(s) => formatNumber(s.value)}
          />
        </div>
      </div>
    </section>
  );
}

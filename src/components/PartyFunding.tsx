import { partyFundingData, fundingDisclaimer } from '@/data/party-funding';
import { Info } from 'lucide-react';

function formatCr(amount: number): string {
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K Cr`;
  return `₹${amount} Cr`;
}

export function PartyFunding() {
  const total = partyFundingData.reduce((s, p) => s + p.totalContributions, 0);
  const sorted = [...partyFundingData].sort((a, b) => b.totalContributions - a.totalContributions);
  const maxVal = sorted[0]?.totalContributions ?? 1;

  return (
    <section className="border-t border-white/10 px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-1 flex items-center gap-2">
          <h2 className="text-xl font-bold text-white">Party Declared Contributions</h2>
        </div>
        <p className="mb-6 text-sm text-gray-400">
          Based on ECI Annual Audit Reports (2022-23). National totals — not WB-specific.
        </p>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Bar chart */}
          <div className="space-y-4">
            {sorted.map(p => {
              const pct = (p.totalContributions / maxVal) * 100;
              const share = ((p.totalContributions / total) * 100).toFixed(1);
              return (
                <div key={p.partyId}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-semibold text-gray-300">{p.abbreviation}</span>
                    <span className="text-gray-400">
                      {formatCr(p.totalContributions)}
                      <span className="ml-2 text-[11px] text-gray-500">({share}%)</span>
                    </span>
                  </div>
                  <div className="h-6 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${Math.max(6, pct)}%`, backgroundColor: p.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Donut SVG */}
          <div className="flex flex-col items-center justify-center">
            <DonutChart data={sorted} total={total} />
            <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
              {sorted.map(p => (
                <div key={p.partyId} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                  <span className="text-xs text-gray-400">{p.abbreviation}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-6 flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <Info className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
          <p className="text-xs text-amber-300">{fundingDisclaimer}</p>
        </div>
      </div>
    </section>
  );
}

function DonutChart({ data, total }: { data: typeof partyFundingData; total: number }) {
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const r = 65;
  const innerR = 38;

  let angle = -90;
  const slices = data.map(p => {
    const sweep = (p.totalContributions / total) * 360;
    const start = angle;
    angle += sweep;
    return { ...p, start, sweep };
  });

  function polarToXY(deg: number, radius: number) {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }

  function describeArc(startDeg: number, sweep: number) {
    if (sweep >= 360) sweep = 359.99;
    const start = polarToXY(startDeg, r);
    const end = polarToXY(startDeg + sweep, r);
    const iStart = polarToXY(startDeg, innerR);
    const iEnd = polarToXY(startDeg + sweep, innerR);
    const large = sweep > 180 ? 1 : 0;
    return [
      `M ${start.x} ${start.y}`,
      `A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`,
      `L ${iEnd.x} ${iEnd.y}`,
      `A ${innerR} ${innerR} 0 ${large} 0 ${iStart.x} ${iStart.y}`,
      'Z',
    ].join(' ');
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices.map(s => (
        <path key={s.partyId} d={describeArc(s.start, s.sweep)} fill={s.color} stroke="#0f172a" strokeWidth="2" />
      ))}
      <text x={cx} y={cy - 6} textAnchor="middle" className="text-xs" fontSize="11" fill="#d1d5db" fontWeight="600">Total</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize="10" fill="#9ca3af">₹{total} Cr</text>
    </svg>
  );
}

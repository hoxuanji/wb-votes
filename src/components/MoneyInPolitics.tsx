import Link from 'next/link';
import Image from 'next/image';
import { DollarSign, AlertTriangle, TrendingUp, Info } from 'lucide-react';
import { candidates } from '@/data/candidates';
import { parties } from '@/data/parties';
import { partyFundingData } from '@/data/party-funding';
import { formatCurrency } from '@/lib/utils';

const partyMap = Object.fromEntries(parties.map(p => [p.id, p]));

const MAJOR_PARTIES = [
  { id: 'AITC',   label: 'TMC',    color: '#1B5E20' },
  { id: 'BJP',    label: 'BJP',    color: '#E65100' },
  { id: 'CPI(M)', label: 'CPM',    color: '#B71C1C' },
  { id: 'INC',    label: 'INC',    color: '#1565C0' },
];

function formatCr(n: number) {
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K Cr`;
  if (n > 0) return `₹${n} Cr`;
  return '₹0';
}

interface PartyStats {
  id: string;
  label: string;
  color: string;
  total: number;
  withCases: number;
  caseRate: number;
  avgAssets: number;
  richest: typeof candidates[number] | undefined;
  electoralBonds: number;
}

function computePartyStats(): PartyStats[] {
  return MAJOR_PARTIES.map(({ id, label, color }) => {
    const pool = candidates.filter(c => c.partyId === id);
    const withCases = pool.filter(c => c.criminalCases > 0).length;
    const withAssets = pool.filter(c => c.totalAssets > 0);
    const avgAssets = withAssets.length > 0
      ? withAssets.reduce((s, c) => s + c.totalAssets, 0) / withAssets.length
      : 0;
    const richest = [...pool].sort((a, b) => b.totalAssets - a.totalAssets)[0];
    const fundingRow = partyFundingData.find(p => p.partyId === id);

    return {
      id, label, color,
      total: pool.length,
      withCases,
      caseRate: pool.length > 0 ? (withCases / pool.length) * 100 : 0,
      avgAssets,
      richest,
      electoralBonds: fundingRow?.electoralBonds ?? 0,
    };
  });
}

function computeRichAndCriminal() {
  return [...candidates]
    .filter(c => c.criminalCases > 0 && c.totalAssets > 0 && MAJOR_PARTIES.some(p => p.id === c.partyId))
    .sort((a, b) => b.totalAssets - a.totalAssets)
    .slice(0, 5);
}

const partyStats = computePartyStats();
const richAndCriminal = computeRichAndCriminal();
const maxBonds = Math.max(...partyStats.map(p => p.electoralBonds), 1);
const maxCaseRate = Math.max(...partyStats.map(p => p.caseRate), 1);
const maxAvgAssets = Math.max(...partyStats.map(p => p.avgAssets), 1);
const totalBonds = partyFundingData.reduce((s, p) => s + p.electoralBonds, 0);

export function MoneyInPolitics() {
  return (
    <section className="border-t border-gray-100 px-4 py-10">
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <div className="mb-1 flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-red-500" />
          <h2 className="text-xl font-bold text-gray-900">Money &amp; Power in Bengal Politics</h2>
        </div>
        <p className="mb-8 text-sm text-gray-500">
          Electoral bond receipts (ECI/Supreme Court data) + declared assets &amp; criminal cases from candidate affidavits
        </p>

        {/* ── 3-panel grid ─────────────────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-3">

          {/* Panel 1: Electoral Bonds */}
          <div className="rounded-2xl border border-red-100 bg-red-50 p-5">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-red-500">Electoral Bonds Received</p>
            <p className="mb-4 text-xs text-gray-500">Anonymous corporate bonds 2018–2024 · Total ₹{totalBonds.toLocaleString()} Cr</p>
            <div className="space-y-3">
              {partyStats.map(p => {
                const pct = (p.electoralBonds / maxBonds) * 100;
                const share = totalBonds > 0 ? ((p.electoralBonds / totalBonds) * 100).toFixed(0) : '0';
                return (
                  <div key={p.id}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-semibold" style={{ color: p.color }}>{p.label}</span>
                      <span className="text-gray-600">
                        {formatCr(p.electoralBonds)}
                        {p.electoralBonds > 0 && <span className="ml-1 text-[10px] text-gray-400">({share}%)</span>}
                      </span>
                    </div>
                    <div className="h-5 overflow-hidden rounded-full bg-white/70 shadow-inner">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(p.electoralBonds > 0 ? 6 : 0, pct)}%`, backgroundColor: p.color, opacity: 0.85 }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex gap-1.5 rounded-lg border border-red-200 bg-white/60 p-2.5">
              <Info className="h-3.5 w-3.5 shrink-0 text-red-400 mt-0.5" />
              <p className="text-[10px] leading-relaxed text-red-600">
                Electoral bonds were anonymous — donors and amounts were secret until the Supreme Court ordered disclosure in 2024.
              </p>
            </div>
          </div>

          {/* Panel 2: Criminal Cases Rate */}
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-amber-600">Candidates with Criminal Cases</p>
            <p className="mb-4 text-xs text-gray-500">% of party&apos;s WB 2026 candidates with pending cases</p>
            <div className="space-y-3">
              {partyStats.map(p => (
                <div key={p.id}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-semibold" style={{ color: p.color }}>{p.label}</span>
                    <span className="text-gray-600">
                      {p.withCases} of {p.total}
                      <span className="ml-1 text-[10px] text-gray-400">({p.caseRate.toFixed(0)}%)</span>
                    </span>
                  </div>
                  <div className="h-5 overflow-hidden rounded-full bg-white/70 shadow-inner">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(6, (p.caseRate / maxCaseRate) * 100)}%`, backgroundColor: p.color, opacity: 0.85 }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-1.5 rounded-lg border border-amber-200 bg-white/60 p-2.5">
              <Info className="h-3.5 w-3.5 shrink-0 text-amber-500 mt-0.5" />
              <p className="text-[10px] leading-relaxed text-amber-700">
                Based on self-declared affidavits submitted to ECI. Includes all pending cases, not just convictions.
              </p>
            </div>
          </div>

          {/* Panel 3: Average Declared Assets */}
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-600">Average Declared Assets</p>
            <p className="mb-4 text-xs text-gray-500">Mean declared wealth per candidate by party</p>
            <div className="space-y-3">
              {partyStats.map(p => (
                <div key={p.id}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-semibold" style={{ color: p.color }}>{p.label}</span>
                    <span className="text-gray-600">{formatCurrency(p.avgAssets)}</span>
                  </div>
                  <div className="h-5 overflow-hidden rounded-full bg-white/70 shadow-inner">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(6, (p.avgAssets / maxAvgAssets) * 100)}%`, backgroundColor: p.color, opacity: 0.85 }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-1.5 rounded-lg border border-emerald-200 bg-white/60 p-2.5">
              <Info className="h-3.5 w-3.5 shrink-0 text-emerald-500 mt-0.5" />
              <p className="text-[10px] leading-relaxed text-emerald-700">
                Self-declared in ECI affidavits. Actual wealth is often underreported.
              </p>
            </div>
          </div>
        </div>

        {/* ── Rich & Criminal ──────────────────────────────────── */}
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <p className="text-sm font-bold text-gray-900">Wealthiest Candidates with Pending Criminal Cases</p>
            <span className="ml-auto text-[11px] text-gray-400">Major parties only · Sorted by declared assets</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  <th className="pb-2 text-left">Candidate</th>
                  <th className="pb-2 text-left">Party</th>
                  <th className="pb-2 text-right">Declared Assets</th>
                  <th className="pb-2 text-right">Cases</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {richAndCriminal.map(c => {
                  const party = partyMap[c.partyId];
                  return (
                    <tr key={c.id} className="group hover:bg-gray-50">
                      <td className="py-2.5 pr-4">
                        <Link href={`/candidate/${c.id}`} className="flex items-center gap-2.5 group-hover:text-blue-700">
                          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-gray-200">
                            {c.photoUrl ? (
                              <Image src={c.photoUrl} alt={c.name} fill className="object-cover" sizes="32px" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: party?.color ?? '#64748b' }}>
                                {c.name.charAt(0)}
                              </div>
                            )}
                          </div>
                          <span className="font-medium text-gray-900 group-hover:text-blue-700">{c.name}</span>
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: party?.color ?? '#64748b' }}>
                          {party?.abbreviation ?? c.partyId}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-right font-semibold text-emerald-700">
                        {formatCurrency(c.totalAssets)}
                      </td>
                      <td className="py-2.5 text-right">
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
                          <AlertTriangle className="h-2.5 w-2.5" /> {c.criminalCases}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] italic text-gray-400">
            Data from ECI affidavits. &apos;Cases&apos; = self-declared pending criminal cases, not convictions.
          </p>
        </div>

      </div>
    </section>
  );
}

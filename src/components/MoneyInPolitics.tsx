import Link from 'next/link';
import Image from 'next/image';
import { AlertTriangle, Info, CheckCircle, XCircle, MinusCircle } from 'lucide-react';
import { candidates } from '@/data/candidates';
import { parties } from '@/data/parties';
import { partyFundingData } from '@/data/party-funding';
import { partyContext, type PartyContextEntry } from '@/data/party-context';
import { formatCurrency } from '@/lib/utils';

const partyMap = Object.fromEntries(parties.map(p => [p.id, p]));

const MAJOR_IDS = ['AITC', 'BJP', 'CPI(M)', 'INC'];

function formatCr(n: number) {
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K Cr`;
  if (n > 0) return `₹${n} Cr`;
  return '₹0 (refused)';
}

interface PartyProfile {
  id: string;
  color: string;
  abbreviation: string;
  fullName: string;
  wbPresence: string;
  distinctiveFact: string;
  distinctiveFactType: 'positive' | 'negative' | 'neutral';
  notableIssues: PartyContextEntry['notableIssues'];
  // national funding
  electoralBonds: number;
  directDonations: number;
  // WB 2026 candidates
  total: number;
  withCases: number;
  caseRate: number;
  avgAssets: number;
}

function buildProfiles(): PartyProfile[] {
  return MAJOR_IDS.map(id => {
    const party = partyMap[id];
    const ctx = partyContext.find(p => p.partyId === id)!;
    const funding = partyFundingData.find(p => p.partyId === id);
    const pool = candidates.filter(c => c.partyId === id);
    const withCases = pool.filter(c => c.criminalCases > 0).length;
    const withAssets = pool.filter(c => c.totalAssets > 0);
    const avgAssets = withAssets.length > 0
      ? withAssets.reduce((s, c) => s + c.totalAssets, 0) / withAssets.length : 0;

    return {
      id,
      color: party?.color ?? '#64748b',
      abbreviation: party?.abbreviation ?? id,
      fullName: ctx.fullName,
      wbPresence: ctx.wbPresence,
      distinctiveFact: ctx.distinctiveFact,
      distinctiveFactType: ctx.distinctiveFactType,
      notableIssues: ctx.notableIssues,
      electoralBonds: funding?.electoralBonds ?? 0,
      directDonations: funding?.directDonations ?? 0,
      total: pool.length,
      withCases,
      caseRate: pool.length > 0 ? (withCases / pool.length) * 100 : 0,
      avgAssets,
    };
  });
}

function computeRichAndCriminal() {
  return [...candidates]
    .filter(c => c.criminalCases > 0 && c.totalAssets > 0 && MAJOR_IDS.includes(c.partyId))
    .sort((a, b) => b.totalAssets - a.totalAssets)
    .slice(0, 6);
}

const profiles = buildProfiles();
const richAndCriminal = computeRichAndCriminal();
const maxBonds = Math.max(...profiles.map(p => p.electoralBonds), 1);

export function MoneyInPolitics() {
  return (
    <section className="border-t border-white/10 px-4 py-10">
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <div className="mb-1 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
          <h2 className="text-xl font-bold text-white">Party Track Records: Funding &amp; Accountability</h2>
        </div>
        <p className="mb-8 text-sm text-gray-400">
          National electoral bonds data (Supreme Court-disclosed, 2018–2024) · ECI audit reports · ADR candidate analysis · WB 2026 affidavits
        </p>

        {/* ── Party Profile Cards ───────────────────────────────── */}
        <div className="grid gap-5 sm:grid-cols-2">
          {profiles.map(p => (
            <div key={p.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm shadow-lg shadow-black/20">
              {/* Party header */}
              <div className="flex items-center gap-3 px-5 py-4" style={{ backgroundColor: p.color + '30', borderBottom: `2px solid ${p.color}50` }}>
                <div className="h-10 w-10 rounded-full border-2 border-white/20 shadow-sm flex items-center justify-center font-extrabold text-sm text-white" style={{ backgroundColor: p.color }}>
                  {p.abbreviation.slice(0, 3)}
                </div>
                <div>
                  <p className="font-bold text-white">{p.fullName}</p>
                  <p className="text-[11px] text-gray-400">{p.wbPresence}</p>
                </div>
              </div>

              <div className="p-5 space-y-4">

                {/* Distinctive Fact */}
                <div className={`flex gap-2 rounded-xl p-3 ${
                  p.distinctiveFactType === 'positive' ? 'bg-green-500/10 border border-green-500/20' :
                  p.distinctiveFactType === 'negative' ? 'bg-red-500/10 border border-red-500/20' :
                  'bg-white/5 border border-white/10'
                }`}>
                  {p.distinctiveFactType === 'positive'
                    ? <CheckCircle className="h-4 w-4 shrink-0 text-green-400 mt-0.5" />
                    : p.distinctiveFactType === 'negative'
                    ? <XCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                    : <MinusCircle className="h-4 w-4 shrink-0 text-gray-500 mt-0.5" />
                  }
                  <p className="text-xs leading-relaxed text-gray-300">{p.distinctiveFact}</p>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-white/5 p-3 text-center">
                    <p className="text-base font-extrabold text-gray-200">{formatCr(p.electoralBonds)}</p>
                    <p className="mt-0.5 text-[10px] text-gray-400">Electoral Bonds</p>
                    <p className="text-[9px] text-gray-500">national 2018–24</p>
                  </div>
                  <div className="rounded-xl bg-white/5 p-3 text-center">
                    <p className="text-base font-extrabold" style={{ color: p.caseRate > 30 ? '#f87171' : '#d1d5db' }}>
                      {p.caseRate.toFixed(0)}%
                    </p>
                    <p className="mt-0.5 text-[10px] text-gray-400">With Cases</p>
                    <p className="text-[9px] text-gray-500">WB 2026 candidates</p>
                  </div>
                  <div className="rounded-xl bg-white/5 p-3 text-center">
                    <p className="text-base font-extrabold text-emerald-400">{formatCurrency(p.avgAssets)}</p>
                    <p className="mt-0.5 text-[10px] text-gray-400">Avg Assets</p>
                    <p className="text-[9px] text-gray-500">WB 2026 declared</p>
                  </div>
                </div>

                {/* Electoral bonds bar */}
                {p.electoralBonds > 0 && (
                  <div>
                    <div className="mb-1 flex justify-between text-[10px] text-gray-500">
                      <span>Share of disclosed electoral bonds</span>
                      <span style={{ color: p.color }}>{formatCr(p.electoralBonds)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(p.electoralBonds / maxBonds) * 100}%`, backgroundColor: p.color }}
                      />
                    </div>
                  </div>
                )}

                {/* Notable Issues */}
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Notable Issues (Public Record)</p>
                  <div className="space-y-2">
                    {p.notableIssues.map(issue => (
                      <div key={issue.title} className="flex gap-2">
                        <span className="mt-0.5 shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-gray-400">{issue.year}</span>
                        <div>
                          <p className="text-xs font-semibold text-gray-200">{issue.title}</p>
                          <p className="text-[11px] leading-relaxed text-gray-400">{issue.summary}</p>
                          {issue.leaders && issue.leaders.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {issue.leaders.map(name => (
                                <span key={name} className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-gray-400">
                                  {name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          ))}
        </div>

        {/* ── CPI(M) bonds note ────────────────────────────────── */}
        <div className="mt-4 flex gap-2 rounded-xl border border-green-500/30 bg-green-500/10 p-3">
          <CheckCircle className="h-4 w-4 shrink-0 text-green-400 mt-0.5" />
          <p className="text-xs text-green-300">
            <strong>Why does CPI(M) show ₹0 electoral bonds?</strong> This is correct and intentional — CPI(M) officially opposed the electoral bond scheme and accepted zero anonymous corporate funding. This stands in contrast to BJP (₹6,061 Cr), TMC (₹1,610 Cr), and INC (₹1,123 Cr).
          </p>
        </div>

        {/* ── Rich & Criminal candidates ───────────────────────── */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <p className="text-sm font-bold text-white">Wealthiest WB 2026 Candidates with Pending Criminal Cases</p>
            <span className="ml-auto text-[11px] text-gray-500">Major parties · Sorted by declared assets</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  <th className="pb-2 text-left">Candidate</th>
                  <th className="pb-2 text-left">Party</th>
                  <th className="pb-2 text-right">Declared Assets</th>
                  <th className="pb-2 text-right">Pending Cases</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {richAndCriminal.map(c => {
                  const party = partyMap[c.partyId];
                  return (
                    <tr key={c.id} className="group hover:bg-white/5">
                      <td className="py-2.5 pr-4">
                        <Link href={`/candidate/${c.id}`} className="flex items-center gap-2.5">
                          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-white/15">
                            {c.photoUrl ? (
                              <Image src={c.photoUrl} alt={c.name} fill className="object-cover" sizes="32px" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: party?.color ?? '#64748b' }}>
                                {c.name.charAt(0)}
                              </div>
                            )}
                          </div>
                          <span className="font-medium text-gray-200 group-hover:text-blue-300">{c.name}</span>
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: party?.color ?? '#64748b' }}>
                          {party?.abbreviation ?? c.partyId}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-right font-semibold text-emerald-400">
                        {formatCurrency(c.totalAssets)}
                      </td>
                      <td className="py-2.5 text-right">
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] font-bold text-red-400">
                          <AlertTriangle className="h-2.5 w-2.5" /> {c.criminalCases}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex gap-1.5 rounded-lg border border-white/10 bg-white/5 p-2">
            <Info className="h-3.5 w-3.5 shrink-0 text-gray-500 mt-0.5" />
            <p className="text-[10px] italic text-gray-500">
              All data from self-declared ECI affidavits. &apos;Pending cases&apos; are not convictions. Electoral bond data from SBI disclosure ordered by the Supreme Court (Feb 2024).
            </p>
          </div>
        </div>

      </div>
    </section>
  );
}

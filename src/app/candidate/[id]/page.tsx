import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft, AlertTriangle, TrendingUp,
  ExternalLink, MapPin, GitCompare, Award, Users,
  BarChart2, Scale, GraduationCap, Briefcase,
} from 'lucide-react';
import { getCandidateById, candidates } from '@/data/candidates';
import { getConstituencyById } from '@/data/constituencies';
import { getPartyById } from '@/data/parties';
import { getPartyManifestoOrDefault, policyDimensions } from '@/data/party-stances';
import { Badge } from '@/components/ui/Badge';
import { CandidateNews } from '@/components/CandidateNews';
import { PartySymbol } from '@/components/ui/PartySymbol';
import { formatCurrency } from '@/lib/utils';
import type { PageProps } from '@/types';

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const candidate = getCandidateById(params.id);
  if (!candidate) return {};
  const party = getPartyById(candidate.partyId);
  const constituency = getConstituencyById(candidate.constituencyId);
  return {
    title: `${candidate.name} — ${party?.abbreviation ?? 'IND'} — ${constituency?.name ?? 'WB'} 2026`,
    description: `${candidate.name} (${party?.name ?? 'Independent'}) is contesting from ${constituency?.name ?? 'West Bengal'} in the 2026 Assembly Election. View criminal cases (${candidate.criminalCases}), declared assets, and education.`,
    openGraph: {
      title: `${candidate.name} — ${party?.abbreviation ?? 'IND'} — WB Votes 2026`,
      description: `Criminal cases: ${candidate.criminalCases} · Assets: declared in ECI affidavit · Education: ${candidate.education}`,
    },
  };
}

export default function CandidatePage({ params }: PageProps) {
  const candidate = getCandidateById(params.id);
  if (!candidate) notFound();

  const party = getPartyById(candidate.partyId) ?? {
    id: 'IND', name: 'Independent', nameBn: 'নির্দল', abbreviation: 'IND', color: '#546E7A', isNational: false,
  };
  const constituency = getConstituencyById(candidate.constituencyId);
  const netAssets = candidate.totalAssets - candidate.totalLiabilities;

  // ── Comparative stats ────────────────────────────────────────
  const constCandidates = candidates.filter(c => c.constituencyId === candidate.constituencyId);
  const constWithAssets = constCandidates.filter(c => c.totalAssets > 0);
  const stateWithAssets = candidates.filter(c => c.totalAssets > 0);

  const constMedianAssets = median(constWithAssets.map(c => c.totalAssets));
  const stateMedianAssets = median(stateWithAssets.map(c => c.totalAssets));

  const wealthRankInConst = candidate.totalAssets > 0
    ? [...constCandidates].sort((a, b) => b.totalAssets - a.totalAssets).findIndex(c => c.id === candidate.id) + 1
    : null;
  const stateRank = candidate.totalAssets > 0
    ? [...stateWithAssets].sort((a, b) => b.totalAssets - a.totalAssets).findIndex(c => c.id === candidate.id) + 1
    : null;
  const statePercentile = stateRank != null ? Math.round((1 - stateRank / stateWithAssets.length) * 100) : null;

  const constAvgCriminal = constCandidates.length
    ? Math.round((constCandidates.reduce((s, c) => s + c.criminalCases, 0) / constCandidates.length) * 10) / 10
    : 0;

  // IPC section chips
  const ipcSections = candidate.criminalCasesDetail
    ? candidate.criminalCasesDetail.split(/[,/;]+/).map(s => s.trim()).filter(Boolean)
    : [];

  // Asset bar widths (relative to state max for display)
  const stateMax = stateWithAssets.length ? Math.max(...stateWithAssets.map(c => c.totalAssets)) : 1;
  const assetBarPct = (v: number) => Math.min(100, Math.round((v / stateMax) * 100));

  // JSON-LD
  const personSchema = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: candidate.name,
    description: `${candidate.name} is a ${party.name} candidate contesting from ${constituency?.name ?? 'West Bengal'} in the 2026 West Bengal Assembly Election.`,
    affiliation: { '@type': 'Organization', name: party.name },
    ...(candidate.age > 0 && { age: candidate.age }),
    ...(candidate.affidavitUrl && { url: candidate.affidavitUrl }),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }} />
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-1 text-sm text-gray-400">
        <Link href="/" className="text-blue-400 hover:underline">Home</Link>
        <span>/</span>
        {constituency && (
          <>
            <Link href={`/constituency/${constituency.id}`} className="text-blue-400 hover:underline">
              {constituency.name}
            </Link>
            <span>/</span>
          </>
        )}
        <span className="text-gray-300">{candidate.name}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Profile sidebar */}
        <div className="lg:col-span-1">
          <div className="sticky top-20 space-y-4">
            {/* Profile card */}
            <div className="rounded-xl border border-white/10 bg-white/5 shadow-sm overflow-hidden">
              <div className="h-2 w-full" style={{ backgroundColor: party.color }} />
              <div className="p-5">
                <div className="mx-auto mb-4 relative h-28 w-28 overflow-hidden rounded-full border-4 border-white/15 shadow">
                  {candidate.photoUrl ? (
                    <Image src={candidate.photoUrl} alt={candidate.name} fill className="object-cover" sizes="112px" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-4xl font-bold text-white" style={{ backgroundColor: party.color }}>
                      {candidate.name.charAt(0)}
                    </div>
                  )}
                </div>

                <h1 className="text-center text-lg font-bold text-white">{candidate.name}</h1>
                {candidate.nameBn && (
                  <p className="text-center text-sm text-gray-400">{candidate.nameBn}</p>
                )}

                <div className="mt-3 flex justify-center">
                  <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white" style={{ backgroundColor: party.color }}>
                    <PartySymbol party={party} size={16} />
                    {party.abbreviation} · {party.name}
                  </span>
                </div>

                {candidate.isIncumbent && (
                  <div className="mt-2 text-center">
                    <Badge variant="neutral">Incumbent MLA · {candidate.incumbentYears}y</Badge>
                  </div>
                )}

                {constituency && (
                  <div className="mt-3 flex items-center justify-center gap-1 text-xs text-gray-400">
                    <MapPin className="h-3.5 w-3.5" />
                    <Link href={`/constituency/${constituency.id}`} className="hover:text-blue-400 hover:underline">
                      {constituency.name}, {constituency.district}
                    </Link>
                  </div>
                )}

                {/* Quick facts chips */}
                <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                  <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-gray-300">{candidate.age} yrs</span>
                  <span className="rounded-full bg-blue-500/15 px-2.5 py-1 text-[11px] font-medium text-blue-300">{candidate.education}</span>
                  {candidate.occupation && (
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-gray-300">{candidate.occupation}</span>
                  )}
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  {constituency && (
                    <Link
                      href={`/compare?ids=${getCandidatesByConstituencyForLink(candidate.constituencyId)}`}
                      className="flex items-center justify-center gap-2 rounded-lg border border-white/10 py-2 text-xs font-medium text-gray-400 hover:border-blue-500/40 hover:bg-blue-500/10 hover:text-blue-300 transition-colors"
                    >
                      <GitCompare className="h-3.5 w-3.5" /> Compare with others
                    </Link>
                  )}
                  {candidate.affidavitUrl && (
                    <a
                      href={candidate.affidavitUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 rounded-lg bg-white/5 border border-white/10 py-2 text-xs font-medium text-gray-400 hover:bg-white/10 transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> View Affidavit (ECI)
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Constituency context card */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-gray-500" />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">In {constituency?.name ?? 'Constituency'}</span>
              </div>
              <div className="space-y-2 text-xs">
                {wealthRankInConst != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Wealth rank</span>
                    <span className="font-semibold text-gray-200">#{wealthRankInConst} of {constCandidates.length}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Avg criminal cases</span>
                  <span className={`font-semibold ${constAvgCriminal > 1 ? 'text-amber-400' : 'text-gray-200'}`}>{constAvgCriminal}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Total candidates</span>
                  <span className="font-semibold text-gray-200">{constCandidates.length}</span>
                </div>
                {statePercentile != null && (
                  <div className="flex items-center justify-between border-t border-white/5 pt-2 mt-2">
                    <span className="text-gray-500">State wealth rank</span>
                    <span className="font-semibold text-blue-400">Top {100 - statePercentile}%</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Detail sections */}
        <div className="lg:col-span-2 space-y-5">

          {/* Criminal cases */}
          <section className="rounded-xl border bg-white/5 shadow-sm overflow-hidden" style={{
            borderColor: candidate.criminalCases > 2 ? '#f87171' : candidate.criminalCases > 0 ? '#fbbf24' : '#4ade80',
          }}>
            <div className="px-5 py-3 border-b flex items-center justify-between" style={{
              backgroundColor: candidate.criminalCases > 2 ? 'rgba(239,68,68,0.1)' : candidate.criminalCases > 0 ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)',
              borderColor: candidate.criminalCases > 2 ? '#f87171' : candidate.criminalCases > 0 ? '#fbbf24' : '#4ade80',
            }}>
              <div className="flex items-center gap-2">
                <AlertTriangle className={`h-4 w-4 ${candidate.criminalCases > 2 ? 'text-red-400' : candidate.criminalCases > 0 ? 'text-amber-400' : 'text-green-400'}`} />
                <h2 className="text-sm font-semibold" style={{ color: candidate.criminalCases > 2 ? '#f87171' : candidate.criminalCases > 0 ? '#fbbf24' : '#4ade80' }}>
                  Criminal Cases
                </h2>
              </div>
              <span className="text-xs text-gray-500">Constituency avg: {constAvgCriminal}</span>
            </div>
            <div className="px-5 py-4">
              {candidate.criminalCases === 0 ? (
                <div className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-green-400" />
                  <p className="text-sm font-medium text-green-300">No pending criminal cases declared in affidavit.</p>
                </div>
              ) : (
                <>
                  <p className="text-sm font-semibold" style={{ color: candidate.criminalCases > 2 ? '#f87171' : '#fbbf24' }}>
                    {candidate.criminalCases} pending case{candidate.criminalCases > 1 ? 's' : ''}
                  </p>
                  {ipcSections.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-2 text-xs font-medium text-gray-500">IPC / Act Sections declared:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {ipcSections.map((s, i) => (
                          <span key={i} className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-[11px] font-medium text-red-400">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="mt-3 text-xs text-gray-500">Source: Self-declared in ECI affidavit. Cases are presumed pending until court verdict.</p>
                </>
              )}
            </div>
          </section>

          {/* Assets & Liabilities */}
          <section className="rounded-xl border border-white/10 bg-white/5 shadow-sm">
            <div className="border-b border-white/5 px-5 py-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-300">Assets &amp; Liabilities</h2>
                <p className="text-xs text-gray-500">Self-declared in ECI affidavit</p>
              </div>
              {statePercentile != null && (
                <span className="rounded-full bg-blue-500/15 px-2.5 py-1 text-[11px] font-semibold text-blue-300">
                  Wealthier than {statePercentile}% of candidates
                </span>
              )}
            </div>
            <div className="px-5 py-4">
              {candidate.totalAssets === 0 && candidate.totalLiabilities === 0 ? (
                <div className="rounded-lg border border-dashed border-white/10 bg-white/5 py-6 text-center">
                  <p className="text-sm text-gray-500">Asset data not declared or not yet available</p>
                  {candidate.affidavitUrl && (
                    <a href={candidate.affidavitUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-blue-400 hover:underline">
                      View original affidavit →
                    </a>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4">
                    <div className="rounded-lg bg-green-500/10 p-3 text-center">
                      <p className="text-[11px] text-gray-500 mb-1">Total Assets</p>
                      <p className="text-sm font-bold text-green-400">{formatCurrency(candidate.totalAssets)}</p>
                    </div>
                    {candidate.movableAssets != null && candidate.movableAssets > 0 && (
                      <div className="rounded-lg bg-blue-500/10 p-3 text-center">
                        <p className="text-[11px] text-gray-500 mb-1">Movable</p>
                        <p className="text-sm font-bold text-blue-400">{formatCurrency(candidate.movableAssets)}</p>
                      </div>
                    )}
                    {candidate.immovableAssets != null && candidate.immovableAssets > 0 && (
                      <div className="rounded-lg bg-purple-500/10 p-3 text-center">
                        <p className="text-[11px] text-gray-500 mb-1">Immovable</p>
                        <p className="text-sm font-bold text-purple-400">{formatCurrency(candidate.immovableAssets)}</p>
                      </div>
                    )}
                    <div className="rounded-lg bg-red-500/10 p-3 text-center">
                      <p className="text-[11px] text-gray-500 mb-1">Liabilities</p>
                      <p className="text-sm font-bold text-red-400">{candidate.totalLiabilities > 0 ? formatCurrency(candidate.totalLiabilities) : 'None'}</p>
                    </div>
                  </div>

                  {candidate.totalAssets > 0 && (
                    <div className="rounded-lg border border-white/5 bg-white/5 p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Wealth comparison</p>
                      <div className="space-y-3">
                        {[
                          { label: 'This candidate', value: candidate.totalAssets, color: party.color },
                          { label: 'Constituency median', value: constMedianAssets, color: '#94a3b8' },
                          { label: 'State median', value: stateMedianAssets, color: '#475569' },
                        ].map(({ label, value, color }) => (
                          <div key={label}>
                            <div className="mb-1 flex items-center justify-between text-xs">
                              <span className="text-gray-400">{label}</span>
                              <span className="font-semibold text-gray-200">{formatCurrency(value)}</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                              <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(2, assetBarPct(value))}%`, backgroundColor: color }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                    <span className="text-sm font-medium text-gray-400">Net Assets</span>
                    <span className={`text-sm font-bold ${netAssets >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {netAssets >= 0 ? '+' : '-'}{formatCurrency(Math.abs(netAssets))}
                    </span>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Personal information */}
          <section className="rounded-xl border border-white/10 bg-white/5 shadow-sm">
            <div className="border-b border-white/5 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-300">Background</h2>
            </div>
            <div className="divide-y divide-white/5">
              <div className="flex items-center gap-3 px-5 py-3">
                <GraduationCap className="h-4 w-4 shrink-0 text-blue-400" />
                <span className="text-xs text-gray-500 w-28 shrink-0">Education</span>
                <span className="text-sm font-medium text-gray-200">{candidate.education}</span>
              </div>
              {candidate.occupation && (
                <div className="flex items-center gap-3 px-5 py-3">
                  <Briefcase className="h-4 w-4 shrink-0 text-indigo-400" />
                  <span className="text-xs text-gray-500 w-28 shrink-0">Occupation</span>
                  <span className="text-sm font-medium text-gray-200">{candidate.occupation}</span>
                </div>
              )}
              {candidate.spouseProfession && (
                <div className="flex items-center gap-3 px-5 py-3">
                  <Briefcase className="h-4 w-4 shrink-0 text-gray-500" />
                  <span className="text-xs text-gray-500 w-28 shrink-0">Spouse Occupation</span>
                  <span className="text-sm font-medium text-gray-200">{candidate.spouseProfession}</span>
                </div>
              )}
              <div className="flex items-center gap-3 px-5 py-3">
                <Scale className="h-4 w-4 shrink-0 text-gray-500" />
                <span className="text-xs text-gray-500 w-28 shrink-0">Incumbent</span>
                <span className="text-sm font-medium text-gray-200">
                  {candidate.isIncumbent ? `Yes — ${candidate.incumbentYears ?? '?'} years in office` : 'No'}
                </span>
              </div>
              <div className="flex items-center gap-3 px-5 py-3">
                <BarChart2 className="h-4 w-4 shrink-0 text-gray-500" />
                <span className="text-xs text-gray-500 w-28 shrink-0">Age</span>
                <span className="text-sm font-medium text-gray-200">{candidate.age} years</span>
              </div>
            </div>
          </section>

          <p className="text-xs text-gray-400">
            ⚠ All information on this page is sourced from self-declared ECI affidavits and publicly available datasets.
            WB Votes does not verify or endorse any individual claim.
          </p>

          {/* Party stance section */}
          {(() => {
            const manifesto = getPartyManifestoOrDefault(candidate.partyId);
            if (!manifesto) return null;
            return (
              <section className="rounded-xl border border-white/10 bg-white/5 shadow-sm overflow-hidden">
                <div className="border-b border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: party.color }} />
                    <h2 className="text-sm font-semibold text-gray-300">{party.abbreviation} — Policy Positions</h2>
                    {manifesto.placeholder && (
                      <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-medium text-amber-400">Limited data</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500 leading-relaxed">{manifesto.summary}</p>
                </div>
                <div className="px-5 py-4 space-y-5">
                  {policyDimensions.map(dim => {
                    const stance = manifesto.stances[dim.key];
                    if (!stance) return null;
                    const pct = ((stance.score + 2) / 4) * 100;
                    return (
                      <div key={dim.key}>
                        <span className="text-xs font-semibold text-gray-300">{dim.label}</span>
                        <div className="mt-2 flex items-center gap-3">
                          <span className="w-[88px] shrink-0 text-right text-[11px] font-medium text-gray-500 leading-tight">{dim.leftLabel}</span>
                          <div className="relative flex-1 h-3 rounded-full border border-white/10 bg-white/5 shadow-inner">
                            <div
                              className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-slate-950 shadow-md"
                              style={{ left: `calc(${pct}% - 8px)`, backgroundColor: manifesto.placeholder ? '#475569' : party.color }}
                            />
                          </div>
                          <span className="w-[88px] shrink-0 text-[11px] font-medium text-gray-500 leading-tight">{dim.rightLabel}</span>
                        </div>
                        {!manifesto.placeholder && (
                          <p className="mt-1.5 text-[10px] text-gray-500 leading-relaxed pl-[112px]">{stance.note}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-white/5 px-5 py-2.5">
                  <p className="text-[10px] text-gray-500">Party positions are editorial assessments based on official manifestos and governance history. They do not represent the individual candidate&apos;s views.</p>
                </div>
              </section>
            );
          })()}

          <CandidateNews name={candidate.name} />
        </div>
      </div>
    </div>
    </>
  );
}

function getCandidatesByConstituencyForLink(constituencyId: string): string {
  return candidates
    .filter((c) => c.constituencyId === constituencyId)
    .map((c) => c.id)
    .join(',');
}

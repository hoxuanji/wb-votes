import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft, BookOpen, Briefcase, AlertTriangle, TrendingUp, TrendingDown,
  ExternalLink, MapPin, GitCompare,
} from 'lucide-react';
import { getCandidateById, candidates } from '@/data/candidates';
import { getConstituencyById } from '@/data/constituencies';
import { getPartyById } from '@/data/parties';
import { Badge } from '@/components/ui/Badge';
import { CandidateNews } from '@/components/CandidateNews';
import { formatCurrency } from '@/lib/utils';
import type { PageProps } from '@/types';

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

  // JSON-LD Person schema
  const personSchema = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: candidate.name,
    description: `${candidate.name} is a ${party.name} candidate contesting from ${constituency?.name ?? 'West Bengal'} in the 2026 West Bengal Assembly Election.`,
    affiliation: { '@type': 'Organization', name: party.name },
    ...(candidate.age > 0 && { age: candidate.age }),
    ...(candidate.affidavitUrl && { url: candidate.affidavitUrl }),
  };

  const infoRows = [
    { label: 'Age',               value: `${candidate.age} years` },
    { label: 'Education',         value: candidate.education },
    { label: 'Occupation',        value: candidate.occupation || 'Not declared' },
    ...(candidate.spouseProfession ? [{ label: 'Spouse Occupation', value: candidate.spouseProfession }] : []),
    { label: 'Incumbent',         value: candidate.isIncumbent ? `Yes (${candidate.incumbentYears ?? '?'} years)` : 'No' },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }} />
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-1 text-sm text-gray-500">
        <Link href="/" className="text-blue-600 hover:underline">Home</Link>
        <span>/</span>
        {constituency && (
          <>
            <Link href={`/constituency/${constituency.id}`} className="text-blue-600 hover:underline">
              {constituency.name}
            </Link>
            <span>/</span>
          </>
        )}
        <span className="text-gray-700">{candidate.name}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Profile card */}
        <div className="lg:col-span-1">
          <div className="sticky top-20 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="h-2 w-full" style={{ backgroundColor: party.color }} />
            <div className="p-5">
              {/* Photo */}
              <div className="mx-auto mb-4 relative h-24 w-24 overflow-hidden rounded-full border-4 border-gray-100 shadow">
                {candidate.photoUrl ? (
                  <Image src={candidate.photoUrl} alt={candidate.name} fill className="object-cover" sizes="96px" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-white" style={{ backgroundColor: party.color }}>
                    {candidate.name.charAt(0)}
                  </div>
                )}
              </div>

              <h1 className="text-center text-lg font-bold text-gray-900">{candidate.name}</h1>
              {candidate.nameBn && (
                <p className="text-center text-sm text-gray-500 font-bengali">{candidate.nameBn}</p>
              )}

              <div className="mt-2 flex justify-center">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white"
                  style={{ backgroundColor: party.color }}
                >
                  {party.abbreviation} · {party.name}
                </span>
              </div>

              {candidate.isIncumbent && (
                <div className="mt-2 text-center">
                  <Badge variant="neutral">Incumbent MLA · {candidate.incumbentYears}y</Badge>
                </div>
              )}

              {constituency && (
                <div className="mt-3 flex items-center justify-center gap-1 text-xs text-gray-500">
                  <MapPin className="h-3.5 w-3.5" />
                  <Link href={`/constituency/${constituency.id}`} className="hover:text-blue-600 hover:underline">
                    {constituency.name}, {constituency.district}
                  </Link>
                </div>
              )}

              <div className="mt-4 flex flex-col gap-2">
                {constituency && (
                  <Link
                    href={`/compare?ids=${getCandidatesByConstituencyForLink(candidate.constituencyId)}`}
                    className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 py-2 text-xs font-medium text-gray-700 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                  >
                    <GitCompare className="h-3.5 w-3.5" /> Compare with others
                  </Link>
                )}
                {candidate.affidavitUrl && (
                  <a
                    href={candidate.affidavitUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 rounded-lg bg-gray-50 border border-gray-200 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> View Affidavit (ECI)
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Details */}
        <div className="lg:col-span-2 space-y-5">
          {/* Personal info */}
          <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-700">Personal Information</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {infoRows.map((row) => (
                <div key={row.label} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="text-gray-500">{row.label}</span>
                  <span className="font-medium text-gray-900">{row.value}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Criminal cases */}
          <section className="rounded-xl border bg-white shadow-sm overflow-hidden" style={{
            borderColor: candidate.criminalCases > 0 ? '#fca5a5' : '#bbf7d0',
          }}>
            <div className="px-5 py-3 border-b flex items-center gap-2" style={{
              backgroundColor: candidate.criminalCases > 0 ? '#fef2f2' : '#f0fdf4',
              borderColor: candidate.criminalCases > 0 ? '#fca5a5' : '#bbf7d0',
            }}>
              <AlertTriangle className={`h-4 w-4 ${candidate.criminalCases > 0 ? 'text-red-500' : 'text-green-500'}`} />
              <h2 className="text-sm font-semibold" style={{ color: candidate.criminalCases > 0 ? '#991b1b' : '#166534' }}>
                Criminal Cases
              </h2>
            </div>
            <div className="px-5 py-4">
              {candidate.criminalCases === 0 ? (
                <p className="text-sm text-green-700">No pending criminal cases declared in affidavit.</p>
              ) : (
                <>
                  <p className="text-sm font-semibold text-red-700">{candidate.criminalCases} pending case(s)</p>
                  {candidate.criminalCasesDetail && (
                    <p className="mt-1 text-xs text-gray-600">Sections: {candidate.criminalCasesDetail}</p>
                  )}
                  <p className="mt-2 text-xs text-gray-400">Source: Self-declared in ECI affidavit. Cases are presumed pending until court verdict.</p>
                </>
              )}
            </div>
          </section>

          {/* Assets */}
          <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-700">Assets & Liabilities</h2>
              <p className="text-xs text-gray-400">Self-declared in ECI affidavit</p>
            </div>
            <div className="px-5 py-4">
              {candidate.totalAssets === 0 && candidate.totalLiabilities === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-6 text-center">
                  <p className="text-sm text-gray-400">Asset data not declared or not yet available</p>
                  <a href={candidate.affidavitUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-blue-500 hover:underline">
                    View original affidavit →
                  </a>
                </div>
              ) : (
              <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-lg bg-green-50 p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Total Assets</p>
                  <p className="text-sm font-bold text-green-700">{candidate.totalAssets > 0 ? formatCurrency(candidate.totalAssets) : 'Not declared'}</p>
                </div>
                {candidate.movableAssets != null && candidate.movableAssets > 0 && (
                  <div className="rounded-lg bg-blue-50 p-3 text-center">
                    <p className="text-xs text-gray-500 mb-1">Movable</p>
                    <p className="text-sm font-bold text-blue-700">{formatCurrency(candidate.movableAssets)}</p>
                  </div>
                )}
                {candidate.immovableAssets != null && candidate.immovableAssets > 0 && (
                  <div className="rounded-lg bg-purple-50 p-3 text-center">
                    <p className="text-xs text-gray-500 mb-1">Immovable</p>
                    <p className="text-sm font-bold text-purple-700">{formatCurrency(candidate.immovableAssets)}</p>
                  </div>
                )}
                <div className="rounded-lg bg-red-50 p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Liabilities</p>
                  <p className="text-sm font-bold text-red-600">{candidate.totalLiabilities > 0 ? formatCurrency(candidate.totalLiabilities) : 'None declared'}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <span className="text-sm font-medium text-gray-700">Net Assets</span>
                <span className={`text-sm font-bold ${netAssets >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {netAssets >= 0 ? '+' : '-'}{formatCurrency(Math.abs(netAssets))}
                </span>
              </div>
              </>
              )}
            </div>
          </section>

          <p className="text-xs text-gray-400">
            ⚠ All information on this page is sourced from self-declared ECI affidavits and publicly available datasets.
            WB Votes does not verify or endorse any individual claim.
          </p>

          <CandidateNews name={candidate.name} />
        </div>
      </div>
    </div>
    </>
  );
}

// Helper for compare link — gets sibling candidate IDs
function getCandidatesByConstituencyForLink(constituencyId: string): string {
  return candidates
    .filter((c) => c.constituencyId === constituencyId)
    .map((c) => c.id)
    .join(',');
}

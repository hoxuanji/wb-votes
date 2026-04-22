import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { MapPin, ArrowLeft, Users, GitCompare } from 'lucide-react';
import { getConstituencyById } from '@/data/constituencies';
import { getCandidatesByConstituency } from '@/data/candidates';
import { getPartyById } from '@/data/parties';
import { CandidateCard } from '@/components/CandidateCard';
import { ConstituencyInsights } from '@/components/ConstituencyInsights';
import { FunFactsPanel } from '@/components/FunFactsPanel';
import { ConstituencyKeyFaces } from '@/components/ConstituencyKeyFaces';
import { ConstituencyTracker } from '@/components/ConstituencyTracker';
import type { PageProps } from '@/types';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const constituency = getConstituencyById(params.id);
  if (!constituency) return {};
  const candidates = getCandidatesByConstituency(params.id);
  return {
    title: `${constituency.name} Constituency — ${candidates.length} Candidates — WB Votes 2026`,
    description: `View all ${candidates.length} candidates running in ${constituency.name}, ${constituency.district} for the West Bengal 2026 Assembly Election. Criminal records, assets, and education data from ECI affidavits.`,
    openGraph: {
      title: `${constituency.name} — WB Assembly Election 2026`,
      description: `${candidates.length} candidates contesting in ${constituency.name}, ${constituency.district}. Full affidavit data.`,
    },
  };
}

function ConstituencyJsonLd({ params }: { params: { id: string } }) {
  const constituency = getConstituencyById(params.id);
  const candidates = getCandidatesByConstituency(params.id);
  if (!constituency) return null;

  const withCriminal = candidates.filter(c => c.criminalCases > 0).length;
  const richest = [...candidates].sort((a, b) => b.totalAssets - a.totalAssets)[0];

  const faqItems = [
    {
      q: `How many candidates are contesting from ${constituency.name}?`,
      a: `${candidates.length} candidates are contesting from ${constituency.name} constituency in the 2026 West Bengal Assembly Election.`,
    },
    {
      q: `Which candidates have criminal cases in ${constituency.name}?`,
      a: withCriminal > 0
        ? `${withCriminal} out of ${candidates.length} candidates in ${constituency.name} have declared pending criminal cases in their ECI affidavits.`
        : `No candidates in ${constituency.name} have declared criminal cases in their ECI affidavits.`,
    },
    richest && richest.totalAssets > 0 ? {
      q: `Who is the wealthiest candidate in ${constituency.name}?`,
      a: `${richest.name} has declared the highest assets of ₹${(richest.totalAssets / 10_000_000).toFixed(2)} Crore in their ECI affidavit.`,
    } : null,
  ].filter(Boolean) as { q: string; a: string }[];

  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FAQPage',
        mainEntity: faqItems.map(item => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      },
      {
        '@type': 'WebPage',
        name: `${constituency.name} Assembly Constituency — 2026 West Bengal Election`,
        description: `${candidates.length} candidates in ${constituency.name}, ${constituency.district}`,
        url: `https://wbvotes.in/constituency/${params.id}`,
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export default function ConstituencyPage({ params }: PageProps) {
  const constituency = getConstituencyById(params.id);
  if (!constituency) notFound();

  const rawCandidates = getCandidatesByConstituency(params.id);

  if (rawCandidates.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <Link href="/" className="mb-6 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to all constituencies
        </Link>
        <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
          <Users className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-gray-500">No candidate data available yet for {constituency.name}.</p>
          <p className="mt-1 text-sm text-gray-400">
            Real data from ECI affidavits will be loaded here.
          </p>
        </div>
      </div>
    );
  }

  const candidatesWithParty = rawCandidates.map((c) => ({
    candidate: c,
    party: getPartyById(c.partyId) ?? {
      id: 'IND', name: 'Independent', nameBn: 'নির্দল', abbreviation: 'IND', color: '#546E7A', isNational: false,
    },
  }));

  const compareUrl = `/compare?ids=${rawCandidates.map((c) => c.id).join(',')}`;

  return (
    <>
      <ConstituencyJsonLd params={params} />
      <ConstituencyTracker id={constituency.id} name={constituency.name} district={constituency.district} />
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Breadcrumb */}
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> All Constituencies
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">
            {constituency.name}
            <span className="ml-2 text-base font-semibold text-gray-500">{constituency.nameBn}</span>
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {constituency.district}
            </span>
            <span>·</span>
            <span>Assembly #{constituency.assemblyNumber}</span>
            {constituency.reservation !== 'General' && (
              <>
                <span>·</span>
                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                  Reserved: {constituency.reservation}
                </span>
              </>
            )}
          </div>
        </div>

        <Link
          href={compareUrl}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
        >
          <GitCompare className="h-4 w-4" />
          Compare All {rawCandidates.length} Candidates
        </Link>
      </div>

      {/* Stat bar */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-center shadow-sm">
          <p className="text-xl font-bold text-gray-900">{rawCandidates.length}</p>
          <p className="text-xs text-gray-500">Candidates</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-center shadow-sm">
          <p className="text-xl font-bold text-red-600">{rawCandidates.filter((c) => c.criminalCases > 0).length}</p>
          <p className="text-xs text-gray-500">With Cases</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-center shadow-sm">
          <p className="text-xl font-bold text-blue-600">{rawCandidates.filter((c) => c.isIncumbent).length}</p>
          <p className="text-xs text-gray-500">Incumbent</p>
        </div>
      </div>

      {/* Key faces horizontal scroll */}
      <ConstituencyKeyFaces candidates={rawCandidates} className="mb-6" />

      {/* Insights panel */}
      <ConstituencyInsights candidates={rawCandidates} className="mb-6" />

      {/* Fun facts */}
      <FunFactsPanel candidates={rawCandidates} className="mb-8" />

      {/* Candidate grid */}
      <h2 className="mb-4 text-base font-bold text-gray-900">All Candidates</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {candidatesWithParty.map(({ candidate, party }) => (
          <CandidateCard
            key={candidate.id}
            candidate={candidate}
            party={party}
          />
        ))}
      </div>

      <p className="mt-6 text-center text-xs text-gray-400">
        Data sourced from ECI affidavits. All figures are self-declared by candidates.
      </p>
    </div>
    </>
  );
}

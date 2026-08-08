import type { Metadata } from 'next';
import Link from 'next/link';
import { Wallet, ArrowLeft, ExternalLink } from 'lucide-react';
import { currentMLAs } from '@/data/current-mla';
import { constituencies } from '@/data/constituencies';
import { getPartyById } from '@/data/parties';

export const metadata: Metadata = {
  title: 'MLALADS Funds — West Bengal',
  description: 'Reference to the MLA Local Area Development Scheme allocation across all 294 West Bengal assembly constituencies.',
};

export const dynamic = 'force-static';

const constituencyById = Object.fromEntries(constituencies.map(c => [c.id, c]));

// WB MLALADS standard allocation per year. Official figure: ₹70 lakh/year per MLA.
const MLALADS_ANNUAL_CR = 0.7;
const MLALADS_TERM_YEARS = 5;
const MLALADS_TERM_TOTAL_CR = MLALADS_ANNUAL_CR * MLALADS_TERM_YEARS;

export default function FundsPage() {
  const rows = currentMLAs
    .map(mla => ({
      mla,
      constituency: constituencyById[mla.constituencyId],
      party: getPartyById(mla.partyId),
    }))
    .filter(r => r.constituency)
    .sort((a, b) => a.constituency!.name.localeCompare(b.constituency!.name));

  const totalSeats = currentMLAs.length;

  return (
    <main className="min-h-screen pb-20 md:pb-12">
      {/* Hero */}
      <section className="border-b border-white/10 bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 px-4 py-10 text-white">
        <div className="mx-auto max-w-6xl">
          <Link href="/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-blue-200 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-blue-200">
            <Wallet className="h-4 w-4" /> MLALADS · West Bengal
          </div>
          <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">MLA Local Area Development Scheme</h1>
          <p className="mt-3 max-w-2xl text-base text-blue-100/80">
            Every MLA in West Bengal receives <strong>₹{MLALADS_ANNUAL_CR} crore per year</strong> (₹70 lakh) to fund
            local development works in their constituency — sanitation, roads, drinking water, school equipment,
            health-centre upgrades. Across a five-year term that&apos;s <strong>₹{MLALADS_TERM_TOTAL_CR} crore per AC</strong>.
            Project selection is at the MLA&apos;s discretion within scheme guidelines.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-sm">
              <p className="text-lg font-bold text-white">{totalSeats}</p>
              <p className="text-[10px] text-blue-200/80">MLAs · 2026 term</p>
            </div>
            <div className="rounded-lg border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 backdrop-blur-sm">
              <p className="text-lg font-bold text-emerald-200">₹{(totalSeats * MLALADS_ANNUAL_CR).toFixed(0)} Cr</p>
              <p className="text-[10px] text-emerald-200/70">Statewide · per year</p>
            </div>
            <div className="rounded-lg border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 backdrop-blur-sm">
              <p className="text-lg font-bold text-emerald-200">₹{(totalSeats * MLALADS_TERM_TOTAL_CR).toFixed(0)} Cr</p>
              <p className="text-[10px] text-emerald-200/70">Statewide · 5-year term</p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-8">
        <h2 className="mb-3 text-lg font-bold text-white">How MLALADS works</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Card
            title="Allocation"
            body="Each MLA gets ₹70 lakh per financial year, released as two equal instalments by the WB Planning & Development Department."
          />
          <Card
            title="Project selection"
            body="The MLA recommends works (recurring or one-off) within their constituency. Each work is technically vetted and sanctioned by the District Magistrate."
          />
          <Card
            title="Execution"
            body="Implementing agencies (panchayats, municipalities, line departments) carry out the works. Utilisation and asset-creation reports are filed annually."
          />
        </div>
      </section>

      {/* Directory */}
      <section className="mx-auto max-w-6xl px-4 py-2">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-white">Per-constituency allocation</h2>
          <p className="text-xs text-gray-500">Sorted by name · click any row for the MLA profile</p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Constituency</th>
                <th className="px-4 py-3">District</th>
                <th className="px-4 py-3">MLA (2026)</th>
                <th className="px-4 py-3">Party</th>
                <th className="px-4 py-3 text-right">Annual</th>
                <th className="px-4 py-3 text-right">5-yr term</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ mla, constituency, party }) => (
                <tr key={mla.constituencyId} className="border-b border-white/5 transition-colors hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <Link href={`/mla/${mla.constituencyId}`} className="font-medium text-white hover:text-blue-300">
                      {constituency!.name}
                    </Link>
                    {constituency!.reservation !== 'General' && (
                      <span className="ml-2 rounded bg-slate-700 px-1 py-0.5 text-[10px] text-gray-400">{constituency!.reservation}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{constituency!.district}</td>
                  <td className="px-4 py-3 font-medium text-gray-200">{mla.name}</td>
                  <td className="px-4 py-3">
                    {party && (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: party.color }}>
                        {party.abbreviation}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-200/90">₹{MLALADS_ANNUAL_CR} Cr</td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-200">₹{MLALADS_TERM_TOTAL_CR} Cr</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-gray-600">
          Showing {rows.length} of {totalSeats} MLAs. Allocation figures reflect the standard WB MLALADS rate; refer to{' '}
          <a href="https://wbplan.gov.in" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline inline-flex items-center gap-0.5">
            wbplan.gov.in <ExternalLink className="h-2.5 w-2.5" />
          </a>{' '}
          for sanctioned utilisation records.
        </p>
      </section>
    </main>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-gray-400">{body}</p>
    </div>
  );
}

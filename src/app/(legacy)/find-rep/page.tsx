import type { Metadata } from 'next';
import Link from 'next/link';
import { Search, MapPin } from 'lucide-react';
import { constituencies } from '@/data/constituencies';
import { getCurrentMLAForAC } from '@/data/current-mla';
import { getLSConstituencyForAC } from '@/data/ac-ls-map';
import { getMPByLSConstituency } from '@/data/wbmps';
import { getPartyById } from '@/data/parties';
import { getCabinetMemberByConstituency } from '@/data/cabinet';
import { MinistryBadge } from '@/components/cabinet/MinistryBadge';
import { MPCard } from '@/components/MPCard';
import { CivicReportForm } from '@/components/CivicReportForm';
import { ConstituencyDropdown } from '@/components/ConstituencyDropdown';

export const metadata: Metadata = {
  title: 'Find Your MLA & MP — WB Votes',
  description: 'Find your assembly MLA and Lok Sabha MP for any West Bengal constituency. Report civic issues directly.',
};

interface PageProps {
  searchParams?: { ac?: string };
}

export default function FindRepPage({ searchParams }: PageProps) {
  const selected = searchParams?.ac
    ? constituencies.find(c => c.id === searchParams.ac)
    : null;

  const mla      = selected ? getCurrentMLAForAC(selected.id) : null;
  const lsName   = selected ? getLSConstituencyForAC(selected.id) : null;
  const mp       = lsName   ? getMPByLSConstituency(lsName)       : null;
  const minister = selected ? getCabinetMemberByConstituency(selected.id) : null;

  const mlaParty = mla ? getPartyById(mla.partyId) : null;

  return (
    <main className="min-h-screen pb-20 md:pb-12">
      {/* Hero */}
      <section className="border-b border-white/10 bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 px-4 py-10 text-white">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-2 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-blue-200">
            <MapPin className="h-4 w-4" />
            Your representatives
          </div>
          <h1 className="text-3xl font-extrabold sm:text-4xl">Find Your MLA &amp; MP</h1>
          <p className="mt-2 text-base text-blue-100/80">
            Select your assembly constituency to see your elected representatives and report civic issues.
          </p>

          {/* Search / select */}
          <div className="mx-auto mt-6 max-w-xl">
            <ConstituencyDropdown selected={selected?.id} />
          </div>

          {selected && (
            <p className="mt-3 text-sm text-blue-200/70">
              Showing representatives for{' '}
              <span className="font-semibold text-white">{selected.name}</span>,{' '}
              {selected.district}
            </p>
          )}
        </div>
      </section>

      {selected ? (
        <section className="mx-auto max-w-4xl px-4 py-8 space-y-8">
          {/* MLA + MP cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* MLA card */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Assembly MLA · 2026–2031
              </p>
              {mla ? (
                <article
                  className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/[0.07] transition-colors"
                  style={{ borderLeft: `3px solid ${mlaParty?.color ?? '#546E7A'}` }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ring-2 ring-white/10"
                      style={{ background: `linear-gradient(135deg, ${mlaParty?.color ?? '#546E7A'}cc, ${mlaParty?.color ?? '#546E7A'}44)` }}
                    >
                      {mla.name.split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() ?? '').join('')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-bold text-white">{mla.name}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: mlaParty?.color ?? '#546E7A' }}>
                          {mlaParty?.abbreviation ?? mla.partyId}
                        </span>
                        <span className="text-gray-400">{selected.name} AC</span>
                      </div>
                      {mla.marginVotes && (
                        <p className="mt-1 text-[11px] text-gray-500">
                          Won by <span className="font-semibold text-gray-300">{mla.marginVotes.toLocaleString('en-IN')}</span> votes
                        </p>
                      )}
                      {minister && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {minister.portfolios.filter(p => !p.to).map(p => (
                            <MinistryBadge key={p.ministry} portfolio={p} variant="full" />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Link
                      href={`/constituency/${selected.id}`}
                      className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-300 hover:bg-blue-500/20"
                    >
                      View constituency →
                    </Link>
                  </div>
                </article>
              ) : (
                <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-center">
                  <p className="text-sm text-gray-400">MLA data not yet available for this seat.</p>
                  <p className="mt-1 text-[11px] text-gray-600">Pending 2026 results backfill.</p>
                </div>
              )}
            </div>

            {/* MP card */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Lok Sabha MP · 2024–2029
              </p>
              {mp ? (
                <MPCard mp={mp} acName={selected.name} />
              ) : (
                <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-center">
                  <p className="text-sm text-gray-400">MP data not found for this constituency.</p>
                </div>
              )}
            </div>
          </div>

          {/* LS constituency info */}
          {lsName && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-gray-400">
              <span className="font-medium text-gray-300">{selected.name}</span> is part of the{' '}
              <span className="font-medium text-white">{lsName}</span> Lok Sabha constituency.
              {mp && <> Your MP since June 2024 is <span className="font-medium text-white">{mp.name}</span> ({getPartyById(mp.partyId)?.abbreviation ?? mp.partyId}).</>}
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-white/10" />

          {/* Citizen reporting */}
          <div>
            <h2 className="mb-1 text-xl font-bold text-white">Report a Local Issue</h2>
            <p className="mb-5 text-sm text-gray-400">
              Is something broken, unsafe, or neglected in{' '}
              <span className="text-white">{selected.name}</span>? Report it here —
              no personal information required.
            </p>
            <CivicReportForm constituencyId={selected.id} constituencyName={selected.name} />
          </div>
        </section>
      ) : (
        /* Empty state */
        <section className="mx-auto max-w-2xl px-4 py-12 text-center">
          <Search className="mx-auto mb-4 h-12 w-12 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-300">Select a constituency above</h2>
          <p className="mt-2 text-sm text-gray-500">
            Choose any of West Bengal&apos;s 294 assembly constituencies to see your MLA, your Lok Sabha MP, and to report civic issues.
          </p>
        </section>
      )}
    </main>
  );
}

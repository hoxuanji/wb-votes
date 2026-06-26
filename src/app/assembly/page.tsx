import type { Metadata } from 'next';
import Link from 'next/link';
import { ScrollText, ArrowLeft, ExternalLink } from 'lucide-react';
import { currentMLAs } from '@/data/current-mla';
import { constituencies } from '@/data/constituencies';
import { getPartyById } from '@/data/parties';

export const metadata: Metadata = {
  title: 'West Bengal Legislative Assembly — Sitting MLAs',
  description: 'Directory of all 294 sitting MLAs in the West Bengal Legislative Assembly for the 2026-2031 term, with party breakdown.',
};

const constituencyById = Object.fromEntries(constituencies.map(c => [c.id, c]));

export default function AssemblyPage() {
  const rows = currentMLAs
    .map(mla => ({
      mla,
      constituency: constituencyById[mla.constituencyId],
      party: getPartyById(mla.partyId),
    }))
    .filter(r => r.constituency)
    .sort((a, b) => a.constituency!.name.localeCompare(b.constituency!.name));

  const byParty = currentMLAs.reduce<Record<string, number>>((acc, m) => {
    acc[m.partyId] = (acc[m.partyId] || 0) + 1; return acc;
  }, {});
  const totalSeats = currentMLAs.length;
  const partyEntries = Object.entries(byParty).sort((a, b) => b[1] - a[1]);

  return (
    <main className="min-h-screen pb-20 md:pb-12">
      {/* Hero */}
      <section className="border-b border-white/10 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 px-4 py-10 text-white">
        <div className="mx-auto max-w-6xl">
          <Link href="/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-blue-200 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-blue-200">
            <ScrollText className="h-4 w-4" /> West Bengal · Legislative Assembly
          </div>
          <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Sitting MLAs · 2026–2031</h1>
          <p className="mt-3 max-w-2xl text-base text-blue-100/80">
            All {totalSeats} sitting members of the West Bengal Legislative Assembly. Click any row
            for the MLA&apos;s detailed profile — constituency background, electoral history, ministry portfolio,
            MLALADS allocation, and local news.
          </p>

          {/* Party-wise composition */}
          <div className="mt-6">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-blue-200">Composition</p>
            <div className="flex h-3 w-full max-w-2xl overflow-hidden rounded-full bg-white/10">
              {partyEntries.map(([pid, n]) => {
                const p = getPartyById(pid);
                const pct = (n / totalSeats) * 100;
                return (
                  <div
                    key={pid}
                    className="h-full"
                    style={{ width: `${pct}%`, backgroundColor: p?.color ?? '#64748b' }}
                    title={`${p?.abbreviation ?? pid} · ${n} seats`}
                  />
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {partyEntries.map(([pid, n]) => {
                const p = getPartyById(pid);
                const pct = ((n / totalSeats) * 100).toFixed(1);
                return (
                  <span key={pid}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p?.color }} />
                    {p?.abbreviation ?? pid} · {n} <span className="text-blue-200/60">({pct}%)</span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Roster */}
      <section className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-white">Full roster</h2>
          <p className="text-xs text-gray-500">Sorted by name</p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Constituency</th>
                <th className="px-4 py-3">District</th>
                <th className="px-4 py-3">MLA</th>
                <th className="px-4 py-3">Party</th>
                <th className="px-4 py-3 text-right">Margin</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ mla, constituency, party }, i) => (
                <tr key={mla.constituencyId} className="border-b border-white/5 transition-colors hover:bg-white/[0.03]">
                  <td className="px-4 py-3 text-xs text-gray-600">{i + 1}</td>
                  <td className="px-4 py-3">
                    <Link href={`/mla/${mla.constituencyId}`} className="font-medium text-white hover:text-blue-300">
                      {constituency!.name}
                    </Link>
                    {constituency!.reservation !== 'General' && (
                      <span className="ml-1.5 rounded bg-slate-700 px-1 py-0.5 text-[9px] text-gray-400">{constituency!.reservation}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{constituency!.district}</td>
                  <td className="px-4 py-3 text-gray-200">{mla.name}</td>
                  <td className="px-4 py-3">
                    {party && (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: party.color }}>
                        {party.abbreviation}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-gray-400">
                    {mla.marginVotes != null ? mla.marginVotes.toLocaleString('en-IN') : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/mla/${mla.constituencyId}`}
                      className="text-[11px] text-blue-400 hover:underline">
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-gray-600">
          Source:{' '}
          <a href="https://wbassembly.gov.in" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline inline-flex items-center gap-0.5">
            wbassembly.gov.in <ExternalLink className="h-2.5 w-2.5" />
          </a>
          ·{' '}
          <a href="https://www.indiavotes.com/" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline inline-flex items-center gap-0.5">
            IndiaVotes (2026 results) <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </p>
      </section>
    </main>
  );
}

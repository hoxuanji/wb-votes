import Link from 'next/link';
import { UserCheck, ExternalLink, Info, Globe, Wallet } from 'lucide-react';
import { getPartyById } from '@/data/parties';
import { getCabinetMemberByConstituency } from '@/data/cabinet';
import { getCurrentMLAForAC } from '@/data/current-mla';
import { getMLARecordForAC } from '@/data/mla-records';
import { getServerElectionPhase, isGovernance } from '@/lib/election-phase';
import { getHistoricalResultForACYear } from '@/data/historical-results';
import { MinistryBadge } from '@/components/cabinet/MinistryBadge';

interface MLAScorecardProps {
  constituencyId: string;
  className?: string;
}

function pct(v?: number): string {
  return typeof v === 'number' ? `${Math.round(v)}%` : null!;
}

// WB MLALADS standard: ₹70 lakh/year
const MLALADS_ANNUAL_L = 70;

export function MLAScorecard({ constituencyId, className = '' }: MLAScorecardProps) {
  const phase    = getServerElectionPhase();
  const minister = getCabinetMemberByConstituency(constituencyId);

  // In governance: read 2026 winner. In pre/live/post: read 2021 incumbent.
  const current2026 = isGovernance(phase) ? getCurrentMLAForAC(constituencyId) : null;
  const result2021  = !isGovernance(phase) ? getHistoricalResultForACYear(constituencyId, 2021) : null;

  const name     = current2026?.name  ?? result2021?.winner.name ?? null;
  const partyId  = current2026?.partyId ?? result2021?.winner.partyId ?? null;
  const partyAbbr= current2026 ? (getPartyById(current2026.partyId)?.abbreviation ?? current2026.partyId)
                               : (result2021?.winner.partyAbbr ?? null);
  const margin   = current2026?.marginVotes ?? result2021?.marginVotes ?? null;
  const termStat = isGovernance(phase) ? '2026-2031' as const : '2021-2026' as const;
  const termLabel = isGovernance(phase) ? '2026–2031' : '2021–2026';

  if (!name) {
    return (
      <div className={`rounded-xl border border-dashed border-white/10 p-6 text-center ${className}`}>
        <Info className="mx-auto mb-2 h-6 w-6 text-gray-500" />
        <p className="text-sm text-gray-400">MLA data not yet available for this seat.</p>
      </div>
    );
  }

  const party   = partyId ? getPartyById(partyId) : null;
  const color   = party?.color ?? '#546E7A';
  const record  = getMLARecordForAC(constituencyId, termStat);
  const sourceUrl = current2026?.sourceUrl;

  return (
    <div className={`rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5 ${className}`}>
      {/* Header */}
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
        <UserCheck className="h-4 w-4 text-blue-400" />
        Current MLA · {termLabel} Term
      </h3>

      {/* Identity */}
      <div className="mb-5 rounded-lg border border-white/10 bg-black/20 p-4" style={{ borderLeft: `4px solid ${color}` }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-bold text-white">{name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: color }}>
                {partyAbbr}
              </span>
              {margin != null && (
                <span className="text-gray-400">Won by {margin.toLocaleString('en-IN')} votes</span>
              )}
            </div>
            {/* Ministry portfolios if minister */}
            {minister && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {minister.portfolios.filter(p => !p.to).map(p => (
                  <MinistryBadge key={`${p.ministry}-${p.from}`} portfolio={p} variant="full" />
                ))}
              </div>
            )}
            <Link
              href={`/mla/${constituencyId}`}
              className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:text-blue-300 hover:underline"
            >
              View full profile <ExternalLink className="h-2.5 w-2.5" />
            </Link>
          </div>
          {sourceUrl && (
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer"
              className="shrink-0 text-[11px] text-blue-400 hover:underline flex items-center gap-0.5">
              source <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
      </div>

      {/* Assembly performance — governance — only show if there's actual data */}
      {isGovernance(phase) && record && (
        <div className="mb-5">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Assembly performance · 2026 term</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: 'Attendance',  value: pct(record.attendancePct),                   note: 'of sessions' },
              { label: 'Questions',   value: record.questionsAsked?.toString() ?? '—',     note: 'asked' },
              { label: 'Bills',       value: record.billsIntroduced?.toString() ?? '—',    note: 'introduced' },
              { label: 'Debates',     value: record.debatesParticipated?.toString() ?? '—',note: 'participated' },
            ].map(s => (
              <div key={s.label} className="rounded-lg border border-white/10 bg-black/20 p-3 text-center">
                <p className="text-lg font-bold text-white">{s.value}</p>
                <p className="text-[10px] text-gray-500">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prior term performance (pre/live/post) — only show if there's actual data */}
      {!isGovernance(phase) && record && (
        <div className="mb-5">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Assembly performance · 2021–2026</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: 'Attendance', value: pct(record.attendancePct) },
              { label: 'Questions',  value: record.questionsAsked?.toString() ?? '—' },
              { label: 'Bills',      value: record.billsIntroduced?.toString() ?? '—' },
              { label: 'Debates',    value: record.debatesParticipated?.toString() ?? '—' },
            ].map(s => (
              <div key={s.label} className="rounded-lg border border-white/10 bg-black/20 p-3 text-center">
                <p className="text-lg font-bold text-white">{s.value}</p>
                <p className="text-[10px] text-gray-500">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MLALADS funds */}
      <div className="mb-5">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">MLALADS constituency funds</p>
        <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/10 px-4 py-3">
          <Wallet className="h-4 w-4 shrink-0 text-violet-400" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">₹{MLALADS_ANNUAL_L} lakh / year allocated</p>
            <p className="text-[11px] text-gray-500">₹{(MLALADS_ANNUAL_L * 5)} lakh over the 5-year term · standard WB MLALADS rate</p>
          </div>
          <Link href="/funds" className="shrink-0 text-[11px] text-blue-400 hover:underline">
            All ACs →
          </Link>
        </div>
      </div>

      {/* Contact */}
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Contact representative</p>
        <div className="flex flex-wrap gap-2">
          <a href="https://wbassembly.gov.in" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-300 hover:bg-white/10">
            <Globe className="h-3.5 w-3.5 text-blue-400" />
            wbassembly.gov.in
          </a>
          <Link href={`/find-rep?ac=${constituencyId}`}
            className="flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-medium text-blue-300 hover:bg-blue-500/20">
            Report an issue →
          </Link>
        </div>
      </div>
    </div>
  );
}

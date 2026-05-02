import Link from 'next/link';
import { UserCheck, Calendar, FileText, MessageCircle, Activity, ExternalLink, Info } from 'lucide-react';
import { getHistoricalResultForACYear } from '@/data/historical-results';
import { getMLARecordForAC } from '@/data/mla-records';
import { getCandidatesByConstituency } from '@/data/candidates';
import { getPartyById } from '@/data/parties';

interface MLAScorecardProps {
  constituencyId: string;
  className?: string;
}

function pct(v?: number): string {
  return typeof v === 'number' ? `${Math.round(v)}%` : '—';
}

export function MLAScorecard({ constituencyId, className = '' }: MLAScorecardProps) {
  const lastResult = getHistoricalResultForACYear(constituencyId, 2021);
  const record = getMLARecordForAC(constituencyId, '2021-2026');

  if (!lastResult) {
    return (
      <div className={`rounded-xl border border-dashed border-white/10 p-6 text-center ${className}`}>
        <Info className="mx-auto mb-2 h-6 w-6 text-gray-500" />
        <p className="text-sm text-gray-400">No incumbent MLA data for this seat.</p>
      </div>
    );
  }

  const party = getPartyById(lastResult.winner.partyId);
  const color = party?.color ?? '#546E7A';

  // Try to link to the MLA's candidate profile if they're also contesting 2026
  const candidates = getCandidatesByConstituency(constituencyId);
  const profile = candidates.find(
    (c) => c.isIncumbent && c.name.toLowerCase().split(/\s+/).some((t) =>
      lastResult.winner.name.toLowerCase().includes(t),
    ),
  );

  const stats = [
    {
      icon: Calendar,
      label: 'Attendance',
      value: pct(record?.attendancePct),
      accent: 'text-emerald-300',
    },
    {
      icon: MessageCircle,
      label: 'Questions asked',
      value: record?.questionsAsked?.toString() ?? '—',
      accent: 'text-blue-300',
    },
    {
      icon: FileText,
      label: 'Bills introduced',
      value: record?.billsIntroduced?.toString() ?? '—',
      accent: 'text-purple-300',
    },
    {
      icon: Activity,
      label: 'Debates',
      value: record?.debatesParticipated?.toString() ?? '—',
      accent: 'text-amber-300',
    },
  ];

  return (
    <div className={`rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <UserCheck className="h-4 w-4 text-blue-400" />
          Current MLA (2021–2026 Term)
        </h3>
      </div>

      <div
        className="mb-4 rounded-lg border border-white/10 bg-black/20 p-4"
        style={{ borderLeft: `4px solid ${color}` }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-base font-bold text-white">{lastResult.winner.name}</p>
            <div className="mt-0.5 flex items-center gap-2 text-xs">
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                style={{ backgroundColor: color }}
              >
                {lastResult.winner.partyAbbr}
              </span>
              <span className="text-gray-400">Won by {lastResult.marginVotes.toLocaleString()} votes</span>
            </div>
          </div>
          {profile && (
            <Link
              href={`/candidate/${profile.id}`}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-300 hover:bg-blue-500/20"
            >
              View 2026 profile
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(({ icon: Icon, label, value, accent }) => (
          <div key={label} className="rounded-lg border border-white/10 bg-black/20 p-3 text-center">
            <Icon className={`mx-auto mb-1 h-4 w-4 ${accent}`} />
            <p className={`text-lg font-bold ${accent}`}>{value}</p>
            <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
          </div>
        ))}
      </div>

      {!record && (
        <p className="mt-4 flex items-start gap-1.5 text-[11px] text-gray-500">
          <Info className="h-3 w-3 shrink-0 mt-0.5" />
          <span>Performance data not yet ingested. Will be populated from wbassembly.gov.in and PRS India.</span>
        </p>
      )}

      {record?.lastUpdated && (
        <p className="mt-4 text-[11px] text-gray-500">
          Updated {record.lastUpdated}
          {record.sourceUrl && (
            <>
              {' · '}
              <a href={record.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">source</a>
            </>
          )}
        </p>
      )}
    </div>
  );
}

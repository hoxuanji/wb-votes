import Link from 'next/link';
import { ExternalLink, MapPin, Users, Calendar, MessageCircle, Activity, FileText, Info } from 'lucide-react';
import type { WBMP } from '@/types';
import { getPartyById } from '@/data/parties';
import { getMPRecord } from '@/data/wbmps-performance';

interface MPCardProps {
  mp: WBMP;
  acName?: string;
  className?: string;
}

function pct(v: number | null | undefined): string {
  return typeof v === 'number' && v !== null ? `${Math.round(v)}%` : '—';
}
function num(v: number | null | undefined): string {
  return typeof v === 'number' && v !== null ? String(v) : '—';
}

export function MPCard({ mp, acName, className = '' }: MPCardProps) {
  const party  = getPartyById(mp.partyId);
  const color  = party?.color ?? '#546E7A';
  const record = getMPRecord(mp.id);

  return (
    <article
      className={`rounded-xl border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/[0.07] ${className}`}
      style={{ borderLeft: `3px solid ${color}` }}
    >
      {/* Header label */}
      <div className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
        <Users className="h-3 w-3" />
        Lok Sabha MP · 2024–2029
      </div>

      {/* Identity */}
      <div className="flex items-start gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ring-2 ring-white/10"
          style={{ background: `linear-gradient(135deg, ${color}cc, ${color}44)` }}
        >
          {mp.name.split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() ?? '').join('')}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-white leading-tight">{mp.name}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: color }}>
              {party?.abbreviation ?? mp.partyId}
            </span>
            <span className="flex items-center gap-0.5 text-gray-400">
              <MapPin className="h-3 w-3" />
              {mp.lsConstituency}
            </span>
          </div>
          {acName && (
            <p className="mt-1 text-[11px] text-gray-500">{acName} → {mp.lsConstituency} (LS #{mp.lsNumber})</p>
          )}
          <div className="mt-1.5 text-[11px] text-gray-500 flex items-center gap-3">
            <span>Won by <span className="font-semibold text-gray-300">{mp.margin.toLocaleString('en-IN')}</span> votes</span>
            <a href={mp.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-blue-400 hover:underline">
              source <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>
        </div>
      </div>

      {/* Lok Sabha performance */}
      <div className="mt-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          Lok Sabha performance · 2024 term
        </p>
        {record ? (
          <div className="grid grid-cols-4 gap-2">
            {[
              { icon: Calendar,      label: 'Attendance',  value: pct(record.attendancePct),          accent: 'text-emerald-300' },
              { icon: MessageCircle, label: 'Questions',   value: num(record.questionsAsked),          accent: 'text-blue-300' },
              { icon: Activity,      label: 'Debates',     value: num(record.debatesParticipated),     accent: 'text-amber-300' },
              { icon: FileText,      label: 'Bills',       value: num(record.billsIntroduced),         accent: 'text-purple-300' },
            ].map(({ icon: Icon, label, value, accent }) => (
              <div key={label} className="rounded-lg border border-white/10 bg-black/20 p-2.5 text-center">
                <Icon className={`mx-auto mb-0.5 h-3.5 w-3.5 ${accent}`} />
                <p className={`text-sm font-bold ${accent}`}>{value}</p>
                <p className="text-[9px] uppercase tracking-wide text-gray-600">{label}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/10 px-3 py-2.5">
            <Info className="h-3.5 w-3.5 shrink-0 text-gray-500" />
            <p className="text-[11px] text-gray-500">
              Attendance and participation data for the 2024–2029 term will appear here once the Parliament session records are available.
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

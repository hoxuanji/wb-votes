'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, MapPin, CheckCircle2, Clock, Flag } from 'lucide-react';
import type { SeedCivicIssue, CivicReportCategory } from '@/types';

const CAT_COLOR: Record<CivicReportCategory, string> = {
  road:        '#f59e0b',
  water:       '#3b82f6',
  electricity: '#eab308',
  health:      '#f43f5e',
  education:   '#06b6d4',
  corruption:  '#ef4444',
  safety:      '#f97316',
  environment: '#22c55e',
  other:       '#64748b',
};

const SEVERITY_RING: Record<string, string> = {
  critical: 'ring-red-400/50',
  high:     'ring-orange-400/40',
  medium:   'ring-amber-400/30',
  low:      'ring-slate-400/20',
};

interface Props {
  constituencyId: string;
  constituencyName: string;
}

export function ConstituencyIssuesFeed({ constituencyId, constituencyName }: Props) {
  const [issues, setIssues] = useState<SeedCivicIssue[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/reports?acId=${encodeURIComponent(constituencyId)}`)
      .then(r => r.ok ? r.json() : { issues: [] })
      .then(data => {
        if (!cancelled) setIssues(Array.isArray(data.issues) ? data.issues : []);
      })
      .catch(() => {
        if (!cancelled) setIssues([]);
      });
    return () => { cancelled = true; };
  }, [constituencyId]);

  if (issues === null) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5">
        <div className="h-32 animate-pulse rounded-lg bg-white/[0.03]" />
      </div>
    );
  }

  const pending  = issues.filter(i => i.status === 'pending').length;
  const reviewed = issues.filter(i => i.status === 'reviewed').length;
  const resolved = issues.filter(i => i.status === 'resolved').length;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-white">
            Reported Issues
            {issues.length > 0 && (
              <span className="ml-2 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                {issues.length}
              </span>
            )}
          </h3>
        </div>
        <Link
          href={`/find-rep?ac=${constituencyId}`}
          className="flex items-center gap-1 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1.5 text-xs font-medium text-blue-300 hover:bg-blue-500/20"
        >
          <Flag className="h-3 w-3" />
          Report issue
        </Link>
      </div>

      {issues.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 py-6 text-center">
          <p className="text-sm text-gray-400">No reports yet for {constituencyName}.</p>
          <Link
            href={`/find-rep?ac=${constituencyId}`}
            className="mt-3 inline-block text-xs text-blue-400 hover:underline"
          >
            Be the first to flag something →
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {pending  > 0 && <StatusChip icon={Clock}         color="gray"    label={`${pending} pending`} />}
            {reviewed > 0 && <StatusChip icon={AlertTriangle} color="blue"    label={`${reviewed} under review`} />}
            {resolved > 0 && <StatusChip icon={CheckCircle2}  color="emerald" label={`${resolved} resolved`} />}
          </div>

          <ul className="space-y-2">
            {issues
              .sort((a, b) => {
                const sev = ['critical','high','medium','low'];
                const sd = sev.indexOf(a.severity) - sev.indexOf(b.severity);
                if (sd !== 0) return sd;
                return b.reportedOn.localeCompare(a.reportedOn);
              })
              .map(issue => (
                <IssueCard key={issue.id} issue={issue} />
              ))}
          </ul>
        </>
      )}
    </div>
  );
}

function IssueCard({ issue }: { issue: SeedCivicIssue }) {
  const color = CAT_COLOR[issue.category];
  return (
    <li className={`rounded-xl border border-white/10 bg-white/[0.03] p-3 ring-1 ${SEVERITY_RING[issue.severity]}`}>
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
          style={{ backgroundColor: `${color}cc` }}
        >
          {issue.category}
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-400">
          {issue.severity}
        </span>
        <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
          issue.status === 'resolved' ? 'bg-emerald-400/10 text-emerald-400'
          : issue.status === 'reviewed' ? 'bg-blue-400/10 text-blue-400'
          : 'bg-gray-400/10 text-gray-500'
        }`}>
          {issue.status}
        </span>
      </div>
      <p className="text-xs font-semibold leading-snug text-gray-200">{issue.title}</p>
      {issue.location && (
        <p className="mt-1 flex items-center gap-1 text-[10px] text-gray-500">
          <MapPin className="h-2.5 w-2.5 shrink-0" />
          {issue.location}
        </p>
      )}
      <p className="mt-1 text-[10px] text-gray-600">{issue.reportedOn} · {issue.source}</p>
    </li>
  );
}

function StatusChip({ icon: Icon, color, label }: { icon: typeof Clock; color: string; label: string }) {
  const styles: Record<string, string> = {
    gray:    'border-gray-400/20 bg-gray-400/5 text-gray-400',
    blue:    'border-blue-400/30 bg-blue-400/10 text-blue-300',
    emerald: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${styles[color]}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

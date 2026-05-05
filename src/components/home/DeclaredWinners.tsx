'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Trophy, Sparkles, Radio } from 'lucide-react';
import type { StateLiveSummary } from '@/lib/live-store';
import { parties } from '@/data/parties';
import { constituencies } from '@/data/constituencies';
import { isReElectionAc } from '@/lib/re-election';

const partyById = Object.fromEntries(parties.map((p) => [p.id, p]));
const constById = Object.fromEntries(constituencies.map((c) => [c.id, c]));

interface Props { summary: StateLiveSummary; }

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString('en-IN');
}

interface Row {
  acId: string;
  acName: string;
  candidateName: string;
  partyId: string;
  marginVotes: number;
  declared: boolean;
  declaredAt?: string;
}

function buildRows(summary: StateLiveSummary): { declared: Row[]; leading: Row[] } {
  const declaredWinners = summary.declaredWinners ?? [];
  const declaredSet = new Set(declaredWinners.map((w) => w.acId));
  const leaderByAc = summary.leaderByAc ?? {};
  const leaderNameByAc = summary.leaderNameByAc ?? {};
  const marginByAc = summary.marginByAc ?? {};

  const declared: Row[] = declaredWinners.map((w) => ({
    acId: w.acId,
    acName: constById[w.acId]?.name ?? w.acId,
    candidateName: w.candidateName,
    partyId: w.partyId,
    marginVotes: w.marginVotes,
    declared: true,
    declaredAt: w.declaredAt,
  }));
  // Newest-declared first; fall back to margin when declaredAt isn't populated yet.
  declared.sort((a, b) => {
    const at = a.declaredAt ?? '';
    const bt = b.declaredAt ?? '';
    if (at && bt) return bt.localeCompare(at);
    if (at) return -1;
    if (bt) return 1;
    return b.marginVotes - a.marginVotes;
  });

  const leading: Row[] = [];
  for (const [acId, partyId] of Object.entries(leaderByAc)) {
    if (!partyId || declaredSet.has(acId)) continue;
    // Re-election ACs have no meaningful 'leading' state — hide them here;
    // they're called out by the dedicated ReElectionNotice banner.
    if (isReElectionAc(acId)) continue;
    leading.push({
      acId,
      acName: constById[acId]?.name ?? acId,
      candidateName: leaderNameByAc[acId] ?? '—',
      partyId,
      marginVotes: marginByAc[acId] ?? 0,
      declared: false,
    });
  }
  leading.sort((a, b) => a.marginVotes - b.marginVotes); // tightest margins first — most interesting

  return { declared, leading };
}

function Card({ row, tone }: { row: Row; tone: 'declared' | 'leading' }) {
  const party = partyById[row.partyId];
  const color = party?.color ?? '#64748b';
  const freshlyDeclared =
    tone === 'declared' &&
    row.declaredAt &&
    Date.now() - new Date(row.declaredAt).getTime() < 15 * 60 * 1000;
  return (
    <Link
      href={`/constituency/${row.acId}`}
      className={`group relative overflow-hidden rounded-xl border p-4 transition hover:shadow-lg ${
        tone === 'declared'
          ? 'border-white/10 hover:border-amber-300/40'
          : 'border-white/10 hover:border-white/30'
      }`}
      style={{ background: `linear-gradient(135deg, ${color}22 0%, rgba(0,0,0,0.2) 70%)` }}
    >
      <div
        className="absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-20 blur-2xl"
        style={{ background: color }}
      />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 group-hover:text-white/70">
            <span className="truncate">{row.acName}</span>
            {freshlyDeclared && (
              <span className="shrink-0 animate-pulse rounded-full bg-amber-300/20 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-amber-200">
                NEW
              </span>
            )}
          </p>
          <p className="mt-1 truncate text-sm font-bold text-white">{row.candidateName}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
              style={{ backgroundColor: color }}
            >
              {party?.abbreviation ?? row.partyId}
            </span>
            {row.marginVotes > 0 && (
              <span className="text-[11px] text-gray-400">
                margin <span className="font-mono font-semibold text-white">{row.marginVotes.toLocaleString()}</span>
              </span>
            )}
          </div>
          {tone === 'declared' && row.declaredAt && (
            <p className="mt-1.5 text-[10px] text-gray-500">declared {timeAgo(row.declaredAt)}</p>
          )}
          {tone === 'leading' && (
            <p className="mt-1.5 text-[10px] text-gray-500">counting in progress</p>
          )}
        </div>
        {tone === 'declared' ? (
          <Trophy className="h-5 w-5 shrink-0 text-amber-300/90 drop-shadow" />
        ) : (
          <Radio className="h-5 w-5 shrink-0 animate-pulse text-red-400/80" />
        )}
      </div>
    </Link>
  );
}

export function DeclaredWinners({ summary }: Props) {
  const { declared, leading } = buildRows(summary);
  const [tab, setTab] = useState<'declared' | 'leading'>('declared');
  const total = declared.length + leading.length;
  if (total === 0) return null;
  const active = tab === 'declared' ? declared : leading;
  // If nothing declared yet, default to the Leading view so users see something.
  const effectiveTab: 'declared' | 'leading' = declared.length === 0 ? 'leading' : tab;
  const effectiveActive = effectiveTab === 'declared' ? declared : leading;

  return (
    <section className="relative border-b border-amber-500/20 px-4 py-8">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-amber-500/5 via-transparent to-emerald-500/5" />
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-200">
            <Trophy className="h-4 w-4" />
            Seats · live
            <Sparkles className="h-3.5 w-3.5 text-amber-300/70" />
          </h2>
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-0.5 text-[11px]">
            <TabBtn
              active={effectiveTab === 'declared'}
              onClick={() => setTab('declared')}
              tone="declared"
              label={`Declared · ${declared.length}`}
              disabled={declared.length === 0}
            />
            <TabBtn
              active={effectiveTab === 'leading'}
              onClick={() => setTab('leading')}
              tone="leading"
              label={`Leading · ${leading.length}`}
              disabled={leading.length === 0}
            />
          </div>
        </div>
        <p className="mb-3 text-[11px] text-gray-500">
          {effectiveTab === 'declared'
            ? 'Newest declaration first. Each card links to its constituency page.'
            : 'Currently leading but ECI has not yet declared. Tightest margins first.'}
        </p>

        {effectiveActive.length > 0 ? (
          <div className="relative">
            <div className="grid max-h-[30rem] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
              {effectiveActive.map((row) => (
                <Card key={row.acId} row={row} tone={effectiveTab} />
              ))}
            </div>
            {effectiveActive.length > 9 && (
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-slate-950 to-transparent" />
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-xs text-gray-500">
            {effectiveTab === 'declared'
              ? 'No declarations yet — check the Leading tab.'
              : 'No ACs are in the leading-but-not-declared state right now.'}
          </div>
        )}
      </div>
    </section>
  );
  // Silence unused-var when only one tab is active.
  void active;
}

function TabBtn({
  active,
  onClick,
  label,
  tone,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  tone: 'declared' | 'leading';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-3 py-1 font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? tone === 'declared'
            ? 'bg-amber-400/20 text-amber-200 shadow-inner'
            : 'bg-white/15 text-white shadow-inner'
          : 'text-gray-400 hover:bg-white/5 hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}

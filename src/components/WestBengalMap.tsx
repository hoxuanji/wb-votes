'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Users, AlertTriangle, Calendar, X, RotateCcw, BarChart2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { wbAcPaths, AC_MAP_WIDTH, AC_MAP_HEIGHT } from '@/data/wb-ac-paths';
import { constituencies } from '@/data/constituencies';
import { candidates as allCandidates } from '@/data/candidates';
import { parties } from '@/data/parties';
import { historicalResults } from '@/data/historical-results';
import { demographics } from '@/data/demographics';
import type { Constituency, Candidate, Party } from '@/types';
import type { StateLiveSummary } from '@/lib/live-store';
import { formatCurrency } from '@/lib/utils';
import { getClientElectionPhase } from '@/lib/election-phase';

// ── Types ────────────────────────────────────────────────────
type MapMode = 'phase' | 'criminal' | 'women' | 'competition' | 'wealth' | 'age' | 'incumbent2021' | 'turnout2021' | 'literacy' | 'swing' | 'liveLeader';

const BASE_MAP_MODES: { id: MapMode; label: string }[] = [
  { id: 'women',         label: 'Women Candidates' },
  { id: 'phase',         label: 'Phase'            },
  { id: 'criminal',      label: 'Criminal'         },
  { id: 'competition',   label: 'Competition'      },
  { id: 'wealth',        label: 'Wealth'           },
  { id: 'age',           label: 'Avg Age'          },
  { id: 'incumbent2021', label: '2021 Winner'      },
  { id: 'turnout2021',   label: '2021 Turnout'     },
  { id: 'literacy',      label: 'Literacy'         },
  { id: 'swing',         label: 'Swing History'    },
];

// liveLeader mode only makes sense during live/post — surfaced conditionally.
function getMapModes(phase: ReturnType<typeof getClientElectionPhase>): { id: MapMode; label: string }[] {
  if (phase === 'pre') return BASE_MAP_MODES;
  return [{ id: 'liveLeader' as MapMode, label: 'Live Leader' }, ...BASE_MAP_MODES];
}

// ── Static data ──────────────────────────────────────────────
const PHASE1_IDS = new Set([
  'c0001','c0002','c0003','c0004','c0005','c0006','c0007','c0008','c0009',
  'c0010','c0011','c0012','c0014','c0017','c0019','c0021','c0022','c0025',
  'c0026','c0027','c0028','c0029','c0030','c0034','c0036','c0038','c0040',
  'c0041','c0042','c0043','c0048','c0049','c0050','c0052','c0053','c0054',
  'c0057','c0059',
]);

const DISTRICTS = [
  'Alipurduar','Bankura','Birbhum','Cooch Behar','Dakshin Dinajpur',
  'Darjeeling','Hooghly','Howrah','Jalpaiguri','Jhargram','Kalimpong',
  'Kolkata','Malda','Murshidabad','Nadia','North 24 Parganas',
  'Paschim Bardhaman','Paschim Medinipur','Purba Bardhaman','Purba Medinipur',
  'Purulia','South 24 Parganas','Uttar Dinajpur',
];

const constituencyById: Record<string, Constituency> = {};
constituencies.forEach(c => { constituencyById[c.id] = c; });

const partyById: Record<string, Party> = {};
parties.forEach(p => { partyById[p.id] = p; });

const candidatesByConstituency: Record<string, Candidate[]> = {};
allCandidates.forEach(c => {
  if (!candidatesByConstituency[c.constituencyId]) candidatesByConstituency[c.constituencyId] = [];
  candidatesByConstituency[c.constituencyId].push(c);
});

const constituenciesByDistrict: Record<string, Constituency[]> = {};
constituencies.forEach(c => {
  if (!constituenciesByDistrict[c.district]) constituenciesByDistrict[c.district] = [];
  constituenciesByDistrict[c.district].push(c);
});

// Pre-compute per-constituency stats
interface ConstStat { crimRate: number; womenRate: number; candCount: number; avgAssets: number; avgAge: number; }
const constStats: Record<string, ConstStat> = {};
constituencies.forEach(c => {
  const cands = candidatesByConstituency[c.id] ?? [];
  const total = cands.length;
  const withAge = cands.filter(cd => (cd.age ?? 0) > 0);
  const withAssets = cands.filter(cd => cd.totalAssets > 0);
  constStats[c.id] = {
    crimRate:   total > 0 ? cands.filter(cd => cd.criminalCases > 0).length / total : 0,
    womenRate:  total > 0 ? cands.filter(cd => cd.gender === 'Female').length / total : 0,
    candCount:  total,
    avgAssets:  withAssets.length > 0 ? withAssets.reduce((s, cd) => s + cd.totalAssets, 0) / withAssets.length : 0,
    avgAge:     withAge.length > 0 ? withAge.reduce((s, cd) => s + cd.age, 0) / withAge.length : 0,
  };
});

const pathIdSet = new Set(wbAcPaths.map(p => p.id));
const MISSING_PATH_IDS = new Set(constituencies.filter(c => !pathIdSet.has(c.id)).map(c => c.id));

// Historical-results lookups: winner-party per year per AC
const winner2021ById: Record<string, { partyId: string; partyAbbr: string; turnoutPct: number; name: string }> = {};
const winnersByYearByAc: Record<string, Record<number, string>> = {};
for (const r of historicalResults) {
  if (r.year === 2021) {
    winner2021ById[r.constituencyId] = {
      partyId:   r.winner.partyId,
      partyAbbr: r.winner.partyAbbr,
      turnoutPct: r.turnoutPct,
      name:      r.winner.name,
    };
  }
  if (!winnersByYearByAc[r.constituencyId]) winnersByYearByAc[r.constituencyId] = {};
  winnersByYearByAc[r.constituencyId][r.year] = r.winner.partyId;
}

// Demographics lookup: literacy per AC (via district)
const demographicsById: Record<string, (typeof demographics)[number]> = {};
for (const d of demographics) demographicsById[d.constituencyId] = d;

// ── Phase colors ─────────────────────────────────────────────
const PHASE1_FILL  = '#3b82f6';
const PHASE2_FILL  = '#a78bfa';
const PHASE1_HOVER = '#1d4ed8';
const PHASE2_HOVER = '#6d28d9';
const PHASE1_DIM   = '#bfdbfe';
const PHASE2_DIM   = '#ddd6fe';

// ── Color interpolation ───────────────────────────────────────
function lerpColor(c1: [number,number,number], c2: [number,number,number], t: number): string {
  const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
  const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
  const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
  return `rgb(${r},${g},${b})`;
}

// ── Animated viewBox ──────────────────────────────────────────
function useAnimatedViewBox(target: string) {
  const currentRef = useRef([0, 0, AC_MAP_WIDTH, AC_MAP_HEIGHT]);
  const [displayed, setDisplayed] = useState(target);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const tp = target.split(' ').map(Number);
    const step = () => {
      const cur = currentRef.current;
      const next = cur.map((c, i) => c + (tp[i] - c) * 0.18);
      currentRef.current = next;
      setDisplayed(next.map(v => v.toFixed(2)).join(' '));
      if (cur.some((c, i) => Math.abs(c - tp[i]) > 0.4)) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        currentRef.current = tp;
        setDisplayed(target);
      }
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target]);

  return displayed;
}

// ── Mini candidate card ──────────────────────────────────────
function MiniCandidateCard({ candidate }: { candidate: Candidate }) {
  const party = partyById[candidate.partyId];
  const photoUrl = candidate.photoUrl
    ? candidate.photoUrl.replace(/backgroundColor=[^&]+/, `backgroundColor=${(party?.color ?? '#64748b').replace('#', '')}`)
    : null;

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/5 p-2.5 hover:border-blue-500/25 hover:bg-blue-500/10 transition-colors">
      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full" style={{ borderColor: (party?.color ?? '#ccc') + '66', borderWidth: 2, borderStyle: 'solid' }}>
        {photoUrl ? (
          <Image src={photoUrl} alt={candidate.name} fill className="object-cover" sizes="36px" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: party?.color ?? '#64748b' }}>
            {candidate.name.charAt(0)}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-white">{candidate.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: party?.color ?? '#64748b' }} />
          <span className="text-[10px] text-gray-500">{party?.abbreviation ?? candidate.partyId}</span>
          {candidate.criminalCases > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-red-400">
              <AlertTriangle className="h-2.5 w-2.5" />
              {candidate.criminalCases}
            </span>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[10px] text-gray-400">{formatCurrency(candidate.totalAssets)}</p>
      </div>
    </div>
  );
}

// ── Hover Stats Panel ────────────────────────────────────────
function HoverStatsPanel({ constituencyId }: { constituencyId: string }) {
  const c = constituencyById[constituencyId];
  const cands = candidatesByConstituency[constituencyId] ?? [];
  const isPhase1 = PHASE1_IDS.has(constituencyId);
  if (!c) return null;

  const partyCounts: Record<string, number> = {};
  cands.forEach(cand => { partyCounts[cand.partyId] = (partyCounts[cand.partyId] || 0) + 1; });
  const topParties = Object.entries(partyCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const withCriminal = cands.filter(c => c.criminalCases > 0).length;
  const avgAssets = cands.length ? Math.round(cands.reduce((s, c) => s + c.totalAssets, 0) / cands.length) : 0;

  return (
    <div className="p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white">{c.name}</h3>
          <p className="text-xs text-gray-500">{c.district} · #{c.assemblyNumber}</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {c.reservation !== 'General' && (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-400">{c.reservation}</span>
          )}
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${isPhase1 ? 'bg-blue-100 text-blue-300' : 'bg-white/10 text-gray-500'}`}>
            {isPhase1 ? 'Phase 1 · 23 Apr' : 'Phase 2 · 29 Apr'}
          </span>
        </div>
      </div>
      {cands.length > 0 ? (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-white/5 p-2 text-center">
              <p className="text-base font-bold text-white">{cands.length}</p>
              <p className="text-[10px] text-gray-500">Candidates</p>
            </div>
            <div className="rounded-xl bg-red-50 p-2 text-center">
              <p className="text-base font-bold text-red-400">{withCriminal}</p>
              <p className="text-[10px] text-gray-500">With Cases</p>
            </div>
            <div className="rounded-xl bg-blue-50 p-2 text-center">
              <p className="text-sm font-bold text-blue-400 leading-tight break-all">{formatCurrency(avgAssets)}</p>
              <p className="text-[10px] text-gray-500">Avg Assets</p>
            </div>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Party Breakdown</p>
            <div className="space-y-1.5">
              {topParties.map(([partyId, count]) => {
                const party = partyById[partyId];
                const pct = Math.round((count / cands.length) * 100);
                return (
                  <div key={partyId} className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: party?.color ?? '#ccc' }} />
                    <span className="w-12 shrink-0 truncate text-xs text-gray-300">{party?.abbreviation ?? partyId}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: party?.color ?? '#ccc' }} />
                    </div>
                    <span className="w-4 shrink-0 text-right text-[10px] text-gray-500">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="mt-4 text-center text-[10px] text-gray-400">Click to view all candidates →</p>
        </>
      ) : (
        <div className="flex flex-col items-center py-6 text-center">
          <Calendar className="mb-2 h-8 w-8 text-gray-200" />
          <p className="text-sm font-medium text-gray-400">Data coming soon</p>
        </div>
      )}
    </div>
  );
}

// ── Click Panel ──────────────────────────────────────────────
function ConstituencyPanel({ constituencyId, onClose }: { constituencyId: string; onClose: () => void }) {
  const router = useRouter();
  const c = constituencyById[constituencyId];
  const cands = candidatesByConstituency[constituencyId] ?? [];
  const isPhase1 = PHASE1_IDS.has(constituencyId);
  if (!c) return null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-white">{c.name}</h3>
            {c.reservation !== 'General' && (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-400">{c.reservation}</span>
            )}
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${isPhase1 ? 'bg-blue-100 text-blue-300' : 'bg-white/10 text-gray-500'}`}>
              {isPhase1 ? 'Phase 1 · 23 Apr' : 'Phase 2 · 29 Apr'}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-gray-400">{c.district} · #{c.assemblyNumber}</p>
        </div>
        <button onClick={onClose} className="shrink-0 rounded-lg p-1 transition-colors hover:bg-white/10">
          <X className="h-4 w-4 text-gray-400" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {cands.length > 0 ? (
          <>
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1 text-xs font-semibold text-gray-300">
                <Users className="h-3.5 w-3.5" /> {cands.length} Candidates
              </span>
              <button onClick={() => router.push(`/constituency/${constituencyId}`)} className="text-xs font-semibold text-blue-400 hover:text-blue-800">
                View All →
              </button>
            </div>
            <div className="space-y-1.5">
              {cands.slice(0, 6).map(cand => (
                <button key={cand.id} onClick={() => router.push(`/candidate/${cand.id}`)} className="w-full text-left">
                  <MiniCandidateCard candidate={cand} />
                </button>
              ))}
              {cands.length > 6 && (
                <button onClick={() => router.push(`/constituency/${constituencyId}`)} className="w-full rounded-lg border border-dashed border-blue-300 py-2 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-50">
                  +{cands.length - 6} more candidates
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Calendar className="mb-2 h-8 w-8 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">{isPhase1 ? 'Phase 1 · 23 April 2026' : 'Phase 2 · 29 April 2026'}</p>
          </div>
        )}
      </div>
      {cands.length > 0 && (
        <div className="border-t border-gray-100 px-4 py-2">
          <button onClick={() => router.push(`/constituency/${constituencyId}`)} className="w-full rounded-lg bg-blue-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700">
            Full Constituency Page →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Insights Panel ────────────────────────────────────────────
function InsightsPanel({ mapMode, selectedDistrict, liveSummary, liveStatus }: { mapMode: MapMode; selectedDistrict: string | null; liveSummary?: StateLiveSummary | null; liveStatus?: 'idle' | 'loading' | 'ok' | 'no-data' | 'error' }) {
  const allConsts = selectedDistrict ? (constituenciesByDistrict[selectedDistrict] ?? []) : constituencies;

  const sorted = useMemo(() => {
    const withStats = allConsts.filter(c => constStats[c.id]?.candCount > 0);
    switch (mapMode) {
      case 'criminal':
        return [...withStats].sort((a, b) => (constStats[b.id]?.crimRate ?? 0) - (constStats[a.id]?.crimRate ?? 0));
      case 'women':
        return [...withStats].sort((a, b) => (constStats[b.id]?.womenRate ?? 0) - (constStats[a.id]?.womenRate ?? 0));
      case 'competition':
        return [...withStats].sort((a, b) => (constStats[b.id]?.candCount ?? 0) - (constStats[a.id]?.candCount ?? 0));
      case 'wealth':
        return [...withStats].sort((a, b) => (constStats[b.id]?.avgAssets ?? 0) - (constStats[a.id]?.avgAssets ?? 0));
      case 'age':
        return [...withStats].filter(c => (constStats[c.id]?.avgAge ?? 0) > 0)
          .sort((a, b) => (constStats[b.id]?.avgAge ?? 0) - (constStats[a.id]?.avgAge ?? 0));
      default:
        return allConsts;
    }
  }, [mapMode, allConsts]);

  if (mapMode === 'liveLeader') {
    const parties2026 = liveSummary
      ? Object.entries(liveSummary.leadingByParty).sort((a, b) => b[1] - a[1])
      : [];
    const tightest = liveSummary?.tightestMargins?.slice(0, 5) ?? [];
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-bold text-gray-200">Live leader by AC</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {liveStatus === 'ok' && liveSummary
              ? `${liveSummary.declared}/${liveSummary.totalACs} declared · polls every 30s`
              : liveStatus === 'loading' ? 'Fetching live data…'
              : liveStatus === 'no-data' ? 'Counting hasn\'t started yet'
              : liveStatus === 'error' ? 'Connection issue — retrying'
              : 'Waiting for live data'}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {parties2026.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Party lead summary</p>
              <div className="space-y-1.5">
                {parties2026.map(([partyId, count]) => {
                  const party = partyById[partyId];
                  const totalACs = liveSummary?.totalACs ?? 294;
                  const pct = Math.round((count / totalACs) * 100);
                  return (
                    <div key={partyId} className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: party?.color ?? '#64748b' }} />
                      <span className="w-12 shrink-0 truncate text-xs text-gray-300">{party?.abbreviation ?? partyId}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: party?.color ?? '#64748b' }} />
                      </div>
                      <span className="w-8 shrink-0 text-right text-[10px] font-bold text-gray-400">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {tightest.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Tightest contests</p>
              <div className="space-y-1.5">
                {tightest.map(m => {
                  const c = constituencyById[m.acId];
                  const party = m.leaderPartyId ? partyById[m.leaderPartyId] : null;
                  return (
                    <Link key={m.acId} href={`/constituency/${m.acId}`} className="flex items-center gap-2 rounded-lg p-2 hover:bg-white/5 transition-colors">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: party?.color ?? '#64748b' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-200 truncate">{c?.name ?? m.acId}</p>
                        <p className="text-[10px] text-gray-400">{c?.district ?? ''} · {party?.abbreviation ?? '—'} leading</p>
                      </div>
                      <p className="shrink-0 text-[10px] font-bold text-amber-300">{m.marginVotes.toLocaleString()} votes</p>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
          {liveStatus === 'no-data' && (
            <div className="rounded-xl border border-dashed border-white/10 p-4 text-center">
              <p className="text-xs text-gray-400">No live data yet. The dashboard goes live once the ECI scraper starts publishing results.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (mapMode === 'phase') {
    const p1count = allConsts.filter(c => PHASE1_IDS.has(c.id)).length;
    const p2count = allConsts.length - p1count;
    const totalCands = allConsts.reduce((s, c) => s + (constStats[c.id]?.candCount ?? 0), 0);
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-bold text-gray-200">Voting Schedule</h3>
          <p className="text-xs text-gray-400 mt-0.5">{selectedDistrict ?? 'West Bengal'} · {allConsts.length} constituencies</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-blue-500/10 border border-blue-500/25 p-3 text-center">
              <div className="text-2xl font-extrabold text-blue-400">{p1count}</div>
              <div className="text-[11px] font-semibold text-blue-300 mt-0.5">Phase 1</div>
              <div className="text-[10px] text-blue-400">23 Apr 2026</div>
              <div className="mt-1.5 text-[10px] font-medium text-green-300 bg-green-50 rounded-full px-2 py-0.5">Completed</div>
            </div>
            <div className="rounded-xl bg-violet-500/10 border border-violet-500/25 p-3 text-center">
              <div className="text-2xl font-extrabold text-violet-400">{p2count}</div>
              <div className="text-[11px] font-semibold text-violet-300 mt-0.5">Phase 2</div>
              <div className="text-[10px] text-violet-400">29 Apr 2026</div>
              <div className="mt-1.5 text-[10px] font-medium text-violet-400 bg-violet-50 rounded-full px-2 py-0.5 border border-violet-200">Upcoming</div>
            </div>
          </div>
          <div className="rounded-xl bg-white/5 p-3 text-center">
            <div className="text-xl font-bold text-gray-200">{totalCands.toLocaleString()}</div>
            <div className="text-[11px] text-gray-500">Total candidates</div>
          </div>
          <div className="rounded-xl border border-gray-100 p-3 text-center">
            <p className="text-xs text-gray-500 leading-relaxed">
              Click any constituency on the map to preview candidates, or select a district above to zoom in.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (mapMode === 'criminal') {
    const avgCrim = allConsts.length ? allConsts.reduce((s, c) => s + (constStats[c.id]?.crimRate ?? 0), 0) / allConsts.filter(c => constStats[c.id]?.candCount > 0).length : 0;
    const top5 = sorted.slice(0, 5);
    const bottom5 = [...sorted].reverse().slice(0, 5);
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-bold text-gray-200">Criminal Backgrounds</h3>
          <p className="text-xs text-gray-400 mt-0.5">% of candidates with pending cases</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center gap-3 rounded-xl bg-red-500/10 border border-red-500/25 p-3">
            <AlertTriangle className="h-6 w-6 shrink-0 text-red-400" />
            <div>
              <div className="text-lg font-bold text-red-400">{(avgCrim * 100).toFixed(0)}%</div>
              <div className="text-[11px] text-red-400">Avg criminal rate per seat</div>
            </div>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Highest criminal rate</p>
            <div className="space-y-1.5">
              {top5.map(c => {
                const rate = constStats[c.id]?.crimRate ?? 0;
                return (
                  <Link key={c.id} href={`/constituency/${c.id}`} className="flex items-center gap-2 rounded-lg p-2 hover:bg-white/5 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-200 truncate">{c.name}</p>
                      <p className="text-[10px] text-gray-400">{c.district}</p>
                    </div>
                    <div className="shrink-0 w-24">
                      <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-red-400" style={{ width: `${rate * 100}%` }} />
                      </div>
                      <p className="text-right text-[10px] font-bold text-red-400 mt-0.5">{(rate * 100).toFixed(0)}%</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Cleanest seats</p>
            <div className="space-y-1.5">
              {bottom5.map(c => {
                const rate = constStats[c.id]?.crimRate ?? 0;
                return (
                  <Link key={c.id} href={`/constituency/${c.id}`} className="flex items-center gap-2 rounded-lg p-2 hover:bg-white/5 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-200 truncate">{c.name}</p>
                      <p className="text-[10px] text-gray-400">{c.district}</p>
                    </div>
                    <p className="shrink-0 text-[10px] font-bold text-green-300">{(rate * 100).toFixed(0)}%</p>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mapMode === 'women') {
    const womenConsts = allConsts.filter(c => constStats[c.id]?.candCount > 0);
    const avgWomen = womenConsts.length ? womenConsts.reduce((s, c) => s + (constStats[c.id]?.womenRate ?? 0), 0) / womenConsts.length : 0;
    const totalWomen = allCandidates.filter(c => c.gender === 'Female').length;
    const top5 = sorted.slice(0, 5);
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-bold text-gray-200">Women Representation</h3>
          <p className="text-xs text-gray-400 mt-0.5">Share of women candidates per seat</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/25 p-3 text-center">
              <div className="text-xl font-bold text-fuchsia-300">{totalWomen}</div>
              <div className="text-[11px] text-fuchsia-400">Women candidates</div>
            </div>
            <div className="rounded-xl bg-white/5 p-3 text-center">
              <div className="text-xl font-bold text-gray-200">{(avgWomen * 100).toFixed(1)}%</div>
              <div className="text-[11px] text-gray-500">Avg per seat</div>
            </div>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Highest women representation</p>
            <div className="space-y-1.5">
              {top5.map(c => {
                const rate = constStats[c.id]?.womenRate ?? 0;
                const wCount = Math.round(rate * (constStats[c.id]?.candCount ?? 0));
                return (
                  <Link key={c.id} href={`/constituency/${c.id}`} className="flex items-center gap-2 rounded-lg p-2 hover:bg-white/5 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-200 truncate">{c.name}</p>
                      <p className="text-[10px] text-gray-400">{wCount} of {constStats[c.id]?.candCount} candidates</p>
                    </div>
                    <div className="shrink-0 w-24">
                      <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-fuchsia-400" style={{ width: `${rate * 100}%` }} />
                      </div>
                      <p className="text-right text-[10px] font-bold text-fuchsia-300 mt-0.5">{(rate * 100).toFixed(0)}%</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // competition
  const avgCands = allConsts.length ? allConsts.reduce((s, c) => s + (constStats[c.id]?.candCount ?? 0), 0) / allConsts.filter(c => constStats[c.id]?.candCount > 0).length : 0;
  const top5 = sorted.slice(0, 5);
  const bottom5 = [...sorted].reverse().slice(0, 5);
  const maxCount = top5[0] ? constStats[top5[0].id]?.candCount ?? 1 : 1;

  if (mapMode === 'wealth') {
    const withAssets = allConsts.filter(c => constStats[c.id]?.avgAssets > 0);
    const avgA = withAssets.length ? withAssets.reduce((s, c) => s + constStats[c.id].avgAssets, 0) / withAssets.length : 0;
    const maxA = withAssets.length ? Math.max(...withAssets.map(c => constStats[c.id].avgAssets)) : 1;
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-bold text-gray-200">Candidate Wealth</h3>
          <p className="text-xs text-gray-400 mt-0.5">Avg declared assets per constituency</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="rounded-xl bg-green-500/10 border border-green-500/25 p-3 text-center">
            <div className="text-lg font-bold text-green-400">{formatCurrency(avgA)}</div>
            <div className="text-[11px] text-green-300">State avg per candidate</div>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Wealthiest candidate pools</p>
            <div className="space-y-1.5">
              {top5.map(c => {
                const a = constStats[c.id]?.avgAssets ?? 0;
                return (
                  <Link key={c.id} href={`/constituency/${c.id}`} className="flex items-center gap-2 rounded-lg p-2 hover:bg-white/5 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-200 truncate">{c.name}</p>
                      <p className="text-[10px] text-gray-400">{c.district}</p>
                    </div>
                    <div className="shrink-0 w-24">
                      <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-green-500" style={{ width: `${(a / maxA) * 100}%` }} />
                      </div>
                      <p className="text-right text-[10px] font-bold text-green-400 mt-0.5">{formatCurrency(a)}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Least wealthy</p>
            <div className="space-y-1.5">
              {bottom5.map(c => {
                const a = constStats[c.id]?.avgAssets ?? 0;
                return (
                  <Link key={c.id} href={`/constituency/${c.id}`} className="flex items-center gap-2 rounded-lg p-2 hover:bg-white/5 transition-colors">
                    <div className="flex-1 min-w-0"><p className="text-xs font-semibold text-gray-200 truncate">{c.name}</p></div>
                    <p className="shrink-0 text-[10px] font-bold text-gray-500">{formatCurrency(a)}</p>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mapMode === 'age') {
    const withAge = allConsts.filter(c => constStats[c.id]?.avgAge > 0);
    const avgA = withAge.length ? withAge.reduce((s, c) => s + constStats[c.id].avgAge, 0) / withAge.length : 0;
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-bold text-gray-200">Candidate Age</h3>
          <p className="text-xs text-gray-400 mt-0.5">Avg age of candidates per constituency</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 p-3 text-center">
            <div className="text-lg font-bold text-amber-400">{avgA.toFixed(1)} yrs</div>
            <div className="text-[11px] text-amber-300">State avg candidate age</div>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Oldest candidate pools</p>
            <div className="space-y-1.5">
              {top5.map(c => {
                const a = constStats[c.id]?.avgAge ?? 0;
                return (
                  <Link key={c.id} href={`/constituency/${c.id}`} className="flex items-center gap-2 rounded-lg p-2 hover:bg-white/5 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-200 truncate">{c.name}</p>
                      <p className="text-[10px] text-gray-400">{c.district}</p>
                    </div>
                    <p className="shrink-0 text-[10px] font-bold text-amber-400">{a.toFixed(1)} yrs</p>
                  </Link>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Youngest candidate pools</p>
            <div className="space-y-1.5">
              {bottom5.map(c => {
                const a = constStats[c.id]?.avgAge ?? 0;
                return (
                  <Link key={c.id} href={`/constituency/${c.id}`} className="flex items-center gap-2 rounded-lg p-2 hover:bg-white/5 transition-colors">
                    <div className="flex-1 min-w-0"><p className="text-xs font-semibold text-gray-200 truncate">{c.name}</p></div>
                    <p className="shrink-0 text-[10px] font-bold text-green-300">{a.toFixed(1)} yrs</p>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── 2021 Winner (incumbent party) ────────────────────────────
  if (mapMode === 'incumbent2021') {
    const seatsByParty = new Map<string, number>();
    const missing: string[] = [];
    for (const c of allConsts) {
      const w = winner2021ById[c.id];
      if (!w) { missing.push(c.id); continue; }
      seatsByParty.set(w.partyId, (seatsByParty.get(w.partyId) ?? 0) + 1);
    }
    const ranked = Array.from(seatsByParty.entries()).sort((a, b) => b[1] - a[1]);
    const total = allConsts.length - missing.length;
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-bold text-gray-200">2021 Winners</h3>
          <p className="text-xs text-gray-400 mt-0.5">Party that won each seat in the 2021 Assembly</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="rounded-xl bg-white/5 p-3 text-center">
            <div className="text-2xl font-extrabold text-white">{total}</div>
            <div className="text-[11px] text-gray-500">{selectedDistrict ?? 'Seats in West Bengal'}</div>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Seats by party</p>
            <div className="space-y-1.5">
              {ranked.map(([pid, n]) => {
                const p = partyById[pid];
                const pct = total > 0 ? (n / total) * 100 : 0;
                return (
                  <div key={pid} className="flex items-center gap-2">
                    <span className="w-14 shrink-0 truncate text-xs font-semibold text-gray-300">{p?.abbreviation ?? pid}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: p?.color ?? '#64748b' }} />
                    </div>
                    <span className="w-10 shrink-0 text-right text-[10px] font-bold text-white">{n}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {missing.length > 0 && (
            <p className="text-[11px] text-gray-500">{missing.length} seat(s) missing 2021 data</p>
          )}
        </div>
      </div>
    );
  }

  // ── 2021 Turnout ─────────────────────────────────────────────
  if (mapMode === 'turnout2021') {
    const withTurnout = allConsts
      .map(c => ({ c, t: winner2021ById[c.id]?.turnoutPct ?? 0 }))
      .filter(x => x.t > 0);
    const avg = withTurnout.length ? withTurnout.reduce((s, x) => s + x.t, 0) / withTurnout.length : 0;
    const top5 = [...withTurnout].sort((a, b) => b.t - a.t).slice(0, 5);
    const bottom5 = [...withTurnout].sort((a, b) => a.t - b.t).slice(0, 5);
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-bold text-gray-200">2021 Voter Turnout</h3>
          <p className="text-xs text-gray-400 mt-0.5">Share of electors who voted in 2021</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="rounded-xl bg-blue-500/10 border border-blue-500/25 p-3 text-center">
            <div className="text-lg font-bold text-blue-300">{avg.toFixed(1)}%</div>
            <div className="text-[11px] text-blue-400">{selectedDistrict ?? 'State'} avg turnout</div>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Highest turnout</p>
            <div className="space-y-1.5">
              {top5.map(({ c, t }) => (
                <Link key={c.id} href={`/constituency/${c.id}`} className="flex items-center gap-2 rounded-lg p-2 hover:bg-white/5 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-200 truncate">{c.name}</p>
                    <p className="text-[10px] text-gray-400">{c.district}</p>
                  </div>
                  <p className="shrink-0 text-[10px] font-bold text-blue-300">{t.toFixed(1)}%</p>
                </Link>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Lowest turnout</p>
            <div className="space-y-1.5">
              {bottom5.map(({ c, t }) => (
                <Link key={c.id} href={`/constituency/${c.id}`} className="flex items-center gap-2 rounded-lg p-2 hover:bg-white/5 transition-colors">
                  <div className="flex-1 min-w-0"><p className="text-xs font-semibold text-gray-200 truncate">{c.name}</p></div>
                  <p className="shrink-0 text-[10px] font-bold text-amber-400">{t.toFixed(1)}%</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Literacy ─────────────────────────────────────────────────
  if (mapMode === 'literacy') {
    const withLit = allConsts
      .map(c => ({ c, lit: demographicsById[c.id]?.literacyRate }))
      .filter((x): x is { c: Constituency; lit: number } => typeof x.lit === 'number');
    const avg = withLit.length ? withLit.reduce((s, x) => s + x.lit, 0) / withLit.length : 0;
    const top5 = [...withLit].sort((a, b) => b.lit - a.lit).slice(0, 5);
    const bottom5 = [...withLit].sort((a, b) => a.lit - b.lit).slice(0, 5);
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-bold text-gray-200">Literacy Rate</h3>
          <p className="text-xs text-gray-400 mt-0.5">Census 2011 district-level literacy</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/25 p-3 text-center">
            <div className="text-lg font-bold text-emerald-300">{avg.toFixed(1)}%</div>
            <div className="text-[11px] text-emerald-400">{selectedDistrict ?? 'State'} avg literacy</div>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Most literate districts</p>
            <div className="space-y-1.5">
              {top5.map(({ c, lit }) => (
                <Link key={c.id} href={`/constituency/${c.id}`} className="flex items-center gap-2 rounded-lg p-2 hover:bg-white/5 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-200 truncate">{c.name}</p>
                    <p className="text-[10px] text-gray-400">{c.district}</p>
                  </div>
                  <p className="shrink-0 text-[10px] font-bold text-emerald-300">{lit.toFixed(1)}%</p>
                </Link>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Lowest literacy</p>
            <div className="space-y-1.5">
              {bottom5.map(({ c, lit }) => (
                <Link key={c.id} href={`/constituency/${c.id}`} className="flex items-center gap-2 rounded-lg p-2 hover:bg-white/5 transition-colors">
                  <div className="flex-1 min-w-0"><p className="text-xs font-semibold text-gray-200 truncate">{c.name}</p></div>
                  <p className="shrink-0 text-[10px] font-bold text-amber-400">{lit.toFixed(1)}%</p>
                </Link>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-gray-500">Figures are district-level; AC-level pending ECI voter-roll ingestion.</p>
        </div>
      </div>
    );
  }

  // ── Swing history ────────────────────────────────────────────
  if (mapMode === 'swing') {
    const counts = { 1: 0, 2: 0, 3: 0 } as Record<number, number>;
    const withSwing: { c: Constituency; distinct: number; years: number }[] = [];
    for (const c of allConsts) {
      const by = winnersByYearByAc[c.id] ?? {};
      const years = Object.keys(by).length;
      if (years === 0) continue;
      const distinct = new Set(Object.values(by)).size;
      counts[distinct] = (counts[distinct] ?? 0) + 1;
      withSwing.push({ c, distinct, years });
    }
    const mostSwing = withSwing.filter(x => x.distinct >= 2).sort((a, b) => b.distinct - a.distinct).slice(0, 8);
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-bold text-gray-200">Swing History</h3>
          <p className="text-xs text-gray-400 mt-0.5">Distinct winning parties across tracked elections</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-slate-700/30 border border-slate-500/25 p-3 text-center">
              <div className="text-xl font-bold text-slate-200">{counts[1] ?? 0}</div>
              <div className="text-[10px] text-slate-400">Safe (1 party)</div>
            </div>
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 p-3 text-center">
              <div className="text-xl font-bold text-amber-300">{counts[2] ?? 0}</div>
              <div className="text-[10px] text-amber-400">Shifted (2)</div>
            </div>
            <div className="rounded-xl bg-red-500/10 border border-red-500/25 p-3 text-center">
              <div className="text-xl font-bold text-red-300">{counts[3] ?? 0}</div>
              <div className="text-[10px] text-red-400">Swing (3)</div>
            </div>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Most volatile seats</p>
            <div className="space-y-1.5">
              {mostSwing.length === 0 && (
                <p className="text-[11px] text-gray-500">Need 2011 / 2016 backfill to surface real swings.</p>
              )}
              {mostSwing.map(({ c, distinct, years }) => (
                <Link key={c.id} href={`/constituency/${c.id}`} className="flex items-center gap-2 rounded-lg p-2 hover:bg-white/5 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-200 truncate">{c.name}</p>
                    <p className="text-[10px] text-gray-400">{c.district}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-300">
                    {distinct} parties / {years} yrs
                  </span>
                </Link>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-gray-500">Only 2021 is fully seeded today — run the historical backfill for 2011 / 2016 to make this meaningful.</p>
        </div>
      </div>
    );
  }

  // competition (default fallthrough)
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 px-4 py-3">
        <h3 className="text-sm font-bold text-gray-200">Electoral Competition</h3>
        <p className="text-xs text-gray-400 mt-0.5">Number of candidates per constituency</p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex items-center gap-3 rounded-xl bg-blue-500/10 border border-blue-500/25 p-3">
          <BarChart2 className="h-6 w-6 shrink-0 text-blue-400" />
          <div>
            <div className="text-lg font-bold text-blue-400">{avgCands.toFixed(1)}</div>
            <div className="text-[11px] text-blue-500">Avg candidates per seat</div>
          </div>
        </div>
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Most contested seats</p>
          <div className="space-y-1.5">
            {top5.map(c => {
              const cnt = constStats[c.id]?.candCount ?? 0;
              return (
                <Link key={c.id} href={`/constituency/${c.id}`} className="flex items-center gap-2 rounded-lg p-2 hover:bg-white/5 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-200 truncate">{c.name}</p>
                    <p className="text-[10px] text-gray-400">{c.district}</p>
                  </div>
                  <div className="shrink-0 w-24">
                    <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full bg-blue-400" style={{ width: `${(cnt / maxCount) * 100}%` }} />
                    </div>
                    <p className="text-right text-[10px] font-bold text-blue-400 mt-0.5">{cnt} cands</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Least contested</p>
          <div className="space-y-1.5">
            {bottom5.map(c => {
              const cnt = constStats[c.id]?.candCount ?? 0;
              return (
                <Link key={c.id} href={`/constituency/${c.id}`} className="flex items-center gap-2 rounded-lg p-2 hover:bg-white/5 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-200 truncate">{c.name}</p>
                  </div>
                  <p className="shrink-0 text-[10px] font-bold text-gray-500">{cnt} cands</p>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Map Component ───────────────────────────────────────
export function WestBengalMap({ defaultMode }: { defaultMode?: string } = {}) {
  const [hoveredId, setHoveredId]           = useState<string | null>(null);
  const [panel, setPanel]                   = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const phase = getClientElectionPhase();
  const MAP_MODES = useMemo(() => getMapModes(phase), [phase]);
  const initialMode: MapMode = useMemo(() => {
    const allowed = new Set(MAP_MODES.map(m => m.id));
    if (defaultMode && allowed.has(defaultMode as MapMode)) return defaultMode as MapMode;
    return 'women';
  }, [defaultMode, MAP_MODES]);
  const [mapMode, setMapMode] = useState<MapMode>(initialMode);
  const mapRowRef = useRef<HTMLDivElement>(null);

  // Live summary — only populated when the user is on the liveLeader mode, and
  // polled on its own cadence (30s) so it doesn't thrash other map modes.
  const [liveSummary, setLiveSummary] = useState<StateLiveSummary | null>(null);
  const [liveStatus, setLiveStatus]   = useState<'idle' | 'loading' | 'ok' | 'no-data' | 'error'>('idle');
  useEffect(() => {
    if (mapMode !== 'liveLeader') return;
    let cancelled = false;
    setLiveStatus(prev => (prev === 'ok' ? 'ok' : 'loading'));
    async function tick() {
      try {
        const res = await fetch('/api/live/state', { cache: 'no-store' });
        const body = await res.json();
        if (cancelled) return;
        if (body.status === 'ok' && body.summary) {
          setLiveSummary(body.summary as StateLiveSummary);
          setLiveStatus('ok');
        } else {
          setLiveStatus('no-data');
        }
      } catch {
        if (!cancelled) setLiveStatus('error');
      }
    }
    tick();
    const id = setInterval(tick, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [mapMode]);

  const districtConstIds = useMemo(() => {
    if (!selectedDistrict) return null;
    return new Set((constituenciesByDistrict[selectedDistrict] ?? []).map(c => c.id));
  }, [selectedDistrict]);

  const targetViewBox = useMemo(() => {
    if (!selectedDistrict || !districtConstIds) return `0 0 ${AC_MAP_WIDTH} ${AC_MAP_HEIGHT}`;
    const distPaths = wbAcPaths.filter(p => districtConstIds.has(p.id));
    if (distPaths.length === 0) return `0 0 ${AC_MAP_WIDTH} ${AC_MAP_HEIGHT}`;
    const xs = distPaths.map(p => p.centroid.x);
    const ys = distPaths.map(p => p.centroid.y);
    const pad = 35;
    return `${Math.min(...xs) - pad} ${Math.min(...ys) - pad} ${Math.max(...xs) - Math.min(...xs) + pad * 2} ${Math.max(...ys) - Math.min(...ys) + pad * 2}`;
  }, [selectedDistrict, districtConstIds]);

  const viewBox = useAnimatedViewBox(targetViewBox);

  // Pre-compute fills for data-driven modes
  const computedFills = useMemo(() => {
    if (mapMode === 'phase') return null;
    const fills: Record<string, string> = {};

    // For wealth/age we need global min/max for proper scaling
    const allStats = Object.values(constStats).filter(s => s.candCount > 0);
    const maxAssets = allStats.length ? Math.max(...allStats.map(s => s.avgAssets)) : 1;
    const minAge = allStats.length ? Math.min(...allStats.filter(s => s.avgAge > 0).map(s => s.avgAge)) : 30;
    const maxAge = allStats.length ? Math.max(...allStats.filter(s => s.avgAge > 0).map(s => s.avgAge)) : 70;

    // Global literacy range for gradient scaling
    const allLits = demographics.map(d => d.literacyRate).filter((v): v is number => typeof v === 'number');
    const minLit = allLits.length ? Math.min(...allLits) : 55;
    const maxLit = allLits.length ? Math.max(...allLits) : 90;

    for (const ac of wbAcPaths) {
      // Live leader: discrete party color if AC has a leader, grey otherwise.
      if (mapMode === 'liveLeader') {
        const partyId = liveSummary?.leaderByAc?.[ac.id] ?? null;
        fills[ac.id] = partyId ? (partyById[partyId]?.color ?? '#64748b') : '#1f2937';
        continue;
      }

      // Incumbent 2021: discrete party color
      if (mapMode === 'incumbent2021') {
        const w = winner2021ById[ac.id];
        fills[ac.id] = w ? (partyById[w.partyId]?.color ?? '#64748b') : '#1f2937';
        continue;
      }

      // Turnout 2021: gradient grey → blue
      if (mapMode === 'turnout2021') {
        const w = winner2021ById[ac.id];
        if (!w) { fills[ac.id] = '#1f2937'; continue; }
        const t = Math.max(0, Math.min(1, (w.turnoutPct - 60) / 35));
        fills[ac.id] = lerpColor([224, 231, 255], [30, 64, 175], t);
        continue;
      }

      // Literacy: gradient amber → emerald (lower → higher)
      if (mapMode === 'literacy') {
        const d = demographicsById[ac.id];
        if (!d || typeof d.literacyRate !== 'number') { fills[ac.id] = '#1f2937'; continue; }
        const t = maxLit > minLit ? (d.literacyRate - minLit) / (maxLit - minLit) : 0;
        fills[ac.id] = lerpColor([254, 215, 170], [5, 150, 105], Math.max(0, Math.min(1, t)));
        continue;
      }

      // Swing: how many distinct winning parties across tracked years
      if (mapMode === 'swing') {
        const byYear = winnersByYearByAc[ac.id] ?? {};
        const distinct = new Set(Object.values(byYear)).size;
        if (distinct === 0) { fills[ac.id] = '#1f2937'; continue; }
        // 1 distinct = safe seat (dark), 2 = some swing, 3 = highly swing
        const t = Math.min(1, (distinct - 1) / 2);
        fills[ac.id] = lerpColor([30, 41, 59], [239, 68, 68], t);
        continue;
      }

      const stat = constStats[ac.id];
      if (!stat || stat.candCount === 0) { fills[ac.id] = '#e5e7eb'; continue; }
      let t: number;
      let c1: [number,number,number], c2: [number,number,number];
      if (mapMode === 'criminal') {
        t = stat.crimRate;
        c1 = [187, 247, 208]; c2 = [239, 68, 68];
      } else if (mapMode === 'women') {
        t = stat.womenRate;
        c1 = [229, 231, 235]; c2 = [192, 38, 211];
      } else if (mapMode === 'competition') {
        t = Math.min(1, (stat.candCount - 1) / 19);
        c1 = [191, 219, 254]; c2 = [29, 78, 216];
      } else if (mapMode === 'wealth') {
        t = maxAssets > 0 ? Math.min(1, stat.avgAssets / maxAssets) : 0;
        c1 = [220, 252, 231]; c2 = [21, 128, 61]; // green-100 → green-700
      } else { // age
        t = maxAge > minAge ? Math.min(1, (stat.avgAge - minAge) / (maxAge - minAge)) : 0;
        c1 = [254, 243, 199]; c2 = [180, 83, 9]; // amber-100 → amber-800
      }
      fills[ac.id] = lerpColor(c1, c2, t);
    }
    return fills;
  }, [mapMode, liveSummary]);

  const handleMouseEnter = useCallback((id: string) => setHoveredId(id), []);
  const handleMouseLeave = useCallback(() => setHoveredId(null), []);
  const handleClick      = useCallback((id: string) => setPanel(prev => prev === id ? null : id), []);

  useEffect(() => {
    if (panel !== null && mapRowRef.current && window.innerWidth >= 1024) {
      mapRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [panel]);

  const handleDistrictSelect = (district: string) => {
    setSelectedDistrict(prev => prev === district ? null : district);
    setPanel(null);
  };

  const handleReset = () => { setSelectedDistrict(null); setPanel(null); };

  const getPathFill = (id: string) => {
    const isDimmed = districtConstIds !== null && !districtConstIds.has(id);

    if (mapMode === 'phase') {
      const isP1 = PHASE1_IDS.has(id);
      if (isDimmed)               return isP1 ? PHASE1_DIM   : PHASE2_DIM;
      if (panel === id || hoveredId === id) return isP1 ? PHASE1_HOVER : PHASE2_HOVER;
      return isP1 ? PHASE1_FILL : PHASE2_FILL;
    }

    const fill = computedFills?.[id] ?? '#e5e7eb';
    return isDimmed ? '#f3f4f6' : fill;
  };

  // Legend config per mode
  const legendConfig = useMemo(() => {
    switch (mapMode) {
      case 'criminal':      return { type: 'gradient' as const, from: '#bbf7d0', to: '#ef4444', leftLabel: '0%',   rightLabel: '100%', title: 'Criminal rate'   };
      case 'women':         return { type: 'gradient' as const, from: '#e5e7eb', to: '#c026d3', leftLabel: 'None', rightLabel: 'High',  title: 'Women share'    };
      case 'competition':   return { type: 'gradient' as const, from: '#bfdbfe', to: '#1d4ed8', leftLabel: 'Few',  rightLabel: 'Many',  title: 'Candidates'     };
      case 'wealth':        return { type: 'gradient' as const, from: '#dcfce7', to: '#15803d', leftLabel: 'Low',  rightLabel: 'High',  title: 'Avg assets'     };
      case 'age':           return { type: 'gradient' as const, from: '#fef3c7', to: '#b45309', leftLabel: 'Young',rightLabel: 'Senior',title: 'Avg candidate age' };
      case 'turnout2021':   return { type: 'gradient' as const, from: '#e0e7ff', to: '#1e40af', leftLabel: '60%',  rightLabel: '95%',   title: '2021 turnout'   };
      case 'literacy':      return { type: 'gradient' as const, from: '#fed7aa', to: '#059669', leftLabel: 'Low',  rightLabel: 'High',  title: 'Literacy rate'  };
      case 'swing':         return { type: 'gradient' as const, from: '#1e293b', to: '#ef4444', leftLabel: 'Safe', rightLabel: 'Swing', title: 'Party flip rate'};
      case 'incumbent2021': return { type: 'parties' as const, title: '2021 winners' };
      case 'liveLeader':    return { type: 'parties' as const, title: 'Live leader by AC' };
      default:              return { type: 'phase' as const };
    }
  }, [mapMode]);

  return (
    <div>
      {/* District selector pills */}
      <div className="mb-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Browse by district</p>
        <div className="flex flex-wrap gap-1.5">
          {DISTRICTS.map(d => (
            <button
              key={d}
              onClick={() => handleDistrictSelect(d)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 ${
                selectedDistrict === d
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white/10 text-gray-300 hover:bg-blue-500/15 hover:text-blue-300'
              }`}
            >
              {d}
            </button>
          ))}
          {selectedDistrict && (
            <button onClick={handleReset} className="rounded-full bg-gray-200 px-3 py-1 text-xs font-medium text-gray-500 hover:bg-gray-300">
              ✕ Show all
            </button>
          )}
        </div>
      </div>

      {/* Map type selector — full width, above both columns so tops align */}
      <div className="mb-3">
        <p className="mb-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Explore the map by</p>
        <div className="flex flex-wrap gap-1.5">
        {MAP_MODES.map(mode => (
          <button
            key={mode.id}
            onClick={() => setMapMode(mode.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              mapMode === mode.id
                ? 'bg-white/20 text-white'
                : 'bg-white/10 text-gray-300 hover:bg-white/15'
            }`}
          >
            {mode.label}
          </button>
        ))}
        </div>
      </div>

      <div ref={mapRowRef} className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Left: map SVG */}
        <div className="w-full lg:w-[52%] flex-shrink-0">
          <div className="relative rounded-2xl border border-white/10 bg-slate-900 shadow-inner">
            <svg viewBox={viewBox} className="w-full rounded-2xl" style={{ display: 'block' }}>
              {wbAcPaths.map(ac => {
                const dimmed = districtConstIds ? !districtConstIds.has(ac.id) : false;
                return (
                  <path
                    key={ac.id}
                    d={ac.path}
                    fill={getPathFill(ac.id)}
                    fillOpacity={dimmed ? 0.25 : 1}
                    stroke={panel === ac.id ? '#1d4ed8' : hoveredId === ac.id ? '#374151' : '#ffffff'}
                    strokeWidth={panel === ac.id ? 1.5 : hoveredId === ac.id ? 1 : 0.4}
                    style={{ cursor: 'pointer', transition: 'fill 0.12s ease, fill-opacity 0.25s ease' }}
                    onClick={() => handleClick(ac.id)}
                    onMouseEnter={() => handleMouseEnter(ac.id)}
                    onMouseLeave={handleMouseLeave}
                  />
                );
              })}
            </svg>

            {/* Hover stats panel */}
            {hoveredId && panel === null && (
              <div className="pointer-events-none absolute right-3 top-3 z-10 w-64 max-h-80 overflow-y-auto rounded-xl border border-white/10 bg-slate-900 shadow-xl shadow-black/40">
                <HoverStatsPanel constituencyId={hoveredId} />
              </div>
            )}

            {/* Legend — vertical column hugging the left edge so the map keeps
                its horizontal breathing room. */}
            <div className="absolute left-2 top-1/2 -translate-y-1/2 rounded-lg border border-white/15 bg-slate-950/90 px-2 py-2 shadow-sm backdrop-blur-sm">
              {legendConfig.type === 'phase' ? (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-500">Phases</p>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PHASE1_FILL }} />
                    <span className="whitespace-nowrap text-[9px] font-medium text-gray-300">Phase 1</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PHASE2_FILL }} />
                    <span className="whitespace-nowrap text-[9px] font-medium text-gray-300">Phase 2</span>
                  </div>
                </div>
              ) : legendConfig.type === 'parties' ? (
                <div className="flex max-h-[20rem] flex-col gap-1 overflow-y-auto pr-0.5">
                  <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-gray-500">
                    {legendConfig.title.includes('2021') ? '2021 seats' : 'Live seats'}
                  </p>
                  {(() => {
                    // Build the legend dynamically so every party with a seat
                    // gets its own row; hardcoding missed AIFB, AISF-variants, etc.
                    let rows: { partyId: string; count: number }[] = [];
                    if (mapMode === 'liveLeader' && liveSummary) {
                      rows = Object.entries(liveSummary.leadingByParty)
                        .map(([partyId, count]) => ({ partyId, count }));
                    } else if (mapMode === 'incumbent2021') {
                      const counts2021: Record<string, number> = {};
                      for (const ac of constituencies) {
                        const pid = winner2021ById[ac.id]?.partyId;
                        if (pid) counts2021[pid] = (counts2021[pid] ?? 0) + 1;
                      }
                      rows = Object.entries(counts2021).map(([partyId, count]) => ({ partyId, count }));
                    }
                    rows.sort((a, b) => b.count - a.count);
                    if (rows.length === 0) {
                      return (
                        <span className="text-[9px] text-gray-500">
                          waiting for data
                        </span>
                      );
                    }
                    return rows.map((row) => {
                      const party = partyById[row.partyId];
                      return (
                        <div key={row.partyId} className="flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: party?.color ?? '#64748b' }}
                          />
                          <span className="whitespace-nowrap text-[9px] font-medium text-gray-300">
                            {party?.abbreviation ?? row.partyId}
                          </span>
                          <span className="ml-auto pl-2 text-[9px] font-mono font-semibold text-white tabular-nums">
                            {row.count}
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-500">{legendConfig.title}</p>
                  <div className="h-16 w-2 rounded-full" style={{ background: `linear-gradient(to top, ${legendConfig.from}, ${legendConfig.to})` }} />
                  <span className="text-[8px] text-gray-400">{legendConfig.rightLabel}</span>
                  <span className="mt-8 -translate-y-full text-[8px] text-gray-400">{legendConfig.leftLabel}</span>
                </div>
              )}
            </div>

            {/* Reset zoom */}
            {selectedDistrict && (
              <button
                onClick={handleReset}
                className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-lg border border-white/15 bg-slate-950/90 px-2.5 py-1.5 text-[10px] font-medium text-gray-400 shadow-sm backdrop-blur-sm transition-colors hover:bg-white/10"
              >
                <RotateCcw className="h-3 w-3" />
                Reset zoom
              </button>
            )}
          </div>

          {MISSING_PATH_IDS.size > 0 && (
            <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
              <p className="text-[10px] text-amber-400">
                Map boundaries for {MISSING_PATH_IDS.size} constituencies are pending.
              </p>
            </div>
          )}
        </div>

        {/* Right: constituency panel or insights — visible on all screen sizes */}
        <div className="flex lg:flex-1 min-w-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-sm" style={{ maxHeight: '640px' }}>
          {panel !== null ? (
            <ConstituencyPanel constituencyId={panel} onClose={() => setPanel(null)} />
          ) : (
            <InsightsPanel mapMode={mapMode} selectedDistrict={selectedDistrict} liveSummary={liveSummary} liveStatus={liveStatus} />
          )}
        </div>
      </div>

      {/* District constituency grid */}
      {selectedDistrict && (
        <div className="mt-6">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-gray-200">
              {selectedDistrict}
              <span className="ml-2 text-xs font-normal text-gray-400">
                {constituenciesByDistrict[selectedDistrict]?.length ?? 0} constituencies
              </span>
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {(constituenciesByDistrict[selectedDistrict] ?? [])
              .sort((a, b) => a.assemblyNumber - b.assemblyNumber)
              .map(c => {
                const cands = candidatesByConstituency[c.id] ?? [];
                const isP1 = PHASE1_IDS.has(c.id);
                const partyCounts: Record<string, number> = {};
                cands.forEach(cd => { partyCounts[cd.partyId] = (partyCounts[cd.partyId] || 0) + 1; });
                const topParties = Object.entries(partyCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
                const crimCount = cands.filter(cd => cd.criminalCases > 0).length;
                return (
                  <Link
                    key={c.id}
                    href={`/constituency/${c.id}`}
                    className="group rounded-xl border border-white/10 bg-white/5 p-3 transition-all hover:border-blue-500/30 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-xs font-bold leading-tight text-white group-hover:text-blue-300">{c.name}</p>
                      <span className="shrink-0 text-base font-extrabold leading-none" style={{ color: isP1 ? PHASE1_FILL : PHASE2_FILL }}>
                        {cands.length}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-gray-400">
                      {isP1 ? 'Phase 1 · 23 Apr' : 'Phase 2 · 29 Apr'}
                    </p>
                    <div className="mt-2 flex items-center gap-1">
                      {topParties.map(([pid]) => (
                        <span
                          key={pid}
                          className="h-2 w-2 rounded-full ring-1 ring-white"
                          style={{ backgroundColor: partyById[pid]?.color ?? '#94a3b8' }}
                          title={partyById[pid]?.abbreviation ?? pid}
                        />
                      ))}
                      <span className="flex-1" />
                      {c.reservation !== 'General' && (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-400">{c.reservation}</span>
                      )}
                      {crimCount > 0 && (
                        <span className="flex items-center gap-0.5 text-[9px] text-red-400">
                          <AlertTriangle className="h-2.5 w-2.5" />{crimCount}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

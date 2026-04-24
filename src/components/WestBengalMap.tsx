'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Users, AlertTriangle, Calendar, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { wbAcPaths, AC_MAP_WIDTH, AC_MAP_HEIGHT } from '@/data/wb-ac-paths';
import { constituencies } from '@/data/constituencies';
import { candidates as allCandidates } from '@/data/candidates';
import { parties } from '@/data/parties';
import type { Constituency, Candidate, Party } from '@/types';
import { formatCurrency } from '@/lib/utils';

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

// Color by candidate count: low=light teal → high=deep indigo
const candidateCounts = Object.fromEntries(
  Object.entries(candidatesByConstituency).map(([id, cands]) => [id, cands.length])
);
const maxCandCount = Math.max(...Object.values(candidateCounts), 1);

function heatColor(id: string): string {
  const count = candidateCounts[id] ?? 0;
  if (count === 0) return '#e2e8f0';
  const t = count / maxCandCount; // 0..1
  // Interpolate: low=#bfdbfe (blue-200) → mid=#3b82f6 (blue-500) → high=#1e1b4b (indigo-950)
  if (t < 0.5) {
    const s = t * 2;
    const r = Math.round(191 + (59 - 191) * s);
    const g = Math.round(219 + (130 - 219) * s);
    const b = Math.round(254 + (246 - 254) * s);
    return `rgb(${r},${g},${b})`;
  } else {
    const s = (t - 0.5) * 2;
    const r = Math.round(59 + (30 - 59) * s);
    const g = Math.round(130 + (27 - 130) * s);
    const b = Math.round(246 + (75 - 246) * s);
    return `rgb(${r},${g},${b})`;
  }
}

// ── Mini candidate card ──────────────────────────────────────
function MiniCandidateCard({ candidate }: { candidate: Candidate }) {
  const party = partyById[candidate.partyId];
  const photoUrl = candidate.photoUrl
    ? candidate.photoUrl.replace(/backgroundColor=[^&]+/, `backgroundColor=${(party?.color ?? '#64748b').replace('#', '')}`)
    : null;

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-gray-100 bg-white p-2.5 hover:border-blue-200 hover:bg-blue-50 transition-colors">
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
        <p className="truncate text-xs font-semibold text-gray-900">{candidate.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: party?.color ?? '#64748b' }} />
          <span className="text-[10px] text-gray-500">{party?.abbreviation ?? candidate.partyId}</span>
          {candidate.criminalCases > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-red-600">
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
          <h3 className="text-sm font-bold text-gray-900">{c.name}</h3>
          <p className="text-xs text-gray-500">{c.district} · #{c.assemblyNumber}</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {c.reservation !== 'General' && (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700">{c.reservation}</span>
          )}
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${isPhase1 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
            {isPhase1 ? 'Phase 1 · 23 Apr' : 'Phase 2 · 29 Apr'}
          </span>
        </div>
      </div>
      {cands.length > 0 ? (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-gray-50 p-2 text-center">
              <p className="text-base font-bold text-gray-900">{cands.length}</p>
              <p className="text-[10px] text-gray-500">Candidates</p>
            </div>
            <div className="rounded-xl bg-red-50 p-2 text-center">
              <p className="text-base font-bold text-red-600">{withCriminal}</p>
              <p className="text-[10px] text-gray-500">With Cases</p>
            </div>
            <div className="rounded-xl bg-blue-50 p-2 text-center">
              <p className="text-sm font-bold text-blue-600 leading-tight break-all">{formatCurrency(avgAssets)}</p>
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
                    <span className="w-12 shrink-0 truncate text-xs text-gray-600">{party?.abbreviation ?? partyId}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
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
      <div className="flex items-start justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-gray-900">{c.name}</h3>
            {c.reservation !== 'General' && (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700">{c.reservation}</span>
            )}
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${isPhase1 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
              {isPhase1 ? 'Phase 1 · 23 Apr' : 'Phase 2 · 29 Apr'}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-gray-400">{c.district} · #{c.assemblyNumber}</p>
        </div>
        <button onClick={onClose} className="shrink-0 rounded-lg p-1 transition-colors hover:bg-gray-100">
          <X className="h-4 w-4 text-gray-400" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {cands.length > 0 ? (
          <>
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1 text-xs font-semibold text-gray-600">
                <Users className="h-3.5 w-3.5" /> {cands.length} Candidates
              </span>
              <button onClick={() => router.push(`/constituency/${constituencyId}`)} className="text-xs font-semibold text-blue-600 hover:text-blue-800">
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
                <button onClick={() => router.push(`/constituency/${constituencyId}`)} className="w-full rounded-lg border border-dashed border-blue-300 py-2 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50">
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

// ── Main Map Component ───────────────────────────────────────
export function WestBengalMap() {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [panel, setPanel] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);

  const districtConstIds = useMemo(() => {
    if (!selectedDistrict) return null;
    return new Set((constituenciesByDistrict[selectedDistrict] ?? []).map(c => c.id));
  }, [selectedDistrict]);

  const viewBox = useMemo(() => {
    if (!selectedDistrict || !districtConstIds) return `0 0 ${AC_MAP_WIDTH} ${AC_MAP_HEIGHT}`;
    const distPaths = wbAcPaths.filter(p => districtConstIds.has(p.id));
    if (distPaths.length === 0) return `0 0 ${AC_MAP_WIDTH} ${AC_MAP_HEIGHT}`;
    const xs = distPaths.map(p => p.centroid.x);
    const ys = distPaths.map(p => p.centroid.y);
    const pad = 30;
    return `${Math.min(...xs) - pad} ${Math.min(...ys) - pad} ${Math.max(...xs) - Math.min(...xs) + pad * 2} ${Math.max(...ys) - Math.min(...ys) + pad * 2}`;
  }, [selectedDistrict, districtConstIds]);

  const handleMouseEnter = useCallback((id: string) => { setHoveredId(id); }, []);
  const handleMouseLeave = useCallback(() => { setHoveredId(null); }, []);
  const handleClick = useCallback((id: string) => { setPanel(prev => prev === id ? null : id); }, []);

  const handleDistrictSelect = (district: string) => {
    setSelectedDistrict(prev => prev === district ? null : district);
    setPanel(null);
  };

  const getPathFill = (id: string) => {
    if (districtConstIds && !districtConstIds.has(id)) return '#cbd5e1';
    if (panel === id) return '#1d4ed8';
    if (hoveredId === id) return '#3b82f6';
    return heatColor(id);
  };

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
                  : 'bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-700'
              }`}
            >
              {d}
            </button>
          ))}
          {selectedDistrict && (
            <button
              onClick={() => { setSelectedDistrict(null); setPanel(null); }}
              className="rounded-full bg-gray-200 px-3 py-1 text-xs font-medium text-gray-500 hover:bg-gray-300"
            >
              ✕ Show all
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Map */}
        <div className={`flex-shrink-0 ${panel !== null ? 'lg:w-[55%]' : 'w-full lg:max-w-lg lg:mx-auto'}`}>
          <div className="relative rounded-2xl border border-gray-200 bg-slate-50 shadow-inner">
            <svg
              viewBox={viewBox}
              className="w-full rounded-2xl"
              style={{ display: 'block' }}
            >
              {wbAcPaths.map(ac => {
                const dimmed = districtConstIds ? !districtConstIds.has(ac.id) : false;
                return (
                  <path
                    key={ac.id}
                    d={ac.path}
                    fill={getPathFill(ac.id)}
                    fillOpacity={dimmed ? 0.2 : 1}
                    stroke={panel === ac.id ? '#93c5fd' : '#ffffff'}
                    strokeWidth={panel === ac.id ? 1 : 0.4}
                    style={{ cursor: 'pointer', transition: 'fill 0.12s ease, fill-opacity 0.25s ease' }}
                    onClick={() => handleClick(ac.id)}
                    onMouseEnter={() => handleMouseEnter(ac.id)}
                    onMouseLeave={handleMouseLeave}
                  />
                );
              })}
            </svg>

            {hoveredId && panel === null && (
              <div className="pointer-events-none absolute right-3 top-3 z-10 w-72 max-h-96 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                <HoverStatsPanel constituencyId={hoveredId} />
              </div>
            )}

            <div className="absolute bottom-3 left-3 flex flex-col gap-1.5 rounded-xl border border-gray-200 bg-white/90 px-2.5 py-2 shadow-sm backdrop-blur-sm">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Candidates</p>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-16 rounded-full" style={{ background: 'linear-gradient(to right, #bfdbfe, #3b82f6, #1e1b4b)' }} />
              </div>
              <div className="flex justify-between text-[9px] text-gray-500">
                <span>Fewer</span>
                <span>More</span>
              </div>
            </div>
          </div>
        </div>

        {/* Side panel */}
        {panel !== null && (
          <div className="lg:flex-1 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all" style={{ maxHeight: '580px' }}>
            <ConstituencyPanel constituencyId={panel} onClose={() => setPanel(null)} />
          </div>
        )}
      </div>

      {/* District constituency grid */}
      {selectedDistrict && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800">
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
                const candCount = (candidatesByConstituency[c.id] ?? []).length;
                const isPhase1 = PHASE1_IDS.has(c.id);
                return (
                  <Link
                    key={c.id}
                    href={`/constituency/${c.id}`}
                    className="rounded-xl border border-gray-200 bg-white p-3 transition-all hover:border-blue-300 hover:bg-blue-50 hover:shadow-sm"
                  >
                    <p className="text-xs font-semibold leading-tight text-gray-900">{c.name}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${isPhase1 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                        {isPhase1 ? 'Ph1' : 'Ph2'}
                      </span>
                      {c.reservation !== 'General' && (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">{c.reservation}</span>
                      )}
                      {candCount > 0 && (
                        <span className="text-[10px] text-gray-400">{candCount} cands</span>
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

'use client';

import Link from 'next/link';
import { Flame, Zap, Target, TrendingUp, TrendingDown, Sparkles, Crown, MapPin, Scale, Swords, Trophy } from 'lucide-react';
import type { StateLiveSummary } from '@/lib/live-store';
import { parties } from '@/data/parties';
import { constituencies } from '@/data/constituencies';
import { historicalResults } from '@/data/historical-results';

const partyById = Object.fromEntries(parties.map((p) => [p.id, p]));
const constById = Object.fromEntries(constituencies.map((c) => [c.id, c]));

// 2021 baselines indexed once at module load.
const seats2021ByParty: Record<string, number> = {};
const winner2021ByAc: Record<string, string> = {};
const acsByDistrict: Record<string, string[]> = {};
for (const r of historicalResults) {
  if (r.year !== 2021) continue;
  seats2021ByParty[r.winner.partyId] = (seats2021ByParty[r.winner.partyId] ?? 0) + 1;
  winner2021ByAc[r.constituencyId] = r.winner.partyId;
}
for (const c of constituencies) {
  (acsByDistrict[c.district] ??= []).push(c.id);
}

const MAJORITY = 148;

interface Props { summary: StateLiveSummary; }

function fmtTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

interface Insight {
  icon: React.ReactNode;
  label: string;
  headline: string;
  sub?: string;
  accent: string;
  href?: string;
  colorHint?: string; // party hex
}

function buildInsights(summary: StateLiveSummary): Insight[] {
  const out: Insight[] = [];
  const declared = (summary.declaredWinners ?? []).slice();

  // 1. Biggest landslide (declared, highest margin)
  if (declared.length > 0) {
    const big = [...declared].sort((a, b) => b.marginVotes - a.marginVotes)[0];
    const party = partyById[big.partyId];
    const ac = constById[big.acId];
    out.push({
      icon: <Flame className="h-4 w-4" />,
      label: 'Biggest landslide',
      headline: `${big.candidateName.split(' ').slice(0, 2).join(' ')}`,
      sub: `${ac?.name ?? big.acId} · ${party?.abbreviation ?? big.partyId} · +${big.marginVotes.toLocaleString()}`,
      accent: 'text-orange-300 bg-orange-500/10 border-orange-500/20',
      href: `/constituency/${big.acId}`,
      colorHint: party?.color,
    });
  }

  // 2. Closest call (declared, smallest margin)
  if (declared.length > 0) {
    const tight = [...declared].sort((a, b) => a.marginVotes - b.marginVotes)[0];
    const party = partyById[tight.partyId];
    const ac = constById[tight.acId];
    out.push({
      icon: <Zap className="h-4 w-4" />,
      label: 'Closest call',
      headline: `${tight.candidateName.split(' ').slice(0, 2).join(' ')}`,
      sub: `${ac?.name ?? tight.acId} · ${party?.abbreviation ?? tight.partyId} · +${tight.marginVotes.toLocaleString()}`,
      accent: 'text-sky-300 bg-sky-500/10 border-sky-500/20',
      href: `/constituency/${tight.acId}`,
      colorHint: party?.color,
    });
  }

  // 3. Majority watch — did any party declare >= 148 seats?
  const wonByParty: Record<string, number> = {};
  for (const w of declared) wonByParty[w.partyId] = (wonByParty[w.partyId] ?? 0) + 1;
  const closestToMajority = Object.entries(wonByParty).sort((a, b) => b[1] - a[1])[0];
  if (closestToMajority) {
    const [pid, won] = closestToMajority;
    const party = partyById[pid];
    // Find declaredAt at which this party crossed 148, if it has.
    let crossingTime: string | undefined;
    if (won >= MAJORITY) {
      const partyDeclarations = declared
        .filter((d) => d.partyId === pid && d.declaredAt)
        .sort((a, b) => (a.declaredAt ?? '').localeCompare(b.declaredAt ?? ''));
      crossingTime = partyDeclarations[MAJORITY - 1]?.declaredAt;
    }
    out.push({
      icon: <Target className="h-4 w-4" />,
      label: won >= MAJORITY ? 'Majority crossed' : 'Closest to majority',
      headline:
        won >= MAJORITY
          ? `${party?.abbreviation ?? pid} at ${fmtTime(crossingTime) || 'today'}`
          : `${party?.abbreviation ?? pid} · ${won} / ${MAJORITY}`,
      sub:
        won >= MAJORITY
          ? `${won} of ${MAJORITY} seats needed · new government`
          : `${MAJORITY - won} more seats to win`,
      accent:
        won >= MAJORITY
          ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
          : 'text-amber-300 bg-amber-500/10 border-amber-500/20',
      colorHint: party?.color,
    });
  }

  // 4. Biggest gainer (party with highest positive swing vs 2021)
  const leadingByParty = summary.leadingByParty ?? {};
  const swings: { partyId: string; delta: number }[] = [];
  const allParties = Array.from(new Set<string>([...Object.keys(leadingByParty), ...Object.keys(seats2021ByParty)]));
  for (const pid of allParties) {
    const curr = leadingByParty[pid] ?? 0;
    const prev = seats2021ByParty[pid] ?? 0;
    swings.push({ partyId: pid, delta: curr - prev });
  }
  const gainer = [...swings].sort((a, b) => b.delta - a.delta)[0];
  if (gainer && gainer.delta > 0) {
    const party = partyById[gainer.partyId];
    out.push({
      icon: <TrendingUp className="h-4 w-4" />,
      label: 'Biggest gainer',
      headline: `${party?.abbreviation ?? gainer.partyId} +${gainer.delta}`,
      sub: `vs 2021 (${seats2021ByParty[gainer.partyId] ?? 0} → ${leadingByParty[gainer.partyId] ?? 0})`,
      accent: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
      colorHint: party?.color,
    });
  }

  // 5. Biggest loser
  const loser = [...swings].sort((a, b) => a.delta - b.delta)[0];
  if (loser && loser.delta < 0) {
    const party = partyById[loser.partyId];
    out.push({
      icon: <TrendingDown className="h-4 w-4" />,
      label: 'Biggest loser',
      headline: `${party?.abbreviation ?? loser.partyId} ${loser.delta}`,
      sub: `vs 2021 (${seats2021ByParty[loser.partyId] ?? 0} → ${leadingByParty[loser.partyId] ?? 0})`,
      accent: 'text-red-300 bg-red-500/10 border-red-500/20',
      colorHint: party?.color,
    });
  }

  // 6. First declared — earliest declaredAt
  const firstDeclared = declared
    .filter((d) => d.declaredAt)
    .sort((a, b) => (a.declaredAt ?? '').localeCompare(b.declaredAt ?? ''))[0];
  if (firstDeclared) {
    const party = partyById[firstDeclared.partyId];
    const ac = constById[firstDeclared.acId];
    out.push({
      icon: <Sparkles className="h-4 w-4" />,
      label: 'First declared',
      headline: `${ac?.name ?? firstDeclared.acId}`,
      sub: `${party?.abbreviation ?? firstDeclared.partyId} at ${fmtTime(firstDeclared.declaredAt)}`,
      accent: 'text-violet-300 bg-violet-500/10 border-violet-500/20',
      href: `/constituency/${firstDeclared.acId}`,
      colorHint: party?.color,
    });
  }

  // 7. Incumbent upsets — 2021 winner's party is no longer leading
  const leaderByAc = summary.leaderByAc ?? {};
  let incumbentLosses = 0;
  for (const [acId, leaderP] of Object.entries(leaderByAc)) {
    if (!leaderP) continue;
    const from = winner2021ByAc[acId];
    if (from && from !== leaderP) incumbentLosses++;
  }
  if (incumbentLosses > 0) {
    out.push({
      icon: <Swords className="h-4 w-4" />,
      label: 'Incumbent losses',
      headline: `${incumbentLosses} seats flipping`,
      sub: `2021 winner losing · ${((incumbentLosses / 294) * 100).toFixed(0)}% of state`,
      accent: 'text-rose-300 bg-rose-500/10 border-rose-500/20',
    });
  }

  // 8. District sweep — district where one party leads in ALL of its ACs
  let biggestSweep: { district: string; partyId: string; seats: number } | null = null;
  for (const [district, acIds] of Object.entries(acsByDistrict)) {
    const leadParties = acIds.map((id) => leaderByAc[id]).filter(Boolean) as string[];
    if (leadParties.length < acIds.length || leadParties.length < 3) continue;
    if (!leadParties.every((p) => p === leadParties[0])) continue;
    if (!biggestSweep || acIds.length > biggestSweep.seats) {
      biggestSweep = { district, partyId: leadParties[0], seats: acIds.length };
    }
  }
  if (biggestSweep) {
    const party = partyById[biggestSweep.partyId];
    out.push({
      icon: <MapPin className="h-4 w-4" />,
      label: 'District sweep',
      headline: `${biggestSweep.district}`,
      sub: `${party?.abbreviation ?? biggestSweep.partyId} leads all ${biggestSweep.seats} seats`,
      accent: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20',
      colorHint: party?.color,
    });
  }

  // 9. Average winning margin across declared seats
  if (declared.length >= 3) {
    const avg = Math.round(declared.reduce((s, d) => s + d.marginVotes, 0) / declared.length);
    out.push({
      icon: <Scale className="h-4 w-4" />,
      label: 'Avg winning margin',
      headline: `${avg.toLocaleString()} votes`,
      sub: `across ${declared.length} declared so far`,
      accent: 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20',
    });
  }

  // 10. Highest vote share party (live aggregation)
  const votesByParty = summary.votesByParty ?? {};
  const voteTotal = Object.values(votesByParty).reduce((a, b) => a + b, 0);
  if (voteTotal > 0) {
    const [topPid, topVotes] = Object.entries(votesByParty).sort((a, b) => b[1] - a[1])[0];
    const party = partyById[topPid];
    const share = (topVotes / voteTotal) * 100;
    out.push({
      icon: <Trophy className="h-4 w-4" />,
      label: 'Highest vote share',
      headline: `${party?.abbreviation ?? topPid} · ${share.toFixed(1)}%`,
      sub: `${topVotes.toLocaleString()} votes counted · top-2 only`,
      accent: 'text-yellow-300 bg-yellow-500/10 border-yellow-500/20',
      colorHint: party?.color,
    });
  }

  return out;
}

/**
 * Big hero banner — fires when a party's (won + leading) count projects them
 * past the 148-seat majority. Peak drama.
 */
function ProjectionBanner({ summary }: Props) {
  const leading = summary.leadingByParty ?? {};
  const topRow = Object.entries(leading).sort((a, b) => b[1] - a[1])[0];
  if (!topRow) return null;
  const [pid, total] = topRow;
  const party = partyById[pid];
  const color = party?.color ?? '#64748b';
  const wonByParty: Record<string, number> = {};
  for (const w of summary.declaredWinners ?? []) {
    wonByParty[w.partyId] = (wonByParty[w.partyId] ?? 0) + 1;
  }
  const won = wonByParty[pid] ?? 0;
  const projectedMajority = total >= MAJORITY;
  const confirmedMajority = won >= MAJORITY;
  if (!projectedMajority && !confirmedMajority) return null;

  return (
    <section className="relative overflow-hidden border-b border-white/10 px-4 py-6">
      <div
        className="absolute inset-0 -z-10 opacity-40"
        style={{ background: `radial-gradient(ellipse at top, ${color}55, transparent 70%)` }}
      />
      <div className="mx-auto max-w-6xl">
        <div
          className="flex flex-col gap-2 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between"
          style={{
            background: `linear-gradient(135deg, ${color}22, rgba(0,0,0,0.3))`,
            borderColor: `${color}55`,
          }}
        >
          <div className="flex items-start gap-3">
            <Crown className="mt-0.5 h-6 w-6 shrink-0" style={{ color }} />
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color }}>
                {confirmedMajority ? 'Government confirmed' : 'Government projection'}
              </p>
              <p className="mt-1 text-xl font-extrabold text-white sm:text-2xl">
                {party?.name ?? pid} to form the next West Bengal assembly
              </p>
              <p className="mt-1 text-[12px] text-gray-300">
                {won} won · {total - won} leading · {total} of {summary.totalACs} (majority = {MAJORITY})
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-baseline gap-3">
            <div className="text-right">
              <p className="text-3xl font-extrabold text-white">{total}</p>
              <p className="text-[10px] uppercase tracking-wider text-gray-400">projected seats</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function KeyInsights({ summary }: Props) {
  const insights = buildInsights(summary);
  if (insights.length === 0) return null;

  return (
    <>
      <ProjectionBanner summary={summary} />
      <section className="border-b border-white/10 px-4 py-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-1 flex items-baseline justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">The story so far</h2>
            <p className="text-[11px] text-gray-500">
              {summary.declared} of {summary.totalACs} declared
            </p>
          </div>
          <p className="mb-4 text-[11px] text-gray-500">
            Key moments derived from live results — updates as counting progresses.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {insights.map((ins, i) => {
              const inner = (
                <>
                  {ins.colorHint && (
                    <div
                      className="absolute -right-10 -top-10 h-24 w-24 rounded-full opacity-20 blur-2xl"
                      style={{ background: ins.colorHint }}
                    />
                  )}
                  <div className="relative flex items-center gap-2">
                    {ins.icon}
                    <span className="text-[10px] font-bold uppercase tracking-wider">{ins.label}</span>
                  </div>
                  <p className="relative mt-2 text-lg font-extrabold text-white">{ins.headline}</p>
                  {ins.sub && (
                    <p className="relative mt-1 text-[11px] text-gray-300/80">{ins.sub}</p>
                  )}
                </>
              );
              const className = `relative overflow-hidden rounded-2xl border p-4 transition ${ins.href ? 'hover:bg-white/5' : ''} ${ins.accent}`;
              return ins.href ? (
                <Link key={i} href={ins.href} className={className}>{inner}</Link>
              ) : (
                <div key={i} className={className}>{inner}</div>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}

import type { Metadata } from 'next';
import nextDynamic from 'next/dynamic';
import { HeroSearchBar } from '@/components/HeroSearchBar';
import { KeyFaces } from '@/components/KeyFaces';
import { HardFought } from '@/components/HardFought';
import { PartyStrength } from '@/components/PartyStrength';
import { PartyFunding } from '@/components/PartyFunding';
import { ElectionNews } from '@/components/ElectionNews';
import { LastSearchedBanner } from '@/components/LastSearchedBanner';
import { constituencies } from '@/data/constituencies';
import { candidates } from '@/data/candidates';
import { MoneyInPolitics } from '@/components/MoneyInPolitics';
import { SectionNav } from '@/components/SectionNav';
import { ClipboardList, ArrowRight, Search, BarChart2, Scale } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const WestBengalMap = nextDynamic(
  () => import('@/components/WestBengalMap').then(m => ({ default: m.WestBengalMap })),
  { ssr: false, loading: () => (
    <div className="flex h-96 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
      <p className="text-sm text-gray-500">Loading map…</p>
    </div>
  )}
);

const VoteCountdown = nextDynamic(
  () => import('@/components/VoteCountdown').then(m => ({ default: m.VoteCountdown })),
  { ssr: false }
);

export const metadata: Metadata = {
  title: 'WB Votes — West Bengal Election 2026',
  description: 'Search all 294 constituencies and 2707+ candidates for the West Bengal Assembly Election 2026.',
};

export default function HomePage() {
  const totalCriminal = candidates.filter((c) => c.criminalCases > 0).length;
  const womenCount = candidates.filter(c => c.gender === 'Female').length;

  return (
    <div className="bg-slate-950">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-visible bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 px-4 pb-14 pt-14 text-white">
        {/* Ambient orbs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="absolute -bottom-16 -left-16 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl" />
          <div className="absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-violet-500/10 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-3xl text-center">
          {/* Phase badge */}
          <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-blue-200 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-300" />
            WB Elections 2026 · Phase 1: 23 Apr · Phase 2: 29 Apr
          </span>

          <h1 className="mb-3 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl md:text-5xl">
            Know Your Candidates.
            <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-blue-200 via-indigo-200 to-violet-300 bg-clip-text text-transparent">
              Vote Informed.
            </span>
          </h1>
          <p className="mb-8 text-base text-blue-100/80 sm:text-lg">
            বাংলার প্রতিটি ভোটার যেন জেনে-বুঝে ভোট দিতে পারেন — স্বাধীন, নিরপেক্ষ তথ্য।
          </p>

          <HeroSearchBar />

          {/* Stat cards */}
          <div className="mx-auto mt-8 grid max-w-2xl grid-cols-4 gap-3 text-center">
            {[
              { value: constituencies.length, label: 'Constituencies', color: 'from-blue-400/20 to-blue-600/20', border: 'border-blue-400/30' },
              { value: `${candidates.length}+`, label: 'Candidates', color: 'from-indigo-400/20 to-indigo-600/20', border: 'border-indigo-400/30' },
              { value: totalCriminal, label: 'With Cases', color: 'from-red-400/20 to-rose-600/20', border: 'border-red-400/30' },
              { value: womenCount, label: 'Women', color: 'from-violet-400/20 to-violet-600/20', border: 'border-violet-400/30' },
            ].map((s) => (
              <div key={s.label} className={`rounded-xl border ${s.border} bg-gradient-to-br ${s.color} px-2 py-3 backdrop-blur-sm`}>
                <p className="text-xl font-bold text-white">{s.value}</p>
                <p className="mt-0.5 text-[10px] text-blue-200/80">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <LastSearchedBanner />

      <SectionNav />

      {/* ── Quiz CTA ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-r from-violet-600 via-blue-600 to-indigo-600 px-4 py-7">
        {/* Subtle grid texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        />
        <div className="relative mx-auto max-w-6xl flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/15 backdrop-blur-sm">
            <ClipboardList className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-base font-bold text-white sm:text-lg">Which party matches your views?</p>
            <p className="mt-0.5 text-sm text-blue-100/80">
              Answer 10 policy questions — instant, non-partisan alignment score across TMC, BJP, Left Front &amp; more.
            </p>
          </div>
          <Link
            href="/quiz"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/30 bg-white/15 px-6 py-2.5 text-sm font-bold text-white shadow-lg backdrop-blur-sm transition-all hover:bg-white/25 active:scale-95"
          >
            Start the Quiz <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ── Key Faces ────────────────────────────────────────────────────── */}
      <div id="spotlight">
        <KeyFaces />
      </div>

      {/* ── Phase 2 Countdown ────────────────────────────────────────────── */}
      <VoteCountdown />

      {/* ── Map ──────────────────────────────────────────────────────────── */}
      <section id="map" className="border-t border-white/10 px-4 py-10">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white">
              Explore by Constituency
              <span className="ml-2 text-base font-normal text-gray-500">/ মানচিত্রে দেখুন</span>
            </h2>
          </div>
          <WestBengalMap />
        </div>
      </section>

      {/* ── Hard-fought ──────────────────────────────────────────────────── */}
      <div id="hard-fought">
        <div className="border-t border-white/10">
          <HardFought />
        </div>
      </div>

      {/* ── Money in Politics ────────────────────────────────────────────── */}
      <div id="money-power">
        <MoneyInPolitics />
      </div>

      {/* ── Party Strength ───────────────────────────────────────────────── */}
      <div id="party-strength">
        <div className="border-t border-white/10">
          <PartyStrength />
        </div>
      </div>

      {/* ── Browse All CTA ───────────────────────────────────────────────── */}
      <div className="border-t border-white/10 px-4 py-8">
        <div className="mx-auto max-w-6xl">
          {/* Gradient border wrapper */}
          <div className="rounded-2xl bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 p-[1.5px] shadow-lg shadow-blue-900/30">
            <div className="flex flex-col items-center gap-4 rounded-2xl bg-slate-900 px-6 py-6 text-center sm:flex-row sm:justify-between sm:text-left">
              <div>
                <h3 className="text-lg font-bold text-white">
                  Browse All{' '}
                  <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                    {candidates.length.toLocaleString()}
                  </span>{' '}
                  Candidates
                </h3>
                <p className="mt-0.5 text-sm text-gray-400">Filter by party, district, sort by assets or criminal cases</p>
              </div>
              <Link
                href="/candidates"
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-900/50 transition-all hover:shadow-blue-800/50 active:scale-95"
              >
                View All Candidates <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── Election News ─────────────────────────────────────────────────── */}
      <div id="news">
        <ElectionNews />
      </div>

      {/* ── Party Funding ─────────────────────────────────────────────────── */}
      <div id="party-funding">
        <PartyFunding />
      </div>

      {/* ── About WB Votes ────────────────────────────────────────────────── */}
      <section className="border-t border-white/10 px-4 py-14">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 text-center">
            <span className="mb-3 inline-block rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-wider text-blue-400">
              About WB Votes
            </span>
            <h2 className="text-2xl font-extrabold text-white sm:text-3xl">
              Independent.{' '}
              <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                Non-partisan.
              </span>{' '}
              Built for voters.
            </h2>
            <p className="mt-2 text-sm text-gray-400">
              All data sourced directly from ECI affidavits. No ads. No agenda. No spin.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            {/* Card 1 */}
            <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 p-[1.5px] shadow-md shadow-blue-900/30">
              <div className="flex h-full flex-col rounded-2xl bg-slate-900 p-5">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm">
                  <Search className="h-5 w-5 text-white" />
                </div>
                <h3 className="mb-2 text-sm font-bold text-gray-100">Search any candidate or area</h3>
                <p className="text-xs leading-relaxed text-gray-400">
                  Find all 2707+ candidates across 294 constituencies. Search by name, party, or district — even with Bengali spellings.
                </p>
              </div>
            </div>

            {/* Card 2 */}
            <div className="rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 p-[1.5px] shadow-md shadow-emerald-900/20">
              <div className="flex h-full flex-col rounded-2xl bg-slate-900 p-5">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-sm">
                  <BarChart2 className="h-5 w-5 text-white" />
                </div>
                <h3 className="mb-2 text-sm font-bold text-gray-100">See the real picture</h3>
                <p className="text-xs leading-relaxed text-gray-400">
                  Declared assets, criminal cases, education, and occupation — drawn directly from affidavits filed with the Election Commission.
                </p>
              </div>
            </div>

            {/* Card 3 */}
            <div className="rounded-2xl bg-gradient-to-br from-violet-500 to-purple-700 p-[1.5px] shadow-md shadow-violet-900/20">
              <div className="flex h-full flex-col rounded-2xl bg-slate-900 p-5">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 shadow-sm">
                  <Scale className="h-5 w-5 text-white" />
                </div>
                <h3 className="mb-2 text-sm font-bold text-gray-100">Compare &amp; decide</h3>
                <p className="text-xs leading-relaxed text-gray-400">
                  Compare candidates side by side, see your constituency's full picture, and take the policy quiz to find your alignment.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

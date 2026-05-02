import nextDynamic from 'next/dynamic';
import Link from 'next/link';
import { KeyFaces } from '@/components/KeyFaces';
import { HardFought } from '@/components/HardFought';
import { PartyStrength } from '@/components/PartyStrength';
import { PartyFunding } from '@/components/PartyFunding';
import { MoneyInPolitics } from '@/components/MoneyInPolitics';
import { SectionNav } from '@/components/SectionNav';
import { candidates } from '@/data/candidates';
import { ClipboardList, ArrowRight, Search, BarChart2, Scale } from 'lucide-react';

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

interface Props {
  /** Pass through to the map so it auto-selects liveLeader mode during live/post. */
  mapDefaultMode?: string;
  /** Drop VoteCountdown in live/post (counting has started/ended). */
  showCountdown?: boolean;
}

/**
 * CandidateExplorerPanel — the "evergreen" candidate-focused part of the home
 * page, also rendered standalone at /explore. Single source of truth.
 */
export function CandidateExplorerPanel({ mapDefaultMode, showCountdown = true }: Props) {
  return (
    <div className="bg-slate-950">
      <SectionNav />

      {/* ── Quiz CTA ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-r from-violet-600 via-blue-600 to-indigo-600 px-4 py-7">
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

      <div id="spotlight">
        <KeyFaces />
      </div>

      {showCountdown && <VoteCountdown />}

      <section id="map" className="border-t border-white/10 px-4 py-10">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white">
              Explore by Constituency
              <span className="ml-2 text-base font-normal text-gray-500">/ মানচিত্রে দেখুন</span>
            </h2>
          </div>
          <WestBengalMap defaultMode={mapDefaultMode} />
        </div>
      </section>

      <div id="hard-fought">
        <div className="border-t border-white/10">
          <HardFought />
        </div>
      </div>

      <div id="money-power">
        <MoneyInPolitics />
      </div>

      <div id="party-strength">
        <div className="border-t border-white/10">
          <PartyStrength />
        </div>
      </div>

      <div className="border-t border-white/10 px-4 py-8">
        <div className="mx-auto max-w-6xl">
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

      <div id="party-funding">
        <PartyFunding />
      </div>

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

            <div className="rounded-2xl bg-gradient-to-br from-violet-500 to-purple-700 p-[1.5px] shadow-md shadow-violet-900/20">
              <div className="flex h-full flex-col rounded-2xl bg-slate-900 p-5">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 shadow-sm">
                  <Scale className="h-5 w-5 text-white" />
                </div>
                <h3 className="mb-2 text-sm font-bold text-gray-100">Compare &amp; decide</h3>
                <p className="text-xs leading-relaxed text-gray-400">
                  Compare candidates side by side, see your constituency&apos;s full picture, and take the policy quiz to find your alignment.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

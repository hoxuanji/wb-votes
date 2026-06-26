'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getClientElectionPhase } from '@/lib/election-phase';
import { CandidateExplorerPanel } from '@/components/home/CandidateExplorerPanel';
import { LiveCountingPanel } from '@/components/home/LiveCountingPanel';
import { ResultsAnalysisPanel } from '@/components/home/ResultsAnalysisPanel';
import { NewsPanel } from '@/components/home/NewsPanel';
import { CabinetSummary } from '@/components/cabinet/CabinetSummary';
import { GovernanceNewsFeed } from '@/components/GovernanceNewsFeed';
import { LiveActivityFeed } from '@/components/home/LiveActivityFeed';
import { ACPicker } from '@/components/home/ACPicker';
import { MyACSection } from '@/components/home/MyACSection';
import { Radio, Compass, Newspaper, BarChart3, Building2, Wallet, ScrollText, Archive, ArrowRight, Sparkles } from 'lucide-react';

type TabId = 'today' | 'live' | 'results' | 'explore' | 'news' | 'cabinet' | 'funds' | 'assembly' | 'archive';

interface TabDef {
  id: TabId;
  label: string;
  icon: typeof Radio;
  panel: React.ReactNode;
}

/**
 * HomeTabs — phase-aware tab switcher for `/`.
 *
 * - pre:        no tabs; renders CandidateExplorerPanel directly.
 * - live:       [Live Counting (default), Explore, News]
 * - post:       [Results Analysis (default), Explore, News]
 * - governance: [Cabinet (default), Funds, Assembly, News, Archive]
 */
export function HomeTabs() {
  const phase = getClientElectionPhase();

  const tabs: TabDef[] = (() => {
    const explore = { id: 'explore' as const, label: 'Explore',    icon: Compass,   panel: <CandidateExplorerPanel mapDefaultMode={phase === 'pre' ? undefined : 'liveLeader'} showCountdown={phase === 'pre'} /> };
    const news    = { id: 'news'    as const, label: 'News',       icon: Newspaper, panel: <NewsPanel /> };

    if (phase === 'live') {
      return [
        { id: 'live',    label: 'Live Counting', icon: Radio,     panel: <LiveCountingPanel /> },
        explore,
        news,
      ];
    }
    if (phase === 'post') {
      return [
        { id: 'results', label: 'Results Analysis', icon: BarChart3, panel: <ResultsAnalysisPanel /> },
        explore,
        news,
      ];
    }
    if (phase === 'governance') {
      return [
        { id: 'today',    label: 'Today',         icon: Sparkles,   panel: <TodayPanel /> },
        { id: 'cabinet',  label: 'Cabinet',       icon: Building2,  panel: <CabinetSummary /> },
        { id: 'funds',    label: 'Funds',         icon: Wallet,     panel: <FundsPreviewPanel /> },
        { id: 'assembly', label: 'Assembly',      icon: ScrollText, panel: <AssemblyPreviewPanel /> },
        { id: 'news',     label: 'News',          icon: Newspaper,  panel: <GovernanceNewsPanel /> },
        { id: 'archive',  label: '2026 Archive',  icon: Archive,    panel: <ArchivePanel /> },
      ];
    }
    return [explore];
  })();

  const defaultTab = tabs[0].id;
  const [active, setActive] = useState<TabId>(defaultTab);

  useEffect(() => {
    function read() {
      const hash = (typeof window !== 'undefined' && window.location.hash.slice(1)) || '';
      if (tabs.some(t => t.id === hash)) setActive(hash as TabId);
      else setActive(defaultTab);
    }
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function select(id: TabId) {
    setActive(id);
    if (typeof window !== 'undefined' && id !== defaultTab) {
      history.replaceState(null, '', `#${id}`);
    } else if (typeof window !== 'undefined') {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  const current = tabs.find(t => t.id === active) ?? tabs[0];

  if (phase === 'pre') {
    return <>{current.panel}</>;
  }

  return (
    <>
      <nav className="sticky top-14 z-30 border-b border-white/10 bg-slate-950/95 backdrop-blur-md" aria-label="Home sections">
        <div className="mx-auto max-w-6xl overflow-x-auto px-4">
          <ul className="flex gap-1">
            {tabs.map(({ id, label, icon: Icon }) => {
              const isActive = id === active;
              return (
                <li key={id}>
                  <button
                    onClick={() => select(id)}
                    className={`
                      flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors
                      ${isActive
                        ? 'border-blue-400 text-white'
                        : 'border-transparent text-gray-400 hover:text-gray-200'
                      }
                    `}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? 'text-blue-400' : ''}`} />
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
      {current.panel}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function TodayPanel() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-6 space-y-8">
      <LiveActivityFeed />
      <ACPicker />
      <MyACSection />
    </section>
  );
}

function GovernanceNewsPanel() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <GovernanceNewsFeed
        type="governance"
        title="WB Politics & Governance"
        limit={9}
      />
    </section>
  );
}

function FundsPreviewPanel() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-4 flex items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-white sm:text-2xl">MLALADS — The MLA Local Area Development Scheme</h2>
          <p className="mt-1 text-sm text-gray-400">₹70 lakh per year for each of West Bengal&apos;s 294 MLAs to fund local projects.</p>
        </div>
        <Link href="/funds" className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-blue-300 hover:bg-white/10 min-h-[40px]">
          Full reference <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

function AssemblyPreviewPanel() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-4 flex items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-white sm:text-2xl">West Bengal Legislative Assembly</h2>
          <p className="mt-1 text-sm text-gray-400">294 sitting MLAs · 2026–2031 term</p>
        </div>
        <Link href="/assembly" className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-blue-300 hover:bg-white/10 min-h-[40px]">
          Full roster <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <GovernanceNewsFeed type="assembly" title="Assembly — Latest News" limit={6} />
    </section>
  );
}

function ArchivePanel() {
  const links = [
    { href: '/results',  label: 'Results Analysis', desc: 'Seat flips, swings, party scorecards from the 2026 vote.' },
    { href: '/explore',  label: 'Candidate Explorer', desc: 'All 2,707+ candidates: assets, criminal cases, education.' },
    { href: '/compare',  label: 'Compare Candidates', desc: 'Side-by-side tool — keep using it post-election too.' },
    { href: '/quiz',     label: 'Party Alignment Quiz', desc: 'Find the party closest to your views.' },
    { href: '/live',     label: 'Live Counting Replay', desc: 'Frozen final state from counting day.' },
  ];
  return (
    <section className="mx-auto max-w-4xl px-4 py-10">
      <h2 className="text-xl font-bold text-white sm:text-2xl">2026 Election Archive</h2>
      <p className="mt-2 text-sm text-gray-400">
        Everything from the 2026 cycle stays available. These surfaces are frozen and won&apos;t auto-update.
      </p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="block rounded-xl border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/10"
            >
              <p className="font-semibold text-white">{l.label}</p>
              <p className="mt-1 text-xs text-gray-400">{l.desc}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

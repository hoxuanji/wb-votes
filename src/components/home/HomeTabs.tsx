'use client';

import { useEffect, useState } from 'react';
import { getClientElectionPhase } from '@/lib/election-phase';
import { CandidateExplorerPanel } from '@/components/home/CandidateExplorerPanel';
import { LiveCountingPanel } from '@/components/home/LiveCountingPanel';
import { ResultsAnalysisPanel } from '@/components/home/ResultsAnalysisPanel';
import { NewsPanel } from '@/components/home/NewsPanel';
import { Radio, Compass, Newspaper, BarChart3 } from 'lucide-react';

type TabId = 'live' | 'results' | 'explore' | 'news';

interface TabDef {
  id: TabId;
  label: string;
  icon: typeof Radio;
  panel: React.ReactNode;
}

/**
 * HomeTabs — phase-aware tab switcher for `/`.
 *
 * - pre:   no tabs; renders CandidateExplorerPanel directly (identical to
 *          legacy home body).
 * - live:  [Live Counting (default), Explore, News]
 * - post:  [Results Analysis (default), Explore, News]
 *
 * Tab state is held in the URL hash (`#live`, `#explore`, …) so tabs are
 * bookmarkable and deep-linkable.
 */
export function HomeTabs() {
  const phase = getClientElectionPhase();

  // Build tab definitions once per phase.
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
    // pre: return a single "explore" tab but render without the tab chrome
    return [explore];
  })();

  const defaultTab = tabs[0].id;
  const [active, setActive] = useState<TabId>(defaultTab);

  // Sync with URL hash on mount + hashchange.
  useEffect(() => {
    function read() {
      const hash = (typeof window !== 'undefined' && window.location.hash.slice(1)) || '';
      if (tabs.some(t => t.id === hash)) setActive(hash as TabId);
      else setActive(defaultTab);
    }
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
    // tabs is derived from phase which is process.env, static per render
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

  // Pre phase — no tabs, just the panel. Matches pre-Phase-3 behaviour.
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

'use client';

import { useState, type ReactNode } from 'react';
import { LayoutDashboard, Users, TrendingUp, MapPin, UserCheck, Newspaper, Radio } from 'lucide-react';

export type DashboardTabId = 'overview' | 'candidates' | 'history' | 'demographics' | 'mla' | 'news' | 'live';

export interface DashboardTabDef {
  id: DashboardTabId;
  label: string;
  content: ReactNode;
  hidden?: boolean;
}

interface ConstituencyDashboardProps {
  tabs: DashboardTabDef[];
  defaultTab?: DashboardTabId;
}

// Icons live only in this client component — passing lucide-react function
// components across the server/client boundary breaks RSC serialization.
const ICON_MAP: Record<DashboardTabId, typeof LayoutDashboard> = {
  overview:     LayoutDashboard,
  candidates:   Users,
  history:      TrendingUp,
  demographics: MapPin,
  mla:          UserCheck,
  news:         Newspaper,
  live:         Radio,
};

export function ConstituencyDashboard({ tabs, defaultTab }: ConstituencyDashboardProps) {
  const visible = tabs.filter((t) => !t.hidden);
  const initial = (defaultTab && visible.some((t) => t.id === defaultTab) ? defaultTab : visible[0]?.id) as DashboardTabId;
  const [active, setActive] = useState<DashboardTabId>(initial);

  const current = visible.find((t) => t.id === active) ?? visible[0];

  return (
    <div>
      <div className="mb-5 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-1 border-b border-white/10 sm:gap-2">
          {visible.map((t) => {
            const Icon = ICON_MAP[t.id];
            const isActive = t.id === active;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActive(t.id)}
                className={
                  'inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors sm:px-4 ' +
                  (isActive
                    ? 'border-blue-400 text-white'
                    : 'border-transparent text-gray-400 hover:border-white/20 hover:text-gray-200')
                }
                aria-selected={isActive}
                role="tab"
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div role="tabpanel">{current?.content}</div>
    </div>
  );
}

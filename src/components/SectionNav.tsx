'use client';

import { Flame, Map, Star, DollarSign, BarChart2, Newspaper, CreditCard } from 'lucide-react';

const SECTIONS = [
  { id: 'spotlight',      label: 'Spotlight',      Icon: Star },
  { id: 'map',            label: 'Explore Map',     Icon: Map },
  { id: 'hard-fought',    label: 'Hard-Fought',     Icon: Flame },
  { id: 'money-power',    label: 'Money & Power',   Icon: DollarSign },
  { id: 'party-strength', label: 'Party Strength',  Icon: BarChart2 },
  { id: 'news',           label: 'Latest News',     Icon: Newspaper },
  { id: 'party-funding',  label: 'Party Funding',   Icon: CreditCard },
];

export function SectionNav() {
  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    const offset = el.getBoundingClientRect().top + window.scrollY - 100;
    window.scrollTo({ top: offset, behavior: 'smooth' });
  }

  return (
    <div className="sticky top-14 z-30 border-b border-white/10 bg-slate-950/90 backdrop-blur-sm shadow-lg shadow-black/20">
      <div className="overflow-x-auto scrollbar-none">
        <div className="mx-auto flex w-max min-w-full items-center justify-center gap-1.5 px-4 py-2.5">
          {SECTIONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-400 transition-all hover:border-blue-500/40 hover:bg-blue-500/15 hover:text-blue-300 active:scale-95"
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

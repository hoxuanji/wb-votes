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
    <div className="sticky top-14 z-30 border-b border-gray-100 bg-white/95 backdrop-blur-sm shadow-sm">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none py-2.5">
          {SECTIONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 active:scale-95"
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

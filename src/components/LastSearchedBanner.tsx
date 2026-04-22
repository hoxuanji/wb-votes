'use client';

import Link from 'next/link';
import { Clock, ArrowRight, X } from 'lucide-react';
import { useState } from 'react';
import { useRecentSearch } from '@/hooks/useRecentSearch';

export function LastSearchedBanner() {
  const { recent, clearRecent } = useRecentSearch();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || recent.length === 0) return null;

  const [latest, ...others] = recent;

  return (
    <div className="bg-white border-b border-gray-100 px-4 py-3">
      <div className="mx-auto max-w-3xl flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {/* Continue where you left off */}
        <div className="flex items-center gap-3 min-w-0">
          <Clock className="h-4 w-4 shrink-0 text-blue-500" />
          <span className="text-xs text-gray-500 shrink-0">Continue where you left off →</span>
          <Link
            href={`/constituency/${latest.id}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 transition-colors truncate"
          >
            {latest.name}
            <ArrowRight className="h-3 w-3 shrink-0" />
          </Link>
        </div>

        {/* Other recent chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {others.map(r => (
            <Link
              key={r.id}
              href={`/constituency/${r.id}`}
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:border-blue-300 hover:text-blue-700 transition-colors"
            >
              {r.name}
            </Link>
          ))}
          <button
            onClick={() => { clearRecent(); setDismissed(true); }}
            className="ml-1 text-gray-300 hover:text-gray-500 transition-colors"
            aria-label="Clear history"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

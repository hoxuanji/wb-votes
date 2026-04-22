'use client';

import Link from 'next/link';
import { ClipboardList } from 'lucide-react';

export function StickyQuizCTA() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-safe md:hidden">
      <div className="mb-3 mx-auto max-w-sm">
        <Link
          href="/quiz"
          className="flex items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition-transform active:scale-95"
        >
          <ClipboardList className="h-4 w-4" />
          Find Your Match — Take the Quiz
        </Link>
      </div>
    </div>
  );
}

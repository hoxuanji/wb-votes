'use client';

import { useState } from 'react';
import { Info, X } from 'lucide-react';

export function Disclaimer() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="bg-amber-950/80 border-b border-amber-500/30 px-4 py-2.5">
      <div className="mx-auto flex max-w-7xl items-start justify-between gap-3">
        <div className="flex items-start gap-2 text-xs text-amber-200 sm:text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p>
            <strong>Disclaimer:</strong> This is an independent informational tool. Not affiliated with
            the Election Commission of India or any political party. All data is sourced from publicly
            available official affidavits. <em>এটি একটি স্বাধীন তথ্যমূলক সরঞ্জাম। নির্বাচন কমিশন বা কোনো রাজনৈতিক দলের সাথে সম্পর্কিত নয়।</em>
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded p-1 text-amber-400 hover:bg-amber-500/20"
          aria-label="Dismiss disclaimer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

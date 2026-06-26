'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { constituencies } from '@/data/constituencies';
import { useHomeAC } from '@/lib/use-home-ac';

export function ACPicker() {
  const { homeAC, setHomeAC, ready } = useHomeAC();

  const { groups, districts } = useMemo(() => {
    const groups: Record<string, typeof constituencies> = {};
    for (const c of constituencies) {
      (groups[c.district] ||= []).push(c);
    }
    return { groups, districts: Object.keys(groups).sort() };
  }, []);

  // ponytail: no-AC state only; "Change" affordance lives in MyACSection (T4).
  if (!ready || homeAC) return null;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
      <h2 className="text-base font-semibold text-white sm:text-lg">
        Pick your constituency to see your MLA and local news
      </h2>
      <div className="relative mt-3">
        <label htmlFor="home-ac-select" className="sr-only">Select your home assembly constituency</label>
        <select
          id="home-ac-select"
          value=""
          onChange={(e) => {
            if (e.target.value) setHomeAC(e.target.value);
          }}
          className="w-full appearance-none rounded-xl border border-white/20 bg-slate-900/80 px-4 py-3 text-base text-white outline-none focus:outline-none focus:ring-0 min-h-[48px]"
        >
          <option value="" className="bg-slate-900">— Search your constituency —</option>
          {districts.map((district) => (
            <optgroup key={district} label={district} className="bg-slate-900">
              {groups[district].map((c) => (
                <option key={c.id} value={c.id} className="bg-slate-900">
                  {c.name} ({c.reservation !== 'General' ? c.reservation : 'Gen'})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">▾</div>
      </div>
      <Link
        href="/find-rep"
        className="mt-3 inline-block text-xs text-blue-300 hover:text-blue-200"
      >
        Don&apos;t know your AC?
      </Link>
    </section>
  );
}

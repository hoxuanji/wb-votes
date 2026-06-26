'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { constituencies } from '@/data/constituencies';
import { useHomeAC } from '@/lib/use-home-ac';
import { useLanguage } from '@/lib/language-context';

export function ACPicker() {
  const { homeAC, setHomeAC, ready } = useHomeAC();
  const { lang, t } = useLanguage();

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
        {t('Pick your constituency to see your MLA and local news', 'আপনার এমএলএ ও স্থানীয় খবরের জন্য আপনার কেন্দ্র বেছে নিন')}
      </h2>
      <div className="relative mt-3">
        <label htmlFor="home-ac-select" className="sr-only">
          {t('Select your home assembly constituency', 'আপনার বিধানসভা কেন্দ্র বেছে নিন')}
        </label>
        <select
          id="home-ac-select"
          value=""
          onChange={(e) => {
            if (e.target.value) setHomeAC(e.target.value);
          }}
          className="w-full appearance-none rounded-xl border border-white/20 bg-slate-900/80 px-4 py-3 text-base text-white outline-none focus:outline-none focus:ring-0 min-h-[48px]"
        >
          <option value="" className="bg-slate-900">
            {t('— Search your constituency —', '— আপনার কেন্দ্র খুঁজুন —')}
          </option>
          {districts.map((district) => {
            const districtLabel = lang === 'bn' ? (groups[district][0]?.districtBn ?? district) : district;
            return (
              <optgroup key={district} label={districtLabel} className="bg-slate-900">
                {groups[district].map((c) => {
                  const name = lang === 'bn' ? c.nameBn : c.name;
                  return (
                    <option key={c.id} value={c.id} className="bg-slate-900">
                      {name} ({c.reservation !== 'General' ? c.reservation : 'Gen'})
                    </option>
                  );
                })}
              </optgroup>
            );
          })}
        </select>
        <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">▾</div>
      </div>
      <Link
        href="/find-rep"
        className="mt-3 inline-block text-xs text-blue-300 hover:text-blue-200"
      >
        {t("Don't know your AC?", 'কেন্দ্র জানেন না?')}
      </Link>
    </section>
  );
}

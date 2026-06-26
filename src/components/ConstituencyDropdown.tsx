'use client';

import { useRouter } from 'next/navigation';
import { constituencies } from '@/data/constituencies';

interface Props {
  selected?: string;
}

export function ConstituencyDropdown({ selected }: Props) {
  const router = useRouter();

  const groups: Record<string, typeof constituencies> = {};
  for (const c of constituencies) {
    (groups[c.district] ||= []).push(c);
  }
  const districts = Object.keys(groups).sort();

  return (
    <div className="relative">
      <label htmlFor="ac-select" className="sr-only">Select assembly constituency</label>
      <select
        id="ac-select"
        value={selected ?? ''}
        onChange={e => {
          if (e.target.value) router.push(`/find-rep?ac=${e.target.value}`);
        }}
        className="w-full appearance-none rounded-xl border border-white/20 bg-slate-900/80 px-4 py-3 text-base text-white backdrop-blur-sm outline-none focus:border-blue-400/60 min-h-[48px]"
      >
        <option value="" className="bg-slate-900">— Search your constituency —</option>
        {districts.map(district => (
          <optgroup key={district} label={district} className="bg-slate-900">
            {groups[district].map(c => (
              <option key={c.id} value={c.id} className="bg-slate-900">
                {c.name} ({c.reservation !== 'General' ? c.reservation : 'Gen'})
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">▾</div>
    </div>
  );
}

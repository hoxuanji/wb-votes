'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, MapPin, ChevronRight } from 'lucide-react';
import { constituencies, getConstituenciesByDistrict } from '@/data/constituencies';
import { useLanguage } from '@/lib/language-context';

export function ConstituencySelector() {
  const router = useRouter();
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');

  const byDistrict = useMemo(() => getConstituenciesByDistrict(), []);
  const districts = Object.keys(byDistrict).sort();

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return constituencies.filter((c) => {
      const matchQuery = !q || c.name.toLowerCase().includes(q) || c.nameBn.includes(q);
      const matchDistrict = !selectedDistrict || c.district === selectedDistrict;
      return matchQuery && matchDistrict;
    });
  }, [query, selectedDistrict]);

  const handleSelect = (id: string) => {
    router.push(`/constituency/${id}`);
  };

  return (
    <div className="w-full">
      {/* Search input */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder={t('Search constituency…', 'নির্বাচনী এলাকা খুঁজুন…')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-gray-300 bg-white py-3 pl-10 pr-4 text-sm shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      {/* District filter */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedDistrict('')}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            !selectedDistrict ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {t('All Districts', 'সব জেলা')}
        </button>
        {districts.map((d) => (
          <button
            key={d}
            onClick={() => setSelectedDistrict(d === selectedDistrict ? '' : d)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selectedDistrict === d
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      {/* Results */}
      <div className="overflow-y-auto rounded-xl bg-white" style={{ maxHeight: '65vh' }}>
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            {t('No constituencies found.', 'কোনো নির্বাচনী এলাকা পাওয়া যায়নি।')}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => handleSelect(c.id)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-blue-50"
                >
                  <div className="flex items-center gap-3">
                    <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {t(c.name, c.nameBn)}
                        {c.reservation !== 'General' && (
                          <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                            {c.reservation}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        {t(c.district, c.districtBn)} · #{c.assemblyNumber}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-2 text-right text-xs text-gray-400">
        {t(`${filtered.length} of ${constituencies.length} constituencies`, `${constituencies.length}টির মধ্যে ${filtered.length}টি দেখাচ্ছে`)}
      </p>
    </div>
  );
}

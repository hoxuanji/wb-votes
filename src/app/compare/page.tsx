'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { X, Plus, ArrowLeft, GitCompare } from 'lucide-react';
import Link from 'next/link';
import { candidates, getCandidateById } from '@/data/candidates';
import { constituencies } from '@/data/constituencies';
import { parties, getPartyById } from '@/data/parties';
import { ComparisonTable } from '@/components/ComparisonTable';
import { useLanguage } from '@/lib/language-context';

function ComparePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t } = useLanguage();

  const initialIds = useMemo(() => {
    const raw = searchParams.get('ids') ?? '';
    return raw ? raw.split(',').filter(Boolean) : [];
  }, [searchParams]);

  const [selectedIds, setSelectedIds] = useState<string[]>(initialIds);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerConstituency, setPickerConstituency] = useState('');

  // Keep URL in sync
  useEffect(() => {
    const url = selectedIds.length > 0 ? `/compare?ids=${selectedIds.join(',')}` : '/compare';
    router.replace(url, { scroll: false });
  }, [selectedIds, router]);

  const selectedCandidates = useMemo(
    () => selectedIds.map((id) => getCandidateById(id)).filter(Boolean) as typeof candidates,
    [selectedIds]
  );

  const availableCandidates = useMemo(
    () => candidates.filter(
      (c) => !selectedIds.includes(c.id) && (!pickerConstituency || c.constituencyId === pickerConstituency)
    ),
    [selectedIds, pickerConstituency]
  );

  const addCandidate = (id: string) => {
    setSelectedIds((prev) => [...prev, id]);
    setPickerOpen(false);
  };

  const removeCandidate = (id: string) => setSelectedIds((prev) => prev.filter((i) => i !== id));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-blue-400 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-blue-400" />
            {t('Compare Candidates', 'প্রার্থী তুলনা করুন')}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {t(`${selectedCandidates.length} candidate${selectedCandidates.length !== 1 ? 's' : ''} selected`, `${selectedCandidates.length}টি প্রার্থী নির্বাচিত`)}
          </p>
        </div>

        <button
          onClick={() => setPickerOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t('Add Candidate', 'প্রার্থী যোগ করুন')}
        </button>
      </div>

      {/* Selected chips */}
      {selectedCandidates.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {selectedCandidates.map((c) => {
            const p = getPartyById(c.partyId);
            return (
              <div key={c.id} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs shadow-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p?.color ?? '#666' }} />
                <span className="font-medium text-gray-200">{c.name}</span>
                <span className="text-gray-500">({p?.abbreviation})</span>
                <button onClick={() => removeCandidate(c.id)} className="ml-1 text-gray-500 hover:text-red-400">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Comparison table */}
      <ComparisonTable candidates={selectedCandidates} parties={parties} />

      {/* Picker modal */}
      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-4" onClick={() => setPickerOpen(false)}>
          <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-slate-900 border border-white/10 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <h2 className="text-sm font-semibold text-white">
                {t('Add a Candidate', 'প্রার্থী যোগ করুন')}
              </h2>
              <button onClick={() => setPickerOpen(false)} className="rounded-lg p-1 text-gray-400 hover:bg-white/10">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-3">
              <select
                className="w-full rounded-lg border border-white/15 bg-slate-800 px-3 py-2 text-sm text-gray-200 focus:border-blue-500/50 focus:outline-none mb-3"
                value={pickerConstituency}
                onChange={(e) => setPickerConstituency(e.target.value)}
              >
                <option value="">{t('All Constituencies', 'সব নির্বাচনী এলাকা')}</option>
                {constituencies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <div className="max-h-64 overflow-y-auto space-y-1">
                {availableCandidates.length === 0 ? (
                  <p className="py-4 text-center text-sm text-gray-500">No more candidates to add.</p>
                ) : (
                  availableCandidates.map((c) => {
                    const p = getPartyById(c.partyId);
                    const con = constituencies.find((x) => x.id === c.constituencyId);
                    return (
                      <button
                        key={c.id}
                        onClick={() => addCandidate(c.id)}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-blue-500/15 transition-colors"
                      >
                        <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: p?.color ?? '#666' }} />
                        <div className="min-w-0">
                          <p className="font-medium text-gray-200">{c.name}</p>
                          <p className="text-xs text-gray-500">{p?.abbreviation} · {con?.name}</p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-gray-500">Loading…</div>}>
      <ComparePageInner />
    </Suspense>
  );
}

'use client';

import { useState } from 'react';
import { AlertCircle, CheckCircle2, Send, MapPin, ChevronRight } from 'lucide-react';
import type { CivicReportCategory } from '@/types';
import { getConstituencyById } from '@/data/constituencies';

const CATEGORIES: Array<{ value: CivicReportCategory; label: string; emoji: string }> = [
  { value: 'road',         label: 'Roads',          emoji: '🛣️' },
  { value: 'water',        label: 'Water',          emoji: '💧' },
  { value: 'electricity',  label: 'Power',          emoji: '⚡' },
  { value: 'health',       label: 'Health',         emoji: '🏥' },
  { value: 'education',    label: 'Education',      emoji: '📚' },
  { value: 'corruption',   label: 'Corruption',     emoji: '⚠️' },
  { value: 'safety',       label: 'Safety',         emoji: '🚨' },
  { value: 'environment',  label: 'Environment',    emoji: '🌿' },
  { value: 'other',        label: 'Other',          emoji: '📝' },
];

interface Props {
  constituencyId: string;
  constituencyName: string;
}

export function CivicReportForm({ constituencyId, constituencyName }: Props) {
  const constituency = getConstituencyById(constituencyId);
  const district = constituency?.district ?? '';

  const [category, setCategory] = useState<CivicReportCategory>('road');
  const [ward, setWard]         = useState('');
  const [landmark, setLandmark] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    setStatus('submitting');

    const locationParts = [ward.trim(), landmark.trim()].filter(Boolean);
    const location = locationParts.length ? locationParts.join(' · ') : undefined;

    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          constituencyId,
          category,
          description: description.trim(),
          location,
          submittedAt: new Date().toISOString(),
        }),
      });
      setStatus(res.ok ? 'success' : 'error');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-6 text-center">
        <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-400" />
        <p className="font-semibold text-white">Report submitted</p>
        <p className="mt-1 text-sm text-gray-400">
          Your report for <span className="text-emerald-300">{constituencyName}</span> has been received.
          Thank you for helping track civic issues in your area.
        </p>
        <button
          onClick={() => { setStatus('idle'); setDescription(''); setWard(''); setLandmark(''); }}
          className="mt-4 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-blue-300 hover:bg-white/10"
        >
          Submit another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">

      {/* Location breadcrumb — auto-filled context */}
      <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-blue-400" />
        <span className="text-xs text-gray-400">{district}</span>
        <ChevronRight className="h-3 w-3 text-gray-600" />
        <span className="text-xs font-semibold text-white">{constituencyName}</span>
        <span className="ml-auto text-[10px] text-gray-600">auto-filled</span>
      </div>

      {/* Ward / Area — primary location field */}
      <div>
        <label htmlFor="ward" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">
          Ward / Area / Village <span className="normal-case font-normal text-gray-600">(helps pin on the map)</span>
        </label>
        <input
          id="ward"
          type="text"
          value={ward}
          onChange={e => setWard(e.target.value)}
          maxLength={120}
          placeholder={
            district === 'Kolkata'
              ? 'e.g. Ward 45, Borough IX, Lake Town'
              : district.includes('North') || district.includes('Howrah') || district.includes('Siliguri')
                ? 'e.g. Ward 12, Mohalla name, Market area'
                : 'e.g. Village Binol, Block Amdanga, GP Paikpara'
          }
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 outline-none focus:outline-none focus:ring-0 min-h-[44px]"
        />
      </div>

      {/* Landmark */}
      <div>
        <label htmlFor="landmark" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">
          Landmark / Street
        </label>
        <input
          id="landmark"
          type="text"
          value={landmark}
          onChange={e => setLandmark(e.target.value)}
          maxLength={120}
          placeholder="Near bus stop, school, market, crossing…"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 outline-none focus:outline-none focus:ring-0 min-h-[44px]"
        />
      </div>

      {/* Category */}
      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400">
          Issue type
        </label>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {CATEGORIES.map(c => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value)}
              className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-center text-[11px] font-medium transition-colors ${
                category === c.value
                  ? 'border-blue-400/60 bg-blue-400/15 text-blue-200'
                  : 'border-white/10 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200'
              }`}
            >
              <span className="text-lg leading-none">{c.emoji}</span>
              <span className="leading-tight">{c.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">
          Describe the issue <span className="text-red-400">*</span>
        </label>
        <textarea
          id="description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="What's the problem? What did you see? The more specific, the better."
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 outline-none focus:outline-none focus:ring-0 min-h-[80px]"
          required
        />
        <p className="mt-1 text-right text-[10px] text-gray-600">{description.length}/500</p>
      </div>

      {status === 'error' && (
        <div className="flex items-center gap-2 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Submission failed. Please try again.
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'submitting' || !description.trim()}
        className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50 min-h-[44px]"
      >
        <Send className="h-4 w-4" />
        {status === 'submitting' ? 'Submitting…' : 'Submit Report'}
      </button>
    </form>
  );
}

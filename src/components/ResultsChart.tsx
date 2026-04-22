'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Share2, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import type { PartyAlignmentResult } from '@/types';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/lib/language-context';

interface ResultsChartProps {
  results: PartyAlignmentResult[];
}

export function ResultsChart({ results }: ResultsChartProps) {
  const { t } = useLanguage();
  const sorted = [...results].sort((a, b) => b.score - a.score);
  const top = sorted[0];

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: 'My WB Votes Quiz Result', url });
    } else {
      await navigator.clipboard.writeText(url);
      alert(t('Link copied to clipboard!', 'লিঙ্ক কপি করা হয়েছে!'));
    }
  };

  return (
    <div>
      {/* Top match highlight */}
      <div
        className="mb-6 rounded-xl p-5 text-white"
        style={{ backgroundColor: top.color }}
      >
        <p className="text-sm opacity-80">{t('Your top policy alignment', 'আপনার শীর্ষ নীতি সামঞ্জস্য')}</p>
        <p className="mt-1 text-2xl font-bold">{top.partyName}</p>
        <p className="mt-0.5 text-4xl font-extrabold">{top.score}%</p>
        <p className="mt-2 text-xs opacity-70">
          {t(
            'Based on your quiz answers. This is informational only — not a voting recommendation.',
            'আপনার কুইজ উত্তরের উপর ভিত্তি করে। এটি শুধুমাত্র তথ্যমূলক।'
          )}
        </p>
      </div>

      {/* Bar chart */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-gray-700">
          {t('Alignment by Party (%)', 'দল অনুযায়ী সামঞ্জস্য (%)')}
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={sorted} layout="vertical" margin={{ left: 16, right: 24 }}>
            <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="partyAbbr" tick={{ fontSize: 12 }} width={48} />
            <Tooltip
              formatter={(value: number) => [`${value}%`, t('Alignment', 'সামঞ্জস্য')]}
              contentStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="score" radius={[0, 4, 4, 0]}>
              {sorted.map((entry) => (
                <Cell key={entry.partyId} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Ranked list */}
      <div className="mb-6 space-y-2">
        {sorted.map((r, i) => (
          <div key={r.partyId} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
            <span className="w-5 text-center text-sm font-bold text-gray-400">#{i + 1}</span>
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: r.color }} />
            <span className="flex-1 text-sm font-medium text-gray-800">{r.partyName}</span>
            <div className="flex items-center gap-2">
              <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-200">
                <div className="h-full rounded-full" style={{ width: `${r.score}%`, backgroundColor: r.color }} />
              </div>
              <span className="w-10 text-right text-sm font-semibold text-gray-700">{r.score}%</span>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button onClick={handleShare} variant="primary" className="flex-1 gap-2">
          <Share2 className="h-4 w-4" />
          {t('Share Results', 'ফলাফল শেয়ার করুন')}
        </Button>
        <Link href="/quiz" className="flex-1">
          <Button variant="outline" className="w-full gap-2">
            <RefreshCw className="h-4 w-4" />
            {t('Retake Quiz', 'আবার কুইজ দিন')}
          </Button>
        </Link>
        <Link href="/" className="flex-1">
          <Button variant="secondary" className="w-full">
            {t('Find My Constituency', 'আমার নির্বাচনী এলাকা খুঁজুন')}
          </Button>
        </Link>
      </div>

      <p className="mt-4 text-center text-xs text-gray-400">
        {t(
          'Scores are based on party manifestos and publicly stated positions — not individual candidates.',
          'স্কোরগুলি দলীয় ইশতেহার এবং প্রকাশ্য অবস্থানের উপর ভিত্তি করে।'
        )}
      </p>
    </div>
  );
}

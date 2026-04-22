'use client';

import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import type { Candidate } from '@/types';
import { getEducationTier, getAssetBucket } from '@/lib/candidate-scoring';
import { formatCurrency } from '@/lib/utils';

interface ConstituencyInsightsProps {
  candidates: Candidate[];
  className?: string;
}

function pct(n: number, total: number) {
  return total === 0 ? 0 : Math.round((n / total) * 100);
}

function computeDataQuality(candidates: Candidate[]): number {
  if (candidates.length === 0) return 0;
  const fields = ['age', 'education', 'occupation', 'totalAssets', 'affidavitUrl', 'gender'] as const;
  let filled = 0;
  let total = 0;
  for (const c of candidates) {
    for (const f of fields) {
      total++;
      const v = c[f];
      if (v && v !== 'Not declared' && v !== 0) filled++;
    }
  }
  return Math.round((filled / total) * 100);
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function ConstituencyInsights({ candidates, className = '' }: ConstituencyInsightsProps) {
  const stats = useMemo(() => {
    const total = candidates.length;
    const withCases = candidates.filter(c => c.criminalCases > 0).length;
    const female = candidates.filter(c => c.gender === 'Female').length;
    const avgAssets = total > 0 ? candidates.reduce((s, c) => s + c.totalAssets, 0) / total : 0;
    const med = median(candidates.map(c => c.totalAssets));
    const dq = computeDataQuality(candidates);

    // Education buckets
    const eduLabels = ['Below 10th', '10th/12th', 'Graduate', 'Post Grad', 'PhD'];
    const eduCounts = [0, 0, 0, 0, 0];
    for (const c of candidates) {
      eduCounts[getEducationTier(c.education)]++;
    }

    // Asset buckets
    const assetBuckets: Record<string, number> = { Low: 0, Medium: 0, High: 0, 'Very High': 0 };
    for (const c of candidates) {
      assetBuckets[getAssetBucket(c.totalAssets)]++;
    }

    return { total, withCases, female, avgAssets, med, dq, eduLabels, eduCounts, assetBuckets };
  }, [candidates]);

  if (stats.total === 0) return null;

  const casePct = pct(stats.withCases, stats.total);
  const femalePct = pct(stats.female, stats.total);

  const assetData = Object.entries(stats.assetBuckets).map(([name, value]) => ({ name, value }));
  const eduData = stats.eduLabels.map((name, i) => ({ name, value: stats.eduCounts[i] }));
  const assetColors = ['#6b7280', '#3b82f6', '#f59e0b', '#10b981'];
  const eduColors = ['#9ca3af', '#6b7280', '#3b82f6', '#8b5cf6', '#f59e0b'];

  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}>
      <h2 className="mb-4 text-base font-bold text-gray-900">Constituency Insights</h2>

      <div className="grid gap-5 sm:grid-cols-2">
        {/* Criminal cases */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium text-gray-700">Candidates with criminal cases</span>
            <span className={`font-bold ${casePct > 30 ? 'text-red-600' : 'text-gray-600'}`}>
              {stats.withCases} / {stats.total} ({casePct}%)
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full transition-all ${casePct > 30 ? 'bg-red-500' : 'bg-amber-400'}`}
              style={{ width: `${casePct}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-gray-400">Based on self-declared ECI affidavits</p>
        </div>

        {/* Gender */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium text-gray-700">Women candidates</span>
            <span className="font-bold text-blue-600">
              {stats.female} / {stats.total} ({femalePct}%)
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-blue-500" style={{ width: `${femalePct}%` }} />
          </div>
        </div>

        {/* Asset distribution */}
        <div>
          <p className="mb-2 text-xs font-medium text-gray-700">Asset distribution</p>
          <div className="mb-1 flex items-baseline gap-3 text-xs text-gray-500">
            <span>Avg: <strong className="text-gray-800">{formatCurrency(stats.avgAssets)}</strong></span>
            <span>Median: <strong className="text-gray-800">{formatCurrency(stats.med)}</strong></span>
          </div>
          <ResponsiveContainer width="100%" height={80}>
            <BarChart data={assetData} margin={{ top: 0, right: 0, bottom: 0, left: -24 }}>
              <XAxis dataKey="name" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                {assetData.map((_, i) => (
                  <Cell key={i} fill={assetColors[i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Education distribution */}
        <div>
          <p className="mb-2 text-xs font-medium text-gray-700">Education breakdown</p>
          <ResponsiveContainer width="100%" height={80}>
            <BarChart data={eduData} margin={{ top: 0, right: 0, bottom: 0, left: -24 }}>
              <XAxis dataKey="name" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                {eduData.map((_, i) => (
                  <Cell key={i} fill={eduColors[i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Data quality */}
      <div className="mt-4 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
          <div
            className={`h-full rounded-full ${stats.dq >= 80 ? 'bg-green-500' : stats.dq >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
            style={{ width: `${stats.dq}%` }}
          />
        </div>
        <span className="text-xs text-gray-500">
          Data completeness: <strong>{stats.dq}%</strong>
        </span>
      </div>
    </div>
  );
}

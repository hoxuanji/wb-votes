'use client';

import { useMemo } from 'react';
import {
  TrendingUp, AlertTriangle, ShieldCheck, Zap, Star,
  Users, BookOpen, RefreshCw, BarChart2, Flag,
} from 'lucide-react';
import type { Candidate, FunFact } from '@/types';
import { generateFunFacts } from '@/lib/fun-facts';

const ICON_MAP: Record<string, React.ElementType> = {
  TrendingUp, AlertTriangle, ShieldCheck, Zap, Star,
  Users, BookOpen, RefreshCw, BarChart2, Flag,
};

const CATEGORY_COLORS: Record<string, string> = {
  Finance: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  'Criminal Record': 'bg-red-50 border-red-200 text-red-700',
  Demographics: 'bg-blue-50 border-blue-200 text-blue-700',
  Education: 'bg-purple-50 border-purple-200 text-purple-700',
  Incumbency: 'bg-amber-50 border-amber-200 text-amber-700',
  Overview: 'bg-gray-50 border-gray-200 text-gray-700',
};

function FactCard({ fact }: { fact: FunFact }) {
  const Icon = ICON_MAP[fact.icon] ?? Flag;
  const colorClass = CATEGORY_COLORS[fact.category] ?? CATEGORY_COLORS.Overview;

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: 'WB Votes — Did You Know?', text: fact.shareText }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(fact.shareText).catch(() => {});
    }
  };

  return (
    <div className={`rounded-xl border p-4 ${colorClass} flex flex-col gap-2`}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-snug">{fact.headline}</p>
          <p className="mt-1 text-xs opacity-80 leading-relaxed">{fact.detail}</p>
        </div>
      </div>
      <button
        onClick={handleShare}
        className="self-start rounded-md px-2.5 py-1 text-[10px] font-medium border border-current opacity-60 hover:opacity-100 transition-opacity"
      >
        Share
      </button>
    </div>
  );
}

interface FunFactsPanelProps {
  candidates: Candidate[];
  className?: string;
}

export function FunFactsPanel({ candidates, className = '' }: FunFactsPanelProps) {
  const facts = useMemo(() => generateFunFacts(candidates), [candidates]);

  if (facts.length === 0) return null;

  return (
    <div className={className}>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-lg">💡</span>
        <h2 className="text-base font-bold text-gray-900">Did You Know?</h2>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
          {facts.length} facts
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {facts.map(fact => (
          <FactCard key={fact.id} fact={fact} />
        ))}
      </div>
    </div>
  );
}

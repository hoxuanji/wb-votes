'use client';

import Link from 'next/link';
import { MapPin, Edit3, MessageSquareWarning } from 'lucide-react';
import { useHomeAC } from '@/lib/use-home-ac';
import { getConstituencyById } from '@/data/constituencies';
import { MLAScorecard } from '@/components/MLAScorecard';
import { ConstituencyNewsFeed } from '@/components/ConstituencyNewsFeed';
import { useLanguage } from '@/lib/language-context';

interface Props {
  className?: string;
}

export function MyACSection({ className = '' }: Props) {
  const { homeAC, setHomeAC, ready } = useHomeAC();
  const { lang, t } = useLanguage();

  if (!ready) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="h-10 animate-pulse rounded-lg bg-white/5" />
        <div className="h-64 animate-pulse rounded-xl bg-white/5" />
        <div className="h-48 animate-pulse rounded-xl bg-white/5" />
        <div className="h-12 animate-pulse rounded-lg bg-white/5" />
      </div>
    );
  }

  if (!homeAC) return null;

  const ac = getConstituencyById(homeAC);
  if (!ac) return null;

  const acName     = lang === 'bn' ? ac.nameBn     : ac.name;
  const acDistrict = lang === 'bn' ? ac.districtBn : ac.district;

  return (
    <section className={`space-y-4 ${className}`}>
      {/* Header strip */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <MapPin className="h-4 w-4 shrink-0 text-blue-400" />
          <p className="truncate text-sm text-gray-200">
            {t('Tracking', 'অনুসরণ করছেন')} <span className="font-semibold text-white">{acName}</span>
            <span className="text-gray-500">, {acDistrict}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setHomeAC(null)}
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-400 hover:bg-white/5 hover:text-white outline-none focus:outline-none"
        >
          <Edit3 className="h-3 w-3" />
          {t('Change', 'পরিবর্তন')}
        </button>
      </div>

      <MLAScorecard constituencyId={homeAC} phase="governance" />

      <ConstituencyNewsFeed constituencyId={homeAC} />

      <Link
        href={`/find-rep?ac=${homeAC}`}
        className="flex items-center justify-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm font-medium text-blue-300 hover:bg-blue-500/20"
      >
        <MessageSquareWarning className="h-4 w-4" />
        {t(`Report an issue in ${ac.name} →`, `${ac.nameBn} কেন্দ্রে সমস্যা রিপোর্ট করুন →`)}
      </Link>
    </section>
  );
}

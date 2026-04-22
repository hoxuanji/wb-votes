'use client';

import Image from 'next/image';
import Link from 'next/link';
import { AlertTriangle, BookOpen, Briefcase, TrendingUp } from 'lucide-react';
import type { Candidate, Party } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { useLanguage } from '@/lib/language-context';

interface CandidateCardProps {
  candidate: Candidate;
  party: Party;
  selected?: boolean;
  onSelectToggle?: (id: string) => void;
  showCompareCheckbox?: boolean;
}

export function CandidateCard({
  candidate,
  party,
  selected,
  onSelectToggle,
  showCompareCheckbox,
}: CandidateCardProps) {
  const { t } = useLanguage();

  const criminalVariant =
    candidate.criminalCases === 0 ? 'success'
    : candidate.criminalCases <= 2 ? 'warning'
    : 'danger';

  return (
    <div
      className={`group relative rounded-xl border bg-white shadow-sm transition-all duration-150 active:scale-[0.985] ${
        selected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:shadow-md active:shadow-sm'
      }`}
    >
      {/* Compare checkbox */}
      {showCompareCheckbox && (
        <label className="absolute right-3 top-3 flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/90 px-2 py-1 text-xs font-medium shadow-sm border border-gray-200">
          <input
            type="checkbox"
            checked={selected ?? false}
            onChange={() => onSelectToggle?.(candidate.id)}
            className="h-3.5 w-3.5 accent-blue-600"
          />
          {t('Compare', 'তুলনা')}
        </label>
      )}

      {/* Party colour strip */}
      <div className="h-1.5 w-full rounded-t-xl" style={{ backgroundColor: party.color }} />

      <div className="p-4">
        {/* Top: photo + name + party */}
        <div className="mb-3 flex items-center gap-3">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border-2" style={{ borderColor: party.color + '55' }}>
            {candidate.photoUrl ? (
              <Image
                src={candidate.photoUrl.replace(/backgroundColor=[^&]+/, `backgroundColor=${party.color.replace('#', '')}`)}
                alt={candidate.name}
                fill
                className="object-cover"
                sizes="56px"
              />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center text-lg font-bold text-white"
                style={{ backgroundColor: party.color }}
              >
                {candidate.name.charAt(0)}
              </div>
            )}
          </div>

          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-gray-900">
              {t(candidate.name, candidate.nameBn ?? candidate.name)}
            </h3>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: party.color }}
              />
              <span className="text-xs font-medium text-gray-600">{party.abbreviation}</span>
              {candidate.isIncumbent && (
                <Badge variant="neutral" className="text-[10px]">
                  {t('Incumbent', 'বর্তমান বিধায়ক')}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-2">
            <BookOpen className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span className="truncate text-gray-600" title={candidate.education}>
              {t(candidate.education, candidate.educationBn ?? candidate.education)}
            </span>
          </div>

          <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 ${
            candidate.criminalCases === 0 ? 'bg-green-50' : candidate.criminalCases <= 2 ? 'bg-amber-50' : 'bg-red-50'
          }`}>
            <AlertTriangle className={`h-3.5 w-3.5 shrink-0 ${
              candidate.criminalCases === 0 ? 'text-green-500' : candidate.criminalCases <= 2 ? 'text-amber-500' : 'text-red-500'
            }`} />
            <span className={
              candidate.criminalCases === 0 ? 'text-green-700' : candidate.criminalCases <= 2 ? 'text-amber-700' : 'text-red-700'
            }>
              {candidate.criminalCases === 0
                ? t('No cases', 'কোনো মামলা নেই')
                : `${candidate.criminalCases} ${t('case(s)', 'মামলা')}`}
            </span>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-2">
            <TrendingUp className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span className="text-gray-600">
              {candidate.totalAssets > 0 ? formatCurrency(candidate.totalAssets) : <span className="text-gray-400 italic">Not declared</span>}
            </span>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-2">
            <Briefcase className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span className="truncate text-gray-600">
              {t(candidate.occupation ?? '—', candidate.occupationBn ?? candidate.occupation ?? '—')}
            </span>
          </div>
        </div>

        {/* View profile link */}
        <Link
          href={`/candidate/${candidate.id}`}
          className="mt-3 flex w-full items-center justify-center rounded-lg border border-gray-200 py-2.5 text-xs font-medium text-gray-700 transition-all duration-150 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 active:bg-blue-100 active:border-blue-400 min-h-[40px]"
        >
          {t('View Full Profile →', 'সম্পূর্ণ প্রোফাইল দেখুন →')}
        </Link>
      </div>
    </div>
  );
}

'use client';

import Image from 'next/image';
import { AlertTriangle, BookOpen, Briefcase, TrendingUp, TrendingDown } from 'lucide-react';
import type { Candidate, Party } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { useLanguage } from '@/lib/language-context';

interface ComparisonTableProps {
  candidates: Candidate[];
  parties: Party[];
}

interface Row {
  label: string;
  labelBn: string;
  key: keyof Candidate | 'netAssets';
  render: (c: Candidate, p: Party) => React.ReactNode;
  highlight?: 'lower_better' | 'higher_better' | 'none';
}

function getParty(candidate: Candidate, parties: Party[]): Party {
  return parties.find((p) => p.id === candidate.partyId) ?? {
    id: 'IND', name: 'Independent', nameBn: 'নির্দল', abbreviation: 'IND', color: '#546E7A', isNational: false,
  };
}

export function ComparisonTable({ candidates, parties }: ComparisonTableProps) {
  const { t } = useLanguage();

  if (candidates.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 py-12 text-center text-sm text-gray-500">
        {t('Select candidates to compare.', 'তুলনা করতে প্রার্থী বেছে নিন।')}
      </div>
    );
  }

  const rows: Row[] = [
    {
      label: 'Party', labelBn: 'দল', key: 'partyId', highlight: 'none',
      render: (c, p) => (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="font-medium">{t(p.name, p.nameBn)}</span>
        </span>
      ),
    },
    {
      label: 'Age', labelBn: 'বয়স', key: 'age', highlight: 'none',
      render: (c) => `${c.age} yrs`,
    },
    {
      label: 'Gender', labelBn: 'লিঙ্গ', key: 'gender', highlight: 'none',
      render: (c) => t(c.gender, c.gender === 'Male' ? 'পুরুষ' : c.gender === 'Female' ? 'মহিলা' : 'অন্যান্য'),
    },
    {
      label: 'Education', labelBn: 'শিক্ষা', key: 'education', highlight: 'none',
      render: (c) => t(c.education, c.educationBn ?? c.education),
    },
    {
      label: 'Occupation', labelBn: 'পেশা', key: 'occupation', highlight: 'none',
      render: (c) => t(c.occupation ?? '—', c.occupationBn ?? c.occupation ?? '—'),
    },
    {
      label: 'Criminal Cases', labelBn: 'ফৌজদারি মামলা', key: 'criminalCases', highlight: 'lower_better',
      render: (c) => (
        <span className={c.criminalCases === 0 ? 'text-green-600 font-medium' : c.criminalCases <= 2 ? 'text-amber-600 font-medium' : 'text-red-600 font-bold'}>
          {c.criminalCases === 0 ? t('None', 'শূন্য') : c.criminalCases}
        </span>
      ),
    },
    {
      label: 'Total Assets', labelBn: 'মোট সম্পদ', key: 'totalAssets', highlight: 'none',
      render: (c) => formatCurrency(c.totalAssets),
    },
    {
      label: 'Total Liabilities', labelBn: 'মোট দায়', key: 'totalLiabilities', highlight: 'lower_better',
      render: (c) => formatCurrency(c.totalLiabilities),
    },
    {
      label: 'Net Assets', labelBn: 'নিট সম্পদ', key: 'netAssets', highlight: 'none',
      render: (c) => {
        const net = c.totalAssets - c.totalLiabilities;
        return (
          <span className={net >= 0 ? 'text-green-600' : 'text-red-600'}>
            {formatCurrency(Math.abs(net))}
          </span>
        );
      },
    },
    {
      label: 'Incumbent', labelBn: 'বর্তমান বিধায়ক', key: 'isIncumbent', highlight: 'none',
      render: (c) => c.isIncumbent
        ? <span className="text-blue-600 font-medium">{t(`Yes (${c.incumbentYears ?? '?'}y)`, `হ্যাঁ (${c.incumbentYears ?? '?'} বছর)`)}</span>
        : <span className="text-gray-500">{t('No', 'না')}</span>,
    },
  ];

  // Find best/worst for numeric highlight rows
  const criminalValues = candidates.map((c) => c.criminalCases);
  const minCriminal = Math.min(...criminalValues);
  const liabilityValues = candidates.map((c) => c.totalLiabilities);
  const minLiability = Math.min(...liabilityValues);

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              {t('Criteria', 'মানদণ্ড')}
            </th>
            {candidates.map((c) => {
              const p = getParty(c, parties);
              return (
                <th key={c.id} className="px-4 py-3 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <div className="relative h-10 w-10 overflow-hidden rounded-full border-2" style={{ borderColor: p.color }}>
                      {c.photoUrl ? (
                        <Image src={c.photoUrl} alt={c.name} fill className="object-cover" sizes="40px" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: p.color }}>
                          {c.name.charAt(0)}
                        </div>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-gray-900">{t(c.name, c.nameBn ?? c.name)}</span>
                    <span className="text-[10px] text-gray-500">{p.abbreviation}</span>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.key} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
              <td className="px-4 py-3 text-xs font-medium text-gray-600">
                {t(row.label, row.labelBn)}
              </td>
              {candidates.map((c) => {
                const p = getParty(c, parties);
                let isBest = false;
                if (row.key === 'criminalCases') isBest = c.criminalCases === minCriminal;
                if (row.key === 'totalLiabilities') isBest = c.totalLiabilities === minLiability;

                return (
                  <td
                    key={c.id}
                    className={`px-4 py-3 text-center text-sm ${isBest && row.highlight === 'lower_better' ? 'bg-green-50' : ''}`}
                  >
                    {row.render(c, p)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

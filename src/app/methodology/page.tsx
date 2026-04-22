import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Database, Calculator, Scale, AlertTriangle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Methodology & Data Sources — WB Votes',
  description: 'How WB Votes collects, processes, and scores candidate data. Full transparency on sources, scoring, and limitations.',
};

const sections = [
  {
    icon: Database,
    title: 'Data Sources',
    color: 'blue',
    items: [
      { label: 'Primary source', value: 'MyNeta.info (run by Association for Democratic Reforms)', link: 'https://myneta.info' },
      { label: 'Original affidavits', value: 'Election Commission of India Affidavit Portal', link: 'https://affidavit.eci.gov.in' },
      { label: 'Party funding', value: 'ECI Annual Audit Reports + SC-ordered Electoral Bond disclosure (2018-2024)', link: 'https://www.eci.gov.in/contribution-reports' },
      { label: 'Constituency boundaries', value: 'Delimitation Order 2008 — West Bengal (294 assembly segments)' },
      { label: 'Data collection', value: 'Automated scraper from myneta.info/WestBengal2026 (April 2026)' },
    ],
  },
  {
    icon: Calculator,
    title: 'Candidate Integrity Score (0–100)',
    color: 'green',
    items: [
      { label: 'Base score', value: '100 points' },
      { label: 'Criminal case deduction', value: '−15 per pending case, maximum −60 deduction' },
      { label: 'Education bonus', value: '+5 (10th pass) / +10 (12th) / +15 (Graduate) / +20 (Post-graduate or PhD)' },
      { label: 'Affidavit filed', value: '+5 if affidavit URL is on record' },
      { label: 'Final range', value: 'Clamped to [0, 100]' },
    ],
  },
  {
    icon: Scale,
    title: 'Quiz Alignment Score',
    color: 'purple',
    items: [
      { label: 'Method', value: '10 policy questions across Jobs, Infrastructure, Healthcare, Education, Law & Order, Environment' },
      { label: 'Party alignment', value: 'Each answer weighted against known party policy positions (0–10 per party per question)' },
      { label: 'Final score', value: 'Party alignment (60%) + Candidate integrity score (40%), rounded to nearest integer' },
      { label: 'Neutrality', value: 'Questions and weights reviewed for partisan bias. No party is favoured in the scoring rubric.' },
    ],
  },
  {
    icon: AlertTriangle,
    title: 'Limitations & Caveats',
    color: 'red',
    items: [
      { label: 'Self-declared data', value: 'All asset and criminal case figures are self-reported by candidates in ECI affidavits. WB Votes does not verify them.' },
      { label: 'Missing data', value: 'Some candidates did not fully complete their affidavit. Missing fields are shown as "Not declared" — not zero.' },
      { label: 'Party policy positions', value: 'Quiz scoring is based on publicly stated party manifestos and positions, which may not reflect actual governance.' },
      { label: 'Funding data', value: 'Party contribution data is from 2022-23 national reports. WB-specific or 2025-26 data is not separately disclosed.' },
      { label: 'Photo rights', value: 'Candidate photos are from myneta.info public pages. For candidates without photos, DiceBear avatar initials are shown.' },
    ],
  },
];

const colorMap: Record<string, string> = {
  blue: 'bg-blue-50 border-blue-200 text-blue-600',
  green: 'bg-green-50 border-green-200 text-green-600',
  purple: 'bg-purple-50 border-purple-200 text-purple-600',
  red: 'bg-red-50 border-red-200 text-red-600',
};

export default function MethodologyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/" className="mb-6 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      <h1 className="mb-2 text-3xl font-extrabold text-gray-900">Methodology & Data Sources</h1>
      <p className="mb-10 text-base text-gray-500">
        Full transparency on how WB Votes collects, processes, and presents election data. We are non-partisan,
        non-commercial, and not affiliated with any political party or the Election Commission of India.
      </p>

      <div className="space-y-8">
        {sections.map(section => {
          const Icon = section.icon;
          const colorClass = colorMap[section.color] ?? colorMap.blue;
          return (
            <div key={section.title} className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
              <div className={`flex items-center gap-3 border-b px-5 py-4 ${colorClass.replace('text-', 'border-').split(' ')[1]}`}>
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg border ${colorClass}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <h2 className="text-base font-bold text-gray-900">{section.title}</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {section.items.map(item => (
                  <div key={item.label} className="px-5 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-0.5">{item.label}</p>
                    {item.link ? (
                      <a href={item.link} target="_blank" rel="noopener noreferrer"
                         className="text-sm text-blue-600 hover:underline">
                        {item.value} ↗
                      </a>
                    ) : (
                      <p className="text-sm text-gray-700">{item.value}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-10 rounded-xl border border-amber-200 bg-amber-50 p-5">
        <p className="text-sm font-semibold text-amber-800 mb-1">Official Disclaimer</p>
        <p className="text-sm text-amber-700">
          This platform presents publicly available data for informational purposes only. It does not endorse,
          recommend, or oppose any candidate, political party, or ideology. All data is sourced from official
          public records. Voters are encouraged to read original affidavits and conduct their own research
          before making electoral decisions.
        </p>
      </div>
    </div>
  );
}

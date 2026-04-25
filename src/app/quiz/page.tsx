import type { Metadata } from 'next';
import { ClipboardList } from 'lucide-react';
import { QuizComponent } from '@/components/QuizComponent';

export const metadata: Metadata = {
  title: 'Policy Quiz — WB Votes',
  description:
    'Answer 10 policy questions and see how your preferences align with major political parties in West Bengal. Non-partisan. No personal data collected.',
};

export default function QuizPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/20">
          <ClipboardList className="h-6 w-6 text-blue-400" />
        </div>
        <h1 className="text-2xl font-extrabold text-white">Policy Alignment Quiz</h1>
        <p className="mt-2 text-sm text-gray-400">
          Answer 10 questions about your policy preferences. We'll calculate how well your views align with major parties' publicly stated positions.
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-3 text-xs text-gray-500">
          <span>✓ 10 questions</span>
          <span>✓ ~3 minutes</span>
          <span>✓ No personal data collected</span>
          <span>✓ Non-partisan</span>
        </div>
      </div>

      <QuizComponent />
    </div>
  );
}

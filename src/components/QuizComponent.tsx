'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, ChevronLeft, CheckCircle2, MapPin, Search, X } from 'lucide-react';
import { quizQuestions, calculateAlignment } from '@/data/quiz';
import { parties } from '@/data/parties';
import { constituencies } from '@/data/constituencies';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/lib/language-context';
import type { QuizAnswer } from '@/types';

const STEP_CONSTITUENCY = -1;

export function QuizComponent() {
  const router = useRouter();
  const { t } = useLanguage();
  const [step, setStep] = useState<number>(STEP_CONSTITUENCY);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [constituencyId, setConstituencyId] = useState<string | null>(null);
  const [constSearch, setConstSearch] = useState('');

  const total = quizQuestions.length;
  const isConstituencyStep = step === STEP_CONSTITUENCY;
  const currentIdx = isConstituencyStep ? 0 : step;
  const question = isConstituencyStep ? null : quizQuestions[currentIdx];
  const currentAnswer = question ? answers.find(a => a.questionId === question.id) : null;
  const answeredCount = answers.length;
  const progress = isConstituencyStep ? 0 : (answeredCount / total) * 100;

  const filteredConsts = useMemo(() => {
    const q = constSearch.trim().toLowerCase();
    if (!q) return constituencies.slice(0, 30);
    return constituencies
      .filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.district.toLowerCase().includes(q) ||
        c.nameBn.includes(constSearch.trim())
      )
      .slice(0, 30);
  }, [constSearch]);

  const handleSelect = (optionId: string) => {
    if (!question) return;
    setAnswers(prev => {
      const filtered = prev.filter(a => a.questionId !== question.id);
      return [...filtered, { questionId: question.id, optionId }];
    });
  };

  const handleNext = () => {
    if (step < total - 1) {
      setStep(i => i + 1);
    } else {
      const scores = calculateAlignment(answers);
      const partyResults = Object.entries(scores)
        .map(([partyId, score]) => {
          const party = parties.find(p => p.id === partyId);
          return {
            partyId,
            partyName: party?.name ?? partyId,
            partyAbbr: party?.abbreviation ?? partyId,
            score,
            color: party?.color ?? '#666',
            symbolUrl: party?.symbolUrl,
          };
        })
        .sort((a, b) => b.score - a.score);

      const encoded = encodeURIComponent(JSON.stringify(partyResults));
      const constParam = constituencyId ? `&constituency=${constituencyId}` : '';
      router.push(`/results?data=${encoded}${constParam}`);
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(i => i - 1);
    else if (step === 0) setStep(STEP_CONSTITUENCY);
  };

  // ── Constituency picker step ─────────────────────────────
  if (isConstituencyStep) {
    const selected = constituencyId ? constituencies.find(c => c.id === constituencyId) : null;
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 rounded-xl border border-blue-500/25 bg-blue-500/10 px-4 py-3 text-sm text-blue-300">
          <strong>Step 1 of 2:</strong> Select your constituency to see matching candidates after the quiz.
          <span className="ml-1 text-blue-400">You can skip this.</span>
        </div>

        <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-gray-100">
            {t('Which constituency are you voting in?', 'আপনি কোন নির্বাচনী এলাকায় ভোট দেবেন?')}
          </h2>

          {selected ? (
            <div className="mb-3 flex items-center justify-between rounded-xl border border-blue-500/25 bg-blue-500/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-blue-400" />
                <div>
                  <p className="text-sm font-semibold text-blue-200">{selected.name}</p>
                  <p className="text-xs text-blue-400">{selected.district}</p>
                </div>
              </div>
              <button
                onClick={() => setConstituencyId(null)}
                className="rounded-lg p-1 hover:bg-blue-500/20"
              >
                <X className="h-4 w-4 text-blue-400" />
              </button>
            </div>
          ) : (
            <>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  placeholder={t('Search constituency or district…', 'নির্বাচনী এলাকা বা জেলা খুঁজুন…')}
                  value={constSearch}
                  onChange={e => setConstSearch(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-white/5 py-2 pl-9 pr-3 text-sm text-gray-200 placeholder-gray-500 focus:border-blue-500/50 focus:outline-none"
                />
              </div>
              <div className="max-h-52 overflow-y-auto rounded-xl border border-white/10">
                {filteredConsts.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { setConstituencyId(c.id); setConstSearch(''); }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-blue-500/10"
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-200">
                        {c.name}
                        {c.reservation !== 'General' && (
                          <span className="ml-2 rounded-full bg-purple-500/15 px-1.5 py-0.5 text-[10px] text-purple-300">
                            {c.reservation}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">{c.district} · #{c.assemblyNumber}</p>
                    </div>
                  </button>
                ))}
                {filteredConsts.length === 0 && (
                  <p className="px-4 py-6 text-center text-sm text-gray-500">No constituencies found</p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={() => { setConstituencyId(null); setStep(0); }}
            className="text-sm text-gray-500 underline-offset-2 hover:text-gray-300 hover:underline"
          >
            {t('Skip this step', 'এই ধাপ বাদ দিন')}
          </button>
          <Button
            onClick={() => setStep(0)}
            className="gap-1"
            disabled={false}
          >
            {selected
              ? t('Continue with this constituency', 'এই এলাকা নিয়ে এগিয়ে যান')
              : t('Start Quiz without constituency', 'নির্বাচনী এলাকা ছাড়া শুরু করুন')}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // ── Question step ────────────────────────────────────────
  if (!question) return null;

  return (
    <div className="mx-auto max-w-2xl">
      {/* Constituency badge */}
      {constituencyId && (() => {
        const c = constituencies.find(x => x.id === constituencyId);
        return c ? (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-green-500/25 bg-green-500/10 px-3 py-2 text-xs text-green-300">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span>Showing results for <strong>{c.name}</strong></span>
          </div>
        ) : null;
      })()}

      {/* Progress */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-sm text-gray-400">
          <span>{t(`Question ${step + 1} of ${total}`, `প্রশ্ন ${step + 1} / ${total}`)}</span>
          <span className="font-medium text-blue-400">{Math.round(progress)}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-blue-600 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Category badge */}
      <div className="mb-3">
        <span className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-medium text-blue-300">
          {t(question.category, question.categoryBn)}
        </span>
      </div>

      {/* Question */}
      <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-100 sm:text-lg">
          {t(question.question, question.questionBn)}
        </h2>
      </div>

      {/* Options */}
      <div className="mb-6 flex flex-col gap-3">
        {question.options.map(option => {
          const isSelected = currentAnswer?.optionId === option.id;
          return (
            <button
              key={option.id}
              onClick={() => handleSelect(option.id)}
              className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                isSelected
                  ? 'border-blue-500 bg-blue-500/15 ring-2 ring-blue-500/20'
                  : 'border-white/10 bg-white/5 hover:border-blue-500/40 hover:bg-blue-500/10'
              }`}
            >
              <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                isSelected ? 'border-blue-500 bg-blue-500' : 'border-white/20'
              }`}>
                {isSelected && <CheckCircle2 className="h-4 w-4 text-white" />}
              </div>
              <span className="text-sm text-gray-200">
                {t(option.text, option.textBn)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={handleBack} className="gap-1">
          <ChevronLeft className="h-4 w-4" />
          {t('Back', 'পূর্ববর্তী')}
        </Button>

        <div className="flex gap-1.5">
          {quizQuestions.map((q, i) => (
            <button
              key={q.id}
              onClick={() => setStep(i)}
              className={`h-2 w-2 rounded-full transition-colors ${
                i === step ? 'bg-blue-500'
                : answers.find(a => a.questionId === q.id) ? 'bg-blue-400/50'
                : 'bg-white/20'
              }`}
              aria-label={`Question ${i + 1}`}
            />
          ))}
        </div>

        <Button onClick={handleNext} disabled={!currentAnswer} className="gap-1">
          {step === total - 1
            ? t('See Results', 'ফলাফল দেখুন')
            : t('Next', 'পরবর্তী')}
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <p className="mt-4 text-center text-xs text-gray-400">
        {t(
          'This quiz reflects policy preferences — not a voting recommendation.',
          'এই কুইজটি নীতি পছন্দ প্রতিফলিত করে — ভোটের সুপারিশ নয়।'
        )}
      </p>
    </div>
  );
}

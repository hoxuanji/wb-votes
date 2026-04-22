import { NextResponse } from 'next/server';
import { quizQuestions } from '@/data/quiz';

export async function GET() {
  // Strip party weights from the response for security/neutrality
  const sanitized = quizQuestions.map(({ id, question, questionBn, category, categoryBn, options }) => ({
    id,
    question,
    questionBn,
    category,
    categoryBn,
    options: options.map(({ id: oid, text, textBn }) => ({ id: oid, text, textBn })),
  }));

  return NextResponse.json({ data: sanitized, total: sanitized.length });
}

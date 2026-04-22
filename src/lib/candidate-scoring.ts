import type { Candidate, ScoreBreakdown } from '@/types';

export function getEducationTier(education: string): number {
  if (!education || education === 'Not declared') return 0;
  const e = education.toLowerCase();
  if (e.includes('phd') || e.includes('doctorate') || e.includes('doctor of')) return 4;
  if (
    e.includes('post graduate') || e.includes('postgraduate') ||
    e.includes(' pg ') || e.startsWith('pg') ||
    e.includes('mba') || e.includes('m.a') || e.includes('m.sc') ||
    e.includes('m.com') || e.includes('llm') || e.includes('m.tech') ||
    e.includes('master')
  ) return 3;
  if (
    e.includes('graduate') || e.includes('bachelor') ||
    e.includes('b.a') || e.includes('b.sc') || e.includes('b.com') ||
    e.includes('b.tech') || e.includes('be ') || e.includes('llb') ||
    e.includes('mbbs') || e.includes('degree')
  ) return 2;
  if (
    e.includes('12th') || e.includes('hsc') || e.includes('higher secondary') ||
    e.includes('intermediate') || e.includes('10+2') || e.includes('class xii')
  ) return 1;
  if (
    e.includes('10th') || e.includes('ssc') || e.includes('matriculate') ||
    e.includes('class x') || e.includes('8th') || e.includes('5th')
  ) return 1;
  return 0;
}

export function computeIntegrityScore(candidate: Candidate): number {
  let score = 100;

  // Criminal cases: −15 per case, max −60
  if (candidate.criminalCases > 0) {
    score -= Math.min(candidate.criminalCases * 15, 60);
  }

  // Education bonus: +5 to +20
  const eduTier = getEducationTier(candidate.education);
  score += eduTier * 5;

  // Affidavit on file bonus
  if (candidate.affidavitUrl) score += 5;

  return Math.max(0, Math.min(100, score));
}

export function computeCandidateScore(
  candidate: Candidate,
  partyAlignScore: number,
): number {
  const integrityScore = computeIntegrityScore(candidate);
  return Math.round(partyAlignScore * 0.6 + integrityScore * 0.4);
}

export function getScoreBreakdown(
  candidate: Candidate,
  partyAlignScore: number,
): ScoreBreakdown {
  const integrityScore = computeIntegrityScore(candidate);
  const finalScore = Math.round(partyAlignScore * 0.6 + integrityScore * 0.4);

  const penaltyReasons: string[] = [];
  const bonusReasons: string[] = [];

  if (candidate.criminalCases > 0) {
    const penalty = Math.min(candidate.criminalCases * 15, 60);
    penaltyReasons.push(
      `−${penalty} for ${candidate.criminalCases} pending criminal case${candidate.criminalCases > 1 ? 's' : ''}`
    );
  }

  const eduTier = getEducationTier(candidate.education);
  if (eduTier > 0) {
    const bonus = eduTier * 5;
    const labels = ['', '10th/12th pass', 'Graduate', 'Post Graduate', 'PhD/Doctorate'];
    bonusReasons.push(`+${bonus} for ${labels[eduTier]} education`);
  }

  if (candidate.affidavitUrl) {
    bonusReasons.push('+5 for affidavit on public record');
  }

  if (bonusReasons.length === 0 && penaltyReasons.length === 0) {
    bonusReasons.push('Standard profile — no declared criminal cases');
  }

  return { finalScore, partyScore: partyAlignScore, integrityScore, penaltyReasons, bonusReasons };
}

export function getAssetBucket(amount: number): 'Low' | 'Medium' | 'High' | 'Very High' {
  if (amount < 1_000_000) return 'Low';         // < ₹10L
  if (amount < 10_000_000) return 'Medium';     // ₹10L – ₹1Cr
  if (amount < 100_000_000) return 'High';      // ₹1Cr – ₹10Cr
  return 'Very High';                           // ≥ ₹10Cr
}

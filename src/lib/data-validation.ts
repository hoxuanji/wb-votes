import type { Candidate } from '@/types';

export interface ValidationResult {
  isValid: boolean;
  flags: string[];
  severity: 'clean' | 'warn' | 'alert';
}

const ASSET_ANOMALY_THRESHOLD = 500_000_000; // ₹50 Cr+
const ASSET_EXTREME_THRESHOLD = 2_000_000_000; // ₹200 Cr+

export function validateCandidate(c: Candidate): ValidationResult {
  const flags: string[] = [];

  if (!c.affidavitUrl) flags.push('Missing affidavit URL');
  if (c.age === 0 || c.age < 18) flags.push('Age not declared or invalid');
  if (!c.education || c.education === 'Not declared') flags.push('Education not declared');
  if (c.totalAssets === 0 && c.totalLiabilities === 0) flags.push('Asset data not available');
  if (c.totalAssets > ASSET_EXTREME_THRESHOLD) flags.push(`Extremely high assets: ₹${(c.totalAssets / 10_000_000).toFixed(0)} Cr declared`);
  else if (c.totalAssets > ASSET_ANOMALY_THRESHOLD) flags.push(`High assets: ₹${(c.totalAssets / 10_000_000).toFixed(0)} Cr declared`);
  if (c.criminalCases > 20) flags.push(`${c.criminalCases} pending criminal cases declared`);

  const severity: ValidationResult['severity'] =
    c.criminalCases > 20 || c.totalAssets > ASSET_EXTREME_THRESHOLD
      ? 'alert'
      : flags.length > 2
      ? 'warn'
      : 'clean';

  return { isValid: flags.length === 0, flags, severity };
}

export function getDataQualityScore(candidates: Candidate[]): number {
  if (candidates.length === 0) return 0;
  const fields: Array<keyof Candidate> = ['age', 'education', 'totalAssets', 'affidavitUrl', 'gender'];
  let filled = 0;
  for (const c of candidates) {
    for (const f of fields) {
      const v = c[f];
      if (v && v !== 'Not declared' && v !== 0) filled++;
    }
  }
  return Math.round((filled / (candidates.length * fields.length)) * 100);
}

export function normalizePartyName(raw: string): string {
  const map: Record<string, string> = {
    'AITC': 'All India Trinamool Congress (TMC)',
    'BJP': 'Bharatiya Janata Party (BJP)',
    'INC': 'Indian National Congress (INC)',
    'CPI(M)': 'Communist Party of India (Marxist)',
    'SUCI': 'SUCI (Communist)',
    'BSP': 'Bahujan Samaj Party',
    'IND': 'Independent',
  };
  return map[raw] || raw;
}

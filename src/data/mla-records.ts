// AUTO-GENERATED — WB MLA performance records — 2026-04-29
// Built by: node scripts/build-mla-records.js
// Source: scripts/data/mla-records.json (wbassembly.gov.in + PRS India)
import type { MLARecord } from '@/types';

export const mlaRecords: MLARecord[] = [];

export function getMLARecordForAC(
  constituencyId: string,
  term: '2021-2026' | '2026-2031' = '2021-2026',
): MLARecord | undefined {
  return mlaRecords.find(
    (r) => r.constituencyId === constituencyId && r.term === term,
  );
}

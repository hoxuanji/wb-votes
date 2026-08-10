// NOTE: this module is EMPTY and has always been empty. `mlaRecords` is a zero-length array,
// so `getMLARecordForAC` returns undefined for every input and the performance panel that calls it
// renders nothing. MLA/MP performance is an unbuilt vertical (docs/platform/00-model.md §3):
// it needs `tenure`, `session` and `activity` tables and data from PRS India, none of which
// exist. Kept only because two components import the accessor; delete both when the real
// vertical lands, and do not fill this file with plausible numbers in the meantime.
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

// NOTE: this module is EMPTY and has always been empty. `wbmpRecords` is a zero-length array,
// so `getMPRecord` returns undefined for every input and the performance panel that calls it
// renders nothing. MLA/MP performance is an unbuilt vertical (docs/platform/00-model.md §3):
// it needs `tenure`, `session` and `activity` tables and data from PRS India, none of which
// exist. Kept only because two components import the accessor; delete both when the real
// vertical lands, and do not fill this file with plausible numbers in the meantime.
// AUTO-GENERATED — WB Lok Sabha MP performance (PRS India) — 2026-05-21
// Built by: node scripts/build-wbmps-performance.js
// Source: scripts/data/wbmps-performance.json (run npm run scrape:prs-mp first)
import type { WBMPRecord } from '@/types';

export const wbmpRecords: WBMPRecord[] = [];

export function getMPRecord(mpId: string): WBMPRecord | undefined {
  return wbmpRecords.find((r) => r.mpId === mpId);
}

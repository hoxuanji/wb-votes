// AUTO-GENERATED — WB Lok Sabha MP performance (PRS India) — 2026-05-21
// Built by: node scripts/build-wbmps-performance.js
// Source: scripts/data/wbmps-performance.json (run npm run scrape:prs-mp first)
import type { WBMPRecord } from '@/types';

export const wbmpRecords: WBMPRecord[] = [];

export function getMPRecord(mpId: string): WBMPRecord | undefined {
  return wbmpRecords.find((r) => r.mpId === mpId);
}

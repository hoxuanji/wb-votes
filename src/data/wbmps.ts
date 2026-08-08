// AUTO-GENERATED — West Bengal Lok Sabha MPs (2024 general election) — 2026-05-21
// Built by: node scripts/build-wbmps.js  (writes data/seed/wbmps.json)
// Source: scripts/data/wbmps-2024.json
import type { WBMP } from '@/types';
import raw from '../../data/seed/wbmps.json';

export const wbMPs = raw as WBMP[];

export function getMPByLSConstituency(lsConstituency: string): WBMP | undefined {
  return wbMPs.find((m) => m.lsConstituency.toLowerCase() === lsConstituency.toLowerCase());
}

export function getMPById(id: string): WBMP | undefined {
  return wbMPs.find((m) => m.id === id);
}

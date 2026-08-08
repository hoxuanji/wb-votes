// AUTO-GENERATED — Sitting MLAs for current WB Assembly term — 2026-06-25
// Built by: node scripts/build-current-mla.js  (writes data/seed/current-mla.json)
// Source: scripts/data/current-mla.json — hand-curated from authoritative sources.
// Coverage gap: as of last build, 294/294 ACs are populated.
import type { CurrentMLA } from '@/types';
import raw from '../../data/seed/current-mla.json';

export const currentMLAs = raw as CurrentMLA[];

export function getCurrentMLAForAC(constituencyId: string): CurrentMLA | undefined {
  return currentMLAs.find((m) => m.constituencyId === constituencyId);
}

export function hasCurrentMLAData(constituencyId: string): boolean {
  return currentMLAs.some((m) => m.constituencyId === constituencyId);
}

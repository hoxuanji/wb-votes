// AUTO-GENERATED — WB constituency demographics — 2026-04-29
// Built by: node scripts/build-demographics.js  (writes data/seed/demographics.json)
// Source: Census of India 2011 (district-level) + optional AC overrides
import type { ACDemographics } from '@/types';
import raw from '../../data/seed/demographics.json';

export const demographics = raw as ACDemographics[];

export function getDemographicsForAC(constituencyId: string): ACDemographics | undefined {
  return demographics.find((d) => d.constituencyId === constituencyId);
}

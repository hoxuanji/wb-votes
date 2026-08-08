// AUTO-GENERATED — myneta.info/WestBengal2026 — 2026-04-25
// Built by: node scripts/build-data.js  (writes data/seed/constituencies.json)
import type { Constituency } from '@/types';
import raw from '../../data/seed/constituencies.json';

export const constituencies = raw as Constituency[];

export function getConstituencyById(id: string): Constituency | undefined {
  return constituencies.find((c) => c.id === id);
}

export function getConstituenciesByDistrict(): Record<string, Constituency[]> {
  return constituencies.reduce<Record<string, Constituency[]>>((acc, c) => {
    if (!acc[c.district]) acc[c.district] = [];
    acc[c.district].push(c);
    return acc;
  }, {});
}

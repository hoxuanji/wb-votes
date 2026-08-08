// AUTO-GENERATED — WB historical Assembly results — 2026-05-15
// Built by: node scripts/build-historical.js  (writes data/seed/historical-results.json)
// Sources: src/data/raw/historical/lokdhaba-wb-ac-{year}.csv (preferred)
//        + src/data/raw/historical/IndiaVotes_AC__West_Bengal_{year}.csv (winner-only fallback)
//        + src/data/raw/historical/{year}.json (legacy)
//        + scripts/data/incumbents-2021.csv (2021 last-resort)
// Rows live in data/seed/historical-results.json, ordered 2011, 2016, 2021, 2026.
import type { HistoricalACResult } from '@/types';
import raw from '../../data/seed/historical-results.json';

export const historicalResults = raw as HistoricalACResult[];

export function getHistoricalResultsForAC(constituencyId: string): HistoricalACResult[] {
  return historicalResults
    .filter((r) => r.constituencyId === constituencyId)
    .sort((a, b) => a.year - b.year);
}

export function getHistoricalResultForACYear(
  constituencyId: string,
  year: number,
): HistoricalACResult | undefined {
  return historicalResults.find((r) => r.constituencyId === constituencyId && r.year === year);
}

export function getAvailableHistoricalYears(): number[] {
  return Array.from(new Set(historicalResults.map((r) => r.year))).sort();
}

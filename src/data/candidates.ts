// AUTO-GENERATED — myneta.info/WestBengal2026 — 2026-04-25
// Built by: node scripts/build-data.js  (writes data/seed/candidates.json)
// Rows live in data/seed/candidates.json — the committed RAW tier the registry ingest reads.
// Retrieval dates moved with them, into data/seed/provenance.json.
import type { Candidate } from '@/types';
import raw from '../../data/seed/candidates.json';

export const candidates = raw as Candidate[];

export function getCandidatesByConstituency(constituencyId: string): Candidate[] {
  return candidates.filter((c) => c.constituencyId === constituencyId);
}

export function getCandidateById(id: string): Candidate | undefined {
  return candidates.find((c) => c.id === id);
}

export function getCandidatesByIds(ids: string[]): Candidate[] {
  return ids.map((id) => candidates.find((c) => c.id === id)).filter(Boolean) as Candidate[];
}

export function formatAssets(amount: number): string {
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(2)} Cr`;
  if (amount >= 100_000)    return `₹${(amount / 100_000).toFixed(2)} L`;
  if (amount >= 1_000)      return `₹${(amount / 1_000).toFixed(1)}K`;
  return `₹${amount}`;
}

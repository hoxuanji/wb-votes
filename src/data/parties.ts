// AUTO-GENERATED parties for West Bengal 2026 Assembly Election
// Rows live in data/seed/parties.json. This module never carried a retrieval date, so it has no
// entry in data/seed/provenance.json — the ingest still raises `no_header_date` for it.
import type { Party } from '@/types';
import raw from '../../data/seed/parties.json';

export const parties = raw as Party[];

export function getPartyById(id: string): Party | undefined {
  return parties.find((p) => p.id === id);
}

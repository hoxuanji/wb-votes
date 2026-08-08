// AUTO-GENERATED — WB Cabinet (2026 term) — 2026-05-21
// Built by: node scripts/build-cabinet.js  (writes data/seed/cabinet.json)
// Source: scripts/data/cabinet.json — keep in sync with wb.gov.in cabinet listings.
import type { CabinetMember } from '@/types';
import raw from '../../data/seed/cabinet.json';

export const wbCabinet2026 = raw as CabinetMember[];

export function getCabinetMemberById(id: string): CabinetMember | undefined {
  return wbCabinet2026.find((m) => m.id === id);
}

export function getCabinetMemberByConstituency(
  constituencyId: string,
): CabinetMember | undefined {
  return wbCabinet2026.find((m) => m.constituencyId === constituencyId);
}

export function getChiefMinister(): CabinetMember | undefined {
  return wbCabinet2026.find((m) =>
    m.portfolios.some((p) => p.rank === 'CM' && !p.to),
  );
}

export function getCurrentPortfolios(member: CabinetMember) {
  return member.portfolios.filter((p) => !p.to);
}

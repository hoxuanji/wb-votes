/**
 * Constituencies where a re-election / countermanded poll is pending.
 * Treated specially across the dashboard so they don't read as 'counting
 * not started' or 'pending' — the contest is structurally on hold.
 */
export const RE_ELECTION_ACS: Record<string, { reason: string; expected?: string }> = {
  c0152: {
    reason: 'Poll countermanded — fresh election scheduled',
    expected: 'Date to be announced by ECI',
  },
};

export function isReElectionAc(acId: string): boolean {
  return acId in RE_ELECTION_ACS;
}

export function reElectionInfo(acId: string) {
  return RE_ELECTION_ACS[acId];
}

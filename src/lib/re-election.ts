/**
 * Constituencies where a re-election / countermanded poll is pending.
 * Treated specially across the dashboard so they don't read as 'counting
 * not started' or 'pending' — the contest is structurally on hold.
 *
 * **Frozen 2026 archive content.** This map is consumed only by election-era
 * surfaces (live counting panel, post-counting tally) which are gated to
 * phase!=='governance'. The c0152 (Falta) repoll resolved on 24 May 2026
 * (BJP winner: Debangshu Panda, margin 109,021). The map is now empty;
 * future cycles should drive this from the forthcoming ElectionConfig.
 */
export const RE_ELECTION_ACS: Record<string, { reason: string; expected?: string }> = {};

export function isReElectionAc(acId: string): boolean {
  return acId in RE_ELECTION_ACS;
}

export function reElectionInfo(acId: string) {
  return RE_ELECTION_ACS[acId];
}

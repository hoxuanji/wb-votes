/**
 * election-phase.ts — Single source of truth for "where are we in the cycle".
 *
 * Reads NEXT_PUBLIC_ELECTION_PHASE (for client-visible decisions like default
 * tab / map mode) and ELECTION_PHASE (for server/scraper decisions).
 *
 * Valid values: 'pre' | 'live' | 'post' | 'governance' (default 'pre').
 *
 * - pre:        polling underway or in the future. Show candidates. Live tab hidden.
 * - live:       counting day — results being published. Live tab + /live enabled.
 * - post:       counting finished, 2026 results archived. Story-So-Far insights.
 * - governance: steady-state between elections. Default tab on /constituency/[id]
 *               is MLA. Home shows Cabinet / Funds / Projects / Assembly / News /
 *               Archive. Election-era surfaces (/live, /results, /compare, /quiz)
 *               stay accessible via the Archive tab.
 */

export type ElectionPhase = 'pre' | 'live' | 'post' | 'governance';

const VALID: Set<string> = new Set(['pre', 'live', 'post', 'governance']);

function normalise(raw: string | undefined): ElectionPhase {
  if (raw && VALID.has(raw)) return raw as ElectionPhase;
  return 'pre';
}

export function getClientElectionPhase(): ElectionPhase {
  return normalise(process.env.NEXT_PUBLIC_ELECTION_PHASE);
}

export function getServerElectionPhase(): ElectionPhase {
  return normalise(process.env.ELECTION_PHASE ?? process.env.NEXT_PUBLIC_ELECTION_PHASE);
}

export function isLive(phase: ElectionPhase): boolean {
  return phase === 'live';
}

export function isPost(phase: ElectionPhase): boolean {
  return phase === 'post';
}

export function isGovernance(phase: ElectionPhase): boolean {
  return phase === 'governance';
}

/** True while an election cycle is active (pre/live/post). False during governance. */
export function isElectionActive(phase: ElectionPhase): boolean {
  return phase !== 'governance';
}

export function getDefaultConstituencyTab(phase: ElectionPhase): 'overview' | 'candidates' | 'mla' | 'live' {
  if (phase === 'governance') return 'mla';
  if (phase === 'post') return 'mla';
  if (phase === 'live') return 'live';
  return 'overview';
}

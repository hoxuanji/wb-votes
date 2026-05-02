/**
 * election-phase.ts — Single source of truth for "where are we in the cycle".
 *
 * Reads NEXT_PUBLIC_ELECTION_PHASE (for client-visible decisions like default
 * tab / map mode) and ELECTION_PHASE (for server/scraper decisions).
 *
 * Valid values: 'pre' | 'live' | 'post' (default 'pre').
 *
 * - pre:   polling underway or in the future. Show candidates. Live tab hidden.
 * - live:  counting day — results being published. Live tab + /live enabled.
 * - post:  counting finished, 2026 results archived. Dashboard defaults to MLA.
 */

export type ElectionPhase = 'pre' | 'live' | 'post';

const VALID: Set<string> = new Set(['pre', 'live', 'post']);

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

export function getDefaultConstituencyTab(phase: ElectionPhase): 'overview' | 'candidates' | 'mla' | 'live' {
  if (phase === 'post') return 'mla';
  if (phase === 'live') return 'live';
  return 'overview';
}

import { NextResponse } from 'next/server';
import { open } from '../../../../../packages/mandate/src/db/open.ts';
import { recordDecision } from '../../../../../packages/mandate/src/repo/review.ts';
import type { Decision } from '../../../../../packages/mandate/src/repo/review.ts';

/**
 * POST target for the merge review form.
 *
 * A separate path from the page because a route handler and a page cannot share one route. The reply
 * is a 303 back to the queue, so a reload re-GETs the next pair instead of re-POSTing the last
 * decision — and `recordDecision` only updates rows still in `pending`, so a replayed POST changes
 * nothing rather than overwriting a considered judgement with a stale one.
 *
 * There is no auth in this app, so attribution is nominal: decisions are recorded as
 * `user:<?as= or local>`. That is honest rather than useful, and it is enough for the measurement,
 * which needs the decision and not the decider. A real reviewer identity has to arrive with real
 * accounts.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID: ReadonlySet<string> = new Set<Decision>(['merged', 'rejected', 'deferred']);

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const a = String(form.get('a') ?? '');
  const b = String(form.get('b') ?? '');
  const decision = String(form.get('decision') ?? '');
  const reviewer = new URL(request.url).searchParams.get('as') ?? 'local';

  const back = new URL('/review/merges', request.url);
  if (a === '' || b === '' || !VALID.has(decision)) {
    // A malformed post is a bug in the form, not something to write to the registry.
    back.searchParams.set('error', 'malformed');
    return NextResponse.redirect(back, 303);
  }

  try {
    const db = open();
    const wrote = recordDecision(db, a, b, decision as Decision, reviewer, new Date().toISOString());
    db.close();
    // `wrote` is false when the pair was already decided — two tabs, or a replay. Not an error, and
    // not something to silently claim as saved either.
    back.searchParams.set(wrote ? 'saved' : 'already', decision);
  } catch {
    back.searchParams.set('error', 'unavailable');
  }
  return NextResponse.redirect(back, 303);
}

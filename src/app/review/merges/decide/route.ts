import { NextResponse } from 'next/server';
import { DECISIONS, recordDecision, reviewWritesEnabled } from '../../../../../packages/mandate/src/repo/review.ts';
import type { Decision } from '../../../../../packages/mandate/src/repo/review.ts';
import { writeRegistry } from '../../../../../packages/mandate/src/repo/session.ts';

/**
 * POST target for the merge review form.
 *
 * A separate path from the page because a route handler and a page cannot share one route. The reply
 * is a 303 back to the queue, so a reload re-GETs the next pair instead of re-POSTing the last
 * decision — and `recordDecision` only updates rows still in `pending`, so a replayed POST changes
 * nothing rather than overwriting a considered judgement with a stale one.
 *
 * There is no auth in this app, so the route records a decision only where MANDATE_REVIEW_WRITES=1 is set: an
 * opt-in for a maintainer's own checkout. It is its own variable and not NODE_ENV, so a local `next start` has to
 * be asked too and nothing in production turns it on by accident (fly.toml does not set it). Without it the
 * answer is a 403, before the form is read or the registry opened. With it, attribution is nominal: decisions are
 * recorded as `user:<?as= or local>`. That is honest rather than useful, and it is enough for the measurement,
 * which needs the decision and not the decider. A real reviewer identity has to arrive with real accounts.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID: ReadonlySet<string> = new Set(DECISIONS);

export async function POST(request: Request): Promise<Response> {
  // First, so that a deployment without the switch answers the same way whatever the request holds, and never
  // reads the form or opens the registry to do it.
  if (!reviewWritesEnabled(process.env)) {
    return new Response('Merge decisions are recorded only on a local checkout with MANDATE_REVIEW_WRITES=1.\n', {
      status: 403,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

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

  // The registry is closed on every way out. An outage (absent, unmigrated, read-only, busy) is the redirect
  // that says nothing was recorded; a defect in the write is thrown, where it used to be caught here and
  // reported as the same outage.
  const outcome = writeRegistry((db) =>
    recordDecision(db, a, b, decision as Decision, reviewer, new Date().toISOString()),
  );
  if (outcome.ok) {
    // `outcome.value` is false when the pair was already decided — two tabs, or a replay. Not an error, and
    // not something to silently claim as saved either.
    back.searchParams.set(outcome.value ? 'saved' : 'already', decision);
  } else {
    back.searchParams.set('error', 'unavailable');
  }
  return NextResponse.redirect(back, 303);
}

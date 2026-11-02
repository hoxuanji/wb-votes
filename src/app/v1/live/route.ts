import { readLiveFeed } from '../../../../packages/mandate/src/repo/live-feed.ts';
import { liveReply } from '../../../../packages/mandate/src/repo/live-reply.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The live board's poll: `GET /v1/live`.
 *
 * Answers with `{ boards, sentences, fills }` for the elections in the feed that are not yet declared: the same function of the same file the front page
 * renders from (repo/live-reply.ts), so the first render and every poll after it cannot disagree. Never cached: a live count served from a cache is a stale
 * count served as live.
 *
 *   curl -s http://localhost:3000/v1/live | jq '.boards[].seats'
 *
 * Without a feed (`MANDATE_LIVE_PATH` unset, or the file absent, or nothing live in it) this is a 404 problem document, and the page shows no live element at
 * all; an unusable feed is a 503 whose `detail` says why. A projection in the answer is another organisation's, with its publisher, and the registry has
 * produced no forecast of its own.
 */
const problem = (status: number, code: string, title: string, detail: string): Response =>
  new Response(JSON.stringify({ type: 'about:blank', title, status, detail, code }), {
    status,
    headers: { 'Content-Type': 'application/problem+json', 'Cache-Control': 'no-store' },
  });

export async function GET() {
  const r = liveReply(readLiveFeed(process.env['MANDATE_LIVE_PATH'], new Date()));
  if (r.state === 'none') return problem(404, 'live-feed-none', 'Nothing is live', 'No live feed is configured, or no election in it is still being counted.');
  if (r.state === 'error') return problem(503, 'live-feed-invalid', 'The live feed cannot be used', r.error);
  return new Response(JSON.stringify({ boards: r.boards, sentences: r.sentences, fills: r.fills }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

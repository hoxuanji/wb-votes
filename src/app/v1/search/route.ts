import { searchLimit, searchReply, toResponse } from '../../../../packages/mandate/src/repo/envelope.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * §20 search — transliteration-aware person search over canonical names and aliases, so
 * "মমতা", "Mamata" and "Mamta" reach the same rows.
 *
 * Usage:
 *   curl -s 'http://localhost:3000/v1/search?q=Mamata&limit=5' | jq '.data.results[].canonicalName'
 *   curl -s --get --data-urlencode 'q=মমতা' http://localhost:3000/v1/search | jq '.data.count'
 *
 * `data.results` are the people whose recorded names contain the query and `data.count` is how many. `data.soundsLike`
 * are people who only share a phonetic key with it, each marked `match: "sounds-like"`: suggestions to check, never
 * matches. `limit` bounds both together, the matches first, and is clamped to 1..50; it is 20 where it is absent or
 * blank. A query matching nothing is a 404 with a problem document, so a 200 always carries a non-empty `sources`
 * array.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const r = await searchReply(url.searchParams.get('q') ?? '', searchLimit(url.searchParams.get('limit')));
  return toResponse(r);
}

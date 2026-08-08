import { permanentRedirect, redirect } from 'next/navigation';
import { openRead } from '../../../../packages/mandate/src/db/open.ts';
import { placePathForLegacyId } from '../../../../packages/mandate/src/repo/legacy.ts';

/**
 * `/constituency/c0001` -> `/pl/wb/cooch-behar/mekliganj`.
 *
 * The old page is superseded, not deleted: the Place Brief answers the same question with a cited
 * turnout, a margin, and four elections of history behind it. The previous 287-line version is in
 * git at e6d928f if any of it turns out to be missed.
 *
 * A 308 rather than a 307 because this move is permanent and should be followed by search engines.
 * An unresolvable id lands on the state page rather than a 404: a reader arriving from a stale link
 * is better served by the list of every seat than by a dead end.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function LegacyConstituency({ params }: { params: { id: string } }) {
  let path: string | null = null;
  try {
    path = placePathForLegacyId(openRead(), params.id);
  } catch {
    // Registry unavailable. Still redirect — to the one destination that does not need it.
    redirect('/pl/wb');
  }
  permanentRedirect(path ?? '/pl/wb');
}

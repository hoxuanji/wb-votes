import { notFound, permanentRedirect } from 'next/navigation';
import { openRead } from '../../../../packages/mandate/src/db/open.ts';
import { placePathForLegacyId } from '../../../../packages/mandate/src/repo/legacy.ts';

/**
 * `/constituency/c0001` -> `/constituency/wb/mekliganj`.
 *
 * ONE SEGMENT UNDER `/constituency` IS ALWAYS A LEGACY ID. The canonical form is
 * `/constituency/<state>/<name>`, so a single segment cannot be a constituency — it is either an id from the
 * previous product or nothing. The param is named `state` because Next requires one slug name per position
 * and the two-segment route beside it owns that name; what arrives here is an old candidate/seat id.
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

export default function LegacyConstituency({ params }: { params: { state: string } }) {
  let path: string | null = null;
  try {
    path = placePathForLegacyId(openRead(), params.state);
  } catch {
    // Registry unavailable, so nothing can be resolved. A 404 rather than a guess: this used to redirect to
    // West Bengal, which is a state-specific default sitting in the routing layer.
    notFound();
  }
  if (path === null) notFound();
  permanentRedirect(path);
}

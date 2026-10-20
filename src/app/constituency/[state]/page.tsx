import { follow } from '../../_place/follow.tsx';
import { legacyTarget } from '../../../../packages/mandate/src/repo/legacy.ts';

/**
 * `/constituency/c0001` -> `/constituency/wb/assembly/mekliganj`.
 *
 * ONE SEGMENT UNDER `/constituency` IS ALWAYS A LEGACY ID. The canonical form is
 * `/constituency/<state>/<body>/<name>`, so a single segment cannot be a constituency — it is either an id from the
 * previous product or nothing. The param is named `state` because Next requires one slug name per position
 * and the two-segment route beside it owns that name; what arrives here is an old candidate/seat id.
 *
 * The id names a West Bengal assembly seat and no other: the previous product held nothing else, so `c0001` is
 * never a Karnataka seat or a Lok Sabha seat that happens to be numbered 1.
 *
 * The old page is superseded, not deleted: the Place Brief answers the same question with a cited
 * turnout, a margin, and four elections of history behind it. The previous 287-line version is in
 * git at e6d928f if any of it turns out to be missed.
 *
 * A 308 rather than a 307 because this move is permanent and should be followed by search engines.
 * An unresolvable id is a 404, and not the state page: a reader arriving from a stale link did not ask for a
 * state, and a registry that cannot be read is thrown, because a crawler keeps a 404.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function LegacyConstituency({ params }: { params: { state: string } }) {
  return follow(legacyTarget({ route: 'constituency-id', id: params.state }));
}

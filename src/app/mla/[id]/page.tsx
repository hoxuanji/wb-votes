import { follow } from '../../_place/follow.tsx';
import { legacyTarget } from '../../../../packages/mandate/src/repo/legacy.ts';

/**
 * `/mla/c0001` -> the sitting member's Person Brief.
 *
 * The old route keyed an MLA profile by *constituency*, not by person, so the equivalent question is
 * "who won here most recently". That resolves through the result table rather than through a
 * current-MLA list, which means it stays correct after a by-poll without anyone maintaining a second
 * table. The id names a West Bengal assembly seat and no other: the previous product held nothing else.
 *
 * A seat whose winner is unrecorded is a 404, like an id that names no seat. A registry that cannot be read
 * is thrown, not a 404: a crawler keeps a 404 and drops the redirect for good, and an outage is a state of the
 * deployment rather than a verdict on the id.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function LegacyMLA({ params }: { params: { id: string } }) {
  return follow(legacyTarget({ route: 'mla', id: params.id }));
}

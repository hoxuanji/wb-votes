import { notFound, permanentRedirect } from 'next/navigation';
import { sittingMemberForLegacyId } from '../../../../packages/mandate/src/repo/legacy.ts';
import { personHref } from '../../../../packages/mandate/src/repo/routes.ts';
import { readRegistry } from '../../../../packages/mandate/src/repo/session.ts';

/**
 * `/mla/c0001` -> the sitting member's Person Brief.
 *
 * The old route keyed an MLA profile by *constituency*, not by person, so the equivalent question is
 * "who won here most recently". That resolves through the result table rather than through a
 * current-MLA list, which means it stays correct after a by-poll without anyone maintaining a second
 * table.
 *
 * A seat whose winner is unrecorded redirects to the place instead, because the seat is still a real
 * page even when the person is not resolvable.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function LegacyMLA({ params }: { params: { id: string } }) {
  const read = readRegistry((db) => sittingMemberForLegacyId(db, params.id));
  // A registry that cannot be read is thrown, not a 404: a crawler keeps a 404 and drops the redirect for
  // good, and an outage is a state of the deployment rather than a verdict on the id.
  if (!read.ok) throw read.cause;
  // A 404 rather than West Bengal. A state-specific fallback in the routing layer is a state-specific
  // routing rule, and an unresolvable legacy id is not a request for a particular state.
  if (read.value === null) notFound();
  permanentRedirect(personHref(read.value));
}

import { notFound, permanentRedirect } from 'next/navigation';
import { openRead } from '../../../../packages/mandate/src/db/open.ts';
import { sittingMemberForLegacyId } from '../../../../packages/mandate/src/repo/legacy.ts';
import { personHref } from '../../../../packages/mandate/src/repo/routes.ts';

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
  let person: string | null = null;
  try {
    person = sittingMemberForLegacyId(openRead(), params.id);
  } catch {
    // A 404 rather than West Bengal. A state-specific fallback in the routing layer is a state-specific
    // routing rule, and an unresolvable legacy id is not a request for a particular state.
    notFound();
  }
  if (person === null) notFound();
  permanentRedirect(personHref(person));
}

import { permanentRedirect, redirect } from 'next/navigation';
import { openRead } from '../../../../packages/mandate/src/db/open.ts';
import { personForMynetaId } from '../../../../packages/mandate/src/repo/legacy.ts';

/**
 * `/candidate/wb26_52` -> `/p/hiten-barman-ca794e`.
 *
 * The id the old app used as a primary key is stored in `person_identifier` for all 2,920
 * candidates, so every one of these links resolves. It also survives entity resolution: merging two
 * records rewrites the identifier's person_id, so an old link follows the person into whichever
 * record absorbed them rather than breaking.
 *
 * An id that is not in the registry goes to search rather than 404 — the name in the reader's head
 * is the thing they can still act on.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function LegacyCandidate({ params }: { params: { id: string } }) {
  let person: string | null = null;
  try {
    person = personForMynetaId(openRead(), params.id);
  } catch {
    redirect('/search');
  }
  if (person === null) redirect('/search');
  permanentRedirect(`/p/${person}`);
}

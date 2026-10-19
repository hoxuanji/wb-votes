import { permanentRedirect, redirect } from 'next/navigation';
import { personForMynetaId } from '../../../../packages/mandate/src/repo/legacy.ts';
import { personHref } from '../../../../packages/mandate/src/repo/routes.ts';
import { readRegistry } from '../../../../packages/mandate/src/repo/session.ts';

/**
 * `/candidate/wb26_52` -> `/p/hiten-barman-ca794e`.
 *
 * The id the old app used as a primary key is stored in `person_identifier` for all 2,920
 * candidates, so every one of these links resolves. It also survives entity resolution: merging two
 * records rewrites the identifier's person_id, so an old link follows the person into whichever
 * record absorbed them rather than breaking.
 *
 * An id that is not in the registry goes to search rather than 404 — the name in the reader's head
 * is the thing they can still act on. A registry that cannot be read is not that answer: it is thrown, so a
 * crawler retries the link instead of learning that every candidate id leads to the search page.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function LegacyCandidate({ params }: { params: { id: string } }) {
  const read = readRegistry((db) => personForMynetaId(db, params.id));
  if (!read.ok) throw read.cause;
  if (read.value === null) redirect('/search');
  permanentRedirect(personHref(read.value));
}

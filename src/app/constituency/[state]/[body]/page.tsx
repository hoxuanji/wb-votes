import { follow } from '../../../_place/follow.tsx';
import { legacyTarget } from '../../../../../packages/mandate/src/repo/legacy.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `/constituency/<state>/<name>` — THE PRE-BODY URL, and it does not guess.
 *
 * This was the canonical form until the registry showed it cannot identify a seat: a name is unique within a
 * state but not across BODIES. So an old link may mean two real, different offices, and there is no correct
 * single destination for it.
 *
 * ONE MATCH  -> permanent redirect, because there is nothing to choose between.
 * MANY       -> ASK. Every seat that answers to the name is offered by name and body, and the reader picks.
 *               Answering with any of them would be the silent substitution the whole route architecture exists
 *               to prevent — and for an assembly seat and a Lok Sabha seat of one name it would be wrong half
 *               the time by construction.
 * NONE       -> 404. Never the state page: a reader who asked for a constituency did not ask for a state.
 *               A registry that cannot be read is not NONE: `legacyTarget` throws, because a 404 is cached.
 *
 * The name is read as the registry spells it and in no looser way: no id, no number, no marker stripped, no words
 * joined. This URL is where old links live, and it has only ever answered to a name.
 *
 * The second segment is named `body` because Next allows one slug name per path position and the canonical
 * three-segment route beside it owns that name. What arrives here is a constituency name.
 */
export default function ConstituencyDisambiguation({
  params,
}: {
  params: { state: string; body: string };
}) {
  return follow(legacyTarget({ route: 'constituency-name', state: params.state, body: params.body }));
}

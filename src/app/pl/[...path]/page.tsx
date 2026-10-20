import { follow } from '../../_place/follow.tsx';
import { legacyTarget } from '../../../../packages/mandate/src/repo/legacy.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `/pl/*` — COMPATIBILITY ONLY. It renders nothing, unless the path names more than one seat.
 *
 * This route used to BE the product's geography surface, and it decided whether a path meant a state, a
 * district or a constituency by counting its segments. That is why it is gone: the type of a thing was a
 * property of how long its URL happened to be, so a malformed path resolved to a different KIND of entity
 * instead of to nothing.
 *
 * Every old link still works, and answers with a permanent redirect to the canonical route. THE ENTITY IS
 * RESOLVED FIRST — by the place resolver, which `legacyTarget` asks — and the canonical URL is the one that
 * came back with it, never one built from the shape of the incoming path. A path that resolves to nothing is a
 * 404 rather than a redirect up the tree, because sending a reader who asked for a constituency to a state page
 * is the silent substitution this phase exists to end. A path that names several seats is not guessed at
 * either: the reader is asked which. A registry that cannot be read resolves nothing for a different reason, and
 * is thrown instead.
 *
 * The `?...` query survives the redirect: `?election=`, `?district=`, `?party=`, `?mode=` and `?seat=` mean
 * the same thing on the canonical state route as they did here.
 */
export default function LegacyPlace({
  params,
  searchParams,
}: {
  params: { path?: string[] };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  return follow(legacyTarget({ route: 'pl-path', path: params.path ?? [], search: searchParams ?? {} }));
}

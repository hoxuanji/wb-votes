import { notFound, permanentRedirect } from 'next/navigation';
import { Choose } from '../../_place/choose.tsx';
import { RegistryUnavailableError } from '../../../../packages/mandate/src/repo/index.ts';
import { pathQuery, placeView } from '../../../../packages/mandate/src/repo/place-page.ts';
import { districtHref, stateHref } from '../../../../packages/mandate/src/repo/routes.ts';

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
 * RESOLVED FIRST — through the same `placeView` the surfaces use — and the canonical URL is built from what
 * came back, never from the shape of the incoming path. A path that resolves to nothing is a 404 rather than
 * a redirect up the tree, because sending a reader who asked for a constituency to a state page is the
 * silent substitution this phase exists to end. A path that names several seats is not guessed at either: the
 * reader is asked which. A registry that cannot be read resolves nothing for a different reason, and is thrown
 * instead.
 *
 * The `?...` query survives the redirect: `?election=`, `?district=`, `?party=`, `?mode=` and `?seat=` mean
 * the same thing on the canonical state route as they did here.
 */
export default async function LegacyPlace({
  params,
  searchParams,
}: {
  params: { path?: string[] };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const all = params.path ?? [];
  // `/pl/<state>/<district>/<seat>/analysis` kept its lens in the trailing segment. Preserve it.
  const lens = all.at(-1) === 'analysis' ? 'analysis' : null;
  const segments = lens === null ? all : all.slice(0, -1);

  const place = pathQuery(segments);
  if (place === null) notFound();
  const view = await placeView(place, searchParams ?? {});
  // A registry that cannot answer must not produce a redirect to a guess, and it is not a 404 either: a crawler
  // keeps a 404 and drops the redirect for good. It is thrown, which a crawler retries.
  if (view.kind === 'unavailable') throw new RegistryUnavailableError();
  if (view.kind === 'not-found') notFound();
  if (view.kind === 'many') return <Choose places={view.places} />;

  /**
   * The canonical destination, from what the REGISTRY returned.
   *
   * `view.level` is the resolved kind, not a segment count — `placeView` looked the place up and told us
   * what it is. The ids come from the path only AFTER that resolution succeeded, which is the difference
   * between reading a validated identifier and guessing from a string: an unresolvable path never reaches
   * this line, it 404s above.
   *
   * A seat's jurisdiction is the first component of its place id (`ka.ac.150`), which is a property of the
   * id rather than of the URL it arrived on.
   */
  const to =
    view.kind === 'ac'
      ? // THE RESOLVED ENTITY, body included. The address is the one the resolver gave the seat it found, so an old
        // assembly path redirects to an assembly URL and an old parliamentary one to a Lok Sabha URL — neither is
        // inferred from the path, which could not have carried the body anyway — and a seat whose name another
        // seat shares goes to its own registry id rather than to the page asking which. `base` is that address
        // with the Analysis floor's segment on, and the lens is added back below.
        view.base.replace(/\/analysis$/, '')
      : view.level === 'district'
        ? districtHref(`${segments[0] ?? ''}.${segments[1] ?? ''}`)
        : stateHref(segments[0] ?? '');

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams ?? {})) {
    if (typeof v === 'string') qs.set(k, v);
    else if (Array.isArray(v) && v[0] !== undefined) qs.set(k, v[0]);
  }
  const query = qs.toString();
  permanentRedirect(`${to}${lens === null ? '' : '/analysis'}${query === '' ? '' : `?${query}`}`);
}

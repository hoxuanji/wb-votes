import type { Metadata } from 'next';
import { resolveRequest } from '../../../packages/mandate/src/repo/place-view.ts';
import { placeIndex } from '../../../packages/mandate/src/repo/place-resolve.ts';
import type { PlaceQuery } from '../../../packages/mandate/src/repo/place-resolve.ts';
import { readRegistry } from '../../../packages/mandate/src/repo/session.ts';

/**
 * THE DOCUMENT TITLE AND THE ONE ADDRESS of a state or a district, from the resolution the page itself makes.
 *
 * Without it every one of these pages was "India Election Intelligence" in a tab, a bookmark and a screen reader's announcement
 * of the page, and `/state/WB` was a second address of `/state/wb` with nothing to say which is the page. The canonical is the
 * entity's own href (`Place.href`, built by routes.ts), never the path that asked. It is relative, because the site has no origin
 * of its own to make it absolute with; a canonical may be.
 *
 * A place the registry does not hold, or a registry that cannot be read, gets no metadata: the page answers those with a 404 or an
 * outage notice, and has no name to put in a title.
 */
export function placeMetadata(query: Extract<PlaceQuery, { level: 'state' | 'district' }>): Metadata {
  const named = readRegistry((db) => {
    const found = resolveRequest(db, query);
    if (found.found !== 'one' || found.place.level === 'seat') return null;
    const { place } = found;
    // A district's name alone ("North") does not say where it is.
    const state = place.level === 'district' ? placeIndex(db).states.find((s) => s.id === place.stateId)?.name : undefined;
    return { title: state === undefined ? place.name : `${place.name}, ${state}`, canonical: place.href };
  });
  if (!named.ok || named.value === null) return {};
  return { title: named.value.title, alternates: { canonical: named.value.canonical } };
}

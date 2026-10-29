import type { Metadata } from 'next';
import { placeMetadata } from '../../_place/metadata.ts';
import { PlaceSurface } from '../../_place/surface.tsx';
import { placeTitle } from '../../../../packages/mandate/src/repo/page-title.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function generateMetadata({ params }: { params: { state: string } }): Metadata {
  // The canonical address comes from the resolution (placeMetadata); the title is the shared page-title module's.
  const title = placeTitle({ level: 'state', id: params.state });
  const meta = placeMetadata({ level: 'state', id: params.state });
  return title === undefined ? meta : { ...meta, title };
}

/**
 * A STATE, and the route says so.
 *
 * Thin on purpose: it resolves nothing the shared surface does not already resolve, and it renders the same
 * component `/district` and `/constituency` render. What it adds is that the entity type is now a property
 * of the URL rather than of how many segments the URL happens to have — which is what `/pl/[...path]`
 * decided by counting, so that a malformed path resolved to a different KIND of thing.
 */
export default async function StatePage({
  params,
  searchParams,
}: {
  params: { state: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  // AWAITED, not nested as JSX. `PlaceSurface` is an async component, and a legacy synchronous renderer
  // (the visual-QA harness uses one) cannot resolve a Promise it is handed as a child.
  return await PlaceSurface({ place: { level: 'state', id: params.state }, searchParams });
}

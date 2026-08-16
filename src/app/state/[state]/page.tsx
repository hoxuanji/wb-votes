import { PlaceSurface } from '../../_place/surface.tsx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A STATE, and the route says so.
 *
 * Thin on purpose: it resolves nothing the shared surface does not already resolve, and it renders the same
 * component `/district` and `/constituency` render. What it adds is that the entity type is now a property
 * of the URL rather than of how many segments the URL happens to have — which is what `/pl/[...path]` and
 * `parsePath` decided by counting, so that a malformed path resolved to a different KIND of thing.
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
  return await PlaceSurface({ segments: [params.state], searchParams });
}

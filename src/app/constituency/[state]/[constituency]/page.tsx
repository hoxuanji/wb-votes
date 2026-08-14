import { notFound } from 'next/navigation';
import { PlaceSurface } from '../../../_place/surface.tsx';
import { constituencyPath } from '../../../../../packages/mandate/src/repo/place-page.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A CONSTITUENCY, assembly or parliamentary, carrying its state.
 *
 * NO DISTRICT IN THE PATH, and that is the change from `/pl/<state>/<district>/<seat>`. A seat's district is
 * a grouping a delimitation can reassign while the seat keeps its name, so a shared link with the district
 * baked in rots at the next redraw. The state is the stable ancestor and is all a name needs to be
 * unambiguous.
 *
 * RESOLVE, THEN RENDER — never guess. `constituencyPath` asks the registry which district this seat sits in
 * and returns null if the name is not a constituency of this jurisdiction at all. A miss is a 404 and never
 * a fall back to the state page, because answering a constituency request with a different entity is exactly
 * the silent substitution this phase removes.
 */
export default async function ConstituencyPage({
  params,
  searchParams,
}: {
  params: { state: string; constituency: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const segments = await constituencyPath(params.state, params.constituency);
  if (segments === null) notFound();
  // AWAITED, not nested as JSX. `PlaceSurface` is an async component, and a legacy synchronous renderer
  // (the visual-QA harness uses one) cannot resolve a Promise it is handed as a child.
  return await PlaceSurface({ segments, searchParams });
}

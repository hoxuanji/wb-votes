import { PlaceSurface } from '../../../_place/surface.tsx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A DISTRICT, carrying its state.
 *
 * Two segments inside an explicitly-typed route — the depth is fixed and known here, so nothing is inferred
 * from it. The state is in the path because a district id is `<state>.<district>` and the URL should read as
 * the hierarchy the id already encodes.
 */
export default async function DistrictPage({
  params,
  searchParams,
}: {
  params: { state: string; district: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  // AWAITED, not nested as JSX. `PlaceSurface` is an async component, and a legacy synchronous renderer
  // (the visual-QA harness uses one) cannot resolve a Promise it is handed as a child.
  return await PlaceSurface({ segments: [params.state, params.district], searchParams });
}

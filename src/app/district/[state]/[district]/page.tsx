import type { Metadata } from 'next';
import { placeMetadata } from '../../../_place/metadata.ts';
import { PlaceSurface } from '../../../_place/surface.tsx';
import { placeTitle } from '../../../../../packages/mandate/src/repo/page-title.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function generateMetadata({ params }: { params: { state: string; district: string } }): Metadata {
  // The canonical address comes from the resolution (placeMetadata); the title is the shared page-title module's.
  const title = placeTitle({ level: 'district', state: params.state, district: params.district });
  const meta = placeMetadata({ level: 'district', state: params.state, district: params.district });
  return title === undefined ? meta : { ...meta, title };
}

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
  return await PlaceSurface({ place: { level: 'district', state: params.state, district: params.district }, searchParams });
}

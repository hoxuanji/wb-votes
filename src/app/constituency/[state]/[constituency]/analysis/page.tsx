import { notFound } from 'next/navigation';
import { PlaceSurface } from '../../../../_place/surface.tsx';
import { constituencyPath } from '../../../../../../packages/mandate/src/repo/place-page.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The Analysis floor of one constituency: `/constituency/ka/jayanagar/analysis`.
 *
 * A REAL ROUTE NOW. Under the catch-all this lens lived in a trailing path segment, because Next refuses a
 * static segment after a catch-all — so `/pl/<state>/<district>/<seat>/analysis` was four segments the
 * surface had to take apart itself. With the entity type in the prefix the lens is just a child route, which
 * is what it always was.
 */
export default async function ConstituencyAnalysis({
  params,
  searchParams,
}: {
  params: { state: string; constituency: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const segments = await constituencyPath(params.state, params.constituency);
  if (segments === null) notFound();
  return await PlaceSurface({ segments: [...segments, 'analysis'], searchParams, level: 'constituency' });
}

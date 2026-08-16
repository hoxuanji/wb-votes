import { notFound } from 'next/navigation';
import { PlaceSurface } from '../../../../_place/surface.tsx';
import { asBody, kindOfBody } from '../../../../../../packages/mandate/src/repo/routes.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A CONSTITUENCY, identified by jurisdiction + BODY + name.
 *
 * The body is in the path because a name does not identify a seat. Saharanpur is `up.ac.004` AND `up.pc.001`
 * in the same delimitation, and 335 of 606 parliamentary seats — 55% — collide with an assembly seat of the
 * same name in the same state. Without the body the resolver answered with whichever version sorted first, so
 * more than half of India's Lok Sabha seats had a canonical URL that returned a different office.
 *
 * `asBody` accepts `assembly` and `lok-sabha` and NOTHING else. Not `ac`, not `pc`, not `ls`, not `parliament`
 * — a near-miss is a 404, because normalising one would be the resolver guessing again.
 *
 * ONE RENDERER. The body reaches `PlaceSurface` as the registry kind it maps to, and the surface reads it as
 * data. There is no assembly page and no parliamentary page.
 */
export default async function ConstituencyPage({
  params,
  searchParams,
}: {
  params: { state: string; body: string; name: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const body = asBody(params.body);
  if (body === null) notFound();
  return await PlaceSurface({
    segments: [params.state, params.name],
    searchParams,
    level: 'constituency',
    kind: kindOfBody(body),
  });
}

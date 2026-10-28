import { notFound } from 'next/navigation';
import { PlaceSurface } from '../../../../../_place/surface.tsx';
import { placeTitle } from '../../../../../../../packages/mandate/src/repo/page-title.ts';
import { asBody } from '../../../../../../../packages/mandate/src/repo/routes.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function generateMetadata({ params }: { params: { state: string; body: string; name: string } }) {
  const body = asBody(params.body);
  return {
    title:
      body === null
        ? undefined
        : placeTitle({ level: 'seat', state: params.state, body, name: params.name }, { analysis: true }),
  };
}

/** The Analysis floor of one constituency, of either body. */
export default async function ConstituencyAnalysis({
  params,
  searchParams,
}: {
  params: { state: string; body: string; name: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const body = asBody(params.body);
  if (body === null) notFound();
  return await PlaceSurface({
    place: { level: 'seat', state: params.state, body, name: params.name },
    lens: 'analysis',
    searchParams,
  });
}

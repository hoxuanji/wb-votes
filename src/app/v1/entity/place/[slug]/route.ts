import { placeReply, toResponse } from '../../../../../../packages/mandate/src/repo/envelope.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * §20 entity endpoint — one constituency, assembly or parliamentary: contest history newest-first, sitting member,
 * demographics with their census vintage, and every source behind them.
 *
 * Usage:
 *   curl -s http://localhost:3000/v1/entity/place/wb.ac.001 | jq '.meta.caveats'
 *   curl -s http://localhost:3000/v1/entity/place/wb.pc.37 | jq '.data.sittingMember'
 *   curl -s http://localhost:3000/v1/entity/place/Mekliganj | jq '.data.place'
 *
 * `slug` is the place id ('wb.ac.001', 'wb.pc.37') or the constituency name, case-insensitive. Only the seat that carries
 * a name now answers to it, and a name that more than one seat answers to, an assembly seat and a parliamentary one
 * included ('Bishnupur'), is a 300 that lists their place ids, never a pick.
 */
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const r = await placeReply(params.slug);
  return toResponse(r);
}

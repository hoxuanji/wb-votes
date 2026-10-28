import { NextResponse } from 'next/server';
import { unknownEndpointReply } from '../../../../packages/mandate/src/repo/envelope.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Any path under /v1 that is not one of the three endpoints, in any method. Without this the framework answers with its
 * HTML 404 page, which a JSON client cannot read; Next matches the endpoints first, so this is only what is left.
 */
function unknown(req: Request) {
  const r = unknownEndpointReply(new URL(req.url).pathname);
  return NextResponse.json(r.body, { status: r.status, headers: r.headers });
}

export const GET = unknown;
export const POST = unknown;
export const PUT = unknown;
export const PATCH = unknown;
export const DELETE = unknown;
export const OPTIONS = unknown;

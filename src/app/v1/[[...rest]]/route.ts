import { toResponse, unknownEndpointReply } from '../../../../packages/mandate/src/repo/envelope.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Any path under /v1 that is not one of the three endpoints, in any method. Without this the framework answers with its
 * HTML 404 page, which a JSON client cannot read; Next matches the endpoints first, so this is only what is left. It answers
 * through `toResponse` like the endpoints, so the problem document carries its own media type (application/problem+json).
 */
function unknown(req: Request) {
  const r = unknownEndpointReply(new URL(req.url).pathname);
  return toResponse(r);
}

export const GET = unknown;
export const POST = unknown;
export const PUT = unknown;
export const PATCH = unknown;
export const DELETE = unknown;
export const OPTIONS = unknown;

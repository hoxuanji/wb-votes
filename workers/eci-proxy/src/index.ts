/**
 * ECI Akamai-bypass proxy.
 *
 * Forwards any request path to https://results.eci.gov.in<path> using a
 * realistic browser header set, from Cloudflare's egress range (different
 * from Vercel / most residential ISPs that Akamai has blocked).
 *
 * Auth: caller must send `X-Proxy-Secret: $PROXY_SECRET`.
 *
 * Deploy:
 *   cd workers/eci-proxy
 *   npx wrangler secret put PROXY_SECRET   # paste same value used by scraper
 *   npx wrangler deploy
 *
 * Scraper side: set ECI_BASE=https://<worker>.workers.dev/AcResultGenMay2026
 * and ECI_PROXY_SECRET=<value> in Vercel env vars (and locally for
 * scripts/local-scrape.js).
 */

export interface Env {
  PROXY_SECRET: string;
}

const UPSTREAM_ORIGIN = 'https://results.eci.gov.in';

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 ' +
    '(KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return new Response('method not allowed', { status: 405 });
    }

    const secret = req.headers.get('x-proxy-secret');
    if (!env.PROXY_SECRET || secret !== env.PROXY_SECRET) {
      return new Response('unauthorized', { status: 401 });
    }

    const inUrl = new URL(req.url);
    const upstream = new URL(inUrl.pathname + inUrl.search, UPSTREAM_ORIGIN);

    // Short edge cache so concurrent scraper hits for the same AC collapse
    // into one upstream request per ~5s.
    const cache = caches.default;
    const cacheKey = new Request(upstream.toString(), { method: 'GET' });
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const upstreamRes = await fetch(upstream.toString(), {
      headers: BROWSER_HEADERS,
      cf: { cacheTtl: 5, cacheEverything: true },
    });

    const body = await upstreamRes.arrayBuffer();
    const res = new Response(body, {
      status: upstreamRes.status,
      headers: {
        'Content-Type': upstreamRes.headers.get('content-type') ?? 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=5',
      },
    });

    if (upstreamRes.ok) {
      await cache.put(cacheKey, res.clone());
    }
    return res;
  },
};

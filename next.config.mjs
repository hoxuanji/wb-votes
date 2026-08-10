/** @type {import('next').NextConfig} */
const nextConfig = {
  // Verification builds go somewhere else. `next build` and `next dev` both own `.next`, so every time
  // a production build ran to check a route, it replaced the directory a running dev server was using
  // and the dev server started serving stale or broken output — which happened three times and cost
  // real confusion about whether anything had changed. Set MANDATE_DIST to build without touching it.
  distDir: process.env.MANDATE_DIST ?? '.next',

  images: {
    // External image hosts (myneta.info, dicebear) block server-side proxy requests.
    // Pass all images through unoptimized to avoid 500s on /_next/image.
    unoptimized: true,
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      { protocol: 'https', hostname: 'myneta.info' },
      { protocol: 'https', hostname: 'affidavit.eci.gov.in' },
      { protocol: 'https', hostname: 'api.dicebear.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;

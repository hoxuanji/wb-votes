import type { Metadata, Viewport } from 'next';
import './globals.css';

/**
 * The root layout owns html/body and nothing else.
 *
 * Everything that used to be here — Header, Footer, BottomNav, Disclaimer, LanguageProvider,
 * Analytics — is now in src/app/(legacy)/layout.tsx and applies only to the WB Votes routes.
 * Nested layouts compose, so while that chrome sat at the root it wrapped every MANDATE surface
 * too, which is why /pl and /p looked like the old app with new content inside them.
 *
 * globals.css stays at the root because it carries Tailwind's preflight, which the legacy
 * components' utility classes need; the MANDATE tokens are scoped to `.mandate` and override it.
 *
 * ponytail: no shell component here. A shell that must render on both a Situation Room and a
 * legacy quiz page is two shells wearing one name.
 */

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'dark',
};

export const metadata: Metadata = {
  title: {
    default: 'India Election Intelligence',
    template: '%s · India Election Intelligence',
  },
  description:
    'A canonical registry of Indian politicians, parties and places, with every figure carrying the source it came from.',
  openGraph: {
    title: 'India Election Intelligence',
    description:
      'Every figure carries its source. 6,167 people, 294 seats, four elections, and an honest account of what has not been verified.',
    type: 'website',
    locale: 'en_IN',
    siteName: 'India Election Intelligence',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      {/* The canvas lives here rather than in a stylesheet: body used to carry Tailwind's
          bg-slate-950, that class went down to (legacy), and a body with no background flashes
          white on both trees. Two tokens are not worth a third stylesheet. */}
      <body style={{ background: '#0c0a11', color: '#f2f0f7', margin: 0 }}>{children}</body>
    </html>
  );
}

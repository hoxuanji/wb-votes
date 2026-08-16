import type { Metadata, Viewport } from 'next';

/**
 * The root layout owns html, body and the canvas colour, and nothing else.
 *
 * There is no globals.css any more, and no Tailwind. Both existed for the West Bengal dashboard, which
 * this phase deleted. What they contributed to the surfaces that remain was a global
 * `*:focus-visible { outline: 2px solid #3b82f6 }` competing with iei.css's own focus treatment, a
 * `main { animation: fadeIn }` that faded the map in on every navigation, and a light-grey scrollbar
 * thumb on a near-black page. The four rules worth keeping — smooth anchor scrolling, a stable
 * scrollbar gutter, and iOS's two text-size behaviours — moved into iei.css, which is now the only
 * stylesheet the product has.
 *
 * The Noto Sans Bengali <link> went with them. It was loaded on every route for a `.font-bengali`
 * class in globals.css, and the registry holds no Bengali name strings at all: the source's nameBn
 * field is empty for every candidate. A webfont fetched on every page load to render text that does
 * not exist is the clearest case of paying for something no reader receives.
 *
 * ponytail: still no shell component here. Shell is mounted by the pages, because /review/merges is an
 * internal resolution queue and must not wear the product's chrome.
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
    'A canonical registry of Indian elections, in which every figure carries the source it came from, how it was derived, and what is missing.',
  openGraph: {
    title: 'India Election Intelligence',
    description:
      'Every figure carries its source. Assembly and Lok Sabha elections across 36 states and union territories, and a counted account of what is not loaded.',
    type: 'website',
    locale: 'en_IN',
    siteName: 'India Election Intelligence',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* The canvas is inline rather than in a stylesheet: a body with no background flashes white
          before the route's own CSS arrives, and two declarations are not worth a file. The hex is
          --iei-bg; there is one other copy of it, in iei.css, and no third. */}
      <body style={{ background: '#07070b', color: '#f2f2f7', margin: 0 }}>{children}</body>
    </html>
  );
}

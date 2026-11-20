import type { Metadata, Viewport } from 'next';
import { THEME_INIT } from '../components/iei/theme.ts';

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
 * ponytail: still no shell component here. Shell is mounted by the pages.
 */

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Both: the page follows the system until the reader chooses (ThemeToggle), and iei.css says which half of every token applies.
  colorScheme: 'light dark',
  // The browser's own chrome (the address bar on a phone) takes the page's canvas, --iei-bg, in whichever theme the system is in.
  // iei.test.ts holds these two equal to the stylesheet's light and dark --iei-bg.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#eef0f6' },
    { media: '(prefers-color-scheme: dark)', color: '#07070b' },
  ],
};

export const metadata: Metadata = {
  // The default is the home page's. Every other page gives its own (packages/mandate/src/repo/page-title.ts) and the
  // template adds the product's name after it.
  title: {
    default: 'India Election Intelligence',
    template: '%s · India Election Intelligence',
  },
  description:
    'A canonical registry of Indian elections, in which every figure carries the source it came from, how it was derived, and what is missing.',
  openGraph: {
    title: 'India Election Intelligence',
    description:
      'Every figure carries its source. The assembly and Lok Sabha elections the registry holds, and a counted account of what is not loaded.',
    type: 'website',
    locale: 'en_IN',
    siteName: 'India Election Intelligence',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the script below sets data-theme before React hydrates, so the attribute differs from the server's HTML on purpose.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      {/* The canvas colour is iei.css's (`html { background: var(--iei-bg) }`), which blocks first paint like any stylesheet. */}
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}

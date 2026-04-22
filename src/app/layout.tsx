import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { BottomNav } from '@/components/layout/BottomNav';
import { Disclaimer } from '@/components/layout/Disclaimer';
import { LanguageProvider } from '@/lib/language-context';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: {
    default: 'WB Votes — West Bengal Voter Information',
    template: '%s | WB Votes',
  },
  description:
    'An independent, non-partisan voter information tool for West Bengal Assembly Elections. View candidate profiles, criminal records, assets, and take the policy quiz.',
  keywords: ['West Bengal election', 'candidates', 'voter awareness', 'WB assembly', 'neta affidavit'],
  openGraph: {
    title: 'WB Votes — West Bengal Voter Information',
    description: 'Compare candidates, view affidavits, and discover your policy alignment for West Bengal elections.',
    type: 'website',
    locale: 'en_IN',
    siteName: 'WB Votes',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WB Votes',
    description: 'Voter information tool for West Bengal Assembly Elections.',
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
      <body className="font-sans antialiased bg-gray-50 text-gray-900">
        <LanguageProvider>
          <Disclaimer />
          <Header />
          {/* pb-16 reserves space for the fixed bottom nav on mobile */}
          <main className="min-h-[calc(100vh-56px)] pb-16 md:pb-0">
            {children}
          </main>
          <Footer />
          <BottomNav />
        </LanguageProvider>
      </body>
    </html>
  );
}

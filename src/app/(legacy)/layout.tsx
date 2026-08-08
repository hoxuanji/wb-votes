import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { BottomNav } from '@/components/layout/BottomNav';
import { Disclaimer } from '@/components/layout/Disclaimer';
import { LanguageProvider } from '@/lib/language-context';

/**
 * The WB Votes chrome, verbatim — this is everything the root layout used to render for every
 * route in the app.
 *
 * It moved down here because nested layouts in Next COMPOSE rather than replace: while this lived
 * at the root, every new MANDATE surface rendered inside the old app's Header, Footer and
 * BottomNav, and inherited LanguageProvider's client bundle. The new pages were "0 KB client JS"
 * only as pages; their routes were not.
 *
 * A route group `(legacy)` changes no URL. /quiz is still /quiz. The tools that have no MANDATE
 * equivalent yet — quiz, compare, funds, explore, live, find-rep, cabinet, methodology, assembly,
 * results — keep working exactly as they did, chrome and all.
 *
 * ponytail: this file is a move, not a rewrite. Delete it when the last route above has an
 * equivalent, and the whole group goes with it.
 */

export const metadata: Metadata = {
  title: {
    default: 'WB Votes — West Bengal Voter Information',
    template: '%s | WB Votes',
  },
  description:
    'An independent, non-partisan voter information tool for West Bengal Assembly Elections. View candidate profiles, cases pending (declared), assets, and take the policy quiz.',
};

export default function LegacyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen font-sans antialiased bg-slate-950 text-gray-100">
      <LanguageProvider>
        <Disclaimer />
        <Header />
        {/* pb-16 reserves space for the fixed bottom nav on mobile */}
        <main className="min-h-[calc(100vh-56px)] pb-16 md:pb-0">{children}</main>
        <Footer />
        <BottomNav />
        <Analytics />
      </LanguageProvider>
    </div>
  );
}

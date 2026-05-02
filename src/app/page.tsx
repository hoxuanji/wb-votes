import type { Metadata } from 'next';
import { HomeHero } from '@/components/home/HomeHero';
import { HomeTabs } from '@/components/home/HomeTabs';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'WB Votes — West Bengal Election 2026',
  description: 'Search all 294 constituencies and 2707+ candidates for the West Bengal Assembly Election 2026.',
};

export default function HomePage() {
  return (
    <>
      <HomeHero />
      <HomeTabs />
    </>
  );
}

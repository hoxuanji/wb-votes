import type { Metadata } from 'next';
import { HomeHero } from '@/components/home/HomeHero';
import { HomeTabs } from '@/components/home/HomeTabs';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'WB Votes — West Bengal Civic Dashboard',
  description: 'Your constituency. Your MLA. Your MP. Transparent governance data for all 294 West Bengal assembly constituencies.',
};

export default function HomePage() {
  return (
    <>
      <HomeHero />
      <HomeTabs />
    </>
  );
}

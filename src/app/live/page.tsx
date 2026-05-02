import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getClientElectionPhase } from '@/lib/election-phase';
import { LiveDashboardClient } from './LiveDashboardClient';

export const metadata: Metadata = {
  title: 'Live Results — WB Votes 2026',
  description: 'Live state-wide election results for the West Bengal 2026 Assembly Election.',
};

export default function LiveDashboardPage() {
  const phase = getClientElectionPhase();
  if (phase !== 'live') notFound();
  return <LiveDashboardClient />;
}

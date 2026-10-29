import Link from 'next/link';
import { candidatesIndex } from '../../../packages/mandate/src/repo/candidates-index.ts';
import { readRegistry } from '../../../packages/mandate/src/repo/session.ts';
import { Foot, Shell } from '../../components/iei/Shell.tsx';
import { CandidateList, CandidatesHead, ElectionTabs, Facets, Find } from '../../components/iei/Candidates.tsx';
import { Crumbs, EmptyState, RegistryMissing } from '../../components/iei/parts.tsx';
import '../iei.css';

// Constraint 7: .data/ is gitignored, so this route can never be prerendered.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Candidates — who is on record, election by election' };

/**
 * `/candidates` — who stood in one election, as a list you can narrow by party, district, what a career looks like and name.
 *
 * It was a constant redirect to search, and there was nowhere to browse who stood. It is a scoped, unranked index now: one election's field, ordered
 * by name or by seat and by nothing else, with facets whose counts honour every other filter. Every parameter is optional and is read by membership
 * against what the election holds (repo/candidates-index.ts), so a hand-edited URL falls back with a one-line note and never reaches the SQL.
 * `/candidates?q=` keeps working: it was the old redirect's use, and it is a filter on the name.
 */
export default function Candidates({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const read = readRegistry((db) => candidatesIndex(db, searchParams));
  if (!read.ok) {
    return (
      <Shell here="person">
        <RegistryMissing />
      </Shell>
    );
  }
  const view = read.value;
  if (view === null) {
    return (
      <Shell here="person">
        <Crumbs trail={[{ label: 'India', href: '/' }, { label: 'Candidates' }]} />
        <EmptyState title="No candidates are on record." detail="The registry holds no election with candidates, so there is nobody to list." />
        <Foot />
      </Shell>
    );
  }
  return (
    <Shell here="person">
      <Crumbs trail={[{ label: 'India', href: '/' }, { label: 'Candidates' }]} />
      <CandidatesHead view={view} />
      <ElectionTabs view={view} />
      <Find view={view} />
      {view.notes.length === 0 ? null : (
        <p className="iei-note">
          {view.notes.join(' ')} <Link href="/candidates">Start again</Link>
        </p>
      )}
      <div className="iei-pp-idx">
        <Facets view={view} />
        <CandidateList view={view} />
      </div>
      <Foot />
    </Shell>
  );
}

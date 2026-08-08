import Link from 'next/link';
import { openRead } from '../../../packages/mandate/src/db/open.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Index of the MANDATE surfaces (docs/mandate/).
 *
 * This page exists because cycles 1-3 were built under a strangler-fig rule — never edit a file
 * belonging to the old WB Votes app — which kept the old app working perfectly and also meant
 * nothing linked to the new work, so it looked from the outside as though nothing had changed.
 * One new file fixes that without touching anything existing.
 *
 * ponytail: inline styles, no CSS file, no shared token import — this is a signpost, not a
 * surface. Delete it when the new shell (§5) has real navigation.
 */

type Counts = { persons: number; contests: number; claims: number; queued: number };

function readCounts(): Counts | null {
  try {
    const db = openRead();
    const one = (sql: string): number => {
      const row = db.prepare(sql).get() as { n?: number } | undefined;
      return Number(row?.n ?? 0);
    };
    const counts = {
      persons: one('SELECT count(*) AS n FROM person'),
      contests: one('SELECT count(*) AS n FROM contest'),
      claims: one('SELECT count(*) AS n FROM claim'),
      queued: one("SELECT count(*) AS n FROM person_merge_candidate WHERE state = 'pending'"),
    };
    db.close();
    return counts;
  } catch {
    return null;
  }
}

const IN = new Intl.NumberFormat('en-IN');

const CARD: React.CSSProperties = {
  background: '#13111B',
  border: '1px solid #2A2536',
  borderRadius: 6,
  padding: '12px 14px',
};

const surfaces: { href: string; label: string; floor: string; replaces: string }[] = [
  {
    href: '/pl/wb/cooch-behar/mekliganj',
    label: 'Place Brief — Mekliganj, which polled 96.6% in 2026',
    floor: 'Floor 1 · Brief',
    replaces: '/constituency/[id]',
  },
  {
    href: '/pl/wb/cooch-behar/mekliganj/analysis',
    label: 'Place Analysis — four elections, turnout against district and state',
    floor: 'Floor 2 · Analysis',
    replaces: '/results and /assembly',
  },
  {
    href: '/pl/wb',
    label: 'West Bengal — districts, with each seat’s latest result',
    floor: 'Floor 1 · Brief',
    replaces: '— new',
  },
  {
    href: '/p/mamata-banerjee-4a681f',
    label: 'Person Brief — Mamata Banerjee (Bhabanipur 2016, 2026)',
    floor: 'Floor 1 · Brief',
    replaces: '/candidate/[id] and /mla/[id]',
  },
  {
    href: '/v1/entity/person/mamata-banerjee-4a681f',
    label: 'API — a person entity, with its sources[] and generated caveats',
    floor: 'API',
    replaces: '/api/candidates/[id]',
  },
  {
    href: '/v1/search?q=%E0%A6%AE%E0%A6%AE%E0%A6%A4%E0%A6%BE',
    label: 'API — searching “মমতা” finds the same people as “Mamata”',
    floor: 'API',
    replaces: '— new',
  },
];

export default function MandateIndex() {
  const counts = readCounts();

  return (
    <main
      style={{
        background: '#0C0A11',
        color: '#F2F0F7',
        minHeight: '100vh',
        padding: '32px 16px',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <p style={{ color: '#6E687F', fontSize: 12, letterSpacing: '0.06em', margin: 0 }}>
          MANDATE · BUILD INDEX
        </p>
        <h1
          style={{ fontSize: 28, lineHeight: 1.25, letterSpacing: '-0.02em', margin: '8px 0 4px' }}
        >
          The new surfaces, reachable.
        </h1>
        <p style={{ color: '#A7A2B8', fontSize: 14, lineHeight: 1.55, margin: '0 0 24px' }}>
          The old WB Votes app is untouched and still serves every one of its routes. These are the
          MANDATE surfaces built beside it. Nothing here was linked from the old app, which is why it
          looked as though nothing had changed.
        </p>

        {counts ? (
          <p
            style={{
              ...CARD,
              fontSize: 13,
              color: '#A7A2B8',
              margin: '0 0 24px',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            Registry is live:{' '}
            <strong style={{ color: '#F2F0F7' }}>{IN.format(counts.persons)}</strong> persons across{' '}
            <strong style={{ color: '#F2F0F7' }}>{IN.format(counts.contests)}</strong> contests,{' '}
            <strong style={{ color: '#F2F0F7' }}>{IN.format(counts.claims)}</strong> cited claims,
            and <strong style={{ color: '#F2F0F7' }}>{IN.format(counts.queued)}</strong> candidate
            merges still awaiting human review.
          </p>
        ) : (
          <p style={{ ...CARD, fontSize: 13, color: '#A7A2B8', margin: '0 0 24px' }}>
            The registry is not built, so the pages below will say so too. Build it with{' '}
            <code style={{ color: '#A98BF2' }}>
              npm run registry:migrate &amp;&amp; npm run registry:ingest &amp;&amp; npm run
              registry:resolve
            </code>
          </p>
        )}

        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          {surfaces.map((s) => (
            <li key={s.href}>
              <Link href={s.href} style={{ ...CARD, display: 'block', textDecoration: 'none', color: 'inherit' }}>
                <span
                  style={{ display: 'block', fontSize: 11, color: '#6E687F', letterSpacing: '0.06em' }}
                >
                  {s.floor.toUpperCase()}
                </span>
                <span style={{ display: 'block', fontSize: 15, color: '#A98BF2', margin: '2px 0' }}>
                  {s.label}
                </span>
                <span style={{ display: 'block', fontSize: 12, color: '#6E687F' }}>
                  replaces {s.replaces}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <p style={{ color: '#6E687F', fontSize: 12, lineHeight: 1.6, margin: '24px 0 0' }}>
          Every figure on these pages is recorded as provisional: 2,924 of 2,932 sources were never
          fetched, only asserted by their publisher. The pages say so where the numbers are.
        </p>
        <p style={{ color: '#6E687F', fontSize: 12, lineHeight: 1.6, margin: '8px 0 0' }}>
          The old app:{' '}
          <Link href="/" style={{ color: '#A98BF2' }}>
            WB Votes home
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

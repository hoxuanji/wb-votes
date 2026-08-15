import Link from 'next/link';
import { notFound } from 'next/navigation';
import { permanentRedirect } from 'next/navigation';
import { Shell } from '../../../../components/iei/Shell.tsx';
import { Crumbs, Panel } from '../../../../components/iei/parts.tsx';
import { constituenciesNamed } from '../../../../../packages/mandate/src/repo/place-page.ts';
import { constituencyHref, stateHref } from '../../../../../packages/mandate/src/repo/routes.ts';
import '../../../iei.css';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `/constituency/<state>/<name>` — THE PRE-BODY URL, and it does not guess.
 *
 * This was the canonical form until the registry showed it cannot identify a seat: a name is unique within a
 * state but not across BODIES. So an old link may mean two real, different offices, and there is no correct
 * single destination for it.
 *
 * ONE MATCH  -> permanent redirect, because there is nothing to choose between.
 * TWO MATCHES-> ASK. Both are offered by name and body, and the reader picks. Answering with either would be
 *               the silent substitution the whole route architecture exists to prevent — and it would be
 *               wrong about half the time by construction.
 * NONE       -> 404. Never the state page: a reader who asked for a constituency did not ask for a state.
 *
 * The second segment is named `body` because Next allows one slug name per path position and the canonical
 * three-segment route beside it owns that name. What arrives here is a constituency name.
 */
export default async function ConstituencyDisambiguation({
  params,
}: {
  params: { state: string; body: string };
}) {
  const found = await constituenciesNamed(params.state, params.body);
  if (found.length === 0) notFound();
  if (found.length === 1) {
    const only = found[0] as (typeof found)[number];
    permanentRedirect(constituencyHref(only));
  }

  return (
    <Shell here="place" reading>
      <Crumbs
        trail={[
          { label: 'India', href: '/' },
          { label: params.state.toUpperCase(), href: stateHref(params.state) },
          { label: found[0]?.canonicalName ?? params.body },
        ]}
      />
      <div className="iei-head">
        <p className="iei-eyebrow">Two constituencies share this name</p>
        <h1 className="iei-answer">{found[0]?.canonicalName ?? params.body}</h1>
        <p className="iei-sub">
          One elects a member of the state assembly, the other a member of the Lok Sabha. They cover different
          territory and different electorates.
        </p>
      </div>
      <Panel title="Which did you mean?">
        <ul className="iei-district-list">
          {found.map((c) => (
            <li key={`${c.kind}-${c.id}`}>
              <Link href={constituencyHref(c)}>
                {c.canonicalName}
                <b>{c.kind === 'pc' ? 'Lok Sabha' : 'Assembly'}</b>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </Shell>
  );
}

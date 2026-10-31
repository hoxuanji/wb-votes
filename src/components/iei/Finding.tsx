import { Fragment } from 'react';
import type { Finding as FindingData, Part } from '../../../packages/mandate/src/repo/finding.ts';
import { PartyChip, PersonLink } from './marks.tsx';
import Link from 'next/link';

/**
 * A page's one finding: a sentence at the size a finding deserves, with its people as links, its parties as swatches with their codes and its
 * figures in the mono face. `page` is the sentence under a page's name; `chapter` is the lead of a section. The smaller line under it, where
 * there is one, is the standfirst.
 *
 * The sentence is built by the page's own builder from the record (repo/finding.ts holds the rules it keeps); this only draws it.
 */
function Parts({ parts }: { parts: readonly Part[] }) {
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {'t' in p ? (
            p.t
          ) : 'n' in p ? (
            <b>{p.n}</b>
          ) : 'party' in p ? (
            <PartyChip partyId={p.party.key} code={p.party.code} />
          ) : 'person' in p ? (
            <PersonLink id={p.person.id} name={p.person.name} />
          ) : (
            <Link href={p.seat.href}>{p.seat.name}</Link>
          )}
        </Fragment>
      ))}
    </>
  );
}

export function Finding({ finding, level = 'page' }: { finding: FindingData; level?: 'page' | 'chapter' }) {
  return (
    <div className={level === 'page' ? 'iei-finding' : 'iei-finding iei-finding-chapter'} data-shape={finding.shape}>
      <p className="iei-finding-s">
        <Parts parts={finding.parts} />
      </p>
      {finding.standfirst === undefined ? null : (
        <p className="iei-sub iei-finding-sf">
          <Parts parts={finding.standfirst} />
        </p>
      )}
    </div>
  );
}

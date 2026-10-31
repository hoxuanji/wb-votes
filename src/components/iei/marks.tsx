import Link from 'next/link';
import type { ReactNode } from 'react';
import { fillFor } from '../../../packages/mandate/src/viz/party-ink.ts';
import { displayName } from '../../../packages/mandate/src/repo/display-name.ts';
import { personHref } from '../../../packages/mandate/src/repo/routes.ts';

/**
 * The small marks every redesigned page shares, so that a party, a person, a margin and a list of what the record cannot say look the same on
 * the front page, a seat, a person and the analysis.
 *
 *  · PartyChip   a swatch in the party's ink, always followed by the party's code: the ink is never the only channel.
 *  · PersonLink  a person as a link to their page, in Title Case; the registry's own spelling is the link's title. With no id there is no link.
 *  · MarginFigure  votes, exact, in the mono face, and the word "declared" after any margin that has no counts behind it.
 *  · Limits      what the record cannot say, as a list with a dashed-square bullet; nothing at all where there is nothing to say.
 *  · TableTwin   a table that is the exact form of the picture above it, kept inside a disclosure.
 */

const IN = new Intl.NumberFormat('en-IN');

export function PartyChip({ partyId, code, title }: { partyId: string | null; code: string; title?: string }) {
  return (
    <span className="iei-mark" title={title}>
      {partyId === null ? null : <span className="iei-sw" style={{ background: fillFor(partyId) }} aria-hidden="true" />}
      <span className="iei-chip">{code}</span>
    </span>
  );
}

export function PersonLink({ id, name, current = false }: { id: string | null; name: string; current?: boolean }) {
  const shown = displayName(name);
  if (current) {
    return (
      <span title={name} aria-current="page">
        {shown} <span className="iei-of">this page</span>
      </span>
    );
  }
  if (id === null) return <span title={name}>{shown}</span>;
  return (
    <Link href={personHref(id)} title={name}>
      {shown}
    </Link>
  );
}

export function MarginFigure({ votes, basis, counted = false }: { votes: number; basis: 'counted' | 'declared'; counted?: boolean }) {
  return (
    <span className="iei-n">
      {IN.format(Math.abs(votes))}
      {basis === 'declared' ? <span className="iei-of"> declared</span> : counted ? <span className="iei-of"> counted</span> : null}
    </span>
  );
}

export function Limits({ heading, items }: { heading: string; items: readonly { id?: string; text: ReactNode }[] }) {
  if (items.length === 0) return null;
  return (
    <div className="iei-limits">
      <h3 className="iei-limits-h">{heading}</h3>
      <ul>
        {items.map((it, i) => (
          <li key={it.id ?? i}>{it.text}</li>
        ))}
      </ul>
    </div>
  );
}

export function TableTwin({ summary, open = false, children }: { summary: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="iei-twin" open={open}>
      <summary>{summary}</summary>
      {children}
    </details>
  );
}

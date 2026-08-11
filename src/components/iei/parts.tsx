import Link from 'next/link';
import type { SourceRef } from '../../../packages/mandate/src/repo/index.ts';

/**
 * The shell's vocabulary: a panel, a metric, a value that might be absent, a magnitude bar, a sparkline,
 * a coverage chip and an evidence disclosure.
 *
 * These exist so the same concept looks the same everywhere, and so `/pl/<state>` gets them for free. Two
 * of them carry the product's whole argument:
 *
 *  · `Value` is the reason a page cannot fabricate. It takes `number | null` and, when null, prints the
 *    REASON rather than a dash — because a dash beside other numbers reads as zero, and "the source
 *    published no count" and "the count is zero" are opposite facts. There is no way to pass it a null and
 *    get a blank.
 *  · `Evidence` is a `<details>`, so the drawer the brief anticipates is native, keyboard-reachable and
 *    costs no client JavaScript. It already renders publisher, title, retrieval date and hash; the claim
 *    and derivation columns are the next thing it grows, and its API does not change to get them.
 */

const IN = new Intl.NumberFormat('en-IN');

/** How a figure came to be. The four words this product is designed around, as a type. */
export type Basis = 'measured' | 'derived' | 'reference' | 'absent';

const BASIS_WORD: Record<Basis, string> = {
  measured: 'Measured',
  derived: 'Derived',
  reference: 'Reference',
  absent: 'Not held',
};

/** A section. `question` is what the section answers; `basis` says how, and links to the evidence. */
export function Panel({
  id,
  title,
  question,
  basis,
  sources,
  note,
  wide = false,
  children,
}: {
  id?: string;
  title: string;
  question?: string;
  basis?: Basis;
  sources?: readonly SourceRef[];
  /** A caveat the reader needs before the numbers, not after them. */
  note?: React.ReactNode;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={wide ? 'iei-sec iei-sec-wide' : 'iei-sec'} id={id} aria-labelledby={id === undefined ? undefined : `${id}-h`}>
      <div className="iei-h">
        <h2 id={id === undefined ? undefined : `${id}-h`}>{title}</h2>
        <div className="iei-h-meta">
          {question === undefined ? null : <p>{question}</p>}
          {basis === undefined ? null : <BasisChip basis={basis} />}
          {sources === undefined || sources.length === 0 ? null : <Evidence sources={sources} />}
        </div>
      </div>
      {note === undefined ? null : <p className="iei-caveat">{note}</p>}
      {children}
    </section>
  );
}

/**
 * The three-state provenance marker, and the product's signature.
 *
 * It is a WORD with a rule under it, not a coloured dot: status must survive greyscale, a forced-colors
 * palette and a screen reader, and "derived" is the single most important thing this product says about a
 * number. A derived figure is marked everywhere it appears — the five-year term arithmetic under Upcoming
 * is the one that matters, because a term expiry printed like an announced date is the exact fabrication
 * the rest of this codebase refuses.
 */
export function BasisChip({ basis }: { basis: Basis }) {
  return (
    <span className={`iei-basis iei-basis-${basis}`} title={basisTitle(basis)}>
      {BASIS_WORD[basis]}
    </span>
  );
}

function basisTitle(basis: Basis): string {
  switch (basis) {
    case 'measured':
      return 'Counted from rows a cited source supplied.';
    case 'derived':
      return 'Computed here from figures a source supplied. Not itself published by anyone.';
    case 'reference':
      return "India's own seat counts, from reference data — not a measurement of this registry.";
    case 'absent':
      return 'The source published no figure. This is not a figure of zero.';
  }
}

/**
 * A number, or the reason there is not one.
 *
 * `unit` follows the value; `of` prints a denominator so a bare count is never ambiguous. When `value` is
 * null the `absent` text is printed in the muted absence style — and `absent` is REQUIRED, so there is no
 * way to render a null as a blank or a dash.
 */
export function Value({
  value,
  unit,
  of,
  absent,
  decimals = 0,
}: {
  value: number | null;
  unit?: string;
  of?: number | null;
  absent: string;
  decimals?: number;
}) {
  if (value === null) return <span className="iei-absent">{absent}</span>;
  const shown = decimals > 0 ? value.toFixed(decimals) : IN.format(Math.round(value));
  return (
    <>
      {shown}
      {unit ?? ''}
      {of === undefined || of === null ? null : <span className="iei-of"> of {IN.format(of)}</span>}
    </>
  );
}

/** A headline figure with its label and, where one exists, its denominator. */
export function Metric({
  label,
  value,
  of,
  unit,
  absent = 'not held',
  hint,
  decimals = 0,
}: {
  label: string;
  value: number | null;
  of?: number | null;
  unit?: string;
  absent?: string;
  hint?: React.ReactNode;
  decimals?: number;
}) {
  return (
    <div className="iei-metric">
      <dt>{label}</dt>
      <dd>
        <Value value={value} of={of} unit={unit} absent={absent} decimals={decimals} />
        {hint === undefined ? null : <small>{hint}</small>}
      </dd>
    </div>
  );
}

/** An in-cell magnitude bar. The value and its length never separate, so the number is always beside it. */
export function Bar({ pct, fill, label }: { pct: number; fill: string; label?: string }) {
  return (
    <span className="iei-track" role="img" aria-label={label}>
      <span className="iei-bar" style={{ width: `${Math.max(1.5, Math.min(100, pct))}%`, background: fill }} />
    </span>
  );
}

/**
 * Seats across the last few elections, as one inline polyline.
 *
 * No axis, no gridlines, no dots: a sparkline's job is the SHAPE, and the numbers either side of it in the
 * table carry the values. The `<title>` spells the series out, because a polyline is not readable.
 */
export function Sparkline({
  points,
  fill,
  label,
}: {
  points: readonly { year: number; seats: number }[];
  fill: string;
  label: string;
}) {
  if (points.length < 2) return <span className="iei-absent">one election</span>;
  const w = 64;
  const h = 16;
  const max = Math.max(...points.map((p) => p.seats), 1);
  const d = points
    .map((p, i) => `${(i * w) / (points.length - 1)},${h - (p.seats / max) * (h - 2) - 1}`)
    .join(' ');
  return (
    <svg className="iei-spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      <title>{label}</title>
      <polyline points={d} fill="none" stroke={fill} strokeWidth={1.5} strokeLinejoin="round" />
      {/* The last point only. Marking every one turns a shape into a scatter. */}
      <circle
        cx={w}
        cy={h - ((points.at(-1)?.seats ?? 0) / max) * (h - 2) - 1}
        r={2}
        fill={fill}
      />
    </svg>
  );
}

/** How completely an election is represented. Word first, so the state is never colour alone. */
export function CoverageChip({ state }: { state: 'complete' | 'partial' | 'unavailable' }) {
  const word = state === 'complete' ? 'Complete' : state === 'partial' ? 'Partial' : 'Unavailable';
  return (
    <span className={`iei-cov iei-cov-${state}`}>
      <span className="iei-cov-mark" aria-hidden="true" />
      {word}
    </span>
  );
}

/** A signed change, with the sign leading because the sign is the story. */
export function Change({ value, unit = '', absent = 'n/a' }: { value: number | null; unit?: string; absent?: string }) {
  if (value === null) return <span className="iei-absent">{absent}</span>;
  const cls = value > 0 ? 'iei-up' : value < 0 ? 'iei-down' : 'iei-flat';
  return (
    <span className={cls}>
      {value > 0 ? '+' : ''}
      {value}
      {unit}
    </span>
  );
}

/**
 * The evidence disclosure. A native `<details>`, so it is keyboard-reachable, printable and free.
 *
 * What it shows is what the registry actually knows about a source: who published it, what it is called,
 * when the bytes were retrieved, and the hash over them — plus, and this is the point, whether the bytes
 * were ever FETCHED or the row is only a publisher's assertion. Most of this registry's sources are the
 * latter, and a citation that does not say so is a citation that overstates itself.
 */
export function Evidence({ sources }: { sources: readonly SourceRef[] }) {
  const fetched = sources.filter((s) => s.retrievalKind === 'fetched').length;
  return (
    <details className="iei-ev">
      <summary aria-label={`Sources: ${sources.length}`}>
        <span aria-hidden="true">ⓘ</span> {sources.length} source{sources.length === 1 ? '' : 's'}
      </summary>
      <div className="iei-ev-body">
        <p className="iei-rule">
          {fetched} of {sources.length} had their bytes retrieved and hashed
          {fetched === sources.length ? '.' : '; the rest are recorded as asserted by their publisher.'}
        </p>
        <ul>
          {sources.slice(0, 8).map((s) => (
            <li key={s.id}>
              <b>{s.publisher ?? 'Publisher not recorded'}</b>
              {s.title === null ? null : <span className="iei-ev-t">{s.title}</span>}
              <span className="iei-rule">
                {s.kind} · retrieved {s.retrievedAt.slice(0, 10)}
                {s.publishedOn === null ? '' : ` · published ${s.publishedOn}`} ·{' '}
                {s.hashKind === 'document_bytes' ? `sha256 ${shortHash(s.id)}` : 'hash over the URL only'}
              </span>
              {s.url === null ? null : (
                <a className="iei-ev-a" href={s.url} rel="nofollow noopener" target="_blank">
                  open source
                </a>
              )}
            </li>
          ))}
        </ul>
        {sources.length > 8 ? (
          <p className="iei-rule">
            {sources.length - 8} more not listed. <Link href="/coverage">Coverage</Link> holds the full account.
          </p>
        ) : null}
      </div>
    </details>
  );
}

/** Source ids are content-derived and carry the digest; the last segment is enough to match a manifest. */
function shortHash(id: string): string {
  const tail = id.split(':').at(-1) ?? id;
  return tail.slice(0, 12);
}

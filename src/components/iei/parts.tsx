import Link from 'next/link';
import type { SourceRef } from '../../../packages/mandate/src/repo/index.ts';
import { ABSENT } from '../../../packages/mandate/src/semantic/measures.ts';

/**
 * The product's vocabulary. Every surface is built out of these and nothing else.
 *
 * Before this phase there were four sets of them: `/` had Panel/Metric/Value/Bar, `/pl` and `/p` had
 * `.tile`/`.cite`/`.na`/`Confidence`/`Sources`, `/coverage` and `/search` had a third, and the deleted
 * dashboard had Tailwind. Four vocabularies for the same eight ideas is why a component written for one
 * page could not be mounted on the next, and why the product read as assembled widgets.
 *
 * Three of them carry the whole argument:
 *
 *  · `Value` is the reason a page cannot fabricate. It takes `number | null` and, when null, prints the
 *    REASON rather than a dash — because a dash beside other numbers reads as zero, and "the source
 *    published no count" and "the count is zero" are opposite facts. There is no way to pass it a null and
 *    get a blank.
 *  · `BasisChip` is how a derived figure is marked as derived, in a word, wherever it appears.
 *  · `Evidence` is the drawer, and it is the ONLY place a url, a hash, a retrieval date or a methodology
 *    note may be rendered. The surface shows the figure; the drawer shows where it came from.
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
  children,
}: {
  id?: string;
  title: string;
  question?: string;
  basis?: Basis;
  sources?: readonly SourceRef[];
  /** A caveat the reader needs before the numbers, not after them. Keep it to one sentence: the long
   *  methodology paragraphs that used to live here belong in the evidence drawer. */
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="iei-sec" id={id} aria-labelledby={id === undefined ? undefined : `${id}-h`}>
      <div className="iei-h">
        <div className="iei-h-title">
          <h2 id={id === undefined ? undefined : `${id}-h`}>{title}</h2>
          {question === undefined ? null : <p>{question}</p>}
        </div>
        <div className="iei-h-meta">
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
 *
 * A SMALL NUMBER IS NOT ZERO. A value that is genuinely non-zero but rounds to all-zeros at the requested
 * precision renders as `<0.1` rather than `0.0`: SKM polled a real share of the 2024 national vote and won
 * a seat with it, and printing "0.0%" beside that seat says the party received no votes. Rounding is
 * allowed to lose precision; it is not allowed to change a fact.
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
  const smallest = 10 ** -decimals;
  const rounded = Number(value.toFixed(decimals));
  const shown =
    value !== 0 && rounded === 0
      ? `<${smallest.toFixed(decimals)}`
      : decimals > 0
        ? rounded.toFixed(decimals)
        : IN.format(Math.round(value));
  return (
    <>
      {shown}
      {unit ?? ''}
      {of === undefined || of === null ? null : <span className="iei-of"> of {IN.format(of)}</span>}
    </>
  );
}

/**
 * A headline figure with its label and, where one exists, its denominator.
 *
 * `text` is the door for a figure the repo layer has already formatted — `Tile.value` from brief.ts is a
 * string, because the semantic layer owns how a turnout, a margin or an effective-party count is written,
 * and a component must not re-round what it was handed.
 *
 * A text figure equal to `ABSENT` is the semantic layer's one absence token, and it renders as WORDS in the
 * absence style. That is the product's rule — a dash beside other numbers reads as zero — and it was being
 * broken on every place and person page, which printed a literal em dash at 19px wherever a source had
 * published no margin. Recognising the token beats guessing: the first attempt at this asked whether the
 * string contained a digit, and rendered "once" (a real count of how often a seat has changed hands) in the
 * muted tier reserved for figures that do not exist.
 */
export function Metric({
  label,
  value,
  text,
  of,
  unit,
  absent = 'not held',
  hint,
  decimals = 0,
  sources,
}: {
  label: string;
  value?: number | null;
  /** A pre-formatted figure. Mutually exclusive with `value`. */
  text?: string;
  of?: number | null;
  unit?: string;
  absent?: string;
  hint?: React.ReactNode;
  decimals?: number;
  /** Where this one figure came from. Renders the inline ⓘ, never the provenance itself. */
  sources?: readonly SourceRef[];
}) {
  return (
    <div className="iei-metric">
      <dt>{label}</dt>
      <dd>
        {text === undefined ? (
          <Value value={value ?? null} of={of} unit={unit} absent={absent} decimals={decimals} />
        ) : text === ABSENT ? (
          <span className="iei-absent">{absent}</span>
        ) : (
          <>
            {text}
            {unit === undefined ? null : <span className="iei-of"> {unit}</span>}
          </>
        )}
        {sources === undefined || sources.length === 0 ? null : <Evidence sources={sources} inline />}
        {hint === undefined ? null : <small>{hint}</small>}
      </dd>
    </div>
  );
}

/**
 * A grid of metrics, as many per row as fit.
 *
 * NO COLUMN COUNT. It took one — 3, 4 or 6 — and every caller had to guess how many tiles its data would
 * produce. `placeTiles` produces five for a seat with no demographic claim and six for one with, so a
 * six-column grid rendered a sixth cell with nothing in it, and because the grid paints the hairline colour
 * behind its 1px gaps, that empty cell was a solid grey block sitting in the row like a broken tile.
 * `auto-fit` cannot do that, and it needs no breakpoints either.
 *
 * `<dl>` rather than a row of divs, because a label and its figure are a description list and a screen
 * reader should be told so.
 */
export function Metrics({ children }: { children: React.ReactNode }) {
  return <dl className="iei-metrics">{children}</dl>;
}

/**
 * An in-cell magnitude bar.
 *
 * `aria-hidden` by default, and that is the accessible choice rather than a lapse: every bar on this page
 * sits in the cell beside the number it encodes, so announcing it repeats the figure a screen reader has
 * just read. Pass `label` only where a bar is the ONLY encoding of its value.
 */
export function Bar({ pct, fill, label }: { pct: number; fill: string; label?: string }) {
  return (
    <span
      className="iei-track"
      role={label === undefined ? undefined : 'img'}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
    >
      <span className="iei-bar" style={{ width: `${Math.max(1.5, Math.min(100, pct))}%`, background: fill }} />
    </span>
  );
}

/**
 * A table, and the only way one is rendered.
 *
 * Every table in the product goes through here, which is what makes Phase H's list — one header
 * typography, one row height, one cell padding, one alignment rule, one border treatment, one hover — a
 * property of the code rather than a promise. The audit found four idioms with 3px, 6px, 8px and 10px of
 * cell padding and three header weights.
 *
 * The wrapper is a named, focusable region every time. All three of `role`, `tabIndex` and a name: a
 * scroll container that cannot take focus is unreachable without a pointer, and an unnamed region is
 * announced as "region" with no indication of what it holds.
 *
 *  · `label` names the region. Required.
 *  · `caption` is the table's own caption. `captionVisible` shows it; by default it is for screen readers,
 *    because on most surfaces the panel's question above the table already says what it says.
 *  · `tight` is the 36-rows-of-India density, and it is the only second density that exists.
 *  · `tall` gives the region its own vertical scroll instead of letting a long list grow the document.
 *  · `wide` gives the table a minimum width, for the tables whose columns hold prose. Without it a phone
 *    squeezes a sentence into a 55px column and wraps it over eight lines.
 */
export function Table({
  label,
  caption,
  head,
  tight = false,
  tall = false,
  wide = false,
  captionVisible = false,
  className,
  children,
}: {
  label: string;
  caption?: React.ReactNode;
  head: React.ReactNode;
  tight?: boolean;
  tall?: boolean;
  wide?: boolean;
  captionVisible?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={tall ? 'iei-scroll iei-scroll-tall' : 'iei-scroll'}
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      <table
        className={['iei-t', tight ? 'iei-t-tight' : '', wide ? 'iei-t-wide' : '', className ?? '']
          .filter(Boolean)
          .join(' ')}
      >
        {caption === undefined ? null : (
          <caption className={captionVisible ? undefined : 'iei-sr'}>{caption}</caption>
        )}
        <thead>
          <tr>{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
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
      <circle cx={w} cy={h - ((points.at(-1)?.seats ?? 0) / max) * (h - 2) - 1} r={2} fill={fill} />
    </svg>
  );
}

/**
 * A three-state status. Word first, and the mark carries a shape as well as a hue, so the state survives a
 * greyscale print, a forced-colors palette and a screen reader.
 *
 * `word` overrides the default vocabulary, because the same three states are asked in two different
 * questions. "How completely is this election loaded?" is Complete / Partial / Unavailable. "Does this
 * subject area hold data?" is Has data / Table, no rows / Not modelled — and printing the first vocabulary
 * beside the second, which is what /coverage did for a moment, tells a reader "COMPLETE · Has data" and
 * makes them wonder which of the two they are reading.
 */
export function CoverageChip({
  state,
  word,
}: {
  state: 'complete' | 'partial' | 'unavailable';
  word?: string;
}) {
  const dflt = state === 'complete' ? 'Complete' : state === 'partial' ? 'Partial' : 'Unavailable';
  return (
    <span className={`iei-cov iei-cov-${state}`}>
      <span className="iei-cov-mark" aria-hidden="true" />
      {word ?? dflt}
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
 * A strip of mutually exclusive choices, as plain links.
 *
 * One primitive for three things that were three implementations: the map's layer strip, the history
 * house switch, and `/pl`'s Brief/Analysis lens. Links, not buttons, so the choice is URL state — a view
 * can be sent to someone, survives a reload, and works with JavaScript off.
 *
 * A choice with nothing behind it is offered as UNAVAILABLE rather than hidden or rendered as "coming
 * soon". Hiding it would make the strip's contents depend on the data in a way a reader cannot see;
 * offering it live would shade a country in a colour that stands for nothing.
 */
export type Choice = { key: string; label: string; href?: string; available?: boolean };

export function Tabs({ label, choices, current }: { label: string; choices: readonly Choice[]; current: string }) {
  return (
    <div className="iei-tabs" role="group" aria-label={label}>
      {choices.map((c) =>
        c.available === false || c.href === undefined ? (
          <span key={c.key} className="iei-tab iei-tab-off" aria-disabled="true">
            {c.label}
            <span className="iei-sr"> — unavailable: nothing in the registry can fill this</span>
          </span>
        ) : (
          <Link
            key={c.key}
            href={c.href}
            className={c.key === current ? 'iei-tab iei-tab-on' : 'iei-tab'}
            aria-current={c.key === current ? 'true' : undefined}
          >
            {c.label}
          </Link>
        ),
      )}
    </div>
  );
}

/**
 * A list of titled rows, each with its detail underneath.
 *
 * The watch signals, the coverage verticals and a group of search results are the same shape and had three
 * implementations. A row's title is a link wherever the row is about something with a page, which is
 * nearly always: an informational island with no next action is the thing Phase J exists to remove.
 */
export function DataList({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <ul className="iei-list" aria-label={label}>
      {children}
    </ul>
  );
}

export function DataRow({
  title,
  href,
  aside,
  detail,
  rule,
}: {
  title: React.ReactNode;
  href?: string;
  /** The right-hand end of the title line — a basis chip, a coverage chip, a count. */
  aside?: React.ReactNode;
  detail?: React.ReactNode;
  /** The rule and threshold that produced the row, or the source note. Monospace, smallest tier. */
  rule?: React.ReactNode;
}) {
  return (
    <li>
      <div className="iei-row-h">
        {href === undefined ? <span className="iei-row-t">{title}</span> : <Link href={href}>{title}</Link>}
        {aside}
      </div>
      {detail === undefined ? null : <p className="iei-row-d">{detail}</p>}
      {rule === undefined ? null : <p className="iei-rule">{rule}</p>}
    </li>
  );
}

/**
 * The place path, walkable.
 *
 * India is the first crumb and is a real link, which is the fix for the defect the audit found: `/pl` and
 * `/p` had no navigation at all, so a reader who arrived at a seat could reach that seat's ancestors and
 * nothing else — not the country, not search, not another state. `aria-current` marks the last crumb,
 * which is the page you are on and therefore not a link.
 */
export function Crumbs({ trail }: { trail: readonly { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="iei-crumbs">
        {trail.map((c, i) => (
          <li key={`${c.label}-${i}`}>
            {i > 0 ? <span aria-hidden="true">/ </span> : null}
            {c.href === undefined ? <span aria-current="page">{c.label}</span> : <Link href={c.href}>{c.label}</Link>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Nothing to show, and why.
 *
 * One wording. There were five: the homepage, `/pl`, `/p`, `/coverage` and `/search` each said "the
 * registry is not built in this checkout" in different words, and two of them said it without the command
 * that fixes it. A reader who has just cloned this repository sees the same sentence wherever they land.
 */
export function EmptyState({ title, detail }: { title: string; detail?: React.ReactNode }) {
  return (
    <div className="iei-empty">
      <h1 className="iei-answer">{title}</h1>
      {detail === undefined ? null : <p className="iei-sub">{detail}</p>}
    </div>
  );
}

/** The one place the "build the registry" instruction is written. */
export function RegistryMissing() {
  return (
    <EmptyState
      title="The registry is not built in this checkout."
      detail={
        <>
          Every figure on this page is a <code>SELECT</code> executed when the page is requested, so the
          page needs the database. Build it with{' '}
          <code>npm run registry:migrate &amp;&amp; npm run registry:ingest</code>, then reload.
        </>
      }
    />
  );
}

/**
 * The evidence drawer, and the only place provenance is rendered.
 *
 * A native `<details>`, so it is keyboard-reachable, printable and costs no client JavaScript. What it
 * shows is what the registry actually knows about a source: who published it, what it is called, when the
 * bytes were retrieved, and the hash over them — plus, and this is the point, whether the bytes were ever
 * FETCHED or the row is only a publisher's assertion. Most of this registry's sources are the latter, and
 * a citation that does not say so is a citation that overstates itself.
 *
 * `inline` is the affordance for a single figure: the ⓘ alone, no count, and the panel floats rather than
 * pushing the table down. That is what replaced `/pl`'s `Cite`, which printed a source label beside every
 * one of its six tiles, and `Confidence`, which printed a four-line provenance paragraph above the numbers
 * on every place and person page in the product.
 */
export function Evidence({
  sources,
  inline = false,
  label,
}: {
  sources: readonly SourceRef[];
  inline?: boolean;
  /** What the sources are evidence FOR. Reaches the screen reader; the visible ⓘ has no room for it. */
  label?: string;
}) {
  const fetched = sources.filter((s) => s.retrievalKind === 'fetched').length;
  const n = sources.length;
  const name = `${label === undefined ? 'Sources' : `Sources for ${label}`}: ${n}`;
  return (
    <details className={inline ? 'iei-ev iei-ev-inline' : 'iei-ev'}>
      <summary aria-label={name}>
        <span aria-hidden="true">ⓘ</span>
        {inline ? null : ` ${n} source${n === 1 ? '' : 's'}`}
      </summary>
      <div className="iei-ev-body">
        <p className="iei-rule">
          {fetched} of {n} had their bytes retrieved and hashed
          {fetched === n ? '.' : '; the rest are recorded as asserted by their publisher, which means the figures are copied, not verified.'}
        </p>
        <ul>
          {sources.slice(0, 8).map((s) => (
            <li key={s.id}>
              <b>{s.publisher ?? 'Publisher not recorded'}</b>
              {s.title === null ? null : <span className="iei-ev-t">{s.title}</span>}
              <span className="iei-rule">
                {s.kind.replace(/_/g, ' ')} · retrieved {s.retrievedAt.slice(0, 10)}
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
        {n > 8 ? (
          <p className="iei-rule">
            {n - 8} more not listed. <Link className="iei-ev-a" href="/coverage">Coverage</Link> holds the
            full account.
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

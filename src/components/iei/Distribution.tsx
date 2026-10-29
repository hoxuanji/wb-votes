import Link from 'next/link';
import { fillFor } from '../../../packages/mandate/src/viz/party-ink.ts';
import { SEQUENTIAL } from '../../../packages/mandate/src/repo/home.ts';
import {
  axisTicks,
  encloseDiscs,
  labelWidth,
  othersLabel,
  placeLabels,
  splitMinor,
} from '../../../packages/mandate/src/viz/plot-labels.ts';
import { peakBin } from '../../../packages/mandate/src/repo/election-map.ts';
import type { MarginBin } from '../../../packages/mandate/src/repo/election-map.ts';
import type { VoteSeatEfficiency } from '../../../packages/mandate/src/repo/findings.ts';

/**
 * Two figures the product has never had, both server-rendered SVG with no client JavaScript.
 *
 * These are not decorative charts. Each answers one question that a table of the same numbers does not, and
 * each is INTERACTIVE in the only way this codebase allows — a link that changes URL state, so a reading is
 * shareable, survives the back button and costs nothing to hydrate.
 */

const IN = new Intl.NumberFormat('en-IN');

/**
 * WHAT A FIGURE WITH NOTHING TO PLOT BECOMES: one sentence, and nothing else.
 *
 * Not a frame, not axes, not a caption. West Bengal 2026 published no candidate vote counts, so every party's
 * vote share is unknown, and the vote-against-seat-share plot drew its two axes, its parity line and the
 * caption explaining what lies above the line, with no marker anywhere. An empty frame under an explanation of
 * how to read it looks like a page that failed to load; a sentence saying what is missing is a page that did
 * not. That is product principle P6 (docs/mandate/01-product.md) and what `viz/charts.ts` already does for the
 * constituency analysis (`nothing()`). Each figure below decides for itself when it has nothing, so no page
 * has to remember to ask.
 */
function Nothing({ children }: { children: string }) {
  return <p className="iei-absent">{children}</p>;
}

/* ───────────────────────────── the margin distribution ───────────────────────────── */

/**
 * How competitive was this election? — 543 margins as a shape rather than as a list of five.
 *
 * WHY IT EXISTS. The registry can compute a margin for every contest a source published counts for, from rank-1 and
 * rank-2 vote counts. Every surface in this product showed the five smallest. The five smallest cannot tell you whether
 * an election was close everywhere or a landslide with five accidents, and that is the question.
 *
 * INTERACTION IS THE POINT, not an ornament: each bar is a link that isolates its own seats on the map above, or
 * in the seat list where the page draws no map.
 * So "45 seats were decided by under 2 points" becomes "and here is where they are", which is the drill-down
 * the brief asks for and the thing a histogram alone cannot do.
 *
 * THE BARS ARE UNIFORM WIDTH — 2 percentage points each, with one overflow bin at 40+. Mixed widths would
 * make area meaningless, and area is what a reader compares in a histogram whether the axis invites it or not.
 */
export function MarginDistribution({
  bins,
  selected,
  hrefFor,
  total,
  mapped = true,
}: {
  bins: readonly MarginBin[];
  /** The bin currently isolating the map, or null. */
  selected: number | null;
  hrefFor: (bin: number | null) => string;
  /** Seats with a computable margin, for the accessible summary. */
  total: number;
  /** Whether a map is drawn on this page. A caption that sends the reader to the map is printed only when it is. */
  mapped?: boolean;
}) {
  const peak = peakBin(bins);
  // No seat with a margin would otherwise be a row of invisible bars under an axis and a caption saying to select
  // one, with `peak` held at 1 to keep the division finite. `bins: []` is the same nothing.
  if (peak === 0) {
    return <Nothing>No seat has a known margin over votes polled, so there is no distribution of margins to draw.</Nothing>;
  }
  const W = 100;
  const H = 34;
  const slot = W / bins.length;
  const gap = slot * 0.16;
  const edge = bins.findIndex((b) => b.lo === 20);

  return (
    <figure className="iei-fig iei-dist">
      {/* THE BARS ONLY, and `preserveAspectRatio: none` so the band fills whatever width it is given.
          NO TEXT IN HERE. A font size inside an SVG is in USER UNITS, so this frame — 100 units wide,
          rendered at about 1,300px — scales a 4-unit label to about 52px. That is the trap `IndiaMap`'s
          LABEL_FRACTION exists to document, and the first version of this figure fell straight into it: the
          axis read as three enormous numerals lying across the bars. The axis is HTML below, where a
          stylesheet owns its size and non-uniform scaling cannot reach it. */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="group"
        aria-label={distLabel(bins, total)}
        preserveAspectRatio="none"
      >
        {/* HALF THE TALLEST BAR, as a hairline behind the bars, so a bar's height can be read against a number
            rather than only against its neighbours. Not drawn for a peak of one seat: half a seat is not a count. */}
        {peak < 2 ? null : <line x1={0} y1={H / 2} x2={W} y2={H / 2} className="iei-dist-half" />}
        {bins.map((b, i) => {
          const h = (b.n / peak) * H;
          const on = selected === b.lo;
          // The ramp is the map's ramp, brightest at the knife edge, so a bar and the seats it selects are the
          // same colour by construction rather than by coincidence.
          const t = Math.min(1, b.lo / 30);
          const ink = SEQUENTIAL[Math.min(SEQUENTIAL.length - 1, Math.floor((1 - t) * SEQUENTIAL.length))] as string;
          const bar = (
            <g opacity={selected === null || on ? 1 : 0.35}>
              {/* A full-height hit area, so a bar with two seats in it is still clickable. */}
              <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
              <rect
                className="iei-dist-bar"
                x={i * slot + gap / 2}
                y={H - h}
                width={slot - gap}
                height={Math.max(h, b.n > 0 ? 0.6 : 0)}
                fill={ink}
                stroke={on ? 'var(--iei-ink)' : 'none'}
                strokeWidth={on ? 0.5 : 0}
              />
              {/* ONE TEXT NODE. An SVG <title> built from several JSX children arrives as an array, and a
                  browser renders the whole array — markup, comment nodes and all — as the tooltip text,
                  then hydration mismatches. React warns about it; the fix is to interpolate first. */}
              <title>{`${b.overflow ? `${b.lo}% and wider` : `${b.lo}–${b.hi}%`} — ${b.n} seat${b.n === 1 ? '' : 's'}`}</title>
            </g>
          );
          // A BAR WITH NO SEAT IN IT LEADS NOWHERE: following it muted the whole map and emptied the list. It keeps its
          // tooltip, so the gap in the distribution still says what it is, and a selected bar stays a link whatever it holds,
          // because it is the way back.
          return b.n === 0 && !on ? (
            <g key={b.lo}>{bar}</g>
          ) : (
            <Link key={b.lo} href={hrefFor(on ? null : b.lo)}>
              {bar}
            </Link>
          );
        })}
      </svg>
      {/* THE COUNTS ARE HTML FOR THE REASON THE AXIS IS: a glyph in the band above would be stretched with it.
          They sit in a gutter to the left of the bars, the tallest bar's count level with its top and half of it
          level with the hairline. */}
      <span className="iei-dist-unit" aria-hidden="true">seats</span>
      <span className="iei-dist-count iei-dist-count-top" aria-hidden="true">{IN.format(peak)}</span>
      {peak < 2 ? null : (
        <span className="iei-dist-count iei-dist-count-half" aria-hidden="true">{IN.format(peak / 2)}</span>
      )}
      {/* Three ticks, not twenty-one. The axis makes the shape readable; it is not itself read. The middle one sits
          on the edge of the bar that starts at 20%, which is not the middle of the band. */}
      <div className="iei-dist-axis" aria-hidden="true">
        <span>0%</span>
        <span style={{ left: `${edge < 0 ? 50 : (edge / bins.length) * 100}%` }}>20%</span>
        <span>40%+</span>
      </div>
      <figcaption>
        {selected === null ? (
          <>{mapped ? 'Margin over votes polled. Select a bar to find those seats on the map.' : 'Margin over votes polled.'}</>
        ) : (
          <>
            Showing seats decided by {bins.find((b) => b.lo === selected)?.overflow ? `${selected}% and wider` : `${selected}–${selected + 2}%`}.{' '}
            <Link href={hrefFor(null)}>Show every seat</Link>
          </>
        )}
      </figcaption>
    </figure>
  );
}

/** The accessible summary of the whole distribution: the shape in one sentence, not 21 numbers. */
function distLabel(bins: readonly MarginBin[], total: number): string {
  const tight = bins.filter((b) => b.lo < 6).reduce((n, b) => n + b.n, 0);
  const wide = bins.filter((b) => b.lo >= 20).reduce((n, b) => n + b.n, 0);
  return (
    `Distribution of winning margins across ${IN.format(total)} ${total === 1 ? 'seat' : 'seats'}. ` +
    `${IN.format(tight)} were decided by under 6 percentage points of the votes polled; ` +
    `${IN.format(wide)} by 20 points or more. Each bar links to those seats.`
  );
}

/* ───────────────────────────── vote share against seat share ───────────────────────────── */

/**
 * How did the vote become seats? — the question behind most arguments about an Indian election result.
 *
 * THE 45-DEGREE LINE IS THE WHOLE FIGURE. On it, a party's share of the seats equals its share of the vote.
 * Above it the system rewarded the party; below it, punished. The DISTANCE from the line is the finding, and
 * it is a distance a reader can see without reading a number:
 *
 *   Karnataka 2023   INC  43.2% of the vote  ->  60.3% of the seats   +17.0
 *                    BJP  36.1%              ->  29.0%                 -7.1
 *   India 2024       BJP  36.9%              ->  44.0%                 +7.1
 *
 * None of those six figures appears anywhere else in this product.
 *
 * Each marker is a link that isolates that party on the map (or in the seat list where there is no map), so "BJP converts votes to seats well" leads
 * straight to "and here is where".
 */
export function VoteSeatPlot({
  rows,
  selected,
  hrefFor,
  max = 60,
  mapped = true,
}: {
  rows: readonly VoteSeatEfficiency[];
  selected: string | null;
  hrefFor: (party: string | null) => string;
  /** The axis ceiling. Both axes share it, or the diagonal would not mean parity. */
  max?: number;
  /** Whether a map is drawn on this page. A caption that sends the reader to the map is printed only when it is. */
  mapped?: boolean;
}) {
  // A party is placed by its vote share, so with none known there is no point to put on the plot. The sentence
  // reuses the state page's own wording for the same absence.
  if (!anyVoteShare(rows)) {
    return (
      <Nothing>
        No candidate vote counts were published for this election, so no party&rsquo;s vote share is known to set
        against its seat share.
      </Nothing>
    );
  }
  // A 400-UNIT FRAME, not 100. The figure renders at about 420px, so one user unit is about one device
  // pixel and a 13-unit label is 13px — the size the stylesheet intends. At 100 units every glyph was
  // scaled 4.2x and the party names lay across each other and across the parity line. Same trap the maps
  // document with LABEL_FRACTION; the cheapest escape is a frame whose units already mean pixels.
  const S = 400;
  const pad = 38;
  const inner = S - pad * 2;
  const shown = rows.filter((r) => r.votePct !== null).slice(0, 10);
  const ceiling = Math.max(max, ...shown.map((r) => Math.max(r.votePct ?? 0, r.seatPct))) * 1.05;
  const x = (v: number) => pad + (v / ceiling) * inner;
  const y = (v: number) => S - pad - (v / ceiling) * inner;

  /**
   * Where each name goes (`viz/plot-labels.ts`), worked out before anything is drawn.
   *
   * Names used to be printed beside their markers and pushed apart in one dimension. Small parties bunch at the
   * origin (West Bengal 2021 puts four inside five points of vote share and one of seat share), and their names
   * overprinted each other and the axis. Now a name is a box one line tall that may not leave the plot, touch a
   * marker, or come within a line of another name; one that cannot sit beside its marker gets a leader line, and
   * the placement prefers a layout in which no leader runs through another name, marker or leader.
   * Parties under 1% of both shares have no name of their own: they are one group, named once.
   *
   * THE MARKER'S RADIUS HERE IS THE SELECTED ONE (7), for every party, so choosing a party never moves a name.
   */
  const { named, minor } = splitMinor(shown);
  const at = (r: VoteSeatEfficiency) => ({ x: x(r.votePct as number), y: y(r.seatPct), r: 7 });
  const nameOf = (r: VoteSeatEfficiency) => (r.party.label.length > 12 ? `${r.party.label.slice(0, 11)}…` : r.party.label);
  const group = minor.length === 0 ? null : encloseDiscs(minor.map(at));
  const groupName = othersLabel(minor.map(nameOf), Math.floor((0.85 * inner) / labelWidth('x')));
  const GROUP = '*others';
  const { placed } = placeLabels(
    [
      ...named.map((r) => ({
        ...at(r),
        key: r.party.key,
        width: labelWidth(nameOf(r)),
        weight: Math.max(r.votePct as number, r.seatPct),
      })),
      ...(group === null ? [] : [{ ...group, key: GROUP, width: labelWidth(groupName), weight: -1 }]),
    ],
    [...shown.map(at), ...(group === null ? [] : [group])],
    { x0: pad + 4, y0: pad + 4, x1: S - pad - 4, y1: S - pad - 4 },
    16,
    // The figure's own rules, which a name may cross but only when nowhere near is free: the parity diagonal and each
    // party's drop to it (the `iei-vs-gap` lines below), where a name would read as belonging to the wrong marker.
    [
      { x1: x(0), y1: y(0), x2: x(ceiling), y2: y(ceiling) },
      ...shown.map((r) => ({
        x1: x(r.votePct as number),
        y1: y(r.seatPct),
        x2: x(r.votePct as number),
        y2: y(r.votePct as number),
      })),
    ],
  );
  const nameAt = new Map(placed.map((p) => [p.key, p]));
  const others = nameAt.get(GROUP);

  return (
    <figure className="iei-fig iei-vs">
      <svg viewBox={`0 0 ${S} ${S}`} role="group" aria-label={vsLabel(shown)}>
        {/* PARITY, as a line. Everything in this figure is read against it.
            It is named where it ends, in the margin above the frame: inside the plot the leading party's marker
            lands on its top end, which is why the first version of this label collided with it. */}
        <line x1={x(0)} y1={y(0)} x2={x(ceiling)} y2={y(ceiling)} className="iei-vs-parity" />
        <text x={x(ceiling)} y={pad - 14} textAnchor="end" className="iei-vs-parity-label" aria-hidden="true">
          seats = votes
        </text>

        {/* Axes: two lines, a tick and a number at each round value, and a title each. The origin is numbered once,
            on the bottom axis. The seat axis's title is horizontal above it, because the margin to its left is
            taken by the numbers. */}
        <g className="iei-vs-axis" aria-hidden="true">
          <line x1={pad} y1={S - pad} x2={S - pad} y2={S - pad} />
          <line x1={pad} y1={pad} x2={pad} y2={S - pad} />
          {axisTicks(ceiling).map((v) => (
            <g key={v}>
              <line x1={x(v)} y1={S - pad} x2={x(v)} y2={S - pad + 4} className="iei-vs-tick" />
              <text x={x(v)} y={S - pad + 16} textAnchor="middle" className="iei-vs-tick-label">
                {v}%
              </text>
              <line x1={pad - 4} y1={y(v)} x2={pad} y2={y(v)} className="iei-vs-tick" />
              {v === 0 ? null : (
                <text x={pad - 7} y={y(v)} dy="0.35em" textAnchor="end" className="iei-vs-tick-label">
                  {v}%
                </text>
              )}
            </g>
          ))}
          <text x={S - pad} y={S - 6} textAnchor="end">
            vote share →
          </text>
          <text x={pad} y={pad - 14}>
            seat share ↑
          </text>
        </g>

        {shown.map((r) => {
          const cx = x(r.votePct as number);
          const cy = y(r.seatPct);
          const name = nameAt.get(r.party.key);
          const on = selected === r.party.key;
          const dim = selected !== null && !on;
          return (
            <Link key={r.party.key} href={hrefFor(on ? null : r.party.key)}>
              <g opacity={dim ? 0.3 : 1}>
                {/* The gap to parity, drawn. The marker says where the party is; this says how far from fair. */}
                <line x1={cx} y1={cy} x2={cx} y2={y(r.votePct as number)} className="iei-vs-gap" />
                {/* A LEADER LINE, only where the name could not sit beside its marker. Without it a pushed name
                    looks like it belongs to whichever marker it drifted next to. */}
                {name?.leader == null ? null : (
                  <line x1={name.leader.x1} y1={name.leader.y1} x2={name.leader.x2} y2={name.leader.y2} className="iei-vs-lead" />
                )}
                <circle cx={cx} cy={cy} r={on ? 7 : 5} fill={fillFor(r.party.key)} className="iei-vs-dot" />
                {name === undefined ? null : (
                  <text x={name.x} y={name.y} dy="0.35em" textAnchor={name.anchor} className="iei-vs-tag">
                    {nameOf(r)}
                  </text>
                )}
                {/* One text node — see the histogram's title above for what an array does here. */}
                <title>
                  {`${r.party.label}: ${(r.votePct as number).toFixed(1)}% of the vote, ` +
                    `${r.seatPct.toFixed(1)}% of the seats (${r.seats} of ${r.contested}) — ` +
                    (r.deltaPp === null
                      ? 'no comparison'
                      : `${r.deltaPp > 0 ? '+' : '−'}${Math.abs(r.deltaPp).toFixed(1)} points`)}
                </title>
              </g>
            </Link>
          );
        })}
        {/* THE GROUP'S ONE NAME. Not a link: it names several parties, and each of their markers is one. */}
        {others === undefined ? null : (
          <g opacity={selected === null || minor.some((r) => r.party.key === selected) ? 1 : 0.3} aria-hidden="true">
            {others.leader === null ? null : (
              <line x1={others.leader.x1} y1={others.leader.y1} x2={others.leader.x2} y2={others.leader.y2} className="iei-vs-lead" />
            )}
            <text x={others.x} y={others.y} dy="0.35em" textAnchor={others.anchor} className="iei-vs-tag iei-vs-tag-group">
              {groupName}
            </text>
          </g>
        )}
      </svg>
      <figcaption>
        Above the line, a party won a larger share of seats than of votes. {shareBase(shown)}{' '}
        {selected === null ? (
          mapped ? 'Select a party to find its seats on the map.' : null
        ) : (
          <Link href={hrefFor(null)}>Show every party</Link>
        )}
      </figcaption>
    </figure>
  );
}

/**
 * WHAT THE TWO SHARES ARE OVER, under the plot. The seat share is over every seat contested, the house the rest of the page
 * counts; the vote share is over the votes polled in the seats that have candidate counts, and a seat the source gave no result
 * for is in the first and adds nothing to the second. With a count in every seat they are the same seats, and it says so.
 */
function shareBase(rows: readonly VoteSeatEfficiency[]): string {
  const r = rows[0];
  if (r === undefined) return '';
  const seats = (n: number) => `${IN.format(n)} seat${n === 1 ? '' : 's'}`;
  return r.counted === r.contested
    ? `Both shares are over all ${seats(r.contested)}.`
    : `Vote share is of the votes polled in the ${seats(r.counted)} with candidate counts; seat share is of all ${IN.format(r.contested)}.`;
}

/** Whether any party's vote share is known: the plot's one precondition, and the page's test for its pale bars. */
export function anyVoteShare(rows: readonly VoteSeatEfficiency[]): boolean {
  return rows.some((r) => r.votePct !== null);
}

function vsLabel(rows: readonly VoteSeatEfficiency[]): string {
  const parts = rows
    .slice(0, 5)
    .map(
      (r) =>
        `${r.party.label} ${(r.votePct as number).toFixed(1)}% of the vote and ${r.seatPct.toFixed(1)}% of the seats`,
    );
  return `Vote share against seat share. ${parts.join('; ')}. A party on the diagonal won seats in proportion to its votes.`;
}

/* ───────────────────────────── the flip matrix ───────────────────────────── */

/**
 * Where did the winner's gain come from? — the question a flip COUNT cannot answer.
 *
 * "115 of 223 seats changed hands" is one number. This is the breakdown that number hides, and it did not
 * exist in any form until `seat_flips.pairs`: Karnataka 2023 is 53 seats BJP→INC, 22 JD(S)→INC and 17
 * INC→BJP, which is a different story from a net swing.
 *
 * A ROW OF BARS, NOT A GRID. A true from×to matrix of 43 parties is 1,849 cells of which 13 are non-zero —
 * mostly empty space with the finding hidden in it. Sorted pairs put the largest movement first and read at
 * any width, which is also what makes it work on a phone.
 *
 * THE EIGHT LARGEST ARE THE ROWS, and the rest are one line that counts them, so the rows plus that line add up to the seats
 * that changed hands. THE PARTY THAT GAINED THE SEATS IS THE LINK, to its seats on the map in flips mode; the party that lost
 * them is named and is not one, because the party isolation is the winner's and a link on the loser lit the seats it still
 * holds and none of the ones it lost.
 */
export function FlipMatrix({
  pairs,
  hrefFor,
}: {
  pairs: readonly { from: { key: string; label: string }; to: { key: string; label: string }; count: number }[];
  hrefFor: (party: string | null) => string;
}) {
  // No pair is a list with no items, which a screen reader announces as an empty list.
  if (pairs.length === 0) {
    return <Nothing>No seat changed hands, so there is no movement between parties to draw.</Nothing>;
  }
  const top = pairs.slice(0, 8);
  const rest = pairs.slice(8);
  const peak = Math.max(...top.map((p) => p.count), 1);
  const folded = rest.reduce((n, p) => n + p.count, 0);
  return (
    <ul className="iei-flipmx" aria-label="Seats that changed hands, by the party that lost them and the party that won them">
      {top.map((p) => (
        <li key={`${p.from.key}>${p.to.key}`}>
          <span className="iei-flipmx-pair">
            <span className="iei-sw" style={{ background: fillFor(p.from.key) }} aria-hidden="true" />
            {p.from.label}
            <span className="iei-flipmx-arrow" aria-hidden="true">
              →
            </span>
            <span className="iei-sw" style={{ background: fillFor(p.to.key) }} aria-hidden="true" />
            <Link className="iei-body-link" href={hrefFor(p.to.key)}>{p.to.label}</Link>
          </span>
          <span className="iei-flipmx-bar" aria-hidden="true">
            <span style={{ width: `${(p.count / peak) * 100}%`, background: fillFor(p.to.key) }} />
          </span>
          <b>{p.count}</b>
        </li>
      ))}
      {rest.length === 0 ? null : (
        <li className="iei-arc-rest">
          + {IN.format(rest.length)} smaller {rest.length === 1 ? 'move' : 'moves'} · {IN.format(folded)} seat{folded === 1 ? '' : 's'}
        </li>
      )}
    </ul>
  );
}

/* ───────────────────────────── competitiveness, as five bands ───────────────────────────── */

/**
 * How many seats were close — as a segmented bar of five bands a reader already thinks in.
 *
 * WHY NOT THE HISTOGRAM HERE. The election page's 21 uniform bins show the SHAPE of a distribution, which is
 * the right instrument for 543 seats. A state has 224, or 87, or 32; at that size the shape is noise and the
 * question is blunter — how many seats are actually in play. So this is a filter with five rungs, and the
 * width of a segment encodes HOW MANY SEATS fall in it, never how wide the band is. That is why it is a
 * stacked bar and not a histogram: the bands are deliberately unequal (under 1%, 1–2%, 2–5%, 5–10%, safe)
 * and a histogram of unequal bins lies about area.
 *
 * Every segment is a link that isolates its seats on the map (or in the seat list where there is no map), so "11 seats under a point" becomes "and here
 * they are".
 */
export function MarginBands({
  bands,
  selected,
  hrefFor,
}: {
  bands: readonly { key: string; label: string; n: number }[];
  selected: string | null;
  hrefFor: (band: string | null) => string;
}) {
  const total = bands.reduce((t, b) => t + b.n, 0);
  if (total === 0) return <Nothing>No seat has a known margin over votes polled, so there are no bands to draw.</Nothing>;
  return (
    <div className="iei-bands">
      <div className="iei-bands-bar" role="group" aria-label={bandLabel(bands, total)}>
        {bands.map((b, i) => {
          if (b.n === 0) return null;
          const on = selected === b.key;
          // The map's ramp, brightest at the knife edge, so a band and the seats it selects agree by
          // construction. Index 0 is the tightest band and takes the loudest step.
          const ink = SEQUENTIAL[Math.max(0, SEQUENTIAL.length - 1 - i)] as string;
          return (
            <Link
              key={b.key}
              href={hrefFor(on ? null : b.key)}
              className={selected === null ? undefined : on ? 'iei-legend-on' : 'iei-legend-off'}
              style={{ flexGrow: b.n, background: ink }}
              title={`${b.n} seat${b.n === 1 ? '' : 's'} decided by ${b.label}`}
              aria-current={on ? 'true' : undefined}
            >
              <span className="iei-sr">
                {b.n} seats, {b.label}
              </span>
            </Link>
          );
        })}
      </div>
      <ul className="iei-bands-key">
        {bands.map((b, i) => (
          <li key={b.key}>
            <Link
              href={hrefFor(selected === b.key ? null : b.key)}
              className={selected === null ? undefined : selected === b.key ? 'iei-legend-on' : 'iei-legend-off'}
            >
              <span
                className="iei-sw"
                style={{ background: SEQUENTIAL[Math.max(0, SEQUENTIAL.length - 1 - i)] as string }}
                aria-hidden="true"
              />
              {b.label}
              <b>{b.n}</b>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function bandLabel(bands: readonly { label: string; n: number }[], total: number): string {
  return `Winning margins across ${total} ${total === 1 ? 'seat' : 'seats'}: ${bands
    .filter((b) => b.n > 0)
    .map((b) => `${b.n} decided by ${b.label}`)
    .join('; ')}.`;
}

/* ───────────────────────────── the state's trajectory ───────────────────────────── */

/**
 * What each party has done, election after election — and BROKEN wherever the map was redrawn.
 *
 * THE BREAK IS THE POINT. A continuous line across a delimitation asserts that the seats either side are the
 * same seats. They are not: every order renumbers from scratch and `place_crosswalk` is empty, so Karnataka's
 * 224 seats in 2008 are not the 224 territories of 2004. This splits the series at every epoch change
 * and draws each run separately, with a marked gap. A reader can still see the whole run; what they
 * cannot do is read across the break as though nothing happened.
 *
 * SEATS BREAK, VOTE SHARE DOES NOT, and the asymmetry is deliberate: a share is a ratio over a whole state's
 * votes, and a state's electorate is a real population whatever the boundaries inside it.
 *
 * Small multiples rather than one crowded chart: six parties on one axis is a spaghetti plot, and the
 * question is "what did THIS party do", which is a row.
 */
export function Trajectory({
  data,
  metric,
  hrefFor,
  selected,
  isolable,
}: {
  data: {
    elections: readonly { id: string; year: number; epochId: string }[];
    parties: readonly {
      key: string;
      label: string;
      points: readonly { year: number; epochId: string; seats: number; seatPct: number | null; votePct: number | null }[];
    }[];
    epochBreaks: readonly { afterYear: number }[];
  };
  /** `seatPct` breaks at an epoch change; `votePct` runs unbroken. */
  metric: 'seatPct' | 'votePct';
  hrefFor: (party: string | null) => string;
  selected: string | null;
  /** The parties the page can isolate on this election's map. A row for any other is not a link. Every row is one if omitted. */
  isolable?: ReadonlySet<string>;
}) {
  const years = data.elections.map((e) => e.year);
  // NOTHING TO DRAW IS A SENTENCE, NOT AN AXIS. Without two elections there is no run; without a party there are
  // no rows (the axis footer would be printed under nothing); and without one known figure every row would be an
  // empty strip beside a dash.
  if (years.length < 2) return <Nothing>Fewer than two elections are on record, so there is no run to draw.</Nothing>;
  if (data.parties.length === 0) {
    return <Nothing>No party has a long enough record across these elections to draw a run.</Nothing>;
  }
  if (!data.parties.some((p) => p.points.some((pt) => (metric === 'seatPct' ? pt.seatPct : pt.votePct) !== null))) {
    return (
      <Nothing>
        {metric === 'seatPct'
          ? 'No seat counts are on record for these elections, so there is no seat share to draw.'
          : 'No candidate vote counts were published for these elections, so there is no vote share to draw.'}
      </Nothing>
    );
  }
  const minY = Math.min(...years);
  const maxY = Math.max(...years);
  const W = 320;
  const H = 40;
  const x = (yr: number) => ((yr - minY) / (maxY - minY || 1)) * W;
  /**
   * THE Y AXIS IS THE DATA'S RANGE, NOT 0–100, and that one line is why these read as flat.
   *
   * The domain used to be a hardcoded 0–100%. Karnataka's INC went from 65 seats to 135 — a 31-point move in
   * seat share, the largest swing in the chart — and 31 of 100 units inside a 26px band is EIGHT PIXELS of
   * travel. Every party's line was a nearly-horizontal scribble, so the figure showed direction and refused
   * to show magnitude, which is the one thing a trajectory is for.
   *
   * ONE domain across every row, computed from every point drawn. Shared because these are small multiples:
   * the comparison between rows is the whole reason they are stacked, and a per-row axis would make a
   * one-seat party's wobble as tall as a governing party's landslide. Rounded up to a multiple of ten so the
   * number printed on the axis is one a reader can hold, and floored at 10 so a state where nobody clears
   * 4% does not amplify noise to full height.
   */
  const top = Math.max(
    10,
    Math.ceil(
      Math.max(
        ...data.parties.flatMap((p) =>
          p.points.map((pt) => (metric === 'seatPct' ? pt.seatPct : pt.votePct) ?? 0),
        ),
        0,
      ) / 10,
    ) * 10,
  );
  const y = (v: number) => H - (Math.min(v, top) / top) * H;

  return (
    <div className="iei-traj">
      {data.parties.map((p) => {
        const on = selected === p.key;
        const dim = selected !== null && !on;
        // Vote share is comparable across a redraw, so it is one run. Seat share is not, so it is split.
        const runs: (typeof p.points)[] =
          metric === 'votePct'
            ? [p.points]
            : p.points.reduce<(typeof p.points)[]>((acc, pt) => {
                const last = acc.at(-1);
                const prev = last?.at(-1);
                if (last === undefined || (prev !== undefined && prev.epochId !== pt.epochId)) acc.push([pt]);
                else (last as typeof pt[]).push(pt);
                return acc;
              }, []);
        /**
         * THE VALUE COLUMN SHOWS THE MOST RECENT ONE THAT EXISTS, not the most recent point.
         *
         * West Bengal's vote-share column rendered a dash for all six parties, because it read the LAST
         * point and 2026 published no vote counts. Six dashes is not a reading — the 2021 shares are on
         * record and are what a reader came for. So the column falls back to the newest point that has a
         * figure, and the year is printed with it whenever that is not the latest election, because a
         * share from a different election is a different fact and has to say so.
         */
        const latest = p.points.at(-1);
        const value = [...p.points].reverse().find((pt) => (metric === 'seatPct' ? pt.seatPct : pt.votePct) !== null);
        const stale = value !== undefined && latest !== undefined && value.year !== latest.year;
        const body = (
          <>
            <span className="iei-traj-name">
              <span className="iei-sw" style={{ background: fillFor(p.key) }} aria-hidden="true" />
              {p.label}
            </span>
            <svg
              viewBox={`0 -4 ${W} ${H + 8}`}
              className="iei-traj-svg"
              role="img"
              aria-label={trajLabel(p, metric)}
              preserveAspectRatio="none"
              opacity={dim ? 0.35 : 1}
            >
              {runs.map((run, ri) => {
                const pts = run
                  .map((pt) => {
                    const v = metric === 'seatPct' ? pt.seatPct : pt.votePct;
                    return v === null ? null : `${x(pt.year).toFixed(1)},${y(v).toFixed(1)}`;
                  })
                  .filter((s): s is string => s !== null);
                if (pts.length === 0) return null;
                if (pts.length === 1) {
                  return (
                    <circle key={ri} cx={Number(pts[0]?.split(',')[0])} cy={Number(pts[0]?.split(',')[1])} r={1.6} fill={fillFor(p.key)} />
                  );
                }
                /**
                 * SEATS ARE FILLED, VOTE SHARE IS A LINE — and the difference is not decoration.
                 *
                 * A seat count is an extent: a party holds this much of the house, and area is how a reader
                 * reads "how much" at 44px without needing an axis. Vote share is a ratio moving over time,
                 * which is a line. So the two metrics are now distinguishable at a glance instead of being
                 * the same mark twice, and the filled one carries magnitude that the line only implies.
                 */
                const first = pts[0]?.split(',')[0] ?? '0';
                const last = pts.at(-1)?.split(',')[0] ?? '0';
                return (
                  <g key={ri}>
                    {metric === 'seatPct' ? (
                      <polygon
                        points={`${first},${H} ${pts.join(' ')} ${last},${H}`}
                        fill={fillFor(p.key)}
                        opacity={0.28}
                      />
                    ) : null}
                    <polyline points={pts.join(' ')} fill="none" stroke={fillFor(p.key)} strokeWidth={1.6} />
                  </g>
                );
              })}
            </svg>
            <span className="iei-traj-now">
              {metric === 'seatPct'
                ? latest === undefined
                  ? '—'
                  : latest.seats
                : value?.votePct == null
                  ? '—'
                  : `${value.votePct.toFixed(0)}%`}
              {stale && metric === 'votePct' ? <span className="iei-traj-asof"> {value?.year}</span> : null}
            </span>
          </>
        );
        // A PARTY THE PAGE CANNOT ISOLATE IS NOT A LINK. Its row followed `?party=…#map` to a page that does not offer it for this
        // election (the party won no seat in it, and was neither a runner-up nor 1% of the vote), which dropped it and reloaded
        // the page at the map with nothing isolated.
        return isolable !== undefined && !isolable.has(p.key) ? (
          <div key={p.key} className="iei-traj-row" title="Won no seat in this election">
            {body}
          </div>
        ) : (
          <Link key={p.key} href={hrefFor(on ? null : p.key)} className="iei-traj-row" aria-current={on ? 'true' : undefined}>
            {body}
          </Link>
        );
      })}
      <div className="iei-traj-axis" aria-hidden="true">
        {/* THE DOMAIN, PRINTED. A height with no stated scale is a shape, not a measurement — and every row
            shares this one, so it is said once rather than per row. */}
        <span>
          {minY} · full height = {top}% of {metric === 'seatPct' ? 'seats' : 'votes polled'}
        </span>
        {data.epochBreaks.length === 0 ? null : (
          <span className="iei-traj-break">
            {data.epochBreaks.length === 1 ? 'boundaries redrawn once' : `boundaries redrawn ${data.epochBreaks.length} times`}
            {metric === 'seatPct' ? ' — seat lines break there' : ''}
          </span>
        )}
        <span>{maxY}</span>
      </div>
    </div>
  );
}

function trajLabel(
  p: { label: string; points: readonly { year: number; seats: number; votePct: number | null }[] },
  metric: 'seatPct' | 'votePct',
): string {
  const parts = p.points
    .filter((pt) => (metric === 'seatPct' ? pt.seats > 0 : pt.votePct !== null))
    .map((pt) => (metric === 'seatPct' ? `${pt.year}: ${pt.seats}` : `${pt.year}: ${pt.votePct?.toFixed(1)}%`));
  return `${p.label}, ${metric === 'seatPct' ? 'seats' : 'vote share'} by election. ${parts.join('; ') || 'no seats won'}.`;
}

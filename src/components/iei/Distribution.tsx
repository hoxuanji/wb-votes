import Link from 'next/link';
import { fillFor } from '../../../packages/mandate/src/viz/party-ink.ts';
import { SEQUENTIAL } from '../../../packages/mandate/src/repo/home.ts';
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

/* ───────────────────────────── the margin distribution ───────────────────────────── */

/**
 * How competitive was this election? — 543 margins as a shape rather than as a list of five.
 *
 * WHY IT EXISTS. The registry can compute a margin for 63,334 of 64,021 contests, from rank-1 and rank-2 vote
 * counts. Every surface in this product showed the five smallest. The five smallest cannot tell you whether
 * an election was close everywhere or a landslide with five accidents, and that is the question.
 *
 * INTERACTION IS THE POINT, not an ornament: each bar is a link that isolates its own seats on the map above.
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
}: {
  bins: readonly MarginBin[];
  /** The bin currently isolating the map, or null. */
  selected: number | null;
  hrefFor: (bin: number | null) => string;
  /** Seats with a computable margin, for the accessible summary. */
  total: number;
}) {
  const peak = Math.max(peakBin(bins), 1);
  const W = 100;
  const H = 34;
  const slot = W / bins.length;
  const gap = slot * 0.16;

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
        role="img"
        aria-label={distLabel(bins, total)}
        preserveAspectRatio="none"
      >
        {bins.map((b, i) => {
          const h = (b.n / peak) * H;
          const on = selected === b.lo;
          // The ramp is the map's ramp, brightest at the knife edge, so a bar and the seats it selects are the
          // same colour by construction rather than by coincidence.
          const t = Math.min(1, b.lo / 30);
          const ink = SEQUENTIAL[Math.min(SEQUENTIAL.length - 1, Math.floor((1 - t) * SEQUENTIAL.length))] as string;
          return (
            <Link key={b.lo} href={hrefFor(on ? null : b.lo)}>
              <g opacity={selected === null || on ? 1 : 0.35}>
                {/* A full-height hit area, so a bar with two seats in it is still clickable. */}
                <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
                <rect
                  x={i * slot + gap / 2}
                  y={H - h}
                  width={slot - gap}
                  height={Math.max(h, b.n > 0 ? 0.6 : 0)}
                  fill={ink}
                  stroke={on ? 'var(--iei-ink)' : 'none'}
                  strokeWidth={on ? 0.5 : 0}
                />
                <title>
                  {b.overflow ? `${b.lo}% and wider` : `${b.lo}–${b.hi}%`} — {b.n} seat{b.n === 1 ? '' : 's'}
                </title>
              </g>
            </Link>
          );
        })}
      </svg>
      {/* Three ticks, not twenty-one. The axis makes the shape readable; it is not itself read. */}
      <div className="iei-dist-axis" aria-hidden="true">
        <span>0%</span>
        <span>20%</span>
        <span>40%+</span>
      </div>
      <figcaption>
        {selected === null ? (
          <>Margin over votes polled. Select a bar to find those seats on the map.</>
        ) : (
          <>
            Showing seats decided by {selected}–{selected + 2}%.{' '}
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
    `Distribution of winning margins across ${IN.format(total)} seats. ` +
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
 * Each marker is a link that isolates that party on the map, so "BJP converts votes to seats well" leads
 * straight to "and here is where".
 */
export function VoteSeatPlot({
  rows,
  selected,
  hrefFor,
  max = 60,
}: {
  rows: readonly VoteSeatEfficiency[];
  selected: string | null;
  hrefFor: (party: string | null) => string;
  /** The axis ceiling. Both axes share it, or the diagonal would not mean parity. */
  max?: number;
}) {
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

  return (
    <figure className="iei-fig iei-vs">
      <svg viewBox={`0 0 ${S} ${S}`} role="img" aria-label={vsLabel(shown)}>
        {/* PARITY, as a line. Everything in this figure is read against it. */}
        <line x1={x(0)} y1={y(0)} x2={x(ceiling)} y2={y(ceiling)} className="iei-vs-parity" />
        {/* Below the diagonal and inset, because the leading party's marker lands ON the line's top end and
            the two collided. */}
        <text
          x={x(ceiling) - 10}
          y={y(ceiling) + 26}
          className="iei-vs-note"
          textAnchor="end"
        >
          seats = votes
        </text>

        {/* Axes, minimal: two lines and two labels. */}
        <g className="iei-vs-axis" aria-hidden="true">
          <line x1={pad} y1={S - pad} x2={S - pad} y2={S - pad} />
          <line x1={pad} y1={pad} x2={pad} y2={S - pad} />
          <text x={S - pad} y={S - pad + 22} textAnchor="end">
            vote share →
          </text>
          <text
            x={pad - 12}
            y={S - pad}
            transform={`rotate(-90 ${pad - 12} ${S - pad})`}
          >
            seat share →
          </text>
        </g>

        {shown.map((r) => {
          const cx = x(r.votePct as number);
          const cy = y(r.seatPct);
          const on = selected === r.party.key;
          const dim = selected !== null && !on;
          return (
            <Link key={r.party.key} href={hrefFor(on ? null : r.party.key)}>
              <g opacity={dim ? 0.3 : 1}>
                {/* The gap to parity, drawn. The marker says where the party is; this says how far from fair. */}
                <line x1={cx} y1={cy} x2={cx} y2={y(r.votePct as number)} className="iei-vs-gap" />
                <circle cx={cx} cy={cy} r={on ? 7 : 5} fill={fillFor(r.party.key)} className="iei-vs-dot" />
                <text x={cx + 9} y={cy - 6} className="iei-vs-tag">
                  {r.party.label.length > 12 ? `${r.party.label.slice(0, 11)}…` : r.party.label}
                </text>
                <title>
                  {r.party.label}: {(r.votePct as number).toFixed(1)}% of the vote, {r.seatPct.toFixed(1)}% of
                  the seats ({r.seats} of {r.contested}) —{' '}
                  {r.deltaPp === null
                    ? 'no comparison'
                    : `${r.deltaPp > 0 ? '+' : '−'}${Math.abs(r.deltaPp).toFixed(1)} points`}
                </title>
              </g>
            </Link>
          );
        })}
      </svg>
      <figcaption>
        Above the line, a party won a larger share of seats than of votes.{' '}
        {selected === null ? 'Select a party to find its seats on the map.' : <Link href={hrefFor(null)}>Show every party</Link>}
      </figcaption>
    </figure>
  );
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
 */
export function FlipMatrix({
  pairs,
  hrefFor,
}: {
  pairs: readonly { from: { key: string; label: string }; to: { key: string; label: string }; count: number }[];
  hrefFor: (party: string | null) => string;
}) {
  const top = pairs.slice(0, 8);
  const peak = Math.max(...top.map((p) => p.count), 1);
  return (
    <ul className="iei-flipmx" aria-label="Seats that changed hands, by the party that lost them and the party that won them">
      {top.map((p) => (
        <li key={`${p.from.key}>${p.to.key}`}>
          <span className="iei-flipmx-pair">
            <span className="iei-sw" style={{ background: fillFor(p.from.key) }} aria-hidden="true" />
            <Link href={hrefFor(p.from.key)}>{p.from.label}</Link>
            <span className="iei-flipmx-arrow" aria-hidden="true">
              →
            </span>
            <span className="iei-sw" style={{ background: fillFor(p.to.key) }} aria-hidden="true" />
            <Link href={hrefFor(p.to.key)}>{p.to.label}</Link>
          </span>
          <span className="iei-flipmx-bar" aria-hidden="true">
            <span style={{ width: `${(p.count / peak) * 100}%`, background: fillFor(p.to.key) }} />
          </span>
          <b>{p.count}</b>
        </li>
      ))}
    </ul>
  );
}

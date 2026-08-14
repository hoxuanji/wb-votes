import Link from 'next/link';
import { fillFor } from '../../../packages/mandate/src/viz/party-ink.ts';
import { SEQUENTIAL } from '../../../packages/mandate/src/repo/home.ts';
import { spread } from '../../../packages/mandate/src/viz/marks.ts';
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
                {/* ONE TEXT NODE. An SVG <title> built from several JSX children arrives as an array, and a
                    browser renders the whole array — markup, comment nodes and all — as the tooltip text,
                    then hydration mismatches. React warns about it; the fix is to interpolate first. */}
                <title>{`${b.overflow ? `${b.lo}% and wider` : `${b.lo}–${b.hi}%`} — ${b.n} seat${b.n === 1 ? '' : 's'}`}</title>
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

  /**
   * Label baselines, pushed apart so two clustered parties do not print over each other.
   *
   * `spread()` is the mechanism the line charts already use for exactly this — it takes the ideal
   * baselines and returns ones at least `gap` apart, in the input's index order. Small parties bunch near
   * the origin (Karnataka 2023 puts four inside six points of vote share), and without this their names
   * overlapped into an unreadable stack.
   *
   * Sorted by y before spreading is NOT needed — `spread` sorts internally and un-sorts on the way out —
   * but the labels must be drawn in the SAME index order as `shown`, which is why the array is indexed
   * rather than zipped.
   */
  const labelY = spread(
    shown.map((r) => y(r.seatPct) - 6),
    15,
  );

  return (
    <figure className="iei-fig iei-vs">
      <svg viewBox={`0 0 ${S} ${S}`} role="img" aria-label={vsLabel(shown)}>
        {/* PARITY, as a line. Everything in this figure is read against it.
            NO LABEL ON IT: the caption below already says what the line means, and the leading party's
            marker lands exactly on its top end — so an in-plot label was both a duplicate and a collision.
            Deleting it fixes the overlap and removes a sentence the reader was told twice. */}
        <line x1={x(0)} y1={y(0)} x2={x(ceiling)} y2={y(ceiling)} className="iei-vs-parity" />

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

        {shown.map((r, i) => {
          const cx = x(r.votePct as number);
          const cy = y(r.seatPct);
          const ly = labelY[i] as number;
          const on = selected === r.party.key;
          const dim = selected !== null && !on;
          return (
            <Link key={r.party.key} href={hrefFor(on ? null : r.party.key)}>
              <g opacity={dim ? 0.3 : 1}>
                {/* The gap to parity, drawn. The marker says where the party is; this says how far from fair. */}
                <line x1={cx} y1={cy} x2={cx} y2={y(r.votePct as number)} className="iei-vs-gap" />
                {/* A LEADER LINE, only where the label had to move. Without it a pushed label looks like it
                    belongs to whichever marker it drifted next to. */}
                {Math.abs(ly - (cy - 6)) < 1.5 ? null : (
                  <line x1={cx + 6} y1={cy} x2={cx + 9} y2={ly - 3} className="iei-vs-lead" />
                )}
                <circle cx={cx} cy={cy} r={on ? 7 : 5} fill={fillFor(r.party.key)} className="iei-vs-dot" />
                <text x={cx + 9} y={ly} className="iei-vs-tag">
                  {r.party.label.length > 12 ? `${r.party.label.slice(0, 11)}…` : r.party.label}
                </text>
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
 * Every segment is a link that isolates its seats on the map, so "11 seats under a point" becomes "and here
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
  if (total === 0) return null;
  return (
    <div className="iei-bands">
      <div className="iei-bands-bar" role="img" aria-label={bandLabel(bands, total)}>
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
              aria-pressed={on}
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
  return `Winning margins across ${total} seats: ${bands
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
 * 224 seats in 2008 are not the 224 territories of 2004. `segments()` splits the series at every epoch change
 * and this draws each run separately, with a marked gap. A reader can still see the whole run; what they
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
}) {
  const years = data.elections.map((e) => e.year);
  if (years.length < 2) return null;
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
        const latest = p.points.at(-1);
        return (
          <Link key={p.key} href={hrefFor(on ? null : p.key)} className="iei-traj-row" aria-pressed={on}>
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
                : latest?.votePct == null
                  ? '—'
                  : `${latest.votePct.toFixed(0)}%`}
            </span>
          </Link>
        );
      })}
      <div className="iei-traj-axis" aria-hidden="true">
        {/* THE DOMAIN, PRINTED. A height with no stated scale is a shape, not a measurement — and every row
            shares this one, so it is said once rather than per row. */}
        <span>
          {minY} · full height = {top}% of {metric === 'seatPct' ? 'seats' : 'votes'}
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

import Link from 'next/link';
import { INDIA_SHAPES } from '../../lib/india-geo.ts';
import { fillFor, NOT_HELD } from '../../../packages/mandate/src/viz/party-ink.ts';
import { NATIONAL, simplified } from '../../../packages/mandate/src/viz/simplify.ts';
import { bandOf, frameOf } from '../../../packages/mandate/src/repo/election-map.ts';
import { SEQUENTIAL } from '../../../packages/mandate/src/repo/home.ts';
import type { ElectionMapView, ElectionSeat } from '../../../packages/mandate/src/repo/election-map.ts';

/**
 * The election map: one polygon per constituency, and four ways of reading the same 500 shapes.
 *
 * ── ONE MAP, FOUR ENCODINGS, ONE RENDERED AT A TIME ──
 *
 * WINNERS   fill is the winning party.                     "Who won each seat?"
 * FLIPS     fill is the GAINING party where a seat changed hands; a hold is the canvas; a seat whose
 *           boundary was redrawn is neither and is drawn as absent.  "Where did power move?"
 * MARGIN    fill is a sequential ramp, BRIGHTEST at the knife edge — the tight seats are the signal, so
 *           they are the loud ones.                        "How close was it?"
 * RUNNER-UP fill is the party that came second.            "Who is next, and where?"
 *
 * The modes are not layers. Only the selected one is in the markup, because four encodings of 492 polygons
 * is four times the bytes for three pictures nobody is looking at. Mode is URL state, so a reading is
 * shareable and costs no client JavaScript.
 *
 * ── WHY THE ACCESSIBLE TEXT IS SHORT ──
 *
 * The first version of this map carried the whole hover card twice per seat: once in `<title>` and again in
 * `aria-label` on the anchor. 492 seats of that is about 150 KB of duplicated prose, and it is the reason the
 * front page measured 934 KB against a 340 KB budget. A native `<title>` is what a mouse tooltip and a screen
 * reader BOTH read, so the second copy bought nothing. What is here now is one concise line per seat, and the
 * FULL result lives once, in the linked list beside the map — which is the accessible representation of the
 * whole figure rather than 492 repetitions of it.
 *
 * ── WHAT IS DRAWN, IN ORDER ──
 *
 *   1. the country in the canvas ink, so an undrawable seat reads as a gap in India and not in the page
 *   2. the seats that did not vote, for a partial election — geography, never a result
 *   3. the focused district's silhouette, under the fills so they mask everything but its outer edge
 *   4. the seats, in the active encoding
 *   5. state borders on top, so the country stays legible through 492 small polygons
 *
 * No per-seat labels: 492 abbreviations at 9 px is a wall of text. Colour is never the only channel, because
 * every seat carries its result in a hover card and in the list beside the map.
 */

export type MapMode = 'winners' | 'flips' | 'margin' | 'runnerup';

export const MODES: readonly { key: MapMode; label: string; question: string }[] = [
  { key: 'winners', label: 'Winners', question: 'Which party won each seat?' },
  { key: 'flips', label: 'Flips', question: 'Where did power change hands?' },
  { key: 'margin', label: 'Margin', question: 'How close was each seat?' },
  { key: 'runnerup', label: 'Runner-up', question: 'Who came second, and where?' },
];

export function isMode(v: string | undefined): v is MapMode {
  return MODES.some((m) => m.key === v);
}

const IN = new Intl.NumberFormat('en-IN');

/** One decimal, and a real-but-small value never rounds away to nothing. */
function pct(v: number | null): string {
  if (v === null) return '—';
  if (v !== 0 && Number(v.toFixed(1)) === 0) return '<0.1%';
  return `${v.toFixed(1)}%`;
}

/**
 * The margin ramp: BRIGHTEST at the knife edge.
 *
 * Inverted deliberately, and it is the same argument `home.ts` makes for its own margin layer — a knife-edge
 * seat is the finding, so it has to be the loud mark. On a near-black surface the loud end of a sequential
 * ramp is its LIGHTEST step, not its darkest, so a tight seat gets `SEQUENTIAL`'s last entry and a safe seat
 * recedes into the canvas.
 */
function marginFill(marginPct: number | null): string {
  if (marginPct === null) return NOT_HELD;
  const t = Math.min(1, marginPct / 30);
  const i = Math.min(SEQUENTIAL.length - 1, Math.floor((1 - t) * SEQUENTIAL.length));
  return SEQUENTIAL[i] as string;
}

/** The fill for one seat under one encoding, and the reason it is that colour. */
function inkOf(s: ElectionSeat, mode: MapMode): string {
  switch (mode) {
    case 'winners':
      return s.partyKey === null ? NOT_HELD : fillFor(s.partyKey);
    case 'runnerup':
      return s.runnerUpKey === null ? NOT_HELD : fillFor(s.runnerUpKey);
    case 'margin':
      return marginFill(s.marginPct);
    case 'flips':
      // A HOLD IS NOT A COLOUR. Only a seat that moved carries the gaining party's ink; a hold is the canvas,
      // and a seat whose boundary was redrawn is drawn as absent because it is neither a hold nor a flip.
      if (!s.comparable || s.flip === null) return NOT_HELD;
      return s.flip.changed && s.partyKey !== null ? fillFor(s.partyKey) : 'var(--iei-raised)';
  }
}

/**
 * The hover card: ONE line, and different per mode, because the mode is the question being asked.
 *
 * Short on purpose. The full result — winner, runner-up, both vote counts, turnout — is in the list beside
 * the map, once.
 */
function titleOf(s: ElectionSeat, mode: MapMode): string {
  const where = s.name.toUpperCase();
  if (s.partyLabel === null) return `${where} — no winner recorded`;
  switch (mode) {
    case 'winners':
      return `${where} — ${s.partyLabel}${s.marginPct === null ? '' : `, ${pct(s.marginPct)}`}`;
    case 'runnerup':
      return s.runnerUpLabel === null
        ? `${where} — no runner-up recorded`
        : `${where} — 2nd: ${s.runnerUpLabel}`;
    case 'margin':
      return `${where} — ${pct(s.marginPct)}${
        s.marginVotes === null ? '' : `, ${IN.format(s.marginVotes)} votes`
      }`;
    case 'flips':
      if (!s.comparable) return `${where} — boundary redrawn, not comparable`;
      if (s.flip === null) return `${where} — no comparison`;
      return s.flip.changed
        ? `${where} — ${s.flip.from.label} to ${s.partyLabel}`
        : `${where} — ${s.partyLabel} held`;
  }
}

function aspectOf(viewBox: string): number {
  const [, , w, h] = viewBox.split(' ').map(Number) as [number, number, number, number];
  return h > 0 ? w / h : 1;
}

/**
 * The basemap, simplified once per process.
 *
 * The 36 state outlines are drawn TWICE on a national frame — once as the canvas under the seats, once as
 * borders over them — and at source detail that is about 114 KB of the page for a shape whose only job is to
 * say "this is India". Through the same simplifier the seats use it is about 35 KB, and at 9 px per
 * constituency nothing about the country's outline is legible enough to miss the difference.
 *
 * Module scope, not per render: the paths never change, so the work belongs to the process.
 */
const BASEMAP: readonly { name: string; path: string }[] = INDIA_SHAPES.map((s) => ({
  name: s.name,
  path: simplified(s.path, NATIONAL),
}));

export function ElectionMap({
  view,
  mode,
  /** A party key whose seats stay saturated while the rest mute. Null highlights nothing. */
  highlight = null,
  /** A margin bin whose seats stay saturated. Set from the histogram, so a bar selects on the map. */
  bin = null,
  /** A named competitiveness band whose seats stay saturated. The state page's coarser equivalent of `bin`. */
  band = null,
  /**
   * A district to REFRAME on. Never drawn: a district elects nobody, and the registry holds outlines for one
   * state only, in another projection. The frame comes from the district's OWN SEATS, which needs no district
   * geometry at all and cannot be out of date with the constituencies.
   */
  district = null,
  /** One seat outlined, set from the list so a row can point at the map. */
  focusSeat = null,
}: {
  view: ElectionMapView;
  mode: MapMode;
  highlight?: string | null;
  bin?: number | null;
  band?: string | null;
  district?: string | null;
  focusSeat?: string | null;
}) {
  const drawable = view.seats.filter((s) => s.path !== null);
  // The country is drawn under the seats only for an UNSCOPED national view. A state-scoped Lok Sabha
  // map is framed to that state, so 35 other states' outlines would be clipped away or, worse, visible.
  const national = view.election?.house === 'pc' && view.scope === null;
  // A district focus reframes to its own seats. Falling back to the whole election when a district has
  // nothing drawable is deliberate: an empty frame would zoom to nothing.
  const inFocus = district === null ? [] : drawable.filter((s) => s.districtId === district);
  // 45% MARGIN ON A DISTRICT, against 4% on a state. A district is being located as much as it is being
  // read, so its neighbours have to be in frame; at the default the viewport held nothing but the district
  // and the reader lost the state. The muting and the silhouette are what single it out — not the crop.
  const viewBox =
    inFocus.length > 0 ? frameOf(inFocus.map((s) => s.path as string), 0.45) : view.geometry.viewBox;
  const aspect = aspectOf(viewBox);

  /**
   * NOTHING TO DRAW IS NOT AN EMPTY MAP.
   *
   * Assam's and Jammu & Kashmir's 2024 parliamentary seats sit under boundaries the registry holds no
   * geometry for, so a scoped view of them has zero polygons. Rendering the figure anyway framed to the
   * whole country — which is what `frameOf([])` falls back to — put an empty outline of India on a page
   * about fourteen Assamese seats. The caller says why instead, and the seat list still carries every result.
   */
  if (drawable.length === 0) return null;

  /**
   * Whether a seat is dimmed by the active selection.
   *
   * ONE PRECEDENCE ORDER, shared with the page's derived subset so the map and the list can never disagree
   * about what is selected: a district narrows first (geographic), then a band or a party filters within it.
   */
  const muted = (s: ElectionSeat): boolean => {
    if (district !== null && s.districtId !== district) return true;
    if (band !== null) return bandOf(s.marginPct) !== band;
    if (bin !== null) return s.marginBin !== bin;
    if (highlight === null) return false;
    return mode === 'runnerup' ? s.runnerUpKey !== highlight : s.partyKey !== highlight;
  };

  return (
    <div className="iei-map-col" style={{ ['--iei-map-w' as string]: `calc(var(--iei-map-h) * ${aspect.toFixed(3)})` }}>
      <figure className="iei-map iei-map-national">
        <svg
          viewBox={viewBox}
          role="img"
          aria-label={`${view.election?.name ?? 'Election'}. ${
            MODES.find((m) => m.key === mode)?.question ?? ''
          } ${drawable.length} of ${view.seats.length} constituencies drawn. The full result for every seat is in the list that follows.`}
          style={{ aspectRatio: aspect }}
        >
          {/* 1 — the country, so a seat with no boundary is a gap in India rather than in the page. Only for
                 a national frame: a state map framed to its own box would draw 35 other states' shapes
                 across the viewport. */}
          {national ? (
            <g className="iei-map-canvas" aria-hidden="true">
              {BASEMAP.map((s) => (
                <path key={s.name} d={s.path} fill={NOT_HELD} />
              ))}
            </g>
          ) : null}

          {/* 2 — THE SEATS THAT DID NOT VOTE, for a partial election.
                 Neutral geography, no fill from any party, no hover card, because they carry no result. A
                 by-election's four contested seats used to float in an empty frame and a reader completed
                 the picture by assuming the emptiness was political. This is the picture. */}
          {view.context.length === 0 ? null : (
            <g className="iei-map-uncontested" aria-hidden="true">
              {view.context.map((c) => (
                <path key={c.versionId} d={c.path} />
              ))}
            </g>
          )}

          {/* 3 — THE FOCUSED DISTRICT'S OUTLINE, under the seats so the fills mask its interior.
                 Concatenating the district's own seat paths and stroking the result gives the union's outer
                 edge for free; the half of the stroke that falls inside gets painted over by step 3. No
                 district geometry is involved, so this can never disagree with the constituencies. */}
          {inFocus.length === 0 ? null : (
            <g className="iei-map-district" aria-hidden="true">
              <path d={inFocus.map((s) => s.path as string).join(' ')} />
            </g>
          )}

          {/* 4 — the seats, in the ACTIVE encoding only. */}
          <g className="iei-map-fills">
            {drawable.map((s) => {
              const shape = (
                <path
                  d={s.path as string}
                  fill={inkOf(s, mode)}
                  opacity={muted(s) ? 0.18 : 1}
                  className={s.placeId === focusSeat ? 'iei-seat-focus' : undefined}
                >
                  <title>{titleOf(s, mode)}</title>
                </path>
              );
              return s.href === null ? (
                <g key={s.versionId}>{shape}</g>
              ) : (
                <Link key={s.versionId} href={s.href}>
                  {shape}
                </Link>
              );
            })}
          </g>

          {/* 5 — state borders last, so the country reads through the seats. NATIONAL ONLY: a state map is
                 framed to its own bounding box, so 35 other states' outlines would be 36 paths clipped
                 entirely out of view, and the state's own shape is already described by its seats. */}
          {national ? (
            <g className="iei-map-borders" aria-hidden="true">
              {BASEMAP.map((s) => (
                <path key={s.name} d={s.path} />
              ))}
            </g>
          ) : null}
        </svg>

        {/* THE ONLY CAPTION: what the map cannot draw, and — in flip mode — what it may not compare. Both are
            facts a reader needs while looking at the polygons; everything else is in the evidence drawer. */}
        <figcaption>
          {drawable.length === view.seats.length ? (
            <>All {view.seats.length} constituencies drawn.</>
          ) : (
            <>
              {drawable.length} of {view.seats.length} drawn — no boundary on record for the other{' '}
              {view.seats.length - drawable.length}.
            </>
          )}
          {mode === 'flips' && view.incomparableSeats > 0 ? (
            <>
              {' '}
              {view.incomparableSeats} redrawn since {view.previous?.year ?? 'the previous election'} and left
              uncoloured — neither held nor flipped.
            </>
          ) : null}
        </figcaption>
      </figure>
    </div>
  );
}

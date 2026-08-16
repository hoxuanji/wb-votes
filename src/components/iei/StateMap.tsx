import Link from 'next/link';
import type { SeatMark, StateMapView } from '../../../packages/mandate/src/repo/state-map.ts';
import { NOT_HELD, fillFor } from '../../../packages/mandate/src/viz/party-ink.ts';
import { anchorOf, labelFits } from '../../../packages/mandate/src/viz/anchors.ts';
import { districtsOf, frame } from '../../lib/india-geo.ts';

/**
 * A state's electoral map: one polygon per constituency, coloured by the party that won it.
 *
 * THIS IS THE OTHER CLAIM. The India map colours a state by its GOVERNMENT — one figure for a whole state,
 * and not a statement about any area inside it. This colours a constituency by ITS OWN result in a named
 * election. Keeping the two apart, and saying which is which in the header, is what the phase is for.
 *
 * ── WHAT IT DRAWS DEPENDS ON WHAT EXISTS, AND IT SAYS WHICH ──
 *
 * The registry holds 4,969 constituency polygons in one projection, across every jurisdiction that holds
 * elections, keyed by the place_version each result was recorded under. So:
 *
 *  · CONSTITUENCY LEVEL, where the registry holds a polygon for the version each result was recorded under.
 *    That is the real electoral map.
 *  · DISTRICT LEVEL otherwise: the state's district outlines, from the 2011 census geometry, drawn NEUTRAL.
 *    Not coloured, because a district does not elect anybody — its constituencies do, and the honest sentence
 *    is "12 of 18 constituencies won by INC", which is what the polygon's title says. Jharkhand is the live
 *    case: DPACO 2008 redrew it and no source describes the result, so its 2019 result has no polygon it may
 *    legally be drawn on.
 *
 * A reader is never shown a coloured polygon whose colour is a guess. Where neither level can be drawn, the
 * component renders nothing and the page says why.
 *
 * ── ZOOM IS A FRAME, NOT A GESTURE ──
 *
 * Selecting a district reframes the `viewBox` to that district's own bounding box. That is the "you are going
 * deeper into the geography" the brief asks for, and because it is URL state it is shareable, survives the
 * back button, and costs no client JavaScript. There is no pan-and-zoom engine here and nothing to hydrate.
 */

/**
 * A label's size is a fraction of the FRAME, not a constant.
 *
 * This is the one thing that breaks when zoom is a viewBox rather than a transform. The map renders into a
 * box of fixed pixel height whatever the viewBox says, so a font size in user units means a different number
 * of pixels at every level: 7 units is 7px across the country and 340px inside Bengaluru Urban. 1/58th of the
 * frame's width renders at about 8px at every level by construction — the same fraction `IndiaMap` uses, so
 * the two maps' labels are the same size as each other.
 *
 * A STROKE WIDTH DOES NOT NEED THIS ANY MORE. Every stroke inside a map is `vector-effect: non-scaling-stroke`
 * (iei.css), so widths are device pixels. That is what fixed the black gridding over Karnataka's 224
 * constituencies: a separator of 0.4 user units was about 1.8px across a state and about 25px inside a framed
 * district. A text size cannot use the same trick, which is why this constant is still here.
 */
const LABEL_FRACTION = 1 / 58;

/**
 * How much MORE room than the glyphs need a polygon must have before it is labelled.
 *
 * `labelFits` alone asks whether the abbreviation physically fits. On a 224-constituency map at 380px that is
 * true of 137 of them, and 137 abbreviations over Karnataka is the wall of text the brief names — "never
 * permanently label every polygon if doing so makes the map noisy". Demanding 1.6× the room turns it into
 * "label the ones with space to spare", and the distribution that falls out is the right one, measured across
 * the registry: Karnataka 21 labels, Delhi 14, Sikkim 25, West Bengal 2, Uttar Pradesh none.
 *
 * A DENSE STATE THEREFORE LABELS ALMOST NOTHING, and that is the honest answer rather than a gap — at 391
 * polygons across 178 units no per-seat label is legible at any size, the winners list beside the map is the
 * key, and framing a district shrinks the frame so the labels come back where they can be read. Colour is
 * never the only channel: every polygon carries its result in a hover card and in the table.
 */
const LABEL_HEADROOM = 1.6;

export function StateMap({
  view,
  /** The party to isolate. Everything else mutes. */
  highlight = null,
  /** The district to frame and label. Null draws the whole state. */
  district = null,
  /** A link to this page with one parameter changed — the component builds no URLs of its own. */
  hrefFor,
}: {
  view: StateMapView;
  highlight?: string | null;
  district?: string | null;
  hrefFor: (change: Record<string, string>) => string;
}) {
  const drawable = view.seats.filter((s) => s.path !== null);
  const constituencies = drawable.length > 0;

  // District outlines come from the geometry asset, joined on the census name. The registry's district places
  // and the 2011 census districts agree on 548 of 726 names; a polygon with no tally behind it is drawn and
  // says so rather than being coloured or dropped. See docs/product/map-validation.md.
  const outlines = constituencies ? [] : districtsOf(view.jurisdictionName);
  if (!constituencies && outlines.length === 0) return null;

  const tallyByName = new Map(view.districts.map((d) => [d.name.toLowerCase(), d]));

  // What to frame. A selected district frames itself; otherwise the whole state.
  const focus = district === null ? null : view.districts.find((d) => d.id === district) ?? null;
  const focusOutline =
    focus === null ? null : outlines.find((o) => o.name.toLowerCase() === focus.name.toLowerCase()) ?? null;
  const inFocus = (s: SeatMark): boolean => focus === null || s.districtId === focus.id;

  // The frame comes from the paths being drawn, whichever level that is — one shape of input, so the two
  // branches cannot disagree about what "the whole state" means.
  //
  // A FOCUS WITH NOTHING DRAWABLE FALLS BACK TO THE STATE, and says so. Some districts' seats are all in
  // the staged list, and framing an empty set left `box` null, which fell through to the whole COUNTRY's
  // viewBox — the one case where a district click could zoom out to India.
  const inFocusDrawable = focus === null ? drawable : drawable.filter(inFocus);
  const unframeable = focus !== null && constituencies && inFocusDrawable.length === 0;
  const framing: readonly { path: string | null }[] = constituencies
    ? unframeable
      ? drawable
      : inFocusDrawable
    : outlines;
  const box = boxOf(framing, focusOutline);
  const viewBox = box === null ? (view.geometry.viewBox ?? '0 0 400 580') : frame(box);
  const labelPx = Math.max(Number(viewBox.split(' ')[2] ?? 600), 1) * LABEL_FRACTION;

  const marks: { x: number; y: number; text: string }[] = [];

  const [, , frameW, frameH] = viewBox.split(' ').map(Number) as [number, number, number, number];
  const aspect = frameH > 0 ? frameW / frameH : 1;

  return (
    // The width a figure of these proportions needs to use the height it is allowed. `--iei-map-h` is a PIXEL
    // token; this used to read `70vh`, which made an `auto` grid track depend on the WINDOW'S HEIGHT — so in a
    // tall viewport the map claimed the whole row and the tally beside it collapsed to nothing. Below the
    // map-split breakpoint the column is full width and this is ignored.
    <div className="iei-map-col" style={{ ['--iei-map-w' as string]: `calc(var(--iei-map-h) * ${aspect.toFixed(3)})` }}>
      <figure className="iei-map iei-map-state">
        <svg
          viewBox={viewBox}
          role="img"
          aria-label={ariaLabel(view, constituencies, focus?.name ?? null)}
          /* The frame's own proportions, so the figure claims the width its shape needs and no more. Every
             state is taller than it is wide, and a column sized by a fraction letterboxed all of them. */
          style={{ aspectRatio: `${viewBox.split(' ')[2]} / ${viewBox.split(' ')[3]}` }}
        >
          {constituencies ? (
            <g className="iei-map-fills">
              {drawable.map((s) => {
                const muted = (highlight !== null && s.partyKey !== highlight) || !inFocus(s);
                const fill = s.partyKey === null ? NOT_HELD : fillFor(s.partyKey);
                // A LABEL WHEREVER ONE FITS, AT EVERY LEVEL — which is the change. Labels used to be drawn
                // only inside a focused district, so a whole-state map of 224 constituencies carried none at
                // all and could be read by colour alone. `labelFits` is what keeps that from becoming a wall
                // of text: it refuses any polygon without room for the abbreviation at the size it is drawn,
                // so a dense state labels its big seats and leaves the rest to the hover card and the table.
                const a = anchorOf(s.path as string);
                if (
                  !muted &&
                  a !== null &&
                  s.partyLabel !== null &&
                  labelFits(a, s.partyLabel.length, labelPx * LABEL_HEADROOM)
                ) {
                  marks.push({ x: a.x, y: a.y, text: s.partyLabel });
                }
                const inner = (
                  <path d={s.path as string} fill={fill} opacity={muted ? 0.18 : 1}>
                    <title>{seatTitle(s)}</title>
                  </path>
                );
                return s.href === null ? (
                  <g key={s.versionId}>{inner}</g>
                ) : (
                  <Link key={s.versionId} href={s.href} aria-label={seatTitle(s)}>
                    {inner}
                  </Link>
                );
              })}
            </g>
          ) : (
            // DISTRICTS, NEUTRAL. The fill is the panel colour, not a party's: a district has no winner, and
            // the tally is in the title where it can be a sentence rather than a colour.
            <g className="iei-map-fills iei-map-neutral">
              {outlines.map((o) => {
                const tally = tallyByName.get(o.name.toLowerCase()) ?? null;
                const muted =
                  (focus !== null && tally?.id !== focus.id) ||
                  (highlight !== null && !(tally?.parties ?? []).some((p) => p.key === highlight));
                const inner = (
                  <path d={o.path} opacity={muted ? 0.35 : 1}>
                    <title>{districtTitle(o.name, tally)}</title>
                  </path>
                );
                return tally === null ? (
                  <g key={o.code || o.name}>{inner}</g>
                ) : (
                  <Link
                    key={o.code || o.name}
                    href={hrefFor({ district: focus?.id === tally.id ? '' : tally.id })}
                    aria-label={districtTitle(o.name, tally)}
                  >
                    {inner}
                  </Link>
                );
              })}
            </g>
          )}
          {marks.length === 0 ? null : (
            // The halo behind the glyphs is in user units too, so it scales with the label or swallows it.
            <g
              className="iei-map-labels"
              aria-hidden="true"
              style={{ ['--iei-label-stroke' as string]: `${(labelPx * 0.32).toFixed(2)}` }}
            >
              {marks.map((l) => (
                <text key={`${l.x}-${l.y}-${l.text}`} x={l.x} y={l.y} fontSize={labelPx.toFixed(2)}>
                  {l.text}
                </text>
              ))}
            </g>
          )}
        </svg>
        <figcaption>
          {/* A FOCUS THAT COULD NOT FRAME ITSELF SAYS SO. The registry's district places come from election
              sources and the polygons are 2011 census districts; they agree on 548 of 726 names. Karnataka's
              "BANGALORE" is "Bengaluru Urban" and "Bengaluru Rural" in the census geometry, so the map cannot
              frame it — and a map that quietly stayed at state level while the heading said BANGALORE would be
              answering a different question from the one it was asked. */}
          {focus !== null && ((focusOutline === null && !constituencies) || unframeable) ? (
            <>
              The map stays at state level: no boundary here can frame <b>{focus.name}</b>
              {unframeable ? ' — every one of its constituencies is in the staged list' : ' under that name'}.
              The tally beside it is still this district&rsquo;s own.{' '}
            </>
          ) : null}
          {/* A COMPLETE MAP SAYS NOTHING HERE. "224 of 224 constituencies drawn" tells a reader nothing they
              can act on; "263 of 294" tells them something real, and that is the case this sentence exists
              for. Printing it either way made an epoch caveat the last word under every map in the product. */}
          {constituencies ? (
            view.geometry.drawable < view.geometry.total ? (
              <>
                {view.geometry.drawable} of {view.geometry.total} constituencies drawn — the registry holds no
                boundary for the rest on the {view.geometry.epochs.join(' and ')} delimitation these results
                were recorded under.
              </>
            ) : null
          ) : (
            <>
              Districts, drawn neutral — a district does not elect anybody. The registry holds no constituency
              boundary for {view.jurisdictionName} on the delimitation this election used, so the seats are a
              table rather than a map.
            </>
          )}
        </figcaption>
      </figure>
    </div>
  );
}

/** The bounding box of whatever paths are being drawn, so the level frames itself. */
function boxOf(
  shapes: readonly { path: string | null }[],
  outline: { box: readonly [number, number, number, number] } | null,
): readonly [number, number, number, number] | null {
  if (outline !== null) return outline.box;
  let a = Infinity;
  let b = Infinity;
  let c = -Infinity;
  let d = -Infinity;
  for (const s of shapes) {
    const path = s.path;
    if (path === null) continue;
    // BOTH SEPARATORS. The geometry asset writes "M12.3 45.6L…" and the registry's own place_geometry rows
    // write "M307.5,108.2L…". A regex that only knew about the space matched nothing in the registry's paths,
    // so every box came back empty and focusing a district silently left the map at state level.
    for (const m of path.matchAll(/(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g)) {
      const x = Number(m[1]);
      const y = Number(m[2]);
      if (x < a) a = x;
      if (x > c) c = x;
      if (y < b) b = y;
      if (y > d) d = y;
    }
  }
  return a === Infinity ? null : [a, b, c - a, d - b];
}

/**
 * The hover card. What won, by how much, and where — and NO provenance.
 *
 * Where the figure came from is in the panel's evidence drawer. A tooltip carrying a source, a document and a
 * retrieval date is the scattering this phase removes.
 */
function seatTitle(s: SeatMark): string {
  const lines = [s.name.toUpperCase()];
  if (s.number !== null) lines[0] += `  no. ${s.number}`;
  lines.push(s.partyLabel === null ? 'no winner recorded' : `${s.partyLabel} won`);
  if (s.winnerName !== null) lines.push(s.winnerName);
  lines.push(
    s.marginVotes === null
      ? 'margin not reported'
      : `margin ${Math.abs(s.marginVotes).toLocaleString('en-IN')}${s.marginPct === null ? '' : ` · ${s.marginPct}%`}`,
  );
  if (s.districtName !== null) lines.push(s.districtName);
  return lines.join('\n');
}

/** A district's card. Counts, plural, and never "won by". */
function districtTitle(name: string, tally: { seats: number; parties: { label: string; n: number }[] } | null): string {
  if (tally === null) return `${name.toUpperCase()}\nnot linked to a district in the registry`;
  return [
    name.toUpperCase(),
    `${tally.seats} constituenc${tally.seats === 1 ? 'y' : 'ies'}`,
    ...tally.parties.slice(0, 4).map((p) => `${p.n} of ${tally.seats} won by ${p.label}`),
  ].join('\n');
}

function ariaLabel(view: StateMapView, constituencies: boolean, focus: string | null): string {
  const what = constituencies
    ? `Constituencies of ${view.jurisdictionName}, coloured by the party that won each one`
    : `Districts of ${view.jurisdictionName}, drawn neutral — each district's constituency tally is in its label`;
  const when = view.election === null ? '' : ` in the ${view.election.year} election`;
  const where = focus === null ? '' : `, framed on ${focus}`;
  return `${what}${when}${where}. ${view.legend.map((l) => `${l.label} ${l.n}`).join('; ')}`;
}

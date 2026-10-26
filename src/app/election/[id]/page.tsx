import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  BIN_WIDTH,
  choicesOf,
  electionMapView,
} from '../../../../packages/mandate/src/repo/election-map.ts';
import { summarise } from '../../../../packages/mandate/src/repo/findings.ts';
import { turnoutCaveat, turnoutHeadline } from '../../../../packages/mandate/src/repo/turnout-trust.ts';
import { scaleLabel, typeLabel } from '../../../../packages/mandate/src/repo/election-context.ts';
import {
  binPhrase,
  closestFirst,
  closestRanked,
  inSeatOrder,
  listHead,
  partyLabelIn,
  partyPhrase,
} from '../../../../packages/mandate/src/repo/seat-list.ts';
import { readSelection, tally } from '../../../../packages/mandate/src/repo/map-selection.ts';
import { electionHref, stateHref } from '../../../../packages/mandate/src/repo/routes.ts';
import { readRegistry } from '../../../../packages/mandate/src/repo/session.ts';
import { bodyWord } from '../../../../packages/mandate/src/core/election-kind.ts';
import { fillFor } from '../../../../packages/mandate/src/viz/party-ink.ts';
import { Foot, Shell } from '../../../components/iei/Shell.tsx';
import { ElectionMap, MODES, MapHead, MapSection, NoMap } from '../../../components/iei/ElectionMap.tsx';
import {
  FlipMatrix,
  MarginDistribution,
  VoteSeatPlot,
} from '../../../components/iei/Distribution.tsx';
import {
  Crumbs,
  DataList,
  DataRow,
  Panel,
  RegistryMissing,
  Tabs,
} from '../../../components/iei/parts.tsx';
import { HousePanel } from '../../../components/iei/SeatArc.tsx';
import { ListHead, RowContest, RowMargin } from '../../../components/iei/SeatList.tsx';
import '../../iei.css';

/**
 * `/election/[id]` — HOW DID THIS ELECTION GO?
 *
 * The product's first visualisation-first surface. Every section here is a figure with a question over it;
 * the only table on the page is the seat list, which is also the map's accessible representation.
 *
 * ── WHY THIS ROUTE EXISTS RATHER THAN A HOMEPAGE PANEL ──
 *
 * The map is 492 polygons and about 430 KB of path data. Wiring it into `/` took the front page from roughly
 * 300 KB of markup to 934 KB, against a 340 KB budget `render.test.ts` enforces on purpose. The choice was
 * between crippling the instrument and giving it a route, and a 430 KB figure is a reasonable thing to
 * download when it IS the page and an unreasonable tax on every visit. So the homepage keeps its state-level
 * map and this route carries the seat-level one.
 *
 * ── ONE MAP, FOUR READINGS, ONE RENDERED ──
 *
 * WINNERS / FLIPS / MARGIN / RUNNER-UP change the ENCODING of the same geometry. Only the selected mode is in
 * the markup: four encodings of 492 polygons would be four times the bytes for three pictures nobody is
 * looking at.
 *
 * ── EVERYTHING CROSS-SELECTS, THROUGH THE URL ──
 *
 *   a histogram bar   -> `?bin=`    isolates those seats on the map
 *   a party marker    -> `?party=`  isolates that party's seats
 *   a flip pair       -> `?party=`  isolates the gaining or losing party
 *
 * All of it is URL state: shareable, back-button-safe, and zero client JavaScript. There is no hydration on
 * this page at all.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ──
 *
 * No coverage panel, no methodology block, no per-figure provenance chip, no registry vocabulary. Sources sit
 * once behind each panel's `ⓘ`. The two places this page DOES state a limit are the two where silence would
 * mislead: seats it cannot draw, and seats it may not compare because the boundary was redrawn.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IN = new Intl.NumberFormat('en-IN');

export default function ElectionPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const read = readRegistry((db) => electionMapView(db, decodeURIComponent(params.id)));
  if (!read.ok) {
    return (
      <Shell here="india">
        <RegistryMissing />
      </Shell>
    );
  }
  const v = read.value;
  // An id that names no election this route serves is a 404, not an empty page.
  if (v.election === null) notFound();

  const e = v.election;
  const ctx = v.ctx;
  // Whether a map is drawn. Every caption below that sends the reader to the map is printed only when it is.
  const mapped = v.geometry.status === 'drawn';

  // WHAT THE READER ASKED FOR, validated by membership against what this election offers, never parsed: a party has to
  // be one this election returned, ran or came second for, and a bin has to be one the distribution actually has. And
  // they are mutually exclusive, which the selection keeps by holding one isolation: two on one map is two answers to
  // one question. Every link on the page is a move of this selection, anchored at the map.
  const sel = readSelection(searchParams, choicesOf(v), { base: electionHref(e.id), anchor: 'map' });
  const mode = sel.mode;
  const party = sel.isolation?.by === 'party' ? sel.isolation.key : null;
  const bin = sel.isolation?.by === 'bin' ? sel.isolation.lo : null;

  const top = v.legend[0];
  const marginTotal = v.seats.filter((s) => s.marginPct !== null).length;
  // The list beside the map: the selection when there is one, the closest contests otherwise. It is the map's
  // accessible representation, which is why the full result lives here and not in 492 hover cards. Each builder returns the
  // order it applied (the closest contests are ranked by margin; a selection is in seat order), and the heading says that.
  // With no margin on any seat there is nothing to rank, and an empty list under 294 seats is no answer: the page lists
  // the first of them in seat order, as the state page does, and the heading says so.
  const list =
    sel.isolation !== null
      ? inSeatOrder(sel.narrow(v.seats), 40)
      : marginTotal > 0
        ? closestRanked(v.seats, 12)
        : closestFirst(v.seats, 12);
  const binned = bin === null ? null : (v.marginBins.find((b) => b.lo === bin) ?? { lo: bin, hi: bin + BIN_WIDTH });
  const head = listHead(
    {
      isolation:
        binned !== null ? binPhrase(binned) : party !== null ? partyPhrase(partyLabelIn(v.seats, party, mode), mode) : null,
      district: null,
    },
    list,
  );
  // What names the map section for a screen reader, and the evidence drawer beside the page's name.
  const mapTitle = `${e.body === 'lok-sabha' ? 'India' : e.jurisdictionName} · ${
    MODES.find((m) => m.key === mode)?.label ?? ''
  }`;

  return (
    <Shell here="india">
      <Crumbs
        trail={[
          { label: 'India', href: '/' },
          ...(e.body === 'assembly'
            ? [{ label: e.jurisdictionName, href: stateHref(e.jurisdictionId) }]
            : []),
          { label: `${bodyWord(e.body)} ${e.year}` },
        ]}
      />

      {/* ── 1 · HEADER. One sentence of result, then the five figures that frame it. Not a tile grid. The page's
             sources share the eyebrow's line, so nothing between this and the map is a heading. ── */}
      <MapHead
        eyebrow={
          /* THE TYPE, FROM ElectionContext. The body alone says "Lok Sabha" for a Lok Sabha by-election, which
             would describe 829 elections as something they are not. */
          ctx === null
            ? null
            : `${ctx.scope === null && ctx.body === 'lok-sabha' ? 'India' : ctx.jurisdictionName} · ${typeLabel(ctx.body, ctx.kind)} · ${ctx.year}`
        }
        sources={v.sources}
        label={mapTitle}
        caveat={
          // The turnout figure this product declines to print. Undefined unless the reading is
          // unverified, so a healthy election shows no caveat at all.
          turnoutCaveat(v.turnout) === null ? undefined : (
            <>
              <b>Turnout — verification pending.</b>{' '}
              {turnoutCaveat(v.turnout)?.join(' ')}
            </>
          )
        }
      >
        <h1 className="iei-answer">
          {top === undefined ? (
            'No winner is on record for this election.'
          ) : /* A BY-ELECTION HAS NO MAJORITY TO REACH, so the sentence is about the seats that were up —
                never "short of a majority", which implies the house was in play. */
          ctx?.kind === 'bypoll' ? (
            <>
              {top.label} won {IN.format(top.n)} of {IN.format(v.seats.length)} seats contested
            </>
          ) : v.majority !== null && top.n >= v.majority ? (
            <>
              {top.label} won {IN.format(top.n)} of {IN.format(e.seats)} seats
            </>
          ) : (
            <>
              {top.label} led on {IN.format(top.n)} of {IN.format(e.seats)}, short of a majority
            </>
          )}
        </h1>
        <p className="iei-sub">
          {ctx === null ? null : scaleLabel(ctx)}
          {/* A reading, not a number — see turnout-trust.ts. An election whose counts nothing can
              reconcile says "verification pending" here rather than asserting a figure. */}
          {turnoutHeadline(v.turnout) === null ? null : <> · {turnoutHeadline(v.turnout)}</>}
          {v.flips === null ? null : <> · {IN.format(v.flips.flipped)} seats changed hands</>}
          {v.previous === null ? null : (
            <>
              {' '}
              ·{' '}
              <Link className="iei-body-link" href={electionHref(v.previous.id)}>
                compare {v.previous.year}
              </Link>
            </>
          )}
        </p>
        {/* The parties, as marks rather than as a table. Widths are seat shares, so the bar IS the result. */}
        <ul className="iei-standing" aria-label="Seats won, by party">
          {v.legend.slice(0, 8).map((l) => (
            <li key={l.key}>
              <Link href={sel.href({ party: l.key })}>
                <span className="iei-sw" style={{ background: fillFor(l.key) }} aria-hidden="true" />
                {l.label} <b>{l.n}</b>
              </Link>
            </li>
          ))}
        </ul>
      </MapHead>

      {/* ── 2 and 3 · THE MAP, and the four ways of reading it ── */}
      <MapSection
        title={mapTitle}
        controls={
          <Tabs
            label={mapped ? 'What the map shows' : 'What this page shows'}
            current={mode}
            choices={MODES.map((m) => ({
              key: m.key,
              label: m.label,
              href: sel.href({ mode: m.key }),
              // Flips need a previous election of the same house under the same boundaries.
              available: m.key === 'flips' ? v.flips !== null : true,
            }))}
          />
        }
      >
        {/* WHY THERE IS NO MAP, where there is none, and which of the two reasons it is. */}
        <NoMap view={v} />

        <div className="iei-linked iei-map-split iei-atlas">
          <ElectionMap view={v} selection={sel} />

          <div className="iei-atlas-side">
            {/* WHAT THE MAP ANSWERS. It was the section heading's second half. */}
            <p className="iei-atlas-q">{MODES.find((m) => m.key === mode)?.question ?? ''}</p>
            {/* THE LEGEND CHANGES WITH THE MODE, because the mode changes what a colour means. */}
            {mode === 'margin' ? (
              <p className="iei-note">
                {mapped ? 'Brightest where the margin was smallest. ' : ''}
                {IN.format(marginTotal)} of {IN.format(e.seats)} seats have a computable margin.
              </p>
            ) : mode === 'flips' ? (
              <ul className="iei-legend">
                <li>
                  <span className="iei-sw" style={{ background: 'var(--iei-raised)' }} aria-hidden="true" />
                  Held <b>{v.flips?.held ?? 0}</b>
                </li>
                <li>
                  <span className="iei-sw iei-sw-none" aria-hidden="true" />
                  Not comparable <b>{v.incomparableSeats}</b>
                </li>
                {mapped ? <li className="iei-legend-note">Flipped seats wear the colour of the party that gained them.</li> : null}
              </ul>
            ) : (
              <ul className="iei-legend">
                {(mode === 'runnerup' ? tally(v.seats, 'runnerUp') : v.legend).slice(0, 10).map((l) => (
                  <li key={l.key}>
                    <Link
                      href={sel.href({ party: l.key })}
                      className={party === null ? undefined : party === l.key ? 'iei-legend-on' : 'iei-legend-off'}
                      aria-pressed={party === l.key}
                    >
                      <span className="iei-sw" style={{ background: fillFor(l.key) }} aria-hidden="true" />
                      {l.label}
                      <b>{l.n}</b>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {/* ── 7 · THE LIST. The selection, or the closest contests. Also the map's accessible form, which
                   is why the full result is here once instead of in 492 hover cards. Headed with what it is and how much
                   of it is shown, which is where "12 of 294" is said. ── */}
            <ListHead head={head} />
            <DataList label={head.title} tight>
              {list.seats.map((s) => (
                <DataRow
                  key={s.versionId}
                  title={s.name}
                  href={s.href ?? undefined}
                  aside={<RowMargin seat={s} />}
                  detail={
                    <>
                      <RowContest seat={s} />
                      {turnoutHeadline(s.turnout) === null ? null : <> · {turnoutHeadline(s.turnout)}</>}
                      {e.body === 'lok-sabha' && s.jurisdictionName !== null ? <> · {s.jurisdictionName}</> : null}
                    </>
                  }
                />
              ))}
            </DataList>
          </div>
        </div>
      </MapSection>

      {/* ── 3b · THE HOUSE, as an arc. Only for an election that decides one. ── */}
      <HousePanel seats={v.seats} majority={v.majority} selection={sel} />

      {/* ── 4 · COMPETITIVENESS ── */}
      {marginTotal === 0 ? null : (
        <Panel
          id="margins"
          title="Competitiveness"
          question="Was this election close, or a landslide with a few accidents?"
        >
          <MarginDistribution
            bins={v.marginBins}
            selected={bin}
            total={marginTotal}
            hrefFor={(b) => (b === null ? sel.href('release') : sel.href({ bin: b }))}
            mapped={mapped}
          />
        </Panel>
      )}

      {/* ── 5 · VOTE → SEATS ── */}
      {v.voteSeat.length === 0 ? null : (
        <Panel
          id="votes"
          title="How the vote became seats"
          question="Which parties won more seats than their votes alone would give them?"
        >
          <VoteSeatPlot
            rows={v.voteSeat}
            selected={party}
            hrefFor={(p) => (p === null ? sel.href('release') : sel.href({ party: p }))}
            mapped={mapped}
          />
        </Panel>
      )}

      {/* ── 6 · HOW POWER MOVED. Only where a comparison is legal. ── */}
      {v.flips === null ? (
        v.incomparableSeats === 0 ? null : (
          <Panel id="flips" title="How power moved" question="What changed since the previous election?">
            <p className="iei-absent">
              {summarise({
                type: 'seats_incomparable',
                count: v.incomparableSeats,
                previousYear: v.previous?.year ?? null,
                previousEpochId: null,
                epochId: null,
              })}{' '}
              A seat can only be compared with itself, and these constituencies did not exist in their present
              form at the previous election.
            </p>
          </Panel>
        )
      ) : (
        <Panel
          id="flips"
          title="How power moved"
          question={`Which seats changed hands since ${v.previous?.year ?? 'the previous election'}?`}
        >
          <div className="iei-two">
            <div>
              <ul className="iei-tally" aria-label="Seats held, flipped and not comparable">
                <li>
                  <b>{IN.format(v.flips.flipped)}</b> changed hands
                </li>
                <li>
                  <b>{IN.format(v.flips.held)}</b> held
                </li>
                {v.incomparableSeats === 0 ? null : (
                  <li>
                    <b>{IN.format(v.incomparableSeats)}</b> not comparable
                  </li>
                )}
              </ul>
              {mapped ? (
                <p className="iei-note">
                  <Link href={sel.href({ mode: 'flips' })}>Show this on the map</Link> — flipped seats wear the
                  colour of the party that gained them.
                </p>
              ) : null}
            </div>
            <FlipMatrix
              pairs={v.flips.pairs}
              hrefFor={(p) => (p === null ? sel.href('release') : sel.href({ party: p }, { mode: 'flips' }))}
            />
          </div>
        </Panel>
      )}

      <Foot>
        {v.siblings.length <= 1 ? null : (
          <span className="iei-sibs">
            {v.siblings.slice(0, 12).map((s) => (
              <Link
                key={s.id}
                href={electionHref(s.id)}
                aria-current={s.id === e.id ? 'page' : undefined}
                className={s.id === e.id ? 'iei-legend-on' : undefined}
              >
                {s.year}
              </Link>
            ))}
          </span>
        )}
      </Foot>
    </Shell>
  );
}

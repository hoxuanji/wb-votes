import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  BIN_WIDTH,
  choicesOf,
  electionMapView,
} from '../../../../packages/mandate/src/repo/election-map.ts';
import { summarise } from '../../../../packages/mandate/src/repo/findings.ts';
import { turnoutCaveat, turnoutHeadline } from '../../../../packages/mandate/src/repo/turnout-trust.ts';
import { electionContext, scaleLabel, typeLabel } from '../../../../packages/mandate/src/repo/election-context.ts';
import {
  binPhrase,
  closestFirst,
  closestRanked,
  inSeatOrder,
  listHead,
  partyLabelIn,
  partyPhrase,
} from '../../../../packages/mandate/src/repo/seat-list.ts';
import { offersMode, queryHref, readAsk, readSelection, tally } from '../../../../packages/mandate/src/repo/map-selection.ts';
import { seatFlows } from '../../../../packages/mandate/src/repo/seat-flows.ts';
import { electionHref, stateHref } from '../../../../packages/mandate/src/repo/routes.ts';
import { readRegistry } from '../../../../packages/mandate/src/repo/session.ts';
import { bodyWord } from '../../../../packages/mandate/src/core/election-kind.ts';
import { fillFor } from '../../../../packages/mandate/src/viz/party-ink.ts';
import { Foot, Shell } from '../../../components/iei/Shell.tsx';
import { ElectionMap, MODES, MapHead, MapSection, NO_EARLIER_ELECTION, NoMap, ShapeTabs } from '../../../components/iei/ElectionMap.tsx';
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
import { SeatFlow } from '../../../components/iei/SeatFlow.tsx';
import { ListHead, RowContest, RowMargin } from '../../../components/iei/SeatList.tsx';
import '../../iei.css';

/**
 * `/election/[id]` — HOW DID THIS ELECTION GO?
 *
 * The product's first visualisation-first surface. Every section here is a figure with a question over it.
 * The exact form is a table twin in a `<details>` under the arc and under the flow; the seat list beside the map
 * is a `<ul>`, a slice of the result, and every seat on the map is a link to its own page.
 *
 * ── WHY THIS ROUTE EXISTS RATHER THAN A HOMEPAGE PANEL ──
 *
 * The national Lok Sabha map is up to 492 polygons and about 430 KB of path data. Wiring it into `/` took the
 * front page from roughly 300 KB of markup to 934 KB, against a 340 KB budget `render.test.ts` enforces on
 * purpose. The choice was between crippling the instrument and giving it a route, and a 430 KB figure is a
 * reasonable thing to download when it IS the page and an unreasonable tax on every visit. So the homepage
 * keeps its state-level map and this route carries the seat-level one.
 *
 * ── ONE MAP, FOUR READINGS, ONE RENDERED ──
 *
 * WINNERS / FLIPS / MARGIN / RUNNER-UP change the ENCODING of the same geometry. Only the selected mode is in
 * the markup: four encodings of a map that size would be four times the bytes for three pictures nobody is
 * looking at. A reading no seat can fill (no margin, no runner-up, no earlier election) is not offered.
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
 * once, behind the header's `ⓘ`. The places this page DOES state a limit are the ones where silence would
 * mislead: seats it cannot draw, seats it may not compare because the boundary was redrawn, no earlier election
 * to compare with, and a Lok Sabha of which the registry holds only some of the seats.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IN = new Intl.NumberFormat('en-IN');

/**
 * THE TAB, THE HISTORY ENTRY AND A SCREEN READER'S FIRST WORDS name the election: the answer sentence does not ("TMC won 210
 * of 294 seats"), and without this all five say the site's name. The layout's template adds that. A registry that cannot be
 * read, or an id that names nothing, leaves the layout's title, and the page says why itself.
 */
export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  const read = readRegistry((db) => electionContext(db, decodeURIComponent(params.id)));
  return read.ok && read.value !== null ? { title: read.value.label } : {};
}

/** The parties a capped list left out, said once, so the seats it shows still add up to the seats that were won. */
function More({ rest }: { rest: readonly { n: number }[] }) {
  if (rest.length === 0) return null;
  const seats = rest.reduce((n, l) => n + l.n, 0);
  return (
    <li className="iei-legend-note">
      {`+ ${rest.length} other ${rest.length === 1 ? 'party' : 'parties'} · ${IN.format(seats)} ${seats === 1 ? 'seat' : 'seats'}`}
    </li>
  );
}

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
      <Shell here="election">
        <RegistryMissing />
      </Shell>
    );
  }
  const v = read.value;
  // An id that names no election this route serves is a 404, not an empty page.
  if (v.election === null) notFound();

  const e = v.election;
  const ctx = v.ctx;
  // A by-election decides no house: no majority to reach, no earlier election to be compared with, and no house to be part of.
  const bypoll = ctx?.kind === 'bypoll';
  // Whether a map is drawn. Every caption below that sends the reader to the map is printed only when it is.
  const mapped = v.geometry.status === 'drawn';

  // WHAT THE READER ASKED FOR, validated by membership against what this election offers, never parsed: a party has to
  // be one this election returned, ran or came second for, and a bin has to be one the distribution actually has. And
  // they are mutually exclusive, which the selection keeps by holding one isolation: two on one map is two answers to
  // one question. Every link on the page is a move of this selection, anchored at the map.
  const marginTotal = v.seats.filter((s) => s.marginPct !== null).length;
  // Margin colours by a share of the votes polled and runner-up by the party that came second: an election that published
  // winners and declared margins only has neither, and its map would be one ink under a question nothing answers.
  const choices = { ...choicesOf(v), margin: marginTotal > 0, runnerup: v.seats.some((s) => s.runnerUpKey !== null) };
  const sel = readSelection(searchParams, choices, { base: electionHref(e.id), anchor: 'map' });
  const mode = sel.mode;
  const party = sel.isolation?.by === 'party' ? sel.isolation.key : null;
  const bin = sel.isolation?.by === 'bin' ? sel.isolation.lo : null;
  // A link to another election keeps the mode and the shape and drops every selection, each being a statement about one
  // election: what the state page's `election` move does.
  const ask = readAsk(searchParams);
  const elsewhere = (id: string): string =>
    queryHref(electionHref(id), ask, { party: '', band: '', bin: '', district: '', seat: '' });

  // THE LOK SABHA OF WHICH THE REGISTRY HOLDS SOME OF THE SEATS is those seats, not the house: a party with 29 of 42 does not
  // hold the Lok Sabha, and half of 42 is not its majority (house-arc.ts). So it is named for the states the seats are in,
  // as the state page's delegation is. `seatsInHouse` is today's strength, so a Lok Sabha fought before the house reached it
  // and loaded in full would read as partial; the registry holds none (election-context.ts says the same of `isPartial`).
  const house = ctx?.body === 'lok-sabha' && !bypoll ? ctx.seatsInHouse : null;
  const states = new Map(v.seats.map((s) => [s.jurisdictionId, s.jurisdictionName ?? s.jurisdictionId]));
  const delegation =
    house === null || v.seats.length >= house
      ? null
      : states.size === 1
        ? ([...states.values()][0] as string)
        : `${states.size} states`;
  const place = delegation ?? (e.body === 'lok-sabha' ? 'India' : e.jurisdictionName);

  const top = v.legend[0];
  // What the key beside the map counts: the parties that won, or on the runner-up tab the ones that came second. A seat with
  // nobody on that side is painted in the no-data ink, and the key has to say so.
  const shown = mode === 'runnerup' ? tally(v.seats, 'runnerUp') : v.legend;
  const dark = v.seats.filter((s) => (mode === 'runnerup' ? s.runnerUpKey : s.partyKey) === null);
  const undeclared = dark.filter((s) => s.partyKey === null).length;
  const noSecond = dark.length - undeclared;
  const unknownSeats = v.seats.filter((s) => s.comparable && s.flip === null).length;
  // The list beside the map: the selection when there is one, the closest contests otherwise. It is a slice of the
  // result, 12 of it or 40 of a selection, and the heading says how much (every seat on the map is a link to its own
  // page). Each builder returns the order it applied (the closest contests are ranked by margin; a selection is in seat
  // order), and the heading says that.
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
  const mapTitle = `${place} · ${MODES.find((m) => m.key === mode)?.label ?? ''}`;

  return (
    <Shell here="election">
      <Crumbs
        trail={[
          { label: 'India', href: '/' },
          ...(e.body === 'assembly'
            ? [{ label: e.jurisdictionName, href: stateHref(e.jurisdictionId) }]
            : []),
          { label: `${bodyWord(e.body)} ${e.year}` },
        ]}
      />

      {/* ── 1 · HEADER. One sentence of result, a line of scale, then the seats won by party. Not a tile grid. The page's
             sources share the eyebrow's line, so nothing between this and the map is a heading. ── */}
      <MapHead
        eyebrow={
          /* THE TYPE, FROM ElectionContext. The body alone says "Lok Sabha" for a Lok Sabha by-election, which
             would describe 829 elections as something they are not. */
          ctx === null ? null : `${place} · ${typeLabel(ctx.body, ctx.kind)} · ${ctx.year}`
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
          bypoll ? (
            <>
              {top.label} won {IN.format(top.n)} of {IN.format(v.seats.length)} seats contested
            </>
          ) : delegation !== null ? (
            // THE SEATS ON RECORD, never the house: a majority of them is not a thing, so neither "won" a majority nor "short of" one.
            <>
              {top.label} won {IN.format(top.n)} of the {IN.format(v.seats.length)} seats on record
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
          {ctx === null
            ? null
            : house !== null && delegation !== null
              ? `${IN.format(v.seats.length)} of ${IN.format(house)} seats on record`
              : scaleLabel(ctx)}
          {/* A reading, not a number — see turnout-trust.ts. An election whose counts nothing can
              reconcile says "verification pending" here rather than asserting a figure. */}
          {turnoutHeadline(v.turnout) === null ? null : <> · {turnoutHeadline(v.turnout)}</>}
          {v.flips === null ? null : <> · {IN.format(v.flips.flipped)} seats changed hands</>}
          {v.previous === null ? null : (
            <>
              {' '}
              ·{' '}
              {/* NOT "compare": the comparison is this page's own, in the flows below. This opens the previous election. */}
              <Link className="iei-body-link" href={elsewhere(v.previous.id)}>
                previous: {v.previous.year}
              </Link>
            </>
          )}
        </p>
        {/* The parties, as marks rather than as a table. This is seats WON, so on the tab where a party means the one that
            came second its links go to the winners, as the arc's do. */}
        <ul className="iei-standing" aria-label="Seats won, by party">
          {v.legend.slice(0, 8).map((l) => (
            <li key={l.key}>
              <Link
                href={mode === 'runnerup' ? sel.href({ mode: 'winners' }, { party: l.key }) : sel.href({ party: l.key })}
              >
                <span className="iei-sw" style={{ background: fillFor(l.key) }} aria-hidden="true" />
                {l.label} <b>{l.n}</b>
              </Link>
            </li>
          ))}
          <More rest={v.legend.slice(8)} />
        </ul>
      </MapHead>

      {/* ── 2 and 3 · THE MAP, and the four ways of reading it ── */}
      <MapSection
        title={mapTitle}
        controls={
          <>
            <ShapeTabs view={v} selection={sel} />
            <Tabs
              label={mapped ? 'What the map shows' : 'What this page shows'}
              current={mode}
              choices={MODES.map((m) => ({
                key: m.key,
                label: m.label,
                href: sel.href({ mode: m.key }),
                // Flips need a previous election under the same boundaries; margin a seat with a share; runner-up a seat with a second.
                available: offersMode(choices, m.key),
              }))}
            />
          </>
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
                {v.incomparableSeats === 0 ? null : (
                  <li>
                    <span className="iei-sw iei-sw-none" aria-hidden="true" />
                    Not comparable <b>{v.incomparableSeats}</b>
                  </li>
                )}
                {/* THE OTHER SEATS PAINTED IN THIS INK: a seat whose boundary held but which has no winner at one end is not
                    redrawn, so it is not counted above, and it is not held or flipped either. */}
                {unknownSeats === 0 ? null : (
                  <li>
                    <span className="iei-sw iei-sw-none" aria-hidden="true" />
                    No comparison <b>{unknownSeats}</b>
                  </li>
                )}
                {mapped ? <li className="iei-legend-note">Flipped seats wear the colour of the party that gained them.</li> : null}
              </ul>
            ) : (
              <ul className="iei-legend">
                {shown.slice(0, 10).map((l) => (
                  <li key={l.key}>
                    <Link
                      href={sel.href({ party: l.key })}
                      className={party === null ? undefined : party === l.key ? 'iei-legend-on' : 'iei-legend-off'}
                      aria-current={party === l.key ? 'true' : undefined}
                    >
                      <span className="iei-sw" style={{ background: fillFor(l.key) }} aria-hidden="true" />
                      {l.label}
                      <b>{l.n}</b>
                    </Link>
                  </li>
                ))}
                <More rest={shown.slice(10)} />
                {/* THE SEATS THE MAP PAINTS IN THE INK OF NOBODY, which a key of parties alone leaves as holes. A seat with no winner
                    is named first: on the runner-up tab it has no second either, and "no winner" is the cause. */}
                {undeclared === 0 ? null : (
                  <li>
                    <span className="iei-sw iei-sw-none" aria-hidden="true" />
                    No declared winner
                    <b>{undeclared}</b>
                  </li>
                )}
                {noSecond === 0 ? null : (
                  <li>
                    <span className="iei-sw iei-sw-none" aria-hidden="true" />
                    No runner-up recorded
                    <b>{noSecond}</b>
                  </li>
                )}
              </ul>
            )}

            {/* ── 7 · THE LIST. The selection, or the closest contests: a slice of the result, headed with what it is
                   and how much of it is shown, which is where "12 of 294" is said. ── */}
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

      {/* ── 3b · THE HOUSE, as an arc. Only for an election that decides one; for the seats of a bigger house, a delegation. ── */}
      <HousePanel seats={v.seats} majority={v.majority} selection={sel} delegation={delegation} />

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
        v.previous === null && !bypoll ? (
          // NO EARLIER ELECTION, NO REDRAW. A first election has every seat "incomparable" by construction, and the redraw
          // sentence would blame a delimitation the registry does not hold. A by-election has no comparison to be missing.
          <Panel id="flips" title="How power moved" question="What changed since the previous election?">
            <p className="iei-absent">{NO_EARLIER_ELECTION}</p>
          </Panel>
        ) : v.incomparableSeats === 0 ? null : (
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
          <SeatFlow flows={seatFlows(v.seats)} previousYear={v.previous?.year ?? null} year={e.year} />
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

      {/* The years switch elections, so the group says so; a lone election has no strip, and `<Foot />` no separator before the link. */}
      {v.siblings.length <= 1 ? (
        <Foot />
      ) : (
        <Foot>
          <span className="iei-sibs" role="group" aria-label="Elections of this house">
            {v.siblings.slice(0, 12).map((s) => (
              <Link
                key={s.id}
                href={elsewhere(s.id)}
                aria-current={s.id === e.id ? 'page' : undefined}
                className={s.id === e.id ? 'iei-legend-on' : undefined}
              >
                {s.year}
              </Link>
            ))}
          </span>
        </Foot>
      )}
    </Shell>
  );
}

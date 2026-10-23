import Link from 'next/link';
import { districtHref, electionHref } from '../../../packages/mandate/src/repo/routes.ts';
import type { ElectionChoice, ElectionMapView, ElectionSeat } from '../../../packages/mandate/src/repo/election-map.ts';
import { MARGIN_BANDS, districtGroups, marginBandCounts } from '../../../packages/mandate/src/repo/election-map.ts';
import type { StateTrajectory } from '../../../packages/mandate/src/repo/trajectory.ts';
import type { Asked } from '../../../packages/mandate/src/repo/state-view.ts';
import { tally } from '../../../packages/mandate/src/repo/map-selection.ts';
import type { MapSelection } from '../../../packages/mandate/src/repo/map-selection.ts';
import { summarise } from '../../../packages/mandate/src/repo/findings.ts';
import { turnoutCaveat, turnoutHeadline } from '../../../packages/mandate/src/repo/turnout-trust.ts';
import { scaleLabel, typeLabel } from '../../../packages/mandate/src/repo/election-context.ts';
import { bodyWord } from '../../../packages/mandate/src/core/election-kind.ts';
import { fillFor } from '../../../packages/mandate/src/viz/party-ink.ts';
import { ElectionMap, MODES, NoMap } from '../../components/iei/ElectionMap.tsx';
import {
  FlipMatrix,
  MarginBands,
  Trajectory,
  VoteSeatPlot,
  anyVoteShare,
} from '../../components/iei/Distribution.tsx';
import { DataList, DataRow, Panel, Tabs } from '../../components/iei/parts.tsx';

/**
 * The state surface: what is happening politically inside one state.
 *
 * ── ONE SELECTION MODEL, NOT FIVE FILTERS ──
 *
 * Every analytical figure on this page reads and writes the SAME selection, carried in the URL:
 *
 *   ?election=  which election everything below describes
 *   ?mode=      how the map encodes it — winners, flips, margin, runner-up
 *   ?party=     one party isolated
 *   ?band=      one competitiveness band isolated
 *   ?district=  the map reframed to one district's own seats
 *   ?seat=      one seat outlined, set by the list
 *
 * `party` and `band` are mutually exclusive because two isolations on one map are two answers to one
 * question: the selection (repo/map-selection.ts) holds one isolation, reads it out of the URL and writes every
 * link below. Everything else composes: a district focus narrows the seat set that the bands, the scatter and
 * the list all describe. `SEATS` below is the single derived subset, computed once and handed to every
 * section — which is what makes the map and the charts feel like one instrument rather than five widgets
 * that happen to sit on one page.
 *
 * No client JavaScript. Selection is a link, so a reading is shareable and survives the back button.
 *
 * ── WHAT THIS PAGE REUSES RATHER THAN REBUILDS ──
 *
 * `electionMapView` never branched on election kind, so a state's assembly election arrives through the same
 * function the national Lok Sabha map uses, framed to its own bounding box. The map, the flip matrix and the
 * vote-to-seats plot are the election page's components, unchanged. What is new here is the competitiveness
 * BANDS (a state has 224 seats, not 543, so the question is "how many are in play" rather than "what shape
 * is the distribution") and the TRAJECTORY, which is the one thing a state has that an election does not: a
 * run of them.
 *
 * ── DISTRICTS ARE GROUPINGS, AND ARE NEVER COLOURED ──
 *
 * A district elects nobody. Selecting one reframes the map to the bounding box of its own constituencies and
 * narrows every figure below; it never fills a shape with a party. That also sidesteps a data problem
 * honestly: the registry holds district outlines for West Bengal alone, in a different projection from the
 * constituencies, so there is no district polygon this page could draw for Karnataka even if it wanted to.
 */

const IN = new Intl.NumberFormat('en-IN');

function pct(v: number | null, dp = 1): string {
  if (v === null) return '—';
  if (v !== 0 && Number(v.toFixed(dp)) === 0) return '<0.1%';
  return `${v.toFixed(dp)}%`;
}

export function StateSurface({
  name,
  view,
  choices,
  asked,
  trajectory,
  selection,
}: {
  name: string;
  view: ElectionMapView;
  /** The offers to switch between, newest first: the state view's `choices`, not the map's `siblings`. */
  choices: readonly ElectionChoice[];
  /** What became of the election the URL asked for. `defaulted` earns a notice. */
  asked: Asked;
  trajectory: StateTrajectory;
  /** What the reader has narrowed the map to. It writes every link on the page: the component builds no URLs of its own. */
  selection: MapSelection;
}) {
  const e = view.election;
  if (e === null) return null;
  // Whether a map is drawn. Every control and caption below that sends the reader to the map is printed only when it is.
  const mapped = view.geometry.status === 'drawn';

  const { mode, district, seat, isolation } = selection;
  const party = isolation?.by === 'party' ? isolation.key : null;
  const band = isolation?.by === 'band' ? isolation.key : null;
  const lead = view.legend[0] ?? null;
  const districts = districtGroups(view.seats);
  const focused = districts.find((d) => d.id === district) ?? null;

  // THE ONE DERIVED SUBSET, and it is the selection's. District narrows first because it is geographic; the isolation
  // then filters within it. Every figure below describes exactly this set, which is why they cannot disagree.
  const inDistrict = selection.inDistrict(view.seats);
  const SEATS: ElectionSeat[] = selection.narrow(view.seats);

  const bands = marginBandCounts(inDistrict);
  // Whether the party landscape has any vote share to set beside the seat share, and the order of its rows. They
  // arrive ranked by vote share, which with none known is a tie everywhere: the eight shown would be the first
  // eight by party key, not the eight with the most seats.
  const voted = anyVoteShare(view.voteSeat);
  const landscape = voted ? view.voteSeat : [...view.voteSeat].sort((a, b) => b.seats - a.seats);
  const narrowed = band !== null || party !== null || focused !== null;
  /**
   * HOW MANY ROWS THE LIST SHOWS, and it is the difference between a contextual list and a table.
   *
   * With nothing selected the list is not a directory of the house — it is the answer to "which seats were
   * close", which needs a dozen rows. It grows only when the reader has NARROWED to something, because then
   * the list is the selection's contents and a truncated selection is a lie about what was selected.
   *
   * The first draft showed 60 rows unconditionally. On Karnataka that put 60 constituencies between the map
   * and every analytical section, which is the giant table this surface exists to replace.
   */
  const listed = [...SEATS]
    .sort((a, b) => (a.marginPct ?? 999) - (b.marginPct ?? 999))
    .slice(0, narrowed ? 60 : 12);

  return (
    <>
      {/* ══ 1 · WHO CONTROLS THE STATE ═════════════════════════════════════════════════════════
          A compact editorial hero: the party, the seats, the bar it had to clear, and one statement the
          registry actually supports. Not a tile grid. */}
      <div className="iei-head">
        <p className="iei-eyebrow">State or union territory</p>
        <h1 className="iei-answer">{name}</h1>
        {lead === null ? null : (
          <div className="iei-hero-result">
            <span className="iei-hero-party">
              <span className="iei-sw" style={{ background: fillFor(lead.key) }} aria-hidden="true" />
              {lead.label}
            </span>
            <span className="iei-hero-seats">
              <b>{IN.format(lead.n)}</b>
              <span className="iei-of"> / {IN.format(view.seats.length)}</span>
            </span>
            <span className="iei-hero-meta">
              {/* THE TYPE AND THE SCALE, both from ElectionContext: "majority N" is a claim only a full house
                  can support, and a by-election is not one. */}
              {view.ctx === null ? `${bodyWord(e.body)} ${e.year}` : `${scaleLabel(view.ctx)} · ${typeLabel(view.ctx.body, view.ctx.kind)} ${view.ctx.year}`}
              {/* NOT a number when the registry cannot corroborate one. West Bengal 2026's 93.0% used to
                  sit right here, in the same type as a real majority count, and a first-time reader had no
                  way to discount it. `turnoutHeadline` cannot return a figure for an unverified reading. */}
              {turnoutHeadline(view.turnout) === null ? null : ` · ${turnoutHeadline(view.turnout)}`}
            </span>
          </div>
        )}
        {/* ONE analytical statement, from the findings the data layer already produced — never authored
            here, so it cannot claim something the registry does not hold. */}
        {view.flips === null ? null : <p className="iei-sub">{summarise(view.flips)}</p>}
        {/* AN ELECTION THE URL ASKED FOR AND THIS PAGE CANNOT SHOW is replaced by the default, and the reader is
            told. A link to one election that answered with another and said nothing looks right and is about
            something else. */}
        {asked !== 'defaulted' ? null : (
          <p className="iei-note">
            The election in the link is not one this page can show for {name}, so this is the{' '}
            {typeLabel(e.body, e.fill)} {e.year}.
          </p>
        )}
      </div>

      {/* ══ 2 · THE ELECTORAL MAP — constituency winners, never a state filled with its government ══ */}
      <Panel
        id="map"
        title={`${focused?.name ?? name} · ${MODES.find((m) => m.key === mode)?.label ?? ''}`}
        question={MODES.find((m) => m.key === mode)?.question ?? ''}
        sources={view.sources}
        caveat={
          // The turnout figure this product declines to print. Undefined unless the reading is
          // unverified, so a healthy election shows no caveat at all.
          turnoutCaveat(view.turnout) === null ? undefined : (
            <>
              <b>Turnout — verification pending.</b>{' '}
              {turnoutCaveat(view.turnout)?.join(' ')}
            </>
          )
        }
      >
        <Tabs
          label="Election"
          current={e.id}
          choices={choices.slice(0, 8).map((s) => ({
            key: s.id,
            label: String(s.year),
            // Changing election drops every selection: a party's seats, a margin band and a district focus
            // are all statements about ONE election and mean nothing carried to another.
            href: selection.href({ election: s.id }),
          }))}
        />
        {/* A STATE'S LOK SABHA VIEW IS A NATIONAL ELECTION NARROWED TO ONE STATE, and the election's own page is the
            only place that shows the rest of it. */}
        {e.body !== 'lok-sabha' ? null : (
          <p className="iei-note">
            The {e.year} Lok Sabha election, narrowed to the seats in {name}.{' '}
            <Link href={electionHref(e.id)}>See the whole country</Link>.
          </p>
        )}
        <Tabs
          label={mapped ? 'What the map shows' : 'What this page shows'}
          current={mode}
          choices={MODES.map((m) => ({
            key: m.key,
            label: m.label,
            href: selection.href({ mode: m.key }),
            available: m.key === 'flips' ? view.flips !== null : true,
          }))}
        />

        {/* WHY THERE IS NO MAP, where there is none, and which of the two reasons it is. */}
        <NoMap view={view} />
        {/* NO VOTE COUNTS — SAID WHERE THE READER MEETS IT.
            West Bengal 2026 publishes winners and turnout and no candidate votes, so every seat's margin is
            a dash, the competitiveness section is absent and the vote-vs-seat plot is a sentence. This line
            used to sit a hundred rendered lines further down, after the flip matrix, where it explained
            dashes the reader had already stopped asking about. It says what is missing AND what that costs,
            because a column of dashes with no reason beside it reads as a broken page rather than as an
            honest one. Only when true, and never a coverage panel. */}
        {view.seats.length > 0 && view.seats.every((s) => s.votes === null) ? (
          <p className="iei-caveat">
            No candidate vote counts were published for this election. Winners and turnout are on record;
            margins, competitiveness and vote-to-seat conversion are not, so those figures read as dashes, and
            a chart that would need them is left out or replaced by a sentence, never drawn as zero.
          </p>
        ) : null}

        <div className="iei-linked iei-map-split">
          <ElectionMap view={view} selection={selection} />

          <div>
            {/* The legend answers to the mode, because the mode decides what a colour means. */}
            {mode === 'margin' ? (
              <MarginBands
                bands={bands}
                selected={band}
                hrefFor={(b) => (b === null ? selection.href('release') : selection.href({ band: b }))}
              />
            ) : mode === 'flips' ? (
              <ul className="iei-legend">
                <li>
                  <span className="iei-sw" style={{ background: 'var(--iei-raised)' }} aria-hidden="true" />
                  Held <b>{view.flips?.held ?? 0}</b>
                </li>
                {view.incomparableSeats === 0 ? null : (
                  <li>
                    <span className="iei-sw iei-sw-none" aria-hidden="true" />
                    Not comparable <b>{view.incomparableSeats}</b>
                  </li>
                )}
                {mapped ? <li className="iei-legend-note">A flipped seat wears the colour of the party that gained it.</li> : null}
              </ul>
            ) : (
              <ul className="iei-legend">
                {tally(inDistrict, mode === 'runnerup' ? 'runnerUp' : 'winner').slice(0, 10).map((l) => (
                  <li key={l.key}>
                    <Link
                      href={selection.href({ party: l.key })}
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

            {/* DISTRICTS AS A CONTROL, not as a table. Each reframes the map and narrows everything below. */}
            {districts.length === 0 ? null : (
              /* TWO DESTINATIONS PER DISTRICT, AND THEY USED TO LOOK NOTHING ALIKE IN THE WRONG DIRECTION.
                 The name FILTERS this page; the labelled link OPENS the district's own page. Both are real
                 answers to "what about this district", and the first build got their weights backwards: the
                 filter was the whole row and the way out was a bare arrow in the dimmest ink on the page,
                 with the entire list folded inside `iei-ev` — the evidence-drawer class — so the route to
                 thirty district pages was disguised as a citation. A reader looking for a district found a
                 provenance affordance and reasonably assumed there was nothing behind it.
                 Now: its own control, open by default, and "open →" is a legible link with a hit area. */
              <details className="iei-districts" open>
                <summary>
                  {focused === null
                    ? `${districts.length} districts — select to filter, or open one`
                    : `District: ${focused.name}`}
                </summary>
                {focused === null ? null : (
                  <p className="iei-district-open-now">
                    <Link className="iei-district-cta" href={districtHref(focused.id)}>
                      Open the {focused.name} district page →
                    </Link>
                    <Link className="iei-district-clear" href={selection.href({ district: focused.id })}>
                      ← the whole state
                    </Link>
                  </p>
                )}
                <ul className="iei-district-list">
                  {districts.map((d) => (
                    <li key={d.id}>
                      <Link
                        href={selection.href({ district: d.id })}
                        className={focused === null ? undefined : focused.id === d.id ? 'iei-legend-on' : 'iei-legend-off'}
                      >
                        {d.name}
                        <b>{d.seats}</b>
                      </Link>
                      <Link
                        className="iei-district-open"
                        href={districtHref(d.id)}
                        aria-label={`Open the ${d.name} district page`}
                      >
                        open →
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {/* ══ 7 · THE SEAT LIST — the current selection, and the map's accessible form ══ */}
            <DataList
              label={
                band !== null
                  ? `Seats decided by ${MARGIN_BANDS.find((b) => b.key === band)?.label ?? band}`
                  : party !== null
                    ? 'Seats for the selected party'
                    : focused !== null
                      ? `Seats in ${focused.name}`
                      : 'The closest contests'
              }
              tight
            >
              {listed.map((s) => (
                <DataRow
                  key={s.versionId}
                  title={s.name}
                  href={s.href ?? undefined}
                  aside={
                    <b>
                      {s.marginVotes === null
                        ? '—'
                        : `${IN.format(s.marginVotes)} votes${s.marginBasis === 'declared' ? ' (declared)' : ''}`}
                    </b>
                  }
                  detail={
                    <>
                      <span className="iei-mark">
                        <span className="iei-sw" style={{ background: fillFor(s.partyKey ?? '') }} aria-hidden="true" />
                        {s.partyLabel ?? 'no winner recorded'}
                      </span>
                      {s.runnerUpLabel === null ? null : (
                        <>
                          {' over '}
                          <span className="iei-mark">
                            <span className="iei-sw" style={{ background: fillFor(s.runnerUpKey ?? '') }} aria-hidden="true" />
                            {s.runnerUpLabel}
                          </span>
                        </>
                      )}
                      {' · '}
                      {pct(s.marginPct, 2)}
                      {/* Focus this seat on the map, without leaving the page. There is nothing to focus it on without one. */}
                      {mapped ? (
                        <>
                          {' · '}
                          <Link className="iei-body-link" href={selection.href({ seat: s.placeId })}>
                            {seat === s.placeId ? 'unfocus' : 'find on map'}
                          </Link>
                        </>
                      ) : null}
                    </>
                  }
                />
              ))}
            </DataList>
            {SEATS.length > listed.length ? (
              <p className="iei-note">
                First {listed.length} of {IN.format(SEATS.length)}.
              </p>
            ) : null}
            {narrowed ? (
              <p className="iei-note">
                <Link href={selection.href('clear')}>Clear the selection</Link>
              </p>
            ) : null}
          </div>
        </div>
      </Panel>

      {/* ══ 3 · WHAT CHANGED ══════════════════════════════════════════════════════════════════ */}
      {view.flips === null ? (
        view.incomparableSeats === 0 ? null : (
          <Panel id="changed" title="What changed" question="How does this compare with the previous election?">
            <p className="iei-absent">
              Seat-level comparison unavailable: the constituencies were redrawn after{' '}
              {view.previous?.year ?? 'the previous election'}, so no seat here has a predecessor to be
              compared with.
            </p>
          </Panel>
        )
      ) : (
        <Panel
          id="changed"
          title="What changed"
          question={`Which seats changed hands since ${view.previous?.year ?? 'the previous election'}?`}
        >
          <div className="iei-two">
            <div>
              <ul className="iei-tally" aria-label="Seats held, changed hands, and not comparable">
                <li>
                  <b>{IN.format(view.flips.flipped)}</b> changed hands
                </li>
                <li>
                  <b>{IN.format(view.flips.held)}</b> held
                </li>
                {view.incomparableSeats === 0 ? null : (
                  <li>
                    <b>{IN.format(view.incomparableSeats)}</b> not comparable
                  </li>
                )}
              </ul>
              {mapped ? (
                <p className="iei-note">
                  <Link href={selection.href({ mode: 'flips' })}>Show this on the map</Link>
                </p>
              ) : null}
            </div>
            <FlipMatrix
              pairs={view.flips.pairs}
              hrefFor={(p) => (p === null ? selection.href('release') : selection.href({ party: p }, { mode: 'flips' }))}
            />
          </div>
        </Panel>
      )}

      {/* ══ 4 · COMPETITIVENESS ═══════════════════════════════════════════════════════════════ */}
      {bands.every((b) => b.n === 0) ? null : (
        <Panel id="close" title="Competitiveness" question="How many seats are actually in play?">
          <MarginBands
            bands={bands}
            selected={band}
            hrefFor={(b) =>
              b === null ? selection.href('release', { mode: 'margin' }) : selection.href({ band: b }, { mode: 'margin' })
            }
          />
          <p className="iei-note">
            {mapped
              ? 'Margin over votes polled, winner against runner-up. Select a band to find those seats on the map.'
              : 'Margin over votes polled, winner against runner-up.'}
          </p>
        </Panel>
      )}

      {/* ══ 5 · PARTY LANDSCAPE ═══════════════════════════════════════════════════════════════ */}
      {view.voteSeat.length === 0 ? null : (
        <Panel
          id="parties"
          title="Party landscape"
          question="Which parties turned votes into seats, and which did not?"
        >
          {/* With no vote share known, the plot is a sentence (VoteSeatPlot says so), and the rows keep what IS
              known: each party's seats and the seat-share bar. A pale vote bar would be a zero, and the note
              beneath them explains a comparison that is not there. */}
          <div className="iei-two iei-two-wide">
            <VoteSeatPlot
              rows={view.voteSeat}
              selected={party}
              hrefFor={(p) => (p === null ? selection.href('release') : selection.href({ party: p }))}
              mapped={mapped}
            />
            <ul
              className="iei-partyrows"
              aria-label={voted ? 'Vote share, seat share and the gap between them' : 'Seat share by party'}
            >
              {landscape.slice(0, 8).map((r) => {
                const before = trajectory.parties
                  .find((p) => p.key === r.party.key)
                  ?.points.at(-2);
                return (
                  <li key={r.party.key}>
                    <Link
                      href={selection.href({ party: r.party.key })}
                      className={party === null ? undefined : party === r.party.key ? 'iei-legend-on' : 'iei-legend-off'}
                    >
                      <span className="iei-mark">
                        <span className="iei-sw" style={{ background: fillFor(r.party.key) }} aria-hidden="true" />
                        {r.party.label}
                      </span>
                    </Link>
                    <span className="iei-partyrows-bars" aria-hidden="true">
                      {voted ? (
                        <span className="iei-partyrows-vote" style={{ width: `${Math.min(r.votePct ?? 0, 100)}%` }} />
                      ) : null}
                      <span
                        className="iei-partyrows-seat"
                        style={{ width: `${Math.min(r.seatPct, 100)}%`, background: fillFor(r.party.key) }}
                      />
                    </span>
                    <span className="iei-partyrows-n">
                      {r.seats}
                      {before === undefined || before.seats === r.seats ? null : (
                        <i className={r.seats > before.seats ? 'iei-up' : 'iei-down'}>
                          {r.seats > before.seats ? '+' : '−'}
                          {Math.abs(r.seats - before.seats)}
                        </i>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          {voted ? (
            <p className="iei-note">
              The pale bar is vote share; the solid bar is seat share. A solid bar longer than its pale one is a
              party the system rewarded.
            </p>
          ) : null}
        </Panel>
      )}

      {/* EVERY ELECTION ON RECORD, as a compact strip. The selector above shows the recent ones because a
          reader almost always wants those; this is the complete set, so an election from 1978 is still one
          click away rather than unreachable. It replaced a 17-row table that carried the same links. */}
      {choices.length <= 1 ? null : (
        <Panel id="elections" title="Elections on record" question="What has this state voted in?">
          <ul className="iei-sibs">
            {choices.map((sib) => (
              <li key={sib.id}>
                <Link
                  href={selection.href({ election: sib.id })}
                  aria-current={sib.id === e.id ? 'page' : undefined}
                  className={sib.id === e.id ? 'iei-legend-on' : undefined}
                >
                  {sib.year}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* ══ 6 · TRAJECTORY ════════════════════════════════════════════════════════════════════ */}
      {trajectory.elections.length < 2 ? null : (
        <Panel
          id="trajectory"
          title="How the state has changed"
          question={`What has each party done across ${trajectory.elections.length} elections?`}
        >
          <div className="iei-two iei-two-wide">
            <div>
              <p className="iei-note iei-traj-head">Seats</p>
              <Trajectory
                data={trajectory}
                metric="seatPct"
                selected={party}
                hrefFor={(p) => (p === null ? selection.href('release') : selection.href({ party: p }))}
              />
            </div>
            <div>
              <p className="iei-note iei-traj-head">Vote share</p>
              <Trajectory
                data={trajectory}
                metric="votePct"
                selected={party}
                hrefFor={(p) => (p === null ? selection.href('release') : selection.href({ party: p }))}
              />
            </div>
          </div>
          {trajectory.epochBreaks.length === 0 ? null : (
            <p className="iei-note">
              The seat lines break where the constituencies were redrawn — seats either side of a
              delimitation are different territories, so they are not joined. Vote share runs unbroken,
              because a share of a whole state&rsquo;s votes survives a redraw.
            </p>
          )}
        </Panel>
      )}
    </>
  );
}

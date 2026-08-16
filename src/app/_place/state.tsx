import Link from 'next/link';
import { constituencyHref, districtHref, stateHref } from '../../../packages/mandate/src/repo/routes.ts';
import type { ElectionMapView, ElectionSeat } from '../../../packages/mandate/src/repo/election-map.ts';
import {
  MARGIN_BANDS,
  bandOf,
  districtGroups,
  marginBandCounts,
  seatsInBand,
  seatsInDistrict,
} from '../../../packages/mandate/src/repo/election-map.ts';
import type { StateTrajectory } from '../../../packages/mandate/src/repo/trajectory.ts';
import { summarise } from '../../../packages/mandate/src/repo/findings.ts';
import { turnoutCaveat, turnoutHeadline } from '../../../packages/mandate/src/repo/turnout-trust.ts';
import { scaleLabel, typeLabel } from '../../../packages/mandate/src/repo/election-context.ts';
import { fillFor } from '../../../packages/mandate/src/viz/party-ink.ts';
import { ElectionMap, MODES } from '../../components/iei/ElectionMap.tsx';
import type { MapMode } from '../../components/iei/ElectionMap.tsx';
import {
  FlipMatrix,
  MarginBands,
  Trajectory,
  VoteSeatPlot,
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
 * question. Everything else composes: a district focus narrows the seat set that the bands, the scatter and
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

const houseWord = (h: string): string => (h === 'pc' ? 'Lok Sabha' : 'Assembly');

/**
 * A district's own page, from the dotted place id the seats already carry.
 *
 * `ka.bangalore` -> `/pl/ka/bangalore`. Built here rather than threaded through the data layer, because it is
 * one `slice` and the type it would live on is one whose whole point is that a district has no winner.
 */
const districtPath = districtHref;

export type StateSelection = {
  mode: MapMode;
  party: string | null;
  band: string | null;
  district: string | null;
  seat: string | null;
};

export function StateSurface({
  name,
  view,
  trajectory,
  selection,
  hrefFor,
}: {
  name: string;
  view: ElectionMapView;
  trajectory: StateTrajectory;
  selection: StateSelection;
  /** A link to this page with parameters changed. The component builds no URLs of its own. */
  hrefFor: (change: Record<string, string>) => string;
}) {
  const e = view.election;
  if (e === null) return null;

  const { mode, party, band, district, seat } = selection;
  const lead = view.legend[0] ?? null;
  const districts = districtGroups(view.seats);
  const focused = districts.find((d) => d.id === district) ?? null;

  // THE ONE DERIVED SUBSET. District narrows first because it is geographic; party and band then filter
  // within it. Every figure below describes exactly this set, which is why they cannot disagree.
  const inDistrict = seatsInDistrict(view.seats, focused?.id ?? null);
  const SEATS: ElectionSeat[] =
    band !== null
      ? seatsInBand(inDistrict, band)
      : party !== null
        ? inDistrict.filter((s) => (mode === 'runnerup' ? s.runnerUpKey : s.partyKey) === party)
        : inDistrict;

  const bands = marginBandCounts(inDistrict);
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
              {/* THE TYPE AND THE SCALE, both from ElectionContext. `houseWord(house)` called a Lok Sabha
                  by-election a "Lok Sabha", and "majority N" is a claim only a full house can support. */}
              {view.ctx === null ? `${houseWord(e.house)} ${e.year}` : `${scaleLabel(view.ctx)} · ${typeLabel(view.ctx.body, view.ctx.kind)} ${view.ctx.year}`}
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
          choices={view.siblings.slice(0, 8).map((s) => ({
            key: s.id,
            label: String(s.year),
            // Changing election drops every selection: a party's seats, a margin band and a district focus
            // are all statements about ONE election and mean nothing carried to another.
            href: hrefFor({ election: s.id, party: '', band: '', district: '', seat: '' }),
          }))}
        />
        <Tabs
          label="What the map shows"
          current={mode}
          choices={MODES.map((m) => ({
            key: m.key,
            label: m.label,
            href: hrefFor({ mode: m.key }),
            available: m.key === 'flips' ? view.flips !== null : true,
          }))}
        />

        {/* WHY THERE IS NO MAP, where there is none — stated once, beside the thing it is about, and only
            when it is true. Assam's and J&K's 2024 parliamentary seats were drawn by delimitations the
            registry holds no boundaries for, so there is nothing this map may legally draw them on. */}
        {view.geometry.drawable === 0 ? (
          <p className="iei-absent">
            No boundary map is available for these {view.seats.length} constituencies — they were redrawn and
            the new boundaries are not on record. Every result is in the list below.
          </p>
        ) : null}
        {/* NO VOTE COUNTS — SAID WHERE THE READER MEETS IT.
            West Bengal 2026 publishes winners and turnout and no candidate votes, so every seat's margin is
            a dash and the competitiveness and vote-vs-seat sections are absent rather than zeroed. This line
            used to sit a hundred rendered lines further down, after the flip matrix, where it explained
            dashes the reader had already stopped asking about. It says what is missing AND what that costs,
            because a column of dashes with no reason beside it reads as a broken page rather than as an
            honest one. Only when true, and never a coverage panel. */}
        {view.seats.length > 0 && view.seats.every((s) => s.votes === null) ? (
          <p className="iei-caveat">
            No candidate vote counts were published for this election. Winners and turnout are on record;
            margins, competitiveness and vote-to-seat conversion are not, so those figures read as dashes
            and their sections are absent rather than shown as zero.
          </p>
        ) : null}

        <div className="iei-linked iei-map-split">
          <ElectionMap
            view={view}
            mode={mode}
            highlight={party}
            band={band}
            district={focused?.id ?? null}
            focusSeat={seat}
          />

          <div>
            {/* The legend answers to the mode, because the mode decides what a colour means. */}
            {mode === 'margin' ? (
              <MarginBands bands={bands} selected={band} hrefFor={(b) => hrefFor({ band: b ?? '', party: '' })} />
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
                <li className="iei-legend-note">A flipped seat wears the colour of the party that gained it.</li>
              </ul>
            ) : (
              <ul className="iei-legend">
                {(mode === 'runnerup' ? runnerUpTally(inDistrict) : tallyOf(inDistrict)).slice(0, 10).map((l) => (
                  <li key={l.key}>
                    <Link
                      href={hrefFor(party === l.key ? { party: '' } : { party: l.key, band: '' })}
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
                    <Link className="iei-district-cta" href={districtPath(focused.id)}>
                      Open the {focused.name} district page →
                    </Link>
                    <Link className="iei-district-clear" href={hrefFor({ district: '', seat: '' })}>
                      ← the whole state
                    </Link>
                  </p>
                )}
                <ul className="iei-district-list">
                  {districts.map((d) => (
                    <li key={d.id}>
                      <Link
                        href={hrefFor(focused?.id === d.id ? { district: '', seat: '' } : { district: d.id, seat: '' })}
                        className={focused === null ? undefined : focused.id === d.id ? 'iei-legend-on' : 'iei-legend-off'}
                      >
                        {d.name}
                        <b>{d.seats}</b>
                      </Link>
                      <Link
                        className="iei-district-open"
                        href={districtPath(d.id)}
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
                  aside={<b>{s.marginVotes === null ? '—' : `${IN.format(s.marginVotes)} votes`}</b>}
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
                      {/* Focus this seat on the map, without leaving the page. */}
                      {' · '}
                      <Link className="iei-body-link" href={hrefFor({ seat: seat === s.placeId ? '' : s.placeId })}>
                        {seat === s.placeId ? 'unfocus' : 'find on map'}
                      </Link>
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
                <Link href={hrefFor({ party: '', band: '', district: '', seat: '' })}>Clear the selection</Link>
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
              <p className="iei-note">
                <Link href={hrefFor({ mode: 'flips' })}>Show this on the map</Link>
              </p>
            </div>
            <FlipMatrix
              pairs={view.flips.pairs}
              hrefFor={(p) => hrefFor(p === null ? { party: '' } : { party: p, band: '', mode: 'flips' })}
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
            hrefFor={(b) => hrefFor({ band: b ?? '', party: '', mode: 'margin' })}
          />
          <p className="iei-note">
            Margin over votes polled, winner against runner-up. Select a band to find those seats on the map.
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
          <div className="iei-two iei-two-wide">
            <VoteSeatPlot
              rows={view.voteSeat}
              selected={party}
              hrefFor={(p) => hrefFor(p === null ? { party: '' } : { party: p, band: '' })}
            />
            <ul className="iei-partyrows" aria-label="Vote share, seat share and the gap between them">
              {view.voteSeat.slice(0, 8).map((r) => {
                const before = trajectory.parties
                  .find((p) => p.key === r.party.key)
                  ?.points.at(-2);
                return (
                  <li key={r.party.key}>
                    <Link
                      href={hrefFor(party === r.party.key ? { party: '' } : { party: r.party.key, band: '' })}
                      className={party === null ? undefined : party === r.party.key ? 'iei-legend-on' : 'iei-legend-off'}
                    >
                      <span className="iei-mark">
                        <span className="iei-sw" style={{ background: fillFor(r.party.key) }} aria-hidden="true" />
                        {r.party.label}
                      </span>
                    </Link>
                    <span className="iei-partyrows-bars" aria-hidden="true">
                      <span className="iei-partyrows-vote" style={{ width: `${Math.min(r.votePct ?? 0, 100)}%` }} />
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
          <p className="iei-note">
            The pale bar is vote share; the solid bar is seat share. A solid bar longer than its pale one is a
            party the system rewarded.
          </p>
        </Panel>
      )}

      {/* EVERY ELECTION ON RECORD, as a compact strip. The selector above shows the recent ones because a
          reader almost always wants those; this is the complete set, so an election from 1978 is still one
          click away rather than unreachable. It replaced a 17-row table that carried the same links. */}
      {view.siblings.length <= 1 ? null : (
        <Panel id="elections" title="Elections on record" question="What has this state voted in?">
          <ul className="iei-sibs">
            {view.siblings.map((sib) => (
              <li key={sib.id}>
                <Link
                  href={hrefFor({ election: sib.id, party: '', band: '', district: '', seat: '' })}
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
                hrefFor={(p) => hrefFor(p === null ? { party: '' } : { party: p, band: '' })}
              />
            </div>
            <div>
              <p className="iei-note iei-traj-head">Vote share</p>
              <Trajectory
                data={trajectory}
                metric="votePct"
                selected={party}
                hrefFor={(p) => hrefFor(p === null ? { party: '' } : { party: p, band: '' })}
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

/** Winners by party, over whatever subset is in view. */
function tallyOf(seats: readonly ElectionSeat[]): { key: string; label: string; n: number }[] {
  const counts = new Map<string, { key: string; label: string; n: number }>();
  for (const s of seats) {
    if (s.partyKey === null) continue;
    const at = counts.get(s.partyKey) ?? { key: s.partyKey, label: s.partyLabel ?? s.partyKey, n: 0 };
    at.n += 1;
    counts.set(s.partyKey, at);
  }
  return [...counts.values()].sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
}

/** Who came second, and how often. */
function runnerUpTally(seats: readonly ElectionSeat[]): { key: string; label: string; n: number }[] {
  const counts = new Map<string, { key: string; label: string; n: number }>();
  for (const s of seats) {
    if (s.runnerUpKey === null) continue;
    const at = counts.get(s.runnerUpKey) ?? {
      key: s.runnerUpKey,
      label: s.runnerUpLabel ?? s.runnerUpKey,
      n: 0,
    };
    at.n += 1;
    counts.set(s.runnerUpKey, at);
  }
  return [...counts.values()].sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
}

/** Re-exported so the page can validate a band from the URL without importing the repo directly. */
export { bandOf };

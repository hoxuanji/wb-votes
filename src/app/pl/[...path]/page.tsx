import { notFound } from "next/navigation";
import Link from "next/link";
import { inr, marginText } from "../../../../packages/mandate/src/repo/brief.ts";
import type { Tile } from "../../../../packages/mandate/src/repo/brief.ts";
import {
  anomalies,
  placeHeadline,
  placeTiles,
  placeView,
} from "../../../../packages/mandate/src/repo/place-page.ts";
import { stateMapView, stateShifts } from "../../../../packages/mandate/src/repo/state-map.ts";
import type { StateMapView, StateShifts } from "../../../../packages/mandate/src/repo/state-map.ts";
import { openRead } from "../../../../packages/mandate/src/db/open.ts";
import { fillFor } from "../../../../packages/mandate/src/viz/party-ink.ts";
import { StateMap } from "../../../components/iei/StateMap.tsx";
import { electionMapView, bandOf, MARGIN_BANDS } from "../../../../packages/mandate/src/repo/election-map.ts";
import type { ElectionMapView } from "../../../../packages/mandate/src/repo/election-map.ts";
import { stateTrajectory } from "../../../../packages/mandate/src/repo/trajectory.ts";
import type { StateTrajectory } from "../../../../packages/mandate/src/repo/trajectory.ts";
import { all } from "../../../../packages/mandate/src/db/index.ts";
import { isMode } from "../../../components/iei/ElectionMap.tsx";
import type { MapMode } from "../../../components/iei/ElectionMap.tsx";
import { StateSurface } from "./state.tsx";
import { Foot, Shell } from "../../../components/iei/Shell.tsx";
import {
  BasisChip,
  Crumbs,
  DataList,
  DataRow,
  Metric,
  Metrics,
  Panel,
  RegistryMissing,
  Table,
  Tabs,
  Value,
} from "../../../components/iei/parts.tsx";
import AnalysisFloor from "./analysis/floor.tsx";
import "../../iei.css";

// Constraint 7: .data/ is gitignored, so this route can never be prerendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `/pl/<state>[/<district>[/<seat>]]` — a place, at whichever level the path names.
 *
 * ── A STATE PAGE IS AN INTELLIGENCE BRIEF, WHICH IS WHAT THE FINAL DESIGN PASS CHANGED ──
 *
 * It read as a database dump, and the measurement says so: 4,311 words, 117 table rows, 492 cells, and the
 * five-second fact — who governs, how strongly, from which election — set at 13px in a sentence between the
 * heading and a 30-row table. What it owes a reader, in order, is: the RESULT, the MAP, the WINNERS, WHAT
 * CHANGED, the DISTRICTS, the HISTORY. That is the order it renders in now.
 *
 * What was deleted, because a deletion is a claim and has to be defensible:
 *
 *  · THE SECOND DISTRICT TABLE. `Districts` printed all 30 districts with seats, who won most, and turnout;
 *    the map's own companion tally prints the same 30 districts with the same links and the same counts. One
 *    fact had two homes on one screen, one of which was invisible at desktop widths (see iei.css).
 *  · EVERY `MEASURED` CHIP. Three of them, one per panel.
 *  · THE ELECTIONS NOTE — "Coverage here is honest by construction… Bihar held one election in February 2005
 *    and another in October." True, and an explanation of how the software orders rows.
 *  · THE FOOTER, which explained why the Analysis floor is per-constituency. A reader who has not opened the
 *    Analysis floor does not need to be told what is not on this page.
 *
 * What was added, and it is one module: WHAT CHANGED. Three to five observations against the previous election
 * of the same house — seat movements, seats that changed hands, turnout, whether the leader holds the house.
 * `stateShifts()` composes it from one read; see repo/state-map.ts for what it refuses to say.
 *
 * EVIDENCE IS ONE DRAWER PER MODULE. Every figure on the seat page used to carry its own inline `ⓘ`: all six
 * tiles carry a source, so six drawers were rendered over the same handful of sources, plus one for the panel
 * — seven affordances for one question. The provenance did not get smaller; it stopped being offered seven
 * times.
 *
 * All the logic is in packages/mandate/src/repo/place-page.ts, which is where the tests can reach it and
 * where webpack can statically see it (cycle 2's 500-on-every-slug lesson).
 */

const RESERVATION: Record<string, string> = { general: "General", sc: "Reserved SC", st: "Reserved ST" };

type Params = Record<string, string | string[] | undefined> | undefined;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * A link to this page with parameters changed and the rest kept, anchored at the map.
 *
 * An empty value DROPS the parameter, so "show every party" and "show the whole state" produce the URL a
 * reader would have arrived at rather than a longer one meaning the same thing.
 */
function link(base: string, params: Params, change: Record<string, string>): string {
  const q = new URLSearchParams();
  for (const [k, val] of Object.entries(params ?? {})) {
    const one = first(val);
    if (one !== undefined && one !== "") q.set(k, one);
  }
  for (const [k, val] of Object.entries(change)) {
    if (val === "") q.delete(k);
    else q.set(k, val);
  }
  const s = q.toString();
  return s === "" ? `${base}#map` : `${base}?${s}#map`;
}

/**
 * The state's map data and what moved since the last election of the same house, on one handle.
 *
 * `placeView` opens and closes its own connection and this needs a second read; opening one here keeps the
 * two independent, and a jurisdiction whose registry cannot be read renders the page without a map rather
 * than failing the whole route.
 */
function readMap(
  jurisdictionId: string,
  params: NonNullable<Params>,
): { map: StateMapView; shifts: StateShifts } | null {
  let db: ReturnType<typeof openRead> | null = null;
  try {
    db = openRead();
    const map = stateMapView(db, jurisdictionId, {
      election: first(params["election"]),
      house: first(params["house"]),
    });
    return {
      map,
      shifts:
        map.election === null
          ? {
              previousYear: null,
              previousId: null,
              findings: [],
              lines: [],
              comparableSeats: 0,
              incomparableSeats: 0,
            }
          : stateShifts(db, jurisdictionId, map.election.id),
    };
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

/** The house a row is about, in the words a reader uses. */
function houseWord(house: string): string {
  return house === "pc" ? "Lok Sabha" : house === "ac" ? "Assembly" : house;
}

/**
 * A district's own page, from the ids the map already holds.
 *
 * `DistrictTally.id` is a dotted place id — `ka.bangalore` — and a place path wants the segment under the
 * state. Built here rather than threaded through the view, because it is one `slice` and the alternative is a
 * field on a type whose whole point is that a district has no winner.
 */
function districtHref(jurisdictionId: string, districtId: string): string {
  return districtId.startsWith(`${jurisdictionId}.`)
    ? `/pl/${jurisdictionId}/${districtId.slice(jurisdictionId.length + 1)}`
    : `/pl/${jurisdictionId}`;
}

/**
 * An election's label in the selector, in words rather than in codes.
 *
 * It used to be `LS2021 BY`, which is not a word in any language. Twelve of those in a strip above the map was
 * the reader's only route to another election, and they had to decode it first.
 */
function electionLabel(e: { year: number; house: string; kind: string }): string {
  const bypoll = e.kind === "bypoll";
  if (e.house === "pc") return bypoll ? `LS ${e.year} by-poll` : `LS ${e.year}`;
  return bypoll ? `${e.year} by-poll` : `${e.year}`;
}

/**
 * Everything the STATE surface needs, on one handle: the chosen election's seats and the whole run behind it.
 *
 * Separate from `readMap` because the state surface reads a different shape — `electionMapView` rather than
 * `stateMapView` — and reuses the election route's data layer wholesale rather than growing a second one. A
 * jurisdiction whose registry cannot be read renders the page without the surface instead of failing the route.
 */
function readState(
  jurisdictionId: string,
  params: NonNullable<Params>,
): { view: ElectionMapView; trajectory: StateTrajectory } | null {
  let db: ReturnType<typeof openRead> | null = null;
  try {
    db = openRead();
    // WHICH HOUSE. A state elects two, and its Lok Sabha seats are a different geography answering a
    // different question — so `?house=pc` is a real view and not a variant. Dropping it was a capability
    // regression the render suite caught.
    const house = first(params["house"]) === "pc" ? "pc" : "ac";
    // Which election: the one asked for if this jurisdiction held it under this house, else its most recent.
    const asked = first(params["election"]);
    const choices = all<{ id: string }>(
      db,
      `SELECT e.id AS id FROM election e
        WHERE e.jurisdiction_place_id = ? AND e.kind IN ('assembly','general') AND e.house = ?
        ORDER BY e.year DESC, COALESCE(e.polling_month, 0) DESC, e.occurrence DESC`,
      jurisdictionId,
      house,
    ).map((r) => r.id);
    const chosen = asked !== undefined && choices.includes(asked) ? asked : choices[0];
    if (chosen === undefined) return null;
    const view = electionMapView(db, chosen);
    if (view.election === null) return null;
    return { view, trajectory: stateTrajectory(db, jurisdictionId, house) };
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

export default async function PlacePage({
  params,
  searchParams,
}: {
  params: { path?: string[] };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const all = params.path ?? [];
  // Next 14 refuses a static segment AFTER a catch-all ("Catch-all must be the last part of the URL"), so
  // /pl/:state/:district/:ac/analysis is served from this same route: the lens is the trailing segment, and
  // §7's place path is what is left. Both lenses stay plain links.
  const lens = all.at(-1) === "analysis" ? "analysis" : "brief";
  const segments = lens === "analysis" ? all.slice(0, -1) : all;
  const view = await placeView(segments, searchParams ?? {});
  if (view.kind === "not-found") notFound();
  if (view.kind === "unavailable") {
    return (
      <Shell here="place" reading>
        <RegistryMissing />
      </Shell>
    );
  }
  // A state and a district have no Analysis floor: every measure behind it is defined per constituency.
  // The URL is not a view, so it is a 404 rather than an empty frame.
  if (lens === "analysis") {
    if (view.kind !== "ac") notFound();
    return <AnalysisFloor view={view} />;
  }

  if (view.kind === "parent") {
    /* ══ THE STATE SURFACE ══════════════════════════════════════════════════════════════════════
       A state gets the intelligence surface: one map, four encodings, and every figure below reading the
       SAME selection out of the URL. It reuses the election route's data layer wholesale — an assembly
       election is an election — so there is one implementation of "seats, flips, margins, vote-to-seats"
       in this codebase rather than two that drift.

       A DISTRICT KEEPS THE OLD BRIEF, deliberately: it has no election of its own, so it has no map, no
       flips and no trajectory. Its page is the list of seats it elects, which is what the code below does. */
    if (view.level === "state") {
      const st = segments[0] as string;
      const s = readState(st, searchParams ?? {});
      const base = `/pl/${segments.join("/")}`;
      if (s !== null) {
        const params = searchParams ?? {};
        const askedParty = first(params["party"]);
        // VALIDATED BY MEMBERSHIP, never parsed: a party has to be one this election returned or ran.
        const party =
          askedParty !== undefined &&
          (s.view.legend.some((l) => l.key === askedParty) ||
            s.view.voteSeat.some((r) => r.party.key === askedParty))
            ? askedParty
            : null;
        const askedBand = first(params["band"]);
        // Party and band are mutually exclusive — two isolations on one map is two answers to one question.
        const band =
          party === null && askedBand !== undefined && MARGIN_BANDS.some((b) => b.key === askedBand)
            ? askedBand
            : null;
        const askedDistrict = first(params["district"]);
        const district =
          askedDistrict !== undefined && s.view.seats.some((x) => x.districtId === askedDistrict)
            ? askedDistrict
            : null;
        const askedSeat = first(params["seat"]);
        const seat =
          askedSeat !== undefined && s.view.seats.some((x) => x.placeId === askedSeat) ? askedSeat : null;
        const askedMode = first(params["mode"]);
        const mode: MapMode =
          askedMode === "flips" && s.view.flips === null
            ? "winners"
            : isMode(askedMode)
              ? askedMode
              : "winners";

        return (
          <Shell here="place">
            <Crumbs trail={view.trail} />
            <StateSurface
              name={view.name}
              view={s.view}
              trajectory={s.trajectory}
              selection={{ mode, party, band, district, seat }}
              hrefFor={(change) => link(base, searchParams, change)}
            />
            <Foot />
          </Shell>
        );
      }
    }

    // The electoral map, for a STATE. A district page is a list of its seats and has no map of its own: the
    // district level of the map is reached by selecting a district on the state's map, which reframes it.
    const read = view.level === "state" ? readMap(segments[0] as string, searchParams ?? {}) : null;
    const map = read?.map ?? null;
    const shifts = read?.shifts ?? null;
    const party =
      map !== null && map.legend.some((l) => l.key === first(searchParams?.["party"]))
        ? (first(searchParams?.["party"]) as string)
        : null;
    const focus =
      map !== null && map.districts.some((d) => d.id === first(searchParams?.["district"]))
        ? (first(searchParams?.["district"]) as string)
        : null;
    const base = `/pl/${segments.join("/")}`;
    const mapHref = (change: Record<string, string>): string => link(base, searchParams, change);
    const lead = map?.legend[0] ?? null;
    const seatsContested = map?.seats.length ?? 0;

    return (
      <Shell here="place" reading={map === null}>
        <Crumbs trail={view.trail} />
        <div className="iei-head">
          <p className="iei-eyebrow">{view.level === "state" ? "State or union territory" : "District"}</p>
          <h1 className="iei-answer">{view.name}</h1>
          {/* THE RESULT STRIP — the five-second answer, at the size a five-second answer needs to be.
              Who leads, by how many of how many, and which election established it. It replaced a 13px
              sentence that said the same thing in the tier the page uses for captions. A district has no
              election of its own, so it keeps the computed sentence. */}
          {map !== null && map.election !== null && lead !== null ? (
            <div className="iei-result">
              <span className="iei-result-p">
                <span className="iei-sw" style={{ background: fillFor(lead.key) }} aria-hidden="true" />
                {lead.label}
              </span>
              <span>
                <b>{lead.n}</b> <span className="iei-of">of {seatsContested}</span>
              </span>
              <span className="iei-result-w">
                {houseWord(map.election.house)} {map.election.year}
                {map.election.kind === "bypoll" ? " by-election" : ""}
              </span>
            </div>
          ) : (
            <p className="iei-sub">{view.headline}</p>
          )}
        </div>

        {map === null || map.election === null ? null : (
          <Panel
            id="map"
            /* WHAT, WHEN, AND AT WHICH LEVEL, in the heading, at a glance. "Assembly winners" is a claim about
               each constituency — the opposite end of the product from the national map's "Government", which
               is one figure for a whole state. A reader must never have to guess which they are looking at. */
            title={`${map.jurisdictionName} · ${map.election.house === "pc" ? "Lok Sabha" : "Assembly"} winners · ${map.election.year}`}
            question={
              focus === null
                ? "Which party won each constituency?"
                : `Which party won each constituency in ${map.districts.find((d) => d.id === focus)?.name ?? focus}?`
            }
            /* The polygons' publisher, licence, retrieval date and hash, and the results' source, in the one
               drawer this panel already had room for. A boundary set is a source like any other. */
            sources={map.sources}
          >
            {/* THE ELECTION SELECTOR. Plain links, so the election is URL state: the map, the legend, the
                counts and the heading all change together and none of them can go stale.

                FULL ELECTIONS FIRST, THEN BY-ELECTIONS, and the reason is what the strip looked like on a
                phone. Karnataka has four assembly and general elections on record and thirteen by-elections;
                in strict chronological order the twelve shown were four full elections scattered through
                eight single-seat by-polls, and a reader looking for 2018 found it after "LS 2021 BY-POLL".
                Same twelve, same links, ranked by what a reader came for. */}
            <Tabs
              label="Election"
              current={map.election.id}
              choices={[
                ...map.elections.filter((e) => e.kind !== "bypoll"),
                ...map.elections.filter((e) => e.kind === "bypoll"),
              ]
                .slice(0, 12)
                .map((e) => ({
                  key: e.id,
                  label: electionLabel(e),
                  href: link(base, searchParams, { election: e.id, district: "" }),
                }))}
            />

            <div className="iei-map-split">
              <StateMap view={map} highlight={party} district={focus} hrefFor={mapHref} />

              <div>
                {/* WINNERS — the map's key, its filter, and the module the brief asks for by name. Every party
                    this election returned, biggest first, with its seat count. */}
                <ul className="iei-legend">
                  {map.legend.slice(0, 6).map((l) => (
                    <li key={l.key}>
                      <Link
                        href={mapHref({ party: party === l.key ? "" : l.key })}
                        className={party === null ? undefined : party === l.key ? "iei-legend-on" : "iei-legend-off"}
                        aria-pressed={party === l.key}
                      >
                        <span className="iei-sw" style={{ background: fillFor(l.key) }} aria-hidden="true" />
                        {l.label}
                        <b>{l.n}</b>
                      </Link>
                    </li>
                  ))}
                  {map.legend.length <= 6 ? null : (
                    <li className="iei-legend-off">
                      + {map.legend.length - 6} more {map.legend.length - 6 === 1 ? "party" : "parties"}
                    </li>
                  )}
                </ul>
                {party === null && focus === null ? null : (
                  <p className="iei-note">
                    {party === null ? null : (
                      <>
                        Showing only <b>{map.legend.find((l) => l.key === party)?.label ?? party}</b>.{" "}
                        <Link href={mapHref({ party: "" })}>Every party</Link>.{" "}
                      </>
                    )}
                    {focus === null ? null : (
                      <>
                        Framed on <b>{map.districts.find((d) => d.id === focus)?.name}</b>.{" "}
                        <Link href={mapHref({ district: "" })}>Whole state</Link>.
                      </>
                    )}
                  </p>
                )}

                {/* WHAT SITS BESIDE THE MAP DEPENDS ON WHAT THE ELECTION HAS.
                    An assembly constituency belongs to a district, so the companion is the district tally —
                    and it is the ONLY district table on this page now; a second one below said the same thing.
                    A PARLIAMENTARY constituency does not belong to a district — `district_place_id` is null
                    for every one of them — so for a Lok Sabha election the tally was a caption promising
                    districts over a table with no rows. The seats themselves are the answer there. */}
                {map.districts.length === 0 ? (
                  <Table
                    label="Constituencies and who won them"
                    caption={`${map.jurisdictionName}'s ${map.seats.length} parliamentary constituencies in ${map.election.year}, in seat order.`}
                    captionVisible
                    tight={map.seats.length > 20}
                    tall={map.seats.length > 18}
                    head={
                      <>
                        <th scope="col">Constituency</th>
                        <th scope="col">Won by</th>
                        <th scope="col" className="iei-n">
                          Margin
                        </th>
                      </>
                    }
                  >
                    {map.seats.map((sm) => (
                      <tr key={sm.versionId}>
                        <th scope="row">{sm.name}</th>
                        <td>
                          {sm.partyKey === null ? (
                            <Value value={null} absent="no winner recorded" />
                          ) : (
                            <span className="iei-mark">
                              <span className="iei-sw" style={{ background: fillFor(sm.partyKey) }} aria-hidden="true" />
                              {sm.partyLabel}
                            </span>
                          )}
                          {sm.winnerPersonId === null ? null : (
                            <>
                              {" "}
                              <Link href={`/p/${sm.winnerPersonId}`}>{sm.winnerName}</Link>
                            </>
                          )}
                        </td>
                        <td className="iei-n">
                          {sm.marginVotes === null ? (
                            <Value value={null} absent="not reported" />
                          ) : (
                            inr(Math.abs(sm.marginVotes))
                          )}
                        </td>
                      </tr>
                    ))}
                  </Table>
                ) : (
                  <Table
                    label="Districts and what their constituencies came to"
                    /* TWO AFFORDANCES PER ROW, AND THE CAPTION NAMES BOTH — because deleting the page's second
                       district table took the only link to a district PAGE with it, and broke the navigation
                       graph INDIA → STATE → DISTRICT → SEAT. The name is the destination; the seat count is
                       the lens. A district page holds every seat with its member, margin and turnout; framing
                       redraws this map on that district. Different questions, so different targets. */
                    caption={`Districts in ${map.election.year} — a district does not elect anybody, so each row counts the seats inside it. Open a district for its seats, or its seat count to frame the map on it.`}
                    captionVisible
                    tight={map.districts.length > 20}
                    tall={map.districts.length > 18}
                    head={
                      <>
                        <th scope="col">District</th>
                        <th scope="col" className="iei-n">
                          Seats
                        </th>
                        <th scope="col">Went to</th>
                      </>
                    }
                  >
                    {map.districts.map((d) => (
                      <tr key={d.id} className={focus !== null && focus !== d.id ? "iei-legend-off" : undefined}>
                        <th scope="row">
                          <Link href={districtHref(segments[0] as string, d.id)}>{d.name}</Link>
                        </th>
                        <td className="iei-n">
                          <Link
                            href={mapHref({ district: focus === d.id ? "" : d.id })}
                            title={focus === d.id ? `Show the whole state` : `Frame the map on ${d.name}`}
                          >
                            {d.seats}
                          </Link>
                        </td>
                        <td>
                          {d.parties.length === 0 ? (
                            <Value value={null} absent="no winner recorded" />
                          ) : (
                            d.parties.slice(0, 3).map((q) => (
                              <span key={q.key} className="iei-rule">
                                <span className="iei-sw" style={{ background: fillFor(q.key) }} aria-hidden="true" />
                                {q.n} of {d.seats} won by {q.label}
                              </span>
                            ))
                          )}
                        </td>
                      </tr>
                    ))}
                  </Table>
                )}
              </div>
            </div>
          </Panel>
        )}

        {/* ── what changed ──
            The third of the three things a state page owes a reader in five seconds, and the one it did not
            have. Every line is a count or a difference over rows the registry holds; nothing is a cause and
            nothing is a prediction. See repo/state-map.ts. */}
        {shifts === null || shifts.lines.length === 0 ? null : (
          <Panel
            title="What changed"
            question={
              shifts.previousYear === null
                ? "How does this compare with the last election?"
                : `How does this compare with ${shifts.previousYear}?`
            }
          >
            <DataList label="What changed since the previous election" tight>
              {shifts.lines.map((l) => (
                <DataRow key={l} title={l} />
              ))}
            </DataList>
          </Panel>
        )}

        {/* A DISTRICT gets its seats. A STATE does not get a second district table — the map's tally above is
            the same 30 districts with the same links, and printing them twice is what made this page read as a
            dump of rows. */}
        {view.level === "state" && map !== null && map.election !== null ? null : (
          <Panel
            title={view.level === "state" ? "Districts" : "Seats"}
            question={view.level === "state" ? "How is this state made up?" : "Which seats does this district elect?"}
            sources={view.sources}
          >
            <Table
              label={view.level === "state" ? "Districts in this state" : "Seats in this district"}
              caption={view.children.caption}
              captionVisible
              tight={view.children.rows.length > 20}
              tall={view.children.rows.length > 24}
              head={view.children.headers.map((h, i) => (
                <th scope="col" className={view.children.numeric[i] === true ? "iei-n" : undefined} key={h}>
                  {h}
                </th>
              ))}
            >
              {view.children.rows.map((r) => (
                <tr key={r.href}>
                  {r.cols.map((c, i) =>
                    i === 0 ? (
                      <th scope="row" key={i}>
                        {view.children.headers[0] === "No." ? c : <Link href={r.href}>{c}</Link>}
                      </th>
                    ) : i === 1 && view.children.headers[0] === "No." ? (
                      <td key={i}>
                        <Link href={r.href}>{c}</Link>
                      </td>
                    ) : (
                      <td className={view.children.numeric[i] === true ? "iei-n" : undefined} key={i}>
                        {c}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </Table>
          </Panel>
        )}

        {view.elections.length === 0 ? null : (
          <Panel
            id="elections"
            title="Elections on record"
            question="What has this jurisdiction voted in, and who led it?"
          >
            {/* A COMPACT TIMELINE, and the note above it is gone. It explained that a jurisdiction with two
                elections gets two rows and that ordering is by the calendar rather than by election id — both
                true, both about how the software works. A reader looking at seventeen dated rows can see that
                nothing is padded. */}
            <Table
              label="Every election this jurisdiction has held"
              caption={`${inr(view.elections.length)} election${view.elections.length === 1 ? "" : "s"} on record, newest first. The year opens that election's coverage.`}
              tight={view.elections.length > 12}
              tall={view.elections.length > 20}
              head={
                <>
                  <th scope="col" className="iei-n">
                    Year
                  </th>
                  <th scope="col">House</th>
                  <th scope="col">Led by</th>
                  <th scope="col" className="iei-n">
                    Seats
                  </th>
                  <th scope="col" className="iei-den">
                    <span className="iei-sr">of seats contested</span>
                  </th>
                </>
              }
            >
              {view.elections.map((e) => (
                <tr key={e.id}>
                  {/* The year is the link, and it is a LABEL: left-aligned like every other row header, so
                      this table's first column starts where the districts table's does. Four digits align
                      with each other whichever edge they are set against.
                      A "Coverage" column of seventeen identical "how much is loaded" links is a column that
                      says one thing seventeen times, so the year carries that too. */}
                  <th scope="row">
                    <Link href={`/coverage?election=${e.id}#election`}>{e.year}</Link>
                  </th>
                  {/* Inline, not a sub-line: a conditional second line made every by-election row taller
                      than the rows around it, and a table of 17 elections rippled. */}
                  <td>{houseWord(e.house)}{e.kind === "bypoll" ? " by-election" : ""}</td>
                  <td>
                    {e.leaderLabel === null ? (
                      <span className="iei-absent">no winner recorded</span>
                    ) : (
                      <span className="iei-mark">
                        <span className="iei-sw" style={{ background: fillFor(e.leaderLabel) }} aria-hidden="true" />
                        <span className="iei-chip">{e.leaderLabel}</span>
                      </span>
                    )}
                  </td>
                  <td className="iei-n">{e.leaderSeats === 0 ? <Value value={null} absent="—" /> : e.leaderSeats}</td>
                  <td className="iei-den">of {e.seats}</td>
                </tr>
              ))}
            </Table>
          </Panel>
        )}

        <Foot />
      </Shell>
    );
  }

  const { brief, analysis } = view;
  const p = brief.place;
  const flags = anomalies(brief, analysis);
  const base = view.base.replace(/\/analysis$/, "");

  return (
    <Shell here="place" reading>
      <Crumbs trail={view.trail} />
      <div className="iei-head">
        <p className="iei-eyebrow">
          Constituency
          {p.number !== null && ` · No. ${p.number}`}
          {p.reservation !== null && ` · ${RESERVATION[p.reservation] ?? p.reservation}`}
        </p>
        <h1 className="iei-answer">{p.canonicalName}</h1>
        <p className="iei-sub">{placeHeadline(brief)}</p>
      </div>

      <Tabs
        label="Lens"
        current="brief"
        choices={[
          { key: "brief", label: "Brief", href: base },
          { key: "analysis", label: "Analysis", href: `${base}/analysis` },
        ]}
      />

      <Panel
        title="What the numbers say"
        question="The seat, as its most recent election left it"
        /* ONE DRAWER FOR THE MODULE. Every tile used to carry its own inline ⓘ over the same handful of
           sources — six drawers where the panel already had one. */
        sources={brief.sources}
      >
        <Metrics>
          {placeTiles(brief, analysis).map((t: Tile) => (
            <Metric
              key={t.label}
              label={t.label}
              // The tiles arrive pre-formatted: the semantic layer owns how a turnout, a margin or an
              // effective-party count is written, and a component must not re-round what it was handed.
              text={t.value}
              unit={t.unit ?? undefined}
              hint={t.note}
            />
          ))}
        </Metrics>
      </Panel>

      <Panel title="Every election on record" question="Who has won this seat, and by how much?">
        <Table
          label="Election history"
          caption={
            brief.contests.length === 0
              ? `No contest is on record for ${p.canonicalName}.`
              : `${inr(brief.contests.length)} election${brief.contests.length === 1 ? "" : "s"}, newest first. The member links to their brief.`
          }
          captionVisible
          head={
            <>
              <th scope="col" className="iei-n">
                Year
              </th>
              <th scope="col">Won by</th>
              <th scope="col">Member</th>
              <th scope="col" className="iei-n">
                Share
              </th>
              <th scope="col" className="iei-n">
                Margin
              </th>
              <th scope="col" className="iei-n">
                Turnout
              </th>
            </>
          }
        >
          {brief.contests.map((c) => (
            <tr key={c.contestId}>
              <th scope="row">{c.year}</th>
              <td>
                {c.winner === null ? (
                  <span className="iei-absent">no result declared</span>
                ) : (
                  <span className="iei-mark">
                    <span
                      className="iei-sw"
                      style={{ background: fillFor(c.winner.partyShortName ?? "") }}
                      aria-hidden="true"
                    />
                    <span className="iei-chip">{c.winner.partyShortName ?? "party not recorded"}</span>
                  </span>
                )}
              </td>
              <td>
                {c.winner === null ? (
                  <Value value={null} absent="not reported" />
                ) : (
                  <Link href={`/p/${c.winner.personId}`}>{c.winner.personName}</Link>
                )}
              </td>
              <td className="iei-n">
                <Value value={c.winner?.voteShare ?? null} unit="%" decimals={1} absent="not reported" />
              </td>
              <td className="iei-n">{marginText(c.margin, true) ?? <Value value={null} absent="not reported" />}</td>
              <td className="iei-n">
                <Value value={c.turnoutPct} unit="%" decimals={1} absent="not reported" />
              </td>
            </tr>
          ))}
        </Table>
      </Panel>

      <Panel title="Flagged" question="Is anything about this seat's record out of the ordinary?">
        {flags.length === 0 ? (
          <p className="iei-note">
            Nothing is: its turnout is within five points of its district, its margin is over a point, and
            every election on record has a declared winner.
          </p>
        ) : (
          <DataList label="Flags">
            {flags.map((flag) => (
              /* THE ONE PLACE `BasisChip` SURVIVES, and it survives because here the distinction changes what
                 the row MEANS. A flag is this codebase's own reading of the record, not a fact a source
                 published, and a reader deciding whether to quote it needs to know which. */
              <DataRow key={flag} title={flag} aside={<BasisChip basis="derived" />} />
            ))}
          </DataList>
        )}
      </Panel>

      <Foot />
    </Shell>
  );
}

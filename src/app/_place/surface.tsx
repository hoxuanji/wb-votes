import { notFound } from "next/navigation";
import Link from "next/link";
import { inr, marginText } from "../../../packages/mandate/src/repo/brief.ts";
import { readOrder } from "../../../packages/mandate/src/repo/place-filters.ts";
import { seatGlow } from "../../../packages/mandate/src/repo/seat-glow.ts";
import { resultRetrieved, seatFinding, seatFlags, seatLimits, seatNumbers } from "../../../packages/mandate/src/repo/seat-story.ts";
import { marginRankFigure, photoFinishOf } from "../../../packages/mandate/src/repo/seat-proof.ts";
import { turnoutHeadline } from '../../../packages/mandate/src/repo/turnout-trust.ts';
import type { Tile } from "../../../packages/mandate/src/repo/brief.ts";
import { placeView } from "../../../packages/mandate/src/repo/place-view.ts";
import { readRegistry } from "../../../packages/mandate/src/repo/session.ts";
import type { PlaceQuery } from "../../../packages/mandate/src/repo/place-resolve.ts";
import { fillFor } from "../../../packages/mandate/src/viz/party-ink.ts";
import { stateChoicesOf } from "../../../packages/mandate/src/repo/election-map.ts";
import { stateView } from "../../../packages/mandate/src/repo/state-view.ts";
import { readAsk, readSelection } from "../../../packages/mandate/src/repo/map-selection.ts";
import { bodyOfKind, personHref, stateHref } from '../../../packages/mandate/src/repo/routes.ts';
import { bodyWord } from "../../../packages/mandate/src/core/election-kind.ts";
import { StateSurface } from "./state.tsx";
import { Choose } from "./choose.tsx";
import { Foot, Shell } from "../../components/iei/Shell.tsx";
import { HeldBy } from "../../components/iei/SeatHistory.tsx";
import { Finding } from "../../components/iei/Finding.tsx";
import { MarginFigure, PartyChip, PersonLink } from "../../components/iei/marks.tsx";
import { SeatFlags, SeatKpis, SeatLimits, SeatMarginRank, SeatPanels, SeatPhotoFinish, SeatRoster } from "../../components/iei/Seat.tsx";
import { SeatLocator } from "../../components/iei/SeatLocator.tsx";
import {
  Crumbs,
  EmptyState,
  Panel,
  RegistryMissing,
  Table,
  Tabs,
  Value,
} from "../../components/iei/parts.tsx";
import AnalysisFloor from "./analysis/floor.tsx";
import "../iei.css";

// Constraint 7: .data/ is gitignored, so this route can never be prerendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `/state/<state>`, `/district/<state>/<district>` and `/constituency/<state>/<body>/<name>` — a place, at whichever
 * level the route names.
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
 * What was added, and it is one module: WHAT CHANGED. Against the previous election of the same house: seats
 * that changed hands, seats that held, and seats that could not be compared. It reads `ElectionMapView.flips`,
 * which refuses to compare a seat across a redrawn boundary; see repo/election-map.ts.
 *
 * EVIDENCE IS ONE DRAWER PER MODULE. Every figure on the seat page used to carry its own inline `ⓘ`: all six
 * tiles carry a source, so six drawers were rendered over the same handful of sources, plus one for the panel
 * — seven affordances for one question. The provenance did not get smaller; it stopped being offered seven
 * times.
 *
 * All the logic is in packages/mandate/src/repo/place-view.ts and place-presentation.ts, which is where the tests can
 * reach it and where webpack can statically see it (cycle 2's 500-on-every-slug lesson).
 */

const RESERVATION: Record<string, string> = { general: "General", sc: "Reserved SC", st: "Reserved ST" };

/**
 * THE ONE PLACE SURFACE, now reached by four routes instead of by one catch-all.
 *
 * Extracted rather than copied: `/state`, `/district` and `/constituency` each name their own entity and
 * then render THIS, so the three entity types cannot drift into three renderers. Which is the whole reason
 * the catch-all existed — it just paid for the sharing by making the URL ambiguous.
 */
export async function PlaceSurface({
  place,
  lens = "brief",
  searchParams,
}: {
  /** The place the route names. A route knows what kind of place it is, so none of this is counted from segments. */
  place: PlaceQuery;
  searchParams?: Record<string, string | string[] | undefined>;
  /** Which floor of a constituency. A state and a district have only the brief. */
  lens?: "brief" | "analysis";
}) {
  const view = await placeView(place, searchParams ?? {});
  if (view.kind === "not-found") notFound();
  if (view.kind === "unavailable") {
    return (
      <Shell here="place" reading>
        <RegistryMissing />
      </Shell>
    );
  }
  // More than one seat answers to the name: ask which, because choosing for the reader is a different seat's page.
  if (view.kind === "many") return <Choose places={view.places} />;
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
      // READ WITH THE ID THE PATH RESOLVED TO, not the segment it was reached by: `/state/KA` and `/state/ka` are
      // one state, and the registry spells it `ka`. Handing it the raw segment made `KA` find no elections.
      const ask = readAsk(searchParams);
      const outcome = readRegistry((db) =>
        stateView(db, view.placeId, { house: ask.get("house"), election: ask.get("election") }),
      );
      // A registry that became unreadable since `placeView` read it is the outage that read would have reported.
      // A defect in one of the queries is thrown, not shown as that page.
      if (!outcome.ok) {
        return (
          <Shell here="place" reading>
            <RegistryMissing />
          </Shell>
        );
      }
      const s = outcome.value;
      // `placeView` has just resolved this id, so only a registry that changed in between finds no such state.
      if (s.kind === "not-found") notFound();
      // THE ENTITY'S OWN CANONICAL BASE, not the path this surface was reached by. It is rendered under
      // /state, /district and /constituency now, so joining the segments would have produced `/pl/...` from
      // every one of them — a query link that navigated back into the compatibility layer on each click.
      const base = stateHref(view.placeId);
      if (s.kind === "ready") {
        // WHAT THE READER ASKED FOR, validated by membership against what this election offers, never parsed: a party
        // has to be one this election returned, ran or came second for, a band one of the five, a district or a seat
        // one of its own. The selection holds one isolation, since two on one map are two answers to one question, and
        // every link on the page is a move of it, anchored at the map.
        const selection = readSelection(searchParams, stateChoicesOf(s.map), { base, anchor: "map" });

        return (
          <Shell here="place">
            <Crumbs trail={view.trail} />
            <StateSurface
              name={view.name}
              view={s.map}
              choices={s.choices}
              asked={s.asked}
              trajectory={s.trajectory}
              selection={selection}
            />
            <Foot />
          </Shell>
        );
      }

      // The state exists and has no election to open on, for the house asked. A page of districts would answer
      // another question, and with no election there is no map to draw.
      return (
        <Shell here="place" reading>
          <Crumbs trail={view.trail} />
          <EmptyState
            title={`No election to show for ${view.name}.`}
            detail={`The registry holds no election with a seat inside ${view.name} for this view, so there is nothing to map.`}
          />
          <Foot />
        </Shell>
      );
    }

    // A DISTRICT has no map: its level of the state's map is reached by selecting it there, which reframes the map.
    return (
      <Shell here="place" reading>
        <Crumbs trail={view.trail} />
        <div className="iei-head">
          <p className="iei-eyebrow">District</p>
          <h1 className="iei-answer">{view.name}</h1>
          {/* A district has no election of its own, so its sentence is the computed headline. */}
          <p className="iei-sub">{view.headline}</p>
        </div>

        <Panel title="Seats" question="Which seats does this district elect?" sources={view.sources}>
          <Table
            label="Seats in this district"
            caption={view.children.caption}
            captionVisible
            tight={view.children.rows.length > 20}
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

        <Foot />
      </Shell>
    );
  }

  const { brief, locator, history, field, widest } = view;
  const p = brief.place;
  const base = view.base.replace(/\/analysis$/, "");
  const story = { brief, history, field, widest };
  const finding = seatFinding(story);
  // The proof of a finding that a sentence cannot show: a ruler for a narrow result, the list of every margin for a lone one.
  const finish = photoFinishOf(story, finding);
  const rank = marginRankFigure(story, finding, view.margins);
  const nums = seatNumbers(story);
  const flags = seatFlags(story);
  const limits = seatLimits(story);
  const { order, dir } = readOrder(searchParams);
  // The roster is the newest election's field, where that election published no counts to rank it by.
  const newest = field.elections.at(0);
  const roster = newest !== undefined && newest.evidence !== "counted" && newest.candidates.length > 1 ? newest : null;
  const retrieved = resultRetrieved(brief);

  return (
    // The light along the top is the colour of the party that holds the seat, where the record names one (repo/seat-glow.ts).
    <Shell here="place" glow={seatGlow(history)?.colour ?? null}>
      <Crumbs trail={view.trail} />
      {/* BESIDE THE HEADER where there is room, below it where there is not, and not there at all where the seat has no
          outline to draw: the header is then the markup it always was, with no frame in its place. */}
      <div className={locator === null ? "iei-head" : "iei-head iei-head-seat"}>
        {/* WHICH BODY, said ONCE and near the title. "Constituency" alone is ambiguous in India: a reader cannot tell a Lok Sabha seat
            from an assembly seat, and the two are different offices with different electorates. */}
        <p className="iei-eyebrow">
          {`${bodyWord(bodyOfKind(p.kind))} Constituency`}
          {p.number !== null && ` · No. ${p.number}`}
          {p.reservation !== null && ` · ${RESERVATION[p.reservation] ?? p.reservation}`}
        </p>
        <h1 className="iei-answer">{p.canonicalName}</h1>
        {/* THE FINDING: the one true, notable thing about this seat, computed from its record (repo/seat-story.ts), with its people as
            links and its parties as swatches. Where the seat has none it is today's headline, so the page never invents a story. */}
        <Finding finding={finding} />
        {/* Under the sentence, in the column the locator leaves it. */}
        <HeldBy history={history} />
        {locator === null ? null : <SeatLocator view={locator} />}
      </div>
      {/* Where the locator's skip link lands: after its links, before the lens tabs. */}
      {locator === null ? null : <div id="after-locator" />}

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
        /* ONE DRAWER FOR THE MODULE. Every tile used to carry its own inline ⓘ over the same handful of sources. */
        sources={brief.sources}
      >
        <SeatKpis nums={nums} retrieved={retrieved} />
      </Panel>

      {finish === null ? null : <SeatPhotoFinish finish={finish} />}
      {rank === null ? null : <SeatMarginRank figure={rank} />}

      {field.elections.length === 0 ? null : (
        <Panel title="How each election divided the vote" question="Who stood, and how did the votes fall?">
          <SeatPanels field={field} history={history} brief={brief} />
        </Panel>
      )}

      {roster === null ? null : <SeatRoster election={roster} order={order} dir={dir} base={base} />}

      <Panel title="Every election on record" question="Who has won this seat, and by how much?">
        <Table
          label="Election history"
          caption={
            brief.contests.length === 0
              ? `No contest is on record for ${p.canonicalName}.`
              : `${brief.contests.length === 1 ? "1 election on record" : `${inr(brief.contests.length)} elections on record`}, newest first. The member links to their page.`
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
              <th scope="col" className="iei-seat-hide">
                Runner-up
              </th>
              <th scope="col" className="iei-n iei-seat-hide">
                Turnout
              </th>
            </>
          }
        >
          {history.results.map((r) => {
            const c = brief.contests.find((x) => x.contestId === r.contestId);
            const f = field.elections.find((x) => x.contestId === r.contestId);
            return (
              <tr key={r.contestId}>
                <th scope="row">{r.label}</th>
                <td>
                  {r.winner === null ? (
                    <span className="iei-absent">no result declared</span>
                  ) : (
                    <PartyChip partyId={r.winner.party.key} code={r.winner.party.label} />
                  )}
                </td>
                <td>
                  {r.winner === null ? (
                    <Value value={null} absent="not reported" />
                  ) : (
                    <PersonLink id={c?.winner?.personId ?? null} name={r.winner.name} />
                  )}
                </td>
                <td className="iei-n">
                  <Value value={c?.winner?.voteShare ?? null} unit="%" decimals={1} absent="not reported" />
                </td>
                <td className="iei-n">
                  {r.margin === null ? <Value value={null} absent="not reported" /> : <MarginFigure votes={r.margin.votes} basis={r.margin.basis} />}
                </td>
                <td className="iei-seat-hide">
                  {r.runnerUp === null ? (
                    <span className="iei-absent">not reported</span>
                  ) : (
                    <>
                      <PartyChip partyId={r.runnerUp.party.key} code={r.runnerUp.party.label} />{" "}
                      <PersonLink id={f?.candidates.find((x) => x.rank === 2)?.personId ?? null} name={r.runnerUp.name} />
                    </>
                  )}
                </td>
                <td className="iei-n iei-seat-hide">
                  {c === undefined ? null : (turnoutHeadline(c.turnout)?.replace(" turnout", "") ?? <Value value={null} absent="not reported" />)}
                </td>
              </tr>
            );
          })}
        </Table>
      </Panel>

      <SeatFlags flags={flags} elections={brief.contests.length} />
      <SeatLimits limits={limits} />

      <Foot />
    </Shell>
  );
}

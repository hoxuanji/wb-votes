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
import { Shell } from "../../../components/iei/Shell.tsx";
import {
  BasisChip,
  Crumbs,
  DataList,
  DataRow,
  Evidence,
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
 * IT IS PART OF THE PRODUCT NOW, which is what this phase changed. It used to render inside a `.mandate`
 * wrapper with its own stylesheet, its own 880px measure, its own 16px base size and no chrome at all: no
 * wordmark, no search, no way back to India. A reader who clicked Karnataka on the national map arrived
 * somewhere that did not look like the page they had left and could not get back to it except with the
 * browser's own button. That is what "assembled from independently implemented widgets" meant in practice.
 *
 * Now it mounts the same `Shell` as `/` and `/coverage`, uses the same primitives, and its breadcrumb
 * starts at India and is made of the registry's names rather than the URL's slugs.
 *
 * EVIDENCE IS A DRAWER. Every figure on this page used to carry a visible `Cite` beside it — six tiles,
 * six source labels — under a four-line paragraph explaining that nothing had been verified, above the
 * numbers, on every place and person page in the product. The paragraph and the six labels are one `ⓘ` in
 * the panel header now. The provenance did not get smaller; it stopped being the loudest thing on the page.
 *
 * All the logic is in packages/mandate/src/repo/place-page.ts, which is where the tests can reach it and
 * where webpack can statically see it (cycle 2's 500-on-every-slug lesson).
 */

const RESERVATION: Record<string, string> = { general: "General", sc: "Reserved SC", st: "Reserved ST" };

/** The house a row is about, in the words a reader uses. */
function houseWord(house: string): string {
  return house === "pc" ? "Lok Sabha" : house === "ac" ? "Assembly" : house;
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
    return (
      <Shell here="place" reading>
        <Crumbs trail={view.trail} />
        <div className="iei-head">
          <p className="iei-eyebrow">{view.level === "state" ? "State or union territory" : "District"}</p>
          <h1 className="iei-answer">{view.name}</h1>
          <p className="iei-sub">{view.headline}</p>
        </div>

        <Panel
          title={view.level === "state" ? "Districts" : "Seats"}
          question={view.level === "state" ? "How is this state made up?" : "Which seats does this district elect?"}
          basis="measured"
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

        {view.elections.length === 0 ? null : (
          <Panel
            id="elections"
            title="Elections on record"
            question="What has this jurisdiction voted in, and who led it?"
            basis="measured"
            note={
              <>
                Coverage here is honest by construction: a jurisdiction with two elections on record gets two
                rows. Nothing is padded and nothing assumes five. Ordering is by the calendar rather than by
                election id — Bihar held one election in February 2005 and another in October.
              </>
            }
          >
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
                      <span className="iei-chip">{e.leaderLabel}</span>
                    )}
                  </td>
                  <td className="iei-n">{e.leaderSeats === 0 ? <Value value={null} absent="—" /> : e.leaderSeats}</td>
                  <td className="iei-den">of {e.seats}</td>
                </tr>
              ))}
            </Table>
          </Panel>
        )}

        <footer className="iei-foot">
          <p>
            This level has a list, not an analysis: the measures behind the Analysis floor — turnout against a
            baseline, swing, effective parties — are defined per constituency, so they are on each
            seat&rsquo;s page rather than aggregated here.
          </p>
        </footer>
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
        basis="measured"
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
              sources={t.source === null ? undefined : [t.source]}
            />
          ))}
        </Metrics>
      </Panel>

      <Panel
        title="Every election on record"
        question="Who has won this seat, and by how much?"
        basis="measured"
      >
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
                  <span className="iei-chip">{c.winner.partyShortName ?? "party not recorded"}</span>
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
              <DataRow key={flag} title={flag} aside={<BasisChip basis="derived" />} />
            ))}
          </DataList>
        )}
      </Panel>

      <footer className="iei-foot">
        <p>
          Every figure here carries the source it came from — open the <span aria-hidden="true">ⓘ</span> beside
          a section for the publisher, the retrieval date and the hash. How much of each election is loaded:{" "}
          <Link href="/coverage">/coverage</Link>. <Evidence sources={brief.sources} label={p.canonicalName} />
        </p>
      </footer>
    </Shell>
  );
}

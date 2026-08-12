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
import { stateMapView } from "../../../../packages/mandate/src/repo/state-map.ts";
import type { StateMapView } from "../../../../packages/mandate/src/repo/state-map.ts";
import { openRead } from "../../../../packages/mandate/src/db/open.ts";
import { fillFor } from "../../../../packages/mandate/src/viz/party-ink.ts";
import { StateMap } from "../../../components/iei/StateMap.tsx";
import { Shell } from "../../../components/iei/Shell.tsx";
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
 * The state's map data, read on its own handle.
 *
 * `placeView` opens and closes its own connection and this needs a second read; opening one here keeps the
 * two independent, and a jurisdiction whose registry cannot be read renders the page without a map rather
 * than failing the whole route.
 */
function readMap(jurisdictionId: string, params: NonNullable<Params>): StateMapView | null {
  let db: ReturnType<typeof openRead> | null = null;
  try {
    db = openRead();
    return stateMapView(db, jurisdictionId, {
      election: first(params["election"]),
      house: first(params["house"]),
    });
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
    // The electoral map, for a STATE. A district page is a list of its seats and has no map of its own: the
    // district level of the map is reached by selecting a district on the state's map, which reframes it.
    const map = view.level === "state" ? readMap(segments[0] as string, searchParams ?? {}) : null;
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

    return (
      <Shell here="place" reading={map === null}>
        <Crumbs trail={view.trail} />
        <div className="iei-head">
          <p className="iei-eyebrow">{view.level === "state" ? "State or union territory" : "District"}</p>
          <h1 className="iei-answer">{view.name}</h1>
          <p className="iei-sub">{view.headline}</p>
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
            basis="measured"
          >
            {/* THE ELECTION SELECTOR. Plain links, so the election is URL state: the map, the legend, the
                counts and the heading all change together and none of them can go stale. */}
            <Tabs
              label="Election"
              current={map.election.id}
              choices={map.elections.slice(0, 12).map((e) => ({
                key: e.id,
                label: `${e.house === "pc" ? "LS" : ""}${e.year}${e.kind === "bypoll" ? " by" : ""}`,
                href: link(base, searchParams, { election: e.id, district: "" }),
              }))}
            />

            <div className="iei-map-split">
              <StateMap view={map} highlight={party} district={focus} hrefFor={mapHref} />

              <div>
                <ul className="iei-legend">
                  {map.legend.slice(0, 8).map((l) => (
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
                  {map.legend.length <= 8 ? null : (
                    <li className="iei-legend-off">
                      + {map.legend.length - 8} more {map.legend.length - 8 === 1 ? "party" : "parties"}
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

                {/* A DISTRICT NEVER HAS A WINNER. Every row is "N of M won by", plural, because a district
                    does not elect anybody — its constituencies do. */}
                <Table
                  label="Districts and what their constituencies came to"
                  caption={`Every district's constituencies in ${map.election.year}. A district does not elect anybody, so each row is a count of the seats inside it.`}
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
                        <Link href={mapHref({ district: focus === d.id ? "" : d.id })}>{d.name}</Link>
                      </th>
                      <td className="iei-n">{d.seats}</td>
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
              </div>
            </div>
          </Panel>
        )}

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
        {/* ONE EVIDENCE AFFORDANCE PER FACT, and the panels above own them. This used to repeat the whole
            source list here as well, plus a paragraph explaining the ⓘ — a mechanism described in prose on
            every page is the scattering this consolidation removes, and the drawer teaches itself. */}
        <p>
          What this registry holds and does not: <Link href="/coverage">/coverage</Link>.
        </p>
      </footer>
    </Shell>
  );
}

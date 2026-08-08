import { notFound } from "next/navigation";
import { inr, marginText } from "../../../../packages/mandate/src/repo/brief.ts";
import type { Tile } from "../../../../packages/mandate/src/repo/brief.ts";
import {
  anomalies,
  placeHeadline,
  placeTiles,
  placeView,
  provenance,
} from "../../../../packages/mandate/src/repo/place-page.ts";
import AnalysisFloor from "./analysis/floor.tsx";
import { ChildTable, Cite, Confidence, Crumbs, Lens, NotReported, Sources, Unavailable } from "./parts.tsx";

// Constraint 7: .data/ is gitignored, so this route can never be prerendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Floor 1 — Brief (§4: "what do I need to know?"). Ten elements: lens nav, breadcrumb, name,
// headline, confidence banner, tiles, the results hero, the flags, the sources, and nothing else.
// All the logic is in packages/mandate/src/repo/place-page.ts, which is where the tests can reach it
// and where webpack can statically see it (cycle 2's 500-on-every-slug lesson).

const RESERVATION: Record<string, string> = { general: "General", sc: "Reserved SC", st: "Reserved ST" };

export default async function PlacePage({
  params,
  searchParams,
}: {
  params: { path?: string[] };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const all = params.path ?? [];
  // Next 14 refuses a static segment AFTER a catch-all ("Catch-all must be the last part of the
  // URL"), so /pl/:state/:district/:ac/analysis is served from this same route: the lens is the
  // trailing segment, and §7's place path is what is left. Both lenses stay plain links.
  const lens = all.at(-1) === "analysis" ? "analysis" : "brief";
  const segments = lens === "analysis" ? all.slice(0, -1) : all;
  const view = await placeView(segments, searchParams ?? {});
  if (view.kind === "not-found") notFound();
  if (view.kind === "unavailable") return <Unavailable detail={view.detail} />;
  // A state and a district have no Analysis floor: every measure behind it is defined per
  // constituency. The URL is not a view, so it is a 404 rather than an empty frame.
  if (lens === "analysis") {
    if (view.kind !== "ac") notFound();
    return <AnalysisFloor view={view} segments={segments} />;
  }

  if (view.kind === "parent") {
    const f = provenance(view.sources);
    return (
      <article className="wrap">
        <Crumbs segments={segments} />
        <h1 className="name">{view.name}</h1>
        <p className="verdict">{view.headline}</p>
        <Confidence f={f} />
        <h2>{view.level === "state" ? "Districts" : "Seats"}</h2>
        <ChildTable table={view.children} />
        <p className="foot">
          This level has a list, not an analysis: the measures behind the Analysis floor — turnout
          against a baseline, swing, effective parties — are defined per constituency, so they are on
          each seat&rsquo;s page rather than aggregated here.
        </p>
        <Sources sources={view.sources} />
      </article>
    );
  }

  const { brief, analysis } = view;
  const p = brief.place;
  const f = provenance(brief.sources);
  const flags = anomalies(brief, analysis);

  return (
    // <article>, not <main>: the untouched root layout already renders the page's one <main>.
    <article className="wrap">
      <Crumbs segments={segments} />
      <Lens base={view.base.replace(/\/analysis$/, "")} current="brief" />
      <h1 className="name">
        {p.canonicalName}
        {p.number !== null && <span className="rank"> · No. {p.number}</span>}
        {p.reservation !== null && (
          <span className="rank"> · {RESERVATION[p.reservation] ?? p.reservation}</span>
        )}
        {p.districtName !== null && <span className="rank"> · {p.districtName}</span>}
      </h1>
      <p className="verdict">{placeHeadline(brief)}</p>
      <Confidence f={f} />

      <h2>What the numbers say</h2>
      <dl className="tiles">
        {placeTiles(brief, analysis).map((t: Tile) => (
          <div className="tile" key={t.label}>
            <dt>{t.label}</dt>
            <dd className="figure">{t.value}</dd>
            {t.unit !== null && <dd className="unit">{t.unit}</dd>}
            {t.note !== null && <dd className="note">{t.note}</dd>}
            <dd>
              <Cite source={t.source} />
            </dd>
          </div>
        ))}
      </dl>

      <h2>Every election on record</h2>
      <div className="panel" tabIndex={0} role="region" aria-label="Election history, scrollable table">
        <table>
          <caption>
            {brief.contests.length === 0
              ? `No contest is on record for ${p.canonicalName}.`
              : `${inr(brief.contests.length)} election${brief.contests.length === 1 ? "" : "s"}, ` +
                `newest first, from the election-results source. The winner links to their brief.`}
          </caption>
          <thead>
            <tr>
              <th scope="col">Election</th>
              <th scope="col">Won by</th>
              <th scope="col">Member</th>
              <th scope="col" className="num">
                Share
              </th>
              <th scope="col" className="num">
                Margin
              </th>
              <th scope="col" className="num">
                Turnout
              </th>
            </tr>
          </thead>
          <tbody>
            {brief.contests.map((c) => (
              <tr className="row" key={c.contestId}>
                <th scope="row">{c.year}</th>
                <td className={c.winner === null ? "lost" : "won"}>
                  {c.winner?.partyShortName ?? "no result declared"}
                </td>
                <td>
                  {c.winner === null ? (
                    <NotReported />
                  ) : (
                    <a className="body-link" href={`/p/${c.winner.personId}`}>
                      {c.winner.personName}
                    </a>
                  )}
                </td>
                <td className="num">
                  {c.winner?.voteShare == null ? <NotReported /> : `${c.winner.voteShare}%`}
                </td>
                <td className="num">{marginText(c.margin, true) ?? <NotReported />}</td>
                <td className="num">
                  {c.turnoutPct === null ? <NotReported /> : `${c.turnoutPct.toFixed(1)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Flagged</h2>
      {flags.length === 0 ? (
        <p className="foot">
          Nothing in this seat&rsquo;s record is out of the ordinary: its turnout is within five
          points of its district, its margin is over a point, and every election on record has a
          declared winner.
        </p>
      ) : (
        <ul className="flags">
          {flags.map((flag) => (
            <li key={flag}>{flag}</li>
          ))}
        </ul>
      )}

      <Sources sources={brief.sources} />
    </article>
  );
}


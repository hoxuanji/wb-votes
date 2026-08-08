import { notFound } from "next/navigation";
import type { PersonBrief, SourceRef } from "../../../../packages/mandate/src/repo/index.ts";
import type { Problem } from "../../../../packages/mandate/src/repo/envelope.ts";
import { personReply } from "../../../../packages/mandate/src/repo/envelope.ts";
import {
  deltas,
  freshness,
  headline,
  href,
  inr,
  isDecided,
  isoDay,
  marginText,
  retrievalText,
  rupees,
  shortSource,
  sourceLabel,
  tiles,
  won,
} from "../../../../packages/mandate/src/repo/brief.ts";

// Constraint 7: .data/ is gitignored, so this route can never be prerendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The page reads through personReply — the same function /v1/entity/person/[slug] answers with — so
// there is exactly ONE place that opens the registry, and it is the one webpack survives: envelope.ts
// loads it with an `import(/* webpackIgnore: true */ ...)` of an absolute file URL, which webpack
// leaves alone. The previous cwd-relative CommonJS loader here was not statically analysable, so
// webpack compiled the binding to `undefined` and every slug 500'd in a production build (the guard
// test in packages/mandate/src/repo/brief.test.ts keeps it from coming back). Sharing personReply
// also means the HTML and the JSON can never disagree about a figure.

export default async function PersonBriefPage({ params }: { params: { person: string } }) {
  const slug = decodeURIComponent(params.person);
  const reply = await personReply(slug);
  if (reply.status === 404) notFound();
  // Any other non-200 is a problem document whose `detail` is written to be shown verbatim (§10):
  // a missing database, a server that shipped without packages/mandate, or an uncited record.
  if ("code" in reply.body) return <Unavailable problem={reply.body} />;
  const brief: PersonBrief = reply.body.data;

  const f = freshness(brief);
  const trail = brief.affidavitTrail;
  const rows = deltas(trail);
  const parties = [...new Set(brief.candidacies.map((c) => c.partyShortName))].filter(
    (p): p is string => p !== null,
  );
  const canonical = brief.person.canonicalName.toLowerCase();
  const otherNames = [
    ...new Set(brief.aliases.map((a) => a.name).filter((n) => n.toLowerCase() !== canonical)),
  ];

  return (
    // <article>, not <main>: the untouched root layout already renders the page's one <main>.
    <article className="wrap">
      <p className="eyebrow">Mandate · person brief</p>
      <h1 className="name">{brief.person.canonicalName}</h1>
      <p className="verdict">{headline(brief)}</p>
      {otherNames.length > 0 && (
        <p className="alias">
          Also recorded as {otherNames.slice(0, 4).join(" · ")}
          {otherNames.length > 4 ? ` · and ${inr(otherNames.length - 4)} more spellings` : ""}
        </p>
      )}

      <p className="caveat">
        <strong>Every figure here is provisional.</strong>{" "}
        {f.total - f.fetched === 0 ? (
          <>
            {f.repoFiles === f.total ? (
              <>
                All {inr(f.total)} source{f.total === 1 ? "" : "s"} behind this page{" "}
                {f.total === 1 ? "is a file" : "are files"} held in this repository, not a document
                read from the publisher, so the numbers are copied, not yet verified.
              </>
            ) : (
              <>
                All {inr(f.total)} source{f.total === 1 ? "" : "s"} behind this page{" "}
                {f.total === 1 ? "was" : "were"} fetched and hashed, but no figure has been checked
                against the document line by line.
              </>
            )}
          </>
        ) : (
          <>
            {inr(f.total - f.fetched)} of {inr(f.total)} source{f.total === 1 ? "" : "s"} behind this
            page {f.total - f.fetched === 1 ? "was" : "were"} never fetched: {f.total - f.fetched === 1 ? "it is" : "they are"}{" "}
            recorded as asserted by an upstream aggregator, which means the numbers are copied, not
            yet verified.
            {f.repoFiles > 0 && (
              <>
                {" "}
                The {inr(f.repoFiles)} that {f.repoFiles === 1 ? "was" : "were"} fetched{" "}
                {f.repoFiles === 1 ? "is a file" : "are files"} in this repository, not a publisher
                document.
              </>
            )}
          </>
        )}{" "}
        {f.retrievedAt !== null && <>Registry last wrote these rows on {isoDay(f.retrievedAt)}.</>}
      </p>

      <h2>What the numbers say</h2>
      <dl className="tiles">
        {tiles(brief).map((t) => (
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

      {brief.candidacies.length > 0 && (
        <>
          <h2>Career</h2>
          {/* tabindex + role: a horizontally scrolling table is unreachable by keyboard without
              them (WCAG 2.1.1), and this costs no client JS. */}
          <div className="panel" tabIndex={0} role="region" aria-label="Career, scrollable table">
            <table>
              <caption>
                Every candidacy on record, newest first — {inr(brief.candidacies.length)} contest
                {brief.candidacies.length === 1 ? "" : "s"} from the election-results source.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Election</th>
                  <th scope="col">Seat</th>
                  <th scope="col">Party</th>
                  <th scope="col">Result</th>
                  <th scope="col" className="num">
                    Votes
                  </th>
                  <th scope="col" className="num">
                    Share
                  </th>
                  <th scope="col" className="num">
                    Margin
                  </th>
                </tr>
              </thead>
              <tbody>
                {brief.candidacies.map((c) => {
                  const v = c.votes;
                  const decided = isDecided(c);
                  return (
                    <tr className="row" key={`${c.contestId}-${c.electionId}`}>
                      <th scope="row">{c.year}</th>
                      <td>
                        {c.placeName}
                        {c.placeNumber !== null && <span className="rank"> · {c.placeNumber}</span>}
                      </td>
                      <td>
                        <Party short={c.partyShortName} symbol={c.partySymbolRef} order={parties} />
                      </td>
                      <td className={won(c) ? "won" : "lost"}>
                        {won(c) ? "Won" : decided ? "Lost" : "No result declared"}
                        {decided && !won(c) && c.rank !== null && (
                          <span className="rank"> · rank {c.rank}</span>
                        )}
                      </td>
                      <td className="num">{v === null ? <NotReported /> : inr(v)}</td>
                      <td className="num">
                        {c.voteShare === null ? <NotReported /> : `${c.voteShare}%`}
                      </td>
                      <td className="num">
                        {marginText(c.margin, won(c)) ?? <NotReported />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>Affidavit trail</h2>
      {rows.length === 0 ? (
        <p className="foot">
          No affidavit filing for this person is in the registry, so there is no declared-assets
          figure to report.
        </p>
      ) : (
        <div className="panel" tabIndex={0} role="region" aria-label="Affidavit trail, scrollable table">
          <table>
            <caption>
              Self-declared figures as filed, oldest filing first —{" "}
              {inr(trail.length)} filing{trail.length === 1 ? "" : "s"} from{" "}
              {inr(new Set(trail.map((t) => t.sourceId)).size)} affidavit source
              {new Set(trail.map((t) => t.sourceId)).size === 1 ? "" : "s"}.
              {trail.length === 1 && " One filing, so no change between filings is computable."}
            </caption>
            <thead>
              <tr>
                <th scope="col">Field</th>
                {trail.map((t) => (
                  <th scope="col" className="num" key={t.year}>
                    {t.year}
                    {t.filedOn !== null && t.filedOn !== "" && (
                      <span className="unit"> · {t.filedOn}</span>
                    )}
                  </th>
                ))}
                {trail.length > 1 && (
                  <th scope="col" className="num">
                    Change
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr className="row" key={r.field}>
                  <th scope="row">{r.field}</th>
                  {trail.map((t) => {
                    const cell = r.cells.find((c) => c.year === t.year);
                    return (
                      <td className="num" key={t.year}>
                        {cell === undefined ? <NotReported /> : cell.text}
                      </td>
                    );
                  })}
                  {trail.length > 1 && (
                    <td className="num">{r.change ?? <NotReported />}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && (
        <p className="foot">
          Filed with the returning officer by the candidate. A pending-case count is a count and
          nothing more: the source records no stage, no court and no outcome, so it says only what
          was declared.{" "}
          {trail.map((t) => (
            <Cite key={t.sourceId} source={sourceById(brief.sources, t.sourceId)} />
          ))}
        </p>
      )}

      {brief.mergeProvenance.length > 0 && (
        <>
          <h2>How this record was assembled</h2>
          <div className="panel" tabIndex={0} role="region" aria-label="Merge provenance, scrollable table">
            <table>
              <caption>
                This person row absorbed {inr(brief.mergeProvenance.length)} other row
                {brief.mergeProvenance.length === 1 ? "" : "s"} during entity resolution. Each merge
                is reversible with <code>npm run mandate -- unmerge</code>.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Absorbed row</th>
                  <th scope="col" className="num">
                    Score
                  </th>
                  <th scope="col">Decided by</th>
                  <th scope="col">When</th>
                </tr>
              </thead>
              <tbody>
                {brief.mergeProvenance.map((m) => (
                  <tr className="row" key={m.mergeId}>
                    <th scope="row">{m.absorbedId}</th>
                    <td className="num">{m.score === null ? <NotReported /> : m.score.toFixed(2)}</td>
                    <td>{m.decidedBy}</td>
                    <td>{isoDay(m.decidedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>Sources</h2>
      <ul className="srcs">
        {brief.sources.map((s) => {
          const link = href(s);
          return (
            <li key={s.id}>
              {link === null ? (
                <span>{sourceLabel(s)}</span>
              ) : (
                <a className="body-link" href={link} rel="nofollow noreferrer">
                  {sourceLabel(s)}
                </a>
              )}{" "}
              · {s.kind.replace(/_/g, " ")} · {retrievalText(s)} · read{" "}
              {isoDay(s.retrievedAt)}
              {link === null && s.url !== null && <span> · {s.url}</span>}
            </li>
          );
        })}
      </ul>
    </article>
  );
}

/** Party identity is the symbol mark plus the short name; colour only reinforces, and only for the
 *  first three parties on the page — §24.4 measured 4 hues failing all-pairs CVD in dark mode. */
function Party({
  short,
  symbol,
  order,
}: {
  short: string | null;
  symbol: string | null;
  order: readonly string[];
}) {
  if (short === null) return <span className="unit">party not recorded</span>;
  const i = order.indexOf(short);
  return (
    <span className={`party ${i >= 0 && i < 3 ? `p${i + 1}` : ""}`}>
      {symbol !== null && symbol.toUpperCase() !== short.toUpperCase() && (
        <span className="mark">{symbol.toUpperCase()}</span>
      )}
      {short}
    </span>
  );
}

function sourceById(sources: readonly SourceRef[], id: string): SourceRef | null {
  return sources.find((s) => s.id === id) ?? null;
}

/** The provenance gesture, degraded to a plain anchor: these NEW files ship no client JS. The page
 *  is not 0 KB — the untouched root layout (src/app/layout.tsx, which constraint 2 forbids editing)
 *  mounts LanguageProvider, Header, BottomNav and Analytics, measured at ~223 kB gzipped on every
 *  request under it. A source that is not linkable renders as text, so a figure never looks cited
 *  when it is not. */
function Cite({ source }: { source: SourceRef | null }) {
  if (source === null) return <span className="cite dead">no source row for this figure</span>;
  const link = href(source);
  if (link === null)
    return <span className="cite dead">{shortSource(source)} · no link, see Sources</span>;
  return (
    <a className="cite" href={link} rel="nofollow noreferrer">
      {shortSource(source)} ↗
    </a>
  );
}

/** A value cell, so it renders at the value contrast tier (§27), not the label tier. */
function NotReported() {
  return (
    <span className="na" title="the source reports no value here">
      not reported
    </span>
  );
}

function Unavailable({ problem }: { problem: Problem }) {
  return (
    <article className="wrap">
      <p className="eyebrow">Mandate</p>
      <p className="verdict">{problem.title}</p>
      <p className="caveat">
        {problem.detail}
        {problem.code === "registry-unavailable" && (
          <>
            <br />
            <strong>Build it:</strong>{" "}
            <code>
              npm run registry:migrate &amp;&amp; npm run registry:ingest &amp;&amp; npm run
              registry:resolve
            </code>
          </>
        )}
      </p>
    </article>
  );
}

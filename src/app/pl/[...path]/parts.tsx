import {
  href,
  inr,
  isoDay,
  retrievalText,
  shortSource,
  sourceLabel,
} from "../../../../packages/mandate/src/repo/brief.ts";
import type { SourceRef } from "../../../../packages/mandate/src/repo/index.ts";
import type { PlaceView, Provenance } from "../../../../packages/mandate/src/repo/place-page.ts";

// The chrome both floors wear, in one place so the two lenses cannot drift apart. Not a page and not
// a route: only page/layout/route/not-found file names are routes, so this module is colocated.
// It lives beside the pages rather than in packages/mandate because it is JSX, and the package is
// compiled by registry:typecheck under a config with no JSX.

/** §7's path, walkable: every ancestor in the URL is a place with its own page. */
export function Crumbs({ segments }: { segments: readonly string[] }) {
  return (
    <p className="crumbs">
      Mandate ·{" "}
      {segments.map((s, i) => (
        <span key={s}>
          {i > 0 && " / "}
          <a href={`/pl/${segments.slice(0, i + 1).join("/")}`}>{s.replace(/-/g, " ")}</a>
        </span>
      ))}
    </p>
  );
}

/** §11: two plain links, so switching lens is a navigation with no transition and no client JS. */
export function Lens({ base, current }: { base: string; current: "brief" | "analysis" }) {
  return (
    <nav className="lens" aria-label="Lens">
      <a href={base} aria-current={current === "brief" ? "page" : undefined}>
        Brief
      </a>
      <a href={`${base}/analysis`} aria-current={current === "analysis" ? "page" : undefined}>
        Analysis
      </a>
    </nav>
  );
}

/** The §P2 disclosure, in plain words: not one figure in this registry has been verified against a
 *  publisher document, and the page says so above the numbers rather than under them. */
export function Confidence({ f }: { f: Provenance }) {
  const never = f.total - f.fetched;
  return (
    <p className="caveat">
      <strong>Every figure here is provisional.</strong>{" "}
      {f.total === 0 ? (
        <>No source row backs this page, so nothing on it can be traced yet.</>
      ) : never === 0 ? (
        <>
          All {inr(f.total)} source{f.total === 1 ? "" : "s"} behind this page{" "}
          {f.repoFiles === f.total
            ? `${f.total === 1 ? "is a file" : "are files"} held in this repository, not a document read from the publisher, so the numbers are copied, not yet verified.`
            : `${f.total === 1 ? "was" : "were"} fetched and hashed, but no figure has been checked against the document line by line.`}
        </>
      ) : (
        <>
          {inr(never)} of {inr(f.total)} sources behind this page {never === 1 ? "was" : "were"} never
          fetched: {never === 1 ? "it is" : "they are"} recorded as asserted by an upstream
          aggregator, which means the numbers are copied, not yet verified.
        </>
      )}{" "}
      {f.retrievedAt !== null && <>Registry last wrote these rows on {isoDay(f.retrievedAt)}.</>}
    </p>
  );
}

export function Sources({ sources }: { sources: readonly SourceRef[] }) {
  return (
    <>
      <h2>Sources</h2>
      {sources.length === 0 ? (
        <p className="foot">No source row is attached to this place.</p>
      ) : (
        <ul className="srcs">
          {sources.map((s) => {
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
                · {s.kind.replace(/_/g, " ")} · {retrievalText(s)} · read {isoDay(s.retrievedAt)}
                {link === null && s.url !== null && <span> · {s.url}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export function Cite({ source }: { source: SourceRef | null }) {
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

export function NotReported() {
  return (
    <span className="na" title="the source reports no value here">
      not reported
    </span>
  );
}

export function Unavailable({ detail }: { detail: string }) {
  return (
    <article className="wrap">
      <p className="crumbs">Mandate</p>
      <p className="verdict">The registry cannot be read right now.</p>
      <p className="caveat">
        {detail}
        <br />
        <strong>Build it:</strong>{" "}
        <code>
          npm run registry:migrate &amp;&amp; npm run registry:ingest &amp;&amp; npm run
          registry:resolve
        </code>
      </p>
    </article>
  );
}

export function ChildTable({ table }: { table: Extract<PlaceView, { kind: "parent" }>["children"] }) {
  return (
    <div className="panel" tabIndex={0} role="region" aria-label="Places in this one, scrollable table">
      <table>
        <caption>{table.caption}</caption>
        <thead>
          <tr>
            {table.headers.map((h, i) => (
              <th scope="col" className={i > 1 ? "num" : undefined} key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r) => (
            <tr className="row" key={r.href}>
              {r.cols.map((c, i) => {
                if (i === 0) {
                  return (
                    <th scope="row" key={i}>
                      {table.headers[0] === "No." ? c : <a className="childlink" href={r.href}>{c}</a>}
                    </th>
                  );
                }
                if (i === 1 && table.headers[0] === "No.") {
                  return (
                    <td key={i}>
                      <a className="childlink" href={r.href}>
                        {c}
                      </a>
                    </td>
                  );
                }
                return (
                  <td className={i > 1 ? "num" : undefined} key={i}>
                    {c}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

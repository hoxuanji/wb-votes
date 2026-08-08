import { inr } from "../../../../../packages/mandate/src/repo/brief.ts";
import type { Card, PlaceView } from "../../../../../packages/mandate/src/repo/place-page.ts";
import { analysisCards, provenance } from "../../../../../packages/mandate/src/repo/place-page.ts";
import { Confidence, Crumbs, Lens, Sources } from "../parts.tsx";

// Floor 2 — Analysis (§4: "how did it get this way?"). Every card is a question, a chart from the
// viz primitives, and the table §27 makes the primary path — rendered, not collapsed, because a
// closed <details> is invisible to a screen reader and the table IS the accessible chart.
//
// 0 KB of client JS: the filters are a GET form and the chips are links (§11 already puts filter
// state in the URL so a link restores the view). Nothing here is interactive in the JS sense, so
// there is nothing to hydrate.

export default function AnalysisFloor({
  view,
  segments,
}: {
  view: Extract<PlaceView, { kind: "ac" }>;
  segments: readonly string[];
}) {
  const { analysis, brief, filters } = view;
  const cards = analysisCards(analysis);
  const base = view.base.replace(/\/analysis$/, "");

  return (
    <article className="wrap">
      <Crumbs segments={segments} />
      <Lens base={base} current="analysis" />
      <h1 className="name">
        {analysis.place.canonicalName}
        {analysis.place.districtName !== null && (
          <span className="rank"> · {analysis.place.districtName}</span>
        )}
      </h1>
      <p className="verdict">How {analysis.place.canonicalName} got this way</p>
      <Confidence f={provenance(analysis.sources)} />

      <h2>Window</h2>
      {/* A GET form: the browser builds the query string, the server reads it. No client JS. */}
      <form className="filters" method="get" action={view.base}>
        <div>
          <label htmlFor="from">From</label>
          <select id="from" name="from" defaultValue={filters.filters.fromYear ?? ""}>
            <option value="">earliest ({Math.min(...view.years)})</option>
            {view.years.map((y) => (
              <option value={y} key={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="to">To</label>
          <select id="to" name="to" defaultValue={filters.filters.toYear ?? ""}>
            <option value="">latest ({Math.max(...view.years)})</option>
            {view.years.map((y) => (
              <option value={y} key={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="party">Party</label>
          <select id="party" name="party" defaultValue={filters.filters.party ?? ""}>
            <option value="">every party</option>
            {view.parties.map((p) => (
              <option value={p} key={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <button type="submit">Apply</button>
      </form>

      {filters.chips.length > 0 && (
        <ul className="chips">
          {filters.chips.map((c) => (
            <li key={c.label}>
              <a className="chip" href={c.href}>
                {c.label} <span className="x">remove ×</span>
              </a>
            </li>
          ))}
          {filters.chips.length > 1 && (
            <li>
              <a className="chip" href={view.base}>
                <span className="x">clear all ×</span>
              </a>
            </li>
          )}
        </ul>
      )}
      {filters.ignored.length > 0 && (
        <ul className="ignored">
          {filters.ignored.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}

      <h2>
        {inr(cards.length)} question{cards.length === 1 ? "" : "s"}
        {filters.chips.length > 0 ? " in this window" : ""}
      </h2>
      <div className="cards">
        {cards.map((c) => (
          <ChartCard card={c} key={c.question} />
        ))}
      </div>

      <h2>What these measures do not tell you</h2>
      <ul className="ignored">
        {analysis.caveats.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>

      <p className="foot">
        {brief.contests.length === 0
          ? "No contest is on record for this seat."
          : `Computed from ${inr(brief.contests.length)} contests on record. `}
        <a className="body-link" href={base}>
          Back to the brief
        </a>
      </p>

      <Sources sources={analysis.sources} />
    </article>
  );
}

function ChartCard({ card }: { card: Card }) {
  const { chart } = card;
  return (
    <section className="card">
      <h3>{card.question}</h3>
      {chart.fact === null ? (
        // charts.ts returns a complete, pre-escaped <svg>; every string in `table` is raw text that
        // JSX escapes. These are the only bytes on the page that bypass JSX, and they never contain
        // caller text unescaped (marks.ts escapeXml).
        <div className="figs" dangerouslySetInnerHTML={{ __html: chart.svg }} />
      ) : (
        <p className="fact">{chart.fact}</p>
      )}
      {card.note !== null && <p className="caveat">{card.note}</p>}
      <div className="panel" tabIndex={0} role="region" aria-label={`${card.question} table`}>
        <table>
          <caption>{chart.table.caption}</caption>
          <thead>
            <tr>
              {chart.table.headers.map((h, i) => (
                <th scope="col" className={i > 0 ? "num" : undefined} key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chart.table.rows.map((r) => (
              <tr className="row" key={r.join("|")}>
                {r.map((cell, i) =>
                  i === 0 ? (
                    <th scope="row" key={i}>
                      {cell}
                    </th>
                  ) : (
                    <td className="num" key={i}>
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

import { inr } from "../../../../../packages/mandate/src/repo/brief.ts";
import type { Card, PlaceView } from "../../../../../packages/mandate/src/repo/place-page.ts";
import { analysisCards } from "../../../../../packages/mandate/src/repo/place-page.ts";
import { Foot, Shell } from "../../../../components/iei/Shell.tsx";
import { Crumbs, DataList, DataRow, Panel, Table, Tabs } from "../../../../components/iei/parts.tsx";
import "../../../iei.css";

/**
 * Floor 2 — Analysis. "How did this seat get this way?"
 *
 * Every card is a question, a chart from the viz primitives, and the table that is the accessible chart —
 * rendered, not collapsed, because a closed `<details>` is invisible to a screen reader and the table IS the
 * chart for anyone who cannot see it.
 *
 * 0 KB of client JS: the window filter is a GET form and the chips are links, so filter state is in the URL
 * and a link restores the view. Nothing here is interactive in the JavaScript sense, so there is nothing to
 * hydrate.
 *
 * It wears the product's chrome now, like every other surface, and the provenance paragraph that used to sit
 * above the first chart is the `ⓘ` in each panel header.
 */
export default function AnalysisFloor({ view }: { view: Extract<PlaceView, { kind: "ac" }> }) {
  const { analysis, brief, filters, trail } = view;
  const cards = analysisCards(analysis);
  const base = view.base.replace(/\/analysis$/, "");

  return (
    <Shell here="place" reading>
      <Crumbs trail={trail} />
      <div className="iei-head">
        {/* No district here: the breadcrumb one line above already names it, and a page whose first two
            lines both say BAGALKOT has said it once too often. */}
        <p className="iei-eyebrow">Constituency · analysis</p>
        <h1 className="iei-answer">How {analysis.place.canonicalName} got this way</h1>
      </div>

      <Tabs
        label="Lens"
        current="analysis"
        choices={[
          { key: "brief", label: "Brief", href: base },
          { key: "analysis", label: "Analysis", href: `${base}/analysis` },
        ]}
      />

      <Panel
        title="Window"
        question="Which elections and which parties are these measures computed over?"
        sources={analysis.sources}
      >
        {/* A GET form: the browser builds the query string, the server reads it. No client JS. */}
        <form className="iei-filters" method="get" action={view.base}>
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

        {filters.chips.length === 0 ? null : (
          <Tabs
            label="Filters applied"
            current=""
            choices={[
              ...filters.chips.map((c) => ({ key: c.label, label: `${c.label} ×`, href: c.href })),
              ...(filters.chips.length > 1 ? [{ key: "clear", label: "clear all ×", href: view.base }] : []),
            ]}
          />
        )}
        {filters.ignored.length === 0 ? null : (
          <ul className="iei-gaps iei-anom">
            {filters.ignored.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        )}
      </Panel>

      {cards.map((c) => (
        <ChartCard card={c} key={c.question} />
      ))}

      <Panel title="What these measures do not tell you" question="The limits of every figure above">
        <DataList label="Caveats">
          {analysis.caveats.map((c) => (
            <DataRow key={c} title={c} />
          ))}
        </DataList>
      </Panel>

      <Foot>
        <a className="iei-body-link" href={base}>
          Back to the brief
        </a>
      </Foot>
    </Shell>
  );
}

function ChartCard({ card }: { card: Card }) {
  const { chart } = card;
  return (
    <Panel title={card.question} note={card.note ?? undefined}>
      {chart.fact === null ? (
        // charts.ts returns a complete, pre-escaped <svg>; every string in `table` is raw text that JSX
        // escapes. These are the only bytes on the page that bypass JSX, and they never contain caller text
        // unescaped (marks.ts escapeXml).
        <div className="iei-fig" dangerouslySetInnerHTML={{ __html: chart.svg }} />
      ) : (
        <p className="iei-sub">{chart.fact}</p>
      )}
      <Table
        label={`${card.question} — as a table`}
        caption={chart.table.caption}
        captionVisible
        head={chart.table.headers.map((h, i) => (
          <th scope="col" className={i > 0 ? "iei-n" : undefined} key={h}>
            {h}
          </th>
        ))}
      >
        {chart.table.rows.map((r) => (
          <tr key={r.join("|")}>
            {r.map((cell, i) =>
              i === 0 ? (
                <th scope="row" key={i}>
                  {cell}
                </th>
              ) : (
                <td className="iei-n" key={i}>
                  {cell}
                </td>
              ),
            )}
          </tr>
        ))}
      </Table>
    </Panel>
  );
}

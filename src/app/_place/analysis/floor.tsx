import { analysisCaveats } from "../../../../packages/mandate/src/repo/place-caveats.ts";
import { placeStory } from "../../../../packages/mandate/src/repo/place-story.ts";
import type { PlaceView } from "../../../../packages/mandate/src/repo/place-view.ts";
import { marginStripOf } from "../../../../packages/mandate/src/repo/seat-proof.ts";
import { resultRetrieved } from "../../../../packages/mandate/src/repo/seat-story.ts";
import { Foot, Shell } from "../../../components/iei/Shell.tsx";
import { AnalysisHead, GapPanels, LeavesOut, MarginHero, MarginStripPanel, Notes, Tables, TurnoutRows, VoteLadder } from "../../../components/iei/Dash.tsx";
import { Crumbs, Panel, Tabs } from "../../../components/iei/parts.tsx";
import "../../iei.css";

/**
 * Floor 2 — Analysis. "How did this seat get this way?"
 *
 * It opens on one computed sentence and the picture that proves it (repo/place-story.ts chooses the sentence by a printed rule), then answers the
 * next question with one picture each: where the vote went, how close it was, whether the state did it, whether people turned out; then what is
 * worth a second look, what the page leaves out, and the exact table behind every picture, open, at the foot.
 *
 * It used to open on a three-select form and eight cards, 6,167px of them, and say nothing: it plotted a turnout the Brief withheld, coloured parties
 * by rank, folded the party list twice and called a state the district of a Lok Sabha seat. The window is still a GET form and the chips and presets
 * are links, so filter state is in the URL and a link restores the view; 0 KB of client JS. The finding is always computed from the whole record, so
 * a filter never silently changes what the page says is its point.
 */
export default function AnalysisFloor({ view }: { view: Extract<PlaceView, { kind: "ac" }> }) {
  const { analysis, brief, filters, trail, history } = view;
  const base = view.base.replace(/\/analysis$/, "");
  const name = analysis.place.canonicalName;
  const story = placeStory({
    brief,
    history,
    analysis,
    ranks: view.ranks,
    stateShares: view.stateShares,
    asked: filters.filters.party ?? null,
  });
  // Where the hero's margin sits among every other seat's of its election, as a dot each (null where the seat is not ranked).
  const strip = marginStripOf(story, view.margins, brief);
  // What was rejected, and a followed party the window cannot show: both are sentences, neither is silence.
  const asked = filters.filters.party;
  const notes = [
    ...filters.ignored,
    ...(asked !== undefined && story.followed?.label !== asked
      ? [`${asked} has no result at ${name} in this window, so ${story.followed?.label ?? "no party"} is followed instead.`]
      : []),
  ];

  // The window as links. "Counted only" ends at the last election that has candidate votes, which is where every picture below can be drawn.
  const counted = history.results.filter((r) => r.evidence === "counted").map((r) => r.year);
  const lastCounted = counted.length === 0 ? null : Math.max(...counted);
  const f = filters.filters;
  const preset = f.party !== undefined ? "" : f.fromYear === undefined && f.toYear === undefined ? "all" : f.fromYear === undefined && f.toYear === lastCounted ? "counted" : "";
  const withParty = (label: string): string => {
    const q = new URLSearchParams();
    if (f.fromYear !== undefined) q.set("from", String(f.fromYear));
    if (f.toYear !== undefined) q.set("to", String(f.toYear));
    q.set("party", label);
    return `${view.base}?${q.toString()}`;
  };

  return (
    <Shell here="place">
      <Crumbs trail={trail} />
      <AnalysisHead name={name} story={story} />

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
        question="Which elections do the pictures below cover?"
        /* ONE DRAWER FOR THE PAGE'S SOURCES, with the retrieval date of the results beside it. */
        sources={analysis.sources}
      >
        <Tabs
          label="Elections shown"
          current={preset}
          choices={[
            { key: "all", label: "All", href: view.base },
            ...(lastCounted === null ? [] : [{ key: "counted", label: "Counted only", href: `${view.base}?to=${lastCounted}` }]),
          ]}
        />
        <details className="iei-twin iei-an-custom">
          <summary>Custom</summary>
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
              <label htmlFor="party">Follow</label>
              <select id="party" name="party" defaultValue={filters.filters.party ?? ""}>
                <option value="">the party in the finding</option>
                {view.parties.map((p) => (
                  <option value={p} key={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit">Apply</button>
          </form>
        </details>
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
        {notes.length === 0 ? null : (
          <ul className="iei-gaps iei-anom">
            {notes.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        )}
      </Panel>

      <VoteLadder story={story} followHref={withParty} />
      <MarginHero story={story} retrieved={resultRetrieved(brief)} />
      {strip === null ? null : <MarginStripPanel s={strip} />}
      <GapPanels story={story} stateName={analysis.place.stateName ?? "the state"} />
      <TurnoutRows story={story} district={analysis.place.districtName} state={analysis.place.stateName} />
      <Notes story={story} />
      <LeavesOut story={story} caveats={analysisCaveats(analysis)} />
      <Tables story={story} stateName={analysis.place.stateName ?? "the state"} district={analysis.place.districtName} />

      <Foot>
        <a className="iei-body-link" href={base}>
          Back to the brief
        </a>
      </Foot>
    </Shell>
  );
}

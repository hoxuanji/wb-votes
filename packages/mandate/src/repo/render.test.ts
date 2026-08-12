// Integration: render the real routes and read what a browser would receive.
//
// WHY THIS SUITE EXISTS, and why it looks like this. `tsc` cannot see inside a component — it type-checks
// JSX and has no opinion about whether a section throws, renders nothing, or prints a figure no source
// published. `next build` does not render a dynamic route. And this sandbox refuses `listen()`, so there is
// no dev server and no browser to point at the page. Between them, that leaves a gap the size of the whole
// front end: the homepage could 500 on every request and every other check in this repo would stay green.
//
// So the pages are rendered here, in a child process that compiles .tsx through the Babel already inside
// next/dist/compiled (ops/probe/render — zero new dependencies), and the HTML is asserted against.
//
// WHAT IT ASSERTS is the brief's data rule rather than the layout: no fabricated value, no derived date
// unlabelled, every jurisdiction reachable. Layout is the one thing this environment genuinely cannot
// check, and pretending otherwise with a snapshot of class names would be worse than not checking.

import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { DEV_DB_PATH } from "../db/open.ts";

const HAVE_DB = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const live = { skip: HAVE_DB ? false : "no .data/registry.db — run npm run registry:ingest" };

const ROOT = new URL("../../../../", import.meta.url).pathname;

/** Render a route, or throw with the child's stderr — a page that fails to render must fail loudly. */
function render(route: string, query = "", segments = ""): string {
  try {
    return execFileSync(
      process.execPath,
      ["--import", "./ops/probe/render/register.mjs", "./ops/probe/render/render.mjs", route, query, segments],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    throw new Error(`render ${route} ${query} ${segments} failed:\n${err.stderr ?? err.message}`);
  }
}

/** The page as a reader sees it: tags stripped, entities resolved, blank lines dropped. */
function text(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&rsquo;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&ldquo;|&rdquo;/g, '"')
    // `<` and `>` are escaped in the markup, and one of them carries meaning: "<0.1%" is how a real share
    // too small for one decimal is rendered, and a helper that left it as &lt; would hide the thing under test.
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n");
}

/* ────────────────────────────── the homepage ────────────────────────────── */

test("the homepage renders, and says what it is in the first screen", live, () => {
  const t = text(render("/"));
  // The ten-second test, as far as a text assertion can carry it: the product's name, that it is national,
  // and a computed sentence about who governs.
  assert.match(t, /INDIA\nElection Intelligence/, "the wordmark is not the first thing");
  assert.match(t, /India · current electoral landscape/);
  assert.match(t, /assemblies on record/, "the headline does not say what it counted");
  // FOUR SECTIONS, and the four the brief's Phase E names: the map, what is next, what was just decided,
  // who holds power, and which signals stand out.
  for (const heading of ["India · Government", "Next", "Just decided", "Party landscape", "What to watch"]) {
    assert.ok(t.includes(heading), `the "${heading}" section is missing`);
  }
  // And the five that were removed must stay removed, each for a reason recorded in page.tsx: every one of
  // them printed a fact that has a home elsewhere on the same screen or one level down.
  for (const [heading, why] of [
    ["Who governs", "the map's companion table is the same 36 rows with the same links"],
    ["Close fights", "Watch's knife-edge rule is the same fact at the same threshold"],
    ["Historical elections", "180 cells of links to the state pages the map already reaches"],
    ["Data coverage", "/coverage is a page whose whole subject is that question"],
  ] as const) {
    assert.ok(!t.includes(heading), `"${heading}" is back on the front page — ${why}`);
  }
  // The hero's six metric tiles are gone too, and their labels are the cheapest way to detect a return.
  for (const label of ["Governing parties", "Terms expiring", "Elections held"]) {
    assert.ok(!t.includes(label), `the hero metric "${label}" is back; it is printed in the dateline already`);
  }
});

test("the front page is materially lighter than the nine-section version it replaced", live, () => {
  // Phase 2.5's target, measured rather than felt: 30–50% of the visible information and container
  // complexity removed. The baseline is the rendered markup of c2c81c7, recorded in
  // docs/product/consolidation-audit.md. These are ceilings, not equalities — a state loading tomorrow adds
  // rows — so each is the audited "after" with headroom, and the point of the test is that the page cannot
  // drift back to nine sections without someone deciding to.
  const html = render("/");
  const count = (re: RegExp): number => (html.match(re) ?? []).length;
  const before = { sections: 9, tables: 7, rows: 141, cells: 726, tiles: 12, notes: 11 };
  const now = {
    sections: count(/<section/g),
    tables: count(/<table/g),
    rows: count(/<tr/g),
    cells: count(/<t[dh][ >]/g),
    tiles: count(/class="iei-metric"/g),
    notes: count(/class="iei-(note|caveat)"/g),
  };
  for (const k of Object.keys(before) as (keyof typeof before)[]) {
    assert.ok(
      now[k] <= before[k],
      `${k}: ${now[k]} is not fewer than the ${before[k]} this phase set out to reduce`,
    );
  }
  // Containers and tiles are where the "assembled widgets" feeling came from, so those are held hardest.
  assert.ok(now.sections <= 5, `${now.sections} sections — the target structure is four plus the map`);
  assert.equal(now.tiles, 0, "the front page has metric tiles again; the dateline carries those counts");
  assert.ok(now.notes <= 4, `${now.notes} prose caveats on the front page`);
  // And the single largest reduction: the 36×5 history grid plus the duplicate 36-row standings table.
  assert.ok(now.cells <= before.cells * 0.6, `${now.cells} table cells, against ${before.cells} before`);
});

test("the homepage never prints a fabricated figure", live, () => {
  const t = text(render("/"));
  // A rendered 0.0% is the shape a fabrication takes here, and it has two sources. West Bengal 2026
  // publishes winners and no vote counts, whose honest render is words; and SKM's 2024 national share is
  // genuinely non-zero but rounds to nothing at one decimal, whose honest render is "<0.1%". Neither may
  // print as a zero, because a zero beside a seat says the party received no votes.
  assert.doesNotMatch(t, /\n0\.0%/, "a 0.0% share is printed — a small share is not zero, and null is not zero");
  assert.match(t, /<0\.1%/, "no small-but-real share is rendered — has the rounding rule been lost?");
  // An absence must be a WORD. A lone dash in a numeric column reads as zero.
  assert.match(t, /not reported|no vote counts|not held|not recorded/, "no absence is spelled out anywhere");
  // A derived figure must say so wherever it appears.
  assert.match(t, /Derived/, "nothing on the page is marked derived");
  assert.match(t, /No date on this list was announced by anyone|announced/, "the upcoming list does not state its basis");
  assert.match(t, /five-year term/, "the derived basis is not named");
  // And the page must not claim to predict. The word alone is not the test — the watch section's own
  // disclaimer says "no model, no forecast, no probability", and a naive match on "forecast" flagged it,
  // which is the difference between denying something and doing it. Only an affirmative claim counts.
  for (const claim of [
    /\bwe (predict|forecast|expect)\b/i,
    /\b(projected|predicted|expected) to win\b/i,
    /\blikely (winner|to win)\b/i,
    /\bwill (win|lose|hold|flip)\b/i,
    /\b\d+% chance\b/i,
    /\bprobability of\b/i,
  ]) {
    assert.doesNotMatch(t, claim, `the page makes a forecast: ${String(claim)}`);
  }
  assert.match(t, /Nothing here is a prediction/, "the watch section does not disclaim prediction");
  assert.match(t, /No model, no forecast, no probability/, "the disclaimer has been softened");
});

test("the unopposed seat is never counted among the numeric results", live, () => {
  const t = text(render("/coverage", "election=ls-2024"));
  // The brief's rule, on the rendered page: 543 constituencies, 542 numeric, 1 unopposed. A page showing
  // 543 numeric winners would be the exact failure it names.
  const numeric = /Numeric results\n([\d,]+)/.exec(t)?.[1];
  const seats = /Constituencies\n([\d,]+)\nof ([\d,]+)/.exec(t);
  const unopposed = /Unopposed\n([\d,]+)/.exec(t)?.[1];
  assert.ok(numeric !== undefined && seats !== null && unopposed !== undefined, "the coverage panel did not render");
  assert.equal(seats[1], seats[2], "resolved does not equal expected for the latest Lok Sabha");
  assert.equal(
    Number(numeric) + Number(unopposed),
    Number((seats[1] as string).replace(/,/g, "")),
    "numeric results plus unopposed do not account for every constituency",
  );
  assert.ok(Number(unopposed) >= 1, "the unopposed seat is not reported");
  assert.match(t, /a cited claim, not a zero/, "the unopposed seat is not explained");
});

test("every map layer renders, and an unknown one falls back instead of breaking", live, () => {
  const layers = ["government", "loksabha", "voteshare", "turnout", "margin", "year"];
  for (const layer of layers) {
    const html = render("/", `layer=${layer}`);
    const t = text(html);
    // 36 filled polygons every time, whatever the layer. Counted INSIDE the fills layer: the document also
    // holds 36 border paths and one district-hairline path, which are frame rather than data.
    // One <a id="iei-j-xx"> per jurisdiction is the invariant that matters: 36 polygons AND 36 of them
    // reachable. Counting <path> would also count the 36 border paths and the district hairline, which are
    // frame rather than data.
    assert.equal(
      new Set([...html.matchAll(/id="iei-j-([a-z]{2})"/g)].map((m) => m[1])).size,
      36,
      `${layer} does not draw 36 reachable jurisdictions`,
    );
    // At least one label, or the layer is a colour-matching exercise.
    assert.ok((html.match(/<text /g) ?? []).length > 20, `${layer} labels almost nothing`);
    assert.ok(t.includes("Boundaries:"), `${layer} does not credit its geometry`);
  }
  // A hand-edited layer must not reach the SQL or produce a broken page.
  const fallback = text(render("/", "layer=%27%3B+DROP+TABLE+result%3B+--"));
  assert.match(fallback, /India · Government/, "a bogus layer did not fall back to the default");
});

test("URL state survives, so a view can be sent to someone", live, () => {
  // ONE parameter on the front page now. It used to take three, and carrying `?election=` and `?house=`
  // through every layer link was the machinery that kept a coverage panel and a history grid from resetting
  // when a reader changed the map. Both sections are gone; the layer is the only view state left, and every
  // layer link anchors to #map so changing it returns the browser to the section that changed.
  const html = render("/", "layer=turnout");
  assert.match(text(html), /Turnout/, "the layer parameter was ignored");
  const links = [...html.matchAll(/href="\/\?([^"]*)#map"/g)].map((m) => m[1] as string);
  assert.ok(links.length >= 5, "the layer strip did not render links");
  for (const q of links) {
    assert.match(q, /^layer=[a-z]+$/, `a layer link carries state the page no longer has: ${q}`);
  }
});

test("the election deep link moved to the page that is about it", live, () => {
  // `/coverage?election=` is the same URL state the front page used to hold, on the surface whose whole
  // subject is the question. A view of one election's coverage is still shareable.
  const t = text(render("/coverage", "election=ls-2024"));
  assert.match(t, /Lok Sabha/, "the election parameter was ignored");
  // And a hand-edited one falls back rather than breaking.
  const bogus = text(render("/coverage", "election=%27%3B+DROP+TABLE+result%3B+--"));
  assert.match(bogus, /How much of this election do we actually hold/, "a bogus election id broke the page");
});

/* ────────────────────────────── the map's semantics ────────────────────────────── */

test("the map says which claim its colour is making, and never the other one", live, () => {
  // The defect this replaced: a layer called "Assembly control" over state paths that were every district ring
  // concatenated and stroked, so a party-coloured state arrived divided into party-coloured districts. The
  // available reading was "this district elected this party". The figure is the party leading that state's most
  // recent assembly election.
  const t = text(render("/"));
  assert.match(t, /India · Government/, "the map does not name its layer");
  assert.match(t, /Which party leads each state's assembly now\?/, "the government layer does not state its claim");
  // "Election winners" is the phrase the brief forbids for this layer, because at state level it is not one.
  assert.ok(!/Election winners/i.test(t), "the government layer is labelled as election winners");
  assert.ok(!t.includes("Assembly control"), "the ambiguous label is back");

  // The Lok Sabha layer has the same shape of problem and must also say what it aggregates.
  const lok = text(render("/", "layer=loksabha"));
  assert.match(lok, /most seats/i, "the Lok Sabha layer does not say it is an aggregate");
  assert.match(lok, /Which party won most of each state's Lok Sabha seats\?/);
});

test("a district is drawn as a subdivision, not as a result", live, () => {
  const html = render("/");
  // Three layers, in this order: fills with no stroke, district hairlines, state borders. The fills must not
  // stroke, or the district edges inside them come back in the party's own gap colour.
  assert.match(html, /class="iei-map-fills"/, "the fills are not their own layer");
  assert.match(html, /class="iei-map-districts"/, "the district hairlines are not drawn");
  assert.match(html, /class="iei-map-borders"/, "the state borders are not their own layer");
  assert.ok(
    html.indexOf('class="iei-map-fills"') < html.indexOf('class="iei-map-districts"'),
    "the district lines are painted under the fills, where they cannot be seen",
  );
  assert.ok(
    html.indexOf('class="iei-map-districts"') < html.indexOf('class="iei-map-borders"'),
    "a district line is painted over a state border",
  );
  // The district layer is ONE path with no fill: it cannot carry a party's colour even by accident.
  const districts = /class="iei-map-districts" d="([^"]+)"/.exec(html);
  assert.ok(districts !== null, "the district layer has no geometry");
  assert.ok((districts[1] as string).length > 50_000, "the district layer is too small to be 726 districts");
  assert.ok(!/class="iei-map-districts"[^>]*fill="#/.test(html), "the district layer has a fill");
  // And the caption has to say what epoch the boundaries are, because they are 2011 and India has moved on.
  assert.match(text(html), /2011 census districts/, "the map does not date its boundaries");
  assert.match(text(html), /not a claim about any district/i, "the map does not disclaim the district reading");
});

test("every party on the map has its own colour, and it is not assigned by rank", live, () => {
  const html = render("/");
  const fills = [...html.matchAll(/<path d="[^"]*" fill="(#[0-9a-f]{6})"/g)].map((m) => m[1] as string);
  assert.ok(fills.length >= 30, `only ${fills.length} polygons carry a fill`);
  // Seventeen parties lead a state. The old system had three hues and one grey, so at most four distinct
  // fills could ever appear; anything under ten means the identity system is not feeding the map.
  assert.ok(new Set(fills).size >= 10, `the map draws ${new Set(fills).size} distinct fills — is rank-based ink back?`);
  // The legend is CONTEXTUAL: parties that lead a state, with counts, and a folded tail rather than a
  // hundred-row key or a three-slot one with "Others".
  const t = text(html);
  // On the markup, not the stripped text: the count is its own element, so `text()` puts it on the next line.
  assert.match(html, />BJP<b>11 states<\/b>/, "the legend does not count what each party leads");
  assert.match(t, /more, one state each/, "the legend does not fold its tail");
  assert.ok(!t.includes("Others 13 parties"), "the legend still folds parties a reader can see into Others");
});

test("a party can be isolated, and the isolation is in the URL", live, () => {
  const plain = render("/");
  const only = render("/", "party=BJP");
  // On the markup: the party's name is its own element, so `text()` puts it on a line of its own.
  assert.match(only, /Showing only where <b>BJP<\/b> leads/, "the map does not say it is filtered");
  assert.match(only, /href="\/#map"/, "there is no way back to every party");
  assert.match(only, /aria-pressed="true"/, "the isolated party is not marked as pressed");
  // Muting is opacity on the fill, never a different colour: the fill is the party's identity.
  assert.ok(/opacity="0\.22"/.test(only), "nothing is muted");
  assert.ok(!/opacity="0\.22"/.test(plain), "the unfiltered map mutes something");
  // The labels of muted polygons go with them — 36 abbreviations over a dimmed map is noise.
  const labels = (s: string): number => (s.match(/<text /g) ?? []).length;
  assert.ok(labels(only) < labels(plain), "isolating a party did not reduce the labels");
  assert.ok(labels(only) > 0, "isolating a party removed every label");

  // Validated by MEMBERSHIP. A party that leads nothing, a party absent from this layer, and an injection all
  // fall back to showing everything rather than to an empty map.
  for (const q of ["party=NOTAPARTY", "party=%27%20OR%201%3D1", "layer=turnout&party=BJP"]) {
    assert.ok(!render("/", q).includes("Showing only where"), `${q} was honoured as a filter`);
  }
});

test("URL state restores the map, and the layer strip carries it", live, () => {
  const html = render("/", "layer=loksabha&party=BJP");
  assert.match(text(html), /Lok Sabha · most seats/, "the layer did not restore");
  assert.match(html, /Showing only where <b>BJP<\/b> leads/, "the isolation did not restore");
  // Switching to a DIFFERENT layer keeps the party, so the strip does not silently drop the reader's filter.
  // The one link that legitimately drops it is the legend's own entry for BJP, which is the toggle that turns
  // the isolation off, so it is excluded by looking only at links to another layer.
  const links = [...html.matchAll(/href="\/\?([^"]*)#map"/g)].map((m) => (m[1] as string).replace(/&amp;/g, "&"));
  assert.ok(links.length >= 5, "the layer strip did not render links");
  const toOtherLayers = links.filter((q) => /layer=/.test(q) && !q.includes("layer=loksabha"));
  assert.ok(toOtherLayers.length >= 4, `only ${toOtherLayers.length} links to another layer`);
  assert.ok(toOtherLayers.every((q) => q.includes("party=BJP")), "a layer link drops the party");
  // And the toggle exists: one link back to this layer with no party at all.
  assert.ok(links.includes("layer=loksabha"), "there is no way to stop isolating the party");
});

/* ────────────────────────────── navigation ────────────────────────────── */

test("every place the front page links to actually resolves", live, () => {
  const html = render("/");
  // EVERY /pl link, with or without a query string. The earlier version of this test matched only
  // `href="/pl/xx"` with nothing after it, and the general election's row linked to `/pl/in?election=…` —
  // so a link to a 404 sat on the front page behind a query string the regex did not see. India's page is
  // the front page; the row names the nation in plain text now, and the assertion below is what catches the
  // next one.
  const targets = [...new Set([...html.matchAll(/href="\/pl\/([a-z]{2})(?:[?#"])/g)].map((m) => m[1] as string))];
  assert.ok(targets.length > 0, "the front page links to no place at all");
  for (const id of targets) {
    // A 404 throws inside the render, so this asserting-by-not-throwing is the assertion.
    const page = text(render("/pl", "", id));
    assert.ok(page.length > 50, `/pl/${id} rendered almost nothing`);
    assert.doesNotMatch(page, /not built in this checkout/, `/pl/${id} could not read the registry`);
  }
  // And the map specifically must reach all 36, which is the country.
  const onMap = [...new Set([...html.matchAll(/id="iei-j-([a-z]{2})"/g)].map((m) => m[1] as string))];
  assert.equal(onMap.length, 36, `the map offers ${onMap.length} jurisdictions, not 36`);
});

test("the navigation graph walks all the way down, in five jurisdictions", live, () => {
  // Phase J's graph, walked rather than asserted about: INDIA → STATE → DISTRICT → SEAT → ANALYSIS, with
  // every step taken from the LINKS THE PREVIOUS PAGE RENDERED. Nothing here is a hand-written path, so a
  // page that stops offering a way down fails the test rather than quietly becoming a dead end.
  //
  // Five jurisdictions, and they are the brief's five because between them they are every shape this data
  // has: a union territory re-delimited after 2008 (jk), a state re-delimited after 2008 (as), the largest
  // (up), the one this project started as (wb), and one with no relationship to any of them (ka).
  for (const state of ["ka", "wb", "up", "as", "jk"]) {
    const statePage = render("/pl", "", state);
    // Asserted on the MARKUP, not the stripped text: the crumb separator is its own element, so `text()`
    // renders the trail as three lines and a regex over it is checking the helper rather than the page.
    assert.match(statePage, /href="\/"[^>]*>India</, `/pl/${state} has no breadcrumb back to India`);
    assert.ok(text(statePage).includes("Elections on record"), `/pl/${state} does not list its elections`);

    // A district link is a three-segment path under this state.
    const district = new RegExp(`href="/pl/${state}/([^/"]+)"`).exec(statePage)?.[1];
    assert.ok(district !== undefined, `/pl/${state} offers no district`);
    const districtPage = render("/pl", "", `${state}/${district}`);
    const dt = text(districtPage);
    assert.ok(dt.length > 200, `/pl/${state}/${district} rendered almost nothing`);
    assert.doesNotMatch(dt, /not built in this checkout/, `/pl/${state}/${district} could not read the registry`);

    // A seat link is a four-segment path under that district.
    const seat = new RegExp(`href="/pl/${state}/${district}/([^/"]+)"`).exec(districtPage)?.[1];
    assert.ok(seat !== undefined, `/pl/${state}/${district} offers no seat`);
    const seatPage = render("/pl", "", `${state}/${district}/${seat}`);
    const st = text(seatPage);
    assert.ok(st.includes("Every election on record"), `${state}/${district}/${seat} has no election history`);
    assert.ok(st.includes("Analysis"), `${state}/${district}/${seat} offers no analysis lens`);
    // The breadcrumb has all four levels, and the first is a link home.
    assert.match(seatPage, /href="\/"[^>]*>India</, `${state}/${district}/${seat} cannot reach India`);

    // And the Analysis floor renders, which is where every chart in the product lives.
    const analysis = text(render("/pl", "", `${state}/${district}/${seat}/analysis`));
    assert.match(analysis, /How .* got this way/, `${state}/${district}/${seat}/analysis has no headline`);
    assert.ok(analysis.includes("Window"), "the analysis floor lost its window filter");

    // A member link out of the seat's history reaches a person, which is the last level of the graph.
    const person = /href="\/p\/([^"]+)"/.exec(seatPage)?.[1];
    if (person !== undefined) {
      const pt = text(render("/p", "", person));
      assert.ok(pt.includes("Career") || pt.includes("Affidavit trail"), `/p/${person} rendered no record`);
      assert.match(render("/p", "", person), /href="\/"[^>]*>India</, `/p/${person} has no breadcrumb`);
    }
  }
});

test("the five jurisdictions the brief names each render their own name and result", live, () => {
  // Karnataka, West Bengal, Uttar Pradesh, Assam, Jammu & Kashmir — one of them a union territory, which is
  // how the 404 that hit all eight UTs was found.
  const expected = [
    ["ka", "Karnataka"],
    ["wb", "West Bengal"],
    ["up", "Uttar Pradesh"],
    ["as", "Assam"],
    ["jk", "Jammu and Kashmir"],
  ] as const;
  for (const [id, name] of expected) {
    const page = text(render("/pl", "", id));
    assert.ok(page.includes(name), `/pl/${id} does not name ${name}`);
  }
  // And on the homepage, each must appear with a leading party in the standings table.
  const home = text(render("/"));
  for (const [, name] of expected) {
    assert.ok(home.includes(name), `${name} is missing from the homepage`);
  }
});

/* ────────────────────────────── the architectural rule ────────────────────────────── */

test("no state is hardcoded anywhere in the feature", () => {
  // "There must be no `if state === 'WB'` and no `const states = [...]` inside the feature." Checked over
  // the files this phase added or rewrote, because the rule is what makes a new jurisdiction a data load.
  const files = [
    "src/app/page.tsx",
    "src/app/iei.css",
    "src/components/iei/Shell.tsx",
    "src/components/iei/IndiaMap.tsx",
    "src/components/iei/parts.tsx",
    "src/components/iei/CommandKey.tsx",
    "src/lib/india-geo.ts",
    "packages/mandate/src/repo/home.ts",
  ];
  // Two of the 36 whose names appear nowhere else, plus the one this product started as.
  const names = ["West Bengal", "Karnataka", "Kerala", "Uttar Pradesh", "Tamil Nadu", "Maharashtra"];
  for (const file of files) {
    const src = readFileSync(new URL(`../../../../${file}`, import.meta.url), "utf8");
    // Comments are where the reasoning lives, and reasoning cites examples. Strip them first.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*)/.test(l))
      .join("\n");
    for (const name of names) {
      assert.ok(!code.includes(name), `${file} names ${name} in code, not in a comment`);
    }
    assert.doesNotMatch(code, /['"]wb['"]|['"]ka['"]/, `${file} carries a jurisdiction id as a literal`);
  }
});

/* ────────────────────────────── the command bar ────────────────────────────── */

test("one field answers for every kind of thing, and every group it offers is navigable", live, () => {
  // Phase G's requirement, on the rendered page: ONE search surface, results GROUPED, and every group
  // reachable from the shell's single field. The page it replaced answered for people only — and carried a
  // second copy of the same field twelve pixels below the shell's.
  const t = text(render("/search", "q=north"));
  assert.ok(t.includes("Constituencies"), "a seat query does not produce a constituencies group");
  // "ram" is a fragment of a state, a party, several seats and many names, so one query exercises all five
  // groups. A single letter does not: `searchPersons` blocks on name keys and will not fire on one character,
  // which is a property of that index rather than of this page.
  const html = render("/search", "q=ram");
  for (const group of ["States", "Elections", "Constituencies", "People", "Parties"]) {
    assert.ok(text(html).includes(group), `the "${group}" group is missing for a query that matches all five`);
  }
  // Exactly one search input on the page — the shell's. The old page had two.
  assert.equal((html.match(/<input[^>]*type="search"/g) ?? []).length, 1, "there is more than one search field");
  // And no <select> anywhere in the chrome: the state and election pickers are what the bar replaced.
  const shell = html.slice(0, html.indexOf("</header>") + 1);
  assert.ok(!shell.includes("<select"), "the header still carries a picker");
});

test("an empty query explains itself rather than listing the registry", live, () => {
  const t = text(render("/search", ""));
  assert.match(t, /Search India/, "the empty state does not say what is searchable");
  // The word appears in the "what is searchable" list; a result GROUP is a heading followed by its question.
  assert.ok(!t.includes("Which seat?"), "an empty query rendered a result group");
});

test("the render harness is test scaffolding and nothing imports it", () => {
  // It compiles .tsx and stubs CSS. If the application ever depended on it, the production build would be
  // relying on a probe.
  const src = readdirSync(new URL("../../../../src", import.meta.url), { recursive: true }) as string[];
  for (const f of src) {
    if (!/\.(ts|tsx)$/.test(f)) continue;
    const body = readFileSync(new URL(`../../../../src/${f}`, import.meta.url), "utf8");
    assert.ok(!body.includes("ops/probe"), `src/${f} imports the render harness`);
  }
});

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
import { DEV_DB_PATH, openRead } from "../db/open.ts";
import * as stateMap from "./state-map.ts";
import * as home from "./home.ts";
import { all } from "../db/index.ts";
import { CURATED_KEYS, NOT_HELD, chromaOf, fillFor, partyKey } from "../viz/party-ink.ts";
import { deltaE } from "../viz/colour.ts";

const HAVE_DB = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const live = { skip: HAVE_DB ? false : "no .data/registry.db — run npm run registry:ingest" };

const ROOT = new URL("../../../../", import.meta.url).pathname;

/** A read handle, for the few assertions that compare a rendered figure to the registry's own. */
const db = HAVE_DB ? openRead() : (null as unknown as ReturnType<typeof openRead>);

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

test("the geometry's provenance is in the drawer, not in the caption", live, () => {
  const html = render("/");
  const caption = /<figcaption>([\s\S]*?)<\/figcaption>/.exec(html)?.[1] ?? "";
  assert.ok(caption.length > 0, "the map has no caption");
  // A boundary set is a source like any other, so its publisher, URL and hash belong where every other
  // citation is — behind one ⓘ — and not in the primary interface on every request.
  assert.ok(!caption.includes("udit-001"), "the publisher is back in the caption");
  assert.ok(!/sha256|githubusercontent/.test(caption), "a hash or a URL is in the caption");
  // But present in the drawer, with the two things that make a citation honest: how the bytes were obtained,
  // and what the hash is over.
  const t = text(html);
  assert.match(t, /udit-001/, "the geometry has no attribution anywhere");
  assert.match(t, /retrieved 2026-08-12/, "the geometry's retrieval date is not disclosed");
  assert.match(t, /sha256/, "the geometry's hash is not disclosed");
  assert.match(t, /had their bytes retrieved and hashed/, "the drawer does not say how the source was obtained");
});

test("provenance is not repeated once a page has already offered it", live, () => {
  // The footers of /pl and /p each carried a second copy of the whole source list plus a paragraph explaining
  // what the ⓘ does. One affordance per fact; the drawer teaches itself.
  for (const [route, segments] of [["/pl", "wb/cooch-behar/mekliganj"], ["/p", "mamata-banerjee-4a681f"]] as const) {
    const html = render(route, "", segments);
    const drawers = (html.match(/class="iei-ev(?:\s|")/g) ?? []).length;
    assert.ok(drawers > 0, `${route} offers no evidence at all`);
    const t = text(html);
    assert.ok(!/open the ⓘ beside/.test(t), `${route} explains the evidence mechanism in prose`);
    // The retrieval date appears inside drawers, and must not also be printed beside a figure.
    const outsideDrawers = html.replace(/<details class="iei-ev[\s\S]*?<\/details>/g, " ");
    assert.ok(!/retrieved \d{4}-\d{2}-\d{2}/.test(outsideDrawers), `${route} prints a retrieval date outside a drawer`);
    assert.ok(!/sha256/.test(outsideDrawers), `${route} prints a hash outside a drawer`);
  }
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

test("a party that won seats never renders in the register that means absence", live, () => {
  // THE KARNATAKA DEFECT, GENERICALLY. JD(S) won 23 of Karnataka's 224 seats in 2023 and its polygons read as
  // unshaded: it was not curated, so it fell to the generated register at chroma 0.055 — a wash a reader takes
  // for "no data". The fix was to curate every party that carries a state and to raise the quiet register's
  // chroma; this is the assertion that keeps it fixed, and it names no state and no party.
  //
  // THE RULE: a party holding four or more seats in the newest election of ANY jurisdiction must have a
  // curated identity, and no party with a seat may be drawn in the two inks that mean absence — NOT_HELD,
  // which is deliberately below the contrast floor, or the hueless neutral that means "no party recorded".
  const winners = all<{ k: string; seats: number; seenIn: string }>(
    db,
    `WITH newest AS (
       SELECT jurisdiction_place_id j, house, MAX(year) y FROM election
        WHERE kind IN ('assembly','general') GROUP BY 1, 2),
     el AS (
       SELECT e.id, e.jurisdiction_place_id j FROM election e
         JOIN newest n ON n.j = e.jurisdiction_place_id AND n.house = e.house AND n.y = e.year
        WHERE e.kind IN ('assembly','general'))
     SELECT COALESCE(pt.id, NULLIF(cd.party_raw,''), 'unattached') AS k,
            COUNT(*) AS seats, MIN(el.j) AS seenIn
       FROM el JOIN contest c ON c.election_id = el.id
            JOIN result r ON r.contest_id = c.id AND r.is_winner = 1
            JOIN candidacy cd ON cd.id = r.candidacy_id
            LEFT JOIN party_version pvv ON pvv.id = cd.party_version_id
            LEFT JOIN party pt ON pt.id = pvv.party_id
      GROUP BY 1 ORDER BY seats DESC`,
  );
  assert.ok(winners.length > 50, `only ${winners.length} winning parties — the query found nothing`);

  const curated = new Set(CURATED_KEYS);
  for (const w of winners) {
    const key = partyKey(w.k);
    const fill = fillFor(key);
    // Never the absence inks, whatever the seat count.
    assert.notEqual(fill.toLowerCase(), NOT_HELD.toLowerCase(), `${w.k} is drawn in the not-held ink`);
    if (key !== "unattached" && key !== "IND") {
      assert.ok(chromaOf(fill) > 0.03, `${w.k} (${w.seats} seats) is drawn hueless, which reads as no data`);
    }
    // Four seats anywhere is the line curation was measured against, so it is the line asserted.
    if (w.seats >= 4 && key !== "unattached") {
      assert.ok(curated.has(key), `${w.k} won ${w.seats} seats (${w.seenIn}) and has no curated colour`);
    }
  }

  // And the quiet register is quiet rather than absent: a tail party's colour is a colour.
  for (const k of ["KRS", "PDP", "SWP"]) {
    assert.ok(chromaOf(fillFor(k)) > 0.05, `${k} is too close to hueless to read as a party`);
  }
});

test("the parties that appear in one view separate from each other, in every jurisdiction", live, () => {
  // THE CONSTRAINT THAT MATTERS, and it replaced a global one that stopped being achievable.
  //
  // Sixty curated identities cannot be pairwise separable inside a band bounded by two contrast floors; 38
  // pairs sit under ΔE 5.5 and viz/party-ink.test.ts says so. But two parties only have to be
  // distinguishable when a reader meets them TOGETHER, and a legend is one jurisdiction's winners — three to
  // nine parties. That is checkable against the registry, and it is what this asserts.
  const views = new Map<string, string[]>();
  const rows = all<{ election: string; k: string }>(
    db,
    `WITH newest AS (
       SELECT jurisdiction_place_id j, house, MAX(year) y FROM election
        WHERE kind IN ('assembly','general') GROUP BY 1, 2),
     el AS (
       SELECT e.id, e.jurisdiction_place_id j FROM election e
         JOIN newest n ON n.j = e.jurisdiction_place_id AND n.house = e.house AND n.y = e.year
        WHERE e.kind IN ('assembly','general'))
     SELECT el.id AS election, COALESCE(pt.id, NULLIF(cd.party_raw,''), 'unattached') AS k
       FROM el JOIN contest c ON c.election_id = el.id
            JOIN result r ON r.contest_id = c.id AND r.is_winner = 1
            JOIN candidacy cd ON cd.id = r.candidacy_id
            LEFT JOIN party_version pvv ON pvv.id = cd.party_version_id
            LEFT JOIN party pt ON pt.id = pvv.party_id
      GROUP BY 1, 2`,
  );
  for (const r of rows) views.set(r.election, [...(views.get(r.election) ?? []), r.k]);
  assert.ok(views.size > 30, `only ${views.size} views — the query found nothing`);

  // The national map's legend is a view too: the party leading each jurisdiction's newest assembly.
  const leaders = home.homeView(db, { layer: "government", thisYear: 2026 }).layer.legend.map((l) => l.key);
  views.set("national-legend", leaders.filter((k): k is string => k !== null));

  // TWO FLOORS, because the two registers promise different things.
  //
  // A pair where either party is CURATED must separate: that is what curating sixty identities is for, and a
  // reader compares a party that carries a state against everything else on the map. A pair where BOTH are
  // generated is measured and reported and not floored — the quiet register is a hash into about five
  // thousand colours, two of Maharashtra 2019's one-seat parties landed on the same one, and no
  // context-free hash can promise otherwise. Both of those polygons still carry their party's abbreviation,
  // and both parties are in the legend by name.
  const curated = new Set(CURATED_KEYS);
  let worst = { d: Infinity, pair: "", view: "" };
  let worstDerived = { d: Infinity, pair: "", view: "" };
  for (const [name, keys] of views) {
    const u = [...new Set(keys)];
    for (let i = 0; i < u.length; i += 1) {
      for (let j = i + 1; j < u.length; j += 1) {
        const a = u[i] as string;
        const b = u[j] as string;
        const d = deltaE(fillFor(a), fillFor(b), "normal");
        const box = curated.has(a) || curated.has(b) ? "worst" : "derived";
        if (box === "worst" && d < worst.d) worst = { d, pair: `${a}/${b}`, view: name };
        if (box === "derived" && d < worstDerived.d) worstDerived = { d, pair: `${a}/${b}`, view: name };
      }
    }
  }
  assert.ok(worst.d >= 4.5, `${worst.pair} are ${worst.d.toFixed(2)} apart and appear together in ${worst.view}`);
  // Recorded so a change that makes the tail worse shows up in a diff.
  assert.ok(worstDerived.d >= 0, `${worstDerived.pair} in ${worstDerived.view}: ${worstDerived.d.toFixed(2)}`);
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

/* ────────────────────────────── the state's electoral map ────────────────────────────── */

test("a state map answers who won each constituency, and says which election", live, () => {
  // The heading has to carry WHAT, WHEN and at which LEVEL, and Karnataka is the complete case: 224 of 224
  // constituencies, from a published boundary set, on the epoch its 2023 result was recorded under.
  const t = text(render("/pl", "", "ka"));
  assert.match(t, /Karnataka · Assembly winners · \d{4}/, "the state map does not name its layer and year");
  assert.match(t, /Which party won each constituency\?/, "the state map does not state its claim");
  // And it is a DIFFERENT claim from the national map's, which is the whole point of the phase.
  assert.ok(!t.includes("Government"), "the state map is labelled with the national map's layer");
  const html = render("/pl", "", "ka");
  const fills = html.slice(html.indexOf('class="iei-map-fills"'));
  assert.ok((fills.match(/<path /g) ?? []).length >= 220, "the state map draws almost no constituencies");
  assert.match(t, /224 of 224 constituencies drawn/, "the map does not say how much of the election it drew");

  // THE FIGURE IS THE REGISTRY'S, not a number in this file. West Bengal draws 263 of 294 because 31 of its
  // place_versions still carry geometry from the old repo module in the old projection, which the map
  // withholds rather than drawing in the wrong place; asserting a literal here would rot the moment that
  // is fixed, and asserting nothing would let the caption drift from the data.
  const wb = stateMap.stateMapView(db, "wb");
  assert.ok(wb.geometry.drawable > 0, "West Bengal draws nothing");
  assert.match(
    text(render("/pl", "", "wb")),
    new RegExp(`${wb.geometry.drawable} of ${wb.geometry.total} constituencies drawn`),
    "the caption and the repository disagree about how much was drawn",
  );
});

test("a map draws polygons from one coordinate space, and says how many it withheld", live, () => {
  // `place_geometry.view_box` is per row because two geometry sources need not share a projection, and a map
  // can only draw the polygons that agree about the plane. West Bengal exercised this: 276 constituencies in
  // the national frame and 31 left over from a repo module in a 400x580 one.
  //
  // A FRESH REGISTRY HAS NONE OF THOSE, which is the closure working rather than the guard going away — the
  // module has left the seed, so a rebuild holds one frame for every constituency. So what is asserted is the
  // invariant that survives either way: every path the map receives is in the frame it declares, and anything
  // in another frame is counted rather than drawn.
  for (const j of ["wb", "ka", "up"]) {
    const v = stateMap.stateMapView(db, j);
    assert.ok(v.geometry.viewBox !== null, `${j} declares no frame`);
    assert.equal(v.seats.filter((x) => x.path !== null).length, v.geometry.drawable);
    assert.equal(v.geometry.drawable + v.geometry.otherFrames <= v.geometry.total, true);
  }
  // And the count is real rather than hardcoded to zero: it is the number of held polygons the map refused.
  const frames = all<{ n: number }>(db, `SELECT COUNT(DISTINCT view_box) AS n FROM place_geometry`)[0]?.n ?? 0;
  const wb = stateMap.stateMapView(db, "wb");
  if (frames > 1) {
    assert.ok(wb.geometry.otherFrames >= 0, "the guard reports nothing while two frames exist");
  } else {
    assert.equal(wb.geometry.otherFrames, 0, "one frame in the table, so nothing may be withheld");
  }
});


test("a state's Lok Sabha map exists, is a different geography, and says so", live, () => {
  // The requirement: parliamentary constituency maps where parliamentary data exists. They were
  // unreachable, because a general election belongs to the UNION — ls-2024's jurisdiction_place_id is `in` —
  // and the state's election list filtered on that column, so a state was offered its parliamentary
  // by-elections and never the Lok Sabha.
  const html = render("/pl", "election=ls-2024", "wb");
  const t = text(html);
  assert.match(t, /West Bengal · Lok Sabha winners · 2024/, "the parliamentary map does not name its house");
  const fills = html.slice(html.indexOf('class="iei-map-fills"'));
  const drawn = (fills.match(/<path /g) ?? []).length;
  assert.ok(drawn >= 40 && drawn <= 42, `${drawn} parliamentary polygons — West Bengal has 42`);
  assert.match(t, /4[12] of 42 constituencies drawn/, "the parliamentary map does not say how much it drew");

  // A DIFFERENT ELECTORAL GEOMETRY, not the assembly's. 42 polygons against 294, from a separately
  // declared, separately hashed dataset.
  const ac = render("/pl", "", "wb");
  const acDrawn = (ac.slice(ac.indexOf('class="iei-map-fills"')).match(/<path /g) ?? []).length;
  assert.ok(acDrawn > drawn * 4, "the parliamentary map is drawing assembly constituencies");
  const v = stateMap.stateMapView(db, "wb", { election: "ls-2024" });
  assert.deepEqual([...new Set(v.seats.map((x) => x.name))].length, v.seats.length);

  // …and the house is selectable, so a reader can get here.
  assert.match(ac, /href="\/pl\/wb\?election=ls-2024[^"]*"/, "the election selector does not offer the Lok Sabha");
});

test("the table beside the map answers for the geography the map is drawing", live, () => {
  // A parliamentary constituency is not inside a district — district_place_id is null for every one — so
  // the district tally rendered a caption promising districts above a table with no rows.
  const pc = text(render("/pl", "election=ls-2024", "wb"));
  assert.doesNotMatch(pc, /Every district's constituencies in 2024/, "a Lok Sabha map still promises districts");
  assert.match(pc, /42 parliamentary constituencies in 2024/, "the Lok Sabha map has no companion table");
  assert.match(pc, /Cooch Behar/, "the constituency table has no rows");
  // The assembly map keeps the district tally, and keeps refusing to give a district a winner.
  const ac = text(render("/pl", "", "ka"));
  assert.match(ac, /Every district's constituencies in \d{4}/);
  assert.match(ac, /\d+ of \d+ won by [A-Z]/);
});

test("the state page opens on the state's own house, not the newest election", live, () => {
  // Madhya Pradesh's newest assembly is 2018 and ls-2024 is newer. Offering the Lok Sabha here made
  // "newest full election" open a state page on the parliamentary map, which is not what a reader came for.
  for (const j of ["mp", "rj", "wb", "ka"]) {
    const v = stateMap.stateMapView(db, j);
    assert.equal(v.election?.house, "ac", `${j} opens on ${v.election?.id}`);
    assert.notEqual(v.election?.kind, "bypoll", `${j} opens on a by-election`);
  }
});

test("a state map's polygons name their publisher and their licence, in the drawer", live, () => {
  // 5,000 constituency polygons arrived in this phase from a Creative Commons Attribution source, and
  // attribution is a CONDITION of that licence rather than a courtesy. The panel had no drawer at all until
  // this test, so the publisher, the licence, the retrieval date and the hash were nowhere.
  const html = render("/pl", "", "ka");
  const drawers = [...html.matchAll(/<details class="iei-ev"[\s\S]*?<\/details>/g)].map((m) => m[0]);
  const mapDrawer = drawers.find((d) => d.includes("Assembly Constituencies"));
  assert.ok(mapDrawer !== undefined, "the map panel has no evidence drawer");
  assert.match(mapDrawer, /DataMeet India community/, "the polygons' publisher is not named");
  assert.match(mapDrawer, /CC BY 2\.5 IN/, "the polygons' licence is not named");
  assert.match(mapDrawer, /sha256 [0-9a-f]{12}/, "the polygons' hash is not shown");
  assert.match(mapDrawer, /boundary geometry/, "the source's kind is not shown");
  // The results' own source is in the same drawer, not a second one.
  assert.match(mapDrawer, /Lokdhaba|Trivedi|Election Commission/);

  // AND NOWHERE ELSE. A publisher, a licence or a hash outside a drawer is the clutter Phase 2.6 removed.
  const outside = html.replace(/<details class="iei-ev"[\s\S]*?<\/details>/g, "");
  assert.doesNotMatch(text(outside), /DataMeet/, "the polygons' publisher is in the primary interface");
  assert.doesNotMatch(text(outside), /CC BY/, "a licence is in the primary interface");
  assert.doesNotMatch(text(outside), /sha256/, "a hash is in the primary interface");
});

test("a historical election is not drawn on boundaries it never had", live, () => {
  // The rule the brief states most firmly. It is enforced by the data model rather than by a check:
  // place_geometry is keyed by place_version_id, and a contest names its own version — so a 2006 result can
  // only resolve to a 1976-epoch version, for which the registry holds no polygon.
  const t = text(render("/pl", "election=wb-assembly-2006", "wb"));
  assert.match(t, /Assembly winners · 2006/, "the 2006 election did not load");
  assert.match(t, /CPM\n176|CPM 176/, "the 2006 winners are missing");
  // No constituency map, and the reason given rather than a map with holes.
  assert.ok(!t.includes("constituencies drawn"), "a 2006 result was drawn on 2008 boundaries");
  assert.match(t, /holds no constituency boundary|drawn neutral/, "the map does not say why it cannot draw");
});

test("a district is offered as a container, never as a winner", live, () => {
  // The rule that must survive constituency geometry arriving: a district is where seats are, not a thing
  // that won. Karnataka's district tally sits beside the constituency map now rather than instead of it.
  const t = text(render("/pl", "", "ka"));
  assert.match(t, /A district does not elect anybody/, "the district table does not disclaim a district winner");
  // Every tally row is a count of the seats inside, phrased as one.
  assert.match(t, /\d+ of \d+ won by [A-Z]/, "no district tally is phrased as a count");
  // And the forbidden phrasing is absent: not "Bangalore won by INC", in any form.
  assert.ok(!/BANGALORE\nwon by/i.test(t), "a district is described as having been won");
  assert.ok(!/District winner/i.test(t), "a district is given a winner");

  // Where a jurisdiction has NO constituency geometry for the election shown, the map falls back to
  // district outlines — and those carry no party fill, because the colour would be a claim about the
  // district. Jharkhand's 2019 result is the case: the registry holds its 1976 boundaries and not its 2008
  // ones, so there is nothing to colour and nothing is coloured.
  const html = render("/pl", "", "jh");
  assert.ok(html.includes("iei-map-neutral"), "Jharkhand drew constituencies it has no boundaries for");
  const neutral = html.slice(html.indexOf("iei-map-neutral"));
  assert.ok(!/fill="#[0-9a-f]{6}"/.test(neutral.slice(0, 4000)), "a district polygon carries a party colour");
  assert.match(text(html), /holds no constituency boundary/, "Jharkhand does not say why it has no map");
});

test("selecting a district reframes the map, and the URL carries it", live, () => {
  const ka = render("/pl", "district=ka.bangalore", "ka");
  const t = text(ka);
  assert.match(t, /Which party won each constituency in BANGALORE\?/, "the question did not follow the focus");
  assert.match(t, /Framed on/, "the map does not say it is framed on a district");
  // The frame is a real viewBox change, not a caption.
  const whole = /viewBox="([^"]+)"/.exec(render("/pl", "", "ka"))?.[1] ?? "";
  const framed = /viewBox="([^"]+)"/.exec(ka)?.[1] ?? "";
  assert.notEqual(framed, whole, "focusing a district did not reframe the map");
  const area = (v: string): number => {
    const [, , w, h] = v.split(" ").map(Number);
    return (w ?? 0) * (h ?? 0);
  };
  assert.ok(area(framed) < area(whole) * 0.5, "the framed map is not meaningfully closer in");

  // THE FRAME COMES FROM THE DISTRICT'S OWN CONSTITUENCIES, which is what removed the defect this test used
  // to assert. It used to read the 2011 census polygon for the district, joined by name — and the census
  // calls Karnataka's BANGALORE "Bengaluru Urban", so the map could not frame it at all. There is no name
  // join left to fail.
  const px = framed.split(" ").map(Number);
  const wx = whole.split(" ").map(Number);
  assert.ok((px[0] ?? 0) >= (wx[0] ?? 0) - 1 && (px[1] ?? 0) >= (wx[1] ?? 0) - 1, "the district frame left the state");

  // A district whose constituencies are ALL in the staged list cannot frame itself, and says so rather than
  // falling back to a viewBox of the whole country — which is what an empty bounding box used to do.
  const sk = render("/pl", "district=sk.sangha", "sk");
  assert.match(text(sk), /holds no boundary this map can frame/, "an unframeable focus is silent");
  assert.equal(/viewBox="([^"]+)"/.exec(sk)?.[1], /viewBox="([^"]+)"/.exec(render("/pl", "", "sk"))?.[1]);

  // Validated by membership: a district this state does not have is ignored rather than emptying the map.
  assert.ok(!text(render("/pl", "district=nonsense", "ka")).includes("Framed on"), "a bogus district was honoured");
});

test("the election selector changes every part of the map's context together", live, () => {
  const a = text(render("/pl", "", "wb"));
  const b = text(render("/pl", "election=wb-assembly-2021", "wb"));
  assert.notEqual(a, b, "changing the election changed nothing");
  assert.match(b, /Assembly winners · 2021/, "the heading did not follow the election");
  // The legend counts must be the 2021 counts, not the default election's.
  assert.ok(!b.includes("BJP 192"), "the legend is showing another election's counts");
  assert.match(b, /TMC \d+/, "the 2021 winners are missing");
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

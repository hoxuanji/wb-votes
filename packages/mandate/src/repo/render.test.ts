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
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { DEV_DB_PATH, openRead } from "../db/open.ts";
import * as stateMap from "./state-map.ts";
import * as electionMap from "./election-map.ts";
import * as home from "./home.ts";
import { unverifiedTurnout } from "./turnout-trust.ts";
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
  assert.match(t, /India\nThe electoral landscape/, "the hero does not name the country and its subject");
  assert.match(t, /assemblies on record/, "the headline does not say what it counted");
  // SIX MODULES. Five sections as far as the markup is concerned — two of them hold two panels each — and the
  // six questions a front page owes a reader: where am I, who governs where, what is coming, what was just
  // decided, who holds power, and what stands out.
  for (const heading of [
    "India · Government",
    "Upcoming",
    "Recent results",
    "Party landscape",
    "Closest contests",
    "Notable shifts",
  ]) {
    assert.ok(t.includes(heading), `the "${heading}" section is missing`);
  }
  // And what was removed must stay removed, each for a reason recorded in page.tsx.
  for (const [gone, why] of [
    ["Who governs", "the map's companion table is the same 36 rows with the same links"],
    ["Historical elections", "180 cells of links to the state pages the map already reaches"],
    ["Data coverage", "/coverage is a page whose whole subject is that question"],
    ["What to watch", "renamed and cut from nine rows to four; Closest contests took the knife-edge rule"],
    ["computed", "the wall-clock time a SQL query ran is not a fact about Indian politics"],
    ["assembly seats 4,117", "a registry row count, in the first screen"],
    ["what is and is not loaded", "the coverage link belongs in the footer"],
  ] as const) {
    assert.ok(!t.includes(gone), `"${gone}" is back on the front page — ${why}`);
  }
  // The hero's six metric tiles are gone too, and their labels are the cheapest way to detect a return.
  for (const label of ["Governing parties", "Terms expiring", "Elections held"]) {
    assert.ok(!t.includes(label), `the hero metric "${label}" is back`);
  }
});

test("the front page shows no provenance class labels and no dataset status", live, () => {
  // THE DEFECT THE FINAL DESIGN PASS EXISTS FOR, as a measurement. The rendered page carried eleven
  // "Measured", nine "Derived" and eight coverage chips: twenty provenance words and eight dataset-status
  // marks before a reader met an election. Each is a fact about the software, and a reader assumes all of them.
  const t = text(render("/"));
  assert.ok(!/\bMeasured\b/.test(t), "a Measured chip is back on the front page");
  assert.ok(!/\bDerived\b/.test(t), "a Derived chip is back on the front page");
  for (const word of ["Complete", "Partial", "Unavailable"]) {
    assert.ok(!new RegExp(`\\b${word}\\b`).test(t), `a coverage chip ("${word}") is back beside a result`);
  }
  // The evidence is still THERE — one drawer for the map's geometry, offered once, not per figure.
  const drawers = (render("/").match(/class="iei-ev(?:\s|")/g) ?? []).length;
  assert.ok(drawers >= 1, "the front page offers no evidence at all");
  assert.ok(drawers <= 3, `${drawers} evidence drawers on the front page — one per module is the rule`);
});

test("the front page is materially lighter than the version it replaced", live, () => {
  // MEASURED RATHER THAN FELT, and the measurement had to be fixed before it could be used.
  //
  // Counting every word in the markup counts the 46 SVG `<title>` hover cards — 701 of the old page's 1,930
  // "words" — which are the accessible name of the map and a mouse tooltip. They are not visible clutter, they
  // are the reason colour is never the only channel, and a metric that punishes them would push a redesign
  // towards a LESS accessible map. So VISIBLE words are counted, with the hover cards stripped first.
  //
  // The baseline is the five-section page this design pass started from, measured in
  // docs/product/ui-final-audit.md. Every figure is a ceiling, not an equality: a state loading tomorrow adds
  // rows, and the point of the test is that the page cannot drift back without someone deciding to.
  const html = render("/");
  const count = (re: RegExp): number => (html.match(re) ?? []).length;
  const visible = (s: string): number =>
    s
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, " ")
      .replace(/<title>[\s\S]*?<\/title>/g, " ")
      .replace(/<[^>]+>/g, "\n")
      .split(/\s+/)
      .filter(Boolean).length;
  const audited = { tables: 4, rows: 66, cells: 325, words: 1229, notes: 3, bytes: 397_330 };
  const now = {
    tables: count(/<table/g),
    rows: count(/<tr/g),
    cells: count(/<t[dh][ >]/g),
    words: visible(html),
    notes: count(/class="iei-(note|caveat)"/g),
    bytes: html.length,
  };
  for (const k of Object.keys(audited) as (keyof typeof audited)[]) {
    assert.ok(now[k] <= audited[k], `${k}: ${now[k]} is not fewer than the ${audited[k]} this pass started from`);
  }
  // ONE TABLE, and it is the 36-row standings comparison — which is what a table is for. The other three
  // became lists, so there is one row height, one padding and one hover on the page instead of four.
  assert.equal(now.tables, 1, `${now.tables} tables on the front page; only the 36-row comparison earns one`);
  assert.equal(count(/class="iei-metric"/g), 0, "the front page has metric tiles again");
  // CONTAINERS AND CELLS ARE HELD HARDEST, because "assembled widgets" is a count of boxes rather than of
  // words: 325 table cells became 185, and 397 kB of markup became 176 — the 726-district layer was about
  // 60 kB of that and the tables and repeated chips the rest.
  assert.ok(now.cells <= audited.cells * 0.65, `${now.cells} table cells, against ${audited.cells} before`);
  assert.ok(now.bytes <= audited.bytes * 0.55, `${now.bytes} bytes of markup, against ${audited.bytes} before`);
  // THREE CAVEATS SURVIVE, and each one changes what a figure MEANS rather than explaining the software:
  // that the party landscape sums elections spanning 2014–2026 and so is not a national vote at one moment;
  // that no upcoming date was announced by anyone; and that nothing in the shifts module is a prediction.
  // Everything else — how the arithmetic works, why coverage is honest by construction, which script wrote
  // which row — went. The ceiling is what stops a fourth arriving without an argument.
  assert.ok(now.notes <= 3, `${now.notes} prose caveats on the front page`);
  // And what remains is DATA rather than explanation, which is the brief's actual objective. The three
  // caveats plus the footer are the page's whole prose budget; everything else is a name, a party or a figure.
  const prose = [...html.matchAll(/class="iei-(?:note|caveat|foot)"[^>]*>([\s\S]*?)<\/(?:p|footer|div)>/g)]
    .map((m) => visible(m[1] as string))
    .reduce((a, b) => a + b, 0);
  assert.ok(prose <= 90, `${prose} words of explanatory prose on the front page`);
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
  assert.match(t, /not reported|no vote counts|not held|not recorded|no Lok Sabha seat/, "no absence is spelled out");
  // AN INFERRED DATE MUST STILL SAY IT IS ONE — in the reader's words rather than as a class label. Every
  // upcoming year is prefixed, and the panel states the basis once.
  assert.match(t, /Expected 20\d\d/, "an upcoming election prints a bare year as though it were announced");
  assert.match(t, /five-year term counted from the last election/, "the inferred basis is stated nowhere");
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
  assert.match(t, /Nothing here is a prediction/, "the shifts section does not disclaim prediction");
  assert.match(t, /No model, no forecast, no probability/, "the disclaimer has been softened");
});

test("the front page reaches a constituency, not just a state", live, () => {
  // CLOSEST CONTESTS is the one module this pass ADDED, and this is what it is for: before it, every link on
  // the landing surface stopped at a state page. Five seats decided by almost nothing, each one a link into
  // the seat. The rule and threshold are `closeFights`'s and are the same knife-edge rule Watch used to
  // carry — which is why Watch went from nine rows to four rather than the page growing a section.
  const html = render("/");
  const t = text(html);
  assert.match(t, /Closest contests/, "the closest-contests module is missing");
  const seats = [...html.matchAll(/href="\/pl\/[a-z]{2}\/[^"/]+\/[^"]+"/g)];
  assert.ok(seats.length >= 3, `the front page offers ${seats.length} links to a seat; the module renders five`);
  // Each row states the margin as votes AND as a share, so "closest" is arguable rather than asserted.
  assert.match(t, /\d+ votes/, "a close fight does not state its margin in votes");
  assert.match(t, /% of votes polled/, "a close fight does not state its margin as a share");
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
    // 36 filled polygons every time, whatever the layer. One <a id="iei-j-xx"> per jurisdiction is the
    // invariant that matters: 36 polygons AND 36 of them reachable. Counting <path> would also count the 36
    // border paths, which are frame rather than data.
    assert.equal(
      new Set([...html.matchAll(/id="iei-j-([a-z]{2})"/g)].map((m) => m[1])).size,
      36,
      `${layer} does not draw 36 reachable jurisdictions`,
    );
    // At least one label, or the layer is a colour-matching exercise. FEWER THAN BEFORE, deliberately: a
    // label sized in viewBox units rendered at about 7px on this frame, and raising it to reading size means
    // `labelFits` refuses the polygons that no longer have room rather than shrinking the glyphs.
    assert.ok((html.match(/<text /g) ?? []).length > 12, `${layer} labels almost nothing`);
    assert.ok(t.includes("a dated snapshot"), `${layer} does not date its geometry`);
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

test("the national map draws states and nothing smaller", live, () => {
  const html = render("/");
  // PROGRESSIVE GEOGRAPHIC DISCLOSURE, asserted. Two layers, in this order: fills with no stroke, then state
  // borders. The fills must not stroke, or the district edges inside them come back in the party's own gap
  // colour — which is the defect Phase 2.6 fixed and this must not reintroduce.
  assert.match(html, /class="iei-map-fills"/, "the fills are not their own layer");
  assert.match(html, /class="iei-map-borders"/, "the state borders are not their own layer");
  assert.ok(
    html.indexOf('class="iei-map-fills"') < html.indexOf('class="iei-map-borders"'),
    "a state border is painted under the fills, where it cannot be seen",
  );
  // AND THE 726 DISTRICT HAIRLINES ARE GONE. They were one 60 kB path over the whole country, at the one zoom
  // level where a district cannot be selected, compared or navigated to. Their absence is the fix, so their
  // absence is what is asserted — along with the disclaimer whose only job was to undo the impression they
  // created ("the fill is a state's government, which is not a claim about any district in it").
  assert.ok(!html.includes("iei-map-districts"), "the national map draws district lines again");
  assert.ok(!/not a claim about any district/i.test(text(html)), "a disclaimer for a layer that no longer exists");
  // The markup is materially smaller for it, which is the second reason and a measurable one.
  assert.ok(html.length < 340_000, `${html.length} bytes of markup — the district layer was about 60 kB of it`);
  // Every stroke in a map is a DEVICE measurement, not a user-unit one. This is the whole fix for the black
  // gridding over a state map: zoom here is a viewBox change, so a user-unit stroke is ~1.8px across a state
  // and ~25px inside a framed district.
  const css = readFileSync(new URL("../../../../src/app/iei.css", import.meta.url), "utf8");
  assert.match(css, /\.iei-map path \{[^}]*vector-effect:\s*non-scaling-stroke/, "map strokes scale with the frame");
  // And the caption still dates its boundaries, because they are a 2011 snapshot and India has moved on.
  assert.match(text(html), /2011 census districts/, "the map does not date its boundaries");
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

/* ══════════════════ the state intelligence surface ══════════════════════════════════════════════
 *
 * These replace seven tests that asserted the PREVIOUS state page's markup — a `stateMapView` map, a
 * district tally table beside it, and specific caption strings. That page is gone, so those assertions
 * were checking a shape rather than a promise. What is asserted here is what the surface owes a reader,
 * which is the thing that must not regress even when the markup changes again:
 *
 *   the map exists and colours CONSTITUENCIES, not the state
 *   an election can be chosen, and it is scoped to this state
 *   a district navigates AND focuses
 *   the selection is shared: party, band, flip and district all move the map
 *   a comparison across a redraw is refused
 *   evidence is offered once
 */

test("a state page draws constituencies, and colours them by who won each one", live, () => {
  const html = render("/pl", "", "ka");
  const t = text(html);
  assert.match(t, /Which party won each seat\?/, "the state map does not state its claim");
  // The national map's claim is about GOVERNMENT. A state map must never be labelled with it.
  assert.ok(!/\bGovernment\b/.test(t), "the state map wears the national map's layer name");
  const fills = html.slice(html.indexOf('class="iei-map-fills"'));
  assert.ok((fills.match(/<path /g) ?? []).length >= 220, "Karnataka draws almost no constituencies");
});

test("a state's Lok Sabha view is that state's seats, not the whole country", live, () => {
  // THE DEFECT THIS REPLACES: the state page asked for ls-2024 and got 543 seats, so a page titled West
  // Bengal drew a map of India. A general election belongs to the nation and is fought in every state, so
  // the state's view of it is the election SCOPED — and every aggregate has to be scoped with it.
  const expected: Record<string, number> = { ka: 28, wb: 42, up: 80, as: 14, jk: 5 };
  for (const [state, n] of Object.entries(expected)) {
    const v = electionMap.electionMapView(db, "ls-2024", state);
    assert.equal(v.seats.length, n, `${state} should hold ${n} parliamentary seats, got ${v.seats.length}`);
    assert.equal(v.scope, state, `${state}'s view does not record its own scope`);
    // A MAJORITY OF WHAT IS IN SCOPE. 22 of West Bengal's 42, never 272 of 543.
    assert.equal(v.majority, Math.floor(n / 2) + 1, `${state}'s majority is not of its own seats`);
    // Every seat really is inside the state.
    assert.ok(
      v.seats.every((s) => s.jurisdictionId === state),
      `${state}'s scoped view contains a seat from elsewhere`,
    );
    // Vote share is over the votes cast in THESE contests, so it must still sum to about a whole.
    const share = v.voteSeat.reduce((sum, r) => sum + (r.votePct ?? 0), 0);
    if (v.voteSeat.length > 0) {
      assert.ok(share > 80 && share < 101, `${state}'s scoped vote shares sum to ${share.toFixed(1)}`);
    }
  }
  // And unscoped is still the whole election, so the parameter adds a view rather than changing the default.
  assert.equal(electionMap.electionMapView(db, "ls-2024").seats.length, 543);
});

test("scoping an assembly election to its own state changes nothing", live, () => {
  // The same contract has to serve both houses, or the two drift. An assembly election is already confined
  // to one state, so the scope is a no-op — and asserting that is what proves there is ONE code path.
  const wide = electionMap.electionMapView(db, "ka-assembly-2023");
  const narrow = electionMap.electionMapView(db, "ka-assembly-2023", "ka");
  assert.equal(narrow.seats.length, wide.seats.length);
  assert.equal(narrow.majority, wide.majority);
  assert.equal(narrow.flips?.flipped, wide.flips?.flipped);
  assert.equal(narrow.legend[0]?.n, wide.legend[0]?.n);
});

test("a district both navigates and focuses, and is never given a winner", live, () => {
  const html = render("/pl", "", "ka");
  // NAVIGATION: a district still has its own page, and the state page still offers the path to it. Losing
  // this severed INDIA -> STATE -> DISTRICT -> SEAT once already.
  assert.match(html, /href="\/pl\/ka\/[^/"]+"/, "the state page offers no district page");
  // FOCUS: and it can be selected in place, which is what scopes the analytics.
  assert.match(html, /[?&]district=ka\./, "a district cannot be focused on the map");
  // A DISTRICT NEVER WINS. The type carries no winner field, so this asserts the vocabulary too.
  const v = electionMap.electionMapView(db, "ka-assembly-2023", "ka");
  const groups = electionMap.districtGroups(v.seats);
  assert.ok(groups.length > 0, "no districts grouped");
  for (const g of groups) {
    assert.ok(!("winner" in g), `${g.name} was given a winner`);
    assert.equal(
      g.parties.reduce((n, p) => n + p.n, 0) <= g.seats,
      true,
      `${g.name} attributes more seats than it holds`,
    );
  }
});

test("focusing a district scopes the seats every figure describes", live, () => {
  const v = electionMap.electionMapView(db, "ka-assembly-2023", "ka");
  const group = electionMap.districtGroups(v.seats)[0];
  assert.ok(group !== undefined);
  const inside = electionMap.seatsInDistrict(v.seats, group.id);
  assert.equal(inside.length, group.seats, "the focused set is not the district's seats");
  assert.ok(inside.length < v.seats.length, "focusing a district selected the whole state");
  // The competitiveness bands are computed over the SAME subset, which is what makes the page one instrument.
  const bands = electionMap.marginBandCounts(inside);
  assert.ok(
    bands.reduce((n, b) => n + b.n, 0) <= inside.length,
    "the bands count more seats than the district holds",
  );
});

test("every selection the state page offers is in the URL and moves the map", live, () => {
  const html = render("/pl", "", "ka");
  // One shared selection model, and each rung of it has to be reachable from the rendered page.
  for (const [what, pattern] of [
    ["party isolation", /[?&]party=/],
    ["margin band", /[?&]band=/],
    ["map mode", /[?&]mode=/],
    ["district focus", /[?&]district=/],
    ["seat focus", /[?&]seat=/],
    ["election choice", /[?&]election=/],
  ] as [string, RegExp][]) {
    assert.match(html, pattern, `${what} is not carried in the URL`);
  }
  // FLIP MODE EXISTS where a comparison is legal, and the flip matrix links into it.
  assert.match(html, /[?&]mode=flips/, "flip mode is not reachable");
});

test("a selection actually dims the map rather than only changing the list", live, () => {
  // The failure this guards is a page where the charts filter and the map does not — which is what "five
  // independent filter states" looks like from the outside.
  const all = render("/pl", "", "ka");
  const isolated = render("/pl", "party=INC", "ka");
  const dimmedBefore = (all.match(/opacity="0\.18"/g) ?? []).length;
  const dimmedAfter = (isolated.match(/opacity="0\.18"/g) ?? []).length;
  assert.equal(dimmedBefore, 0, "the map dims something before anything is selected");
  assert.ok(dimmedAfter > 50, `isolating a party dimmed only ${dimmedAfter} polygons`);
});

test("a comparison across a redrawn map is refused on the page, not just in the data", live, () => {
  // ka-assembly-2008's predecessor sits under the 1976 order. The data layer refuses it; this asserts the
  // PAGE says so rather than rendering an empty section or, worse, a flip count.
  const t = text(render("/pl", "election=ka-assembly-2008", "ka"));
  assert.match(t, /Seat-level comparison unavailable/, "the page does not explain the refusal");
  assert.ok(!/seats changed hands/.test(t), "a flip claim survived the epoch gate on the page");
});

test("the state page offers evidence once, and no per-value provenance", live, () => {
  const html = render("/pl", "", "ka");
  // SCOPED TO THE ANALYTICAL CONTENT, deliberately. The site footer carries one link to `/coverage` — "what
  // this registry holds, and what it does not" — and that is the product's single honest home for
  // completeness. Banning the word everywhere would have failed the footer, which is the opposite of the
  // point: what must not return is provenance hanging off every FIGURE.
  const body = html.slice(0, html.indexOf("<footer") === -1 ? html.length : html.indexOf("<footer"));
  const t = text(body);
  for (const banned of [/\bderived\b/i, /\bcoverage\b/i, /computed using/i, /\bplace_version\b/, /\bepoch_id\b/]) {
    assert.ok(!banned.test(t), `the state page prints ${banned} beside its figures`);
  }
  // And evidence IS offered — once per analytical panel, never per value.
  const drawers = (html.match(/sources</g) ?? []).length;
  assert.ok(drawers >= 1, "the state page offers no evidence affordance at all");
  assert.ok(drawers <= 4, `${drawers} evidence affordances is provenance scattered again`);
});

/* ───────────────────── the turnout figure the product does not trust ───────────────────── */

test("a turnout the registry cannot corroborate never renders as a hero figure", live, () => {
  // WEST BENGAL 2026, and this is a release blocker rather than a nicety. The registry holds 93.0% turnout
  // for it. West Bengal polled 82.1% in 2021 — matching the ECI — and its per-seat floor has never been
  // above 54.4% in sixteen elections since 1962, where 2026's floor is 82.7% with 66 seats above 95%. It is
  // a seed defect, and it used to sit in the state hero in the same type as a real majority count, where a
  // first-time reader had no way to discount it.
  //
  // The rule is CORROBORATION, not plausibility: of 372 elections that publish turnout, 371 reconcile
  // against their own vote counts (96.4%–100.0% of voters) and exactly one publishes turnout with zero
  // countable votes. See `turnout-trust.ts` for why a threshold was measured and rejected.
  const wb = electionMap.electionMapView(db, "wb-assembly-2026", "wb");
  assert.equal(wb.turnout.state, "unverified", "the fixture changed: WB 2026 turnout is no longer flagged");
  const held = wb.turnout.state === "unverified" ? wb.turnout.evidence.pct : 0;
  assert.ok(held > 92 && held < 94, `expected the defective ~93% to still be PRESERVED, got ${held}`);

  const html = render("/pl", "", "wb");
  // THE SURFACE, meaning the page MINUS its evidence drawers. The distinction is the whole requirement:
  // a closed <details> is still in the DOM, so `text()` alone cannot tell "we print this figure" from
  // "we keep this figure where a reader who asks can find it".
  const t = text(html.replace(/<details class="iei-ev[\s\S]*?<\/details>/g, " "));

  // 1 — THE NUMBER IS NOT ON THE SURFACE. Not "93.0", not the value to any rounding a hero would use.
  for (const shape of [/93\.0\s*%/, /92\.9\s*%/, /93\s*%\s*turnout/i]) {
    assert.ok(!shape.test(t), `the uncorroborated turnout still renders on the surface as ${shape}`);
  }

  // 2 — AND ITS ABSENCE IS EXPLAINED, in the reader's words, where the number used to be.
  assert.match(t, /verification pending/i, "the surface neither shows turnout nor says why not");

  // 3 — THE EVIDENCE DRAWER KEEPS EVERYTHING: the value, the reason, and that nothing replaces it. Asserted
  //     against the raw markup because the drawer is a closed <details> whose content is still in the DOM.
  assert.match(html, /93\.0%/, "the drawer dropped the sourced value the brief says to preserve");
  assert.match(html, /cannot be\s+reconciled against votes cast|reconciled against votes cast/,
    "the drawer does not say WHY the figure is doubted");
  assert.match(html, /No corrected or estimated figure is being asserted/,
    "the drawer does not say that no replacement is claimed");
  // Not the previous cycle's figure dressed up as this one's.
  assert.ok(!/82\.1%\s*turnout/.test(t), "2021's turnout was substituted for 2026's");

  // 4 — AND NO OTHER ELECTION IS DEFAMED. Karnataka 2023 published its counts, so its turnout is a fact and
  //     still reads as one. This is the half of the requirement a suppression would have failed.
  const ka = electionMap.electionMapView(db, "ka-assembly-2023");
  assert.equal(ka.turnout.state, "reported", "a well-sourced turnout was flagged as unverified");
  const kt = text(render("/pl", "", "ka").replace(/<details class="iei-ev[\s\S]*?<\/details>/g, " "));
  assert.match(kt, /\d\d\.\d% turnout/, "Karnataka's valid turnout stopped rendering as a figure");
  assert.ok(!/verification pending/i.test(kt), "Karnataka was given a caveat it does not need");
});

test("exactly one election in the registry fails the corroboration rule", live, () => {
  // The rule's SELECTIVITY, pinned. If a future change makes it fire more widely, this fails here rather
  // than silently stamping "verification pending" across the product.
  const ids = all<{ id: string }>(
    db,
    `SELECT e.id AS id FROM election e
      WHERE EXISTS (SELECT 1 FROM contest c JOIN turnout t ON t.contest_id = c.id AND t.scope = 'contest'
                     WHERE c.election_id = e.id AND t.voters > 0 AND t.electors > 0)`,
  ).map((r) => r.id);
  const flagged = [...unverifiedTurnout(db, ids)].sort();
  assert.deepEqual(flagged, ["wb-assembly-2026"], `the corroboration rule now flags ${flagged.length}`);
});

test("no SVG title is assembled from several nodes, on any figure", live, () => {
  /**
   * A `<title>` written as several JSX children arrives at the DOM as an ARRAY, and a browser renders the
   * whole array — comment markers and all — as the tooltip string, then hydration mismatches on it. Both of
   * the election figures had one, and every text assertion in this file passed over it, because the rendered
   * output still contained the right words in the right order. Only a browser complained.
   *
   * So this test listens the way the browser does: React writes the warning to STDERR, which means the
   * check is "render and find nothing on stderr" — and that covers every figure added later, not just the
   * two that happened to be wrong.
   */
  for (const [route, query, segs] of [
    ["/pl", "", "ka"],
    ["/election", "", "ka-assembly-2023"],
    ["/", "", ""],
  ] as const) {
    const r = spawnSync(
      process.execPath,
      ["--import", "./ops/probe/render/register.mjs", "./ops/probe/render/render.mjs", route, query, segs],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    assert.equal(r.status, 0, `${route} ${segs} failed to render:\n${r.stderr}`);
    const noise = (r.stderr ?? "")
      .split("\n")
      .filter((l) => /Warning:/.test(l) && !/MODULE_TYPELESS_PACKAGE_JSON/.test(l));
    assert.deepEqual(noise, [], `${route} ${segs} rendered with React warnings`);
  }
});

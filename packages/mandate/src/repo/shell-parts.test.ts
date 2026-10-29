// The shell and the parts every page is built from: the evidence drawer's links and its name, the empty state's heading,
// the 404 a reader gets, the page that asks which seat was meant, and where the footer sits.
//
// The components are rendered in a child process (map-composition.test.ts does the same: a .tsx file cannot be imported under
// `node --test`), against a registry built here from literal data:
//
//   tw  a state whose id is not its name, with two assembly seats called Twin in different districts

import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";

const ROOT = new URL("../../../../", import.meta.url).pathname;

const PATH = join(mkdtempSync(join(tmpdir(), "mandate-shell-parts-")), "registry.db");
{
  const d = open(PATH);
  migrate(d, "2026-08-12T00:00:00.000Z");
  d.exec(`
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e1','Delimitation 2008','2008-02-19');
    INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('tw','state','Tw State','in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('tw.north','district','North','tw');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('tw.south','district','South','tw');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('tw.ac.001','ac','Twin','tw.north');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('tw.ac.002','ac','Twin','tw.south');
    INSERT INTO place_version (id, place_id, jurisdiction_id, district_place_id, kind, epoch_id, number, canonical_name, reservation)
      VALUES (1, 'tw.ac.001', 'tw', 'tw.north', 'ac', 'e1', 1, 'Twin', 'general');
    INSERT INTO place_version (id, place_id, jurisdiction_id, district_place_id, kind, epoch_id, number, canonical_name, reservation)
      VALUES (2, 'tw.ac.002', 'tw', 'tw.south', 'ac', 'e1', 2, 'Twin', 'general');
    INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
      VALUES ('tw-assembly-2021','assembly','state','tw','e1','TW 2021','declared','ac',2021,1);
    INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES ('c1','tw-assembly-2021',1,'declared');
    INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES ('c2','tw-assembly-2021',2,'declared');
  `);
  d.close();
}

function node(args: string[], env: Record<string, string>): string {
  try {
    return execFileSync(process.execPath, ["--import", "./ops/probe/render/register.mjs", ...args], {
      cwd: ROOT,
      env: { ...process.env, MANDATE_DB_PATH: PATH, ...env },
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    throw new Error(`${args.join(" ")} failed:\n${err.stderr ?? err.message}`);
  }
}

function render(route: string, query: string, segments: string, env: Record<string, string> = {}): string {
  return node(["./ops/probe/render/render.mjs", route, query, segments], env);
}

/** Run a module script in the app's TypeScript and JSX, and read back what it printed as JSON. */
function evaluate<T>(script: string): T {
  return JSON.parse(node(["--input-type=module", "-e", script], {})) as T;
}

const count = (html: string, needle: string): number => html.split(needle).length - 1;
const text = (html: string): string => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

// ── the evidence drawer ──────────────────────────────────────────────────────────────────────────

const SOURCES = `
  const src = (o) => ({
    id: 'static_module:abc123def4567890', kind: 'static_module', publisher: 'ECI, via Lokdhaba', title: 'Results',
    url: null, retrievedAt: '2026-08-12T00:00:00.000Z', publishedOn: null, hashKind: 'document_bytes',
    retrievalKind: 'fetched', licence: null, ...o,
  });
`;

type Drawers = { repo: string; web: string; none: string; one: string; unlabelled: string; inline: string };

function drawers(): Drawers {
  return evaluate<Drawers>(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    const { Evidence } = await import('./src/components/iei/parts.tsx');
    ${SOURCES}
    const html = (props) => renderToStaticMarkup(React.createElement(Evidence, props));
    const repo = src({ url: 'repo:data/seed/historical-results.json' });
    const web = src({ id: 'static_module:fff', publisher: 'Datameet', url: 'https://example.org/ac.geojson' });
    const none = src({ id: 'static_module:eee', url: null });
    process.stdout.write(JSON.stringify({
      repo: html({ sources: [repo], label: 'Winners' }),
      web: html({ sources: [web], label: 'Winners' }),
      none: html({ sources: [none], label: 'Winners' }),
      one: html({ sources: [repo], label: 'Winners' }),
      unlabelled: html({ sources: [repo, web] }),
      inline: html({ sources: [repo, web], inline: true, label: 'Turnout' }),
    }));
  `);
}

test("a source that is a file in this repository is named as one, and is not a link no browser opens", () => {
  const { repo } = drawers();
  assert.doesNotMatch(repo, /href="repo:/, "a repo: scheme is not an address");
  assert.equal(count(repo, "<a "), 0, "nothing in the drawer is a link when the source is a file");
  assert.match(text(repo), /in this repository: data\/seed\/historical-results\.json/);
});

test("a source with a web address is a link that says whose, and one with no address is none", () => {
  const { web, none } = drawers();
  assert.match(web, /<a class="iei-ev-a" href="https:\/\/example\.org\/ac\.geojson"/);
  // the visible words stay `open source`; the rest is for whoever hears the link out of its context
  assert.match(web, />open source<span class="iei-sr"> of Datameet<\/span><\/a>/);
  assert.equal(count(none, "<a "), 0);
  assert.doesNotMatch(text(none), /in this repository/);
});

test("the drawer's name starts with the words it shows, so saying what is on screen reaches it", () => {
  const { one, unlabelled, inline } = drawers();
  assert.match(one, /<summary aria-label="1 source for Winners">/);
  assert.match(text(one), /^ⓘ 1 source /);
  assert.match(unlabelled, /<summary aria-label="2 sources">/);
  // the inline drawer shows only the mark, so its name is all there is, and still says what it is for
  assert.match(inline, /<summary aria-label="2 sources for Turnout">/);
});

// ── the empty state ──────────────────────────────────────────────────────────────────────────────

test("an empty state is the page's h1 unless it sits under one, and can leave its headline to the page", () => {
  const html = evaluate<{ alone: string; under: string; headless: string; missing: string }>(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    const { EmptyState, RegistryMissing } = await import('./src/components/iei/parts.tsx');
    const h = (el) => renderToStaticMarkup(el);
    process.stdout.write(JSON.stringify({
      alone: h(React.createElement(EmptyState, { title: 'Nothing here', detail: 'why' })),
      under: h(React.createElement(EmptyState, { title: 'Nothing here', detail: 'why', level: 2 })),
      headless: h(React.createElement(EmptyState, { detail: 'why' })),
      missing: h(React.createElement(RegistryMissing, { level: 2 })),
    }));
  `);
  assert.match(html.alone, /<h1 class="iei-answer iei-answer-long">Nothing here<\/h1>/);
  assert.match(html.under, /<h2 class="iei-answer iei-answer-long">Nothing here<\/h2>/);
  assert.equal(count(html.under, "<h1"), 0);
  assert.equal(count(html.headless, "<h"), 0);
  assert.match(html.headless, /<p class="iei-sub">why<\/p>/);
  assert.match(html.missing, /<h2 class="iei-answer iei-answer-long">The registry is not built in this checkout\.<\/h2>/);
});

test("a search with no match has one h1, and so has the review page when there is no registry", () => {
  const miss = render("/search", "q=zzzzqq", "");
  assert.equal(count(miss, "<h1"), 1, "the search answers once");
  assert.match(miss, /Nothing in the registry matches/);
  assert.match(miss, /genuinely not here/, "the explanation of what is loaded is still there");
  const absent = join(mkdtempSync(join(tmpdir(), "mandate-shell-none-")), "none.db");
  const review = render("/review/merges", "", "", { MANDATE_DB_PATH: absent });
  assert.equal(count(review, "<h1"), 1, "the page's question is the h1");
  assert.match(review, /The registry is not built in this checkout/);
});

// ── the 404 ──────────────────────────────────────────────────────────────────────────────────────

type NotFound = { html: string; title: unknown };

function notFound(): NotFound {
  return evaluate<NotFound>(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    const m = await import('./src/app/not-found.tsx');
    process.stdout.write(JSON.stringify({
      html: renderToStaticMarkup(React.createElement(m.default)),
      title: m.metadata?.title ?? null,
    }));
  `);
}

test("an address that names nothing gets the product's own page: its header, its search, a way home", () => {
  const { html } = notFound();
  assert.equal(count(html, "<h1"), 1);
  assert.match(html, /<form class="iei-cmd" action="\/search" method="get" role="search">/, "the search field is there");
  assert.match(html, /<a class="iei-mark" href="\/"/, "so is the way home");
});

test("the 404 says what an address looks like in the product's own words and names no place that is not on record", () => {
  const { html } = notFound();
  const words = text(html);
  assert.match(words, /\/constituency\/wb\/assembly\/mekliganj/);
  assert.match(words, /\/state\/wb/);
  assert.doesNotMatch(words, /\/pl\/|Karnataka|badami|bagalkot|Every state is on the map/i, "the retired address form is not taught");
});

test("the 404 has a title of its own, and the dead copy in the private folder is gone", () => {
  assert.equal(notFound().title, "No page at that address");
  assert.equal(existsSync(join(ROOT, "src/app/_place/not-found.tsx")), false, "a file Next cannot reach is not kept");
});

// ── the page that asks which seat was meant ──────────────────────────────────────────────────────

test("the page that asks which seat was meant names the state, links each seat with what tells them apart, and ends in the footer", () => {
  const html = render("/constituency", "", "tw/assembly/twin");
  assert.match(html, /<a href="\/state\/tw">Tw State<\/a>/, "the state crumb is a link carrying the state's name");
  assert.doesNotMatch(html, />TW</, "the state is not its id in capitals");
  assert.equal(count(html, "<h1"), 1);
  // each seat is a row of the product's list, a link that names itself and a detail line that tells it apart
  assert.match(html, /<ul class="iei-list" aria-label="[^"]+">/);
  assert.doesNotMatch(html, /iei-district-list/);
  const links = [...html.matchAll(/<a href="(\/constituency\/tw\/assembly\/[^"]+)">([\s\S]*?)<\/a>/g)];
  assert.equal(links.length, 2);
  assert.deepEqual(
    links.map((l) => l[1]),
    ["/constituency/tw/assembly/tw.ac.001", "/constituency/tw/assembly/tw.ac.002"],
  );
  assert.match(text(links[0]?.[2] ?? ""), /^Twin — Assembly · North$/);
  assert.match(text(links[1]?.[2] ?? ""), /^Twin — Assembly · South$/);
  assert.match(html, /<p class="iei-row-d">Assembly · North<\/p>/);
  assert.match(html, /<p class="iei-row-d">Assembly · South<\/p>/);
  assert.match(html, /<footer class="iei-foot">[\s\S]*href="\/coverage"/, "the footer's link to the ledger is on this page too");
});

// ── the footer ───────────────────────────────────────────────────────────────────────────────────

test("a page's footer is outside <main>, so it is the page's contentinfo and not a footer of main", () => {
  for (const html of [render("/constituency", "", "tw/assembly/twin"), render("/search", "q=zzzzqq", "")]) {
    const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
    assert.ok(main.length > 0, "the page has a main");
    assert.equal(count(main, "<footer"), 0, "no footer inside main");
    assert.equal(count(html, "<footer"), 1, "and the page still has its one footer");
    assert.ok(html.indexOf("<footer") > html.indexOf("</main>"), "after it");
  }
});

test("the skip link still lands on main", () => {
  const html = render("/constituency", "", "tw/assembly/twin");
  assert.match(html, /<a class="iei-skip" href="#main">/);
  assert.equal(count(html, ' id="main"'), 1);
});

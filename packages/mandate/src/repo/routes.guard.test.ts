// The guard on repo/routes.ts: no source file builds a route by hand.
//
// Every URL the product hands a reader is made in routes.ts, and that is only true while nothing else writes
// one. A hand-built `/p/${id}` is a second copy of the path shape: it keeps working until the shape changes
// in the one place that is tested, and then it links to a page that is not there while its own page's test
// passes. So this reads the source text, as the guard on core/election-kind.ts does, for what tsc cannot see:
// a template literal that starts like a route.
//
// The allow-list is a ratchet and it is empty. It names a literal that is not a link (a path compared, not
// built); a literal that is not on it fails, and an entry that no longer occurs fails too, so it can only shrink.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

/**
 * A string, template or JSX attribute literal that STARTS like a route: the prefix of a builder in routes.ts.
 * `/coverage?` and not `/coverage`, because the bare page takes nothing and has nothing to get wrong.
 */
const ROUTE_LITERAL = /[`"']\/(?:(?:p|election|state|district|constituency|pl)\/|coverage\?)/;

/** The one file that may spell a route. */
const ROUTES = "packages/mandate/src/repo/routes.ts";

/** Block comments blanked and line comments cut, so the line numbers survive. Comments cite examples. */
function codeOf(source: string): string[] {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n")
    .map((l) => l.replace(/(^|\s)\/\/.*$/, "$1"));
}

type Hit = { line: number; code: string };

function hitsIn(source: string): Hit[] {
  const hits: Hit[] = [];
  codeOf(source).forEach((code, i) => {
    if (ROUTE_LITERAL.test(code)) hits.push({ line: i + 1, code: code.trim() });
  });
  return hits;
}

/** A literal that is not a link. `includes` picks the line; the reason says why it is not one. */
type Allowed = { file: string; includes: string; why: string };

const ALLOWED: Allowed[] = [];

// Non-test sources of the app and of the package, the two places a link is made.
const ROOTS = [
  { prefix: "src/", url: new URL("../../../../src/", import.meta.url) },
  { prefix: "packages/mandate/src/", url: new URL("../", import.meta.url) },
];

function sources(): { file: string; hits: Hit[] }[] {
  return ROOTS.flatMap(({ prefix, url }) =>
    (readdirSync(url, { recursive: true }) as string[])
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
      .map((f) => ({ file: prefix + f, hits: hitsIn(readFileSync(new URL(f, url), "utf8")) })),
  )
    .filter(({ file }) => file !== ROUTES)
    .sort((a, b) => (a.file < b.file ? -1 : 1));
}

test("no source builds a route by hand; it asks routes.ts", () => {
  const stray: string[] = [];
  for (const { file, hits } of sources()) {
    for (const h of hits) {
      if (ALLOWED.some((a) => a.file === file && h.code.includes(a.includes))) continue;
      stray.push(`${file}:${h.line} ${h.code}`);
    }
  }
  assert.deepEqual(
    stray,
    [],
    "build the href with stateHref, districtHref, constituencyHref, electionHref, personHref or coverageHref " +
      "(packages/mandate/src/repo/routes.ts); if the literal is not a link, add it to ALLOWED with the reason",
  );
});

test("every allow-listed literal still occurs, so the allow-list can only shrink", () => {
  const byFile = new Map(sources().map((s) => [s.file, s.hits]));
  const stale = ALLOWED.filter((a) => !(byFile.get(a.file) ?? []).some((h) => h.code.includes(a.includes))).map(
    (a) => `${a.file} ${JSON.stringify(a.includes)}`,
  );
  assert.deepEqual(stale, [], "delete the entry for a literal that is gone");
});

test("the scan finds a hand-built route however it is spelt, and leaves a built one alone", () => {
  const flagged = (code: string): boolean => hitsIn(code).length > 0;
  for (const bad of [
    "<Link href={`/p/${c.id}`}>{c.name}</Link>",
    `<a href="/election/ka-assembly-2023">`,
    `permanentRedirect('/state/' + id);`,
    "href: `/coverage?election=${e.id}#election`,",
    "const to = `/pl/${state}/${district}`;",
    `redirect("/district/ka/bangalore")`,
    "return `/constituency/${j}/${bodyOfKind(k)}/${slug}`;",
  ]) {
    assert.ok(flagged(bad), `missed: ${bad}`);
  }
  for (const fine of [
    "<Link href={personHref(c.id)}>{c.name}</Link>",
    `<Link href="/coverage">Coverage</Link>`,
    `<Link href="/search?q=ka">`,
    "href={`?${qs}#map`}",
    "const re = /^\\/p\\/[a-z-]+$/;",
    "// href={`/p/${id}`}",
    "/* `/election/${id}` */ const x = 1;",
    "const y = 2; // permanentRedirect('/state/ka')",
    "{/* <Link href=\"/p/x\"> */}",
    "const api = `/api/v1/state/${id}`;",
  ]) {
    assert.ok(!flagged(fine), `flagged: ${fine}`);
  }
  // A block comment keeps its newlines, so a hit after it is reported on its own line.
  assert.deepEqual(hitsIn("/* one\n two */\nx(`/p/${id}`)").map((h) => h.line), [3]);
});

test("the scan reaches the app and the package, and leaves routes.ts to itself", () => {
  const files = sources().map((s) => s.file);
  for (const f of ["src/app/election/[id]/page.tsx", "src/app/_place/surface.tsx", "packages/mandate/src/repo/home.ts"]) {
    assert.ok(files.includes(f), `the scan never read ${f}`);
  }
  assert.ok(!files.includes(ROUTES));
  assert.ok(!files.some((f) => /\.test\.tsx?$/.test(f)), "a test file was scanned");
  // The one place a route is spelt really does spell them, or the scan is looking at the wrong thing.
  assert.ok(hitsIn(readFileSync(new URL("./routes.ts", import.meta.url), "utf8")).length > 0);
});

// The guard on core/election-kind.ts: nothing in the Next app reads an election's raw `house` or `kind`.
//
// The registry stores which body was elected and whether it filled its house as two codes, and `facetOf` decodes
// them once. A page that reads the codes again is the seam this module closed: four `houseWord` copies that
// disagreed about unknown input, `kind === 'bypoll'` suffixes, `'pc'` tests. So the view types carry the decoded
// `body` and `fill` and no longer carry the codes (the second guard: tsc fails on a read of a field that is not
// there), and this reads the source text, as render.test.ts does for hardcoded states, for what tsc cannot see:
// a row typed loosely, a SQL string, a literal compared in a page.
//
// The allow-list is a ratchet. It names the uses that are not an election row's codes, and the SQL the state view
// will replace. A use that is not on it fails; an entry that no longer occurs fails too, so it can only shrink.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

type Rule = { name: string; re: RegExp };

const RULES: Rule[] = [
  { name: "houseWord", re: /\bhouseWord\b/ },
  { name: ".house", re: /\.house\b/ },
  // Any read of a `kind`. Most are not an election's (a place's, a source's, PlaceView's discriminant), which is
  // why the allow-list names them rather than the rule guessing.
  { name: ".kind", re: /\.kind\b/ },
  // 'bypoll' unless it is compared with a decoded `fill`, which is what a page should write.
  { name: "bypoll literal", re: /(?<!\bfill\s*[!=]==?\s*)['"]bypoll['"]/ },
  { name: "ac/pc literal", re: /['"](?:ac|pc)['"]/ },
  // A bare `house` or `kind` compared with a literal: the same read through a local variable.
  { name: "house/kind compared", re: /\b(?:house|kind)\s*(?:[!=]==?|<>)\s*['"]/ },
];

/** Block comments blanked and line comments cut, so the line numbers survive. Comments cite examples. */
function codeOf(source: string): string[] {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n")
    .map((l) => l.replace(/(^|\s)\/\/.*$/, "$1"));
}

type Use = { line: number; code: string; rules: string[] };

function rawUses(source: string): Use[] {
  const uses: Use[] = [];
  codeOf(source).forEach((code, i) => {
    const rules = RULES.filter((r) => r.re.test(code)).map((r) => r.name);
    if (rules.length > 0) uses.push({ line: i + 1, code: code.trim(), rules });
  });
  return uses;
}

/** A use that is not an election row's house or kind. `includes` picks the line; `n` is how many there are. */
type Allowed = { file: string; includes: string; n?: number; why: string };

const PLACE_VIEW = "PlaceView's discriminant: which level of the place hierarchy was resolved, not an election";
const SEAT_KIND = "a place or place_version kind ('ac' | 'pc'), which names a seat's body, not an election's";
const FILL = "ElectionContext.kind, which is already a Fill";
const URL_HOUSE = "the ?house= URL parameter, and the local parsed from it, before any election is read";
const READ_STATE =
  "readState's SQL, which selects a state's elections by the registry's codes; the state view replaces it";

const ALLOWED: Allowed[] = [
  { file: "app/_place/analysis/floor.tsx", includes: `{ kind: "ac" }`, why: PLACE_VIEW },
  { file: "app/_place/state.tsx", includes: "view.ctx.kind", why: FILL },
  { file: "app/_place/surface.tsx", includes: `first(params["house"]) === "pc"`, why: URL_HOUSE },
  { file: "app/_place/surface.tsx", includes: `house === "pc"`, why: URL_HOUSE },
  { file: "app/_place/surface.tsx", includes: "WHERE e.kind = 'general' AND e.house = 'pc'", why: READ_STATE },
  { file: "app/_place/surface.tsx", includes: "AND e.kind = 'assembly'", why: READ_STATE },
  { file: "app/_place/surface.tsx", includes: "WHERE e.id = ? AND e.house = ?", why: READ_STATE },
  { file: "app/_place/surface.tsx", includes: `kind?: "ac" | "pc"`, why: "the constituency route's seat kind" },
  { file: "app/_place/surface.tsx", includes: `view.kind === "not-found"`, why: PLACE_VIEW },
  { file: "app/_place/surface.tsx", includes: `view.kind === "unavailable"`, why: PLACE_VIEW },
  { file: "app/_place/surface.tsx", includes: `view.kind !== "ac"`, why: PLACE_VIEW },
  { file: "app/_place/surface.tsx", includes: `view.kind === "parent"`, why: PLACE_VIEW },
  { file: "app/_place/surface.tsx", includes: "bodyOfKind(p.kind)", why: SEAT_KIND },
  { file: "app/constituency/[state]/[body]/page.tsx", includes: "${c.kind}-${c.id}", why: SEAT_KIND },
  { file: "app/constituency/[state]/[body]/page.tsx", includes: "bodyOfKind(c.kind)", why: SEAT_KIND },
  { file: "app/election/[id]/page.tsx", includes: "typeLabel(ctx.body, ctx.kind)", why: FILL },
  { file: "app/election/[id]/page.tsx", includes: "ctx?.kind === 'bypoll'", why: FILL },
  { file: "app/pl/[...path]/page.tsx", includes: "view.kind === 'not-found'", why: PLACE_VIEW },
  { file: "app/pl/[...path]/page.tsx", includes: "view.kind === 'ac'", why: PLACE_VIEW },
  { file: "app/pl/[...path]/page.tsx", includes: "view.brief.place.kind", why: SEAT_KIND },
  { file: "components/iei/parts.tsx", includes: "s.kind.replace", why: "a source's kind" },
];

const SRC = new URL("../../../../src/", import.meta.url);

function pages(): { file: string; uses: Use[] }[] {
  return (readdirSync(SRC, { recursive: true }) as string[])
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .sort()
    .map((file) => ({ file, uses: rawUses(readFileSync(new URL(file, SRC), "utf8")) }));
}

test("no page reads an election's raw house or kind; it reads the decoded body and fill", () => {
  const stray: string[] = [];
  for (const { file, uses } of pages()) {
    for (const u of uses) {
      if (ALLOWED.some((a) => a.file === file && u.code.includes(a.includes))) continue;
      stray.push(`src/${file}:${u.line} (${u.rules.join(", ")}) ${u.code}`);
    }
  }
  assert.deepEqual(
    stray,
    [],
    "read `body` and `fill` (facetOf, bodyWord and typeOf in core/election-kind.ts) instead of the registry's " +
      "codes; if the use is not an election row's, add it to ALLOWED with the reason",
  );
});

test("every allow-listed use still occurs, so the allow-list can only shrink", () => {
  const byFile = new Map(pages().map((p) => [p.file, p.uses]));
  const stale: string[] = [];
  for (const a of ALLOWED) {
    const found = (byFile.get(a.file) ?? []).filter((u) => u.code.includes(a.includes)).length;
    const wanted = a.n ?? 1;
    if (found !== wanted) stale.push(`src/${a.file} ${JSON.stringify(a.includes)}: ${found} found, ${wanted} listed`);
  }
  assert.deepEqual(stale, [], "delete the entry (or lower n) for a use that is gone");
});

test("the scan finds a raw read however it is spelt, and leaves a decoded one alone", () => {
  const flagged = (code: string): boolean => rawUses(code).length > 0;
  for (const bad of [
    `const w = houseWord(r.house);`,
    `label(row.house)`,
    `{e.kind === 'bypoll' ? ' by-election' : ''}`,
    `if (kind === "bypoll") return;`,
    `const lok = house === 'pc';`,
    `WHERE e.house = 'pc' AND e.kind <> 'bypoll'`,
    `const q = "SELECT 1 FROM election e WHERE e.kind = 'general'";`,
    `isBypoll(x ?? 'bypoll')`,
  ]) {
    assert.ok(flagged(bad), `missed: ${bad}`);
  }
  for (const fine of [
    `{e.fill === 'bypoll' ? ' by-election' : ''}`,
    `e.fill !== "bypoll"`,
    `{bodyWord(e.body)} {e.year}`,
    `typeLabel(ctx.body, ctx.fill)`,
    `const body = first(params["body"]);`,
    `// r.house is the registry's code`,
    `/* if (e.kind === 'bypoll') */ const x = 1;`,
    `const y = 2; // e.kind === 'bypoll'`,
    `{/* e.house */}`,
  ]) {
    assert.ok(!flagged(fine), `flagged: ${fine}`);
  }
  // A block comment keeps its newlines, so a use after it is reported on its own line.
  assert.deepEqual(rawUses("/* one\n two */\nr.house").map((u) => u.line), [3]);
});

// The view types a page reads. The scan above cannot see a field being put back on one of them.
const VIEW_TYPES: { file: string; type: string }[] = [
  { file: "elections.ts", type: "Dated" },
  { file: "home.ts", type: "ElectionCoverage" },
  { file: "election-map.ts", type: "ElectionChoice" },
  { file: "state-map.ts", type: "ElectionChoice" },
  { file: "place-page.ts", type: "StateElection" },
];

test("no election view type carries the registry's house or kind", () => {
  for (const { file, type } of VIEW_TYPES) {
    const source = codeOf(readFileSync(new URL(`../repo/${file}`, import.meta.url), "utf8")).join("\n");
    const fields = new RegExp(`^export type ${type} = \\{\\n([\\s\\S]*?)\\n\\};`, "m").exec(source)?.[1];
    assert.ok(fields !== undefined, `repo/${file} has no 'export type ${type} = {'`);
    assert.ok(/^\s*id\??:|^\s*electionId\??:/m.test(fields), `repo/${file} ${type}: the type was not read whole`);
    assert.doesNotMatch(fields, /^\s*(?:house|kind)\??\s*:/m, `repo/${file} ${type} carries house or kind`);
  }
});

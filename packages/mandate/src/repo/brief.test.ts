// Tests for the render layer behind src/app/p. They live HERE, beside envelope.test.ts, for one
// reason: package.json's test script is `node --test "packages/mandate/src/**/*.test.ts"`, and a
// test file that glob cannot match is a test file that never runs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PersonBrief, SourceRef } from "./index.ts";
import {
  deltas,
  freshness,
  headline,
  href,
  inr,
  retrievalText,
  rupees,
  tiles,
} from "./brief.ts";

const SRC: SourceRef = {
  id: "s1",
  kind: "affidavit",
  publisher: "myneta.info / ADR",
  title: "Affidavit",
  url: "https://myneta.info/x",
  retrievedAt: "2026-08-07T18:00:00.000Z",
  publishedOn: null,
  hashKind: "url_only",
  retrievalKind: "asserted_by_upstream",
};
const RESULTS: SourceRef = {
  ...SRC,
  id: "s2",
  kind: "eci_declaration",
  url: "repo:data/seed/historical-results.json",
  retrievalKind: "fetched",
  hashKind: "document_bytes",
};

function cand(o: Partial<PersonBrief["candidacies"][number]>): PersonBrief["candidacies"][number] {
  return {
    contestId: "c",
    electionId: "wb-assembly-2021",
    electionName: "WB 2021",
    year: 2021,
    placeName: "Uluberia Dakshin",
    placeNumber: 188,
    reservation: null,
    partyShortName: "TMC",
    partySymbolRef: "aitc",
    status: "elected",
    ageDeclared: null,
    educationDeclared: null,
    votes: 1000,
    voteShare: 50,
    rank: 1,
    isWinner: true,
    margin: 500,
    turnoutPct: null,
    ...o,
  };
}

function brief(o: Partial<PersonBrief>): PersonBrief {
  return {
    person: {
      id: "p",
      canonicalName: "Test Person",
      names: {},
      sex: null,
      birthYear: null,
      birthYearConfidence: null,
      reviewState: "auto",
    },
    aliases: [],
    candidacies: [],
    affidavitTrail: [],
    mergeProvenance: [],
    sources: [],
    ...o,
  };
}

test("indian digit grouping and money units", () => {
  assert.equal(inr(710930), "7,10,930");
  assert.equal(rupees(98000000), "Rs 9.8 cr");
  assert.equal(rupees(4200000), "Rs 42 lakh");
  assert.equal(rupees(86836465), "Rs 8.68 cr");
  assert.equal(rupees(9500), "Rs 9,500");
});

test("money at and above Rs 100 cr is not shrunk 10x by zero-stripping", () => {
  assert.equal(rupees(1e9), "Rs 100 cr");
  assert.equal(rupees(1.2e9), "Rs 120 cr");
  assert.equal(rupees(1e10), "Rs 1,000 cr");
  assert.equal(rupees(1_335_218_154), "Rs 134 cr");
  assert.equal(rupees(1e7), "Rs 1 cr");
  assert.equal(rupees(1e6), "Rs 10 lakh");
});

test("headline: multi-term winner names the record, the widest margin and the assets", () => {
  const h = headline(
    brief({
      candidacies: [
        cand({ year: 2026, electionId: "wb-assembly-2026", margin: 17187, votes: 0, voteShare: 0 }),
        cand({ year: 2021, margin: 28438 }),
        cand({ year: 2016, electionId: "wb-assembly-2016", margin: 35344 }),
      ],
      affidavitTrail: [
        {
          year: 2026,
          filedOn: null,
          assetsTotal: 86836465,
          liabilitiesTotal: 4966980,
          movable: null,
          immovable: null,
          pendingCasesDeclared: 0,
          sourceId: "s1",
        },
      ],
      sources: [SRC],
    }),
  );
  assert.equal(
    h,
    "Won all 3 contests in Uluberia Dakshin from 2016 to 2026, widest win by 35,344 votes at Uluberia Dakshin 2016, declared assets of Rs 8.68 cr in 2026.",
  );
});

test("headline: single-contest loser says it lost, with its vote count", () => {
  const h = headline(
    brief({
      candidacies: [cand({ isWinner: false, status: "defeated", votes: 7109, voteShare: 4.2, margin: null, rank: 3 })],
      affidavitTrail: [],
    }),
  );
  assert.equal(
    h,
    "Lost the only contest on record, Uluberia Dakshin 2021, 7,109 votes and 4.2% of the vote, no affidavit filing is in the registry.",
  );
});

test("headline: no candidacy at all is stated, not padded", () => {
  assert.match(headline(brief({})), /^No contest is on record for Test Person/);
});

test("a decided contest with no counted votes says so instead of printing a zero", () => {
  // repo/person.ts `counted` maps the registry's uncounted 0 to null before any view sees it.
  const c = cand({ votes: null, voteShare: null });
  assert.match(headline(brief({ candidacies: [c] })), /no vote count reported/);
});

test("a contesting candidacy is never described as a loss, nor as never elected", () => {
  const only = cand({
    year: 2026,
    electionId: "wb-assembly-2026",
    status: "contesting",
    isWinner: false,
    votes: null,
    voteShare: null,
    rank: null,
    margin: null,
    placeName: "Suti",
  });
  const h = headline(brief({ candidacies: [only] }));
  assert.equal(
    h,
    "Standing at Suti 2026, with no result declared, no affidavit filing is in the registry.",
  );
  assert.doesNotMatch(h, /lost|never/i);
  const t = tiles(brief({ candidacies: [only], sources: [RESULTS] }));
  assert.ok(!t.some((x) => x.label === "Contests won"), "nothing decided, so no won-of-N tile");
  assert.deepEqual(t.find((x) => x.label === "Awaiting a result"), {
    label: "Awaiting a result",
    value: "1",
    unit: "contest",
    note: "Suti 2026",
    source: RESULTS,
  });
  for (const x of t) {
    assert.doesNotMatch(`${x.value} ${x.unit ?? ""} ${x.note ?? ""}`, /never elected|lost/i);
  }
});

test("a mixed career counts only decided contests, and states the undecided one", () => {
  const h = headline(
    brief({
      candidacies: [
        cand({
          year: 2026,
          electionId: "wb-assembly-2026",
          status: "contesting",
          isWinner: false,
          votes: null,
          voteShare: null,
          margin: null,
          rank: null,
          placeName: "Bhabanipur",
        }),
        cand({
          year: 2021,
          status: "defeated",
          isWinner: false,
          margin: -1956,
          votes: 108808,
          voteShare: 47.6,
          placeName: "Nandigram",
        }),
        cand({ year: 2016, electionId: "wb-assembly-2016", margin: 25301, votes: 65520, placeName: "Bhabanipur" }),
      ],
    }),
  );
  assert.match(h, /Won 1 of 2 decided contests/);
  assert.match(h, /1 contest on record at Bhabanipur 2026 has no declared result/);
});

test("tiles: 4-6, every one carries a source, no tile without a figure", () => {
  const t = tiles(
    brief({
      candidacies: [cand({ year: 2021 }), cand({ year: 2016, electionId: "wb-assembly-2016", isWinner: false, status: "defeated", margin: null })],
      affidavitTrail: [
        {
          year: 2021,
          filedOn: "2021-03-01",
          assetsTotal: 12000000,
          liabilitiesTotal: null,
          movable: null,
          immovable: null,
          pendingCasesDeclared: 2,
          sourceId: "s1",
        },
      ],
      sources: [SRC, RESULTS],
    }),
  );
  assert.ok(t.length >= 4 && t.length <= 6, `tile count ${t.length}`);
  assert.deepEqual(
    t.map((x) => x.label),
    ["Contests fought", "Contests won", "Widest winning margin", "Votes, latest counted contest", "Declared assets", "Cases pending (declared)"],
  );
  assert.equal(t.find((x) => x.label === "Declared assets")?.value, "Rs 1.2 cr");
  assert.equal(t.find((x) => x.label === "Declared assets")?.source?.id, "s1");
  assert.equal(t.find((x) => x.label === "Contests fought")?.source?.id, "s2");
});

test("tiles: a figure with no resolvable source gets none", () => {
  const t = tiles(brief({ candidacies: [cand({})], sources: [] }));
  assert.equal(t[0]?.source, null);
});

test("no tile mentions a case without saying declared", () => {
  const t = tiles(
    brief({
      candidacies: [cand({})],
      affidavitTrail: [
        {
          year: 2021,
          filedOn: null,
          assetsTotal: null,
          liabilitiesTotal: null,
          movable: null,
          immovable: null,
          pendingCasesDeclared: 1,
          sourceId: "s1",
        },
      ],
      sources: [SRC],
    }),
  );
  const cases = t.find((x) => x.label.startsWith("Cases"));
  assert.equal(cases?.label, "Cases pending (declared)");
  assert.equal(cases?.value, "1");
});

test("deltas: one filing has no computable change; two filings report bare arithmetic", () => {
  const f = (year: number, assets: number) => ({
    year,
    filedOn: null,
    assetsTotal: assets,
    liabilitiesTotal: null,
    movable: null,
    immovable: null,
    pendingCasesDeclared: null,
    sourceId: "s1",
  });
  const one = deltas([f(2021, 12000000)]);
  assert.equal(one.length, 1);
  assert.equal(one[0]?.change, null);
  const two = deltas([f(2016, 12000000), f(2021, 98000000)]);
  assert.equal(two[0]?.cells.length, 2);
  assert.equal(two[0]?.change, "+Rs 8.6 cr (×8.17)");
});

test("tiles: a thin record still fills at least four, from rank and turnout", () => {
  const t = tiles(
    brief({
      candidacies: [
        cand({
          year: 2011,
          electionId: "wb-assembly-2011",
          isWinner: false,
          status: "defeated",
          margin: null,
          rank: 3,
          votes: 3692,
          voteShare: 1.91,
          turnoutPct: 79.5,
        }),
      ],
      sources: [RESULTS],
    }),
  );
  assert.ok(t.length >= 4 && t.length <= 6, `tile count ${t.length}`);
  assert.deepEqual(t.map((x) => x.label).slice(3), ["Finishing position", "Turnout where they stood"]);
  assert.equal(t[3]?.value, "3rd");
});

test("P5: nothing rendered on the person surface uses that word for a declared case count", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const banned = ["cri", "minal"].join("");
  const dir = new URL("../../../../src/app/p/", import.meta.url);
  const files = [
    ...readdirSync(dir, { recursive: true, encoding: "utf8" }).map((f) => new URL(f, dir)),
    // brief.ts renders that surface's copy and now lives here, so it is scanned by name.
    new URL("./brief.ts", import.meta.url),
  ];
  for (const f of files) {
    if (!/\.(tsx?|css)$/.test(f.pathname) || f.pathname.endsWith(".test.ts")) continue;
    assert.ok(!readFileSync(f, "utf8").toLowerCase().includes(banned), `${f.pathname}`);
  }
});

// registry:typecheck is `tsc -p packages/mandate/tsconfig.json | grep "^packages/mandate"`. tsc
// prints an error in an imported file under ITS OWN path, so any file here that imports a root
// src/ file exports that file's errors out of the gate's field of view — and drags the old app's
// module format in with it (root package.json has no "type", so NodeNext reads those .ts files as
// CommonJS and every export is TS1287). Cycle 2 did that with the /v1 envelope and the person
// brief; both now live in this directory, where the strict gate can fail on them.
// ONE EXEMPTION, and it is narrow: a `.json` import from `data/`.
//
// The rule's reason is module format and error-gate coverage — a .ts file under the old app's src/ is read as
// CommonJS by NodeNext and every export becomes TS1287. A JSON import has no module format and no exports, so
// neither problem applies to it. Phase 2.6 needed one: viz/party-ink.ts holds the party colour config, and the
// config has to be IMPORTED rather than read, because `readFileSync(new URL(...))` works under Node and fails
// under webpack's fs shim — the production build died on exactly that. The ingest still uses readFileSync for
// data/seed/*.json, and can, because the CLI is never bundled.
test("no file in this package imports code from outside it", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const src = new URL("../", import.meta.url);
  const pkg = new URL("../../", import.meta.url).href;
  for (const f of readdirSync(src, { recursive: true, encoding: "utf8" })) {
    const rel = f.replaceAll("\\", "/");
    if (!rel.endsWith(".ts")) continue;
    const file = new URL(rel, src);
    for (const m of readFileSync(file, "utf8").matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
      const spec = m[1]!;
      if (!spec.startsWith(".")) continue;
      if (spec.endsWith(".json") && spec.includes("/data/")) continue;
      assert.ok(new URL(spec, file).href.startsWith(pkg), `${rel} imports ${spec}`);
    }
  }
});

test("href only links an http source", () => {
  assert.equal(href(SRC), "https://myneta.info/x");
  assert.equal(href(RESULTS), null);
  assert.equal(href(null), null);
});

test("freshness counts fetched vs asserted, and repo files separately", () => {
  const f = freshness(brief({ sources: [SRC, RESULTS] }));
  assert.deepEqual(
    [f.total, f.fetched, f.repoFiles, f.retrievedAt],
    [2, 1, 1, "2026-08-07T18:00:00.000Z"],
  );
});

test("a repo: source is never described as a document read from the publisher", () => {
  // Every 'fetched' row in this registry is a repo:data/seed/*.json file.
  assert.equal(retrievalText(RESULTS), "read from a file in this repository, hashed document bytes");
  assert.equal(retrievalText(SRC), "not fetched — asserted by upstream");
  assert.equal(
    retrievalText({ ...RESULTS, url: "https://eci.gov.in/x" }),
    "fetched from the publisher, hashed document bytes",
  );
});

/**
 * The Brief page returned 500 for EVERY slug in a production build, and no test saw it: webpack
 * cannot statically parse `createRequire(join(process.cwd(), "index.js"))`, so it compiled the
 * binding to `undefined` and the first call threw a TypeError the page's own catch rethrew — dead
 * 404 path, dead not-found.tsx, 500 for every reader.
 *
 * A .tsx file cannot be imported under `node --test` (Node strips types, not JSX) and node:test
 * cannot run webpack, so this guards the source instead: the page must load the registry through
 * envelope.ts's `import(/* webpackIgnore *\/ ...)`, which webpack leaves alone, and must not
 * reintroduce a require webpack has to guess at.
 * ponytail: a source assertion. Replace it with a rendered-page assertion the day the app grows a
 * JSX-capable test transform — until then a build + a request through the real handler is the
 * manual check, and this is the one that runs on every commit.
 */
test("the Brief page loads the registry the way a production build survives", () => {
  const page = readFileSync(
    fileURLToPath(new URL("../../../../src/app/p/[person]/page.tsx", import.meta.url)),
    "utf8",
  );
  for (const banned of [/createRequire/, /\brequire\s*\(/, /eval\s*\(/]) {
    assert.doesNotMatch(page, banned, `page.tsx must not load code webpack cannot parse: ${banned}`);
  }
  assert.match(page, /personReply/, "the page reads through the same function /v1 answers with");
  assert.match(page, /export const dynamic = "force-dynamic"/, "never prerendered: .data is gitignored");
  assert.match(page, /notFound\(\)/, "an unknown slug is a 404, not a 500");
});

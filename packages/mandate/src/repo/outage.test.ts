// Every route that reads the registry, against a registry that is not there.
//
// WHY THIS IS NOT IN render.test.ts. That suite renders the real pages and SKIPS when there is no registry,
// which is exactly the situation this one is about: a fresh clone, or a production volume that has not been
// uploaded to yet. The pages have to answer it with the page that names the command to fix it, and the legacy
// redirect routes have to answer it with a failure rather than a 404 (a crawler keeps a 404). Nothing here needs
// a registry, so nothing here is skipped for the want of one.
//
// The pages are rendered the way render.test.ts does it, in a child process through ops/probe/render, because
// Node strips types but not JSX. The child is the only thing that needs `npm install`, so that is the one thing
// this suite skips for.

import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";

const ROOT = new URL("../../../../", import.meta.url).pathname;
const run = promisify(execFile);
const skip = existsSync(join(ROOT, "node_modules/react-dom")) ? false : "no node_modules — run npm install";

/** What the child printed and how it ended. A page that throws is a result here, not a failure of the test. */
async function render(
  dbPath: string,
  route: string,
  query = "",
  segments = "",
  writes = false,
): Promise<{ out: string; err: string; failed: boolean }> {
  // The merge decision answers 403 before it reads the registry unless MANDATE_REVIEW_WRITES=1, and these tests
  // are about what it does once it does read it. The switch comes from the caller, never from the shell.
  const env: NodeJS.ProcessEnv = { ...process.env, MANDATE_DB_PATH: dbPath };
  if (writes) env["MANDATE_REVIEW_WRITES"] = "1";
  else delete env["MANDATE_REVIEW_WRITES"];
  try {
    const { stdout, stderr } = await run(
      process.execPath,
      ["--import", "./ops/probe/render/register.mjs", "./ops/probe/render/render.mjs", route, query, segments],
      { cwd: ROOT, env, maxBuffer: 64 * 1024 * 1024 },
    );
    return { out: stdout, err: stderr, failed: false };
  } catch (e) {
    const x = e as { stdout?: string; stderr?: string };
    return { out: x.stdout ?? "", err: x.stderr ?? "", failed: true };
  }
}

/** A path inside a fresh directory where nothing exists. */
const nowhere = (): string => join(mkdtempSync(join(tmpdir(), "mandate-outage-")), "registry.db");

/** Every page that renders the registry's own words when it cannot read the registry. */
const PAGES: [route: string, query: string, segments: string][] = [
  ["/", "", ""],
  ["/search", "q=wb", ""],
  ["/coverage", "", ""],
  ["/election", "", "wb-assembly-2021"],
  ["/state", "", "wb"],
  ["/district", "", "wb/cooch-behar"],
  ["/constituency", "", "wb/assembly/mekliganj"],
  ["/constituency/analysis", "", "wb/assembly/mekliganj"],
  ["/p", "", "someone"],
  ["/review/merges", "", ""],
];

/**
 * The legacy redirect routes. They have nothing to render, so an outage is a thrown error and not a page — and
 * not a 404 either, which a crawler would cache for good in place of the redirect it was following.
 */
const REDIRECTS: [route: string, query: string, segments: string][] = [
  ["/pl", "", "wb"],
  ["/constituency/legacy", "", "wb/mekliganj"],
  ["/constituency/id", "", "c0001"],
  ["/mla", "", "c0001"],
  ["/candidate", "", "wb26_52"],
];

for (const [route, query, segments] of PAGES) {
  test(`${route} ${segments} with no registry says it is not built, and renders`, { skip }, async () => {
    const r = await render(nowhere(), route, query, segments);
    assert.equal(r.failed, false, r.err);
    assert.match(r.out, /not built in this checkout/);
    assert.match(r.out, /npm run registry:migrate/, "and it names the command that fixes it");
  });
}

for (const [route, query, segments] of REDIRECTS) {
  test(`${route} ${segments} with no registry is thrown, not a 404 and not a redirect`, { skip }, async () => {
    const r = await render(nowhere(), route, query, segments);
    assert.equal(r.failed, true, "a redirect route cannot render, so it has to throw");
    assert.match(r.err, /RegistryUnavailableError/);
    assert.doesNotMatch(r.err, /NEXT_NOT_FOUND|NEXT_REDIRECT/, "an outage is neither a 404 nor a redirect");
  });
}

test("the merge decision with no registry records nothing and says so", { skip }, async () => {
  // open() creates the file, so this is an empty database rather than an absent one: it has no schema.
  const r = await render(nowhere(), "/review/merges/decide", "a=p1&b=p2&decision=merged", "", true);
  assert.equal(r.failed, false, r.err);
  assert.equal(r.out, "303 http://localhost/review/merges?error=unavailable");
});

// ── a defect is not an outage ────────────────────────────────────────────────────────────────────

/**
 * A migrated registry holding West Bengal and one assembly election with one contest, with the named tables
 * replaced by views over a function SQLite does not have. That is a bug in a query, not a state of the
 * deployment: a table or column that is merely missing would read as an outage, by design, and so would not tell
 * the two apart. The contest is what gives the state page an election to open on; without one it says there is
 * nothing to map and never reads the geometry.
 */
function registry(...broken: string[]): string {
  const path = nowhere();
  const d = open(path);
  migrate(d, "2026-08-12T00:00:00.000Z");
  d.exec(`
    INSERT INTO source (id, kind, publisher, title, url, retrieved_at, doc_hash, hash_kind, retrieval_kind)
      VALUES ('src', 'eci_declaration', 'ECI', 'Results', 'repo:data/seed/x.json', '2026-07-01T00:00:00.000Z',
              'h', 'document_bytes', 'fetched');
    INSERT INTO boundary_epoch (id, name, effective_from, source_id)
      VALUES ('delim-2008', 'Delimitation Order, 2008', '2008-02-19', 'src');
    INSERT INTO place (id, kind, canonical_name) VALUES ('wb', 'state', 'West Bengal');
    INSERT INTO place (id, kind, parent_id, canonical_name) VALUES ('wb.coochbehar', 'district', 'wb', 'Cooch Behar');
    INSERT INTO place (id, kind, parent_id, canonical_name) VALUES ('wb.ac.001', 'ac', 'wb.coochbehar', 'Mekliganj');
    INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
      VALUES (1, 'wb.ac.001', 'wb', 'ac', 'delim-2008', 1, 'Mekliganj', 'general');
    INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, polling_month)
      VALUES ('wb-assembly-2021', 'assembly', 'state', 'wb', 'delim-2008', 'WB 2021', 'declared', 'ac', 2021, 4);
    INSERT INTO contest (id, election_id, place_version_id, lifecycle)
      VALUES ('c1', 'wb-assembly-2021', 1, 'declared');
  `);
  // A table other rows point at cannot be dropped while foreign keys are enforced, and the contest points at the election.
  d.exec("PRAGMA foreign_keys = OFF");
  for (const table of broken) {
    d.exec(`DROP TABLE ${table}; CREATE VIEW ${table} AS SELECT no_such_function() AS id`);
  }
  d.close();
  return path;
}

/**
 * Each page, the table whose query is broken, and why that route. The state page reads once after `placeView`
 * has resolved the place, through `stateView`, which used to catch anything and render the page without a map.
 */
const DEFECTS: [route: string, query: string, segments: string, broken: string][] = [
  ["/search", "q=wb", "", "election"],
  ["/coverage", "", "", "election"],
  ["/", "", "", "election"],
  ["/election", "", "wb-assembly-2021", "election"],
  ["/review/merges", "", "", "person_merge_candidate"],
  ["/state", "", "wb", "place_geometry"],
];

for (const [route, query, segments, broken] of DEFECTS) {
  test(`${route} ${query} ${segments}: a defect in a query on ${broken} is thrown, not shown as a missing registry`, { skip }, async () => {
    // The control comes first, so a failure below is the defect and not the fixture.
    const fine = await render(registry(), route, query, segments);
    assert.equal(fine.failed, false, fine.err);
    assert.doesNotMatch(fine.out, /not built in this checkout/);

    const r = await render(registry(broken), route, query, segments);
    assert.equal(r.failed, true, "the page rendered over a broken query");
    assert.match(r.err, /no such function/);
  });
}

test("the merge decision on a registry with a defect in the write is thrown, not reported as an outage", { skip }, async () => {
  const r = await render(registry("person_merge_candidate"), "/review/merges/decide", "a=p1&b=p2&decision=merged", "", true);
  assert.equal(r.failed, true, "the route answered instead of failing");
  assert.match(r.err, /no such function/);
});

test("no page opens the registry itself or catches around a read", () => {
  // The tests above prove what the pages do today. This is what keeps a new page from doing it the old way: its
  // own openRead(), which leaks the handle on every path that does not reach a close, and a bare `catch`, which
  // reads a bug in a query as "registry not built". Both are what readRegistry is for.
  const src = new URL("../../../../src/", import.meta.url);
  let scanned = 0;
  for (const f of readdirSync(src, { recursive: true, encoding: "utf8" })) {
    if (!/\.tsx?$/.test(f) || f.startsWith("data")) continue;
    const text = readFileSync(new URL(f, src), "utf8");
    scanned++;
    assert.doesNotMatch(text, /\bopenRead\b|db\/open\.ts/, `src/${f} opens the registry itself; use readRegistry`);
    assert.doesNotMatch(text, /\bcatch\s*[({]/, `src/${f} catches; readRegistry already separates an outage from a defect`);
  }
  assert.ok(scanned > 20, `scanned ${scanned} files; the root has moved`);
});

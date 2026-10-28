// The merge-decision route and its page, with and without MANDATE_REVIEW_WRITES.
//
// The route has no auth, so it writes only where the switch is set. These render the real route handler and the
// real page in a child process through ops/probe/render, as outage.test.ts does, because Node strips types but
// not JSX and cannot import `next/server` bare. That is also why the registry is a file in a temp directory and
// not `:memory:`: a child process cannot share a memory database, and the claim worth proving is about the route
// the child imports, so a seam extracted only to take a `:memory:` handle would leave the route's own guard untested.
// Every "wrote nothing" below has a control in this file that writes to the same kind of fixture, so an unchanged
// row means the guard and not a fixture that cannot be written to.

import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { open, openRead } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";

const ROOT = new URL("../../../../", import.meta.url).pathname;
const run = promisify(execFile);
const skip = existsSync(join(ROOT, "node_modules/react-dom")) ? false : "no node_modules — run npm install";
const NOW = "2026-08-12T00:00:00.000Z";
const FORM = "a=p1a&b=p1b&decision=merged";

/**
 * What the child printed and how it ended. `writes` is the value of MANDATE_REVIEW_WRITES in the child, and
 * `undefined` leaves it out altogether: the switch comes from the test, never from the shell that runs the suite.
 */
async function render(
  dbPath: string,
  route: string,
  query: string,
  writes: string | undefined,
): Promise<{ out: string; err: string; failed: boolean }> {
  const env: NodeJS.ProcessEnv = { ...process.env, MANDATE_DB_PATH: dbPath };
  if (writes === undefined) delete env["MANDATE_REVIEW_WRITES"];
  else env["MANDATE_REVIEW_WRITES"] = writes;
  try {
    const { stdout, stderr } = await run(
      process.execPath,
      ["--import", "./ops/probe/render/register.mjs", "./ops/probe/render/render.mjs", route, query],
      { cwd: ROOT, env, maxBuffer: 64 * 1024 * 1024 },
    );
    return { out: stdout, err: stderr, failed: false };
  } catch (e) {
    const x = e as { stdout?: string; stderr?: string };
    return { out: x.stdout ?? "", err: x.stderr ?? "", failed: true };
  }
}

/** A migrated registry with two people and one pending candidate pair between them. */
function pending(): string {
  const path = join(mkdtempSync(join(tmpdir(), "mandate-review-writes-")), "registry.db");
  const d = open(path);
  migrate(d, NOW);
  const people: [id: string, name: string][] = [["p1a", "Anil Roy"], ["p1b", "Anil Rai"]];
  for (const [id, name] of people) {
    d.prepare(
      `INSERT INTO person (id, canonical_name, canonical_name_script, names, review_state, created_at)
       VALUES (?, ?, 'latn', '{}', 'auto', ?)`,
    ).run(id, name, NOW);
  }
  d.prepare(
    `INSERT INTO person_merge_candidate (person_a_id, person_b_id, score, evidence, blocked_by, state, queued_at)
     VALUES ('p1a', 'p1b', 0.8, '{"nameSim":0.9}', 'name', 'pending', ?)`,
  ).run(NOW);
  d.close();
  return path;
}

/** The pair's row, read through a second connection after the child has exited. */
function row(path: string): { state: string; decided_by: string | null } {
  const d = openRead(path);
  try {
    const r = d.prepare("SELECT state, decided_by FROM person_merge_candidate").get() as
      | { state: string; decided_by: string | null }
      | undefined;
    assert.ok(r !== undefined, "the fixture pair is gone");
    return { ...r };
  } finally {
    d.close();
  }
}

test("with the switch on, the decision route records the decision", { skip }, async () => {
  const path = pending();
  const r = await render(path, "/review/merges/decide", FORM, "1");
  assert.equal(r.failed, false, r.err);
  assert.equal(r.out, "303 http://localhost/review/merges?saved=merged");
  assert.deepEqual(row(path), { state: "merged", decided_by: "user:local" });
});

test("without the switch, the decision route answers 403 and writes nothing", { skip }, async () => {
  // Unset, and every value that is not exactly 1: an opt-in spelled any other way is off.
  for (const writes of [undefined, "", "0", "true"]) {
    const path = pending();
    const r = await render(path, "/review/merges/decide", FORM, writes);
    assert.equal(r.failed, false, r.err);
    assert.equal(r.out, "403 null", `MANDATE_REVIEW_WRITES=${JSON.stringify(writes)}`);
    assert.deepEqual(row(path), { state: "pending", decided_by: null }, `MANDATE_REVIEW_WRITES=${JSON.stringify(writes)}`);
  }
});

test("without the switch the route does not open the registry at all", { skip }, async () => {
  // writeRegistry's open() creates the file, so a file that is still absent is a registry nobody touched.
  const path = join(mkdtempSync(join(tmpdir(), "mandate-review-writes-")), "nested", "registry.db");
  const off = await render(path, "/review/merges/decide", FORM, undefined);
  assert.equal(off.out, "403 null", off.err);
  assert.equal(existsSync(path), false, "the guarded route created the registry");
  // The control: the same request with the switch on does reach open().
  const on = await render(path, "/review/merges/decide", FORM, "1");
  assert.equal(on.out, "303 http://localhost/review/merges?error=unavailable", on.err);
  assert.equal(existsSync(path), true, "the switch did not reach the registry either");
});

test("the page shows the buttons only when the switch is on, and the pair either way", { skip }, async () => {
  const path = pending();
  const on = await render(path, "/review/merges", "", "1");
  assert.equal(on.failed, false, on.err);
  assert.match(on.out, /<form[^>]*action="\/review\/merges\/decide"/);
  for (const label of ["Same person", "Different people", "Cannot tell from this"]) assert.match(on.out, new RegExp(label));
  assert.doesNotMatch(on.out, /MANDATE_REVIEW_WRITES/, "the notice is for the read-only page");

  for (const writes of [undefined, "", "0", "true"]) {
    const off = await render(path, "/review/merges", "", writes);
    const said = `MANDATE_REVIEW_WRITES=${JSON.stringify(writes)}`;
    assert.equal(off.failed, false, off.err);
    assert.match(off.out, /Anil Roy/, said);
    assert.match(off.out, /Anil Rai/, said);
    // Not `<form`: the shell's search box is one.
    assert.doesNotMatch(off.out, /\/review\/merges\/decide|<button|Same person|Different people|Cannot tell/, said);
    assert.match(off.out, /Decisions are recorded only on a local checkout with <code>MANDATE_REVIEW_WRITES=1<\/code>/, said);
  }
});

/** A migrated registry with a pending candidate pair at each score given, each between two people of its own. */
function queued(scores: number[]): string {
  const path = join(mkdtempSync(join(tmpdir(), "mandate-review-bands-")), "registry.db");
  const d = open(path);
  migrate(d, NOW);
  scores.forEach((score, i) => {
    for (const [id, name] of [[`q${i}a`, `Anil Roy ${i}`], [`q${i}b`, `Anil Rai ${i}`]] as const) {
      d.prepare(
        `INSERT INTO person (id, canonical_name, canonical_name_script, names, review_state, created_at)
         VALUES (?, ?, 'latn', '{}', 'auto', ?)`,
      ).run(id, name, NOW);
    }
    d.prepare(
      `INSERT INTO person_merge_candidate (person_a_id, person_b_id, score, evidence, blocked_by, state, queued_at)
       VALUES (?, ?, ?, '{}', 'name', 'pending', ?)`,
    ).run(`q${i}a`, `q${i}b`, score, NOW);
  });
  d.close();
  return path;
}

test("the page names the band that holds most of the queue, from the queue and not from a figure written in it", { skip }, async () => {
  // Three of four pairs in the lowest band, and then two of three in the one above it: the sentence follows the data.
  const low = await render(queued([0.56, 0.57, 0.58, 0.8]), "/review/merges", "", undefined);
  assert.equal(low.failed, false, low.err);
  assert.match(low.out, /because the 0\.55–0\.65 band holds 3 of the 4 pairs/);
  const mid = await render(queued([0.8, 0.81, 0.56]), "/review/merges", "", undefined);
  assert.match(mid.out, /because the 0\.75–0\.85 band holds 2 of the 3 pairs/);
  assert.doesNotMatch(low.out + mid.out, /7,114/);
});

test("the page reports a decision only where decisions are recorded, and only one the route could have made", { skip }, async () => {
  const path = pending();
  const shows = async (query: string, writes: string | undefined): Promise<boolean> => {
    const r = await render(path, "/review/merges", query, writes);
    assert.equal(r.failed, false, r.err);
    return /class="rv-saved/.test(r.out);
  };
  // What the route redirects with, under the switch it needs: reported.
  for (const query of ["saved=merged", "saved=deferred", "already=rejected", "error=malformed", "error=unavailable"]) {
    assert.equal(await shows(query, "1"), true, query);
  }
  // A link somebody wrote by hand says nothing was recorded that was not.
  for (const query of ["saved=anything%20at%20all", "saved=", "already=1", "error=whatever"]) {
    assert.equal(await shows(query, "1"), false, query);
  }
  // And without the switch the page says the pair is shown read-only, which "Recorded as merged" would contradict.
  for (const query of ["saved=merged", "already=merged", "error=malformed"]) {
    assert.equal(await shows(query, undefined), false, query);
  }
});

test("the page is not offered to search engines, and says applying a decision is not built", { skip }, async () => {
  const meta = await run(
    process.execPath,
    [
      "--import", "./ops/probe/render/register.mjs", "--input-type=module", "-e",
      `const m = await import("./src/app/review/merges/page.tsx"); process.stdout.write(JSON.stringify(m.metadata));`,
    ],
    { cwd: ROOT },
  );
  assert.deepEqual((JSON.parse(meta.stdout) as { robots: unknown }).robots, { index: false, follow: false });
  const saved = await render(pending(), "/review/merges", "saved=merged", "1");
  assert.match(saved.out, /Recorded as <strong>merged<\/strong>\. Nothing was merged/);
  assert.doesNotMatch(saved.out, /separate step|apply-reviewed/, "there is no step to take, and no command for it");
});

test("nothing that is deployed sets the switch", () => {
  // fly.toml and the Dockerfile are what production is built from. A comment may name the variable; a setting may not.
  for (const file of ["fly.toml", "Dockerfile"]) {
    const settings = readFileSync(join(ROOT, file), "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    assert.doesNotMatch(settings, /MANDATE_REVIEW_WRITES/, `${file} sets the switch that turns on the unauthenticated write route`);
  }
});

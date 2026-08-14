// Tests for the WB Votes -> MANDATE redirect resolvers.
//
// The point of this file is coverage, not correctness of a sample. A redirect that resolves for the
// three ids someone happened to try, and 404s for the other 291, is worse than no redirect at all:
// it looks fixed. So these walk the whole old URL space — every constituency id in the seed and
// every candidate id in the seed — and assert that all of them land somewhere real.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { openRead, DEV_DB_PATH } from "../db/open.ts";
import { acNumber, personForMynetaId, placePathForLegacyId, sittingMemberForLegacyId } from "./legacy.ts";

const HAVE_DB = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const opts = { skip: HAVE_DB ? false : "no .data/registry.db — run npm run registry:ingest" };

const seed = <T,>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../../../../data/seed/${name}.json`, import.meta.url), "utf8")) as T;

test("acNumber accepts the old id shape and rejects everything else", () => {
  assert.equal(acNumber("c0001"), 1);
  assert.equal(acNumber("c0294"), 294);
  assert.equal(acNumber("c42"), 42);
  assert.equal(acNumber(" c0007 "), 7);
  for (const bad of ["", "c0000", "c", "cabc", "0001", "c1234", "c-1", "../../etc/passwd", "c0001;--"]) {
    assert.equal(acNumber(bad), null, `${bad} must not resolve to a seat`);
  }
});

test("every constituency id in the seed redirects to a real place path", opts, () => {
  const db = openRead();
  const rows = seed<{ id: string; name: string }[]>("constituencies");
  assert.ok(rows.length >= 294, `seed has only ${rows.length} constituencies`);

  const missing: string[] = [];
  for (const c of rows) {
    const path = placePathForLegacyId(db, c.id);
    if (path === null) {
      missing.push(c.id);
      continue;
    }
    // 4 segments: "", "pl", "wb", district, ac — a missing district would produce an empty one.
    const parts = path.split("/");
    // CANONICAL, so an old id redirects once. `/constituency/wb/<seat>` — four parts, and the district is
    // no longer in the path because a delimitation can move a seat between districts.
    assert.equal(parts.length, 4, `${c.id} -> ${path} is not /constituency/wb/<seat>`);
    assert.equal(parts[1], "constituency", `${c.id} -> ${path} is not a constituency route`);
    assert.ok(
      parts.every((p, i) => i === 0 || p.length > 0),
      `${c.id} -> ${path} has an empty segment`,
    );
    assert.match(path, /^\/constituency\/wb\/[a-z0-9-]+$/, `${c.id} -> ${path} is not a slug path`);
  }
  assert.deepEqual(missing, [], `${missing.length} constituency ids resolve to nothing`);
});

test("every candidate id in the seed redirects to a person", opts, () => {
  const db = openRead();
  const rows = seed<{ id: string; name: string }[]>("candidates");
  assert.ok(rows.length > 2000, `seed has only ${rows.length} candidates`);

  const missing: string[] = [];
  for (const c of rows) {
    if (personForMynetaId(db, c.id) === null) missing.push(c.id);
  }
  assert.deepEqual(
    missing.slice(0, 10),
    [],
    `${missing.length} of ${rows.length} candidate ids resolve to nothing`,
  );
});

test("a sitting member resolves for every seat", opts, () => {
  const db = openRead();
  const rows = seed<{ id: string }[]>("constituencies");
  const missing = rows.filter((c) => sittingMemberForLegacyId(db, c.id) === null).map((c) => c.id);
  // 2026 recorded 293 of 294 winners, so exactly one seat is allowed to have no sitting member.
  assert.ok(
    missing.length <= 1,
    `${missing.length} seats have no resolvable member: ${missing.slice(0, 5).join(", ")}`,
  );
});

test("garbage ids resolve to null rather than throwing", opts, () => {
  const db = openRead();
  for (const bad of ["", "   ", "c9999", "wb26_999999", "'; DROP TABLE person; --", "\u0000"]) {
    assert.equal(placePathForLegacyId(db, bad), null);
    assert.equal(sittingMemberForLegacyId(db, bad), null);
    assert.equal(personForMynetaId(db, bad), null);
  }
});

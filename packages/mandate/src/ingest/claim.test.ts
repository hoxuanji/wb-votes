// A claim's identity (decision D29, 2026-11-01): what is claimed, never what it is claimed to be. The key is written once
// in TypeScript (core/ids.ts claimKey) and once in SQL (migration 019), and the tests here hold the two equal, hold
// putClaim to the semantics that identity implies, and run the migration on claims written the way each importer used to.

import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { claimKey } from "../core/ids.ts";
import { all, get, open } from "../db/index.ts";
import { MIGRATIONS_DIR, migrate } from "../db/migrate.ts";
import { putClaim } from "./claim.ts";

const NOW = "2026-08-12T00:00:00.000Z";
const SOURCES = `
  INSERT INTO source (id, kind, retrieved_at, doc_hash) VALUES ('s1','static_module','2026-08-12','sha256:1');
  INSERT INTO source (id, kind, retrieved_at, doc_hash) VALUES ('s2','static_module','2026-08-12','sha256:2');
`;

function memory(): DatabaseSync {
  const d = open(":memory:");
  migrate(d, NOW);
  d.exec(SOURCES);
  return d;
}

const by = (sourceId: string) => ({ sourceId, parserVersion: "t1", extractedAt: NOW });
const claims = (d: DatabaseSync) =>
  all<{ id: number; subject_ref: string; predicate: string; object_value: string; unit: string | null; as_of: string | null; content_key: string }>(
    d,
    "SELECT id, subject_ref, predicate, object_value, unit, as_of, content_key FROM claim ORDER BY id",
  );
const citedBy = (d: DatabaseSync, claimId: number) =>
  all<{ source_id: string }>(d, "SELECT source_id FROM citation WHERE claim_id = ? ORDER BY source_id", claimId).map((r) => r.source_id);

test("claimKey: the same four parts are the same key, any other part is another, and the value is not one of them", () => {
  const k = claimKey("contest:c1", "elected_unopposed", "2024-06-04", null);
  assert.equal(k, claimKey("contest:c1", "elected_unopposed", "2024-06-04", null));
  assert.notEqual(k, claimKey("contest:c2", "elected_unopposed", "2024-06-04", null));
  assert.notEqual(k, claimKey("contest:c1", "elected_unopposed", "2024-06-05", null));
  assert.notEqual(k, claimKey("contest:c1", "elected_unopposed", "2024-06-04", "votes"));
  assert.notEqual(claimKey("ab", "c", null, null), claimKey("a", "bc", null, null), "where one part ends is part of the key");
});

test("putClaim: a claim restated is the same claim, and a second source that says it adds a citation", () => {
  const d = memory();
  const first = putClaim(d, { subject: "person:x", predicate: "age_declared", value: "42", unit: "years", asOf: "2026-01-01" }, by("s1"));
  const again = putClaim(d, { subject: "person:x", predicate: "age_declared", value: "42", unit: "years", asOf: "2026-01-01" }, by("s1"));
  assert.equal(again, first);
  assert.equal(claims(d).length, 1);
  assert.deepEqual(citedBy(d, first), ["s1"]);

  putClaim(d, { subject: "person:x", predicate: "age_declared", value: "42", unit: "years", asOf: "2026-01-01" }, by("s2"));
  assert.equal(claims(d).length, 1, "still one claim");
  assert.deepEqual(citedBy(d, first), ["s1", "s2"], "two documents say it");
  assert.equal(claims(d)[0]?.content_key, claimKey("person:x", "age_declared", "2026-01-01", "years"));
  assert.ok(!claims(d)[0]?.content_key.includes("42"), "the value is not part of the key");
  d.close();
});

test("putClaim: a corrected value is the same claim with the new value, and only the source that says the new value cites it", () => {
  const d = memory();
  const id = putClaim(d, { subject: "contest:c1", predicate: "turnout_pct", value: "61.2", asOf: "2024-06-04" }, by("s1"));
  const corrected = putClaim(d, { subject: "contest:c1", predicate: "turnout_pct", value: "61.4", asOf: "2024-06-04" }, by("s2"));
  assert.equal(corrected, id, "a correction restates the claim and is not a second one beside it");
  assert.equal(claims(d).length, 1);
  assert.equal(claims(d)[0]?.object_value, "61.4");
  assert.deepEqual(citedBy(d, id), ["s2"], "s1 contained 61.2, and a citation must not outlive the value it cites");
  d.close();
});

test("putClaim: a different date or unit is a different claim", () => {
  const d = memory();
  const a = putClaim(d, { subject: "place:p", predicate: "population", value: "10", asOf: "2011" }, by("s1"));
  const b = putClaim(d, { subject: "place:p", predicate: "population", value: "12", asOf: "2021" }, by("s1"));
  const c = putClaim(d, { subject: "place:p", predicate: "population", value: "12", asOf: "2021", unit: "thousands" }, by("s1"));
  assert.equal(new Set([a, b, c]).size, 3);
  d.close();
});

test("the key is spelled the same in SQL as in TypeScript, on awkward strings", () => {
  const d = memory();
  let seed = 7;
  const next = (n: number): number => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n);
  const pool = ["", "a", "b|c", 'say "hi"', "back\\slash", "new\nline", "प्रश्न", "x:y:z", "2024-06-04", " lead", "trail "];
  const insert = d.prepare(
    "INSERT INTO claim (subject_ref, predicate, object_value, unit, as_of, confidence, content_key) VALUES (?, ?, 'v', ?, ?, 'verified', ?)",
  );
  let written = 0;
  for (let i = 0; i < 300; i++) {
    const subject = `s${pool[next(pool.length)]}${i}`;
    const predicate = `p${pool[next(pool.length)]}`;
    const asOf = next(3) === 0 ? null : (pool[next(pool.length)] as string);
    const unit = next(3) === 0 ? null : (pool[next(pool.length)] as string);
    insert.run(subject, predicate, unit, asOf, claimKey(subject, predicate, asOf, unit));
    written += 1;
  }
  const disagree = get<{ n: number }>(
    d,
    `SELECT COUNT(*) AS n FROM claim
      WHERE content_key <> subject_ref || char(31) || predicate || char(31) || COALESCE(as_of, '') || char(31) || COALESCE(unit, '')`,
  );
  assert.equal(written, 300);
  assert.equal(disagree?.n, 0, "migration 019 and core/ids.ts claimKey are one definition");
  d.close();
});

test("migration 019 re-keys claims written under all four old schemes, moves ECI's sentence off `unit`, and changes no value", () => {
  // The registry on disk is at 018 with claims as each importer wrote them.
  const dir = mkdtempSync(join(tmpdir(), "mandate-migrations-"));
  for (const f of readdirSync(MIGRATIONS_DIR).filter((x) => x < "019")) cpSync(join(MIGRATIONS_DIR, f), join(dir, f));
  const d = open(":memory:");
  assert.equal(migrate(d, NOW, dir).at(-1), "018_current_result.sql");
  d.exec(SOURCES);

  const sentence = 'Unopposed — ECI says "uncontested" (a \\ backslash)\nand a second line';
  const put = d.prepare(
    "INSERT INTO claim (subject_ref, predicate, object_value, unit, as_of, confidence, content_key) VALUES (?, ?, ?, ?, ?, 'verified', ?)",
  );
  const cite = d.prepare("INSERT INTO citation (claim_id, source_id, page_no, parser_version, extracted_at) VALUES (?, ?, 0, 'old', ?)");
  const idOf = (key: string | null, subject: string, predicate: string): number =>
    get<{ id: number }>(d, "SELECT id FROM claim WHERE subject_ref = ? AND predicate = ?", subject, predicate)?.id as number;

  put.run("person:x", "age_declared", "42", "years", "2026-01-01", "0123456789abcdef"); // wb-static: a hash
  put.run("contest:ls-2024:gj-pc023", "elected_unopposed", "true", sentence, "2024-06-04", "contest:ls-2024:gj-pc023|elected_unopposed|true"); // ECI: the value in the key
  put.run("place_version:9001", "name_variant_eci_2024", '"Araku"', 'registry "ARUKU" vs ECI "Araku"', "2024-06-04", 'place_version:9001|name_variant_eci_2024|"Araku"');
  put.run("epoch:delim-2008", "statute", '"DPACO"', null, null, "epoch:delim-2008|statute"); // the delimitation chain
  put.run("place:old", "legacy_fact", "1", null, null, null); // rings 1-3 predate the column
  cite.run(idOf(null, "contest:ls-2024:gj-pc023", "elected_unopposed"), "s1", NOW);
  const before = claims(d).map((c) => [c.subject_ref, c.predicate, c.object_value]);

  assert.deepEqual(migrate(d, NOW), ["019_claim_identity.sql"]);

  for (const c of claims(d)) {
    assert.equal(c.content_key, claimKey(c.subject_ref, c.predicate, c.as_of, c.unit), `${c.subject_ref} ${c.predicate}`);
  }
  assert.deepEqual(
    claims(d).filter((c) => c.predicate !== "elected_unopposed.eci_note").map((c) => [c.subject_ref, c.predicate, c.object_value]),
    before,
    "no value changed",
  );
  const unopposed = claims(d).find((c) => c.predicate === "elected_unopposed");
  assert.equal(unopposed?.unit, null, "a sentence is not a unit");
  assert.equal(claims(d).find((c) => c.predicate === "name_variant_eci_2024")?.unit, null);

  const note = claims(d).find((c) => c.predicate === "elected_unopposed.eci_note");
  assert.equal(JSON.parse(note?.object_value ?? "null"), sentence, "ECI's words survive, as valid JSON, quote, backslash and newline included");
  assert.equal(note?.subject_ref, "contest:ls-2024:gj-pc023");
  assert.deepEqual(citedBy(d, note?.id as number), ["s1"], "cited by what cited the result");
  assert.equal(claims(d).length, before.length + 1, "one claim added: the note, and nothing else");
  assert.deepEqual(migrate(d, NOW), [], "applied once");
  d.close();
});

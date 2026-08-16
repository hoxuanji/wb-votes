import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../../db/migrate.ts";
import { formatRelease, markdownRelease, releaseReport } from "./report.ts";

/**
 * The national coverage report.
 *
 * The property worth guarding is that it CANNOT FLATTER. Every number is a query, so the way this breaks is
 * a rule that classifies a gap as complete — and each test below is one of those.
 */

function fixture(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db, "2026-08-13T00:00:00.000Z");
  db.exec(`
    INSERT INTO source (id, kind, publisher, title, url, retrieved_at, doc_hash, hash_kind, retrieval_kind)
      VALUES ('src', 'boundary_geometry', 'A Publisher', 'Boundaries', 'https://x', '2026-01-01T00:00:00Z', 'h', 'document_bytes', 'fetched');
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('new', 'An order', '2008-02-19');
    INSERT INTO place (id, kind, canonical_name) VALUES ('zz', 'state', 'Zedland');
    INSERT INTO place (id, kind, parent_id, canonical_name) VALUES
      ('zz.d1', 'district', 'zz', 'One'),
      ('zz.ac.001', 'ac', 'zz.d1', 'Alpha'), ('zz.ac.002', 'ac', 'zz.d1', 'Beta');
    INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, district_place_id) VALUES
      (1, 'zz.ac.001', 'zz', 'ac', 'new', 1, 'Alpha', 'zz.d1'),
      (2, 'zz.ac.002', 'zz', 'ac', 'new', 2, 'Beta', 'zz.d1');
    INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year)
      VALUES ('zz-2021', 'assembly', 'state', 'zz', 'new', 'Zedland 2021', 'declared', 'ac', 2021);
    INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES
      ('c1', 'zz-2021', 1, 'declared'), ('c2', 'zz-2021', 2, 'declared');
    INSERT INTO person (id, canonical_name, created_at) VALUES ('p1', 'A', '2026-01-01T00:00:00Z'), ('p2', 'B', '2026-01-01T00:00:00Z');
    INSERT INTO candidacy (id, contest_id, person_id, status) VALUES ('k1', 'c1', 'p1', 'elected'), ('k2', 'c2', 'p2', 'elected');
    INSERT INTO result (contest_id, candidacy_id, votes, is_winner, source_id, ingested_at) VALUES
      ('c1', 'k1', 100, 1, 'src', '2026-01-01T00:00:00Z');
  `);
  return db;
}

const geom = (versionId: number, box = "0 0 10 10") =>
  `INSERT INTO place_geometry (place_version_id, path, centroid_x, centroid_y, view_box, source_id)
     VALUES (${versionId}, 'M0 0L1 0L1 1Z', 0.5, 0.5, '${box}', 'src')`;

test("an election with one seat undecided is PARTIAL, not complete", () => {
  const db = fixture();
  const row = releaseReport(db).headline[0];
  assert.equal(row?.seats, 2);
  assert.equal(row?.decided, 1);
  assert.equal(row?.results, "PARTIAL");
  assert.equal(row?.geometry, "UNAVAILABLE");
  db.close();
});

test("a polygon in another coordinate space is not counted as drawn", () => {
  // The rule that turned West Bengal 2026 back from "294 of 294" into what the map actually draws. A
  // report that counts rows rather than drawable rows tells a reader the map is complete when it is not.
  const db = fixture();
  db.exec(geom(1));
  db.exec(geom(2, "0 0 400 580"));
  const row = releaseReport(db).headline[0];
  assert.equal(row?.drawn, 1, "the second polygon is in another projection and cannot be drawn beside the first");
  assert.equal(row?.geometry, "PARTIAL");
  db.close();
});

test("two place_versions for one seat are a caveat; two seats of one name are not", () => {
  const db = fixture();
  assert.deepEqual(releaseReport(db).caveats, []);

  // Two genuinely distinct constituencies called Alpha, in DIFFERENT districts. India has two Bishnupurs in
  // West Bengal, which is why a seat's URL carries its district. Not a defect.
  db.exec(`
    INSERT INTO place (id, kind, parent_id, canonical_name) VALUES ('zz.d2', 'district', 'zz', 'Two'), ('zz.ac.003', 'ac', 'zz.d2', 'Alpha');
    INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, district_place_id)
      VALUES (3, 'zz.ac.003', 'zz', 'ac', 'new', 3, 'Alpha', 'zz.d2');
    INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES ('c3', 'zz-2021', 3, 'declared');
  `);
  assert.deepEqual(releaseReport(db).caveats, [], "two seats of one name in two districts were called a defect");

  // The same seat, twice, in one district and one epoch — two sources numbering it differently.
  db.exec(`
    INSERT INTO place (id, kind, parent_id, canonical_name) VALUES ('zz.ac.004', 'ac', 'zz.d1', 'ALPHA');
    INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, district_place_id)
      VALUES (4, 'zz.ac.004', 'zz', 'ac', 'new', 4, 'ALPHA', 'zz.d1');
    INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES ('c4', 'zz-2021', 4, 'declared');
  `);
  const c = releaseReport(db).caveats;
  assert.equal(c.length, 1);
  assert.match(c[0]?.kind ?? "", /one constituency held by two place_versions/);
  assert.match(c[0]?.detail ?? "", /same name, same district/);
  db.close();
});

test("a contest with two declared winners is a caveat", () => {
  const db = fixture();
  db.exec(`
    INSERT INTO person (id, canonical_name, created_at) VALUES ('p3', 'C', '2026-01-01T00:00:00Z');
    INSERT INTO candidacy (id, contest_id, person_id, status) VALUES ('k3', 'c1', 'p3', 'elected');
    INSERT INTO result (contest_id, candidacy_id, votes, is_winner, source_id, ingested_at)
      VALUES ('c1', 'k3', 90, 1, 'src', '2026-01-01T00:00:00Z');
  `);
  const r = releaseReport(db);
  assert.equal(r.headline[0]?.duplicateWinners, 1);
  assert.ok(r.caveats.some((c) => /more than one declared winner/.test(c.kind)));
  db.close();
});

test("the report renders as text and as markdown, and both carry the states", () => {
  const db = fixture();
  db.exec(geom(1));
  const r = releaseReport(db);
  const text = formatRelease(r);
  assert.match(text, /jurisdictions with results/);
  assert.match(text, /Zedland\s+ac\s+2021/);
  assert.match(text, /PARTIAL/);
  const md = markdownRelease(r);
  assert.match(md, /\| Zedland \| AC \| 2021 \| `new` \| 2 \| 1 \| 1 \| PARTIAL \| PARTIAL \|/);
  assert.match(md, /Generated — do not edit/);
  db.close();
});

test("a source cited by locator alone is counted separately from one whose bytes are held", () => {
  // The distinction the whole provenance model turns on, and the one a coverage report is most tempted to
  // blur: 2,924 of this registry's sources have never been fetched.
  const db = fixture();
  db.exec(
    `INSERT INTO source (id, kind, title, url, retrieved_at, doc_hash, hash_kind, retrieval_kind)
       VALUES ('locator', 'press', 'A report', 'https://y', '2026-01-01T00:00:00Z', 'urlhash', 'url_only', 'asserted_by_upstream')`,
  );
  const rows = releaseReport(db).sources;
  assert.equal(rows.find((x) => x.label.includes("bytes fetched"))?.value, 1);
  assert.equal(rows.find((x) => x.label.includes("never fetched"))?.value, 1);
  db.close();
});

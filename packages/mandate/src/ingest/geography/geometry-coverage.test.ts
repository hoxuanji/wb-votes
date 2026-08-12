import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../../db/migrate.ts";
import { geometryCoverage, formatCoverage } from "./geometry-coverage.ts";

/**
 * The coverage matrix, on a fixture small enough to reason about.
 *
 * What these guard is the DIFFERENCE BETWEEN THE FOUR STATES, because that is the whole product of this
 * module: a release is judged on whether it can tell "no map exists" from "a map exists for another
 * boundary", and both of those from "drawn".
 */

function fixture(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db, "2026-08-12T00:00:00.000Z");
  db.exec(`
    INSERT INTO source (id, kind, publisher, title, url, retrieved_at, doc_hash, hash_kind, retrieval_kind)
      VALUES ('src-geo', 'census', 'A Publisher', 'Boundaries, projected', 'https://x/y', '2026-01-01T00:00:00Z', 'h', 'document_bytes', 'fetched');
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES
      ('old', 'Old order', '1976-01-01'), ('new', 'New order', '2008-02-19');
    INSERT INTO place (id, kind, canonical_name) VALUES ('zz', 'state', 'Zedland');
    INSERT INTO place (id, kind, parent_id, canonical_name) VALUES
      ('zz.ac.001', 'ac', 'zz', 'Alpha'), ('zz.ac.002', 'ac', 'zz', 'Beta'),
      ('zz.old.001', 'ac', 'zz', 'Alpha (old)'), ('zz.pc.001', 'pc', 'zz', 'Zed');
    INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name) VALUES
      (1, 'zz.ac.001', 'zz', 'ac', 'new', 1, 'Alpha'),
      (2, 'zz.ac.002', 'zz', 'ac', 'new', 2, 'Beta'),
      (3, 'zz.old.001', 'zz', 'ac', 'old', 1, 'Alpha'),
      (4, 'zz.pc.001', 'zz', 'pc', 'new', 1, 'Zed');
    INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year) VALUES
      ('zz-a-2021', 'assembly', 'state', 'zz', 'new', 'Zedland 2021', 'declared', 'ac', 2021),
      ('zz-a-1977', 'assembly', 'state', 'zz', 'old', 'Zedland 1977', 'declared', 'ac', 1977),
      ('zz-g-2024', 'general', 'union', 'zz', 'new', 'Lok Sabha 2024', 'declared', 'pc', 2024);
    INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES
      ('c1', 'zz-a-2021', 1, 'declared'), ('c2', 'zz-a-2021', 2, 'declared'),
      ('c3', 'zz-a-1977', 3, 'declared'), ('c4', 'zz-g-2024', 4, 'declared');
  `);
  return db;
}

const rowFor = (c: ReturnType<typeof geometryCoverage>, house: string, epoch: string) =>
  c.rows.find((r) => r.house === house && r.epochId === epoch);

test("with no geometry at all, every group is UNAVAILABLE", () => {
  const db = fixture();
  const c = geometryCoverage(db);
  assert.equal(c.rows.length, 3);
  assert.deepEqual(
    c.rows.map((r) => r.status),
    ["UNAVAILABLE", "UNAVAILABLE", "UNAVAILABLE"],
  );
  assert.equal(c.totals.drawn, 0);
  db.close();
});

test("a fully drawn epoch is COMPLETE and a half-drawn one is PARTIAL", () => {
  const db = fixture();
  db.exec(
    `INSERT INTO place_geometry (place_version_id, path, centroid_x, centroid_y, view_box, source_id)
       VALUES (1, 'M0 0L1 0L1 1Z', 0.5, 0.5, '0 0 10 10', 'src-geo')`,
  );
  assert.equal(rowFor(geometryCoverage(db), "ac", "new")?.status, "PARTIAL");
  db.exec(
    `INSERT INTO place_geometry (place_version_id, path, centroid_x, centroid_y, view_box, source_id)
       VALUES (2, 'M2 0L3 0L3 1Z', 2.5, 0.5, '0 0 10 10', 'src-geo')`,
  );
  const c = geometryCoverage(db);
  assert.equal(rowFor(c, "ac", "new")?.status, "COMPLETE");
  assert.equal(rowFor(c, "ac", "new")?.drawn, 2);
  db.close();
});

test("an epoch with no polygon is UNRESOLVED once ANOTHER epoch of the same house has one", () => {
  // The distinction the release turns on: Jharkhand's pre-2008 boundaries exist and its 2019 result may
  // not be drawn on them. That is a different admission from "no map of Jharkhand exists".
  const db = fixture();
  assert.equal(rowFor(geometryCoverage(db), "ac", "old")?.status, "UNAVAILABLE");
  db.exec(
    `INSERT INTO place_geometry (place_version_id, path, centroid_x, centroid_y, view_box, source_id)
       VALUES (1, 'M0 0L1 0L1 1Z', 0.5, 0.5, '0 0 10 10', 'src-geo')`,
  );
  const c = geometryCoverage(db);
  assert.equal(rowFor(c, "ac", "old")?.status, "UNRESOLVED");
  // …and the parliamentary house is untouched by an assembly polygon.
  assert.equal(rowFor(c, "pc", "new")?.status, "UNAVAILABLE");
  db.close();
});

test("the current epoch is the newest election's, not the newest order's", () => {
  const db = fixture();
  const c = geometryCoverage(db);
  assert.equal(rowFor(c, "ac", "new")?.currentEpoch, true);
  assert.equal(rowFor(c, "ac", "old")?.currentEpoch, false);
  // 2 assembly seats + 1 parliamentary, and the 1977 seat excluded from the release denominator.
  assert.equal(c.totals.currentSeats, 3);
  assert.equal(c.totals.seats, 4);
  db.close();
});

test("a source title containing a comma stays one publisher", () => {
  // GROUP_CONCAT's default separator is a comma and the WB source title has one in it, so the first
  // run of this reported two publishers for one source.
  const db = fixture();
  db.exec(
    `INSERT INTO place_geometry (place_version_id, path, centroid_x, centroid_y, view_box, source_id)
       VALUES (1, 'M0 0L1 0L1 1Z', 0.5, 0.5, '0 0 10 10', 'src-geo')`,
  );
  db.exec(`UPDATE source SET publisher = NULL WHERE id = 'src-geo'`);
  assert.deepEqual(rowFor(geometryCoverage(db), "ac", "new")?.publishers, ["Boundaries, projected"]);
  db.close();
});

test("elections carry their own drawability, and their epochs", () => {
  const db = fixture();
  db.exec(
    `INSERT INTO place_geometry (place_version_id, path, centroid_x, centroid_y, view_box, source_id)
       VALUES (1, 'M0 0L1 0L1 1Z', 0.5, 0.5, '0 0 10 10', 'src-geo')`,
  );
  const e = geometryCoverage(db).elections.find((x) => x.electionId === "zz-a-2021");
  assert.deepEqual(e, {
    electionId: "zz-a-2021",
    jurisdictionId: "zz",
    house: "ac",
    kind: "assembly",
    year: 2021,
    epochs: ["new"],
    seats: 2,
    drawn: 1,
  });
  db.close();
});

test("the markdown says the four states and totals what it showed", () => {
  const db = fixture();
  const md = formatCoverage(geometryCoverage(db));
  assert.match(md, /\| Zedland \| AC \| `new` \| 1 \| 2021 \| 2 \| 0 \| — \| UNAVAILABLE \|/);
  assert.match(md, /3 groups over 1 jurisdictions/);
  assert.match(md, /0 of 4 contested seats drawable/);
  // `--only current` drops the 1977 epoch and nothing else.
  assert.doesNotMatch(formatCoverage(geometryCoverage(db), { only: "current" }), /`old`/);
  db.close();
});

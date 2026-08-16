import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { all, get, insertMany, open } from "./index.ts";
// Not via the barrel: migrate() reads ops/migrations/ at call time, which webpack cannot resolve.
import { migrate } from "./migrate.ts";

const NOW = "2026-08-07T00:00:00.000Z";

const EXPECTED_TABLES = [
  // 001 registry (+ the provenance root every ring-1 table cites)
  "source", "boundary_epoch", "place", "place_version", "place_crosswalk", "place_geometry",
  "person", "person_alias", "person_identifier", "person_merge",
  "symbol", "party", "party_version", "party_lineage",
  "alliance", "alliance_version", "alliance_member",
  "election", "election_phase", "contest", "candidacy",
  "affidavit", "affidavit_field", "legal_case",
  // 002 facts
  "result", "round_result", "booth_result", "turnout",
  // 003 provenance
  "source_page", "claim", "citation", "ingest_run", "correction",
  // 004 resolve queue + undo tape
  "person_merge_candidate", "person_merge_undo",
  // 011 constituency identity: cross-delimitation links, nominal only unless a source is cited
  "place_version_link",
  // the runner's own ledger
  "schema_migration",
];

const MIGRATIONS = [
  "001_registry.sql", "002_facts.sql", "003_provenance.sql",
  "004_resolve_queue.sql", "005_provenance_honesty.sql", "006_merge_queue_survives_merge.sql",
  "007_votes_may_be_unknown.sql",
  "008_place_geometry.sql",
  "009_tcpd_person_id.sql",
  "010_reservation_bl.sql",
  "011_place_version_identity.sql",
  "012_place_version_name_required.sql",
  "013_election_event_identity.sql",
  "014_source_publisher_note.sql",
  "015_delimitation_provenance.sql",
  "016_source_boundary_geometry.sql",
];

function migrated(): DatabaseSync {
  const db = open(":memory:");
  migrate(db, NOW);
  return db;
}

/** Minimum chain a fact row needs: source -> epoch -> place -> version -> election -> contest -> candidacy. */
function seed(db: DatabaseSync): void {
  db.exec(`
    INSERT INTO source (id, kind, retrieved_at, doc_hash)
      VALUES ('s1', 'static_module', '${NOW}', 'sha256:0');
    INSERT INTO boundary_epoch (id, name, effective_from)
      VALUES ('delim-2008', 'Delimitation 2008', '2008-02-19');
    INSERT INTO place (id, kind, canonical_name) VALUES ('wb', 'state', 'West Bengal');
    INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
      VALUES (1, 'wb', 'wb', 'state', 'delim-2008', 1, 'West Bengal', 'general');
    INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
      VALUES ('wb-assembly-2026', 'assembly', 'state', 'wb', 'delim-2008', 'WB 2026', 'declared', 'ac', 2026, 1);
    INSERT INTO contest (id, election_id, place_version_id, lifecycle)
      VALUES ('ct1', 'wb-assembly-2026', 1, 'declared');
    INSERT INTO person (id, canonical_name, created_at) VALUES ('p1', 'Alice', '${NOW}');
    INSERT INTO candidacy (id, contest_id, person_id, status)
      VALUES ('cd1', 'ct1', 'p1', 'elected');
  `);
}

test("migrate creates every ring-1/2/3 table and records what it applied", () => {
  const db = migrated();
  const names = new Set(
    all<{ name: string }>(db, "SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => r.name),
  );
  for (const t of EXPECTED_TABLES) assert.ok(names.has(t), `missing table: ${t}`);
  assert.equal(names.size, EXPECTED_TABLES.length, `unexpected tables: ${[...names]}`);

  // node:sqlite hands back null-prototype rows; spread them so deepEqual compares values only.
  assert.deepEqual(
    all<object>(db, "SELECT * FROM schema_migration ORDER BY filename").map((r) => ({ ...r })),
    MIGRATIONS.map((filename) => ({ filename, applied_at: NOW })),
    "applied_at must be the injected clock, not Date.now()",
  );
});

test("migrate is idempotent — a second run applies nothing", () => {
  const db = open(":memory:");
  assert.equal(migrate(db, NOW).length, MIGRATIONS.length);
  assert.deepEqual(migrate(db, "2027-01-01T00:00:00.000Z"), []);
  assert.equal(
    get<{ n: number }>(db, "SELECT count(*) AS n FROM schema_migration")?.n,
    MIGRATIONS.length,
  );
});

test("foreign keys are enforced, not decorative", () => {
  const db = migrated();
  seed(db);
  assert.throws(
    () => db.exec("INSERT INTO candidacy (id, contest_id, person_id, status) VALUES ('x', 'nope', 'p1', 'filed')"),
    /FOREIGN KEY constraint failed/,
  );
});

test("P2: a fact row without a source is rejected by the schema", () => {
  const db = migrated();
  seed(db);
  assert.throws(
    () => db.exec("INSERT INTO result (contest_id, candidacy_id, votes, ingested_at) VALUES ('ct1','cd1',1,'2026')"),
    /NOT NULL constraint failed: result.source_id/,
  );
  db.exec(
    `INSERT INTO result (contest_id, candidacy_id, votes, source_id, ingested_at)
     VALUES ('ct1', 'cd1', 101, 's1', '${NOW}')`,
  );
  assert.equal(get<{ n: number }>(db, "SELECT count(*) AS n FROM result")?.n, 1);
});

test("P2: a citation without a source is rejected by the schema", () => {
  const db = migrated();
  seed(db);
  db.exec("INSERT INTO claim (id, subject_ref, predicate, object_value) VALUES (1,'person:p1','age','42')");
  assert.throws(
    () => db.exec("INSERT INTO citation (claim_id, parser_version, extracted_at) VALUES (1,'v1','2026')"),
    /NOT NULL constraint failed: citation.source_id/,
  );
});

test("ER hard negative: one person cannot hold two candidacies in one contest", () => {
  const db = migrated();
  seed(db);
  assert.throws(
    () => db.exec("INSERT INTO candidacy (id, contest_id, person_id, status) VALUES ('cd2','ct1','p1','filed')"),
    /UNIQUE constraint failed: candidacy.contest_id, candidacy.person_id/,
  );
});

// The EXCLUDE USING gist constraint §19 puts on party_version has no portable equivalent. It is
// replaced by the party_version_overlap view; this is the test that keeps the invariant real.
test("party_version_overlap detects what the dropped EXCLUDE constraint would have blocked", () => {
  const db = migrated();
  db.exec(`
    INSERT INTO party (id, name, short_name) VALUES ('AITC', 'All India Trinamool Congress', 'AITC');
    INSERT INTO party_version (id, party_id, valid_from, valid_to, name)
      VALUES (1, 'AITC', '1998-01-01', '2011-01-01', 'AITC');
    INSERT INTO party_version (id, party_id, valid_from, valid_to, name)
      VALUES (2, 'AITC', '2011-01-01', NULL, 'AITC');
  `);
  assert.deepEqual(overlaps(db), [], "abutting ranges must not overlap");

  db.exec("INSERT INTO party_version (id, party_id, valid_from, valid_to, name) VALUES (3,'AITC','2015-01-01',NULL,'AITC')");
  assert.deepEqual(overlaps(db), [{ party_id: "AITC", a_id: 2, b_id: 3 }]);
});

function overlaps(db: DatabaseSync): object[] {
  return all<object>(db, "SELECT * FROM party_version_overlap").map((r) => ({ ...r }));
}

test("insertMany writes in one transaction and rolls the whole batch back on failure", () => {
  const db = migrated();
  seed(db);
  const sql = "INSERT INTO person (id, canonical_name, created_at) VALUES (?, ?, ?)";
  assert.equal(insertMany(db, sql, [["p2", "B", NOW], ["p3", "C", NOW]]), 2);
  assert.throws(() => insertMany(db, sql, [["p4", "D", NOW], ["p2", "dupe", NOW]]), /UNIQUE/);
  assert.equal(get<{ n: number }>(db, "SELECT count(*) AS n FROM person")?.n, 3, "p4 must not survive");
});

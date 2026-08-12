import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../../db/migrate.ts";
import { PROJECTION, project, simplifyRing } from "./project.ts";
import { candidatesOf, importGeometry, inspectGeometry, manifest, readDataset, seatKey, sharedViewBox } from "./geometry.ts";
import type { Dataset } from "./geometry.ts";

/**
 * The geometry pipeline.
 *
 * These are about REFUSAL, because that is the property the phase turns on. Anyone can attach a polygon to
 * a row; the tests worth having are the ones that fail if the pipeline ever attaches the wrong one, and the
 * hardest of those is the case where a number agrees and the constituency is a different constituency.
 */

const AC: Dataset = {
  id: "test-ac",
  house: "ac",
  form: "DIRECT_VECTOR",
  publisher: "A Publisher",
  title: "Test constituencies",
  url: "https://example.invalid/ac.geojson",
  file: "/dev/null",
  sha256: "0".repeat(64),
  bytes: 0,
  licence: "CC BY 4.0",
  publishedOn: null,
  fields: { state: "ST_NAME", number: "AC_NO", name: "AC_NAME", district: "DIST_NAME" },
  epochField: "STATUS",
  epochWhen: { "Pre delimitation": "before-dpaco-2008", "": "after-dpaco-2008" },
  jurisdictions: {},
  caveats: [],
};

/** A square of `size` degrees with its bottom-left corner at (lon, lat). */
const square = (lon: number, lat: number, size = 0.4): [number, number][] => [
  [lon, lat],
  [lon + size, lat],
  [lon + size, lat + size],
  [lon, lat + size],
  [lon, lat],
];

const feature = (props: Record<string, unknown>, rings: [number, number][][]) => ({
  properties: props,
  geometry: rings.length === 1 ? { type: "Polygon", coordinates: rings } : { type: "MultiPolygon", coordinates: rings.map((r) => [r]) },
});

/**
 * Two jurisdictions with real registry names so the basemap containment check has a box to use, an epoch on
 * each side of DPACO 2008, and — for Karnataka — a `derived_from` link of the shape Phase 1.5 wrote.
 */
function fixture(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db, "2026-08-12T00:00:00.000Z");
  db.exec(`
    INSERT INTO source (id, kind, title, url, retrieved_at, doc_hash) VALUES
      ('s-name', 'static_module', 'names', 'repo:x', '2026-01-01T00:00:00Z', 'h'),
      ('s-order', 'gazette', 'DPACO 2008', 'https://x', '2026-01-01T00:00:00Z', 'h2');
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES
      ('delim-1976', 'Old order', '1976-01-01'), ('delim-2008', 'DPACO 2008', '2008-02-19');
    INSERT INTO place (id, kind, canonical_name) VALUES ('ka', 'state', 'Karnataka'), ('kl', 'state', 'Kerala');
    INSERT INTO place (id, kind, parent_id, canonical_name) VALUES
      ('ka.ac.001', 'ac', 'ka', 'Alpha'), ('ka.ac.002', 'ac', 'ka', 'Beta'), ('ka.ac.003', 'ac', 'ka', 'Gamma'),
      ('ka.ac.004', 'ac', 'ka', 'Chikkaballapura'), ('ka.old.001', 'ac', 'ka', 'Alpha old'),
      ('kl.ac.001', 'ac', 'kl', 'Delta'), ('kl.ac.002', 'ac', 'kl', 'Epsilon');
    INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name) VALUES
      (1, 'ka.ac.001', 'ka', 'ac', 'delim-2008', 1, 'Alpha'),
      (2, 'ka.ac.002', 'ka', 'ac', 'delim-2008', 2, 'Beta'),
      (3, 'ka.ac.003', 'ka', 'ac', 'delim-2008', 3, 'Gamma'),
      (7, 'ka.ac.004', 'ka', 'ac', 'delim-2008', 4, 'Chikkaballapura'),
      (4, 'ka.old.001', 'ka', 'ac', 'delim-1976', 1, 'Alpha'),
      (5, 'kl.ac.001', 'kl', 'ac', 'delim-2008', 1, 'Delta'),
      (6, 'kl.ac.002', 'kl', 'ac', 'delim-2008', 2, 'Epsilon');
    INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year) VALUES
      ('ka-2023', 'assembly', 'state', 'ka', 'delim-2008', 'Karnataka 2023', 'declared', 'ac', 2023),
      ('ka-1978', 'assembly', 'state', 'ka', 'delim-1976', 'Karnataka 1978', 'declared', 'ac', 1978),
      ('kl-2021', 'assembly', 'state', 'kl', 'delim-2008', 'Kerala 2021', 'declared', 'ac', 2021);
    INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES
      ('k1', 'ka-2023', 1, 'declared'), ('k2', 'ka-2023', 2, 'declared'), ('k3', 'ka-2023', 3, 'declared'),
      ('k5', 'ka-2023', 7, 'declared'), ('k4', 'ka-1978', 4, 'declared'),
      ('l1', 'kl-2021', 5, 'declared'), ('l2', 'kl-2021', 6, 'declared');
    -- The shape Phase 1.5 wrote: the 2008 version derives from the 1976 one, with the order as the basis.
    INSERT INTO place_version_link (from_place_version_id, to_place_version_id, kind, basis, source_id)
      VALUES (1, 4, 'derived_from', 'DPACO 2008 Part X restates the 1976 order', 's-order');
  `);
  return db;
}

// ── keys ──────────────────────────────────────────────────────────────────────

test("a seat key drops a reservation tag, balanced or not", () => {
  assert.equal(seatKey("Bishnupur(SC)"), "bishnupur");
  assert.equal(seatKey("BISHNUPUR (SC)"), "bishnupur");
  // The source truncates its own names mid-tag. A paired-bracket regex leaves the "SC" behind and the
  // comparison it should have passed then fails.
  assert.equal(seatKey("Kilvaithinankuppam(SC"), "kilvaithinankuppam");
  assert.equal(seatKey("Sulthanbathery (S"), "sulthanbathery");
  assert.equal(seatKey("Dr.Radhakrishnan Nagar"), "drradhakrishnannagar");
});

// ── projection ────────────────────────────────────────────────────────────────

test("the projection in code and the projection in the manifest are the same numbers", () => {
  // They are declared twice on purpose — once for the code and once for an operator reading the manifest —
  // and a silent divergence would put two coordinate spaces in one column.
  const p = manifest().projection;
  assert.equal(p["lon0"], PROJECTION.lon0);
  assert.equal(p["lat0"], PROJECTION.lat0);
  assert.equal(p["scale"], PROJECTION.scale);
  assert.equal(p["parallel"], PROJECTION.parallel);
});

test("the shared frame is the basemap's, so constituencies and district lines are in one space", () => {
  const [x, y, w, h] = sharedViewBox().split(" ").map(Number) as [number, number, number, number];
  assert.ok(w > 400 && h > 400, `${sharedViewBox()} is not a country-sized frame`);
  // Bengaluru, 77.6E 13.0N, has to land inside the country's own box.
  const [px, py] = project([77.6, 13.0]);
  assert.ok(px > x && px < x + w, `${px} outside ${x}..${x + w}`);
  assert.ok(py > y && py < y + h, `${py} outside ${y}..${y + h}`);
  // y grows downward: further north is a smaller y.
  assert.ok(project([77.6, 28.6])[1] < py);
});

test("simplifying a closed ring keeps it a ring instead of deleting it", () => {
  // The bug this is here for: a ring's first and last point are the same, so the baseline Douglas-Peucker
  // measures against has zero length, every distance is zero, and every polygon in India simplifies away.
  const ring = square(77, 13).map((p) => project(p));
  assert.ok(simplifyRing(ring, 0.03).length >= 3);
  assert.equal(simplifyRing(ring, 0.03).length, 4);
});

// ── candidates ────────────────────────────────────────────────────────────────

test("several features for one seat merge into one multipart polygon, and are not rejected", () => {
  const feats = [
    feature({ ST_NAME: "KARNATAKA", AC_NO: 1, AC_NAME: "Alpha" }, [square(77, 13)]),
    feature({ ST_NAME: "KARNATAKA", AC_NO: 1, AC_NAME: "Alpha" }, [square(78, 14)]),
  ];
  const { candidates } = candidatesOf(AC, feats);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.polygons, 2);
  assert.equal((candidates[0]?.path.match(/M/g) ?? []).length, 2, "two subpaths, one constituency");
});

test("a feature with no number or no name is unusable, dropped and counted", () => {
  const feats = [
    feature({ ST_NAME: "KARNATAKA", AC_NO: 0, AC_NAME: null }, [square(77, 13)]),
    feature({ ST_NAME: "KARNATAKA", AC_NO: 5, AC_NAME: "" }, [square(77, 13)]),
    feature({ ST_NAME: "KARNATAKA", AC_NO: 1, AC_NAME: "Alpha" }, [square(77, 13)]),
  ];
  const { candidates, unusable } = candidatesOf(AC, feats);
  assert.equal(unusable, 2);
  assert.equal(candidates.length, 1);
});

// ── epoch ─────────────────────────────────────────────────────────────────────

test("the source's own declaration decides the side of DPACO 2008", () => {
  const db = fixture();
  const after = inspectGeometry(db, AC, [feature({ ST_NAME: "KARNATAKA", AC_NO: 1, AC_NAME: "Alpha" }, [square(77, 13)])]);
  assert.equal(after.jurisdictions[0]?.epochId, "delim-2008");
  const before = inspectGeometry(db, AC, [
    feature({ ST_NAME: "KARNATAKA", AC_NO: 1, AC_NAME: "Alpha", STATUS: "Pre delimitation" }, [square(77, 13)]),
  ]);
  assert.equal(before.jurisdictions[0]?.epochId, "delim-1976");
  db.close();
});

test("a polygon serves a second epoch only where the registry's own links say the order restated it", () => {
  const db = fixture();
  const r = inspectGeometry(db, AC, [
    feature({ ST_NAME: "KARNATAKA", AC_NO: 1, AC_NAME: "Alpha" }, [square(77, 13)]),
    feature({ ST_NAME: "KARNATAKA", AC_NO: 2, AC_NAME: "Beta" }, [square(77.5, 13)]),
  ]);
  const alpha = r.links.find((l) => l.candidate.number === 1);
  const beta = r.links.find((l) => l.candidate.number === 2);
  assert.deepEqual(
    alpha?.restated.map((x) => [x.versionId, x.epochId]),
    [[4, "delim-1976"]],
  );
  assert.match(alpha?.restated[0]?.basis ?? "", /DPACO 2008 Part X/);
  assert.deepEqual(beta?.restated, [], "no link, no second epoch");
  db.close();
});

// ── the five tiers, and the refusals ──────────────────────────────────────────

test("each tier is reached by the case it exists for", () => {
  const db = fixture();
  const r = inspectGeometry(db, AC, [
    feature({ ST_NAME: "KARNATAKA", AC_NO: 1, AC_NAME: "Alpha" }, [square(77, 13)]),
    // The registry says "Chikkaballapura" and the source's own field truncated it.
    feature({ ST_NAME: "KARNATAKA", AC_NO: 4, AC_NAME: "Chikkaballapu" }, [square(77.5, 13.5)]),
    // Same seat, spelled differently — and the number already agreed.
    feature({ ST_NAME: "KARNATAKA", AC_NO: 3, AC_NAME: "Gammaa" }, [square(78, 13)]),
  ]);
  assert.deepEqual(
    r.links.map((l) => l.tier),
    ["number+name", "number+truncated", "number+phonetic"],
  );
  db.close();
});

test("a name unique in the epoch links even when the numbering disagrees, and says which tier it was", () => {
  // West Bengal in one line: the source and the registry number the same epoch differently, so for some
  // seats the NAME is the only true key. The tier is recorded so the disagreement stays visible.
  const db = fixture();
  const r = inspectGeometry(db, AC, [feature({ ST_NAME: "KARNATAKA", AC_NO: 99, AC_NAME: "Gamma" }, [square(78, 13)])]);
  assert.equal(r.links[0]?.versionId, 3);
  assert.equal(r.links[0]?.tier, "name-unique");
  db.close();
});

test("a number that agrees while the constituency differs is REFUSED, not attached", () => {
  // The defect this pipeline exists to prevent. The source's seat 2 is a different place from the
  // registry's seat 2, and no other key agrees, so nothing may be written.
  const db = fixture();
  const r = inspectGeometry(db, AC, [feature({ ST_NAME: "KARNATAKA", AC_NO: 2, AC_NAME: "Zeta" }, [square(77.5, 13)])]);
  assert.equal(r.links.length, 0);
  assert.equal(r.staged.length, 1);
  assert.equal(r.staged[0]?.reason, "no-version");
  db.close();
});

test("two polygons cannot claim one place_version", () => {
  const db = fixture();
  const r = inspectGeometry(db, AC, [
    feature({ ST_NAME: "KARNATAKA", AC_NO: 1, AC_NAME: "Alpha" }, [square(77, 13)]),
    feature({ ST_NAME: "KARNATAKA", AC_NO: 77, AC_NAME: "Alpha" }, [square(77.9, 13.9)]),
  ]);
  assert.equal(r.links.length, 1);
  assert.equal(r.staged[0]?.reason, "duplicate-path");
  db.close();
});

test("identical geometry twice in one epoch is refused", () => {
  const db = fixture();
  const r = inspectGeometry(db, AC, [
    feature({ ST_NAME: "KARNATAKA", AC_NO: 1, AC_NAME: "Alpha" }, [square(77, 13)]),
    feature({ ST_NAME: "KARNATAKA", AC_NO: 2, AC_NAME: "Beta" }, [square(77, 13)]),
  ]);
  assert.equal(r.links.length, 1);
  assert.equal(r.staged[0]?.reason, "duplicate-path");
  db.close();
});

test("a polygon outside its jurisdiction is refused, checked against an independent basemap", () => {
  // The source's publisher declares "there is some shift in the data", so the extent is checked against a
  // different publisher's administrative geometry rather than trusted.
  const db = fixture();
  const r = inspectGeometry(db, AC, [feature({ ST_NAME: "KARNATAKA", AC_NO: 1, AC_NAME: "Alpha" }, [square(88, 26)])]);
  assert.equal(r.links.length, 0);
  assert.equal(r.staged[0]?.reason, "outside-jurisdiction");
  assert.match(r.staged[0]?.detail ?? "", /falls outside Karnataka/);
  db.close();
});

test("a source state with no jurisdiction is staged, never guessed at", () => {
  const db = fixture();
  const r = inspectGeometry(db, AC, [feature({ ST_NAME: "ATLANTIS", AC_NO: 1, AC_NAME: "Alpha" }, [square(77, 13)])]);
  assert.equal(r.staged[0]?.reason, "no-jurisdiction");
  db.close();
});

test("one source key covering two jurisdictions splits by which registry holds the seat", () => {
  const db = fixture();
  const r = inspectGeometry(db, { ...AC, jurisdictions: { COMBINED: ["ka", "kl"] } }, [
    feature({ ST_NAME: "COMBINED", AC_NO: 1, AC_NAME: "Alpha" }, [square(77, 13)]),
    feature({ ST_NAME: "COMBINED", AC_NO: 2, AC_NAME: "Epsilon" }, [square(76.5, 10)]),
  ]);
  assert.deepEqual(
    r.links.map((l) => [l.jurisdictionId, l.versionId]),
    [
      ["ka", 1],
      ["kl", 6],
    ],
  );
  db.close();
});

// ── writing ───────────────────────────────────────────────────────────────────

const feats = () => [
  feature({ ST_NAME: "KARNATAKA", AC_NO: 1, AC_NAME: "Alpha" }, [square(77, 13)]),
  feature({ ST_NAME: "KARNATAKA", AC_NO: 2, AC_NAME: "Beta" }, [square(77.5, 13)]),
];

test("a dry run writes nothing and reports the same counts a real run would", () => {
  const db = fixture();
  const dry = importGeometry(db, AC, feats(), { apply: false, nowIso: "2026-08-12T00:00:00.000Z" });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM place_geometry").get()?.["n"], 0);
  const wet = importGeometry(db, AC, feats(), { apply: true, nowIso: "2026-08-12T00:00:00.000Z" });
  assert.equal(wet.written, dry.written);
  // Two seats, plus the one version DPACO 2008 restated.
  assert.equal(wet.written, 3);
  assert.equal(wet.restatedWritten, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM place_geometry").get()?.["n"], 3);
  db.close();
});

test("the written source row carries the publisher, the hash, the licence and the caveats", () => {
  const db = fixture();
  importGeometry(db, { ...AC, caveats: ["the publisher says the data is shifted"] }, feats(), {
    apply: true,
    nowIso: "2026-08-12T00:00:00.000Z",
  });
  const row = db
    .prepare(
      `SELECT s.kind, s.publisher, s.doc_hash, s.hash_kind, s.retrieval_kind, s.licence, s.publisher_note, s.url
         FROM place_geometry g JOIN source s ON s.id = g.source_id LIMIT 1`,
    )
    .get() as Record<string, unknown>;
  assert.equal(row["kind"], "boundary_geometry");
  assert.equal(row["publisher"], "A Publisher");
  assert.equal(row["doc_hash"], "0".repeat(64));
  assert.equal(row["hash_kind"], "document_bytes");
  assert.equal(row["retrieval_kind"], "fetched");
  assert.equal(row["licence"], "CC BY 4.0");
  assert.match(String(row["publisher_note"]), /shifted/);
  db.close();
});

test("an already-drawn version is skipped, and only --replace overwrites it", () => {
  const db = fixture();
  importGeometry(db, AC, feats(), { apply: true, nowIso: "2026-08-12T00:00:00.000Z" });
  const again = importGeometry(db, AC, feats(), { apply: true, nowIso: "2026-08-12T00:00:00.000Z" });
  assert.equal(again.written, 0);
  assert.equal(again.skipped, 3);
  const replaced = importGeometry(db, AC, feats(), { apply: true, nowIso: "2026-08-12T00:00:00.000Z", replace: true });
  assert.equal(replaced.replaced, 3);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM place_geometry").get()?.["n"], 3);
  db.close();
});

test("every row lands in one coordinate space, declared per row", () => {
  const db = fixture();
  importGeometry(db, AC, feats(), { apply: true, nowIso: "2026-08-12T00:00:00.000Z" });
  const boxes = db.prepare("SELECT DISTINCT view_box AS v FROM place_geometry").all();
  assert.equal(boxes.length, 1);
  assert.equal(boxes[0]?.["v"], sharedViewBox());
  db.close();
});

test("a file whose bytes do not match the manifest is refused before anything reads it", () => {
  assert.throws(
    () => readDataset({ ...AC, file: "package.json", sha256: "1".repeat(64) }),
    /hashes to .* and data\/geo\/sources\.json declares/,
  );
});

test("the declared datasets exist, are hashed, and their bytes are on disk unaltered", () => {
  // The manifest is the acquisition record. If it drifts from the files, everything downstream is a claim
  // about bytes nobody has.
  for (const d of manifest().datasets) {
    assert.match(d.sha256, /^[0-9a-f]{64}$/, `${d.id} has no sha256`);
    assert.ok(d.licence.length > 0, `${d.id} has no licence`);
    assert.ok(d.url.startsWith("https://"), `${d.id} has no https url`);
    const held = readDataset(d);
    assert.equal(held.bytes, d.bytes, `${d.id} byte count`);
    assert.ok(held.features.length > 0, `${d.id} has no features`);
  }
});

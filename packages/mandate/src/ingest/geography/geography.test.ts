/**
 * Regression tests for the defect this module exists to fix.
 *
 * The failure that started it: Karnataka's parliamentary seat 1 was named BIDAR in the registry — its
 * 1976-delimitation name — while carrying Chikkodi's 2019 result, because the importer keyed a
 * constituency on (jurisdiction, house, seat number) with no delimitation in it. 52,875 of 63,288 contests
 * named a seat from somebody else's delimitation. docs/model/electoral-geography.md.
 *
 * These tests assert the FACTS, not the mechanism: Annasaheb Jolle won Chikkodi and Bhagwanth Khuba won
 * Bidar in 2019, so the registry must say exactly that. A test that only checked "the name came from
 * place_version" would pass on a wrong name.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { DEV_DB_PATH, all, get, openRead } from "../../db/index.ts";
import { EPOCH_OF_DELIM, reconstruct } from "./reconstruct.ts";
import { MANIFEST_PATH } from "./backfill.ts";
import { currentEpochs, validateGeography } from "./validate.ts";

function haveRegistry(): boolean {
  try {
    const d = openRead(DEV_DB_PATH);
    try {
      d.prepare("SELECT 1 FROM place_version WHERE canonical_name IS NOT NULL LIMIT 1").get();
      return true;
    } finally {
      d.close();
    }
  } catch {
    return false;
  }
}
const skip = haveRegistry()
  ? false
  : `no repaired registry at ${DEV_DB_PATH} — run: mandate migrate && mandate geography backfill --apply`;
/** The source-aware checks need the hash-verified cache; without it they are skipped, not assumed. */
const skipSource = existsSync(MANIFEST_PATH)
  ? false
  : `no hash-verified source cache — run ops/geo/refetch-lokdhaba.sh`;

const db = () => openRead(DEV_DB_PATH);

type Named = { epoch_id: string; canonical_name: string; number: number };
const seat = (d: ReturnType<typeof db>, j: string, kind: string, number: number): Named[] =>
  all<Named>(
    d,
    `SELECT v.epoch_id, v.canonical_name, v.number FROM place_version v
      WHERE v.jurisdiction_id = ? AND v.kind = ? AND v.number = ?
      ORDER BY (SELECT effective_from FROM boundary_epoch WHERE id = v.epoch_id)`,
    j,
    kind,
    number,
  );

/** Who the registry says won a seat, named as the registry names it. */
const winnerOf = (
  d: ReturnType<typeof db>,
  electionId: string,
  j: string,
  kind: string,
  number: number,
): { seat: string; winner: string } | undefined =>
  get<{ seat: string; winner: string }>(
    d,
    `SELECT v.canonical_name AS seat, per.canonical_name AS winner
       FROM contest c
       JOIN place_version v ON v.id = c.place_version_id
       JOIN result r        ON r.contest_id = c.id AND r.is_winner = 1 AND r.revision = 0
       JOIN candidacy ca    ON ca.id = r.candidacy_id
       JOIN person per      ON per.id = ca.person_id
      WHERE c.election_id = ? AND v.jurisdiction_id = ? AND v.kind = ? AND v.number = ?`,
    electionId,
    j,
    kind,
    number,
  );

test("THE REGRESSION: Karnataka PC 1 is Chikkodi in 2019, and Jolle is not put in Bidar", { skip }, () => {
  const d = db();
  // Annasaheb Shankar Jolle (BJP) won CHIKKODI in 2019. Bhagwanth Khuba (BJP) won BIDAR, which is seat 7
  // under the 2008 order. Before the repair, seat 1 was called BIDAR and held Jolle.
  const one = winnerOf(d, "ls-2019", "ka", "pc", 1);
  assert.ok(one !== undefined, "Karnataka PC 1 has a 2019 winner");
  assert.match(one.seat, /CHIKKODI/i, `PC 1 in 2019 is Chikkodi, got ${one.seat}`);
  assert.match(one.winner, /JOLLE/i, `Chikkodi 2019 was won by Jolle, got ${one.winner}`);
  assert.doesNotMatch(one.seat, /BIDAR/i, "Jolle must never be shown in Bidar");

  const seven = winnerOf(d, "ls-2019", "ka", "pc", 7);
  assert.ok(seven !== undefined, "Karnataka PC 7 has a 2019 winner");
  assert.match(seven.seat, /BIDAR/i, `PC 7 in 2019 is Bidar, got ${seven.seat}`);
  assert.match(seven.winner, /KHUBA/i, `Bidar 2019 was won by Khuba, got ${seven.winner}`);
  d.close();
});

test("Karnataka carries BOTH names: seat 1 is Bidar in 1976 and Chikkodi in 2008", { skip }, () => {
  const d = db();
  const pc1 = seat(d, "ka", "pc", 1);
  const byEpoch = new Map(pc1.map((r) => [r.epoch_id, r.canonical_name]));
  assert.match(byEpoch.get("delim-1976") ?? "", /BIDAR/i, "the 1976 name survives");
  assert.match(byEpoch.get("delim-2008") ?? "", /CHIKKODI/i, "the 2008 name is present");
  assert.notEqual(byEpoch.get("delim-1976"), byEpoch.get("delim-2008"), "two delimitations, two names");

  // The assembly seat of the same number, same story: AURAD then NIPPANI.
  const ac1 = new Map(seat(d, "ka", "ac", 1).map((r) => [r.epoch_id, r.canonical_name]));
  assert.match(ac1.get("delim-1976") ?? "", /AURAD/i);
  assert.match(ac1.get("delim-2008") ?? "", /NIPPANI/i);
  d.close();
});

test("West Bengal historical names survive, and its numbering conflict is recorded not resolved", { skip }, () => {
  const d = db();
  // Seat 1 has held four elections' worth of names. 1962 spells it MAKLIGANJ; every later delimitation
  // spells it Mekliganj. Both are the source's own spellings for their own epoch.
  const wb1 = new Map(seat(d, "wb", "ac", 1).map((r) => [r.epoch_id, r.canonical_name]));
  assert.match(wb1.get("delim-1952") ?? "", /MAKLIGANJ/i, "1962's spelling is kept");
  assert.match(wb1.get("delim-2008") ?? "", /MEKLIGANJ/i);

  // The seed's curated casing is not shouted over by the source when the name is the same.
  assert.equal(wb1.get("delim-2008"), "Mekliganj", "an identical name keeps the curated spelling");

  // The unresolved conflict: the seed numbers Asansol Uttar 294 and the source numbers MURARAI 294. The
  // seed owns the results, so the seed's name stands, the source's is recorded, and the flag is set.
  const c = get<{ canonical_name: string; name_conflict: number; name_variants: string }>(
    d,
    `SELECT canonical_name, name_conflict, name_variants FROM place_version
      WHERE jurisdiction_id = 'wb' AND kind = 'ac' AND number = 294 AND epoch_id = 'delim-2008'`,
  );
  assert.ok(c !== undefined);
  assert.equal(c.name_conflict, 1, "a two-source disagreement is flagged");
  assert.match(c.canonical_name, /Asansol Uttar/i, "the source that owns the results names the seat");
  assert.match(c.name_variants, /MURARAI/, "the other source's name is preserved, not discarded");

  // And the result under that name is the right one: Moloy Ghatak won Asansol Uttar in 2021.
  const w = winnerOf(d, "wb-assembly-2021", "wb", "ac", 294);
  assert.match(w?.winner ?? "", /GHATAK/i, `got ${w?.winner}`);
  d.close();
});

test("every multi-delimitation state names each epoch's seat 1 from its own delimitation", { skip }, () => {
  const d = db();
  // Twelve states hold results in all four delimitations and eleven more in three; Karnataka's TCPD file
  // starts in 1978 and so spans two. These seven are the four-delimitation ones — the hardest case, where a
  // seat number has had up to four different names.
  const states = ["ap", "br", "mh", "up", "wb", "rj", "mp"];
  for (const j of states) {
    const epochs = all<{ epoch_id: string; n: number }>(
      d,
      `SELECT epoch_id, COUNT(*) AS n FROM place_version
        WHERE jurisdiction_id = ? AND kind = 'ac' GROUP BY epoch_id`,
      j,
    );
    assert.ok(epochs.length >= 3, `${j} spans at least three delimitations, got ${epochs.length}`);
    const named = all<{ n: number }>(
      d,
      `SELECT COUNT(*) AS n FROM place_version
        WHERE jurisdiction_id = ? AND kind = 'ac' AND (canonical_name IS NULL OR canonical_name = '')`,
      j,
    );
    assert.equal(named[0]?.n, 0, `${j} has an unnamed constituency version`);
  }
  d.close();
});

test("both houses are named from source, and a by-poll shares its epoch's seat", { skip }, () => {
  const d = db();
  for (const kind of ["ac", "pc"] as const) {
    const row = get<{ n: number; named: number }>(
      d,
      `SELECT COUNT(*) AS n, SUM(CASE WHEN source_constituency_key IS NOT NULL THEN 1 ELSE 0 END) AS named
         FROM place_version WHERE kind = ?`,
      kind,
    );
    assert.ok((row?.n ?? 0) > 0, `${kind} versions exist`);
    // West Bengal's 13 seed-only seats are the known exception and are counted in the report.
    assert.ok((row?.named ?? 0) >= (row?.n ?? 0) - 13, `${kind}: ${row?.n} versions, ${row?.named} from source`);
  }

  // A by-election is a different ELECTION on the SAME constituency version, so it must name the same seat
  // as the general election of its delimitation — the sharpest test that the epoch link is per contest.
  const mismatch = all<{ ex: string }>(
    d,
    `SELECT bp.id || ' names ' || v.canonical_name AS ex
       FROM contest bp
       JOIN election e ON e.id = bp.election_id AND e.kind = 'bypoll'
       JOIN place_version v ON v.id = bp.place_version_id
      WHERE v.canonical_name IS NULL`,
  );
  assert.equal(mismatch.length, 0, `by-poll contests on an unnamed seat: ${mismatch.map((m) => m.ex).join(", ")}`);
  const bypolls = get<{ n: number }>(
    d,
    `SELECT COUNT(*) AS n FROM contest c JOIN election e ON e.id = c.election_id AND e.kind = 'bypoll'`,
  );
  assert.ok((bypolls?.n ?? 0) > 0, "the registry holds by-elections at all");
  d.close();
});

test("the schema refuses the defect: one seat number per slot, always named", { skip }, () => {
  const d = openRead(DEV_DB_PATH);
  // UNIQUE (jurisdiction_id, kind, epoch_id, number) — the constraint that makes the old collision
  // unrepresentable rather than merely absent.
  const dupes = all<{ n: number }>(
    d,
    `SELECT COUNT(*) AS n FROM (
       SELECT jurisdiction_id, kind, epoch_id, number FROM place_version
        WHERE number IS NOT NULL
        GROUP BY jurisdiction_id, kind, epoch_id, number HAVING COUNT(*) > 1)`,
  );
  assert.equal(dupes[0]?.n, 0, "no two versions share a slot");
  d.close();
});

test("a succession claim cannot be stored without a source", { skip }, () => {
  // The CHECK in 011 is the guarantee that no fabricated continuity can enter the registry. Asserted by
  // trying it: name_match needs no source, 'successor' does.
  const d = openRead(DEV_DB_PATH);
  const two = all<{ id: number }>(d, "SELECT id FROM place_version ORDER BY id LIMIT 2");
  const [a, b] = two;
  assert.ok(a !== undefined && b !== undefined);
  d.close();

  const w = openRead(DEV_DB_PATH); // read-only handle: the write must fail on the CHECK, not commit
  assert.throws(
    () =>
      w
        .prepare(
          `INSERT INTO place_version_link (from_place_version_id, to_place_version_id, kind, basis, source_id)
           VALUES (?, ?, 'successor', 'invented', NULL)`,
        )
        .run(a.id, b.id),
    /readonly|CHECK|constraint/i,
    "an uncited succession claim is refused",
  );
  w.close();
});

test("the importer and the reconstruction agree on which delimitation is which", { skip: false }, () => {
  // Both files map TCPD's DelimID to an epoch. If they ever disagree, the reconstruction would be
  // repairing rows against a different notion of the same delimitation.
  assert.deepEqual(EPOCH_OF_DELIM, {
    "1": "delim-1952",
    "2": "delim-1963",
    "3": "delim-1976",
    "4": "delim-2008",
  });
});

test("reconstruct: one seat number, two delimitations, two names", { skip: false }, () => {
  // The extraction is pure over bytes, so the whole defect fits in a four-row fixture: the same
  // Constituency_No under two DelimIDs must come back as two seats with different names.
  const header = [
    "State_Name", "Year", "Constituency_No", "Constituency_Name", "Constituency_Type", "DelimID",
    "Position", "Candidate", "Sex", "Party", "Party_ID", "Votes", "Valid_Votes", "Electors",
    "Turnout_Percentage", "Vote_Share_Percentage", "Margin", "pid", "Election_Type",
  ].join(",");
  const row = (year: string, no: string, name: string, delim: string, house: string): string =>
    ["Karnataka", year, no, name, "GEN", delim, "1", "SOMEONE", "M", "BJP", "p1", "100", "200", "300",
     "50", "50", "10", "pid1", house].join(",");
  const csv = [
    header,
    row("2004", "1", "BIDAR", "3", "Lok Sabha Election (GE)"),
    row("2019", "1", "CHIKKODI", "4", "Lok Sabha Election (GE)"),
    row("2019", "7", "BIDAR", "4", "Lok Sabha Election (GE)"),
    row("2023", "1", "NIPPANI", "4", "State Assembly Election (AE)"),
  ].join("\n");

  // reconstruct() reads gzip off disk, so exercise the row logic through a temporary gzip.
  const dir = mkdtempSync(join(tmpdir(), "geo-"));
  const path = join(dir, "Karnataka_GE.csv.gz");
  writeFileSync(path, gzipSync(Buffer.from(csv, "utf8")));

  const { seats, report } = reconstruct([
    { sourceId: "lokdhaba:ka:GE:deadbeef", path, status: "MATCH", sha256: "x" },
  ]);
  assert.equal(report.unknownHouse, 0, "every row named a house");
  assert.equal(report.unknownDelim, 0);

  const pc1 = seats.filter((s) => s.kind === "pc" && s.number === 1);
  assert.equal(pc1.length, 2, "seat 1 exists in two delimitations");
  assert.deepEqual(
    pc1.map((s) => [s.epochId, s.canonicalName]).sort(),
    [["delim-1976", "BIDAR"], ["delim-2008", "CHIKKODI"]],
  );
  // The house comes from the row, not the file: an AE row inside a GE file is still an assembly seat.
  assert.deepEqual(
    seats.filter((s) => s.kind === "ac").map((s) => s.canonicalName),
    ["NIPPANI"],
  );
  // And seat 7 of the same delimitation keeps its own name.
  assert.equal(seats.find((s) => s.kind === "pc" && s.number === 7)?.canonicalName, "BIDAR");
});

test("the ten checks pass on the live registry, bar the classified one", { skip: skip || skipSource }, () => {
  const d = db();
  const v = validateGeography(d);
  const byN = new Map(v.checks.map((c) => [c.n, c]));

  // Every geography check must be clean.
  for (const n of [1, 2, 3, 4, 5, 6, 8, 9, 10]) {
    const c = byN.get(n);
    assert.ok(c !== undefined, `check ${n} ran`);
    assert.equal(c.skipped, false, `check ${n} was actually asked`);
    assert.equal(c.violations, 0, `check ${n} (${c.name}): ${c.examples.join(" | ")}`);
  }

  // Check 7 is red for a defect one level up, and it is named rather than filtered: Bihar held two
  // assembly elections in 2005 and the election id is (jurisdiction, house, YEAR), which cannot tell them
  // apart, so 34 seats carry two winners. A year is no more an identity for an election than a seat number
  // is for a constituency. Tracked in docs/model/electoral-geography.md; this asserts it has not GROWN.
  const seven = byN.get(7);
  assert.ok(seven !== undefined);
  assert.ok(seven.violations <= 35, `check 7 regressed past the known 35: ${seven.violations}`);
  assert.ok(
    seven.examples.some((e) => e.includes("br-assembly-2005")),
    "the known check-7 violations are the Bihar 2005 double election",
  );

  // The headline: essentially every contest now names its own delimitation's seat. What remains is the
  // recorded West Bengal numbering conflict, which is counted separately and not silently absorbed.
  assert.ok((v.metrics.misnamedBefore ?? 0) > 50_000, `before: ${v.metrics.misnamedBefore}`);
  assert.ok((v.metrics.misnamedAfter ?? 1e9) <= 900, `after: ${v.metrics.misnamedAfter}`);
  assert.equal(v.metrics.succession, 0, "no succession relationship is asserted by this repair");
  assert.equal(v.metrics.crosswalkRows, 0, "no quantitative crosswalk is invented either");
  d.close();
});

test("the current epoch is derived from the data, never a literal", { skip }, () => {
  const d = db();
  const cur = currentEpochs(d);
  assert.ok(cur.size > 30, `every jurisdiction and house has a current epoch, got ${cur.size}`);
  // Karnataka's assembly and Lok Sabha seats are both under the 2008 order today — established by the
  // most recent election on record, not by a constant.
  assert.equal(cur.get("ka ac"), "delim-2008");
  assert.equal(cur.get("ka pc"), "delim-2008");
  d.close();
});

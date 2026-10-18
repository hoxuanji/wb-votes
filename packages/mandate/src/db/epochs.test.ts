// `ensureEpochs` and the `voting_epoch` view, on in-memory registries built through the real migrations.
//
// Hand-built, because the live registry cannot show the cases that matter: it holds no assembly whose newest
// row is a by-election in a newer epoch, no election dated by month inside one year, and nothing that would
// catch a tie broken by row order. The 2024 Lok Sabha is the shape that does exist: 524 seats under
// delim-2008, 5 under delim-2022-jk and 14 under delim-2023-as, beside an assembly elected on delim-2008.

import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { EPOCHS, inForce } from "../core/epochs.ts";
import { chronoDesc, fullHouse } from "../core/election-kind.ts";
import { ensureEpochs, votingEpochs } from "./epochs.ts";
import { all, open } from "./index.ts";
import { MIGRATIONS_DIR, migrate } from "./migrate.ts";

const NOW = "2026-08-12T00:00:00.000Z";
const ALL_EPOCHS = EPOCHS.map((e) => e.id);

const STATES = ["as", "jk", "br", "wb"];

/** A migrated registry with the jurisdictions an epoch can name: `boundary_epoch.jurisdiction_id` is a foreign key to `place`. */
function empty(): DatabaseSync {
  const d = open(":memory:");
  migrate(d, NOW);
  d.exec("INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India')");
  for (const j of STATES) d.prepare("INSERT INTO place (id, kind, canonical_name, parent_id) VALUES (?, 'state', ?, 'in')").run(j, j);
  return d;
}

type Seat = { j: string; house: "ac" | "pc"; epoch: string; number: number };
type Elec = { id: string; kind: "assembly" | "general" | "bypoll"; house: "ac" | "pc"; j: string; year: number; month?: number | null; occurrence?: number };

/** A registry of seats and elections: `seats` are places with one version in the epoch named; `contests` pairs an election with seats. */
function build(seats: Seat[], elections: Elec[], contests: [string, Seat][]): DatabaseSync {
  const d = empty();
  ensureEpochs(d, ALL_EPOCHS);
  const places = new Set<string>(["in", ...STATES]);
  const state = (j: string): void => {
    if (places.has(j)) return;
    places.add(j);
    d.prepare("INSERT INTO place (id, kind, canonical_name, parent_id) VALUES (?, 'state', ?, 'in')").run(j, j);
  };
  const versionOf = new Map<string, number>();
  const seat = (s: Seat): number => {
    const key = `${s.j}.${s.house}.${s.epoch}.${s.number}`;
    const known = versionOf.get(key);
    if (known !== undefined) return known;
    state(s.j);
    const placeId = `${s.j}.${s.house}.${String(s.number).padStart(3, "0")}`;
    if (!places.has(placeId)) {
      places.add(placeId);
      d.prepare("INSERT INTO place (id, kind, canonical_name, parent_id) VALUES (?, ?, ?, ?)").run(placeId, s.house, placeId, s.j);
    }
    const id = versionOf.size + 1;
    d.prepare(
      "INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, placeId, s.j, s.house, s.epoch, s.number, `${placeId} ${s.epoch}`);
    versionOf.set(key, id);
    return id;
  };
  for (const s of seats) seat(s);
  for (const e of elections) {
    state(e.j);
    d.prepare(
      `INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, polling_month, occurrence)
       VALUES (?, ?, ?, ?, 'delim-2008', ?, 'declared', ?, ?, ?, ?)`,
    ).run(e.id, e.kind, e.j === "in" ? "union" : "state", e.j, e.id, e.house, e.year, e.month ?? null, e.occurrence ?? 1);
  }
  for (const [election, s] of contests) {
    d.prepare("INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES (?, ?, ?, 'declared')").run(
      `${election}:${seat(s)}`, election, seat(s),
    );
  }
  return d;
}

const seat = (j: string, house: "ac" | "pc", epoch: string, number = 1): Seat => ({ j, house, epoch, number });

// ── ensureEpochs ──────────────────────────────────────────────────────────────────────────────────

test("ensureEpochs registers exactly the epochs asked for, from the table, with nothing the table does not say", () => {
  const d = empty();
  ensureEpochs(d, ["delim-2023-as", "delim-2008", "delim-2008"]);
  const rows = all<Record<string, unknown>>(d, "SELECT * FROM boundary_epoch ORDER BY effective_from");
  assert.deepEqual(
    rows.map((r) => ({ ...r })),
    ["delim-2008", "delim-2023-as"].map((id) => {
      const e = EPOCHS.find((x) => x.id === id)!;
      return {
        id: e.id, name: e.name, effective_from: e.effectiveFrom,
        // Never written: an epoch ends where its successor begins, per jurisdiction. And the document that
        // cites an order is registered only after its bytes are hashed, so no foreign key points at one yet.
        effective_to: null, source_id: null,
        jurisdiction_id: e.jurisdictionId, order_date: e.orderDate, order_reference: e.orderReference,
        effective_date_basis: e.effectiveDateBasis,
      };
    }),
  );
  d.close();
});

test("ensureEpochs is idempotent, and leaves a row someone else has completed alone", () => {
  const d = empty();
  ensureEpochs(d, ALL_EPOCHS);
  d.exec(`INSERT INTO source (id, kind, retrieved_at, doc_hash) VALUES ('s', 'static_module', '${NOW}', 'h')`);
  d.exec("UPDATE boundary_epoch SET source_id = 's', name = 'curated' WHERE id = 'delim-2008'");
  const before = all<Record<string, unknown>>(d, "SELECT * FROM boundary_epoch ORDER BY id").map((r) => ({ ...r }));
  assert.equal(before.length, EPOCHS.length);
  ensureEpochs(d, ALL_EPOCHS);
  assert.deepEqual(all<Record<string, unknown>>(d, "SELECT * FROM boundary_epoch ORDER BY id").map((r) => ({ ...r })), before);
  d.close();
});

test("ensureEpochs refuses an epoch the table does not hold, before writing any", () => {
  const d = empty();
  assert.throws(() => ensureEpochs(d, ["delim-2008", "delim-2099"]), /no epoch 'delim-2099'/);
  assert.equal(all(d, "SELECT 1 FROM boundary_epoch").length, 0, "the valid id ahead of it was not written either");
  d.close();
});

// ── votingEpochs ──────────────────────────────────────────────────────────────────────────────────

test("a house votes under the epoch of its newest election, which is not the epoch in force", () => {
  // Assam, Jammu & Kashmir and Bihar, as the registry holds them. The 2024 Lok Sabha sat on the new orders;
  // Assam's assembly (2021) has not been elected on its 2023 order yet, and Bihar has no newer order at all.
  const d = build(
    [
      seat("as", "pc", "delim-2008"), seat("as", "pc", "delim-2023-as"),
      seat("jk", "pc", "delim-2008"), seat("jk", "pc", "delim-2022-jk"),
      seat("br", "pc", "delim-2008"),
      seat("as", "ac", "delim-2008"), seat("br", "ac", "delim-2008"),
    ],
    [
      { id: "ls-2019", kind: "general", house: "pc", j: "in", year: 2019, month: 4 },
      { id: "ls-2024", kind: "general", house: "pc", j: "in", year: 2024, month: 4 },
      { id: "as-assembly-2021", kind: "assembly", house: "ac", j: "as", year: 2021, month: 3 },
      { id: "br-assembly-2020", kind: "assembly", house: "ac", j: "br", year: 2020, month: 10 },
    ],
    [
      ["ls-2019", seat("as", "pc", "delim-2008")], ["ls-2019", seat("jk", "pc", "delim-2008")], ["ls-2019", seat("br", "pc", "delim-2008")],
      ["ls-2024", seat("as", "pc", "delim-2023-as")], ["ls-2024", seat("jk", "pc", "delim-2022-jk")], ["ls-2024", seat("br", "pc", "delim-2008")],
      ["as-assembly-2021", seat("as", "ac", "delim-2008")], ["br-assembly-2020", seat("br", "ac", "delim-2008")],
    ],
  );
  assert.deepEqual([...votingEpochs(d)].sort(), [
    ["as ac", "delim-2008"],
    ["as pc", "delim-2023-as"],
    ["br ac", "delim-2008"],
    ["br pc", "delim-2008"],
    ["jk pc", "delim-2022-jk"],
  ]);
  // The other question has a different answer for Assam's assembly: the law has moved and the voters have not.
  assert.equal(inForce("as", "2024-06-04").id, "delim-2023-as");
  assert.notEqual(votingEpochs(d).get("as ac"), inForce("as", "2024-06-04").id);
  d.close();
});

test("a by-election never names the epoch a house votes under", () => {
  // Assam's newest assembly row is a by-election on a seat of its 2023 order. It fills one vacant seat of a
  // house elected on DPACO 2008, and cannot introduce a delimitation.
  const d = build(
    [seat("as", "ac", "delim-2008"), seat("as", "ac", "delim-2023-as", 2), seat("jk", "ac", "delim-2008")],
    [
      { id: "as-assembly-2021", kind: "assembly", house: "ac", j: "as", year: 2021 },
      { id: "as-bypoll-ae-2024", kind: "bypoll", house: "ac", j: "as", year: 2024 },
      { id: "jk-bypoll-ae-2022", kind: "bypoll", house: "ac", j: "jk", year: 2022 },
    ],
    [
      ["as-assembly-2021", seat("as", "ac", "delim-2008")],
      ["as-bypoll-ae-2024", seat("as", "ac", "delim-2023-as", 2)],
      ["jk-bypoll-ae-2022", seat("jk", "ac", "delim-2008")],
    ],
  );
  assert.equal(votingEpochs(d).get("as ac"), "delim-2008");
  assert.equal(votingEpochs(d).has("jk ac"), false, "a house with nothing but by-elections votes under no epoch yet");
  d.close();
});

test("chronology decides, to the month and then the occurrence; the id and the epoch's name decide nothing", () => {
  const d = build(
    [
      seat("as", "ac", "delim-1976"), seat("as", "ac", "delim-2008"),
      seat("jk", "ac", "delim-1976"), seat("jk", "ac", "delim-2008"),
      seat("br", "ac", "delim-1976"), seat("br", "ac", "delim-2008"),
    ],
    [
      // Assam: the month comes before the occurrence and the id, so October is newer than February.
      { id: "as-a-oct", kind: "assembly", house: "ac", j: "as", year: 2005, month: 10, occurrence: 1 },
      { id: "as-z-feb", kind: "assembly", house: "ac", j: "as", year: 2005, month: 2, occurrence: 2 },
      // J&K: an unsourced month sorts as 0, so a sourced one in the same year is newer.
      { id: "jk-z-none", kind: "assembly", house: "ac", j: "jk", year: 2005, month: null, occurrence: 1 },
      { id: "jk-a-may", kind: "assembly", house: "ac", j: "jk", year: 2005, month: 5, occurrence: 2 },
      // Bihar: the same month twice, so the occurrence is what separates them.
      { id: "br-a-second", kind: "assembly", house: "ac", j: "br", year: 2005, month: 2, occurrence: 2 },
      { id: "br-z-first", kind: "assembly", house: "ac", j: "br", year: 2005, month: 2, occurrence: 1 },
    ],
    [
      ["as-a-oct", seat("as", "ac", "delim-2008")], ["as-z-feb", seat("as", "ac", "delim-1976")],
      ["jk-z-none", seat("jk", "ac", "delim-1976")], ["jk-a-may", seat("jk", "ac", "delim-2008")],
      ["br-a-second", seat("br", "ac", "delim-2008")], ["br-z-first", seat("br", "ac", "delim-1976")],
    ],
  );
  const v = votingEpochs(d);
  assert.equal(v.get("as ac"), "delim-2008", "October 2005 over February 2005, though February is the later occurrence");
  assert.equal(v.get("jk ac"), "delim-2008", "a sourced month over an unsourced one");
  assert.equal(v.get("br ac"), "delim-2008", "occurrence 2 over occurrence 1");
  d.close();
});

test("an election that straddles two epochs in one house still gives one answer: the newer epoch", () => {
  // `mandate geography validate` check 2 reports this as a defect. The view must not depend on row order.
  for (const order of [["delim-2008", "delim-2023-as"], ["delim-2023-as", "delim-2008"]] as const) {
    const d = build(
      [seat("as", "pc", "delim-2008"), seat("as", "pc", "delim-2023-as", 2)],
      [{ id: "ls-2024", kind: "general", house: "pc", j: "in", year: 2024 }],
      order.map((e): [string, Seat] => ["ls-2024", seat("as", "pc", e, e === "delim-2008" ? 1 : 2)]),
    );
    assert.equal(votingEpochs(d).get("as pc"), "delim-2023-as");
    d.close();
  }
});

test("an empty registry votes under nothing", () => {
  const d = empty();
  assert.equal(votingEpochs(d).size, 0);
  d.close();
});

test("the view is the rule in core/election-kind.ts, spelled in SQL: 200 random registries, no disagreement", () => {
  let s = 20260818;
  const rnd = (n: number): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s % n;
  };
  const pick = <T>(xs: readonly T[]): T => xs[rnd(xs.length)] as T;
  const epochsOf: Record<string, string[]> = {
    as: ["delim-1976", "delim-2008", "delim-2023-as"],
    jk: ["delim-1976", "delim-2008", "delim-2022-jk"],
    br: ["delim-1976", "delim-2008"],
  };
  const states = Object.keys(epochsOf);
  let compared = 0;
  let withBypollNewest = 0;
  for (let r = 0; r < 200; r += 1) {
    const seats: Seat[] = [];
    for (const j of states) for (const house of ["ac", "pc"] as const) for (const e of epochsOf[j]!) for (let n = 1; n <= 2; n += 1) seats.push(seat(j, house, e, n));
    const elections: Elec[] = [];
    const contests: [string, Seat][] = [];
    const taken = new Set<string>();
    for (let i = 0; i < 3 + rnd(10); i += 1) {
      const type = pick(["ac-assembly", "ac-assembly", "ac-bypoll", "pc-general", "pc-bypoll"] as const);
      const [house, kind] = type.split("-") as ["ac" | "pc", "assembly" | "general" | "bypoll"];
      const j = type === "pc-general" ? "in" : pick(states);
      const year = 1996 + rnd(31);
      const month = rnd(3) === 0 ? null : 1 + rnd(12);
      const occurrence = 1 + rnd(2);
      if (taken.has(`${j}/${kind}/${house}/${year}/${occurrence}`)) continue;
      taken.add(`${j}/${kind}/${house}/${year}/${occurrence}`);
      const id = `${j}-${type}-${i}-${["a", "m", "z"][rnd(3)]}`; // the suffix is noise, to defeat ranking by id
      elections.push({ id, kind, house, j, year, month, occurrence });
      for (const st of j === "in" ? states : [j]) {
        // One epoch per election per jurisdiction: a straddle is its own test above.
        const epoch = pick(epochsOf[st]!);
        for (const n of kind === "bypoll" ? [1] : [1, 2]) contests.push([id, seat(st, house, epoch, n)]);
      }
    }
    const d = build(seats, elections, contests);
    const expected = new Map(
      all<{ jurisdiction_id: string; kind: string; epoch_id: string }>(
        d,
        `SELECT jurisdiction_id, kind, epoch_id FROM (
           SELECT pv.jurisdiction_id, pv.kind, pv.epoch_id,
                  row_number() OVER (PARTITION BY pv.jurisdiction_id, pv.kind ORDER BY ${chronoDesc("e")}) AS rn
             FROM contest c
             JOIN election e ON e.id = c.election_id
             JOIN place_version pv ON pv.id = c.place_version_id
            WHERE pv.kind IN ('ac','pc') AND ${fullHouse("e")}) ranked
          WHERE rn = 1`,
      ).map((x) => [`${x.jurisdiction_id} ${x.kind}`, x.epoch_id]),
    );
    const got = votingEpochs(d);
    assert.deepEqual([...got].sort(), [...expected].sort(), `registry ${r}`);
    compared += expected.size;
    if (elections.some((e) => e.kind === "bypoll")) withBypollNewest += 1;
    d.close();
  }
  assert.ok(compared > 400, `the property compared ${compared} answers`);
  assert.ok(withBypollNewest > 100, "most registries had a by-election in them to be ignored");
});

test("migration 017 applies to a registry that already holds data, and rebuilds nothing", () => {
  // The registry on disk is migrated to 016. Applying the view must not need a rebuild or touch a row.
  const dir = mkdtempSync(join(tmpdir(), "mandate-migrations-"));
  for (const f of readdirSync(MIGRATIONS_DIR).filter((x) => x < "017")) cpSync(join(MIGRATIONS_DIR, f), join(dir, f));
  const d = open(":memory:");
  assert.equal(migrate(d, NOW, dir).at(-1), "016_source_boundary_geometry.sql");
  d.exec(`
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('delim-2008', 'DPACO', '2008-02-19');
    INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India'), ('wb','state','West Bengal');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('wb.ac.001','ac','A','wb');
    INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name)
      VALUES (1,'wb.ac.001','wb','ac','delim-2008',1,'A');
    INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year)
      VALUES ('wb-assembly-2021','assembly','state','wb','delim-2008','WB 2021','declared','ac',2021);
    INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES ('c1','wb-assembly-2021',1,'declared');
  `);
  const count = (t: string): number => Number(all<{ n: number }>(d, `SELECT COUNT(*) AS n FROM ${t}`)[0]?.n);
  const before = ["boundary_epoch", "place_version", "election", "contest"].map((t) => count(t));
  assert.deepEqual(migrate(d, NOW), ["017_voting_epoch.sql"]);
  assert.deepEqual(["boundary_epoch", "place_version", "election", "contest"].map((t) => count(t)), before);
  assert.deepEqual([...votingEpochs(d)], [["wb ac", "delim-2008"]]);
  d.close();
});

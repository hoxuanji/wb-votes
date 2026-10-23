// What a Lokdhaba import does about identities the registry already holds: the party versions the seed wrote,
// and the people `mandate resolve` has since merged. The importer had no test of its own for either.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { gzipSync } from "node:zlib";
import type { DatabaseSync } from "node:sqlite";
import { all, get, open } from "../../db/index.ts";
import { migrate } from "../../db/migrate.ts";
import { checkInvariants, resolvePersons, unmerge } from "../resolve/index.ts";
import { REQUIRED_COLUMNS, importLokdhaba, type Fetched } from "./lokdhaba.ts";

const NOW = "2026-08-12T00:00:00.000Z";
const HEADER = [...REQUIRED_COLUMNS, "Assembly_No", "Poll_No", "Age"];

type Cand = { year: number; assembly: number; pos: number; name: string; pid: string; party: string; born: number };

/** One Karnataka assembly seat per row: every candidate stands in seat 1, so a person is told apart by name. */
function file(rows: Cand[]): Fetched {
  const lines = rows.map((r) => {
    const f: Record<string, string> = {
      State_Name: "Karnataka", Year: String(r.year), Constituency_No: "1", Constituency_Name: "NIPPANI",
      Constituency_Type: "GEN", DelimID: "4", Position: String(r.pos), Candidate: r.name, Sex: "M", Party: r.party,
      Party_ID: "1", Votes: String(1000 - r.pos * 100), Valid_Votes: "2000", Electors: "4000", Turnout_Percentage: "50",
      Vote_Share_Percentage: "45", Margin: r.pos === 1 ? "100" : "", pid: r.pid,
      Election_Type: "State Assembly Election (AE)", Assembly_No: String(r.assembly), Poll_No: "0",
      Age: String(r.year - r.born),
    };
    return HEADER.map((h) => f[h] ?? "").join(",");
  });
  const bytes = gzipSync(Buffer.from([HEADER.join(","), ...lines].join("\n"), "utf8"));
  return { url: "test:ka-ae", bytes, sha256: createHash("sha256").update(bytes).digest("hex"), retrievedAt: NOW, cached: false };
}

const importKa = (d: DatabaseSync, rows: Cand[]) =>
  importLokdhaba(d, { jurisdictionId: "ka", type: "AE", file: file(rows), nowIso: NOW });

function registry(): DatabaseSync {
  const d = open(":memory:");
  migrate(d, NOW);
  d.exec("INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India'), ('ka','state','Karnataka')");
  return d;
}

const RAM = { name: "RAM SINGH", party: "INC", born: 1973 };

test("a Lokdhaba import beside the seed's party versions leaves one open-ended version per party", () => {
  const d = registry();
  // The seed's shape for a party: one version from 2011-01-01, open, named in full.
  d.exec(`INSERT INTO party (id, name, short_name, names, kind)
            VALUES ('BJP', 'Bharatiya Janata Party', 'BJP', '{}', 'national');
          INSERT INTO party_version (party_id, valid_from, valid_to, name)
            VALUES ('BJP', '2011-01-01', NULL, 'Bharatiya Janata Party')`);
  const seedVersion = get<{ id: number }>(d, "SELECT id FROM party_version WHERE party_id = 'BJP'")!.id;

  const rows: Cand[] = [
    { year: 2013, assembly: 14, pos: 1, name: "RAM SINGH", pid: "P1", party: "BJP", born: 1973 },
    { year: 2013, assembly: 14, pos: 2, name: "SHYAM RAO", pid: "P3", party: "INC", born: 1960 },
  ];
  importKa(d, rows);

  const held = (n: string) => checkInvariants(d).find((i) => i.name === n)?.rows;
  assert.equal(held("party_version_no_two_open_ended_rows"), 0);
  assert.equal(held("party_version_no_overlapping_validity"), 0);

  // The party the seed named keeps its own row, unrewritten, and the candidacy is bound to it.
  assert.deepEqual(
    all<object>(d, "SELECT id, valid_from, valid_to, name FROM party_version WHERE party_id = 'BJP'").map((r) => ({ ...r })),
    [{ id: seedVersion, valid_from: "2011-01-01", valid_to: null, name: "Bharatiya Janata Party" }],
  );
  assert.equal(
    get<{ v: number }>(d, "SELECT party_version_id AS v FROM candidacy WHERE person_id = 'tcpd-p1'")?.v,
    seedVersion,
    "the candidacy is bound to the seed's version, not to a second one",
  );
  // A party the registry did not hold gets the one version this importer makes.
  const inc = all<{ id: number; valid_from: string; valid_to: string | null; name: string }>(
    d,
    "SELECT id, valid_from, valid_to, name FROM party_version WHERE party_id = 'INC'",
  );
  assert.deepEqual(inc.map((r) => ({ valid_from: r.valid_from, valid_to: r.valid_to, name: r.name })), [
    { valid_from: "1900-01-01", valid_to: null, name: "INC" },
  ]);
  assert.equal(get<{ v: number }>(d, "SELECT party_version_id AS v FROM candidacy WHERE person_id = 'tcpd-p3'")?.v, inc[0]?.id);

  // and a second import adds nothing
  importKa(d, rows);
  assert.equal(get<{ n: number }>(d, "SELECT COUNT(*) AS n FROM party_version")?.n, 2);
  assert.equal(held("party_version_no_two_open_ended_rows"), 0);
  d.close();
});

test("a later release that names an absorbed person's TCPD id writes onto the survivor and does not bring the person back", () => {
  const d = registry();
  importKa(d, [{ year: 2013, assembly: 14, pos: 1, pid: "P1", ...RAM }]);
  // The same man in the next election, in a file that gives no pid for him. `resolve` never merges two persons
  // that both carry a TCPD id, but it does merge one that has none into one that has, and that is the merge here.
  importKa(d, [{ year: 2018, assembly: 15, pos: 1, pid: "", ...RAM }]);
  const r = resolvePersons(d, { nowIso: NOW });
  assert.equal(r.merged, 1, "the fixture must produce the merge this test is about");
  const merge = get<{ id: number; merged_id: string; surviving_id: string }>(
    d,
    "SELECT id, merged_id, surviving_id FROM person_merge",
  )!;
  assert.equal(merge.merged_id, "tcpd-p1", "the person with the TCPD id is the one absorbed");

  // The next release: the earlier elections again, and 2023, in which the same pid stands.
  importKa(d, [
    { year: 2013, assembly: 14, pos: 1, pid: "P1", ...RAM },
    { year: 2018, assembly: 15, pos: 1, pid: "", ...RAM },
    { year: 2023, assembly: 16, pos: 1, pid: "P1", ...RAM },
  ]);

  const count = (sql: string, ...p: string[]) => Number(get<{ n: number }>(d, sql, ...p)?.n);
  assert.equal(count("SELECT COUNT(*) AS n FROM person WHERE id = ?", merge.merged_id), 0, "the absorbed person came back");
  assert.equal(
    get<{ person_id: string }>(d, "SELECT person_id FROM person_identifier WHERE scheme = 'tcpd_pid' AND value = 'P1'")
      ?.person_id,
    merge.surviving_id,
    "the TCPD id moved off the survivor",
  );
  // the 2023 candidacy keeps the id derived from the pid and is held by the survivor
  const c2023 = get<{ id: string; person_id: string }>(
    d,
    "SELECT ca.id, ca.person_id FROM candidacy ca JOIN contest c ON c.id = ca.contest_id JOIN election e ON e.id = c.election_id WHERE e.year = 2023",
  )!;
  assert.match(c2023.id, /:tcpd-p1$/);
  assert.equal(c2023.person_id, merge.surviving_id);
  assert.equal(count("SELECT COUNT(*) AS n FROM candidacy WHERE person_id = ?", merge.merged_id), 0);

  // The ledger still says what is true: one merge, not reverted, and a second resolve finds nothing to do.
  assert.equal(resolvePersons(d, { nowIso: NOW }).merged, 0, "the pair was merged a second time");
  assert.deepEqual(
    all<object>(d, "SELECT id, merged_id, surviving_id, reverted_at FROM person_merge").map((m) => ({ ...m })),
    [{ ...merge, reverted_at: null }],
  );
  // and the merge can still be reverted, which it cannot be once the absorbed person's id is taken again
  unmerge(d, merge.id, NOW);
  assert.equal(count("SELECT COUNT(*) AS n FROM person WHERE id = ?", merge.merged_id), 1);
  d.close();
});

// partyVersion: a party has at most one open-ended version, and an importer that needs one attaches to it.

import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { all, open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { checkInvariants } from "./resolve/index.ts";
import { partyVersion } from "./party-version.ts";

const NOW = "2026-08-12T00:00:00.000Z";

function registry(): DatabaseSync {
  const d = open(":memory:");
  migrate(d, NOW);
  d.exec(`INSERT INTO party (id, name, short_name, names, kind)
            VALUES ('BJP', 'Bharatiya Janata Party', 'BJP', '{}', 'national'), ('INC', 'INC', 'INC', '{}', 'national')`);
  return d;
}

const versions = (d: DatabaseSync, party: string) =>
  all<{ id: number; valid_from: string; valid_to: string | null; name: string; symbol_id: string | null }>(
    d,
    "SELECT id, valid_from, valid_to, name, symbol_id FROM party_version WHERE party_id = ? ORDER BY valid_from, id",
    party,
  ).map((r) => ({ ...r }));

const held = (d: DatabaseSync) =>
  checkInvariants(d)
    .filter((i) => i.name.startsWith("party_version_"))
    .every((i) => i.rows === 0);

test("a party with no version gets the one asked for, open-ended", () => {
  const d = registry();
  const id = partyVersion(d, "INC", { validFrom: "1900-01-01", name: "INC" });
  assert.deepEqual(versions(d, "INC"), [{ id, valid_from: "1900-01-01", valid_to: null, name: "INC", symbol_id: null }]);
  d.close();
});

test("a party that already has an open-ended version is given that one back, and nothing is written", () => {
  const d = registry();
  d.exec("INSERT INTO symbol (id, name) VALUES ('lotus', 'Lotus')");
  d.exec(`INSERT INTO party_version (party_id, valid_from, valid_to, name, symbol_id)
            VALUES ('BJP', '2011-01-01', NULL, 'Bharatiya Janata Party', 'lotus')`);
  const before = versions(d, "BJP");
  const id = partyVersion(d, "BJP", { validFrom: "1900-01-01", name: "BJP" });
  assert.equal(id, before[0]?.id);
  assert.deepEqual(versions(d, "BJP"), before, "the version the party had was rewritten or joined by another");
  d.close();
});

test("asking twice for one party leaves one version", () => {
  const d = registry();
  const a = partyVersion(d, "INC", { validFrom: "1900-01-01", name: "INC" });
  const b = partyVersion(d, "INC", { validFrom: "1900-01-01", name: "Indian National Congress" });
  assert.equal(b, a);
  assert.equal(versions(d, "INC").length, 1);
  assert.equal(versions(d, "INC")[0]?.name, "INC", "the second ask renamed the version");
  d.close();
});

test("a party whose versions are all closed gets an open-ended one that starts where they end", () => {
  const d = registry();
  d.exec(`INSERT INTO party_version (party_id, valid_from, valid_to, name)
            VALUES ('INC', '2000-01-01', '2010-01-01', 'Indian National Congress')`);
  const id = partyVersion(d, "INC", { validFrom: "2010-01-01", name: "INC" });
  assert.deepEqual(
    versions(d, "INC").map((r) => [r.valid_from, r.valid_to, r.id === id]),
    [["2000-01-01", "2010-01-01", false], ["2010-01-01", null, true]],
  );
  assert.ok(held(d));
  d.close();
});

test("a registry that already holds two open-ended versions is answered with the earlier and not added to", () => {
  const d = registry();
  // What a Lokdhaba import used to leave beside the seed's version. Repairing it is a rebuild's work.
  d.exec(`INSERT INTO party_version (party_id, valid_from, valid_to, name)
            VALUES ('BJP', '2011-01-01', NULL, 'Bharatiya Janata Party'), ('BJP', '1900-01-01', NULL, 'BJP')`);
  const early = versions(d, "BJP")[0];
  assert.equal(early?.valid_from, "1900-01-01");
  assert.equal(partyVersion(d, "BJP", { validFrom: "1900-01-01", name: "BJP" }), early?.id);
  assert.equal(versions(d, "BJP").length, 2);
  d.close();
});

test("a version that would start where a closed one starts is refused, and nothing is written", () => {
  const d = registry();
  d.exec(`INSERT INTO party_version (party_id, valid_from, valid_to, name)
            VALUES ('INC', '1900-01-01', '1950-01-01', 'Indian National Congress')`);
  const before = versions(d, "INC");
  assert.throws(() => partyVersion(d, "INC", { validFrom: "1900-01-01", name: "INC" }), /UNIQUE/);
  assert.deepEqual(versions(d, "INC"), before);
  d.close();
});

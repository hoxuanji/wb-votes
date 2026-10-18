// The epoch table, with no database. Four things are held here: the table still says what the three maps it
// replaced said (the ids derived from it can never move), the two questions it answers, the successor rule
// that derives an epoch's end, and the table's own integrity.

import assert from "node:assert/strict";
import test from "node:test";
import { EPOCHS, epochById, epochOfDelimId, inForce, successor, superseded } from "./epochs.ts";

// Today's three maps, as they stood when each lived in its own module. Literal on purpose: these are the
// numbers every `place_version` id was minted from, so a test that derived them from the table would pass
// when the table moved them.
const LOKDHABA_DELIMITATIONS = {
  "1": { id: "delim-1952", name: "Delimitation Commission Order, 1952 (day precision not recorded)", from: "1952-01-01" },
  "2": { id: "delim-1963", name: "Delimitation Commission Order, 1963 (day precision not recorded)", from: "1963-01-01" },
  "3": { id: "delim-1976", name: "Delimitation Commission Order, 1976 (day precision not recorded)", from: "1976-01-01" },
  "4": {
    id: "delim-2008",
    name: "Delimitation of Parliamentary and Assembly Constituencies Order, 2008",
    from: "2008-02-19",
  },
};
const RECONSTRUCT_EPOCH_OF_DELIM = { "1": "delim-1952", "2": "delim-1963", "3": "delim-1976", "4": "delim-2008" };
const DELIMITATION_EPOCH_DELIM_ID = {
  "delim-1952": 1,
  "delim-1963": 2,
  "delim-1976": 3,
  "delim-2008": 4,
  "delim-2022-jk": 5,
  "delim-2023-as": 6,
};

test("the table says what the three maps it replaced said", () => {
  const tcpd = EPOCHS.filter((e) => e.tcpdDelimId !== null);
  assert.deepEqual(
    Object.fromEntries(tcpd.map((e) => [String(e.tcpdDelimId), { id: e.id, name: e.name, from: e.effectiveFrom }])),
    LOKDHABA_DELIMITATIONS,
  );
  assert.deepEqual(Object.fromEntries(tcpd.map((e) => [String(e.tcpdDelimId), e.id])), RECONSTRUCT_EPOCH_OF_DELIM);
  assert.deepEqual(Object.fromEntries(EPOCHS.map((e) => [e.id, e.versionBlock])), DELIMITATION_EPOCH_DELIM_ID);
});

test("the table is sound: unique ids and blocks, blocks versionId accepts, TCPD's ids are the first blocks", () => {
  assert.equal(new Set(EPOCHS.map((e) => e.id)).size, EPOCHS.length);
  assert.equal(new Set(EPOCHS.map((e) => e.versionBlock)).size, EPOCHS.length, "two epochs would mint the same ids");
  for (const e of EPOCHS) {
    assert.ok(e.versionBlock >= 0 && e.versionBlock <= 19, `${e.id}: versionId allows 0-19`);
    if (e.tcpdDelimId !== null) {
      assert.equal(e.versionBlock, e.tcpdDelimId, `${e.id}: the Lokdhaba importer used the DelimID as the block`);
      // None of these dates is established as any kind of date: the three earliest are January of the order
      // year, and DPACO 2008's basis stays honest too. No importer may infer an epoch from one.
      assert.equal(e.effectiveDateBasis, "not_established", e.id);
    }
    assert.match(e.effectiveFrom, /^\d{4}-\d{2}-\d{2}$/);
  }
  // Oldest first, as the comment on EPOCHS promises.
  assert.deepEqual(
    EPOCHS.map((e) => e.effectiveFrom),
    EPOCHS.map((e) => e.effectiveFrom).sort(),
  );
  // An order that cites a document names the jurisdiction it redraws, and a national one cites none yet.
  for (const e of EPOCHS) assert.equal(e.sourceId !== null, e.jurisdictionId !== null, e.id);
});

test("lookups: by id, and by TCPD's DelimID", () => {
  assert.equal(epochById("delim-2008").tcpdDelimId, 4);
  assert.throws(() => epochById("delim-2099"), /no epoch 'delim-2099'/);
  assert.equal(epochOfDelimId(3)?.id, "delim-1976");
  assert.equal(epochOfDelimId(5), undefined, "TCPD has no value for the two state orders");
});

test("inForce: the newest order that names the jurisdiction or is national, on the date asked", () => {
  assert.equal(inForce("br", "2024-06-04").id, "delim-2008");
  // The boundary day belongs to the new order, and the day before does not.
  assert.equal(inForce("br", "2008-02-18").id, "delim-1976");
  assert.equal(inForce("br", "2008-02-19").id, "delim-2008");
  // Jammu & Kashmir: the legal effective date, 20 May 2022.
  assert.equal(inForce("jk", "2022-05-19").id, "delim-2008");
  assert.equal(inForce("jk", "2022-05-20").id, "delim-2022-jk");
  // Assam: the date the ECI published its final notification, 11 August 2023.
  assert.equal(inForce("as", "2023-08-10").id, "delim-2008");
  assert.equal(inForce("as", "2023-08-11").id, "delim-2023-as");
  // …and one state's order is no other state's: Bihar on Assam's day is still on DPACO 2008.
  assert.equal(inForce("br", "2023-08-11").id, "delim-2008");
  assert.equal(inForce("jk", "2023-08-11").id, "delim-2022-jk", "an order for another state does not displace J&K's");
  // A jurisdiction the table has never heard of is on the national order, as the SQL it replaces answered.
  assert.equal(inForce("zz", "2030-01-01").id, "delim-2008");
  // Before the first order there is nothing to be in force, and the answer is not invented.
  assert.throws(() => inForce("br", "1951-12-31"), /no epoch was in force for 'br' on 1951-12-31/);
});

test("successor: which order replaced this one in this jurisdiction, and so where an epoch ends", () => {
  assert.equal(successor("br", "delim-1976")?.id, "delim-2008");
  assert.equal(successor("br", "delim-2008"), null, "DPACO 2008 is not superseded in Bihar");
  assert.equal(successor("as", "delim-2008")?.id, "delim-2023-as", "…and is in Assam");
  assert.equal(successor("jk", "delim-2008")?.id, "delim-2022-jk");
  assert.equal(successor("as", "delim-2023-as"), null);
  // The end date is the successor's start: one answer per jurisdiction, which no single column could hold.
  assert.equal(successor("as", "delim-2008")?.effectiveFrom, "2023-08-11");
  assert.equal(successor("jk", "delim-2008")?.effectiveFrom, "2022-05-20");
  // An epoch that is not the jurisdiction's is an error, never null: null would read as "still current".
  assert.throws(() => successor("br", "delim-2023-as"), /does not apply to 'br'/);
  assert.throws(() => successor("as", "delim-2022-jk"), /does not apply to 'as'/);
});

test("inForce and successor agree: an epoch is in force from its start until its successor's", () => {
  for (const j of ["br", "as", "jk", "wb"]) {
    for (const e of EPOCHS.filter((x) => x.jurisdictionId === null || x.jurisdictionId === j)) {
      assert.equal(inForce(j, e.effectiveFrom).id, e.id, `${j}: ${e.id} on its own first day`);
      const next = successor(j, e.id);
      if (next !== null) {
        assert.equal(inForce(j, next.effectiveFrom).id, next.id);
        assert.notEqual(inForce(j, next.effectiveFrom).id, e.id, `${j}: ${e.id} ended where ${next.id} began`);
      }
    }
  }
});

test("superseded: the epochs with a successor, each with the one now in force there", () => {
  assert.deepEqual(superseded(["br", "as", "jk"]), [
    { jurisdictionId: "br", epochId: "delim-1952", currentId: "delim-2008" },
    { jurisdictionId: "br", epochId: "delim-1963", currentId: "delim-2008" },
    { jurisdictionId: "br", epochId: "delim-1976", currentId: "delim-2008" },
    { jurisdictionId: "as", epochId: "delim-1952", currentId: "delim-2023-as" },
    { jurisdictionId: "as", epochId: "delim-1963", currentId: "delim-2023-as" },
    { jurisdictionId: "as", epochId: "delim-1976", currentId: "delim-2023-as" },
    { jurisdictionId: "as", epochId: "delim-2008", currentId: "delim-2023-as" },
    { jurisdictionId: "jk", epochId: "delim-1952", currentId: "delim-2022-jk" },
    { jurisdictionId: "jk", epochId: "delim-1963", currentId: "delim-2022-jk" },
    { jurisdictionId: "jk", epochId: "delim-1976", currentId: "delim-2022-jk" },
    { jurisdictionId: "jk", epochId: "delim-2008", currentId: "delim-2022-jk" },
  ]);
});

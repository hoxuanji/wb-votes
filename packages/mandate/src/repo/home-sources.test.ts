// The sources behind the front page's figures: which elections each of the three modules cites.
//
// The live registry cannot tell the three lists apart. It holds one source per election, so every list is "the sources of the elections
// that module reads" and a module that read too many or too few elections would still pass. The registry here gives each election its OWN
// source, so a list can be read as a set of elections and the three can be told apart by what each one leaves out.

import assert from "node:assert/strict";
import test from "node:test";
import { open } from "../db/index.ts";
import { homeView } from "./home.ts";
import { homeSources } from "./home-sources.ts";
import { electionsFixture } from "./testkit.ts";
import type { ElectionSpec } from "./testkit.ts";

const THIS_YEAR = 2026;

const SPECS: readonly ElectionSpec[] = [
  { id: "wb-assembly-2016", jurisdiction: "wb", year: 2016, seats: { AAA: 6, BBB: 4 } },
  { id: "wb-assembly-2021", jurisdiction: "wb", year: 2021, seats: { AAA: 7, BBB: 3 } },
  { id: "ls-2019", jurisdiction: "in", year: 2019, kind: "general", house: "pc", seatsIn: "wb", seats: { AAA: 3, BBB: 5 } },
  { id: "ls-2024", jurisdiction: "in", year: 2024, kind: "general", house: "pc", seatsIn: "wb", seats: { AAA: 4, BBB: 6 } },
];

/** A registry in which each election's results are cited to a source of their own, named for the election. */
function registry() {
  const d = open(":memory:");
  electionsFixture(d, SPECS);
  for (const s of SPECS) {
    d.prepare(`INSERT INTO source (id, kind, publisher, title, retrieved_at, doc_hash) VALUES (?, 'static_module', 'P', ?, '2026-08-12', 'sha256:0')`).run(
      `src-${s.id}`,
      s.id,
    );
    d.prepare(`UPDATE result SET source_id = ? WHERE contest_id IN (SELECT id FROM contest WHERE election_id = ?)`).run(`src-${s.id}`, s.id);
  }
  return d;
}

const elections = (sources: readonly { title: string | null }[]): string[] => sources.map((s) => s.title ?? "").sort();

test("each module cites the elections it reads, and the three lists differ by what each leaves out", () => {
  const d = registry();
  try {
    const v = homeView(d, { thisYear: THIS_YEAR });
    const src = homeSources(d, v);
    // The map reads each state's CURRENT assembly and the CURRENT Lok Sabha: not the assembly before it, not the Lok Sabha before it.
    assert.deepEqual(elections(src.map), ["ls-2024", "wb-assembly-2021"]);
    // The party landscape sums those assembly seats and draws a sparkline over the Lok Sabha run, so the earlier Lok Sabha is in it too.
    assert.deepEqual(elections(src.parties), ["ls-2019", "ls-2024", "wb-assembly-2021"]);
    // Recent results lists the elections held lately, the earlier assembly among them, whatever the map reads.
    for (const id of v.held.map((h) => h.id)) {
      assert.ok(elections(src.recent).includes(id), `${id} is listed in Recent results and its source is not`);
    }
    assert.ok(elections(src.recent).includes("wb-assembly-2016"), "an earlier election the module lists has no source");
  } finally {
    d.close();
  }
});

test("a source is cited once, however many of an election's results name it", () => {
  const d = registry();
  try {
    const src = homeSources(d, homeView(d, { thisYear: THIS_YEAR }));
    for (const list of [src.map, src.recent, src.parties]) {
      const ids = list.map((s) => s.id);
      assert.equal(new Set(ids).size, ids.length, "a source is listed twice");
    }
  } finally {
    d.close();
  }
});

test("an empty registry has no sources to cite, and says so with empty lists", () => {
  const d = open(":memory:");
  try {
    electionsFixture(d, []);
    const src = homeSources(d, homeView(d, { thisYear: THIS_YEAR }));
    assert.deepEqual(src, { map: [], recent: [], parties: [] });
  } finally {
    d.close();
  }
});

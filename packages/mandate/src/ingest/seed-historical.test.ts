// data/seed/historical-results.json files each past result under a seat id, and the generator that wrote
// it is gone, so nothing but these tests says the ids are right. They were not. 41 rows sat on another
// seat's id: 38 under the source's own AC number, which in constituencies.json is another seat (the
// source spells the name differently), and 3 as South 24 Parganas's Bishnupur under Bankura's, the one
// name the seed repeats. Forty (year, seat) keys then held two rows. Bankura's Bishnupur showed South 24
// Parganas's MLA for 2011, 2016 and 2021 while South 24 Parganas's showed no result at all, and Bhangar
// showed Kolkata Port's 2011 winner with no second row to give it away. The ingest keeps one row of a
// pair and cannot know which, so the check is made on the seed, against the file the rows came from.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadStaticBundle } from "./index.ts";

const RAW = fileURLToPath(new URL("../../../../src/data/raw/historical/", import.meta.url));
const YEARS = [2011, 2016, 2021] as const;

/** One CSV line, honouring the quotes a name like "Arup Roy, S/o Late" needs. */
function fields(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

type SourceWinner = { seat: string; category: string };

/** The rank-1 row of each seat in a Lokdhaba file, keyed by what the seed row also carries: votes and electors. */
function winnersOf(year: number): Map<string, SourceWinner[]> {
  const [head, ...lines] = readFileSync(`${RAW}lokdhaba-wb-ac-${year}.csv`, "utf8").trim().split("\n");
  const col = new Map(fields(head ?? "").map((name, i) => [name, i]));
  const at = (f: string[], name: string): string => f[col.get(name) ?? -1] ?? "";
  const byTally = new Map<string, SourceWinner[]>();
  for (const line of lines) {
    const f = fields(line);
    if (at(f, "position") !== "1") continue;
    const key = `${at(f, "votes")}:${at(f, "total_electors")}`;
    byTally.set(key, [...(byTally.get(key) ?? []), { seat: at(f, "constituency_name"), category: at(f, "category") }]);
  }
  return byTally;
}

/** How the source spells the seats whose name is not the one constituencies.json uses. */
const SPELLED: Readonly<Record<string, string>> = {
  "Dabgram-phulbari": "Dabgram-Fulbari",
  "Baishnab Nagar": "Baisnabnagar",
  Baishnabnagar: "Baisnabnagar",
  Manickchak: "Manikchak",
  Bhagawangola: "Bhagabangola",
  Nowda: "Naoda",
  Bagdah: "Bagda",
  "Bongaon Uttar": "Bangaon Uttar",
  "Bongaon Dakshin": "Bangaon Dakshin",
  Jaqynagar: "Joynagar",
  Jaynagar: "Joynagar",
  Satgachia: "Satgachhia",
  Bhangore: "Bhangar",
  Tollygunj: "Tollyganj",
  Tollygunge: "Tollyganj",
  "Kokata port": "Kolkata Port",
  "Kashipur-Belgachia": "Kashipur-Belgachhia",
  Chandannagore: "Chandannagar",
  Mahisadal: "Mahishadal",
  Arambagh: "Arambag",
  Ranibundh: "Ranibandh",
  Kotulpur: "Katulpur",
  Indas: "Indus",
  Mangalkot: "Mongalkote",
  Barbani: "Barabani",
  Labpur: "Labhpur",
};

const clean = (s: string): string => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, "");

test("no seat has two result rows for one election", async () => {
  const { historicalResults } = await loadStaticBundle();
  const rows = new Map<string, string[]>();
  for (const h of historicalResults) {
    const key = `${h.year} ${h.constituencyId}`;
    rows.set(key, [...(rows.get(key) ?? []), h.winner.name]);
  }
  const twice = [...rows].filter(([, winners]) => winners.length > 1).map(([key, winners]) => `${key}: ${winners.join(" / ")}`);
  assert.deepEqual(twice, [], "two rows under one seat: one of them is another seat's, and the ingest cannot tell which");
});

test("every seat has a row for each of 2011, 2016 and 2021, as the source has", async () => {
  const { historicalResults, constituencies } = await loadStaticBundle();
  const gaps = YEARS.flatMap((year) => {
    const filed = new Set(historicalResults.filter((h) => h.year === year).map((h) => h.constituencyId));
    return constituencies.filter((c) => !filed.has(c.id)).map((c) => `${year} ${c.id} ${c.name}`);
  });
  assert.deepEqual(gaps, [], "a seat with no row shows 'no result is declared' for an election that declared one");
});

test("every 2011-2021 row is filed under the seat the Lokdhaba file names it for", async () => {
  const { historicalResults, constituencies } = await loadStaticBundle();
  // The two Bishnupurs are the one name constituencies.json repeats; the file's reservation tells them apart.
  const seatsNamed = new Map<string, string[]>();
  for (const c of constituencies) seatsNamed.set(clean(c.name), [...(seatsNamed.get(clean(c.name)) ?? []), c.id]);
  const reservedOf = new Map(constituencies.map((c) => [c.id, c.reservation]));
  const source = new Map(YEARS.map((y) => [y, winnersOf(y)]));

  const misfiled: string[] = [];
  for (const h of historicalResults) {
    const found = source.get(h.year as (typeof YEARS)[number]);
    if (found === undefined) continue; // 2026 is not in a Lokdhaba file
    const named = found.get(`${h.winner.votes}:${h.totalElectors}`) ?? [];
    if (named.length !== 1) {
      misfiled.push(`${h.year} ${h.constituencyId} ${h.winner.name}: ${named.length} rank-1 rows carry ${h.winner.votes} votes and ${h.totalElectors} electors`);
      continue;
    }
    const { seat, category } = named[0] as SourceWinner;
    const candidates = seatsNamed.get(clean(SPELLED[seat] ?? seat)) ?? [];
    const owner = candidates.length > 1 ? candidates.filter((id) => reservedOf.get(id) === (category === "SC" ? "SC" : category === "ST" ? "ST" : "General")) : candidates;
    if (owner.length !== 1) misfiled.push(`${h.year} ${h.constituencyId}: the source's "${seat}" is no seat of constituencies.json`);
    else if (owner[0] !== h.constituencyId) misfiled.push(`${h.year} ${h.constituencyId} ${h.winner.name}: the source puts this winner in "${seat}", which is ${owner[0]}`);
  }
  assert.deepEqual(misfiled, []);
});

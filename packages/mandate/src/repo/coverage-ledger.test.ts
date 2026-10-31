// The coverage ledger's grouping: what it groups, what it says once, and that nothing a row said is lost.
//
// The ledger was eighteen rows that said "Not modelled", "none" and "no <x> model exists yet" in turn (coverage-ledger.ts). What is held here is the
// shape of the fix and its one risk: a grouping that says something once can drop something. So every entry is compared with the vertical it came
// from, word for word, and a grouping that merges anything names what it merged.

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { DEV_DB_PATH, openRead } from "../db/open.ts";
import { VERTICALS, verticals } from "./coverage.ts";
import type { Status, VerticalState } from "./coverage.ts";
import { GROUP_ORDER, ledgerGroups } from "./coverage-ledger.ts";

const HAVE_DB = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const live = { skip: HAVE_DB ? false : "no .data/registry.db — run npm run registry:ingest" };

/** The ledger as the dev registry reports it: four verticals with rows, three with a table and none, eleven with no model. */
const PRESENT = ["elections", "census", "trends", "portfolios"];
const EMPTY = ["delimitation", "cases", "coalitions"];

function states(overrides: Partial<Record<string, Partial<VerticalState>>> = {}): VerticalState[] {
  return VERTICALS.map((v) => {
    const status: Status = PRESENT.includes(v.key) ? "present" : EMPTY.includes(v.key) ? "empty" : "no-model";
    const base: VerticalState = {
      ...v,
      status,
      count: status === "present" ? 100 : 0,
      reach: status === "present" ? `reach of ${v.key}` : null,
    };
    return { ...base, ...(overrides[v.key] ?? {}) };
  });
}

const BANNED = /\b(never|only|first time|he|she|his|her|him)\b/i;

test("the groups are by status, in the order a reader wants them, and every subject is in exactly one", () => {
  const groups = ledgerGroups(states());
  assert.deepEqual(groups.map((g) => g.status), ["present", "empty", "no-model"]);
  assert.deepEqual(groups.map((g) => g.status), [...GROUP_ORDER]);
  assert.deepEqual(groups.map((g) => g.entries.length), [4, 3, 11]);
  const keys = groups.flatMap((g) => g.entries.map((e) => e.key));
  assert.equal(new Set(keys).size, VERTICALS.length, "a subject is in two groups or in none");
  assert.deepEqual([...keys].sort(), VERTICALS.map((v) => v.key).sort());
  // The spec's own order inside a group.
  for (const g of groups) {
    const order = g.entries.map((e) => VERTICALS.findIndex((v) => v.key === e.key));
    assert.deepEqual(order, [...order].sort((a, b) => a - b), `${g.status} is not in the spec's order`);
  }
});

test("nothing a row said is lost: name, question, source and caveat are the vertical's own words, and a figure is its count and its reach", () => {
  const all = states();
  for (const g of ledgerGroups(all)) {
    for (const e of g.entries) {
      const v = all.find((x) => x.key === e.key) as VerticalState;
      assert.equal(e.label, v.label);
      assert.equal(e.question, v.question);
      assert.equal(e.source, v.source);
      assert.equal(e.scope, v.scope, `${e.key}: the caveat is not verbatim`);
      assert.equal(e.reach, v.reach);
      assert.deepEqual(e.rows, g.status === "present" ? { count: v.count, unit: v.unit } : null);
      // A caveat that is printed is the whole one, or the part of it beyond a clause the group has said.
      if (e.caveat !== null) assert.ok(v.scope === e.caveat || v.scope.endsWith(e.caveat), `${e.key}: the printed caveat is not the vertical's`);
    }
  }
});

test("a group says once what every one of its subjects lacks, and a group with rows says nothing", () => {
  const [present, empty, none] = ledgerGroups(states());
  assert.deepEqual(present?.shared, { rows: false, reach: false, sentence: null });
  const said = "On every subject in this group: no rows · no reach measured.";
  assert.deepEqual(empty?.shared, { rows: true, reach: true, sentence: said });
  assert.deepEqual(none?.shared, { rows: true, reach: true, sentence: said });
});

test("a gap only some subjects have stays on those subjects: one without a measured reach in a group of subjects with rows says so itself", () => {
  const [present] = ledgerGroups(states({ census: { reach: null } }));
  assert.equal(present?.shared.reach, false, "one subject's missing reach is said of all of them");
  assert.equal(present?.shared.sentence, null);
  assert.equal(present?.entries.find((e) => e.key === "census")?.reach, null);
  assert.ok(present?.entries.filter((e) => e.key !== "census").every((e) => e.reach !== null));
});

test("one subject is not a group: with fewer than two, nothing is shared", () => {
  const one = ledgerGroups(states().filter((v) => v.key !== "cases" && v.key !== "coalitions"));
  const empty = one.find((g) => g.status === "empty");
  assert.equal(empty?.entries.length, 1);
  assert.deepEqual(empty?.shared, { rows: false, reach: false, sentence: null });
});

test("a status no subject has makes no group", () => {
  const allPresent = VERTICALS.map((v): VerticalState => ({ ...v, status: "present", count: 1, reach: "x" }));
  assert.deepEqual(ledgerGroups(allPresent).map((g) => g.status), ["present"]);
  assert.deepEqual(ledgerGroups([]), []);
});

test("subjects that wait on one model are named once, and a subject keeps what its caveat says beyond that model", () => {
  const none = ledgerGroups(states()).find((g) => g.status === "no-model");
  assert.ok(none !== undefined);
  assert.deepEqual(none.waiting, [
    {
      model: "fiscal model",
      labels: ["Budget allocations", "Public spending", "Constituency development funds"],
      sentence: "Budget allocations, Public spending and Constituency development funds wait on one fiscal model.",
    },
  ]);
  const caveat = (key: string) => none.entries.find((e) => e.key === key)?.caveat;
  // Only the missing model: said by the group, so nothing is printed beside the name.
  for (const key of ["sessions", "bills", "schemes", "funding", "rti", "budget", "spending"]) assert.equal(caveat(key), null, key);
  // The shared model is said once; what a subject adds to it is its own.
  assert.equal(caveat("cdf"), "also needs the tenure spine to scope money to a member");
  // A subject with its own model keeps its whole caveat, so the model it lacks is not separated from what is said of it.
  for (const key of ["performance", "votes", "promises"]) assert.equal(caveat(key), VERTICALS.find((v) => v.key === key)?.scope, key);
  assert.match(caveat("votes") ?? "", /rarely hold division votes/);
});

test("every caveat of a subject with no model begins with the usual clause, so the grouping reaches all eleven", () => {
  const none = ledgerGroups(states()).find((g) => g.status === "no-model");
  for (const e of none?.entries ?? []) assert.notEqual(e.waitsOn, null, `${e.key}: "${e.scope}" does not begin with "no <x> model exists yet"`);
});

test("a caveat that does not begin with the usual clause is kept whole, never parsed away", () => {
  const odd = states({ bills: { scope: "waits on a legislature that has not published its sittings" } });
  const none = ledgerGroups(odd).find((g) => g.status === "no-model");
  const bills = none?.entries.find((e) => e.key === "bills");
  assert.equal(bills?.waitsOn, null);
  assert.equal(bills?.beyond, "waits on a legislature that has not published its sittings");
  assert.equal(bills?.caveat, "waits on a legislature that has not published its sittings");
});

test("the sentences the grouping writes use no pronoun for a person and none of never, only or first time", () => {
  for (const g of ledgerGroups(states())) {
    for (const s of [g.meaning, g.shared.sentence, ...g.waiting.map((w) => w.sentence)]) {
      if (s !== null) assert.doesNotMatch(s, BANNED, s);
    }
  }
});

test("on the dev registry the ledger is four subjects with data, three with a table and none, and eleven with no model", live, () => {
  const db = openRead();
  const groups = ledgerGroups(verticals(db));
  assert.deepEqual(groups.map((g) => [g.status, g.entries.length]), [["present", 4], ["empty", 3], ["no-model", 11]]);
  // Each present subject carries its measured count and reach.
  for (const e of groups[0]?.entries ?? []) {
    assert.ok(e.rows !== null && e.rows.count > 0, e.key);
    assert.ok(e.reach !== null, `${e.key} has rows and no measured reach`);
  }
});

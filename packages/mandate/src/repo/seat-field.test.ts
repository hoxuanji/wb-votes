// Everyone who stood in a seat, from the candidacies: the registry-backed claims the seat page's panels and roster stand on.
//
// They take their subjects from the registry by place id (the brief's reference seats), and skip without one.

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { DEV_DB_PATH, openRead } from "../db/open.ts";
import { get } from "../db/index.ts";
import { readSeatField } from "./seat-field.ts";

const HAVE_DB = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const live = { skip: HAVE_DB ? false : "no .data/registry.db — run npm run registry:ingest" };
const db = HAVE_DB ? openRead() : (null as unknown as ReturnType<typeof openRead>);

const field = (placeId: string) => {
  const v = get<{ id: number }>(db, "SELECT id FROM place_version WHERE place_id = ? ORDER BY id DESC LIMIT 1", placeId);
  assert.ok(v !== undefined, `${placeId} is not in the registry`);
  return readSeatField(db, v.id);
};

test("Mekliganj 2026 has its whole field, one declared winner, and no rank, share or vote for anyone who did not win", live, () => {
  const e = field("wb.ac.001").elections[0]!;
  assert.equal(e.year, 2026);
  assert.equal(e.evidence, "declared");
  assert.equal(e.candidates.length, 11);
  assert.equal(e.candidates.filter((c) => c.isWinner).length, 1);
  assert.equal(e.winner?.display, "Dadhiram Ray");
  for (const c of e.candidates) {
    assert.equal(c.votes, null, `${c.display} has a vote count in an election that published none`);
    assert.equal(c.share, null, `${c.display} has a share in an election that published none`);
    if (!c.isWinner) assert.equal(c.rank, null, `${c.display} has a finish order nobody published`);
  }
});

test("the elections before it have five counted candidates each, with votes and a share of the votes polled", live, () => {
  const rest = field("wb.ac.001").elections.slice(1);
  assert.deepEqual(rest.map((e) => e.year), [2021, 2016, 2011]);
  for (const e of rest) {
    assert.equal(e.evidence, "counted");
    assert.equal(e.candidates.length, 5);
    assert.ok(e.candidates.every((c) => c.votes !== null && c.share !== null && c.share > 0 && c.share < 100));
    assert.ok(Math.abs(e.candidates.reduce((n, c) => n + (c.share ?? 0), 0) - 100) < 6, `${e.year}: the shares are not nearly the votes polled`);
  }
});

test("a person is followed through the seat by person_id: Dadhiram Ray stood third in 2016 and second in 2021", live, () => {
  const w = field("wb.ac.001").elections[0]!.winner!;
  assert.deepEqual(w.elsewhere.map((e) => [e.year, e.rank, e.won]), [[2016, 3, false], [2021, 2, false]]);
});

test("records the registry has not joined are three people, and are reported as look-alikes, never as one", live, () => {
  const f = field("wb.ac.001");
  const l = f.lookAlikes.find((x) => x.name.startsWith("Adhikary Paresh"));
  assert.ok(l !== undefined, "no look-alike group for Adhikary Paresh");
  assert.equal(l.records.length, 3);
  assert.equal(new Set(l.records.map((r) => r.personId)).size, 3);
});

test("what a candidate declared is read with its year: assets, liabilities, cases, age, education, occupation and a sitting-member claim", live, () => {
  const e = field("wb.ac.001").elections[0]!;
  const w = e.winner!;
  assert.equal(w.assets, 6337495);
  assert.equal(w.cases, 16);
  assert.equal(w.age, 43);
  assert.equal(w.education, "12th Pass");
  assert.equal(e.candidates.find((c) => c.display === "Adhikary Paresh Chandra")?.sittingMember, true);
  assert.equal(e.declaredAsOf, "2026-04-25");
  assert.ok(field("wb.ac.001").elections[1]!.candidates.every((c) => c.assets === null), "a 2026 affidavit is shown against a 2021 election");
});

test("a seat whose election has an elected candidacy and no result row has a named candidate and no winner", live, () => {
  const e = field("wb.ac.152").elections[0]!;
  assert.equal(e.year, 2026);
  assert.equal(e.winner, null);
  assert.equal(e.namedAsElected?.display, "Debangshu Panda");
  assert.equal(e.evidence, "roster");
});

test("a winner who declared nothing has not-reported fields, never zero", live, () => {
  const w = field("wb.ac.112").elections[0]!.winner!;
  assert.equal(w.display, "Arjun Singh");
  for (const k of ["age", "education", "occupation", "assets", "cases"] as const) assert.equal(w[k], null, `${k} is filled for a candidate who declared nothing`);
});

test("a contest with nobody in it is evidence none; a Lok Sabha seat with one declared winner is declared", live, () => {
  assert.deepEqual(field("wb.ac.154").elections.map((e) => e.evidence), ["declared", "none", "none", "none"]);
  const b = field("wb.pc.10").elections;
  assert.equal(b.length, 1);
  assert.equal(b[0]!.evidence, "declared");
  assert.equal(b[0]!.candidates.length, 1);
});

test("a crowded field is all there: Bhangar 2026 has nineteen candidates", live, () => {
  assert.equal(field("wb.ac.158").elections[0]!.candidates.length, 19);
});

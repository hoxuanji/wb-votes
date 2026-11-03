// The time machine's frames, on literal landscapes: the rules the page must not break are held here and not left to a browser.

import assert from "node:assert/strict";
import test from "node:test";
import { NOT_HELD, fillFor } from "../viz/party-ink.ts";
import { LEVEL_FILL, frameSentence, framesOf } from "./landscape-frames.ts";
import type { Landscape, LandscapeState } from "./situation-types.ts";

const BJP = { key: "BJP", label: "BJP" };
const INC = { key: "INC", label: "INC" };

const held = (leader: typeof BJP | null, leaderSeats: number, seats: number, year: number): NonNullable<LandscapeState["held"]> => ({
  electionId: `e-${year}`,
  year,
  leader,
  leaderSeats,
  seats,
  majority: leader !== null && leaderSeats * 2 > seats,
});

const state = (id: string, name: string, h: LandscapeState["held"]): LandscapeState => ({ id, name, held: h });

const landscape = (): Landscape => ({
  years: [2016, 2021],
  first: 2016,
  last: 2021,
  parties: [BJP, INC],
  byYear: [
    {
      year: 2016,
      states: [state("ka", "Karnataka", held(INC, 120, 224, 2013)), state("wb", "West Bengal", null), state("gj", "Gujarat", held(null, 90, 182, 2012))],
      tally: [{ party: INC, states: 1 }],
      withResult: 2,
    },
    {
      year: 2021,
      states: [state("ka", "Karnataka", held(BJP, 104, 224, 2018)), state("wb", "West Bengal", held(INC, 211, 294, 2021)), state("gj", "Gujarat", held(BJP, 99, 182, 2017))],
      tally: [{ party: BJP, states: 2 }, { party: INC, states: 1 }],
      withResult: 3,
    },
  ],
});

test("a state with no election by the stop is the no-election ink and says so, and is never given a party's colour", () => {
  const f = framesOf(landscape())[0]!;
  assert.equal(f.fills["wb"], NOT_HELD);
  assert.match(f.titles["wb"]!, /no assembly election on record by 2016/);
  assert.notEqual(f.fills["wb"], fillFor("INC"));
});

test("a state level for most seats has no leader and is drawn level, never as a winner", () => {
  const f = framesOf(landscape())[0]!;
  assert.equal(f.fills["gj"], LEVEL_FILL);
  assert.match(f.titles["gj"]!, /no single leader/);
  assert.ok(!/BJP|INC/.test(f.titles["gj"]!), "no party is named for a state with no leader");
});

test("a state that has not voted since is dated by its own election, not by the stop", () => {
  const f = framesOf(landscape())[0]!;
  assert.match(f.titles["ka"]!, /INC 120 of 224 seats/);
  assert.match(f.titles["ka"]!, /elected 2013/, "the stop is 2016 and Karnataka's government at that stop came from 2013");
});

test("the tally and the counts come from the year, and the total is every jurisdiction there is", () => {
  const fs = framesOf(landscape());
  assert.deepEqual(fs.map((f) => [f.year, f.withResult, f.total]), [[2016, 2, 3], [2021, 3, 3]]);
  assert.deepEqual(fs[1]!.tally.map((t) => [t.label, t.states]), [["BJP", 2], ["INC", 1]]);
  assert.equal(fs[1]!.fills["wb"], fillFor("INC"));
});

test("the sentence for a stop uses only the frame's numbers and names no leader when two are level", () => {
  const fs = framesOf(landscape());
  assert.equal(frameSentence(fs[1]!), "2021: 3 states of 3 with a result; BJP leads 2 states.");
  const level = { ...fs[1]!, tally: [{ key: "BJP", label: "BJP", fill: "#000", states: 2 }, { key: "INC", label: "INC", fill: "#000", states: 2 }], withResult: 4, total: 4 };
  assert.match(frameSentence(level), /no party leads more than the others/);
  assert.ok(!/ leads 2 states\./.test(frameSentence(level)), "a tie is not worded as a lead");
  assert.match(frameSentence({ ...fs[0]!, tally: [], withResult: 0 }), /no state in the registry has an assembly election on record by this year/);
  for (const f of fs) assert.ok(!/\b(he|she|they|never|only|first time)\b/i.test(frameSentence(f)), "no pronoun, 'never', 'only' or 'first time'");
});

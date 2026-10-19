// Map selection: what a reader has narrowed a loaded map to, and the links that change it.
//
// Every rule is checked on literal seats with no database. The one claim that spans the module is the round trip at
// the bottom: every link it emits is read back by the same module as the selection the link meant, with nothing in
// `ignored`. A link no page can honour (the runner-up legend naming a party the view does not offer) fails it, which is
// how that defect is to be found, and a test below shows it doing so. The election page's own choices are tested the
// same way, on literals and on every election the registry holds, and so are the state page's and the front page's.

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { DEV_DB_PATH, openRead } from "../db/open.ts";
import { all } from "../db/index.ts";
import { MARGIN_BANDS, bandOf, binOf, choicesOf, electionChoices, electionMapView, stateChoicesOf } from "./election-map.ts";
import { layerChoices, leaderOf } from "./home.ts";
import { kindOfBody } from "./routes.ts";
import { stateView } from "./state-view.ts";
import { MODES, isMode, queryHref, readAsk, readSelection, tally } from "./map-selection.ts";
import type { Choices, Isolation, MapMode, MapSelection, Move, TalliedSeat, SeatFacts } from "./map-selection.ts";

/* ─────────────────────────────────── literals ─────────────────────────────────── */

type Seat = SeatFacts & TalliedSeat & { placeId: string };

const seat = (
  placeId: string,
  winner: string | null,
  runnerUp: string | null,
  marginPct: number | null,
  districtId: string | null,
): Seat => ({
  placeId,
  partyKey: winner,
  partyLabel: winner === null ? null : winner.toUpperCase(),
  runnerUpKey: runnerUp,
  runnerUpLabel: runnerUp === null ? null : runnerUp.toUpperCase(),
  marginPct,
  marginBin: binOf(marginPct),
  districtId,
});

const SEATS: Seat[] = [
  seat("p1", "BJP", "INC", 0.4, "d1"),
  seat("p2", "INC", "BJP", 3.1, "d1"),
  seat("p3", "INC", "TMC", 12, "d2"),
  seat("p4", "BJP", "TMC", 25, "d2"),
  seat("p5", null, null, null, "d2"),
  seat("p6", "BJP", null, 1.5, "d3"),
];

const BINS = Array.from({ length: 21 }, (_, i) => i * 2);

/** Everything a view can offer. */
const FULL: Choices = {
  parties: new Set(["BJP", "INC", "TMC"]),
  bands: MARGIN_BANDS,
  bins: BINS,
  districts: new Set(["d1", "d2", "d3"]),
  seats: new Set(SEATS.map((s) => s.placeId)),
  flips: true,
};
/** The election page: two-point bins, no districts, no seat focus. */
const ELECTION: Choices = { parties: FULL.parties, bins: BINS, flips: true };
/** The state page: five named bands, district and seat focus. */
const STATE: Choices = { ...FULL, bins: undefined };

const AT = { base: "/state/ka", anchor: "map" };

const HAVE_DB = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const live = { skip: HAVE_DB ? false : "no .data/registry.db — run npm run registry:ingest" };

const read = (query: string, choices: Choices = FULL): MapSelection =>
  readSelection(new URLSearchParams(query), choices, AT);

/** The query string of a link, which is what a page would be handed back. */
const queryOf = (href: string): string => href.replace(/#.*$/, "").split("?")[1] ?? "";
const follow = (href: string, choices: Choices = FULL): MapSelection => read(queryOf(href), choices);

/* ─────────────────────────────────── the modes ─────────────────────────────────── */

test("the modes are the four the map encodes, in the order the tabs show them", () => {
  assert.deepEqual(
    MODES.map((m) => m.key),
    ["winners", "flips", "margin", "runnerup"],
  );
  for (const m of MODES) assert.ok(isMode(m.key));
  for (const v of ["", "Winners", "runner-up", "bogus", undefined]) assert.equal(isMode(v), false, String(v));
});

/* ─────────────────────────────────── the ask ─────────────────────────────────── */

test("readAsk keeps the first value of each parameter, in order, and drops the empty ones", () => {
  const ask = readAsk({ layer: "loksabha", party: ["BJP", "INC"], band: "", bin: undefined, mode: ["", "flips"], utm: "x y" });
  assert.deepEqual([...ask], [
    ["layer", "loksabha"],
    ["party", "BJP"],
    ["utm", "x y"],
  ]);
  // The first value, even when it is empty: `?mode=&mode=flips` cleared the mode, it did not ask for flips.
  assert.equal(ask.has("mode"), false);
  assert.deepEqual([...readAsk(undefined)], []);
  assert.deepEqual([...readAsk({})], []);
});

test("readAsk reads a URLSearchParams the same way", () => {
  const ask = readAsk(new URLSearchParams("layer=loksabha&party=BJP&party=INC&band=&mode=&mode=flips"));
  assert.deepEqual([...ask], [
    ["layer", "loksabha"],
    ["party", "BJP"],
  ]);
});

test("queryHref carries the ask, drops what is cleared, keeps a changed parameter where it was and anchors", () => {
  const ask = readAsk({ layer: "loksabha", party: "BJP", utm: "1" });
  assert.equal(queryHref("/", ask, { layer: "turnout" }, "map"), "/?layer=turnout&party=BJP&utm=1#map");
  assert.equal(queryHref("/", ask, { party: "" }, "map"), "/?layer=loksabha&utm=1#map");
  assert.equal(queryHref("/", ask, { mode: "flips" }, "map"), "/?layer=loksabha&party=BJP&utm=1&mode=flips#map");
  // Nothing left is the bare base, and no anchor is no hash.
  assert.equal(queryHref("/", readAsk({ party: "BJP" }), { party: "" }, "map"), "/#map");
  assert.equal(queryHref("/election/ls-2024", readAsk({}), {}, ""), "/election/ls-2024");
  assert.equal(queryHref("/election/ls-2024", readAsk({ mode: "flips" })), "/election/ls-2024?mode=flips");
  // Values are encoded the way a URLSearchParams writes them.
  assert.equal(queryHref("/", readAsk({}), { party: "A&B C" }, "map"), "/?party=A%26B+C#map");
});

/* ──────────────────────────────── reading a selection ──────────────────────────────── */

test("nothing asked is the plain map", () => {
  const sel = read("");
  assert.equal(sel.mode, "winners");
  assert.equal(sel.isolation, null);
  assert.equal(sel.district, null);
  assert.equal(sel.seat, null);
  assert.deepEqual(sel.ignored, []);
  assert.equal(readSelection(undefined, FULL, AT).mode, "winners");
});

test("each dimension is honoured when the view offers it", () => {
  assert.equal(read("mode=margin").mode, "margin");
  assert.deepEqual(read("party=BJP").isolation, { by: "party", key: "BJP" });
  assert.deepEqual(read("band=1to2").isolation, { by: "band", key: "1to2" });
  assert.deepEqual(read("bin=4").isolation, { by: "bin", lo: 4 });
  assert.equal(read("district=d2").district, "d2");
  assert.equal(read("seat=p3").seat, "p3");
  const all = read("mode=runnerup&party=TMC&district=d2&seat=p4");
  assert.deepEqual([all.mode, all.isolation, all.district, all.seat, all.ignored], [
    "runnerup",
    { by: "party", key: "TMC" },
    "d2",
    "p4",
    [],
  ]);
  // Subject params and strangers are not the selection's business: they are not read, and not reported.
  assert.deepEqual(read("layer=turnout&election=ka-2023&house=ac&utm=1").ignored, []);
});

test("a value the view does not offer falls back and is reported", () => {
  for (const [query, name] of [
    ["mode=bogus", "mode"],
    ["party=NOTAPARTY", "party"],
    ["party=%27%20OR%201%3D1", "party"],
    ["band=bogus", "band"],
    ["bin=5", "bin"],
    ["bin=99", "bin"],
    ["district=zz", "district"],
    ["seat=zz", "seat"],
  ] as const) {
    const sel = read(query);
    assert.deepEqual(sel.ignored, [name], query);
    assert.equal(sel.mode, "winners", query);
    assert.equal(sel.isolation, null, query);
    assert.equal(sel.district, null, query);
    assert.equal(sel.seat, null, query);
  }
});

test("flips is a mode only where there is a previous election to flip against", () => {
  assert.equal(read("mode=flips").mode, "flips");
  for (const choices of [{ ...FULL, flips: false }, { ...FULL, flips: undefined }]) {
    const sel = read("mode=flips", choices);
    assert.equal(sel.mode, "winners");
    assert.deepEqual(sel.ignored, ["mode"]);
  }
  // Asking for the default is honoured, not ignored.
  assert.deepEqual(read("mode=winners").ignored, []);
});

test("a dimension the view does not offer is ignored, so each page keeps its own margin vocabulary", () => {
  assert.deepEqual(read("band=under1", ELECTION).ignored, ["band"]);
  assert.equal(read("band=under1", ELECTION).isolation, null);
  assert.deepEqual(read("bin=4", STATE).ignored, ["bin"]);
  assert.equal(read("bin=4", STATE).isolation, null);
  assert.deepEqual(read("district=d1&seat=p1", ELECTION).ignored, ["district", "seat"]);
  assert.deepEqual(read("party=BJP", { parties: new Set(["BJP"]) }).isolation, { by: "party", key: "BJP" });
});

/* ───────────────────────── one isolation, whatever the URL says ───────────────────────── */

test("at most one isolation is read, party before band before bin, and the others are reported", () => {
  const cases: [string, Isolation, string[]][] = [
    ["party=BJP&band=1to2&bin=4", { by: "party", key: "BJP" }, ["band", "bin"]],
    ["bin=4&band=1to2&party=BJP", { by: "party", key: "BJP" }, ["band", "bin"]],
    ["band=1to2&bin=4", { by: "band", key: "1to2" }, ["bin"]],
    ["party=BJP&bin=4", { by: "party", key: "BJP" }, ["bin"]],
    ["party=BJP&band=1to2", { by: "party", key: "BJP" }, ["band"]],
    // A party the view does not offer does not shadow a margin that it does.
    ["party=NOPE&bin=4", { by: "bin", lo: 4 }, ["party"]],
    ["party=NOPE&band=1to2", { by: "band", key: "1to2" }, ["party"]],
    ["party=NOPE&band=nope&bin=4", { by: "bin", lo: 4 }, ["party", "band"]],
    ["party=NOPE&band=nope&bin=5", null, ["party", "band", "bin"]],
  ];
  for (const [query, isolation, ignored] of cases) {
    const sel = read(query);
    assert.deepEqual(sel.isolation, isolation, query);
    assert.deepEqual(sel.ignored, ignored, query);
  }
});

test("the isolation is the same whatever order the parameters arrive in", () => {
  const permutations = <T>(xs: T[]): T[][] =>
    xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]));
  const orders = permutations(["party=TMC", "band=under1", "bin=2", "mode=margin", "district=d1"]);
  assert.equal(orders.length, 120);
  for (const order of orders) {
    const sel = read(order.join("&"));
    assert.deepEqual(sel.isolation, { by: "party", key: "TMC" }, order.join("&"));
    assert.deepEqual(sel.ignored, ["band", "bin"], order.join("&"));
  }
});

/* ───────────────────────────── a bin is a whole number ───────────────────────────── */

test("an empty or odd ?bin= is not bin 0", () => {
  // The election page read `Number(...)`, and `Number("")` is 0: a hand-edited `?bin=` isolated the 0 to 2 bin.
  assert.equal(read("bin=").isolation, null);
  assert.deepEqual(read("bin=").ignored, []);
  for (const odd of ["%20", "4.0", "+4", "-2", "04", "0x4", "1e1", "abc", "4%20", "NaN", "Infinity"]) {
    const sel = read(`bin=${odd}`);
    assert.equal(sel.isolation, null, odd);
    assert.deepEqual(sel.ignored, ["bin"], odd);
  }
  // 0 is a bin like any other.
  assert.deepEqual(read("bin=0").isolation, { by: "bin", lo: 0 });
  assert.deepEqual(read("bin=40").isolation, { by: "bin", lo: 40 });
});

/* ─────────────────────────────── which seats a selection covers ─────────────────────────────── */

const ids = (seats: readonly Seat[]): string[] => seats.map((s) => s.placeId);

test("with nothing selected every seat is covered", () => {
  const sel = read("");
  assert.deepEqual(ids(sel.narrow(SEATS)), ids(SEATS));
  assert.deepEqual(ids(sel.inDistrict(SEATS)), ids(SEATS));
});

test("a party isolates the seats it won, or on the runner-up tab the seats where it came second", () => {
  assert.deepEqual(ids(read("party=BJP").narrow(SEATS)), ["p1", "p4", "p6"]);
  assert.deepEqual(ids(read("party=BJP&mode=winners").narrow(SEATS)), ["p1", "p4", "p6"]);
  assert.deepEqual(ids(read("party=BJP&mode=margin").narrow(SEATS)), ["p1", "p4", "p6"]);
  assert.deepEqual(ids(read("party=BJP&mode=runnerup").narrow(SEATS)), ["p2"]);
  assert.deepEqual(ids(read("party=TMC&mode=runnerup").narrow(SEATS)), ["p3", "p4"]);
  // The same URL on the flips tab reads the winner, as the map always has.
  assert.deepEqual(ids(read("party=BJP&mode=flips").narrow(SEATS)), ["p1", "p4", "p6"]);
});

test("switching mode keeps the party, and the party then means the other side of the seat (D20)", () => {
  const winners = read("party=BJP&mode=winners");
  const there = follow(winners.href({ mode: "runnerup" }));
  assert.deepEqual(there.isolation, { by: "party", key: "BJP" });
  assert.equal(there.mode, "runnerup");
  assert.deepEqual(ids(there.narrow(SEATS)), ["p2"]);
  // And back: nothing was dropped on the way out, so nothing is missing on the way back.
  const back = follow(there.href({ mode: "winners" }));
  assert.deepEqual(ids(back.narrow(SEATS)), ["p1", "p4", "p6"]);
  // A margin isolation survives a mode change too.
  assert.deepEqual(follow(read("bin=0").href({ mode: "margin" })).isolation, { by: "bin", lo: 0 });
});

test("a band covers the seats whose margin lies in it, and a seat with no margin is in none", () => {
  assert.deepEqual(ids(read("band=under1").narrow(SEATS)), ["p1"]);
  assert.deepEqual(ids(read("band=1to2").narrow(SEATS)), ["p6"]);
  assert.deepEqual(ids(read("band=2to5").narrow(SEATS)), ["p2"]);
  assert.deepEqual(ids(read("band=5to10").narrow(SEATS)), []);
  assert.deepEqual(ids(read("band=over10").narrow(SEATS)), ["p3", "p4"]);
});

test("a bin covers the seats in it", () => {
  assert.deepEqual(ids(read("bin=0").narrow(SEATS)), ["p1", "p6"]);
  assert.deepEqual(ids(read("bin=2").narrow(SEATS)), ["p2"]);
  assert.deepEqual(ids(read("bin=12").narrow(SEATS)), ["p3"]);
  assert.deepEqual(ids(read("bin=24").narrow(SEATS)), ["p4"]);
  assert.deepEqual(ids(read("bin=40").narrow(SEATS)), []);
});

test("a district narrows first, then the isolation narrows within it", () => {
  assert.deepEqual(ids(read("district=d2").narrow(SEATS)), ["p3", "p4", "p5"]);
  assert.deepEqual(ids(read("district=d2").inDistrict(SEATS)), ["p3", "p4", "p5"]);
  assert.deepEqual(ids(read("district=d2&party=BJP").narrow(SEATS)), ["p4"]);
  // The district alone, for the figures that describe the district rather than the isolation inside it.
  assert.deepEqual(ids(read("district=d2&party=BJP").inDistrict(SEATS)), ["p3", "p4", "p5"]);
  assert.deepEqual(ids(read("district=d1&band=2to5").narrow(SEATS)), ["p2"]);
  assert.deepEqual(ids(read("district=d3&band=under1").narrow(SEATS)), []);
  // Narrowing never reorders or copies the seats it keeps.
  const kept = read("district=d2").narrow(SEATS);
  assert.equal(kept[0], SEATS[2]);
});

test("covers is what narrow keeps, seat by seat", () => {
  for (const query of ["", "party=INC", "party=TMC&mode=runnerup", "band=over10", "bin=0", "district=d2&band=over10", "district=d1"]) {
    const sel = read(query);
    assert.deepEqual(
      SEATS.filter((s) => sel.covers(s)),
      sel.narrow(SEATS),
      query,
    );
  }
});

test("the band and bin a seat falls in are the ones the election map computes", () => {
  // The selection judges a band from the table the view supplies, and a bin from the seat's own `marginBin`.
  // Both are checked against the election map's definitions over every margin it can produce, edges included.
  const margins: (number | null)[] = [null, -1, 0, 0.99, 1, 1.5, 1.99, 2, 4.99, 5, 9.99, 10, 39.99, 40, 41, 62.5];
  for (let m = 0; m <= 60; m += 0.25) margins.push(m);
  for (const m of margins) {
    const s = seat("x", "BJP", "INC", m, null);
    for (const b of MARGIN_BANDS) {
      assert.equal(read(`band=${b.key}`).covers(s), bandOf(m) === b.key, `${m} in ${b.key}`);
    }
    for (const lo of BINS) assert.equal(read(`bin=${lo}`).covers(s), s.marginBin === lo, `${m} in bin ${lo}`);
  }
});

/* ───────────────────────────────────── moves ───────────────────────────────────── */

test("an isolation move replaces the other isolations, and choosing it again releases it", () => {
  assert.equal(read("").href({ party: "BJP" }), "/state/ka?party=BJP#map");
  assert.equal(read("party=BJP").href({ party: "BJP" }), "/state/ka#map");
  assert.equal(read("party=BJP").href({ party: "INC" }), "/state/ka?party=INC#map");
  assert.equal(read("party=BJP").href({ band: "under1" }), "/state/ka?band=under1#map");
  assert.equal(read("band=under1").href({ bin: 4 }), "/state/ka?bin=4#map");
  assert.equal(read("bin=4").href({ bin: 4 }), "/state/ka#map");
  assert.equal(read("band=under1").href({ band: "under1" }), "/state/ka#map");
  // Whichever isolation the ask held, however it got there, the move leaves one param.
  assert.equal(read("party=BJP&band=under1&bin=4").href({ band: "2to5" }), "/state/ka?band=2to5#map");
});

test("release drops the isolation and clear drops the focus as well, and neither touches the mode", () => {
  assert.equal(read("mode=margin&party=BJP&district=d1&seat=p1").href("release"), "/state/ka?mode=margin&district=d1&seat=p1#map");
  assert.equal(read("mode=margin&party=BJP&district=d1&seat=p1").href("clear"), "/state/ka?mode=margin#map");
  assert.equal(read("band=1to2&party=BJP").href("release"), "/state/ka#map");
});

test("a mode move changes only the mode", () => {
  assert.equal(read("").href({ mode: "winners" }), "/state/ka?mode=winners#map");
  assert.equal(read("party=BJP&district=d1").href({ mode: "margin" }), "/state/ka?party=BJP&district=d1&mode=margin#map");
  assert.equal(read("mode=margin&party=BJP").href({ mode: "flips" }), "/state/ka?mode=flips&party=BJP#map");
});

test("a move that names a mode selects and never toggles", () => {
  // The flip matrix links to "this party, on the flips tab". It has no pressed state, so following it twice must
  // leave the party isolated rather than switch it off.
  const once = read("mode=flips&party=INC");
  assert.equal(once.href({ party: "INC" }, { mode: "flips" }), "/state/ka?mode=flips&party=INC#map");
  assert.equal(once.href({ party: "BJP" }, { mode: "flips" }), "/state/ka?mode=flips&party=BJP#map");
  assert.equal(read("party=INC").href({ party: "INC" }, { mode: "flips" }), "/state/ka?party=INC&mode=flips#map");
  // The competitiveness panel: a band, on the margin tab.
  assert.equal(read("").href({ band: "under1" }, { mode: "margin" }), "/state/ka?band=under1&mode=margin#map");
  // Without a mode in the move, the same party toggles.
  assert.equal(once.href({ party: "INC" }), "/state/ka?mode=flips#map");
});

test("a district move focuses it and drops the seat focus, and choosing it again drops both", () => {
  assert.equal(read("seat=p2").href({ district: "d1" }), "/state/ka?district=d1#map");
  assert.equal(read("district=d1&seat=p2").href({ district: "d1" }), "/state/ka#map");
  assert.equal(read("district=d1&seat=p2").href({ district: "d2" }), "/state/ka?district=d2#map");
  assert.equal(read("district=d1&party=BJP").href({ district: "d2" }), "/state/ka?district=d2&party=BJP#map");
});

test("a seat move outlines it, and choosing it again unoutlines it", () => {
  assert.equal(read("").href({ seat: "p3" }), "/state/ka?seat=p3#map");
  assert.equal(read("seat=p3").href({ seat: "p3" }), "/state/ka#map");
  assert.equal(read("seat=p3").href({ seat: "p4" }), "/state/ka?seat=p4#map");
});

test("an election move drops every selection and keeps the mode", () => {
  const sel = read("election=ka-2018&mode=margin&party=BJP&district=d1&seat=p1&house=ac");
  assert.equal(sel.href({ election: "ka-2023" }), "/state/ka?election=ka-2023&mode=margin&house=ac#map");
});

test("a link carries the ask as it came, not as it was understood", () => {
  // The page ignored this party, and a link to another layer still brings it: the layer may know it.
  const sel = read("layer=loksabha&party=NOTAPARTY&utm=1");
  assert.deepEqual(sel.ignored, ["party"]);
  assert.equal(sel.href({ mode: "margin" }), "/state/ka?layer=loksabha&party=NOTAPARTY&utm=1&mode=margin#map");
  assert.equal(sel.href({ seat: "p1" }), "/state/ka?layer=loksabha&party=NOTAPARTY&utm=1&seat=p1#map");
  // Strangers are carried through every kind of move, subject params included.
  const stranger = read("layer=turnout&house=lok-sabha&utm=a%26b");
  for (const move of ["release", "clear", { mode: "margin" }, { party: "BJP" }, { band: "under1" }, { bin: 2 }, { district: "d1" }, { seat: "p1" }] as Move[]) {
    const q = new URLSearchParams(queryOf(stranger.href(move)));
    assert.equal(q.get("layer"), "turnout");
    assert.equal(q.get("house"), "lok-sabha");
    assert.equal(q.get("utm"), "a&b");
  }
});

test("a link is anchored where it was told to be, and not at all if it was not told", () => {
  assert.equal(readSelection(undefined, FULL, { base: "/election/ls-2024", anchor: "map" }).href({ party: "BJP" }), "/election/ls-2024?party=BJP#map");
  assert.equal(readSelection(undefined, FULL, { base: "/election/ls-2024" }).href({ party: "BJP" }), "/election/ls-2024?party=BJP");
});

/* ─────────────────────────────── the round trip ─────────────────────────────── */

type State = { mode: MapMode; isolation: Isolation; district: string | null; seat: string | null };
const stateOf = (s: MapSelection): State => ({ mode: s.mode, isolation: s.isolation, district: s.district, seat: s.seat });

/** What a reader means by a move, restated without the module's help. */
function meant(from: State, moves: Move[]): State {
  const selects = moves.some((m) => typeof m === "object" && "mode" in m);
  const s = { ...from };
  const same = (a: Isolation, b: Isolation): boolean => JSON.stringify(a) === JSON.stringify(b);
  for (const m of moves) {
    if (m === "release") s.isolation = null;
    else if (m === "clear") Object.assign(s, { isolation: null, district: null, seat: null });
    else if ("mode" in m) s.mode = m.mode;
    else if ("party" in m || "band" in m || "bin" in m) {
      const to: Isolation = "party" in m ? { by: "party", key: m.party } : "band" in m ? { by: "band", key: m.band } : { by: "bin", lo: m.bin };
      s.isolation = !selects && same(s.isolation, to) ? null : to;
    } else if ("district" in m) {
      s.district = !selects && s.district === m.district ? null : m.district;
      s.seat = null;
    } else if ("seat" in m) s.seat = !selects && s.seat === m.seat ? null : m.seat;
    else Object.assign(s, { isolation: null, district: null, seat: null });
  }
  return s;
}

/** Every move a reader of this view could be offered a link for. */
function offered(choices: Choices): Move[] {
  return [
    "release",
    "clear",
    ...MODES.filter((m) => m.key !== "flips" || choices.flips === true).map((m): Move => ({ mode: m.key })),
    ...[...choices.parties].map((party): Move => ({ party })),
    ...(choices.bands ?? []).map((b): Move => ({ band: b.key })),
    ...(choices.bins ?? []).map((bin): Move => ({ bin })),
    ...[...(choices.districts ?? [])].map((district): Move => ({ district })),
    ...[...(choices.seats ?? [])].map((seat): Move => ({ seat })),
    { election: "ka-assembly-2018" },
  ];
}

/** The clean URLs a reader could be standing on: every mode, every isolation, a focus or none. */
function starts(choices: Choices): string[] {
  const modes = ["", "mode=margin", "mode=runnerup", ...(choices.flips === true ? ["mode=flips"] : [])];
  const isolations = [
    "",
    "party=BJP",
    ...(choices.bands === undefined ? [] : ["band=under1"]),
    ...(choices.bins === undefined ? [] : ["bin=4"]),
  ];
  const districts = choices.districts === undefined ? [""] : ["", "district=d1"];
  const seats = choices.seats === undefined ? [""] : ["", "seat=p2"];
  const out: string[] = [];
  for (const m of modes) for (const i of isolations) for (const d of districts) for (const s of seats) {
    out.push([m, i, d, s].filter((x) => x !== "").join("&"));
  }
  return out;
}

/** The links of `moves` from `sel` that lead somewhere the module will not honour. */
function dead(sel: MapSelection, moves: Move[], choices: Choices): string[] {
  return moves.map((m) => sel.href(m)).filter((href) => follow(href, choices).ignored.length > 0);
}

test("every link the module emits is read back as the selection it meant, with nothing ignored", () => {
  let links = 0;
  for (const [name, choices] of [["full", FULL], ["election", ELECTION], ["state", STATE], ["party-only", { parties: FULL.parties }]] as const) {
    // One move at a time, and the flip matrix's two together: this party, on the flips tab.
    const sequences: Move[][] = [
      ...offered(choices).map((m): Move[] => [m]),
      ...(choices.flips === true ? [...choices.parties].map((party): Move[] => [{ party }, { mode: "flips" }]) : []),
    ];
    for (const query of starts(choices)) {
      const here = read(query, choices);
      assert.deepEqual(here.ignored, [], `${name}: ${query} is a clean start`);
      for (const moves of sequences) {
        const href = here.href(...moves);
        const there = follow(href, choices);
        const what = `${name}: ${query} + ${JSON.stringify(moves)} -> ${href}`;
        assert.deepEqual(there.ignored, [], what);
        assert.deepEqual(stateOf(there), meant(stateOf(here), moves), what);
        // And never two isolations in one link.
        const q = new URLSearchParams(queryOf(href));
        assert.ok(["party", "band", "bin"].filter((k) => q.has(k)).length <= 1, what);
        links += 1;
      }
    }
  }
  assert.ok(links > 3000, `only ${links} links were checked`);
});

test("the election move is read back with its election, and the rest of the ask intact", () => {
  for (const query of starts(FULL)) {
    const href = read(`${query}&election=ka-2018&house=ac`).href({ election: "ka-2023" });
    const q = new URLSearchParams(queryOf(href));
    assert.equal(q.get("election"), "ka-2023");
    assert.equal(q.get("house"), "ac");
    assert.equal(follow(href).isolation, null);
    assert.equal(follow(href).district, null);
    assert.equal(follow(href).seat, null);
    assert.equal(follow(href).mode, read(query).mode);
  }
});

test("the round trip finds a legend link that no selection can honour", () => {
  // The runner-up legend offers the parties that came second. A party that only ever came second is in no winners'
  // legend and in no vote-to-seat row, and if the view offers only those, its legend link led nowhere.
  const legend = tally(SEATS, "runnerUp");
  assert.deepEqual(legend.map((l) => l.key), ["TMC", "BJP", "INC"]);
  const wrong: Choices = { ...ELECTION, parties: new Set(tally(SEATS, "winner").map((l) => l.key)) };
  const sel = readSelection(new URLSearchParams("mode=runnerup"), wrong, AT);
  const moves = legend.map((l): Move => ({ party: l.key }));
  assert.equal(dead(sel, moves, wrong).length, 1, "the link for TMC is dead");
  assert.match(dead(sel, moves, wrong)[0] as string, /party=TMC/);
  // Offer every party the legend can print, and every one of its links lands.
  const right: Choices = { ...ELECTION, parties: new Set([...wrong.parties, ...legend.map((l) => l.key)]) };
  assert.deepEqual(dead(readSelection(new URLSearchParams("mode=runnerup"), right, AT), moves, right), []);
});

/* ───────────────────────────── the election page's choices ───────────────────────────── */

/** An election as the page holds it, to the extent the page's choices and links read it. */
type PageView = {
  legend: readonly { key: string }[];
  voteSeat: readonly { party: { key: string } }[];
  seats: readonly Seat[];
  marginBins: readonly { lo: number }[];
  flips: unknown;
};

/** The seats above, their winners' legend, and a plot of the same two. */
const view = (over: Partial<PageView> = {}): PageView => ({
  legend: tally(SEATS, "winner"),
  voteSeat: tally(SEATS, "winner").map((l) => ({ party: { key: l.key } })),
  seats: SEATS,
  marginBins: BINS.map((lo) => ({ lo })),
  flips: { held: 2 },
  ...over,
});

test("an election offers the parties that won, that are in its vote-to-seat plot, and that came second", () => {
  const choices = choicesOf(
    view({
      legend: [{ key: "BJP" }],
      voteSeat: [{ party: { key: "BJP" } }, { party: { key: "INC" } }],
      seats: [seat("a", "BJP", "TMC", 3, null), seat("b", "BJP", null, 3, null)],
    }),
  );
  assert.deepEqual([...choices.parties].sort(), ["BJP", "INC", "TMC"]);
});

test("an election offers every margin bin the distribution holds, flips only with a comparison, and no state-page dimension", () => {
  const choices = choicesOf(view());
  assert.deepEqual(choices.bins, BINS);
  assert.equal(choices.flips, true);
  assert.equal(choicesOf(view({ flips: null })).flips, false);
  assert.equal(choices.bands, undefined);
  assert.equal(choices.districts, undefined);
  assert.equal(choices.seats, undefined);
  // A bin the distribution does not hold is not one, whatever the number.
  const short = choicesOf(view({ marginBins: [{ lo: 0 }, { lo: 2 }] }));
  assert.deepEqual(short.bins, [0, 2]);
  assert.equal(read("bin=4", short).isolation, null);
});

/** Every move the election page writes a link for, restated from the page rather than taken from the module. */
function electionPageMoves(v: PageView): Move[][] {
  return [
    ...MODES.filter((m) => m.key !== "flips" || v.flips !== null).map((m): Move[] => [{ mode: m.key }]),
    ...v.legend.map((l): Move[] => [{ party: l.key }]),
    ...tally(v.seats, "runnerUp").map((l): Move[] => [{ party: l.key }]),
    ...v.voteSeat.map((r): Move[] => [{ party: r.party.key }]),
    ...v.marginBins.map((b): Move[] => [{ bin: b.lo }]),
    ["release"],
    ...(v.flips === null ? [] : [...choicesOf(v).parties].map((party): Move[] => [{ party }, { mode: "flips" }])),
  ];
}

test("every link the election page writes lands on a selection that honours it", () => {
  for (const flips of [{ held: 2 }, null]) {
    const v = view({ flips });
    const choices = choicesOf(v);
    let links = 0;
    for (const query of ["", "mode=margin", "mode=runnerup", "party=BJP", "party=TMC&mode=runnerup", "bin=4", "bin=4&mode=margin"]) {
      const here = read(query, choices);
      assert.deepEqual(here.ignored, [], query);
      for (const moves of electionPageMoves(v)) {
        const there = follow(here.href(...moves), choices);
        assert.deepEqual(there.ignored, [], `${query} + ${JSON.stringify(moves)} -> ${here.href(...moves)}`);
        links += 1;
      }
    }
    assert.ok(links > 100, `only ${links} links were checked`);
  }
});

test("the runner-up legend link of a party that only came second is dead without the runner-up parties, and lives with them", () => {
  const v = view();
  const winnersOnly: Choices = { ...choicesOf(v), parties: new Set(tally(SEATS, "winner").map((l) => l.key)) };
  const sel = read("mode=runnerup", winnersOnly);
  assert.match(sel.href({ party: "TMC" }), /party=TMC/);
  assert.deepEqual(follow(sel.href({ party: "TMC" }), winnersOnly).ignored, ["party"], "TMC is only a runner-up");
  const right = choicesOf(v);
  assert.deepEqual(follow(read("mode=runnerup", right).href({ party: "TMC" }), right).ignored, []);
  assert.deepEqual(follow(sel.href({ party: "TMC" }), right).isolation, { by: "party", key: "TMC" });
});

test("every link the election page writes, for every election in the registry, lands on a selection that honours it", live, () => {
  const d = openRead();
  try {
    const elections = electionChoices(d, 1000);
    assert.ok(elections.length > 0, "the registry holds no election");
    let links = 0;
    for (const e of elections) {
      const v = electionMapView(d, e.id);
      const choices = choicesOf(v);
      // A reader may be standing on either reading, and the runner-up legend is where a dead link was found.
      for (const query of ["", "mode=runnerup"]) {
        const here = readSelection(new URLSearchParams(query), choices, { base: `/election/${e.id}`, anchor: "map" });
        for (const moves of electionPageMoves(v)) {
          const there = readSelection(new URLSearchParams(queryOf(here.href(...moves))), choices, AT);
          assert.deepEqual(there.ignored, [], `${e.id}: ${query} + ${JSON.stringify(moves)}`);
          links += 1;
        }
      }
    }
    assert.ok(links > elections.length * 10, `only ${links} links were checked over ${elections.length} elections`);
  } finally {
    d.close();
  }
});

/* ───────────────────────────── the state page's choices ───────────────────────────── */

type StateLit = Parameters<typeof stateChoicesOf>[0];

/** A state's election as the page holds it: the seats above, their winners' legend, and a plot of the same two. */
const stateLit = (over: Partial<StateLit> = {}): StateLit => ({
  legend: tally(SEATS, "winner"),
  voteSeat: tally(SEATS, "winner").map((l) => ({ party: { key: l.key } })),
  seats: SEATS,
  flips: { held: 2 },
  ...over,
});

test("a state offers the parties an election does, the five named bands, its districts and its seats, and no bins", () => {
  const choices = stateChoicesOf(stateLit());
  assert.deepEqual([...choices.parties].sort(), ["BJP", "INC", "TMC"], "TMC only ever came second");
  assert.deepEqual([...choices.parties].sort(), [...choicesOf(view()).parties].sort(), "the same parties as the election page");
  assert.equal(choices.bands, MARGIN_BANDS);
  assert.equal(choices.bins, undefined);
  assert.deepEqual([...(choices.districts ?? [])].sort(), ["d1", "d2", "d3"]);
  assert.deepEqual([...(choices.seats ?? [])].sort(), SEATS.map((s) => s.placeId));
  assert.equal(choices.flips, true);
  assert.equal(stateChoicesOf(stateLit({ flips: null })).flips, false);
  // A seat in no district does not make one.
  const loose = stateChoicesOf(stateLit({ seats: [seat("a", "BJP", null, 3, null)] }));
  assert.deepEqual([...(loose.districts ?? [])], []);
  // And each page keeps its own margin vocabulary: a bin is not a band, and a band is not a bin.
  assert.deepEqual(read("band=under1&bin=4", choices).isolation, { by: "band", key: "under1" });
  assert.deepEqual(read("band=under1&bin=4", choices).ignored, ["bin"]);
  assert.deepEqual(read("bin=4", choices).ignored, ["bin"]);
});

/** Every move the state page writes a link for, restated from the page rather than taken from the module. */
function statePageMoves(v: StateLit): Move[][] {
  const seats = v.seats as readonly Seat[];
  const districts = [...new Set(seats.map((s) => s.districtId).filter((d): d is string => d !== null))];
  return [
    ...MODES.filter((m) => m.key !== "flips" || v.flips !== null).map((m): Move[] => [{ mode: m.key }]),
    ...tally(seats, "winner").map((l): Move[] => [{ party: l.key }]),
    ...tally(seats, "runnerUp").map((l): Move[] => [{ party: l.key }]),
    ...v.voteSeat.map((r): Move[] => [{ party: r.party.key }]),
    ...MARGIN_BANDS.map((b): Move[] => [{ band: b.key }]),
    ...MARGIN_BANDS.map((b): Move[] => [{ band: b.key }, { mode: "margin" }]),
    ["release"],
    ["release", { mode: "margin" }],
    ["clear"],
    ...districts.map((district): Move[] => [{ district }]),
    ...seats.map((s): Move[] => [{ seat: s.placeId }]),
    ...(v.flips === null ? [] : [...stateChoicesOf(v).parties].map((party): Move[] => [{ party }, { mode: "flips" }])),
    [{ election: "ka-assembly-2018" }],
  ];
}

const STATE_STARTS = [
  "",
  "mode=margin",
  "mode=runnerup",
  "party=BJP",
  "party=TMC&mode=runnerup",
  "band=under1&mode=margin",
  "district=d1",
  "district=d2&band=over10",
  "district=d1&seat=p2&party=INC",
  "mode=flips&party=BJP&district=d3",
];

test("every link the state page writes lands on a selection that honours it", () => {
  for (const flips of [{ held: 2 }, null]) {
    const v = stateLit({ flips });
    const choices = stateChoicesOf(v);
    let links = 0;
    for (const query of STATE_STARTS.filter((q) => flips !== null || !q.includes("flips"))) {
      const here = read(query, choices);
      assert.deepEqual(here.ignored, [], query);
      for (const moves of statePageMoves(v)) {
        const href = here.href(...moves);
        const there = follow(href, choices);
        assert.deepEqual(there.ignored, [], `${query} + ${JSON.stringify(moves)} -> ${href}`);
        assert.deepEqual(stateOf(there), meant(stateOf(here), moves), `${query} + ${JSON.stringify(moves)} -> ${href}`);
        links += 1;
      }
    }
    assert.ok(links > 200, `only ${links} links were checked`);
  }
});

test("the runner-up legend link of a party that only came second is dead on the state page without the runner-up parties", () => {
  // What the state page validated a party against before it read a selection: the winners' legend and the plot.
  const v = stateLit();
  const before: Choices = {
    ...stateChoicesOf(v),
    parties: new Set([...v.legend.map((l) => l.key), ...v.voteSeat.map((r) => r.party.key)]),
  };
  const sel = read("mode=runnerup", before);
  const moves = tally(SEATS, "runnerUp").map((l): Move => ({ party: l.key }));
  assert.equal(dead(sel, moves, before).length, 1);
  assert.match(dead(sel, moves, before)[0] as string, /party=TMC/);
  const now = stateChoicesOf(v);
  assert.deepEqual(dead(read("mode=runnerup", now), moves, now), []);
});

test("the seats a band link promises are the seats the competitiveness bar counts, inside any district", () => {
  // The bar counts the district's seats by band, and each of its links selects those same seats on the map.
  const choices = stateChoicesOf(stateLit());
  for (const district of ["", "d1", "d2", "d3"]) {
    const sel = read(district === "" ? "" : `district=${district}`, choices);
    let selected = 0;
    for (const b of MARGIN_BANDS) {
      const inBand = follow(sel.href({ band: b.key }), choices).narrow(SEATS);
      assert.deepEqual(
        ids(inBand),
        ids(sel.inDistrict(SEATS).filter((s) => bandOf(s.marginPct) === b.key)),
        `${district || "the state"}: ${b.key}`,
      );
      selected += inBand.length;
    }
    const withMargin = sel.inDistrict(SEATS).filter((s) => s.marginPct !== null).length;
    assert.equal(selected, withMargin, `${district || "the state"}: every seat with a margin is in exactly one band`);
  }
});

test("every link the state page writes, for every state's every election in the registry, lands on a selection that honours it", live, () => {
  const d = openRead();
  try {
    const states = all<{ id: string }>(d, `SELECT id FROM place WHERE kind IN ('state', 'ut') ORDER BY id`);
    let pages = 0;
    let links = 0;
    for (const j of states) {
      const first = stateView(d, j.id);
      if (first.kind !== "ready") continue;
      for (const house of first.houses) {
        const opened = stateView(d, j.id, { house: kindOfBody(house) });
        if (opened.kind !== "ready") continue;
        for (const c of opened.choices) {
          const s = stateView(d, j.id, { house: kindOfBody(house), election: c.id });
          if (s.kind !== "ready") continue;
          const choices = stateChoicesOf(s.map);
          // A reader may be standing on either reading, and the runner-up legend is where a dead link was found.
          for (const query of ["", "mode=runnerup"]) {
            const here = readSelection(new URLSearchParams(query), choices, { base: `/state/${j.id}`, anchor: "map" });
            for (const moves of statePageMoves(s.map)) {
              const there = readSelection(new URLSearchParams(queryOf(here.href(...moves))), choices, AT);
              assert.deepEqual(there.ignored, [], `${j.id} ${c.id}: ${query} + ${JSON.stringify(moves)}`);
              links += 1;
            }
          }
          pages += 1;
        }
      }
    }
    assert.ok(pages > 0, "no state page was checked");
    assert.ok(links > pages * 10, `only ${links} links were checked over ${pages} state pages`);
  } finally {
    d.close();
  }
});

/* ───────────────────────────── the front page's choices ───────────────────────────── */

/** A layer as the front page holds it: a legend, and a leader for each state. */
const layer = (leaders: (string | null)[], legend: (string | null)[] = [...new Set(leaders)]) => ({
  cells: leaders.map((partyKey, i) => ({ partyKey, jurisdictionId: `j${i}` })),
  legend: legend.map((key) => ({ key })),
});

test("a layer offers the parties its legend names, and a magnitude layer none", () => {
  assert.deepEqual([...layerChoices(layer(["BJP", "INC", "BJP", null])).parties].sort(), ["BJP", "INC"]);
  // A turnout band is not a party: nothing on a sequential layer can be isolated.
  assert.deepEqual([...layerChoices(layer([null, null], [null])).parties], []);
  assert.deepEqual([...layerChoices(layer([])).parties], []);
  // And a party is all it offers: every other dimension of the selection is set aside.
  const sel = read("party=BJP&band=under1&bin=4&district=d1&seat=p1", layerChoices(layer(["BJP"])));
  assert.deepEqual(sel.isolation, { by: "party", key: "BJP" });
  assert.deepEqual(sel.ignored, ["band", "bin", "district", "seat"]);
});

test("the front page mutes the states the selection does not cover, whatever mode the link names", () => {
  const l = layer(["BJP", "INC", null, "BJP", "TMC"]);
  const choices = layerChoices(l);
  for (const mode of ["", "mode=winners", "mode=runnerup", "mode=margin", "mode=flips", "mode=bogus"]) {
    for (const party of ["", "BJP", "INC", "TMC", "NOPE"]) {
      const sel = read([party === "" ? "" : `party=${party}`, mode].filter((q) => q !== "").join("&"), choices);
      const isolated = choices.parties.has(party) ? party : null;
      // The page's old rule, restated: a state is muted when a party is isolated and the state is not that party's.
      const expected = l.cells.filter((c) => isolated !== null && c.partyKey !== isolated).map((c) => c.jurisdictionId);
      assert.deepEqual(
        l.cells.filter((c) => !sel.covers(leaderOf(c))).map((c) => c.jurisdictionId),
        expected,
        `${party} ${mode}`,
      );
    }
  }
});

test("every link the front page writes for a party lands on a selection that honours it", () => {
  const choices = layerChoices(layer(["BJP", "INC", null, "BJP", "TMC"]));
  const at = { base: "/", anchor: "map" };
  for (const query of ["", "party=BJP", "party=TMC&mode=runnerup", "layer=loksabha&party=INC&utm=1"]) {
    const here = readSelection(new URLSearchParams(query), choices, at);
    assert.deepEqual(here.ignored, [], query);
    for (const move of [...choices.parties].map((party): Move => ({ party })).concat(["release"])) {
      const href = here.href(move);
      const there = readSelection(new URLSearchParams(queryOf(href)), choices, at);
      assert.deepEqual(there.ignored, [], `${query} + ${JSON.stringify(move)} -> ${href}`);
      // The subject params and strangers come along: a link to another layer needs the reader's raw party.
      for (const k of ["layer", "utm"]) {
        assert.equal(new URLSearchParams(queryOf(href)).get(k), new URLSearchParams(query).get(k), `${k}: ${href}`);
      }
    }
  }
  // The legend toggles: choosing the isolated party again is the way back to every party.
  assert.equal(readSelection(new URLSearchParams("party=BJP"), choices, at).href({ party: "BJP" }), "/#map");
  assert.equal(readSelection(new URLSearchParams("party=BJP"), choices, at).href("release"), "/#map");
});

/* ───────────────────────────── whatever the URL says ───────────────────────────── */

/** A small deterministic generator, so a failure names the ask that caused it. */
function prng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The selection written as the clean query it would have arrived as. */
function canon(sel: MapSelection): string {
  const q = new URLSearchParams();
  if (sel.mode !== "winners") q.set("mode", sel.mode);
  if (sel.isolation !== null) q.set(sel.isolation.by, sel.isolation.by === "bin" ? String(sel.isolation.lo) : sel.isolation.key);
  if (sel.district !== null) q.set("district", sel.district);
  if (sel.seat !== null) q.set("seat", sel.seat);
  return q.toString();
}

test("any ask is read without throwing, accounts for every selection param, and is stable once cleaned", () => {
  const next = prng(20261017);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)] as T;
  const vocabulary: Record<string, string[]> = {
    mode: ["winners", "flips", "margin", "runnerup", "bogus", ""],
    party: ["BJP", "INC", "TMC", "NOPE", "", "bjp", "'; DROP TABLE x;--"],
    band: ["under1", "1to2", "2to5", "5to10", "over10", "nope", ""],
    bin: ["0", "2", "4", "40", "5", "-2", "4.0", "", " ", "abc"],
    district: ["d1", "d2", "d3", "zz", ""],
    seat: ["p1", "p3", "p6", "zz", ""],
    layer: ["loksabha", "turnout"],
    election: ["ka-2018"],
    utm: ["1"],
  };
  const names = ["mode", "party", "band", "bin", "district", "seat"] as const;
  for (let i = 0; i < 4000; i += 1) {
    const choices = pick([FULL, ELECTION, STATE, { ...FULL, flips: false }, { parties: FULL.parties }]);
    const q = new URLSearchParams();
    for (const k of Object.keys(vocabulary)) if (next() < 0.45) q.append(k, pick(vocabulary[k] as string[]));
    const label = `${q.toString()} (${i})`;
    const sel = readSelection(q, choices, AT);
    const ask = readAsk(q);

    // Reported in the documented order, once each, and only for params that were asked.
    assert.deepEqual(sel.ignored, names.filter((n) => sel.ignored.includes(n)), label);
    assert.equal(new Set(sel.ignored).size, sel.ignored.length, label);
    for (const n of sel.ignored) assert.ok(ask.has(n), `${n} reported but not asked: ${label}`);

    // Every selection param that was asked is honoured or ignored, never both and never neither.
    const honoured: Record<(typeof names)[number], boolean> = {
      mode: ask.has("mode") && sel.mode === ask.get("mode"),
      party: sel.isolation?.by === "party",
      band: sel.isolation?.by === "band",
      bin: sel.isolation?.by === "bin",
      district: sel.district !== null,
      seat: sel.seat !== null,
    };
    for (const n of names) assert.equal(ask.has(n), honoured[n] !== sel.ignored.includes(n), `${n}: ${label}`);

    // Cleaned, it reads back the same, with nothing to report.
    const again = readSelection(new URLSearchParams(canon(sel)), choices, AT);
    assert.deepEqual(stateOf(again), stateOf(sel), label);
    assert.deepEqual(again.ignored, [], label);

    // And what it covers is a subset of the seats, with the district's seats inside the district.
    assert.ok(sel.narrow(SEATS).every((s) => sel.inDistrict(SEATS).includes(s)), label);
  }
});

/* ───────────────────────────────────── the tally ───────────────────────────────────── */

test("a tally counts seats by winner, biggest first, then by key; an undeclared seat is nobody's", () => {
  assert.deepEqual(tally(SEATS, "winner"), [
    { key: "BJP", label: "BJP", n: 3 },
    { key: "INC", label: "INC", n: 2 },
  ]);
  const tied = [seat("a", "ZZ", null, 1, null), seat("b", "AA", null, 1, null), seat("c", "MM", null, 1, null)];
  assert.deepEqual(tally(tied, "winner").map((l) => l.key), ["AA", "MM", "ZZ"]);
  assert.deepEqual(tally([], "winner"), []);
  assert.deepEqual(tally([seat("a", null, null, null, null)], "winner"), []);
});

test("a tally counts seats by runner-up the same way", () => {
  assert.deepEqual(tally(SEATS, "runnerUp"), [
    { key: "TMC", label: "TMC", n: 2 },
    { key: "BJP", label: "BJP", n: 1 },
    { key: "INC", label: "INC", n: 1 },
  ]);
});

test("a tally labels a party by the seat's label, and by its key when the seat has none", () => {
  const unlabelled: TalliedSeat[] = [{ partyKey: "k1", partyLabel: null, runnerUpKey: "k2", runnerUpLabel: "Second" }];
  assert.deepEqual(tally(unlabelled, "winner"), [{ key: "k1", label: "k1", n: 1 }]);
  assert.deepEqual(tally(unlabelled, "runnerUp"), [{ key: "k2", label: "Second", n: 1 }]);
});

test("a tally over the narrowed seats is the legend of the selection", () => {
  const sel = read("district=d2");
  assert.deepEqual(tally(sel.inDistrict(SEATS), "winner"), [
    { key: "BJP", label: "BJP", n: 1 },
    { key: "INC", label: "INC", n: 1 },
  ]);
});

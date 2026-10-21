// Map selection: what a reader has narrowed a loaded map to, read out of the URL and written back into links.
// Pure: a search and the values a loaded view offers in, one selection out, so every rule below is tested on literals.
//
// WHY THIS EXISTS. The election page, the state page and the front page each parsed the same kind of URL by hand, and
// each wrote the rules out again:
//
//  · `first` (a search value that may be an array) was defined five times, and the "this page's link with one
//    parameter changed" builder three times.
//  · A party or a margin band was validated by membership in several places that disagreed about the set: the front
//    page used its layer's legend, the election and state pages the legend plus the vote-to-seat rows, and the runner-up
//    legend was offered keys that set did not hold (the seed registry's 2011 and 2016 West Bengal elections each have
//    one), so those links led nowhere.
//  · "At most one isolation" was kept true by every call site writing `{ party, band: "" }` in its link, and the order
//    in which the isolations win was written three times (the map's mute, the election page's list, the state page's
//    subset), each of which had to agree with the other two.
//  · The election page read a margin bin with `Number(...)`, and `Number("")` is 0, so `?bin=` selected the 0 to 2 bin.
//
// TWO STAGES, KEPT APART. SUBJECT params (layer, election, house) choose the data before any view exists, and the
// loaders validate them; a layer cannot be checked by something that needs the view the layer selects. SELECTION params
// (mode, party, band, bin, district, seat) narrow a view that is already loaded, and `Choices` is what that view says it
// can be narrowed to. This module reads only the second kind. It carries the first untouched, because a link to another
// layer has to bring the reader's raw party with it: whether the party means anything is the destination's to judge.
//
// ONE ISOLATION, BY CONSTRUCTION. A party, a margin band and a margin bin are three ways to answer one question, so the
// parse yields a single `Isolation` and nothing downstream can apply two. The pages differ in their margin vocabulary
// (the election page has two-point bins, the state page five named bands) and both survive as variants. A param that
// was asked and not honoured is named in `ignored`, always, though no page shows it yet.
//
// Imports nothing from `src/`, no React and no database (ADR 0002). It sits in the package, not beside the pages,
// because `npm test` runs only the package's tests.

/* ─────────────────────────────── the modes ─────────────────────────────── */

export type MapMode = "winners" | "flips" | "margin" | "runnerup";

export const MODES: readonly { key: MapMode; label: string; question: string }[] = [
  { key: "winners", label: "Winners", question: "Which party won each seat?" },
  { key: "flips", label: "Flips", question: "Where did power change hands?" },
  { key: "margin", label: "Margin", question: "How close was each seat?" },
  { key: "runnerup", label: "Runner-up", question: "Who came second, and where?" },
];

export function isMode(v: string | undefined): v is MapMode {
  return MODES.some((m) => m.key === v);
}

/* ───────────────────────────── the ask, and links ───────────────────────────── */

/** What a page is handed: Next's `searchParams`, whose value is an array when a parameter repeats. */
export type Search = Readonly<Record<string, string | string[] | undefined>> | URLSearchParams | undefined;

/**
 * The normalised search: the first value of each parameter, in the order it arrived, with the empty ones gone. An
 * empty value is a parameter that was cleared, and a page that kept it would read "nothing" as "the empty string".
 */
export type Ask = ReadonlyMap<string, string>;

export function readAsk(search: Search): Ask {
  const ask = new Map<string, string>();
  if (search === undefined) return ask;
  const given: [string, string | undefined][] =
    search instanceof URLSearchParams
      ? [...new Set(search.keys())].map((k) => [k, search.get(k) ?? undefined])
      : Object.entries(search).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]);
  for (const [k, one] of given) if (one !== undefined && one !== "") ask.set(k, one);
  return ask;
}

/**
 * A link to `base` with the ask carried and `change` applied. An empty value drops the parameter, so "show every
 * party" is the URL a reader would have arrived at rather than a longer one meaning the same thing. A parameter this
 * does not know is carried, and a changed one keeps its place. `anchor` is written without its `#`.
 */
export function queryHref(
  base: string,
  ask: Ask,
  change: Readonly<Record<string, string>> = {},
  anchor = "",
): string {
  const q = new Map(ask);
  for (const [k, v] of Object.entries(change)) {
    if (v === "") q.delete(k);
    else q.set(k, v);
  }
  const s = new URLSearchParams([...q]).toString();
  return `${base}${s === "" ? "" : `?${s}`}${anchor === "" ? "" : `#${anchor}`}`;
}

/* ─────────────────────────────── the selection ─────────────────────────────── */

/** What a selection needs of a seat. An `ElectionSeat` is one. */
export type SeatFacts = {
  partyKey: string | null;
  runnerUpKey: string | null;
  marginPct: number | null;
  marginBin: number | null;
  districtId: string | null;
};

/** A named range of margin over votes polled, `lo` up to but not including `hi`; a null `hi` has no top. */
export type Band = { key: string; lo: number; hi: number | null };

/**
 * The values a loaded view makes selectable: the boundary between what exists and what was asked. A dimension the
 * view does not offer is left out, and a param naming it is ignored. `bands` carries the edges because a band is
 * judged from a seat's margin, and the table is the view's to supply (the state page's `MARGIN_BANDS` is one).
 */
export type Choices = {
  parties: ReadonlySet<string>;
  bands?: readonly Band[];
  /** The `lo` of each two-point bin the distribution has. */
  bins?: readonly number[];
  districts?: ReadonlySet<string>;
  /** Place ids. */
  seats?: ReadonlySet<string>;
  /** Whether there is a previous election to flip against. Without one, flips is not a mode a reader can have. */
  flips?: boolean;
};

/** At most one of these, and the parse is what makes it so. */
export type Isolation =
  | { by: "party"; key: string }
  | { by: "band"; key: string }
  | { by: "bin"; lo: number }
  | null;

/**
 * A change of selection, as a link.
 *
 * Choosing what is already chosen switches it off, for the party, band, bin, district and seat that a control shows
 * as pressed. A move that also names a mode is a request to show that reading, so it selects and never toggles: the
 * flip matrix's links must not switch a party off the second time they are followed.
 *
 *   release    drops the isolation
 *   clear      drops the isolation, the district focus and the seat focus; the mode stays
 *   party/band/bin   isolate that, replacing any other isolation
 *   district   focus it, and drop the seat focus, which belonged to the district before
 *   election   another election, with every selection dropped: each is a statement about one election
 *
 * Everything not named stays as the ask had it, mode included (D20: switching mode keeps the party, and the party
 * then means the runner-up in the runner-up mode). A value that is not offered is not refused here; `ignored` on the
 * page it leads to says so, and the round-trip test is how a dead link is found.
 */
export type Move =
  | "release"
  | "clear"
  | { mode: MapMode }
  | { party: string }
  | { band: string }
  | { bin: number }
  | { district: string }
  | { seat: string }
  | { election: string };

export type MapSelection = {
  /** `winners` when none was asked, or the one asked is not offered. */
  mode: MapMode;
  isolation: Isolation;
  /** FOCUS, which reframes the map and narrows what it describes. */
  district: string | null;
  /** FOCUS that only outlines: a seat the reader pointed at from the list. */
  seat: string | null;
  /** The selection params that were asked and not honoured, in the order mode, party, band, bin, district, seat. */
  ignored: string[];
  /** Whether the selection includes this seat. A seat it does not include is the one the map mutes. */
  covers(seat: SeatFacts): boolean;
  /** The seats the selection includes, in their order: the district first, then the isolation. */
  narrow<T extends SeatFacts>(seats: readonly T[]): T[];
  /** The seats inside the district focus, or all of them: `narrow` before the isolation. */
  inDistrict<T extends SeatFacts>(seats: readonly T[]): T[];
  /**
   * A link to this page with the moves applied, anchored. The ask is carried as it came, not as it was understood:
   * a party this page ignored is still in the link, because the page it leads to may know it (a layer switch is the
   * case that needs it).
   */
  href(...moves: Move[]): string;
};

/** A canonical whole number, so that `""`, `" 4"`, `"4.0"` and `"0x4"` are not bins. */
const WHOLE = /^(0|[1-9]\d*)$/;

function inBand(band: Band, marginPct: number | null): boolean {
  return marginPct !== null && marginPct >= band.lo && (band.hi === null || marginPct < band.hi);
}

export function readSelection(
  search: Search,
  choices: Choices,
  at: { base: string; anchor?: string },
): MapSelection {
  const ask = readAsk(search);
  const ignored: string[] = [];

  const askedMode = ask.get("mode");
  let mode: MapMode = "winners";
  if (askedMode !== undefined) {
    // A mode nobody can read is not offered: without a previous election there is nothing to flip against.
    if (isMode(askedMode) && (askedMode !== "flips" || choices.flips === true)) mode = askedMode;
    else ignored.push("mode");
  }

  // The three isolations are tried in one order, and the first the view offers wins. The others, if asked, are
  // ignored: two isolations on one map are two answers to one question.
  const askedParty = ask.get("party");
  const askedBand = ask.get("band");
  const askedBin = ask.get("bin");
  const party = askedParty !== undefined && choices.parties.has(askedParty) ? askedParty : null;
  const band = choices.bands?.find((b) => b.key === askedBand) ?? null;
  const bin =
    askedBin !== undefined && WHOLE.test(askedBin) && choices.bins?.includes(Number(askedBin)) === true
      ? Number(askedBin)
      : null;
  const isolation: Isolation =
    party !== null
      ? { by: "party", key: party }
      : band !== null
        ? { by: "band", key: band.key }
        : bin !== null
          ? { by: "bin", lo: bin }
          : null;
  for (const [name, given] of [["party", askedParty], ["band", askedBand], ["bin", askedBin]] as const) {
    if (given !== undefined && isolation?.by !== name) ignored.push(name);
  }

  const askedDistrict = ask.get("district");
  const district = askedDistrict !== undefined && choices.districts?.has(askedDistrict) === true ? askedDistrict : null;
  if (askedDistrict !== undefined && district === null) ignored.push("district");
  const askedSeat = ask.get("seat");
  const seat = askedSeat !== undefined && choices.seats?.has(askedSeat) === true ? askedSeat : null;
  if (askedSeat !== undefined && seat === null) ignored.push("seat");

  const inDistrict = <T extends SeatFacts>(seats: readonly T[]): T[] =>
    district === null ? [...seats] : seats.filter((s) => s.districtId === district);
  const inIsolation = (s: SeatFacts): boolean => {
    if (isolation === null) return true;
    switch (isolation.by) {
      // The party is the winner's, except on the runner-up tab, where it is the one who came second.
      case "party":
        return (mode === "runnerup" ? s.runnerUpKey : s.partyKey) === isolation.key;
      case "band":
        return band !== null && inBand(band, s.marginPct);
      case "bin":
        return s.marginBin === isolation.lo;
    }
  };
  const covers = (s: SeatFacts): boolean => (district === null || s.districtId === district) && inIsolation(s);

  // What a move writes. An empty value drops the param, as in `queryHref`.
  const changeOf = (move: Move, selects: boolean): Record<string, string> => {
    const isolate = (name: "party" | "band" | "bin", value: string, on: boolean): Record<string, string> =>
      on && !selects ? { party: "", band: "", bin: "" } : { party: "", band: "", bin: "", [name]: value };
    if (move === "release") return { party: "", band: "", bin: "" };
    if (move === "clear") return { party: "", band: "", bin: "", district: "", seat: "" };
    if ("mode" in move) return { mode: move.mode };
    if ("party" in move) return isolate("party", move.party, isolation?.by === "party" && isolation.key === move.party);
    if ("band" in move) return isolate("band", move.band, isolation?.by === "band" && isolation.key === move.band);
    if ("bin" in move) return isolate("bin", String(move.bin), isolation?.by === "bin" && isolation.lo === move.bin);
    if ("district" in move) return { district: district === move.district && !selects ? "" : move.district, seat: "" };
    if ("seat" in move) return { seat: seat === move.seat && !selects ? "" : move.seat };
    return { election: move.election, party: "", band: "", bin: "", district: "", seat: "" };
  };

  return {
    mode,
    isolation,
    district,
    seat,
    ignored,
    covers,
    narrow: (seats) => seats.filter(covers),
    inDistrict,
    href: (...moves) => {
      const selects = moves.some((m) => typeof m === "object" && "mode" in m);
      const change: Record<string, string> = {};
      for (const m of moves) Object.assign(change, changeOf(m, selects));
      return queryHref(at.base, ask, change, at.anchor);
    },
  };
}

/* ─────────────────────────────────── the tally ─────────────────────────────────── */

/** What a tally reads of a seat: the winner's party and the runner-up's, each with its label. */
export type TalliedSeat = {
  partyKey: string | null;
  partyLabel: string | null;
  runnerUpKey: string | null;
  runnerUpLabel: string | null;
};

export type Tallied = { key: string; label: string; n: number };

/**
 * Seats counted by the party that won them or the party that came second, biggest first, then by key. A seat with no
 * party on that side is nobody's. (`seat-results.tally` counts the data layer's seat results by winner; this counts
 * the seats a map page holds, in the shape its legend prints.)
 */
export function tally(seats: readonly TalliedSeat[], by: "winner" | "runnerUp"): Tallied[] {
  const counts = new Map<string, Tallied>();
  for (const s of seats) {
    const key = by === "winner" ? s.partyKey : s.runnerUpKey;
    if (key === null) continue;
    const at = counts.get(key) ?? { key, label: (by === "winner" ? s.partyLabel : s.runnerUpLabel) ?? key, n: 0 };
    at.n += 1;
    counts.set(key, at);
  }
  return [...counts.values()].sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
}

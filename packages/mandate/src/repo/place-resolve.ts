// Place resolution: which place a URL's segments or a reader's words name, answered once.
// `resolve` is pure — an index and a query in, one answer out — so every rule below is tested on array literals;
// `loadPlaceIndex` is the adapter that reads the registry into that index.
//
// WHY THIS EXISTS. "Which seat does this name mean?" was answered in five places, each its own SQL predicate with its
// own positional binds: getPlaceBrief (place.ts), getPlaceAnalysis (place-analysis.ts, a copy), placeView and the two
// constituency lookups (place-page.ts), and search (a LIKE). They disagreed. `getPlaceBrief("cooch-behar-dakshin")`
// missed the seat placeView found, `bishnupur-sc` resolved in neither, and where two seats answered to one name each
// silently took one: placeView the lower place id, getPlaceBrief the higher version id, constituenciesNamed whichever
// its GROUP BY kept. So the v1 API and the page could answer one name with two different seats. Worse, placeView
// discarded the version it resolved and the brief re-resolved by place id, so a retired name could render a different
// seat's page.
//
// ONE POLICY, three decisions the user made:
//
//   D25  The EXACT name wins. A seat answers to its name as the registry spells it, reservation marker included
//        (`BISHNUPUR(SC)`), and only when no seat does is the name tried with the marker stripped. A tie is `many`,
//        for the existing choose page to ask about; it is never cut to the first row.
//   D26  A RETIRED name does not resolve. `place_id` is a seat NUMBER and not a constituency (migration 011): ka.ac.214
//        was Badami under one order and is Nanjangud under the next, so matching an old version's name and then
//        answering with the newest version asserted a renaming that never happened. Only a seat of the epoch its
//        house votes under is current, and only current seats answer.
//   D27  A state is its id, and a district is its state's id and its own id's tail. Names for either belong to the
//        legacy module, which maps them to ids.
//
// THE QUERY NARROWS, THE NAME CHOOSES. A path asserts an ancestry — the state, the body, sometimes the district — and
// each assertion removes candidates before any name is compared. That order is what lets `/wb/bankura/bishnupur` and
// `/wb/south-24-parganas/bishnupur` mean different seats, and it is why a name that exists outside the asserted
// district is `none`, not a seat from elsewhere. `none` is never answered with a different kind of place.
//
// WHAT IS NOT HERE. Nothing calls this yet. Strings arrive already decoded from the URL (a stray percent is the
// caller's to survive). The canonical address is built by routes.ts and nothing here assembles a path. Two things
// differ from the SQL predicates, deliberately: lower-casing is Unicode where SQLite's is ASCII, and a name is
// compared by its words, so punctuation is not part of a spelling ("St. Thomas Mount" is "st-thomas-mount").

import type { DatabaseSync } from "node:sqlite";
import type { Reservation } from "../core/index.ts";
import { all } from "../db/index.ts";
import { votingEpochs } from "../db/epochs.ts";
import { read } from "./index.ts";
import type { ConstituencyBody } from "./routes.ts";
import { constituencyHref, districtHref, kindOfBody, stateHref } from "./routes.ts";

// ── the index ────────────────────────────────────────────────────────────────────────────────────

/** A state or union territory. */
export type StateRow = { id: string; kind: "state" | "ut"; name: string };

/** A district. `id` is the registry's dotted id (`wb.cooch-behar`), whose tail is the slug a URL carries. */
export type DistrictRow = { id: string; stateId: string; name: string };

/**
 * One version of a seat: the constituency as one delimitation drew and named it.
 *
 * `versionId` is the surrogate key and never appears in a URL (ADR 0001): it is here so what resolved can be
 * handed on without being resolved again. `current` is the loader's decision and the resolver's only question
 * about time.
 */
export type SeatRow = {
  versionId: number;
  /** A seat NUMBER's grouping, shared by every version that held the number. Not an identity. */
  placeId: string;
  /** The state or union territory, which both bodies have. */
  stateId: string;
  kind: "ac" | "pc";
  name: string;
  number: number | null;
  reservation: Reservation | null;
  epochId: string;
  /** An assembly seat's district; a Lok Sabha seat has none, because it spans districts by design. */
  districtId: string | null;
  current: boolean;
};

/** Everything a place query can be answered from. Plain data, so a test builds one from three arrays. */
export type PlaceIndex = {
  readonly states: readonly StateRow[];
  readonly districts: readonly DistrictRow[];
  readonly seats: readonly SeatRow[];
};

// ── the question and its answer ──────────────────────────────────────────────────────────────────

/** What a seat path asserts besides the seat. A missing `body` asks both; a missing `district` asserts none. */
type SeatScope = { state: string; body?: ConstituencyBody; district?: string };

export type PlaceQuery =
  | { level: "state"; id: string }
  | { level: "district"; state: string; district: string }
  | ({ level: "seat"; name: string } & SeatScope)
  | ({ level: "seat"; number: number } & SeatScope);

/** A place the registry holds, with the address it is canonically served at. */
export type Place =
  | (StateRow & { level: "state"; href: string })
  | (DistrictRow & { level: "district"; href: string })
  | (SeatRow & { level: "seat"; href: string });

/**
 * `one` is a destination, `many` is a question for the reader, `none` is a 404.
 *
 * `many` holds at least two places in a fixed order: assembly before Lok Sabha, then by seat number, then by name.
 * Two seats of one body that tie on name share a canonical href — the URL grammar has no room for the difference —
 * so a page that lists them has nothing distinct to link until that is decided.
 */
export type Found =
  | { found: "one"; place: Place }
  | { found: "many"; places: readonly Place[] }
  | { found: "none" };

// ── matching ─────────────────────────────────────────────────────────────────────────────────────

/** Anything that is not a letter, a mark or a digit. Marks are kept: they are the vowel signs of an Indic word. */
const BETWEEN_WORDS = /[^\p{L}\p{M}\p{N}]+/u;

/** The source appends a seat's reservation to its name: `BISHNUPUR(SC)`, `KHANAPUR(ST)`. */
const MARKER = /\(\s*(?:sc|st)\s*\)/gi;

/**
 * A name as a reader or a slug spells it: the same words, lower-cased, whatever sits between them. A space, a hyphen,
 * a dot and a parenthesis are all "between words", so `bishnupur(sc)`, `Bishnupur (SC)` and `bishnupur-sc` are one
 * spelling.
 */
function nameKey(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .split(BETWEEN_WORDS)
    .filter((w) => w !== "")
    .join(" ");
}

/** The seats a query asks about, before the name chooses between them. */
function narrowed(index: PlaceIndex, q: Extract<PlaceQuery, { level: "seat" }>): SeatRow[] {
  const state = q.state.trim().toLowerCase();
  const kind = q.body === undefined ? null : kindOfBody(q.body);
  const district = q.district === undefined ? null : `${state}.${q.district.trim().toLowerCase()}`;
  return index.seats.filter(
    (s) =>
      s.current &&
      s.stateId === state &&
      (kind === null || s.kind === kind) &&
      (district === null || s.districtId === district),
  );
}

function seatsOf(index: PlaceIndex, q: Extract<PlaceQuery, { level: "seat" }>): SeatRow[] {
  const within = narrowed(index, q);
  if ("number" in q) return within.filter((s) => s.number === q.number);
  const want = nameKey(q.name);
  if (want === "") return [];
  // D25: the marker-stripped name is a fallback for an empty exact tier, not a second chance for every query.
  const exact = within.filter((s) => nameKey(s.name) === want);
  return exact.length > 0 ? exact : within.filter((s) => nameKey(s.name.replace(MARKER, " ")) === want);
}

/** Assembly before Lok Sabha, then number (a seat with none last), then name, then the version. Total, so stable. */
function bySeat(a: SeatRow, b: SeatRow): number {
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  if (a.number !== b.number) return a.number === null ? 1 : b.number === null ? -1 : a.number - b.number;
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return a.versionId - b.versionId;
}

function found(places: readonly Place[]): Found {
  const [first, ...rest] = places;
  if (first === undefined) return { found: "none" };
  return rest.length === 0 ? { found: "one", place: first } : { found: "many", places };
}

/**
 * Resolve a query against an index. Pure: it reads nothing but its arguments and edits neither.
 *
 * Every address comes from routes.ts, built from the row that matched, so no caller derives a URL from a path again.
 */
export function resolve(index: PlaceIndex, query: PlaceQuery): Found {
  if (query.level === "state") {
    const id = query.id.trim().toLowerCase();
    return found(
      index.states.filter((s) => s.id === id).map((s): Place => ({ ...s, level: "state", href: stateHref(s.id) })),
    );
  }
  if (query.level === "district") {
    const state = query.state.trim().toLowerCase();
    const id = `${state}.${query.district.trim().toLowerCase()}`;
    return found(
      index.districts
        .filter((d) => d.stateId === state && d.id === id)
        .map((d): Place => ({ ...d, level: "district", href: districtHref(d.id) })),
    );
  }
  return found(
    seatsOf(index, query)
      .sort(bySeat)
      .map(
        (s): Place => ({
          ...s,
          level: "seat",
          href: constituencyHref({ jurisdictionId: s.stateId, kind: s.kind, canonicalName: s.name }),
        }),
      ),
  );
}

// ── the loader ───────────────────────────────────────────────────────────────────────────────────

type SeatSql = Omit<SeatRow, "current">;

/**
 * Read the whole index: every state, every district and every seat version, in three statements with no binds.
 *
 * Retired versions are loaded and marked, not left out, so the resolver declines them for a reason a test can see
 * instead of never having heard of them. A seat is current when its epoch is the one its (state, house) votes under
 * (`votingEpochs`, the `voting_epoch` view): not the newest order in force, because Assam's assembly still votes
 * under delim-2008 although delim-2023-as is in force and holds no assembly seats. A house that has never held a
 * full-house election has no voting epoch, so none of its seats is current.
 *
 * A district is read from the version, and from the place's parent where the version has none, as getPlaceBrief
 * reads it; a Lok Sabha seat is not given the fallback, because it has no district and the parent is not one.
 */
export function loadPlaceIndex(db: DatabaseSync): PlaceIndex {
  return read(() => {
    const voting = votingEpochs(db);
    return {
      states: all<StateRow>(
        db,
        `SELECT id, kind, canonical_name AS name FROM place WHERE kind IN ('state', 'ut') ORDER BY id`,
      ).map((r): StateRow => ({ id: r.id, kind: r.kind, name: r.name })),
      districts: all<DistrictRow>(
        db,
        `SELECT id, parent_id AS stateId, canonical_name AS name
           FROM place WHERE kind = 'district' AND parent_id IS NOT NULL ORDER BY id`,
      ).map((r): DistrictRow => ({ id: r.id, stateId: r.stateId, name: r.name })),
      seats: all<SeatSql>(
        db,
        `SELECT pv.id AS versionId, pv.place_id AS placeId, pv.jurisdiction_id AS stateId, pv.kind AS kind,
                pv.canonical_name AS name, pv.number AS number, pv.reservation AS reservation,
                pv.epoch_id AS epochId, d.id AS districtId
           FROM place_version pv
           JOIN place pl ON pl.id = pv.place_id
           LEFT JOIN place d ON d.id = CASE WHEN pv.kind = 'pc' THEN pv.district_place_id
                                            ELSE COALESCE(pv.district_place_id, pl.parent_id) END
                            AND d.kind = 'district'
          WHERE pv.kind IN ('ac', 'pc')
          ORDER BY pv.id`,
      ).map(
        (r): SeatRow => ({
          versionId: r.versionId,
          placeId: r.placeId,
          stateId: r.stateId,
          kind: r.kind,
          name: r.name,
          number: r.number,
          reservation: r.reservation,
          epochId: r.epochId,
          districtId: r.districtId,
          current: voting.get(`${r.stateId} ${r.kind}`) === r.epochId,
        }),
      ),
    };
  });
}

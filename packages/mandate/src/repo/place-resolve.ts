// Place resolution: which place a URL's segments or a reader's words name, answered once.
// `resolve` is pure — an index and a query in, one answer out — so every rule below is tested on array literals;
// `loadPlaceIndex` is the adapter that reads the registry into that index.
//
// WHY THIS EXISTS. "Which seat does this name mean?" was answered in five places, each its own SQL predicate with its
// own positional binds: getPlaceBrief (place.ts), getPlaceAnalysis (place-analysis.ts, a copy), placeView and the two
// constituency lookups (once place-page.ts, now place-view.ts), and search (a LIKE). They disagreed.
// `getPlaceBrief("cooch-behar-dakshin")` missed the seat placeView found, `bishnupur-sc` resolved in neither, and where
// two seats answered to one name each silently took one: placeView the lower place id, getPlaceBrief the higher version
// id, the pre-body lookup whichever its GROUP BY kept. So the v1 API and the page could answer one name with two
// different seats. Worse, placeView discarded the version it resolved and the brief re-resolved by place id, so a
// retired name could render a different seat's page.
//
// ONE POLICY, three decisions the user made:
//
//   D25  The EXACT name wins. A seat answers to its name as the registry spells it, reservation marker included
//        (`BISHNUPUR(SC)`), and only when no seat does is the name tried with the marker stripped, and then with its
//        words joined (`coochbeharuttar`, which the SQL read by squashing both sides and old links still use). A tie
//        is `many`, for the existing choose page to ask about; it is never cut to the first row. Tied seats of one
//        body are addressed by their registry id (`seatHref`), so the page that asks has a link for each.
//        Only CURRENT seats tie: the id of a retired seat opens whichever seat holds its number now.
//   D26  A RETIRED name does not resolve. `place_id` is a seat NUMBER and not a constituency (migration 011): ka.ac.214
//        was Badami under one order and is Nanjangud under the next, so matching an old version's name and then
//        answering with the newest version asserted a renaming that never happened. Only a seat of the epoch its
//        house votes under is current, and only current seats answer.
//   D27  A state is its id. Names for a state are for the legacy module to map to ids, which nothing does yet. The
//        decision is about states: a district still answers to its id's tail and to its name, as it always did.
//
// THE QUERY NARROWS, THE NAME CHOOSES. A path asserts an ancestry — the state, the body, sometimes the district — and
// each assertion removes candidates before any name is compared. That order is what lets `/wb/bankura/bishnupur` and
// `/wb/south-24-parganas/bishnupur` mean different seats, and it is why a name that exists outside the asserted
// district is `none`, not a seat from elsewhere. `none` is never answered with a different kind of place.
//
// A SEAT WITH NO STATE. The v1 API names a seat by the registry's own id (`wb.ac.001`) or by a bare name, and neither
// carries a state. A bare name asks every state at once, so it can tie across states, which is `many` like any other
// tie.
//
// WHAT IS NOT HERE. Strings arrive already decoded from the URL (a stray percent is the caller's to survive). The
// canonical address is built by routes.ts and nothing here assembles a path. Two things differ from the SQL
// predicates, deliberately: lower-casing is Unicode where SQLite's is ASCII, and a name is compared by its words,
// so punctuation is not part of a spelling ("St. Thomas Mount" is "st-thomas-mount").

import { statSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { Reservation } from "../core/index.ts";
import { all, get } from "../db/index.ts";
import { votingEpochs } from "../db/epochs.ts";
import { read } from "./index.ts";
import type { ConstituencyBody } from "./routes.ts";
import { bodyOfKind, constituencyHref, constituencyIdHref, districtHref, kindOfBody, stateHref } from "./routes.ts";

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

/**
 * What a seat path asserts besides the seat. A missing `body` asks both; a missing `district` asserts none. A query
 * with no state asserts nothing about where the seat is, and a district needs the state it is in.
 */
type SeatScope =
  | { state: string; body?: ConstituencyBody; district?: string }
  | { state?: undefined; body?: ConstituencyBody; district?: undefined };

/**
 * A seat by its name or by its number.
 *
 * `exact` reads the name as the registry spells it, in words, and tries no other spelling. The pre-body URL says so: it
 * is where old links live, and it has only ever answered to a name. So does the v1 API, which then holds what comes
 * back to the spelling itself (`seatNamed`, envelope.ts), because a name "in words" is looser than the SQL it replaced.
 */
type SeatAsk = ({ name: string; exact?: true } | { number: number }) & SeatScope;

export type PlaceQuery =
  | { level: "state"; id: string }
  | { level: "district"; state: string; district: string }
  | ({ level: "seat" } & SeatAsk)
  /** The seat the registry's own id names (`wb.ac.001`), in the epoch its house votes under, and in the scope given. */
  | ({ level: "seat"; placeId: string } & SeatScope);

/** A place the registry holds, with the address it is canonically served at. */
export type Place =
  | (StateRow & { level: "state"; href: string })
  | (DistrictRow & { level: "district"; href: string })
  | SeatPlace;

export type SeatPlace = SeatRow & {
  level: "seat";
  href: string;
  /** The name of the seat's district, which the index holds and the seat row does not; null where it has none. */
  districtName: string | null;
};

/**
 * `one` is a destination, `many` is a question for the reader, `none` is a 404.
 *
 * `many` holds at least two places in a fixed order: assembly before Lok Sabha, then by seat number, then by name.
 * Two seats of one body that tie on name cannot be told apart by that name, so each is addressed by its registry id
 * (`seatHref`) and a page that lists them has a distinct link for each.
 */
export type Found =
  | { found: "one"; place: Place }
  | { found: "many"; places: readonly Place[] }
  | { found: "none" };

// ── matching ─────────────────────────────────────────────────────────────────────────────────────

/** Anything that is not a letter, a mark or a digit. Marks are kept: they are the vowel signs of an Indic word. */
const BETWEEN_WORDS = /[^\p{L}\p{M}\p{N}]+/u;

/**
 * The source appends a seat's reservation to its name: `BISHNUPUR(SC)`, `KHANAPUR(ST)`.
 *
 * 102 of 16,785 versions carry one. It is stripped for MATCHING only: `canonical_name` keeps what the source wrote and
 * `reservation` is where the reservation is read from. For 25 of them the name carries a marker the column does not,
 * which is a data-quality note, recorded and not reconciled here.
 */
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
function narrowed(index: PlaceIndex, q: SeatScope): SeatRow[] {
  const state = q.state?.trim().toLowerCase();
  const kind = q.body === undefined ? null : kindOfBody(q.body);
  const district = q.district === undefined ? null : `${state}.${q.district.trim().toLowerCase()}`;
  return index.seats.filter(
    (s) =>
      s.current &&
      (state === undefined || s.stateId === state) &&
      (kind === null || s.kind === kind) &&
      (district === null || s.districtId === district),
  );
}

/**
 * The things a name picks out, from the first of three tiers that picks out any.
 *
 * D25: each tier is a fallback for an empty one before it, not a second chance for every query. The exact name, then
 * the name with its reservation marker stripped, then that with its words joined: `coochbeharuttar` for the
 * registry's "Coochbehar Uttar", `coochbehar` for the district "Cooch Behar".
 */
function named<T extends { name: string }>(within: readonly T[], asked: string, exact = false): T[] {
  const want = nameKey(asked);
  if (want === "") return [];
  const bare = (name: string): string => nameKey(name.replace(MARKER, " "));
  const joined = (key: string): string => key.replaceAll(" ", "");
  const tiers: ((name: string) => boolean)[] = [
    (name) => nameKey(name) === want,
    (name) => bare(name) === want,
    (name) => joined(bare(name)) === joined(want),
  ];
  for (const matches of exact ? tiers.slice(0, 1) : tiers) {
    const hit = within.filter((x) => matches(x.name));
    if (hit.length > 0) return hit;
  }
  return [];
}

function seatsOf(index: PlaceIndex, q: SeatAsk): SeatRow[] {
  const within = narrowed(index, q);
  return "number" in q ? within.filter((s) => s.number === q.number) : named(within, q.name, q.exact === true);
}

/** Assembly before Lok Sabha, then number (a seat with none last), then name, then the version. Total, so stable. */
function bySeat(a: SeatRow, b: SeatRow): number {
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  if (a.number !== b.number) return a.number === null ? 1 : b.number === null ? -1 : a.number - b.number;
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return a.versionId - b.versionId;
}

// ── a seat's address ─────────────────────────────────────────────────────────────────────────────

type TieRow = Pick<SeatRow, "versionId" | "placeId" | "stateId" | "kind" | "name" | "current">;

/**
 * The current seat versions that share a state, a body and a name, read as words, with a version of another place:
 * the ones whose name alone is not an address, because the page it leads to asks which was meant.
 *
 * CURRENT ONLY (D26), because a registry id answers with the current version of its place and no other: `place_id` is
 * a seat NUMBER, so the id of a retired seat opens whichever constituency holds that number now. A retired version is
 * never tied, so it keeps the address of its name, which opens the current seat that bears the name or is a 404, where
 * its id would open a seat of another name. A house votes under one epoch, so the current seats of a state and a body
 * are one delimitation's and no epoch is part of the key. The name is the first tier of `named` and no other, because
 * that is what a canonical href carries.
 */
export function tiedVersions(rows: Iterable<TieRow>): Set<number> {
  const groups = new Map<string, TieRow[]>();
  for (const r of rows) {
    if (!r.current) continue;
    const words = nameKey(r.name);
    if (words === "") continue;
    const at = `${r.stateId} ${bodyOfKind(r.kind)} ${words}`;
    const group = groups.get(at);
    if (group === undefined) groups.set(at, [r]);
    else group.push(r);
  }
  const tied = new Set<number>();
  for (const group of groups.values()) {
    if (new Set(group.map((r) => r.placeId)).size > 1) for (const r of group) tied.add(r.versionId);
  }
  return tied;
}

/**
 * The address a seat is served at: its name's (`constituencyHref`), or its registry id's (`constituencyIdHref`) when
 * it is a current seat whose name is shared with another current seat of its state and body.
 *
 * `tied` is `tiedVersions` of the registry, from `seatTies` for a caller with a registry and from the index for the
 * resolver. A seat that is not in it, a retired one included, is addressed exactly as it always was.
 */
export function seatHref(
  tied: ReadonlySet<number>,
  seat: { versionId: number; placeId: string; stateId: string; kind: string; name: string },
): string {
  return tied.has(seat.versionId)
    ? constituencyIdHref({ jurisdictionId: seat.stateId, kind: seat.kind, placeId: seat.placeId })
    : constituencyHref({ jurisdictionId: seat.stateId, kind: seat.kind, canonicalName: seat.name });
}

/**
 * What a page that asks which seat was meant says of an entry besides its name and its body: the seat's district, and its
 * seat number. `null` is nothing to add.
 */
export type Apart = { district: string | null; number: number | null };

/**
 * What tells the entries of a `many` answer apart, in the order given, said only as far as the entries need it.
 *
 * Entries read alike when they are of one state and body and their names are the same words (the test `tiedVersions`
 * applies), because the page shows a name and a body. An entry that none reads alike to is told nothing, so a page whose names
 * and bodies already differ is the page it was. Among entries that read alike the district is said, and the seat number as
 * well for those that still share a district name: two seats of one name in one district, or Lok Sabha seats, which have none.
 */
export function tellApart(places: readonly SeatPlace[]): Apart[] {
  const alike = new Map<string, number[]>();
  places.forEach((p, i) => {
    const at = `${p.stateId} ${p.kind} ${nameKey(p.name)}`;
    alike.set(at, [...(alike.get(at) ?? []), i]);
  });
  const said = places.map((): Apart => ({ district: null, number: null }));
  for (const group of alike.values()) {
    if (group.length < 2) continue;
    for (const i of group) {
      const p = places[i] as SeatPlace;
      const shared = group.filter((j) => (places[j] as SeatPlace).districtName === p.districtName).length > 1;
      said[i] = { district: p.districtName, number: shared ? p.number : null };
    }
  }
  return said;
}

/** `tiedVersions` of an index, worked out once: `placeIndex` shares one between requests and a page asks per row. */
const tiedOf = new WeakMap<PlaceIndex, Set<number>>();

function tiesIn(index: PlaceIndex): Set<number> {
  let tied = tiedOf.get(index);
  if (tied === undefined) tiedOf.set(index, (tied = tiedVersions(index.seats)));
  return tied;
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
    const district = query.district.trim().toLowerCase();
    const within = index.districts.filter((d) => d.stateId === state);
    // Its id first, written in full or by its tail, then its name. There is no choose page for districts, so a name
    // two of a state's districts share goes to the lower id, as it always did.
    const hit = within.find((d) => d.id === `${state}.${district}` || d.id === district) ?? named(within, district)[0];
    return found(hit === undefined ? [] : [{ ...hit, level: "district", href: districtHref(hit.id) }]);
  }
  const tied = tiesIn(index);
  return found(
    ("placeId" in query ? narrowed(index, query).filter((s) => s.placeId === query.placeId) : seatsOf(index, query))
      .sort(bySeat)
      .map(
        (s): Place => ({
          ...s,
          level: "seat",
          href: seatHref(tied, s),
          districtName: index.districts.find((d) => d.id === s.districtId)?.name ?? null,
        }),
      ),
  );
}

// ── the loader ───────────────────────────────────────────────────────────────────────────────────

type SeatSql = Omit<SeatRow, "current">;

/** A seat version is current when its epoch is the one its (state, house) votes under. */
function isCurrent(voting: ReadonlyMap<string, string>, s: { stateId: string; kind: string; epochId: string }): boolean {
  return voting.get(`${s.stateId} ${s.kind}`) === s.epochId;
}

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
 *
 * A seat's name is its VERSION's and never the place row's. `place.canonical_name` is a legacy seat-number grouping
 * named for whichever delimitation created the row (migrations 011 and 012): Arunachal's ar.ac.001 is LUMLA on both
 * of its versions and TAWANG-I on the place row, so matching the place row made /ar/tawang/lumla a 404 while
 * /ar/tawang/tawang-i resolved to a page the rest of the code correctly titles LUMLA.
 */
export function loadPlaceIndex(db: DatabaseSync): PlaceIndex {
  return read(() => {
    const voting = votingEpochs(db);
    return {
      states: all<StateRow>(
        db,
        // 'ut' as well: eight of India's thirty-six jurisdictions are union territories, and matching 'state' alone
        // is a 404 for Jammu & Kashmir, Delhi, Puducherry, Ladakh, Chandigarh and the rest.
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
          current: isCurrent(voting, r),
        }),
      ),
    };
  });
}

// ── the index, kept ──────────────────────────────────────────────────────────────────────────────

/**
 * What a registry file looked like when an index was read from it: its path, and the size and mtime of it and of its
 * WAL. An empty WAL counts as none, because a connection that has only read leaves one behind, and that is not a write.
 */
function stampOf(db: DatabaseSync): string | null {
  const file = db.location();
  // An in-memory registry has no file to watch, and one that cannot say where it is cannot be told from another.
  if (file === null || file === "") return null;
  const part = (f: string): string => {
    const s = statSync(f, { throwIfNoEntry: false });
    return s === undefined || s.size === 0 ? "-" : `${s.size}.${s.mtimeMs}`;
  };
  return `${file} ${part(file)} ${part(`${file}-wal`)}`;
}

let kept: { stamp: string; index: PlaceIndex } | undefined;

/**
 * The index of the registry `db` holds, read once and kept while the registry file is the one it was read from.
 *
 * Answering a query costs well under a millisecond and reading the index costs about 150 ms at the registry's size,
 * nearly all of it the `voting_epoch` view, so a page that read it afresh would pay that on every request. Every
 * write to the registry moves its file or its WAL, which is what the stamp watches, so a registry that is
 * rebuilt or replaced under a running server is read again on the next request and never answered from a stale
 * copy. The stamp is taken before the read: a write that lands in between leaves an index newer than its stamp,
 * and costs one more read, not a wrong answer.
 *
 * The index is shared between requests, so nothing may edit it: its types are `readonly`, and `resolve` copies
 * what it sorts.
 */
export function placeIndex(db: DatabaseSync): PlaceIndex {
  const stamp = stampOf(db);
  if (stamp === null) return loadPlaceIndex(db);
  if (kept?.stamp !== stamp) kept = { stamp, index: loadPlaceIndex(db) };
  return kept.index;
}

let keptTies: { stamp: string; tied: ReadonlySet<number> } | undefined;

/**
 * The current seat versions whose name is shared, from the registry: what a page that links seats asks before it builds
 * each link (`seatHref`), kept like the index while the registry file stands.
 *
 * Not read through `placeIndex`, because a link has no use for the states and districts and must not stop a page from
 * rendering on a registry the resolver cannot be built on. A registry that predates `voting_epoch` (migration 017)
 * cannot say which seats are current, so none of its seats is tied there and every link is a seat's name, as it was
 * before a seat could be addressed by its id.
 */
export function seatTies(db: DatabaseSync): ReadonlySet<number> {
  const stamp = stampOf(db);
  if (stamp === null) return loadTies(db);
  if (keptTies?.stamp !== stamp) keptTies = { stamp, tied: loadTies(db) };
  return keptTies.tied;
}

function loadTies(db: DatabaseSync): Set<number> {
  return read(() => {
    const voting =
      get(db, `SELECT 1 FROM sqlite_master WHERE type = 'view' AND name = 'voting_epoch'`) === undefined
        ? new Map<string, string>()
        : votingEpochs(db);
    return tiedVersions(
      all<TieRow & { epochId: string }>(
        db,
        `SELECT id AS versionId, place_id AS placeId, jurisdiction_id AS stateId, kind, epoch_id AS epochId,
                canonical_name AS name
           FROM place_version WHERE kind IN ('ac', 'pc')`,
      ).map((r): TieRow => ({ ...r, current: isCurrent(voting, r) })),
    );
  });
}

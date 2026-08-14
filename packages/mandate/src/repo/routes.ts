// Every URL this product hands a reader, built in one place.
//
// ── WHY THIS FILE EXISTS ──
//
// It did not, and there were SEVENTEEN hand-assembled `/pl/...` template literals across ten files.
// `placeHref` was the intended single builder and five call sites used it; the other twelve wrote their own,
// each re-deriving the same path shape from ids. That is not a tidiness problem — it is how a link starts
// pointing somewhere that does not exist. The seat link on the state page was assembled by hand, kept its
// own private copy of the name-slug rule, and pointed at a URL that never navigated anywhere; the page's own
// test passed the whole time because a link to the wrong place is still a link.
//
// ── THE ROUTE ARCHITECTURE, AND WHY DEPTH NO LONGER DECIDES ANYTHING ──
//
// Before, one catch-all served three entity types and `parsePath` decided which by COUNTING SEGMENTS:
// one meant a state, two a district, three a constituency. So the type of a thing was a property of how
// long its URL happened to be, and a malformed path resolved to a different entity rather than to nothing.
//
//   /state/<state>                     ka
//   /district/<state>/<district>       ka/bangalore
//   /constituency/<state>/<name>       ka/jayanagar
//   /election/<election>               ka-assembly-2023
//   /p/<person>                        md-salim
//
// The type is now in the PREFIX. Depth inside a route is fixed and known, so nothing infers.
//
// A NOTE ON THE TWO-SEGMENT FORMS, since the brief asked for single slugs. A district id (`ka.bangalore`) is
// globally unique and would fit one segment; a constituency NAME is not — "Jayanagar" may exist in more than
// one state, and `getPlaceBrief` resolves a bare name by taking whichever version sorts first, which is
// precisely the silent resolution to a different entity this phase forbids. The alternative single slug is
// the place id (`wb.ac.001`), which is unique but is a seat NUMBER, unreadable, and demoted by
// docs/model/electoral-geography.md as an identity. So both district and constituency carry their state:
// readable, unambiguous, and consistent with each other rather than one of each.

/** The name slug a place URL uses. THE ONLY definition of this rule. */
export function slugOf(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

/** A state or union territory: `/state/ka`. */
export function stateHref(jurisdictionId: string): string {
  return `/state/${jurisdictionId}`;
}

/**
 * A district: `/district/ka/bangalore`.
 *
 * `districtId` is the dotted registry id (`ka.bangalore`); the state prefix is split back out so the URL
 * reads as the hierarchy it is. A district id with no dot has no state to place it under and falls back to
 * the state route rather than emitting `/district//x`.
 */
export function districtHref(districtId: string): string {
  const dot = districtId.indexOf(".");
  if (dot < 0) return stateHref(districtId);
  return `/district/${districtId.slice(0, dot)}/${districtId.slice(dot + 1)}`;
}

/**
 * A constituency: `/constituency/ka/jayanagar`.
 *
 * Takes the JURISDICTION, not the district. A seat's district is a grouping that changes with delimitation
 * while the seat keeps its name, so putting the district in the URL made a shared link rot at the next
 * redraw. The state is the stable ancestor and is all the name needs to be unambiguous.
 */
export function constituencyHref(jurisdictionId: string, name: string): string {
  if (jurisdictionId === "" || name === "") return "/";
  return `/constituency/${jurisdictionId}/${slugOf(name)}`;
}

/** An election of any body or kind: `/election/ka-assembly-2023`. */
export function electionHref(electionId: string): string {
  return `/election/${electionId}`;
}

/**
 * A person: `/p/md-salim`.
 *
 * `/p` rather than `/candidate`, deliberately. It is already the canonical person surface, its type is
 * explicit in the prefix — which is the requirement — and `/candidate/[id]` is a live compatibility route
 * for the previous product's NUMERIC candidate ids. Making `/candidate` canonical would put those ids and
 * these slugs in one namespace and reintroduce the guessing this phase removes.
 */
export function personHref(personId: string): string {
  return `/p/${personId}`;
}

/** What kind of thing a `/pl/...` path was asking for, resolved rather than counted. */
export type PlaceKind = "state" | "district" | "ac";

/**
 * The canonical URL for a place whose kind is already KNOWN — resolved from the registry, never guessed
 * from the shape of a string.
 *
 * `jurisdictionId` is the state; `parentId` is the district for an `ac` and the state for a `district`,
 * matching what the repo rows already carry.
 */
export function canonicalHref(p: {
  kind: PlaceKind;
  id: string;
  canonicalName: string;
  jurisdictionId: string | null;
  parentId: string | null;
}): string {
  if (p.kind === "state") return stateHref(p.id);
  if (p.kind === "district") return districtHref(p.id);
  const state = p.jurisdictionId ?? (p.parentId ?? "").split(".")[0] ?? "";
  return state === "" ? "/" : constituencyHref(state, p.canonicalName);
}

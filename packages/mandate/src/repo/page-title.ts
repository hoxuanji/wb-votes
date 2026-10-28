// What a page is called: its title, for the browser tab, the history entry, the bookmark and the announcement a screen
// reader makes when a page has loaded. Before this, every page but three said "India Election Intelligence", whatever it
// was about, so a reader with four tabs open could not tell West Bengal from a person (WCAG 2.4.2).
//
// A route's `generateMetadata` asks here, with the same query the page makes, and the layout's template adds the
// product's name after it. The words come from the registry's own names and are never put together from the address: a
// state is "Tw State" and not `tw`.
//
// A page that is not there has no title of its own, and neither has one the registry cannot be read for: both return
// undefined, and the layout's default applies until the 404 or the notice gives a title of its own.
//
// The place index is held between requests (placeIndex), so asking here and then asking again to draw the page costs a
// lookup in memory and not a second read of the registry.

import type { DatabaseSync } from "node:sqlite";
import { bodyWord } from "../core/election-kind.ts";
import { get } from "../db/index.ts";
import { electionContext } from "./election-context.ts";
import type { LegacyTarget } from "./legacy.ts";
import type { Place, PlaceQuery } from "./place-resolve.ts";
import { placeIndex } from "./place-resolve.ts";
import { decode, resolveRequest } from "./place-view.ts";
import { bodyOfKind } from "./routes.ts";
import { readRegistry } from "./session.ts";

/**
 * The title of a state, a district or a seat, or of the question a shared name asks. `analysis` is a seat's second
 * floor, which is a different page from the seat and so has a different title.
 */
export function placeTitle(
  query: PlaceQuery,
  o: { analysis?: boolean } = {},
  read = readRegistry,
): string | undefined {
  const r = read((db): string | undefined => {
    const found = resolveRequest(db, query);
    if (found.found === "none") return undefined;
    if (found.found === "many") return chooseTitle(found.places);
    const place = found.place;
    if (place.level === "state") return place.name;
    const state = placeIndex(db).states.find((s) => s.id === place.stateId)?.name ?? place.stateId;
    if (place.level === "district") return `${place.name} · District, ${state}`;
    const what = `${bodyWord(bodyOfKind(place.kind))} Constituency${o.analysis === true ? " analysis" : ""}`;
    return `${place.name} · ${what}, ${state}`;
  });
  return r.ok ? r.value : undefined;
}

/** The title of the page that asks which of several seats was meant: the name they share, and the question. */
export function chooseTitle(places: readonly Place[]): string | undefined {
  const first = places.find((p) => p.level === "seat");
  return first === undefined ? undefined : `${first.name} · Which constituency?`;
}

/**
 * The title of what a legacy address draws. A redirect and a 404 draw nothing of their own, so that is the question
 * of which seat was meant, or none.
 */
export function legacyTitle(target: LegacyTarget): string | undefined {
  return target.kind === "choose" ? chooseTitle(target.places) : undefined;
}

/** An election's title is the label the election carries ("West Bengal Assembly Election 2021"). */
export function electionTitle(segment: string, read = readRegistry): string | undefined {
  const r = read((db: DatabaseSync) => electionContext(db, decode(segment))?.label);
  return r.ok ? r.value : undefined;
}

/** A person's title is their name. `segment` is the person's registry id, as the address spells it. */
export function personTitle(segment: string, read = readRegistry): string | undefined {
  const r = read(
    (db: DatabaseSync) =>
      get<{ name: string }>(db, `SELECT canonical_name AS name FROM person WHERE id = ?`, decode(segment))?.name,
  );
  return r.ok ? r.value : undefined;
}

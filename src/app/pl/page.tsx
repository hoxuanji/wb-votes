import { notFound, permanentRedirect } from "next/navigation";
import { stateHref } from "../../../packages/mandate/src/repo/routes.ts";

/**
 * `/pl` — not a page. A redirect, and the only reason the file still exists.
 *
 * It used to be a hand-written index of "the new surfaces, reachable", listing seven links with the old
 * route each one replaced. That index existed because cycles 1–3 were built under a strangler-fig rule
 * and nothing linked to them, so from the outside it looked as though nothing had changed. The shell has
 * real navigation now and the old app it was pointing away from is gone, so it is a page whose whole
 * subject no longer exists.
 *
 * What is left is the one thing a reader can still hit: the jurisdiction picker used to submit here as a
 * plain GET (`/pl?to=ka`), because a native <select> cannot navigate without JavaScript. That picker is
 * gone as well — the command bar reaches states, elections, seats, people and parties, and a control
 * that could only reach one of the five was a search field lying about its scope — but a bookmarked or
 * hand-edited `?to=` still resolves rather than 404ing.
 *
 * A bare `/pl` is a 404, not a redirect. There is no "all places" view: the place tree is a tree, and
 * its root is the country, which is `/`.
 */

export const dynamic = "force-dynamic";

export default function PlaceIndex({ searchParams }: { searchParams?: { to?: string } }) {
  const to = searchParams?.to;
  if (to !== undefined && /^[a-z]{2}$/.test(to)) permanentRedirect(stateHref(to));
  notFound();
}

// What an election IS, in the words the product uses for it. Pure: imports nothing, so ingest, repo and the
// pages can all say the same thing.
//
// The registry stores `house` ('ac' | 'pc' | 'none') and `kind` (seven values) on `election`. Those two
// columns say three independent things: WHICH BODY was elected, WHETHER IT FILLED ITS HOUSE or only a few
// vacant seats, and — folded into `kind` — the body again ('general' and 'assembly' differ only in body).
// The schema allows far more than the product can label; four combinations are real:
//
//   house  kind      body        fill
//   ac     assembly  assembly    general
//   pc     general   lok-sabha   general
//   ac     bypoll    assembly    bypoll
//   pc     bypoll    lok-sabha   bypoll
//
// Anything else is NOT defaulted to "Assembly Election". A municipal poll described as an assembly election is
// a wrong claim that renders fine, so `facetOf` throws and the registry-matrix test is the alarm.

/** Which body was elected. From `house`, which is the column that actually says so. */
export type Body = "assembly" | "lok-sabha";

/**
 * Whether the whole house was elected or a few vacant seats were. Nothing else.
 *
 * Not core/entities' `ElectionKind`, which is the registry's seven-valued column. This is the one thing
 * about it a surface acts on.
 */
export type Fill = "general" | "bypoll";

export type Facet = { body: Body; fill: Fill; type: string };

/** "Assembly Election", "Lok Sabha By-election" — the type, in the words a reader uses for it. */
export function typeOf(body: Body, fill: Fill): string {
  const house = body === "lok-sabha" ? "Lok Sabha" : "Assembly";
  return fill === "bypoll" ? `${house} By-election` : `${house} Election`;
}

/** The (house, kind) pairs the registry holds and the product can name. */
const KNOWN = new Set(["ac/assembly", "pc/general", "ac/bypoll", "pc/bypoll"]);

/**
 * Decode the registry's `house` and `kind` columns, once.
 *
 * Throws for a pair the product does not label — including house 'none' and kinds such as 'municipal' that the
 * schema permits — rather than falling back to an assembly election.
 */
export function facetOf(house: string, kind: string): Facet {
  if (!KNOWN.has(`${house}/${kind}`)) {
    throw new Error(
      `election-kind: house '${house}' with kind '${kind}' is not an election type the product labels ` +
        `(known: ${[...KNOWN].join(", ")})`,
    );
  }
  const body: Body = house === "pc" ? "lok-sabha" : "assembly";
  const fill: Fill = kind === "bypoll" ? "bypoll" : "general";
  return { body, fill, type: typeOf(body, fill) };
}

/**
 * Seats a majority needs: more than half of the seats CONTESTED, or null for a by-election.
 *
 * Null because a majority is a property of a full house; four seats falling vacant decide nothing about who
 * governs. From the contest count rather than today's house strength, because reference data holds only the
 * current strength and an election's own contest count IS its house.
 */
export function majorityOf(contested: number, fill: Fill): number | null {
  return fill === "bypoll" ? null : Math.floor(contested / 2) + 1;
}

/**
 * SQL for "not a by-election" — an election that fills its whole house. Assumes the election table is aliased
 * `e`. Portable (plain comparison, no dialect functions).
 */
export const FULL_HOUSE = "e.kind <> 'bypoll'";

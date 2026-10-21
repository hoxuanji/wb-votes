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
//
// Nothing past the view builders reads the two columns again: the view types carry `body` and `fill`, and
// election-kind.guard.test.ts fails on a page that reaches for either code.

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

/** "Lok Sabha" or "Assembly" — the body, in the word a reader uses for it. */
export function bodyWord(body: Body): string {
  return body === "lok-sabha" ? "Lok Sabha" : "Assembly";
}

/** "Assembly Election", "Lok Sabha By-election" — the type, in the words a reader uses for it. */
export function typeOf(body: Body, fill: Fill): string {
  const house = bodyWord(body);
  return fill === "bypoll" ? `${house} By-election` : `${house} Election`;
}

/**
 * An election's label in a year picker, in words rather than in codes: '2021', '2021 by-poll', 'LS 2019',
 * 'LS 2019 by-poll'. Short because twelve of them share a strip; the strip's own body is the context for an
 * assembly year, so only a Lok Sabha year says which body it is.
 */
export function chipOf(body: Body, fill: Fill, year: number): string {
  const lead = body === "lok-sabha" ? "LS " : "";
  return fill === "bypoll" ? `${lead}${year} by-poll` : `${lead}${year}`;
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
 * SQL for "not a by-election" — an election that fills its whole house. `alias` is the election table's alias
 * in the query, or its own name where the query gives it none. Portable (plain comparison, no dialect
 * functions).
 */
export function fullHouse(alias = "e"): string {
  return `${alias}.kind <> 'bypoll'`;
}

/** `fullHouse`, inverted: the by-elections. */
export function byElection(alias = "e"): string {
  return `${alias}.kind = 'bypoll'`;
}

export const FULL_HOUSE = fullHouse("e");

/**
 * Chronological order for elections, newest first — the ONLY ordering any surface may rank by. `alias` is the
 * election table's alias in the query.
 *
 * An election id is only accidentally chronological. It sorts by the middle of the string, so by id the
 * election after `wb-bypoll-ae-2021` is `wb-bypoll-ge-2016`, five years EARLIER, and `ka-bypoll-ge-2021`
 * outranks `ka-assembly-2023`. Chronology is (year, polling_month, occurrence), as docs/model/
 * election-identity.md says; the id only breaks a tie, so the order is total.
 *
 * `polling_month` is NULL for the elections whose month was never sourced (it is not derived from a
 * five-year term), so it is coalesced rather than allowed to reorder a year. SQLite sorts a NULL smallest
 * and Postgres largest, so a bare `polling_month` would rank those elections differently in dev and prod
 * (ADR 0001); the 0 fixes them last on DESC and first on ASC in both.
 */
export function chronoDesc(alias = "e"): string {
  return `${alias}.year DESC, COALESCE(${alias}.polling_month, 0) DESC, ${alias}.occurrence DESC, ${alias}.id DESC`;
}

/** `chronoDesc`, oldest first: the exact mirror, id tie-break included. */
export function chronoAsc(alias = "e"): string {
  return `${alias}.year ASC, COALESCE(${alias}.polling_month, 0) ASC, ${alias}.occurrence ASC, ${alias}.id ASC`;
}

export const CHRONO_DESC = chronoDesc("e");
export const CHRONO_ASC = chronoAsc("e");

/**
 * SQL for "an election of this body". `alias` is the election table's alias in the query.
 *
 * From `house`, the column that says which body was elected, the same as `facetOf`.
 */
export function bodyIs(body: Body, alias = "e"): string {
  return `${alias}.house = '${body === "lok-sabha" ? "pc" : "ac"}'`;
}

/**
 * SQL for the ids of the CURRENT election of `body` in each jurisdiction: its newest full-house election, by
 * chronology. Meant for `x IN (...)`; it binds nothing and its `e` is its own, so it nests in any query.
 *
 * A by-election never is current. Four seats falling vacant do not replace the election that formed the
 * house, and Jammu & Kashmir's newest row is a single-seat by-election on 87 seats' worth of state.
 *
 * Per jurisdiction because that is how a house is held: an assembly election belongs to its state, and a
 * general election is one row for the union (`in`), so asking for the Lok Sabha yields one id.
 * `currentElection` in repo/elections.ts is this rule as a verb; a query that must count over every
 * jurisdiction's current election embeds this directly rather than spelling the rule a third time.
 */
export function currentIds(body: Body): string {
  return (
    `SELECT id FROM (SELECT e.id AS id, ` +
    `row_number() OVER (PARTITION BY e.jurisdiction_place_id ORDER BY ${CHRONO_DESC}) AS rn ` +
    `FROM election e WHERE ${bodyIs(body)} AND ${FULL_HOUSE}) WHERE rn = 1`
  );
}

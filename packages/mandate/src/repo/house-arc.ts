// The house as the parliament arc draws it: how many seats each party holds, how many nobody was declared to hold, and how far the
// leading party is from a majority.
//
// The arc is of the whole house, so it takes every seat of the election, not the list the reader has narrowed to; a party chosen
// on the page is highlighted in the picture, never removed from it. It exists only for a house that decides something: a
// by-election has no majority, and a "majority 148" over four dots would be a claim the registry does not make.
//
// A DELEGATION IS NOT A HOUSE. The state page can show the Lok Sabha election narrowed to the state's own seats, 42 of 543 for West
// Bengal. Those are worth drawing, but they are not "the house": a party with 29 of them does not hold the Lok Sabha, and a
// majority of the 42 is a number about nothing. For that scope the arc has the seats and no majority to be short of.
//
// PARTIES ARE ORDERED BY SEATS and then by key. The registry holds no left-to-right or alliance data, so the order says nothing
// about either, and the page says so; the key breaks a tie so the same election always draws the same arc.

export type ArcParty = { key: string; label: string; n: number };

export type HouseArc = {
  /** Every seat of the house. */
  total: number;
  /** Parties that hold at least one seat, most seats first. */
  parties: ArcParty[];
  /** Seats with no declared winner: in no party, and drawn as what they are. */
  undeclared: number;
  /** The seats a majority needs: null for a delegation, which is part of a house and has no majority of its own. */
  majority: number | null;
  leader: ArcParty | null;
  /** How many seats the leader lacks of a majority; null once it has one. */
  shortBy: number | null;
};

export function houseArc(
  seats: readonly { partyKey: string | null; partyLabel: string | null }[],
  majority: number | null,
  scope: "house" | "delegation" = "house",
): HouseArc | null {
  if (seats.length === 0) return null;
  // A house that decides nothing has no arc. A delegation has one, but not a majority, whatever number the caller was given.
  if (scope === "house" && majority === null) return null;
  const needed = scope === "delegation" ? null : majority;
  const held = new Map<string, ArcParty>();
  let undeclared = 0;
  for (const s of seats) {
    if (s.partyKey === null) {
      undeclared += 1;
      continue;
    }
    const party = held.get(s.partyKey);
    if (party === undefined) held.set(s.partyKey, { key: s.partyKey, label: s.partyLabel ?? s.partyKey, n: 1 });
    else party.n += 1;
  }
  const parties = [...held.values()].sort((a, b) => b.n - a.n || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const leader = parties[0] ?? null;
  return {
    total: seats.length,
    parties,
    undeclared,
    majority: needed,
    leader,
    shortBy: leader !== null && needed !== null && leader.n < needed ? needed - leader.n : null,
  };
}

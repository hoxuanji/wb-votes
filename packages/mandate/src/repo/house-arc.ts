// The house as the parliament arc draws it: how many seats each party holds, how many nobody was declared to hold, and how far the
// leading party is from a majority.
//
// The arc is of the whole house, so it takes every seat of the election, not the list the reader has narrowed to; a party chosen
// on the page is highlighted in the picture, never removed from it. It exists only for a house that decides something: a
// by-election has no majority, and a "majority 148" over four dots would be a claim the registry does not make.
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
  /** The seats a majority needs. */
  majority: number;
  leader: ArcParty | null;
  /** How many seats the leader lacks of a majority; null once it has one. */
  shortBy: number | null;
};

export function houseArc(
  seats: readonly { partyKey: string | null; partyLabel: string | null }[],
  majority: number | null,
): HouseArc | null {
  if (majority === null || seats.length === 0) return null;
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
    majority,
    leader,
    shortBy: leader !== null && leader.n < majority ? majority - leader.n : null,
  };
}

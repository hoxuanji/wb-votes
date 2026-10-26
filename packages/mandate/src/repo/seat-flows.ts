// How seats moved between parties from one election to the next: for each previous holder, how many of its seats each party won.
//
// A SEAT CAN ONLY BE COMPARED WITH ITSELF. A seat whose boundary was redrawn between the two elections has no predecessor
// (`comparable` is false), and one whose winner is undeclared at either election has no pair (`flip` is null). Neither enters a
// flow. Both are counted apart and returned, because a picture of "how power moved" that quietly dropped seats would claim a
// whole it was not drawn from: the page says how many it left out and why.
//
// HELD OR FLIPPED is the comparison's own reading, by party: a flow whose previous holder is its winner is a hold. An independent
// replaced by another independent is a hold, as in findings.ts.

export type Flow = { from: string; to: string; n: number };

export type SeatFlows = {
  /** Every party a flow starts or ends at, once, most involved first, a tie broken by key. */
  parties: { key: string; label: string }[];
  /** Most seats first, then previous holder, then winner. */
  flows: Flow[];
  /** Seats in a flow: held plus flipped. */
  compared: number;
  held: number;
  flipped: number;
  /** Seats that are in no flow, by why. `compared` plus both of these is every seat. */
  left: { incomparable: number; undeclared: number };
};

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function seatFlows(
  seats: readonly {
    partyKey: string | null;
    partyLabel: string | null;
    comparable: boolean;
    flip: { from: { key: string; label: string } } | null;
  }[],
): SeatFlows {
  const cells = new Map<string, Flow>();
  const labels = new Map<string, string>();
  const involved = new Map<string, number>();
  const left = { incomparable: 0, undeclared: 0 };
  let held = 0;
  let flipped = 0;

  for (const s of seats) {
    if (!s.comparable) {
      left.incomparable += 1;
      continue;
    }
    // A flip with no winner cannot be a flow to nobody: the seat is undeclared whatever the flip says.
    if (s.flip === null || s.partyKey === null) {
      left.undeclared += 1;
      continue;
    }
    const from = s.flip.from.key;
    const to = s.partyKey;
    const cell = `${from}\u0000${to}`;
    const flow = cells.get(cell);
    if (flow === undefined) cells.set(cell, { from, to, n: 1 });
    else flow.n += 1;
    if (!labels.has(from)) labels.set(from, s.flip.from.label);
    if (!labels.has(to)) labels.set(to, s.partyLabel ?? to);
    involved.set(from, (involved.get(from) ?? 0) + 1);
    involved.set(to, (involved.get(to) ?? 0) + 1);
    if (from === to) held += 1;
    else flipped += 1;
  }

  return {
    parties: [...labels.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => (involved.get(b.key) ?? 0) - (involved.get(a.key) ?? 0) || byText(a.key, b.key)),
    flows: [...cells.values()].sort((a, b) => b.n - a.n || byText(a.from, b.from) || byText(a.to, b.to)),
    compared: held + flipped,
    held,
    flipped,
    left,
  };
}

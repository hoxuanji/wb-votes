// The geometry of the front page's two pictures, as numbers and nothing else: the houses a party filled, and how far a party's seats
// ran from its votes. Pure, no I/O, no markup; the component draws what these return.

/** One piece of a house's bar, in drawing order. `lead` is anchored left and `partner` right; neither position says anything else. */
export type HouseSeg = {
  role: "lead" | "party" | "others" | "none" | "partner";
  /** The party's key; null for the hatched tail and the undeclared remainder, which are no party's. */
  key: string | null;
  label: string;
  n: number;
  /** Of the whole house, so every segment of one bar sums to 1 when the tally and the undeclared seats are every seat. */
  share: number;
};

/** A party with this share of the house or more is drawn as its own segment; the rest are added together. */
export const OWN_SEGMENT = 0.04;

/**
 * One house as segments: the lead party from the left edge, the parties between them that hold at least `minShare` of the house, one
 * hatched segment for the smaller parties added together, a hollow one for seats with no declared winner, and the partner at the right.
 * A party with no seat has no segment. Nothing is dropped: every seat of the tally is in exactly one segment.
 */
export function houseSegments(i: {
  tally: readonly { key: string; label: string; seats: number }[];
  total: number;
  undeclared: number;
  lead: string;
  partner: string | null;
  minShare?: number;
}): HouseSeg[] {
  const min = i.minShare ?? OWN_SEGMENT;
  const share = (n: number): number => (i.total > 0 ? n / i.total : 0);
  const seg = (role: HouseSeg["role"], key: string | null, label: string, n: number): HouseSeg => ({ role, key, label, n, share: share(n) });
  const held = i.tally.filter((t) => t.seats > 0);
  const find = (key: string | null) => (key === null ? undefined : held.find((t) => t.key === key));
  const lead = find(i.lead);
  const partner = i.partner === i.lead ? undefined : find(i.partner);
  const between = held
    .filter((t) => t !== lead && t !== partner)
    .sort((a, b) => b.seats - a.seats || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const own = between.filter((t) => share(t.seats) >= min);
  const small = between.filter((t) => share(t.seats) < min);
  const added = small.reduce((n, t) => n + t.seats, 0);
  return [
    ...(lead === undefined ? [] : [seg("lead", lead.key, lead.label, lead.seats)]),
    ...own.map((t) => seg("party", t.key, t.label, t.seats)),
    ...(added === 0 ? [] : [seg("others", null, `${small.length} other ${small.length === 1 ? "party" : "parties"}`, added)]),
    ...(i.undeclared === 0 ? [] : [seg("none", null, "no declared winner", i.undeclared)]),
    ...(partner === undefined ? [] : [seg("partner", partner.key, partner.label, partner.seats)]),
  ];
}

/** Half the house, where the majority tick is drawn; the seats a majority needs are the next whole number up. */
export const halfHouse = (total: number): number => total / 2;

/**
 * Where two measures of one party sit on one axis, as positions from 0 to 1 and the line between them. A null measure has no mark and
 * the line has no end there: nothing is placed at zero for a number that was not published.
 */
export function dumbbell(i: { a: number | null; b: number | null; min: number; max: number }): {
  ax: number | null;
  bx: number | null;
  from: number | null;
  to: number | null;
  gap: number | null;
} {
  const at = (v: number | null): number | null => (v === null ? null : (v - i.min) / (i.max - i.min));
  const ax = at(i.a);
  const bx = at(i.b);
  const both = ax !== null && bx !== null;
  return {
    ax,
    bx,
    from: both ? Math.min(ax, bx) : null,
    to: both ? Math.max(ax, bx) : null,
    gap: i.a !== null && i.b !== null ? i.b - i.a : null,
  };
}

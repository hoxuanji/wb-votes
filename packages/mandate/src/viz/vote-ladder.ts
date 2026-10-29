// The vote ladder, as numbers: one bar per election, each a 100% bar of the votes polled, in ONE party order from row to row so that a party sits
// in about the same place each time, and ribbons between two counted rows for a party present exactly once in both.
//
// WHAT IT MAY SAY, held by the tests: a ribbon joins the same party across two elections and is not a count of voters who moved; a ribbon is drawn only
// between two COUNTED rows (never into an election with no candidate votes); a party outside a row's listed candidates is simply absent from that row;
// what no candidate accounts for is left unfilled and never called "Others"; and a declared or empty election is a row with nothing proportional in it.

export type LadderSeg = {
  /** The party's key, or null for the lowest candidates added together. */
  key: string | null;
  label: string;
  /** Percent of the votes polled. */
  share: number;
  winner: boolean;
  /** The segment is the tail added together. */
  tail: boolean;
  /** The candidate, for the hover text; null for the tail. */
  name: string | null;
};

export type LadderRowIn = {
  id: string;
  label: string;
  /** Candidate votes on record; a declared winner with no votes; or no result. */
  evidence: "counted" | "declared" | "none";
  segments: readonly LadderSeg[];
  /** The percent of the votes polled that no segment accounts for. */
  unitemised: number;
  /** The percent the bar is drawn to: 100, or what the shares add up to where that is more. */
  scale: number;
};

export type PlacedSeg = LadderSeg & { start: number; width: number };
export type LadderRow = Omit<LadderRowIn, "segments"> & { segments: PlacedSeg[] };
export type Ribbon = { key: string; points: string; followed: boolean };

const r2 = (n: number): number => Math.round(n * 100) / 100;

/** The party order every row shares: total share over the counted rows, largest first, then by key, so the order is the same on every request. */
export function partyOrder(rows: readonly LadderRowIn[]): string[] {
  const total = new Map<string, number>();
  for (const r of rows) {
    if (r.evidence !== "counted") continue;
    for (const s of r.segments) if (s.key !== null) total.set(s.key, (total.get(s.key) ?? 0) + s.share);
  }
  return [...total.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([k]) => k);
}

/**
 * The rows placed on one scale, and the ribbons between each adjacent pair of counted rows. A ribbon is a polygon in a box 100 wide and `height`
 * tall: its top edge is the party's span in the row above and its bottom edge its span in the row below.
 */
export function voteLadder(
  rows: readonly LadderRowIn[],
  o: { followed?: string | null; height?: number } = {},
): { order: string[]; rows: LadderRow[]; ribbons: Ribbon[][] } {
  const height = o.height ?? 20;
  const order = partyOrder(rows);
  const rank = new Map(order.map((k, i) => [k, i]));
  const placed: LadderRow[] = rows.map((r) => {
    const sorted = [...r.segments].sort(
      (a, b) =>
        (a.tail ? 1 : 0) - (b.tail ? 1 : 0) ||
        (rank.get(a.key ?? "") ?? order.length) - (rank.get(b.key ?? "") ?? order.length) ||
        b.share - a.share,
    );
    let at = 0;
    const segments = sorted.map((s): PlacedSeg => {
      const width = r.scale > 0 ? (100 * s.share) / r.scale : 0;
      const p = { ...s, start: r2(at), width: r2(width) };
      at += width;
      return p;
    });
    return { ...r, segments };
  });

  const ribbons: Ribbon[][] = placed.map((a, i) => {
    const b = placed[i + 1];
    if (b === undefined || a.evidence !== "counted" || b.evidence !== "counted") return [];
    const once = (row: LadderRow, key: string): PlacedSeg | null => {
      const m = row.segments.filter((s) => s.key === key && !s.tail);
      return m.length === 1 ? (m[0] as PlacedSeg) : null;
    };
    return order.flatMap((key) => {
      const top = once(a, key);
      const bottom = once(b, key);
      if (top === null || bottom === null) return [];
      return [
        {
          key,
          followed: o.followed === key,
          points: `${top.start},0 ${r2(top.start + top.width)},0 ${r2(bottom.start + bottom.width)},${height} ${bottom.start},${height}`,
        },
      ];
    });
  });
  return { order, rows: placed, ribbons };
}

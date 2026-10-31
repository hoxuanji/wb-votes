// Margins as columns on ONE scale, as numbers: how tall each is as a share of the largest, which way it points, and whether it is declared.
//
// One zero-based linear scale across every column, so that two bars can be compared by eye; a column with no margin is blank and never zero; and a
// margin that was declared and not counted is `dashed`, so a reader is never shown a declared figure as a counted one. Margins are never subtracted
// across the line between counted and declared.

export type MarginCol = {
  id: string;
  label: string;
  /** Signed where `signed` (ahead of the runner-up is positive, behind the winner negative); null where there is no margin. */
  votes: number | null;
  basis: "counted" | "declared" | null;
  key: string | null;
  /** The seat changed hands at this election: a rule is drawn on this column. */
  changedHands: boolean;
};

export type PlacedCol = { id: string; frac: number; dir: "up" | "down" | "none"; dashed: boolean; key: string | null; handRule: boolean };

export function marginColumns(cols: readonly MarginCol[], o: { signed: boolean }): { max: number; cols: PlacedCol[] } {
  const max = Math.max(1, ...cols.map((c) => (c.votes === null ? 0 : Math.abs(c.votes))));
  return {
    max,
    cols: cols.map((c) => ({
      id: c.id,
      frac: c.votes === null ? 0 : Math.abs(c.votes) / max,
      dir: c.votes === null ? "none" : o.signed && c.votes < 0 ? "down" : "up",
      dashed: c.basis === "declared",
      key: c.key,
      handRule: c.changedHands,
    })),
  };
}

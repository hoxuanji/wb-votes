// Turnout for three nested populations on one axis, as numbers: where the seat, its district and its state sit. A dot plot on a stated axis that does
// not start at zero, because a bar from zero would show a gap of one to three points as nothing; the axis floor is returned so the page can print it.
//
// A figure that is not on record is a null and is never placed: a district with nothing to compare, or an election whose turnout is withheld.

export type TurnoutRowIn = { id: string; label: string; seat: number | null; district: number | null; state: number | null };
export type Placed = { seatX: number | null; districtX: number | null; stateX: number | null };

/** The rows are returned as they came, with their positions added: a row may carry more than the figures (a flag that it is withheld). */
export function turnoutDots<T extends TurnoutRowIn>(rows: readonly T[]): { min: number; max: number; rows: (T & Placed)[] } {
  const values = rows.flatMap((r) => [r.seat, r.district, r.state]).filter((v): v is number => v !== null);
  if (values.length === 0) return { min: 0, max: 100, rows: rows.map((r) => ({ ...r, seatX: null, districtX: null, stateX: null })) };
  // Whole percents, a little room either side, and never past 100 or under 0.
  const min = Math.max(0, Math.floor(Math.min(...values) / 5) * 5 - 5);
  const max = Math.min(100, Math.ceil(Math.max(...values) / 5) * 5 + 5);
  const at = (v: number | null): number | null => (v === null ? null : Math.round(((v - min) / (max - min)) * 10000) / 10000);
  return { min, max, rows: rows.map((r) => ({ ...r, seatX: at(r.seat), districtX: at(r.district), stateX: at(r.state) })) };
}

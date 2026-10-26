// Where the boxes and ribbons of a seat-flow picture go.
//
// The picture has two columns of parties: on the left who held the seats before, on the right who won them now. Each party is a box as
// tall as its seats, and a ribbon runs from each previous holder to each winner, as thick as the seats that moved. Everything is
// measured in the picture's own units (FLOW_H tall; 0 to 100 across, which the ribbons' SVG stretches to its width), so the geometry is
// held on literal flows in flow-layout.test.ts and the component only draws it.
//
// EACH COLUMN HAS ITS OWN SCALE. Both columns hold the same seats, but a column with more boxes spends more of its height on the gaps
// between them, so a seat is a hair taller in the column with fewer boxes. A ribbon is as thick at each end as the seats it carries in
// that column's unit, which is what keeps it filling its box exactly.
//
// A TAIL IS FOLDED, NOT DROPPED. A side shows its six biggest parties and the rest as one "Others (n)" box, but only when that saves
// something: seven parties are seven boxes, because "Others (1)" would hide a name to save none. Ribbons into or out of the fold are
// added together, and a ribbon from the fold to the fold is "mixed", since it holds some holds and some moves.

export const FLOW_H = 260;
/** Between two boxes of a column, as the 2px that separates every touching mark. */
export const NODE_GAP = 2;
/** A box shorter than this does not clear its own line of type, so it carries no name; the picture's key names it instead. */
export const NAME_MIN = 14;
/** The key of the box that holds the folded tail. A party's key is never empty. */
export const OTHERS = "";

const NAMED = 6;
const FOLD_OVER = 7;

export type FlowNode = {
  key: string;
  label: string;
  seats: number;
  /** How many parties the box holds: 0 for a party, the size of the tail for Others. */
  folded: number;
  /** Whether the box is tall enough to carry its name. */
  named: boolean;
  y0: number;
  y1: number;
};

export type FlowRibbon = {
  from: string;
  to: string;
  n: number;
  movement: "held" | "moved" | "mixed";
  fromY0: number;
  fromY1: number;
  toY0: number;
  toY1: number;
  path: string;
};

export type FlowLayout = { from: FlowNode[]; to: FlowNode[]; ribbons: FlowRibbon[] };

type Input = { from: string; to: string; n: number };

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const two = (v: number): string => String(Math.round(v * 100) / 100);

/** A column's party keys, most seats first, a tie by key. */
function ranked(totals: ReadonlyMap<string, number>): string[] {
  return [...totals.entries()].sort((a, b) => b[1] - a[1] || byText(a[0], b[0])).map((e) => e[0]);
}

/** The boxes of one column: the parties kept, then the fold, stacked from the top with a gap between them. */
function column(
  keys: readonly string[],
  kept: ReadonlySet<string>,
  totals: ReadonlyMap<string, number>,
  labelOf: (key: string) => string,
  total: number,
): FlowNode[] {
  const rest = keys.filter((k) => !kept.has(k));
  const boxes = [
    ...keys.filter((k) => kept.has(k)).map((k) => ({ key: k, label: labelOf(k), seats: totals.get(k) ?? 0, folded: 0 })),
    ...(rest.length === 0
      ? []
      : [{ key: OTHERS, label: `Others (${rest.length})`, seats: rest.reduce((s, k) => s + (totals.get(k) ?? 0), 0), folded: rest.length }]),
  ];
  const unit = (FLOW_H - NODE_GAP * (boxes.length - 1)) / total;
  let y = 0;
  return boxes.map((b) => {
    const node = { ...b, named: b.seats * unit >= NAME_MIN, y0: y, y1: y + b.seats * unit };
    y = node.y1 + NODE_GAP;
    return node;
  });
}

export function flowLayout(flows: readonly Input[], labelOf: (key: string) => string): FlowLayout {
  if (flows.length === 0) return { from: [], to: [], ribbons: [] };

  const leaving = new Map<string, number>();
  const arriving = new Map<string, number>();
  for (const f of flows) {
    leaving.set(f.from, (leaving.get(f.from) ?? 0) + f.n);
    arriving.set(f.to, (arriving.get(f.to) ?? 0) + f.n);
  }
  const fromKeys = ranked(leaving);
  const toKeys = ranked(arriving);
  const keep = (keys: readonly string[]): Set<string> => new Set(keys.length > FOLD_OVER ? keys.slice(0, NAMED) : keys);
  const keptFrom = keep(fromKeys);
  const keptTo = keep(toKeys);
  const total = flows.reduce((s, f) => s + f.n, 0);

  const from = column(fromKeys, keptFrom, leaving, labelOf, total);
  const to = column(toKeys, keptTo, arriving, labelOf, total);
  const fromAt = new Map(from.map((n, i) => [n.key, i]));
  const toAt = new Map(to.map((n, i) => [n.key, i]));
  const unitOf = (nodes: readonly FlowNode[]): number => (FLOW_H - NODE_GAP * (nodes.length - 1)) / total;

  // The ribbons between boxes: flows into or out of the fold are added together.
  const cells = new Map<string, { from: string; to: string; n: number }>();
  for (const f of flows) {
    const a = keptFrom.has(f.from) ? f.from : OTHERS;
    const b = keptTo.has(f.to) ? f.to : OTHERS;
    const id = `${a}\u0000${b}`;
    const cell = cells.get(id);
    if (cell === undefined) cells.set(id, { from: a, to: b, n: f.n });
    else cell.n += f.n;
  }
  const list = [...cells.values()];

  // Inside a box, ribbons are stacked in the order of the boxes they go to (or come from), so none crosses its neighbour near the box.
  const place = (side: "from" | "to"): Map<string, [number, number]> => {
    const nodes = side === "from" ? from : to;
    const unit = unitOf(nodes);
    const cursor = new Map(nodes.map((n) => [n.key, n.y0]));
    const other = side === "from" ? toAt : fromAt;
    const mine = (c: { from: string; to: string }): string => (side === "from" ? c.from : c.to);
    const theirs = (c: { from: string; to: string }): string => (side === "from" ? c.to : c.from);
    const spans = new Map<string, [number, number]>();
    const order = [...list].sort(
      (a, b) =>
        (side === "from" ? fromAt : toAt).get(mine(a))! - (side === "from" ? fromAt : toAt).get(mine(b))! ||
        other.get(theirs(a))! - other.get(theirs(b))!,
    );
    for (const c of order) {
      const y0 = cursor.get(mine(c))!;
      const y1 = y0 + c.n * unit;
      cursor.set(mine(c), y1);
      spans.set(`${c.from}\u0000${c.to}`, [y0, y1]);
    }
    return spans;
  };
  const leaves = place("from");
  const enters = place("to");

  const ribbons = list
    .sort((a, b) => fromAt.get(a.from)! - fromAt.get(b.from)! || toAt.get(a.to)! - toAt.get(b.to)!)
    .map((c): FlowRibbon => {
      const [fromY0, fromY1] = leaves.get(`${c.from}\u0000${c.to}`)!;
      const [toY0, toY1] = enters.get(`${c.from}\u0000${c.to}`)!;
      return {
        from: c.from,
        to: c.to,
        n: c.n,
        movement: c.from === OTHERS && c.to === OTHERS ? "mixed" : c.from === c.to ? "held" : "moved",
        fromY0,
        fromY1,
        toY0,
        toY1,
        path:
          `M0 ${two(fromY0)} C50 ${two(fromY0)} 50 ${two(toY0)} 100 ${two(toY0)} ` +
          `L100 ${two(toY1)} C50 ${two(toY1)} 50 ${two(fromY1)} 0 ${two(fromY1)} Z`,
      };
    });

  return { from, to, ribbons };
}

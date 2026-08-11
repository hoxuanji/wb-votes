// Label anchors for an SVG choropleth.
//
// A polygon needs a point to hang its label on, and the obvious two candidates are both wrong for India.
// The bounding-box centre falls outside Gujarat and lands in the Arabian Sea; the mean of the vertices is
// dragged by wherever the outline happens to be most finely sampled, which for a coastline is the coast.
//
// This uses the area-weighted centroid of the LARGEST RING. Largest, because a state is not one polygon:
// Andaman & Nicobar is hundreds of islands, and a centroid over all of them sits in open water between
// them. Area-weighted, because that is the centroid a reader would point at.
//
// It also returns the ring's area, which is the only honest way to decide whether a label fits: a 4pt
// abbreviation inside Sikkim is unreadable and overlaps its neighbours, so small states get no label and
// are read from the table instead.

/** The paths in data/geo/india-states.json use only M, L and Z, with absolute coordinates. */
const RING = /M([^MZ]*)/g;

export type Anchor = {
  x: number;
  y: number;
  /** Area of the ring the anchor came from, in viewBox units². The label-fits test reads this. */
  area: number;
  /** Extent of that ring, so a long abbreviation can be checked against the width it has. */
  width: number;
  height: number;
};

/**
 * The anchor for one path. Returns null for a path with no usable ring, which is a data problem and must
 * not become a label at 0,0.
 */
export function anchorOf(d: string): Anchor | null {
  let best: Anchor | null = null;
  for (const [, body] of d.matchAll(RING)) {
    const nums = (body ?? "").match(/-?\d*\.?\d+/g);
    if (nums === null || nums.length < 6) continue;
    const pts: [number, number][] = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      pts.push([Number(nums[i]), Number(nums[i + 1])]);
    }
    // Shoelace: twice the signed area, and the area-weighted centroid in the same pass.
    let a2 = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < pts.length; i += 1) {
      const [x0, y0] = pts[i] as [number, number];
      const [x1, y1] = pts[(i + 1) % pts.length] as [number, number];
      const cross = x0 * y1 - x1 * y0;
      a2 += cross;
      cx += (x0 + x1) * cross;
      cy += (y0 + y1) * cross;
    }
    const area = Math.abs(a2) / 2;
    if (area <= 0 || best !== null && area <= best.area) continue;
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    best = {
      // 3 * a2 because the centroid sum above is over (x0+x1) * cross, which is 6× the area × the centroid.
      x: cx / (3 * a2),
      y: cy / (3 * a2),
      area,
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  }
  return best;
}

/**
 * Whether a label of `chars` characters at `size` px fits inside the ring an anchor came from.
 *
 * Monospace at this size runs about 0.62em per character, and a label needs a little clear space around it
 * or it reads as touching the border. A state that fails this gets no label — never a smaller font, which
 * just moves the illegibility rather than removing it.
 */
export function labelFits(a: Anchor, chars: number, size: number): boolean {
  const w = chars * size * 0.62;
  return a.width > w * 1.25 && a.height > size * 2.1 && a.area > w * size * 3;
}

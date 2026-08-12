// One projection for the whole product, and the ring simplification that goes with it.
//
// WHY THIS IS ITS OWN MODULE. Until Phase 3 the projection lived inside `ops/geo/build-india.mjs`, which was
// fine while one asset used it. Now the national basemap, every district outline, 4,182 assembly
// constituencies and 543 parliamentary ones all have to land in the SAME coordinate space — otherwise a
// state map cannot draw a constituency next to a district line, and `place_geometry.view_box` becomes a
// warning nobody can act on. So the projection is declared once, here, imported by the asset builder and by
// the geometry importer, and its constants are also written into `data/geo/sources.json` so an operator can
// see what space the registry's paths are in without reading code.
//
// Equirectangular, scaled at the 22N parallel. India spans ~68-97E and 6-37N; anything fancier buys nothing
// at the size this renders at and costs a dependency.

/** The declared constants. Same numbers as `data/geo/sources.json`'s `projection` block, and a test says so. */
export const PROJECTION = { lon0: 68, lat0: 37.2, scale: 22, parallel: 22 } as const;

const COS = Math.cos((PROJECTION.parallel * Math.PI) / 180);

/** Longitude/latitude in EPSG:4326 to the shared SVG space. y grows downward, as SVG does. */
export function project([lon, lat]: readonly [number, number]): [number, number] {
  return [(lon - PROJECTION.lon0) * PROJECTION.scale * COS, (PROJECTION.lat0 - lat) * PROJECTION.scale];
}

/** Douglas-Peucker, in projected units. */
function dp(points: readonly [number, number][], tol: number): [number, number][] {
  if (points.length < 3) return [...points];
  let maxD = -1;
  let idx = 0;
  const [ax, ay] = points[0] as [number, number];
  const [bx, by] = points[points.length - 1] as [number, number];
  const dx = bx - ax;
  const dy = by - ay;
  const norm = Math.hypot(dx, dy) || 1e-12;
  for (let i = 1; i < points.length - 1; i += 1) {
    const [px, py] = points[i] as [number, number];
    const d = Math.abs(dy * px - dx * py + bx * ay - by * ax) / norm;
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= tol) return [points[0] as [number, number], points[points.length - 1] as [number, number]];
  return [...dp(points.slice(0, idx + 1), tol).slice(0, -1), ...dp(points.slice(idx), tol)];
}

/**
 * Douglas-Peucker on a CLOSED ring, which is not the same problem.
 *
 * A ring's first and last point are the same point, so the baseline DP measures against has zero length,
 * every perpendicular distance is zero, and the algorithm simplifies every polygon in India out of
 * existence. (Measured, once: 25,482 points in, 0 out.) The ring is cut at its two most distant points
 * first, and each half simplified as an open line.
 */
export function simplifyRing(points: readonly [number, number][], tol: number): [number, number][] {
  const closed =
    points.length > 1 &&
    points[0]?.[0] === points[points.length - 1]?.[0] &&
    points[0]?.[1] === points[points.length - 1]?.[1];
  const ring = closed ? points.slice(0, -1) : [...points];
  if (ring.length < 4) return ring as [number, number][];
  let far = 1;
  let farD = -1;
  const [x0, y0] = ring[0] as [number, number];
  for (let i = 1; i < ring.length; i += 1) {
    const [x, y] = ring[i] as [number, number];
    const d = Math.hypot(x - x0, y - y0);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const a = dp(ring.slice(0, far + 1) as [number, number][], tol);
  const b = dp([...ring.slice(far), ring[0]] as [number, number][], tol);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/** Signed area of a ring, in projected units². Sign is orientation; callers want the magnitude. */
export function ringArea(points: readonly [number, number][]): number {
  let s = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i] as [number, number];
    const [x2, y2] = points[(i + 1) % points.length] as [number, number];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

/** `x y w h` of a set of rings. */
export function boxOfRings(rings: readonly (readonly [number, number][])[]): [number, number, number, number] {
  let a = Infinity;
  let b = Infinity;
  let c = -Infinity;
  let d = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < a) a = x;
      if (x > c) c = x;
      if (y < b) b = y;
      if (y > d) d = y;
    }
  }
  return a === Infinity ? [0, 0, 0, 0] : [a, b, c - a, d - b];
}

/** One SVG path from a set of rings, absolute M/L/Z only — what `anchorOf` and the map both expect. */
export function pathOfRings(rings: readonly (readonly [number, number][])[], precision = 1): string {
  return rings
    .filter((r) => r.length >= 3)
    .map((r) => `M${r.map(([x, y]) => `${x.toFixed(precision)} ${y.toFixed(precision)}`).join("L")}Z`)
    .join("");
}

/** Every ring of a GeoJSON geometry, outer and inner alike. */
export function ringsOf(g: { type?: string; coordinates?: unknown } | null | undefined): [number, number][][] {
  if (g === null || g === undefined) return [];
  if (g.type === "Polygon") return (g.coordinates as [number, number][][]) ?? [];
  if (g.type === "MultiPolygon") return ((g.coordinates as [number, number][][][]) ?? []).flat();
  return [];
}

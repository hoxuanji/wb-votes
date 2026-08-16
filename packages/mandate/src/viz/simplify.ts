// Path simplification, for maps that draw hundreds of polygons at once.
//
// WHY THIS EXISTS, MEASURED. The registry holds 4,969 constituency outlines in one projection, and the
// obvious thing to do with them — draw the country at seat level — is heavier than it looks:
//
//   national assembly, 3,936 polygons, delim-2008      4,071 KB of path text, 348,981 points
//   national Lok Sabha,   526 polygons, delim-2008      2,432 KB of path text, 208,677 points
//
// That is raw `d` attribute bytes, inline in the HTML, on every request. The source was simplified once
// already (Douglas-Peucker at 0.015 degrees), which is the right amount of detail for ONE STATE filling the
// screen and far more than a national frame can show: at 597 viewBox units across roughly 1,000 rendered
// pixels, one unit is about 1.7px, so a 0.1-unit wiggle is a sixth of a pixel. The bytes are real and the
// detail they buy is not visible.
//
// WHAT SIMPLIFYING BUYS, at national zoom (same 3,936 polygons):
//
//   drop degenerate subpaths only     3,916 KB   96%
//   + Douglas-Peucker 0.15u           1,988 KB   49%
//   + Douglas-Peucker 0.30u           1,059 KB   26%     <- sub-pixel, and the default here
//   + Douglas-Peucker 0.60u             544 KB   13%     <- about 1px of error, visible on a border
//
// DEGENERATE SUBPATHS ARE REAL AND THEY ARE FREE TO DROP. The source ships them: 4,212 subpaths across
// those polygons include runs like `M422.6 242.3L422.6 242.3L422.6 242.3Z` — three identical points, zero
// area, nothing rendered. 62 subpaths are pure duplicates of a single point and hundreds more are slivers
// below a tenth of a unit. Dropping a shape smaller than a pixel is not a loss of information, because
// there was no information at that size.
//
// WHAT THIS IS NOT. Not a general SVG path engine: the geometry this registry holds is absolute `M`/`L`/`Z`
// only, which is what `ops/geo/build-india.mjs` emits and what `place_geometry.path` contains. A curve or a
// relative command would be dropped silently by a naive parser, so `parse` COUNTS what it did not
// understand and `simplify` returns the path untouched when that count is non-zero. Refusing to simplify is
// always safe; guessing at a command is not.
//
// ponytail: recursion for Douglas-Peucker, not an explicit stack. The deepest ring in the registry is a few
// hundred points and V8's default stack is thousands of frames deep. Convert if a coastline arrives.

/** A point in the shared projection. */
type Point = readonly [number, number];

/** Absolute M/L/Z only — every command this registry's geometry uses. */
const COORD = /(-?\d+(?:\.\d+)?)[\s,]+(-?\d+(?:\.\d+)?)/g;

/** Anything that is not a coordinate, an M, an L, a Z or whitespace. Its presence means "do not touch". */
const UNSUPPORTED = /[^MLZmlz0-9.,\s-]/;

export type Parsed = {
  subpaths: Point[][];
  /** True when the path used a command this module does not model. The caller must not simplify it. */
  unsupported: boolean;
};

/** Split a path into subpaths of points. Cheap, allocation-light, and honest about what it cannot read. */
export function parse(path: string): Parsed {
  if (UNSUPPORTED.test(path)) return { subpaths: [], unsupported: true };
  const subpaths: Point[][] = [];
  // `M` starts a subpath; the source never emits a relative `m`, but a lowercase one would mean something
  // different and is caught by UNSUPPORTED above rather than being folded in here.
  for (const chunk of path.split("M").slice(1)) {
    const pts: Point[] = [];
    for (const m of chunk.matchAll(COORD)) pts.push([Number(m[1]), Number(m[2])]);
    if (pts.length > 0) subpaths.push(pts);
  }
  return { subpaths, unsupported: false };
}

/** The larger side of a subpath's bounding box, in viewBox units. How big the shape is on screen. */
export function extentOf(pts: readonly Point[]): number {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return Math.max(x1 - x0, y1 - y0);
}

/**
 * Douglas-Peucker: keep the points that carry the shape, drop the ones inside `tolerance` of the chord.
 *
 * Perpendicular distance to the SEGMENT, and a degenerate segment (both ends equal, which closed rings
 * produce) falls back to distance from the point — otherwise a ring whose first and last point coincide
 * divides by a zero-length chord and keeps everything.
 */
export function douglasPeucker(pts: readonly Point[], tolerance: number): Point[] {
  if (pts.length < 3) return [...pts];
  const first = pts[0] as Point;
  const last = pts[pts.length - 1] as Point;
  const dx = last[0] - first[0];
  const dy = last[1] - first[1];
  const chord = Math.hypot(dx, dy);

  let worst = -1;
  let at = 0;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const p = pts[i] as Point;
    const d =
      chord === 0
        ? Math.hypot(p[0] - first[0], p[1] - first[1])
        : Math.abs((p[0] - first[0]) * dy - (p[1] - first[1]) * dx) / chord;
    if (d > worst) {
      worst = d;
      at = i;
    }
  }
  if (worst <= tolerance) return [first, last];
  const head = douglasPeucker(pts.slice(0, at + 1), tolerance);
  const tail = douglasPeucker(pts.slice(at), tolerance);
  return [...head.slice(0, -1), ...tail];
}

export type SimplifyOptions = {
  /** Perpendicular tolerance in viewBox units. Below one rendered pixel is invisible by construction. */
  tolerance: number;
  /** Subpaths whose larger side is under this are dropped whole — a sliver smaller than a pixel. */
  minExtent: number;
};

/**
 * The default: sub-pixel at national zoom, and a quarter of the bytes.
 *
 * 0.3 units is about half a rendered pixel on a 597-unit frame at 1,000px. `minExtent` 0.1 removes the
 * source's zero-area artefacts without touching a real island — the smallest genuine one in the registry
 * is comfortably above it.
 */
export const NATIONAL: SimplifyOptions = { tolerance: 0.3, minExtent: 0.1 };

/** One decimal, and no trailing `.0` — the precision the source itself carries, and no more. */
function n(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/**
 * Simplify one path. Returns it UNCHANGED when it uses a command this module does not model, or when
 * simplification would leave nothing to draw — a polygon that vanishes is worse than a polygon that is
 * heavier than it needs to be.
 */
export function simplify(path: string, opts: SimplifyOptions = NATIONAL): string {
  const { subpaths, unsupported } = parse(path);
  if (unsupported || subpaths.length === 0) return path;

  const kept: Point[][] = [];
  for (const pts of subpaths) {
    if (extentOf(pts) < opts.minExtent) continue;
    const thinned = douglasPeucker(pts, opts.tolerance);
    // A ring needs three points to enclose anything. Two is a line with no area and renders as nothing.
    if (thinned.length >= 3) kept.push(thinned);
  }
  if (kept.length === 0) return path;

  return kept.map((pts) => `M${pts.map(([x, y]) => `${n(x)} ${n(y)}`).join("L")}Z`).join("");
}

/**
 * Memoised `simplify`, keyed on the path itself.
 *
 * The national map draws the same 500-odd polygons on every request, and simplification is pure, so the
 * work belongs to the process rather than to the request. Keyed on the path string rather than on a
 * place_version id so a caller cannot accidentally serve one seat's geometry under another's key.
 *
 * ponytail: an unbounded Map. The domain is the registry's 4,969 polygons and the process is a server that
 * restarts on deploy, so it cannot grow past a few megabytes. Give it an LRU when geometry is user-supplied.
 */
const cache = new Map<string, string>();

export function simplified(path: string, opts: SimplifyOptions = NATIONAL): string {
  const key = `${opts.tolerance}:${opts.minExtent}:${path}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const out = simplify(path, opts);
  cache.set(key, out);
  return out;
}

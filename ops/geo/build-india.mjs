// Build the India map asset from the district GeoJSON.
//
// Run:  node ops/geo/build-india.mjs /tmp/india.geojson
//
// Source: https://raw.githubusercontent.com/udit-001/india-maps-data (2011 census district boundaries,
// 760 features, one per district, each carrying st_nm). Its sha256 and URL are written into the output so
// the asset carries its own provenance — the same rule the registry's `source` table enforces.
//
// WHY AN ASSET AND NOT A REGISTRY TABLE. place_geometry is keyed by place_version_id, and a STATE has no
// place_version — only seats do. Giving 36 states versions in an epoch is a migration with a modelling
// question attached (a state's boundary changes with reorganisation, not with delimitation), and it should
// not be decided in the same commit that draws the first map. So the paths live in a generated file with a
// hash, and the ONE thing that matters is preserved: nothing is hand-drawn, and the file can be rebuilt
// from its source by anyone.
//
// Districts are not dissolved into state outlines. Each state's path is every one of its districts'
// rings concatenated, filled with one colour: the shared edges disappear under the fill, so it reads as a
// state shape while keeping district geometry for when district-level colour arrives.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const src = process.argv[2] ?? "/tmp/india.geojson";
const bytes = readFileSync(src);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const geo = JSON.parse(bytes.toString("utf8"));

/** Douglas-Peucker, in degrees. 0.015 is about 1.5km — invisible at any width this renders at. */
const TOLERANCE = 0.015;
function dp(points, tol) {
  if (points.length < 3) return points;
  let maxD = -1;
  let idx = 0;
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  const dx = bx - ax;
  const dy = by - ay;
  const norm = Math.hypot(dx, dy) || 1e-12;
  for (let i = 1; i < points.length - 1; i += 1) {
    const [px, py] = points[i];
    const d = Math.abs(dy * px - dx * py + bx * ay - by * ax) / norm;
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= tol) return [points[0], points[points.length - 1]];
  return [...dp(points.slice(0, idx + 1), tol).slice(0, -1), ...dp(points.slice(idx), tol)];
}

/**
 * Douglas-Peucker on a CLOSED ring, which is not the same problem.
 *
 * A ring's first and last point are the same point, so the baseline DP measures against has zero length,
 * every perpendicular distance is zero, and the algorithm helpfully simplifies all 760 districts of India
 * out of existence. (Measured: 25,482 points in, 0 out.) The ring is cut at its two most distant points
 * first, and each half simplified as an open line.
 */
function simplifyRing(points, tol = TOLERANCE) {
  const ring = points.length > 1 && points[0][0] === points[points.length - 1][0] && points[0][1] === points[points.length - 1][1]
    ? points.slice(0, -1)
    : points;
  if (ring.length < 4) return ring;
  let far = 1;
  let farD = -1;
  for (let i = 1; i < ring.length; i += 1) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const a = dp(ring.slice(0, far + 1), tol);
  const b = dp([...ring.slice(far), ring[0]], tol);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

// Equirectangular, scaled at the mid-latitude. India spans ~68-97E and 6-37N; anything fancier buys
// nothing at this size and costs a dependency.
const K = 22;
const LAT_MID = 22;
const project = ([lon, lat]) => [(lon - 68) * K * Math.cos((LAT_MID * Math.PI) / 180), (37.2 - lat) * K];

const ringsOf = (g) =>
  g.type === "Polygon" ? g.coordinates : g.type === "MultiPolygon" ? g.coordinates.flat() : [];

const byState = new Map();
let points = 0;
let kept = 0;
for (const f of geo.features) {
  const name = f.properties.st_nm;
  if (typeof name !== "string") continue;
  const paths = byState.get(name) ?? [];
  for (const ring of ringsOf(f.geometry)) {
    points += ring.length;
    const simplified = simplifyRing(ring.map(project));
    if (simplified.length < 3) continue;
    kept += simplified.length;
    paths.push(
      `M${simplified.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}Z`,
    );
  }
  byState.set(name, paths);
}

// One viewBox for the whole country, computed from what was kept rather than assumed.
let minX = Infinity;
let minY = Infinity;
let maxX = -Infinity;
let maxY = -Infinity;
for (const paths of byState.values()) {
  for (const m of paths.join(" ").matchAll(/(-?\d+\.\d) (-?\d+\.\d)/g)) {
    const x = Number(m[1]);
    const y = Number(m[2]);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}

const out = {
  source: {
    url: "https://raw.githubusercontent.com/udit-001/india-maps-data/main/geojson/india.geojson",
    publisher: "udit-001/india-maps-data (2011 census district boundaries)",
    sha256,
    retrievedAt: process.argv[3] ?? "2026-08-10",
    features: geo.features.length,
    note: "District polygons, grouped by state. Simplified with Douglas-Peucker at 0.015 degrees.",
  },
  viewBox: `${minX.toFixed(1)} ${minY.toFixed(1)} ${(maxX - minX).toFixed(1)} ${(maxY - minY).toFixed(1)}`,
  states: Object.fromEntries([...byState].map(([name, paths]) => [name, paths.join("")])),
};

mkdirSync("data/geo", { recursive: true });
writeFileSync("data/geo/india-states.json", `${JSON.stringify(out)}\n`);
const size = Buffer.byteLength(JSON.stringify(out));
console.log(
  `${byState.size} states · ${geo.features.length} districts · ${points} points -> ${kept} kept · ` +
    `${(size / 1024).toFixed(0)} KB · viewBox ${out.viewBox}`,
);
console.log(`sha256 ${sha256.slice(0, 16)}…`);

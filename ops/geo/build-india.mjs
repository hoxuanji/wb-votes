// Build the India map asset from the district GeoJSON.
//
// Run:  node ops/geo/build-india.mjs /tmp/india.geojson [retrievedAt]
//
// Source: https://raw.githubusercontent.com/udit-001/india-maps-data (2011 census district boundaries).
// Its sha256 and URL are written into the output so the asset carries its own provenance — the same rule the
// registry's `source` table enforces.
//
// WHAT CHANGED IN PHASE 2.6, and it is the fix for a semantic defect rather than a tidy-up.
//
// The previous version emitted ONE path per state: every district ring of that state, concatenated, on the
// reasoning that "the shared edges disappear under the fill". The fill hid them. The stroke did not — the map
// strokes every subpath — so each state rendered as a party-coloured area divided into its districts by
// visible lines, and the only reading available to a reader was "this district elected this party". The figure
// behind the colour is the party leading that state's most recent assembly election. Different claim.
//
// So state outlines and district rings are now SEPARATE, and the map draws them as separate layers: the state
// filled by whatever the layer means, the districts as neutral hairlines over it, and the state border as its
// own stroke.
//
// THE OUTLINES WERE ALREADY IN THE SOURCE. 760 features are not 760 districts: 726 carry a `district`
// property and 34 do not, and each of those 34 is a state's own outline. That is why an edge-parity union over
// the district rings found every edge shared exactly twice and no boundary at all — each district's border
// edge is shared with its state's outline feature. Lakshadweep and Chandigarh have no outline feature and need
// none: each is a single district, so its district ring IS its outline.
//
// WHAT THIS ASSET IS NOT. The epoch is 2011 (`year: "2011_c"` on every feature). India has created districts
// since — Mizoram's Khawzawl and Hnahthial, Tamil Nadu's Kallakurichi — and the file records the epoch so the
// map can say which snapshot it is drawing. It is dated, not wrong, and those are different.
//
// WHY AN ASSET AND NOT A REGISTRY TABLE. place_geometry is keyed by place_version_id, and a STATE has no
// place_version — only seats do. Giving 36 states versions in an epoch is a migration with a modelling
// question attached (a state's boundary changes with reorganisation, not with delimitation), and it should not
// be decided in the same commit that draws a map. So the paths live in a generated file with a hash, and the
// one thing that matters is preserved: nothing is hand-drawn, and anyone can rebuild it from its source.

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
 * every perpendicular distance is zero, and the algorithm helpfully simplifies all 760 districts of India out
 * of existence. (Measured: 25,482 points in, 0 out.) The ring is cut at its two most distant points first,
 * and each half simplified as an open line.
 */
function simplifyRing(points, tol = TOLERANCE) {
  const ring =
    points.length > 1 &&
    points[0][0] === points[points.length - 1][0] &&
    points[0][1] === points[points.length - 1][1]
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

// Equirectangular, scaled at the mid-latitude. India spans ~68-97E and 6-37N; anything fancier buys nothing
// at this size and costs a dependency.
const K = 22;
const LAT_MID = 22;
const project = ([lon, lat]) => [(lon - 68) * K * Math.cos((LAT_MID * Math.PI) / 180), (37.2 - lat) * K];

const ringsOf = (g) =>
  g.type === "Polygon" ? g.coordinates : g.type === "MultiPolygon" ? g.coordinates.flat() : [];

/** Every ring of one feature, projected, simplified and emitted as one SVG path. */
function pathOf(feature, stats) {
  const parts = [];
  for (const ring of ringsOf(feature.geometry)) {
    stats.points += ring.length;
    const simplified = simplifyRing(ring.map(project));
    if (simplified.length < 3) continue;
    stats.kept += simplified.length;
    parts.push(`M${simplified.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}Z`);
  }
  return parts.join("");
}

const stats = { points: 0, kept: 0 };
const outlines = new Map();
const districts = new Map();

for (const f of geo.features) {
  const state = f.properties.st_nm;
  if (typeof state !== "string") continue;
  const path = pathOf(f, stats);
  if (path === "") continue;
  if (typeof f.properties.district === "string" && f.properties.district !== "") {
    districts.set(state, [
      ...(districts.get(state) ?? []),
      { name: f.properties.district, code: String(f.properties.dt_code ?? ""), path },
    ]);
  } else {
    // The state's own outline feature. Two states have none and are handled below.
    outlines.set(state, path);
  }
}

// Lakshadweep and Chandigarh: a single district each, so the district ring is the outline. Derived rather
// than special-cased by name — any state the source ships without an outline feature resolves the same way.
for (const [state, rows] of districts) {
  if (outlines.has(state)) continue;
  outlines.set(state, rows.map((r) => r.path).join(""));
}

for (const state of outlines.keys()) {
  if (!districts.has(state)) districts.set(state, []);
}

// One viewBox for the whole country, computed from what was kept rather than assumed.
let minX = Infinity;
let minY = Infinity;
let maxX = -Infinity;
let maxY = -Infinity;
for (const path of outlines.values()) {
  for (const m of path.matchAll(/(-?\d+\.\d) (-?\d+\.\d)/g)) {
    const x = Number(m[1]);
    const y = Number(m[2]);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}

/** The bounding box of one path, so a level can frame itself without parsing paths at request time. */
function boxOf(path) {
  let a = Infinity;
  let b = Infinity;
  let c = -Infinity;
  let d = -Infinity;
  for (const m of path.matchAll(/(-?\d+\.\d) (-?\d+\.\d)/g)) {
    const x = Number(m[1]);
    const y = Number(m[2]);
    if (x < a) a = x;
    if (x > c) c = x;
    if (y < b) b = y;
    if (y > d) d = y;
  }
  return [a, b, c - a, d - b].map((n) => Number(n.toFixed(1)));
}

const out = {
  source: {
    url: "https://raw.githubusercontent.com/udit-001/india-maps-data/main/geojson/india.geojson",
    publisher: "udit-001/india-maps-data",
    sha256,
    retrievedAt: process.argv[3] ?? "2026-08-12",
    features: geo.features.length,
    epoch: "2011 census districts",
    note:
      "State outlines and district rings, kept SEPARATE. 760 features: 726 carry a `district` property and " +
      "34 are a state's own outline; Lakshadweep and Chandigarh ship no outline feature and each is a single " +
      "district, so its district ring is its outline. Projected equirectangular at the 22N parallel and " +
      "simplified with Douglas-Peucker at 0.015 degrees. The district epoch is 2011 and India has created " +
      "districts since, so this is a dated administrative snapshot rather than the current map.",
  },
  viewBox: `${minX.toFixed(1)} ${minY.toFixed(1)} ${(maxX - minX).toFixed(1)} ${(maxY - minY).toFixed(1)}`,
  states: Object.fromEntries(
    [...outlines].sort(([a], [b]) => a.localeCompare(b)).map(([name, path]) => [name, { path, box: boxOf(path) }]),
  ),
  districts: Object.fromEntries(
    [...districts]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([state, rows]) => [
        state,
        rows
          .sort((x, y) => x.name.localeCompare(y.name))
          .map((r) => ({ name: r.name, code: r.code, path: r.path, box: boxOf(r.path) })),
      ]),
  ),
};

mkdirSync("data/geo", { recursive: true });
writeFileSync("data/geo/india-states.json", `${JSON.stringify(out)}\n`);
const size = Buffer.byteLength(JSON.stringify(out));
const districtCount = [...districts.values()].reduce((n, r) => n + r.length, 0);
process.stdout.write(
  `${outlines.size} state outlines · ${districtCount} districts · ${stats.points} points -> ${stats.kept} kept · ` +
    `${(size / 1024).toFixed(0)} KB · viewBox ${out.viewBox}\n`,
);

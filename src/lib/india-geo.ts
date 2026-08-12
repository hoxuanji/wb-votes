// India's geometry: state outlines, district rings, and a label anchor precomputed for each state.
//
// A `.ts` module rather than an import inside the map component, for two reasons. The mechanical one: an
// import attribute (`with { type: 'json' }`) is required for JSON in ESM, and the Babel that Next bundles
// mangles it, so the render harness could not compile a .tsx that carried one. The better one: parsing 36
// paths for their centroids is work that belongs to module load, not to a request, and putting it here means
// it happens exactly once per process instead of once per render.
//
// STATE OUTLINES AND DISTRICT RINGS ARE SEPARATE, which is the fix Phase 2.6 exists for. They used to be one
// path per state — every district ring concatenated — and the map's stroke drew every one of them, so a
// party-coloured state came divided into party-coloured districts. A district did not elect that party; the
// state's most recent assembly did. See ops/geo/build-india.mjs.
//
// The geometry's own URL, publisher, sha256 and EPOCH are recorded inside the JSON and surfaced in the map's
// caption. A boundary set is a source like any other, and a dated one has to say so.

import geo from '../../data/geo/india-states.json' with { type: 'json' };
import { anchorOf, type Anchor } from '../../packages/mandate/src/viz/anchors.ts';

/** A rectangle in the shared projection: x, y, width, height. What a level frames itself with. */
export type Box = readonly [number, number, number, number];

export type StateShape = {
  /** The geometry's own name for the polygon — the only join between it and the jurisdiction table. */
  name: string;
  path: string;
  box: Box;
  /** Null when the path holds no usable ring, which is a data problem and must not become a label at 0,0. */
  anchor: Anchor | null;
};

export type DistrictShape = {
  /** The census name. Joins to the registry's district places by name, imperfectly — see map-validation.md. */
  name: string;
  /** The 2011 census district code, kept because a name is not an identifier. */
  code: string;
  path: string;
  box: Box;
  anchor: Anchor | null;
};

type Asset = {
  source: { publisher: string; url: string; sha256: string; note: string; epoch: string; retrievedAt: string };
  viewBox: string;
  states: Record<string, { path: string; box: number[] }>;
  districts: Record<string, { name: string; code: string; path: string; box: number[] }[]>;
};

const asset = geo as unknown as Asset;

export const INDIA_VIEWBOX: string = asset.viewBox;

export const INDIA_SOURCE: Asset['source'] = asset.source;

export const INDIA_SHAPES: readonly StateShape[] = Object.entries(asset.states).map(([name, s]) => ({
  name,
  path: s.path,
  box: s.box as unknown as Box,
  anchor: anchorOf(s.path),
}));

/** Every district ring, by the geometry's own state name. Anchors are computed lazily — 726 is too many to
 *  centroid at module load for the one state a request actually draws. */
const districtCache = new Map<string, readonly DistrictShape[]>();

export function districtsOf(stateName: string): readonly DistrictShape[] {
  const hit = districtCache.get(stateName);
  if (hit !== undefined) return hit;
  const rows = (asset.districts[stateName] ?? []).map((d) => ({
    name: d.name,
    code: d.code,
    path: d.path,
    box: d.box as unknown as Box,
    anchor: anchorOf(d.path),
  }));
  districtCache.set(stateName, rows);
  return rows;
}

/** Every district ring in the country, as one path string. The neutral texture under the state fills. */
let allDistricts: string | null = null;
export function everyDistrictPath(): string {
  allDistricts ??= Object.values(asset.districts)
    .flat()
    .map((d) => d.path)
    .join('');
  return allDistricts;
}

/**
 * A viewBox that frames a box, with a margin, clamped to the country.
 *
 * This is what "zoom" means here: a level frames its own geometry, the frame is in the URL, and going deeper
 * is a navigation rather than a gesture. No pan-and-zoom engine, and nothing to hydrate.
 */
export function frame(box: Box, pad = 0.08): string {
  const [x, y, w, h] = box;
  const m = Math.max(w, h) * pad;
  return `${(x - m).toFixed(1)} ${(y - m).toFixed(1)} ${(w + 2 * m).toFixed(1)} ${(h + 2 * m).toFixed(1)}`;
}

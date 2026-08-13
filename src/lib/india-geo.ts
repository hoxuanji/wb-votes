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
// The geometry's own URL, publisher, sha256 and EPOCH are recorded inside the JSON. A boundary set is a source
// like any other, so `GEOMETRY_SOURCE` shapes it as one and it goes into the same evidence drawer as every
// registry citation. What stays in the map's caption is the EPOCH and the semantic disclaimer — the two things
// a reader has to know while looking at the polygons, rather than who published them.

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
  source: {
    publisher: string;
    url: string;
    sha256: string;
    note: string;
    epoch: string;
    retrievedAt: string;
    features: number;
  };
  viewBox: string;
  states: Record<string, { path: string; box: number[] }>;
  districts: Record<string, { name: string; code: string; path: string; box: number[] }[]>;
};

const asset = geo as unknown as Asset;

export const INDIA_VIEWBOX: string = asset.viewBox;

export const INDIA_SOURCE: Asset['source'] = asset.source;

/**
 * The geometry, as a source row like any other.
 *
 * A boundary set IS a source: it has a publisher, a URL, a hash over the bytes and a retrieval date, and the
 * asset records all four. Shaping it as a `SourceRef` means it goes into the SAME evidence drawer as every
 * registry citation instead of being spelled out in the map's caption — which is where the publisher used to
 * be, in the primary interface, on every request.
 *
 * `retrievalKind: "fetched"` and `hashKind: "document_bytes"` are both true and were both verified in this
 * phase: the file was re-fetched and its sha256 matched the hash recorded in the asset byte for byte.
 */
export const GEOMETRY_SOURCE = {
  id: `geo:${asset.source.sha256.slice(0, 12)}`,
  // `census`, from the registry's own source-kind union, and it is accurate rather than a convenience: these
  // are 2011 census district boundaries. Widening that union for one asset would be describing the registry's
  // vocabulary in terms of a file on disk.
  kind: 'census' as const,
  publisher: asset.source.publisher,
  title: `${asset.source.epoch} — ${asset.source.features} features, state outlines and district rings`,
  url: asset.source.url,
  retrievedAt: `${asset.source.retrievedAt}T00:00:00.000Z`,
  publishedOn: null,
  retrievalKind: 'fetched' as const,
  hashKind: 'document_bytes' as const,
  // The asset does not record one. `null` says so rather than guessing at MIT or CC — a licence nobody
  // declared is not a licence, and asserting one would be the fabrication this codebase refuses.
  licence: null,
};

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

// India's state geometry, with a label anchor precomputed for each polygon.
//
// A `.ts` module rather than an import inside the map component, for two reasons. The mechanical one: an
// import attribute (`with { type: 'json' }`) is required for JSON in ESM, and the Babel that Next bundles
// mangles it, so the render harness could not compile a .tsx that carried one. The better one: parsing 36
// paths for their centroids is work that belongs to module load, not to a request, and putting it here
// means it happens exactly once per process instead of once per render.
//
// The geometry's own URL, publisher and sha256 are recorded inside the JSON, and are surfaced in the map's
// caption — a boundary set is a source like any other.

import geo from '../../data/geo/india-states.json' with { type: 'json' };
import { anchorOf, type Anchor } from '../../packages/mandate/src/viz/anchors.ts';

export type StateShape = {
  /** The geometry's own name for the polygon — the only join between it and the jurisdiction table. */
  name: string;
  path: string;
  /** Null when the path holds no usable ring, which is a data problem and must not become a label at 0,0. */
  anchor: Anchor | null;
};

export const INDIA_VIEWBOX: string = geo.viewBox;

export const INDIA_SOURCE: { publisher: string; url: string; sha256: string; note: string } = geo.source;

export const INDIA_SHAPES: readonly StateShape[] = Object.entries(geo.states as Record<string, string>).map(
  ([name, path]) => ({ name, path, anchor: anchorOf(path) }),
);

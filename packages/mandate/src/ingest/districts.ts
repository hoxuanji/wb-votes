/**
 * District name authority for the West Bengal seed.
 *
 * Two seed files disagree on 9 of 19 district names: `wb-districts.json` carries census
 * transliterations and `constituencies.json` carries the ECI's. The ingest needs census → ECI to attach
 * an outline to a district place; the round-trip report needs ECI → census to hand the seed back its own
 * spelling. Both directions have to come from ONE table or they drift, and the obvious home for it —
 * beside the ingest — created a circular import between the ingest and the exporter, so it lives here
 * with no dependencies of its own.
 *
 * Every pair is the same district under two spellings, not a judgement about boundaries. A district
 * outline whose name is in neither this map nor the constituency list is reported as an ingest anomaly
 * rather than dropped, because West Bengal does rename and split districts and the next one must not
 * disappear quietly.
 */
export const DISTRICT_ALIAS: Record<string, string> = {
  barddhaman: "purba-bardhaman",
  darjiling: "darjeeling",
  "east-midnapore": "purba-medinipur",
  haora: "howrah",
  hugli: "hooghly",
  kochbihar: "cooch-behar",
  maldah: "malda",
  puruliya: "purulia",
  "west-midnapore": "paschim-medinipur",
};

/** ECI spelling → census spelling, for handing the seed back the name it used. */
export const CENSUS_SPELLING: ReadonlyMap<string, string> = new Map(
  Object.entries(DISTRICT_ALIAS).map(([census, eci]) => [eci, census]),
);

const slugOf = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const titleOf = (sl: string): string =>
  sl
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/** The census spelling of an ECI district name, or the name unchanged when the two agree. */
export function censusName(eciName: string): string {
  const census = CENSUS_SPELLING.get(slugOf(eciName));
  return census === undefined ? eciName : titleOf(census);
}

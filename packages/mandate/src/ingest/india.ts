/**
 * India's states and union territories, as reference data.
 *
 * "1 of 36 states" has been printed against a constant with nothing behind it: the place tree held one
 * nation and one state, so there was no structure for a second state to arrive into and no way to say
 * which 35 were missing. These are the 28 states and 8 union territories with their Local Government
 * Directory codes, which is the identifier every Indian government dataset keys on — including the ones
 * the assembly and parliamentary results will come from.
 *
 * Reference data in code rather than in data/seed/, deliberately: this is not a scrape and it has no
 * retrieval date. It changes when Parliament passes a reorganisation act, which is a code change with a
 * citation, not a pipeline run. `assemblySeats` is the elected strength — the figure ECI conducts
 * elections for — and is null for the three UTs that have no legislative assembly, because 0 would read
 * as "an assembly with no seats" rather than "no assembly".
 *
 * Source: Local Government Directory (lgdirectory.gov.in), ECI state summaries. Cited on every place row
 * the ingest writes from this table.
 */

export type Jurisdiction = {
  /** Place id under `in`. Short, stable, and what a URL segment will use. */
  id: string;
  name: string;
  kind: "state" | "ut";
  /** LGD state code — the join key for Indian government datasets. */
  lgd: string;
  /** Elected assembly strength, or null where there is no legislative assembly. */
  assemblySeats: number | null;
  /** Lok Sabha seats returned by this jurisdiction. */
  lokSabhaSeats: number;
};

export const JURISDICTIONS: readonly Jurisdiction[] = [
  { id: "ap", name: "Andhra Pradesh", kind: "state", lgd: "28", assemblySeats: 175, lokSabhaSeats: 25 },
  { id: "ar", name: "Arunachal Pradesh", kind: "state", lgd: "12", assemblySeats: 60, lokSabhaSeats: 2 },
  { id: "as", name: "Assam", kind: "state", lgd: "18", assemblySeats: 126, lokSabhaSeats: 14 },
  { id: "br", name: "Bihar", kind: "state", lgd: "10", assemblySeats: 243, lokSabhaSeats: 40 },
  { id: "cg", name: "Chhattisgarh", kind: "state", lgd: "22", assemblySeats: 90, lokSabhaSeats: 11 },
  { id: "ga", name: "Goa", kind: "state", lgd: "30", assemblySeats: 40, lokSabhaSeats: 2 },
  { id: "gj", name: "Gujarat", kind: "state", lgd: "24", assemblySeats: 182, lokSabhaSeats: 26 },
  { id: "hr", name: "Haryana", kind: "state", lgd: "06", assemblySeats: 90, lokSabhaSeats: 10 },
  { id: "hp", name: "Himachal Pradesh", kind: "state", lgd: "02", assemblySeats: 68, lokSabhaSeats: 4 },
  { id: "jh", name: "Jharkhand", kind: "state", lgd: "20", assemblySeats: 81, lokSabhaSeats: 14 },
  { id: "ka", name: "Karnataka", kind: "state", lgd: "29", assemblySeats: 224, lokSabhaSeats: 28 },
  { id: "kl", name: "Kerala", kind: "state", lgd: "32", assemblySeats: 140, lokSabhaSeats: 20 },
  { id: "mp", name: "Madhya Pradesh", kind: "state", lgd: "23", assemblySeats: 230, lokSabhaSeats: 29 },
  { id: "mh", name: "Maharashtra", kind: "state", lgd: "27", assemblySeats: 288, lokSabhaSeats: 48 },
  { id: "mn", name: "Manipur", kind: "state", lgd: "14", assemblySeats: 60, lokSabhaSeats: 2 },
  { id: "ml", name: "Meghalaya", kind: "state", lgd: "17", assemblySeats: 60, lokSabhaSeats: 2 },
  { id: "mz", name: "Mizoram", kind: "state", lgd: "15", assemblySeats: 40, lokSabhaSeats: 1 },
  { id: "nl", name: "Nagaland", kind: "state", lgd: "13", assemblySeats: 60, lokSabhaSeats: 1 },
  { id: "od", name: "Odisha", kind: "state", lgd: "21", assemblySeats: 147, lokSabhaSeats: 21 },
  { id: "pb", name: "Punjab", kind: "state", lgd: "03", assemblySeats: 117, lokSabhaSeats: 13 },
  { id: "rj", name: "Rajasthan", kind: "state", lgd: "08", assemblySeats: 200, lokSabhaSeats: 25 },
  { id: "sk", name: "Sikkim", kind: "state", lgd: "11", assemblySeats: 32, lokSabhaSeats: 1 },
  { id: "tn", name: "Tamil Nadu", kind: "state", lgd: "33", assemblySeats: 234, lokSabhaSeats: 39 },
  { id: "tg", name: "Telangana", kind: "state", lgd: "36", assemblySeats: 119, lokSabhaSeats: 17 },
  { id: "tr", name: "Tripura", kind: "state", lgd: "16", assemblySeats: 60, lokSabhaSeats: 2 },
  { id: "up", name: "Uttar Pradesh", kind: "state", lgd: "09", assemblySeats: 403, lokSabhaSeats: 80 },
  { id: "uk", name: "Uttarakhand", kind: "state", lgd: "05", assemblySeats: 70, lokSabhaSeats: 5 },
  { id: "wb", name: "West Bengal", kind: "state", lgd: "19", assemblySeats: 294, lokSabhaSeats: 42 },

  // Union territories. Delhi, Puducherry and Jammu & Kashmir have legislative assemblies; the other five
  // do not, which is why their assembly strength is null rather than zero.
  { id: "an", name: "Andaman and Nicobar Islands", kind: "ut", lgd: "35", assemblySeats: null, lokSabhaSeats: 1 },
  { id: "ch", name: "Chandigarh", kind: "ut", lgd: "04", assemblySeats: null, lokSabhaSeats: 1 },
  { id: "dh", name: "Dadra and Nagar Haveli and Daman and Diu", kind: "ut", lgd: "26", assemblySeats: null, lokSabhaSeats: 2 },
  { id: "dl", name: "Delhi", kind: "ut", lgd: "07", assemblySeats: 70, lokSabhaSeats: 7 },
  { id: "jk", name: "Jammu and Kashmir", kind: "ut", lgd: "01", assemblySeats: 90, lokSabhaSeats: 5 },
  { id: "la", name: "Ladakh", kind: "ut", lgd: "37", assemblySeats: null, lokSabhaSeats: 1 },
  { id: "ld", name: "Lakshadweep", kind: "ut", lgd: "31", assemblySeats: null, lokSabhaSeats: 1 },
  { id: "py", name: "Puducherry", kind: "ut", lgd: "34", assemblySeats: 30, lokSabhaSeats: 1 },
];

/** Totals derived from the table, so a page never prints a denominator this file disagrees with. */
export const INDIA_TOTALS = {
  jurisdictions: JURISDICTIONS.length,
  states: JURISDICTIONS.filter((j) => j.kind === "state").length,
  uts: JURISDICTIONS.filter((j) => j.kind === "ut").length,
  assemblySeats: JURISDICTIONS.reduce((n, j) => n + (j.assemblySeats ?? 0), 0),
  lokSabhaSeats: JURISDICTIONS.reduce((n, j) => n + j.lokSabhaSeats, 0),
} as const;

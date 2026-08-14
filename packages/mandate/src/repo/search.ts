// The command bar's data layer: one query over every kind of thing this registry can navigate to.
//
// WHY THIS MODULE EXISTS. The product had five ways in and each reached one kind of thing: a search field
// that matched people only, a `<select>` of states, a `<select>` of elections, a legacy client palette that
// fetched candidates, and a second copy of the people field on the search page itself. A reader had to
// classify their own query before typing it — is "Chikkodi" a state, an election or a seat? — which is a
// menu wearing a search field's clothes.
//
// FIVE GROUPS, AND EVERY HIT HAS A DESTINATION THAT EXISTS. That is the constraint that shaped this file: a
// result a reader cannot act on is worse than no result, so nothing appears here that does not resolve.
// Parties are the interesting case — this registry has no party page — so a party hit carries its own
// measured reach (contests, first year, last year) and links to the national landscape, which is where a
// party's seats and share actually are.
//
// The people tier is `searchPersons`, unchanged: it is transliteration-aware (মমতা, ममता, Mamata and Momota
// fold onto shared blocking keys) and it distinguishes a NAME match from a SOUNDS-LIKE match, which this
// module must not flatten — a phonetic hit is a suggestion to check, not a person found.

import type { DatabaseSync } from "node:sqlite";
import { constituencyHref, districtHref, stateHref } from "./routes.ts";
import { all } from "../db/index.ts";
import { read } from "./index.ts";
import { searchPersons, type PersonRow } from "./person.ts";
import { detectScript, toLatin } from "../core/indic/index.ts";
import { CHRONO_DESC } from "./elections.ts";

/** One navigable thing. `detail` is what the row says about itself, so a hit is informative unopened. */
export type Hit = {
  id: string;
  label: string;
  detail: string;
  href: string;
};

export type Results = {
  q: string;
  /** The script the query was written in, and what it was matched as. Both null for an empty query. */
  script: string;
  transliterated: string | null;
  states: Hit[];
  elections: Hit[];
  constituencies: Hit[];
  /** A name match. */
  people: PersonRow[];
  /** A phonetic match and nothing more — kept apart, and counted apart. */
  alike: PersonRow[];
  parties: Hit[];
  /** Everything above, summed, so the page can say one number. */
  total: number;
};

/** How many hits any one group offers. Enough to recognise the right answer, few enough to scan. */
export const PER_GROUP = 8;

/**
 * A LIKE pattern from user input, with the wildcards defused.
 *
 * `%` and `_` are LIKE metacharacters, so a query of "%" matched every row in the registry and a query of
 * "_" matched every single-character name. Escaped rather than stripped, because a name can legitimately
 * contain an underscore and a reader who types one means it.
 */
function like(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** States and union territories, by name or by the two-letter id a URL uses. */
function states(db: DatabaseSync, pattern: string, prefix: string, q: string): Hit[] {
  return all<{ id: string; name: string; kind: string; elections: number }>(
    db,
    `SELECT p.id AS id, p.canonical_name AS name, p.kind AS kind,
            (SELECT COUNT(*) FROM election e WHERE e.jurisdiction_place_id = p.id) AS elections
       FROM place p
      WHERE p.kind IN ('state', 'ut')
        AND (p.canonical_name LIKE ? ESCAPE '\\' OR p.id = ?)
      -- The two-letter id first, then a name that STARTS with the query, then the rest. "ram" matching
      -- Mizoram is a real hit and should not outrank Rajasthan.
      ORDER BY (p.id = ?) DESC, (p.canonical_name LIKE ? ESCAPE '\\') DESC, p.canonical_name
      LIMIT ?`,
    pattern,
    q.toLowerCase(),
    q.toLowerCase(),
    prefix,
    PER_GROUP,
  ).map((r) => ({
    id: r.id,
    label: r.name,
    detail:
      r.elections === 0
        ? `${r.kind === "ut" ? "Union territory" : "State"} · no election loaded`
        : `${r.kind === "ut" ? "Union territory" : "State"} · ${r.elections} election${r.elections === 1 ? "" : "s"} on record`,
    href: stateHref(r.id),
  }));
}

/**
 * Elections, by their formal name or by their jurisdiction's.
 *
 * An election has no page of its own; what it has is a coverage record, which is the honest destination —
 * "how much of this election do we hold" is the question a reader who searched for one is closest to.
 */
function elections(db: DatabaseSync, pattern: string, prefix: string): Hit[] {
  return all<{ id: string; name: string; year: number; house: string; kind: string; seats: number; jname: string }>(
    db,
    `SELECT e.id AS id, e.name AS name, e.year AS year, e.house AS house, e.kind AS kind,
            (SELECT COUNT(*) FROM contest c WHERE c.election_id = e.id) AS seats,
            COALESCE(j.canonical_name, e.jurisdiction_place_id) AS jname
       FROM election e
       LEFT JOIN place j ON j.id = e.jurisdiction_place_id
      WHERE e.name LIKE ? ESCAPE '\\' OR j.canonical_name LIKE ? ESCAPE '\\'
      ORDER BY (j.canonical_name LIKE ? ESCAPE '\\') DESC, ${CHRONO_DESC}
      LIMIT ?`,
    pattern,
    pattern,
    prefix,
    PER_GROUP,
  ).map((r) => ({
    id: r.id,
    label: `${r.jname} ${r.house === "pc" ? "Lok Sabha" : "Assembly"} ${r.year}${r.kind === "bypoll" ? " by-election" : ""}`,
    detail: `${r.seats} constituenc${r.seats === 1 ? "y" : "ies"} loaded`,
    href: `/coverage?election=${r.id}#election`,
  }));
}

/**
 * Constituencies, matched on the name a seat carries NOW.
 *
 * A seat has one `place_version` per delimitation it survived, so the naive query matches every version and
 * returns the same seat three times. The window function keeps the newest.
 *
 * IT DELIBERATELY DOES NOT MATCH HISTORICAL NAMES, and that is the interesting decision here. The first
 * version of this did: it matched any version and displayed the current one, with "· was BADAMI" where they
 * differed. Against the real registry that produced "NANJANGUD · no. 214 · MYSORE · was BADAMI" — and
 * Badami is a seat in Bagalkot, five hundred kilometres away. The reason is in place-page.ts's own comment:
 * a `place` row is a legacy seat-NUMBER grouping, so `ka.ac.214` accumulated versions from delimitations in
 * which the number 214 belonged to different constituencies. "Was BADAMI" asserted a renaming that never
 * happened.
 *
 * Repairing that is a migration on electoral geography identity, which this phase may not do. What it can do
 * is not make the claim: a search for a historical name finds nothing here, which is a miss, and a miss is
 * survivable in a way that a confident wrong answer is not.
 *
 * The path is built exactly as `placeHref` builds it, because that is the construction the render tests
 * already prove resolves: state, then the district segment, then the name slug.
 */
function constituencies(db: DatabaseSync, pattern: string, prefix: string): Hit[] {
  return all<{
    place: string;
    name: string;
    kind: string;
    number: number | null;
    district: string | null;
    dname: string | null;
    state: string | null;
    sname: string | null;
    contests: number;
  }>(
    db,
    `SELECT v.place AS place, v.name AS name, v.kind AS kind, v.number AS number,
            v.district AS district, d.canonical_name AS dname,
            s.id AS state, s.canonical_name AS sname,
            (SELECT COUNT(*) FROM contest c
               JOIN place_version v2 ON v2.id = c.place_version_id
              WHERE v2.place_id = v.place) AS contests
       FROM (
         SELECT pl.id AS place, pv.canonical_name AS name, pv.kind AS kind, pv.number AS number,
                COALESCE(pv.district_place_id, pl.parent_id) AS district,
                row_number() OVER (PARTITION BY pl.id ORDER BY be.effective_from DESC, pv.id DESC) AS rn
           FROM place_version pv
           JOIN place pl ON pl.id = pv.place_id
           JOIN boundary_epoch be ON be.id = pv.epoch_id
          WHERE pv.kind IN ('ac', 'pc')
       ) v
       LEFT JOIN place d ON d.id = v.district
       LEFT JOIN place s ON s.id = d.parent_id
      WHERE v.rn = 1 AND v.name LIKE ? ESCAPE '\\'
      ORDER BY (v.name LIKE ? ESCAPE '\\') DESC, contests DESC, v.name
      LIMIT ?`,
    pattern,
    prefix,
    PER_GROUP,
  )
    .map((r): Hit | null => {
      // No district or no state means no four-segment path, and a link to /pl// resolves to nothing. A seat
      // that cannot be addressed is left out rather than offered as a dead row.
      if (r.state === null || r.district === null || !r.district.startsWith(`${r.state}.`)) return null;
      const segment = r.district.slice(r.state.length + 1);
      const where = [r.dname, r.sname].filter((x): x is string => x !== null).join(", ");
      return {
        id: r.place,
        label: r.name,
        detail:
          `${r.kind === "pc" ? "Parliamentary" : "Assembly"} constituency` +
          (r.number === null ? "" : ` no. ${r.number}`) +
          (where === "" ? "" : ` · ${where}`) +
          ` · ${r.contests} election${r.contests === 1 ? "" : "s"}`,
        href: constituencyHref(r.state, r.name),
      };
    })
    .filter((h): h is Hit => h !== null);
}

/**
 * The fragment id of a party's row in the national party landscape.
 *
 * Exported because BOTH ends have to agree: `src/app/page.tsx` puts it on the `<tr>` and this module puts it
 * in the href. A party id can contain spaces — "BHARATIYA NYAY-ADHIKAR RAKSHA PARTY" is one — and a fragment
 * cannot, so two independent spellings of the same anchor is a link that goes nowhere and says nothing.
 */
export function partyAnchor(key: string): string {
  const slug = key.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  // A key with nothing addressable in it — "Unattached" is a real bucket and a blank raw string is a real
  // row — gets the bare prefix rather than a trailing hyphen, which is not a legal fragment either.
  return slug === "" ? "party" : `party-${slug}`;
}

/** The name slug a place path uses. Same rule as place-page.ts's, and it has to stay the same rule. */
function slug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

/**
 * Parties, with the reach that makes the row worth reading on its own.
 *
 * There is no party page in this registry, and inventing one is a feature this phase may not add. What a
 * party hit can honestly do is confirm the party exists, say how it is abbreviated — which is the actual
 * question behind searching "Trinamool" — say how far its record reaches, and point at the national party
 * landscape, where its assemblies, seats, share and trend are.
 */
function parties(db: DatabaseSync, pattern: string, prefix: string): Hit[] {
  return all<{ id: string; name: string; short: string | null; contests: number; first: number | null; last: number | null }>(
    db,
    // `short_name` is on `party`, not on `party_version` — the abbreviation is the party's identity, and a
    // version carries the name it was registered under at the time. Both are matched.
    `SELECT p.id AS id, p.name AS name, p.short_name AS short,
            COUNT(DISTINCT ca.contest_id) AS contests,
            MIN(e.year) AS first, MAX(e.year) AS last
       FROM party p
       LEFT JOIN party_version pv ON pv.party_id = p.id
       LEFT JOIN candidacy ca ON ca.party_version_id = pv.id
       LEFT JOIN contest c ON c.id = ca.contest_id
       LEFT JOIN election e ON e.id = c.election_id
      WHERE p.name LIKE ? ESCAPE '\\' OR p.short_name LIKE ? ESCAPE '\\' OR pv.name LIKE ? ESCAPE '\\'
      GROUP BY p.id
      ORDER BY (p.short_name LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\') DESC, contests DESC, name
      LIMIT ?`,
    pattern,
    pattern,
    pattern,
    prefix,
    prefix,
    PER_GROUP,
  ).map((r) => ({
    id: r.id,
    // "RAM · RAM" and "Navataram Party · Navataram Party" — a party whose `short_name` is its full name
    // said it twice. The abbreviation leads only when it is actually shorter than the name.
    label: r.short === null || r.short.toUpperCase() === r.name.toUpperCase() ? r.name : `${r.short} · ${r.name}`,
    detail:
      r.contests === 0
        ? "no contest on record"
        : `${r.contests} contest${r.contests === 1 ? "" : "s"}` +
          (r.first === null || r.last === null
            ? ""
            : r.first === r.last
              ? ` · ${r.first}`
              : ` · ${r.first}–${r.last}`),
    // The landscape row itself, not just the section: page.tsx gives every party row an id, so a hit lands
    // on the party. A party outside the top ten has no row, and the browser falls back to the section — an
    // anchor that misses lands at the top of the page, which is `/`, which is not a broken destination.
    href: `/#${partyAnchor(r.id)}`,
  }));
}

/**
 * Everything the query matches, grouped by what it is.
 *
 * One database handle, five queries plus the person search. An empty query returns empty groups rather than
 * the whole registry — a search page that lists everything is a directory, and this product has a map for
 * that.
 */
export function searchAll(db: DatabaseSync, q: string, limit = PER_GROUP): Results {
  const term = q.trim();
  const script = term === "" ? "zyyy" : detectScript(term);
  const empty: Results = {
    q: term,
    script,
    transliterated: null,
    states: [],
    elections: [],
    constituencies: [],
    people: [],
    alike: [],
    parties: [],
    total: 0,
  };
  if (term === "") return empty;

  return read(() => {
    const pattern = like(term);
    // The person tier matches across scripts; the other four are text matches, so a Bengali or Devanagari
    // query is transliterated before it reaches them. The registry stores no Indic name strings at all
    // today, so this is the only way those groups can answer such a query at all.
    const latin = script === "beng" || script === "deva" ? toLatin(term) : null;
    const textQuery = latin ?? term;
    const textPattern = latin === null ? pattern : like(latin);
    // A second pattern anchored at the start, used only for ORDER BY: a name that BEGINS with the query is
    // what a reader typing three letters almost always means.
    const textPrefix = `${(latin ?? term).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = searchPersons(db, term, limit * 2);
    const out: Results = {
      ...empty,
      transliterated: latin,
      states: states(db, textPattern, textPrefix, textQuery),
      elections: elections(db, textPattern, textPrefix),
      constituencies: constituencies(db, textPattern, textPrefix),
      people: rows.filter((p) => p.match !== "sounds-like").slice(0, limit),
      alike: rows.filter((p) => p.match === "sounds-like").slice(0, limit),
      parties: parties(db, textPattern, textPrefix),
    };
    out.total =
      out.states.length +
      out.elections.length +
      out.constituencies.length +
      out.people.length +
      out.parties.length;
    return out;
  });
}

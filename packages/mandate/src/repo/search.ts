// The command bar's data layer: one query over every kind of thing this registry can navigate to.
//
// WHY THIS MODULE EXISTS. The product had five ways in and each reached one kind of thing: a search field
// that matched people only, a `<select>` of states, a `<select>` of elections, a legacy client palette that
// fetched candidates, and a second copy of the people field on the search page itself. A reader had to
// classify their own query before typing it — is "Chikkodi" a state, an election or a seat? — which is a
// menu wearing a search field's clothes.
//
// SIX GROUPS, AND EVERY LINK HAS A DESTINATION THAT EXISTS. That is the constraint that shaped this file: a
// result a reader cannot act on is worse than no result, so nothing is linked here that does not resolve.
// Parties are the interesting case — this registry has no party page — so a party hit carries its own
// measured reach (contests, first year, last year) and links to its line in the national landscape, which is
// where its seats and share are. Only the parties the landscape lists have a line: the rest are a row that
// says so and opens nothing.
//
// The people tier is `searchPersons`, unchanged: it is transliteration-aware (মমতা, ममता, Mamata and Momota
// fold onto shared blocking keys) and it distinguishes a NAME match from a SOUNDS-LIKE match, which this
// module must not flatten — a phonetic hit is a suggestion to check, not a person found.

import type { DatabaseSync } from "node:sqlite";
import { placeIndex, seatHref, seatTies } from "./place-resolve.ts";
import { inr } from "./brief.ts";
import { districtHref, electionHref, stateHref } from "./routes.ts";
import { all } from "../db/index.ts";
import { read } from "./index.ts";
import { partyLandscape, spine } from "./home.ts";
import { searchPersons, type PersonRow } from "./person.ts";
import { detectScript, toLatin } from "../core/indic/index.ts";
import { CHRONO_DESC } from "./elections.ts";
import { chipOf, facetOf } from "../core/election-kind.ts";

/** One navigable thing. `detail` is what the row says about itself, so a hit is informative unopened. */
export type Hit = {
  id: string;
  label: string;
  detail: string;
  href: string;
};

/**
 * A party hit. A party has no page of its own, so `href` is its line in the national party landscape, and null for a
 * party the landscape does not list: the row says so in its `detail` and opens nothing.
 */
export type PartyHit = Omit<Hit, "href"> & { href: string | null };

/** The groups a query is answered in, with the names that only sound like it beside the people. */
export type Group = "states" | "elections" | "districts" | "constituencies" | "people" | "alike" | "parties";

export type Results = {
  q: string;
  /** The script the query was written in, and what it was matched as. Both null for an empty query. */
  script: string;
  transliterated: string | null;
  states: Hit[];
  elections: Hit[];
  districts: Hit[];
  constituencies: Hit[];
  /** A name match. */
  people: PersonRow[];
  /** A phonetic match and nothing more — kept apart, and counted apart. */
  alike: PersonRow[];
  parties: PartyHit[];
  /** What each group matched in all, where the lists above hold the first PER_GROUP of it. */
  counts: Record<Group, number>;
  /** True when the person tier was cut at PERSON_SCAN rows, so the people and sounds-like counts are floors. */
  capped: boolean;
  /** Every match, so the page can say one number: the groups' counts summed, the sounds-like names left out. */
  total: number;
};

/** How many hits any one group offers. Enough to recognise the right answer, few enough to scan. */
export const PER_GROUP = 8;

/** How many people the person tier is read to, which is as many as `searchPersons` returns: past it a count is a floor. */
export const PERSON_SCAN = 200;

/** A group's first PER_GROUP hits, and how many it matched in all. */
type Counted<H = Hit> = { hits: H[]; total: number };

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
function states(db: DatabaseSync, pattern: string, prefix: string, q: string): Counted {
  const rows = all<{ id: string; name: string; kind: string; elections: number; total: number }>(
    db,
    `SELECT p.id AS id, p.canonical_name AS name, p.kind AS kind,
            (SELECT COUNT(*) FROM election e WHERE e.jurisdiction_place_id = p.id) AS elections,
            COUNT(*) OVER () AS total
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
  );
  return {
    total: rows[0]?.total ?? 0,
    hits: rows.map((r) => ({
      id: r.id,
      label: r.name,
      detail:
        r.elections === 0
          ? `${r.kind === "ut" ? "Union territory" : "State"} · no election loaded`
          : `${r.kind === "ut" ? "Union territory" : "State"} · ${r.elections} election${r.elections === 1 ? "" : "s"} on record`,
      href: stateHref(r.id),
    })),
  };
}

/**
 * Elections, by any of the words their hit is printed in.
 *
 * A hit reads "<jurisdiction> <type label> <year>", and the registry's own name for the election ("Indian general
 * election, 2024") says neither Lok Sabha nor the jurisdiction, so matching the name alone told a reader who typed what
 * the page had just printed that it was not here. Every word of the query has to be in the hit's label, its year's chip
 * ("LS 2024") or the registry's name, in any order. A registry's elections are a few thousand rows at most, so the words
 * are matched here, after one read, and not in SQL.
 *
 * A hit opens the election's own page: its seat map and how it went, which is what a reader who searched for an
 * election is after. How much of it the registry holds is the coverage record, at /coverage.
 */
function elections(db: DatabaseSync, q: string, prefix: string): Counted {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w !== "");
  const matched = all<{ id: string; name: string; year: number; house: string; kind: string; jname: string }>(
    db,
    `SELECT e.id AS id, e.name AS name, e.year AS year, e.house AS house, e.kind AS kind,
            COALESCE(j.canonical_name, e.jurisdiction_place_id) AS jname
       FROM election e
       LEFT JOIN place j ON j.id = e.jurisdiction_place_id
      ORDER BY (j.canonical_name LIKE ? ESCAPE '\\') DESC, ${CHRONO_DESC}`,
    prefix,
  )
    .map((r) => {
      const facet = facetOf(r.house, r.kind);
      return { id: r.id, label: `${r.jname} ${facet.type} ${r.year}`, chip: chipOf(facet.body, facet.fill, r.year), name: r.name };
    })
    .filter((e) => {
      const said = `${e.label} ${e.chip} ${e.name}`.toLowerCase();
      return words.every((w) => said.includes(w));
    });
  const shown = matched.slice(0, PER_GROUP);
  const seats = new Map(
    shown.length === 0
      ? []
      : all<{ id: string; n: number }>(
          db,
          `SELECT election_id AS id, COUNT(*) AS n FROM contest
            WHERE election_id IN (SELECT value FROM json_each(?)) GROUP BY election_id`,
          JSON.stringify(shown.map((e) => e.id)),
        ).map((r) => [r.id, r.n] as const),
  );
  return {
    total: matched.length,
    hits: shown.map((e) => {
      const n = seats.get(e.id) ?? 0;
      return { id: e.id, label: e.label, detail: `${n} constituenc${n === 1 ? "y" : "ies"} loaded`, href: electionHref(e.id) };
    }),
  };
}

/**
 * Districts, by name. A hit opens the district's own page.
 *
 * Read from the place index, the same rows that page is answered from, so a hit and the page it opens cannot name
 * different districts. The seats counted are the current assembly seats, which is what that page counts.
 */
function districts(db: DatabaseSync, q: string): Counted {
  const index = placeIndex(db);
  const said = q.toLowerCase();
  const stateName = new Map(index.states.map((s) => [s.id, s.name]));
  const seats = new Map<string, number>();
  for (const s of index.seats) {
    if (s.current && s.kind === "ac" && s.districtId !== null) seats.set(s.districtId, (seats.get(s.districtId) ?? 0) + 1);
  }
  // A name that STARTS with the query first, as for a state, then the rest by name.
  const matched = index.districts
    .filter((d) => d.name.toLowerCase().includes(said))
    .sort(
      (a, b) =>
        Number(b.name.toLowerCase().startsWith(said)) - Number(a.name.toLowerCase().startsWith(said)) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    );
  return {
    total: matched.length,
    hits: matched.slice(0, PER_GROUP).map((d) => {
      const n = seats.get(d.id) ?? 0;
      return {
        id: d.id,
        label: d.name,
        detail: `District · ${n === 0 ? "no assembly seat on record" : `${n} assembly seat${n === 1 ? "" : "s"}`} · ${stateName.get(d.stateId) ?? d.stateId}`,
        href: districtHref(d.id),
      };
    }),
  };
}

/**
 * Constituencies, matched on the name a seat carries NOW.
 *
 * A seat has one `place_version` per delimitation it survived, so the naive query matches every version and
 * returns the same seat three times. It keeps the CURRENT one, which is the version the place resolver answers and
 * `placeIndex` names. The newest is not always that, and a hit on a newest version that is not current linked to a
 * page that 404s. Two shapes do it: a seat number that the order its house votes under left out, which keeps only
 * its older versions (search.test.ts builds Karnataka's seat 300, under delim-1976 only), and a seat that an order
 * nobody has voted under yet redraws (the test's Assam assembly, under delim-2023-as). The second is the fixture's and
 * not the registry's: delim-2023-as holds 14 parliamentary seats and no assembly seats (docs/geo/audit.md), so Assam's
 * newest assembly versions are delim-2008, which is where its house votes. A place with no current version is not
 * offered. With migration 017 that is a seat of a house that has held no full-house election, or a seat number with no
 * version in the epoch its house votes under; a registry without it takes the newest version of every place as
 * current, so every place is offered. Which versions are current is the index's to say and is not worked out here a
 * second time, so a hit and the page it opens cannot name different seats.
 *
 * IT DELIBERATELY DOES NOT MATCH HISTORICAL NAMES, and that is the interesting decision here. The first
 * version of this did: it matched any version and displayed the current one, with "· was BADAMI" where they
 * differed. Against the real registry that produced "NANJANGUD · no. 214 · MYSORE · was BADAMI" — and
 * Badami is a seat in Bagalkot, five hundred kilometres away. The reason is in place-resolve.ts's `loadPlaceIndex`:
 * a `place` row is a legacy seat-NUMBER grouping, so `ka.ac.214` accumulated versions from delimitations in
 * which the number 214 belonged to different constituencies. "Was BADAMI" asserted a renaming that never
 * happened.
 *
 * Repairing that is a migration on electoral geography identity, which this phase may not do. What it can do
 * is not make the claim: a search for a historical name finds nothing here, which is a miss, and a miss is
 * survivable in a way that a confident wrong answer is not.
 *
 * The path is built by `seatHref`, because that is the construction the render tests already prove
 * resolves: state, then the body, then the name slug, or the registry id where two seats share the name.
 */
function constituencies(db: DatabaseSync, pattern: string, prefix: string): Counted {
  const tied = seatTies(db);
  // One bind for the whole set, unpacked by json_each: a placeholder for each would grow with the registry.
  const current = JSON.stringify(placeIndex(db).seats.filter((s) => s.current).map((s) => s.versionId));
  const rows = all<{
    place: string;
    version: number;
    name: string;
    kind: string;
    number: number | null;
    district: string | null;
    dname: string | null;
    state: string | null;
    sname: string | null;
    contests: number;
    total: number;
  }>(
    db,
    `SELECT v.place AS place, v.version AS version, v.name AS name, v.kind AS kind, v.number AS number,
            v.district AS district, d.canonical_name AS dname,
            v.jur AS state, s.canonical_name AS sname,
            (SELECT COUNT(*) FROM contest c
               JOIN place_version v2 ON v2.id = c.place_version_id
              WHERE v2.place_id = v.place) AS contests,
            COUNT(*) OVER () AS total
       FROM (
         SELECT pl.id AS place, pv.id AS version, pv.canonical_name AS name, pv.kind AS kind, pv.number AS number,
                -- THE JURISDICTION, which is the ancestor BOTH bodies have. The state used to be derived from
                -- the district parent, and a parliamentary seat has no district, so its parent resolved to the
                -- nation and search offered a constituency URL whose state segment was the country.
                pv.jurisdiction_id AS jur,
                COALESCE(pv.district_place_id, pl.parent_id) AS district
           FROM place_version pv
           JOIN place pl ON pl.id = pv.place_id
          WHERE pv.id IN (SELECT value FROM json_each(?))
       ) v
       LEFT JOIN place d ON d.id = v.district
       LEFT JOIN place s ON s.id = d.parent_id
      WHERE v.name LIKE ? ESCAPE '\\'
      -- The place id last: seats of one name and as many elections were left in place-id order by the window this
      -- replaced, and nothing else says which of them comes first.
      ORDER BY (v.name LIKE ? ESCAPE '\\') DESC, contests DESC, v.name, v.place
      LIMIT ?`,
    current,
    pattern,
    prefix,
    PER_GROUP,
  );
  const hits = rows
    .map((r): Hit | null => {
      // A seat with no state has no address, since /constituency/<state>/<body>/<name> needs one. A seat that cannot
      // be addressed is left out rather than offered as a dead row.
      // A PARLIAMENTARY SEAT HAS NO DISTRICT, and this used to require one — so every pc hit was dropped and
      // search could not reach a Lok Sabha constituency at all. The canonical URL carries the body and the
      // jurisdiction now, so the district is not part of the identity and its absence is not a reason to hide
      // the result.
      if (r.state === null) return null;
      const where = [r.dname, r.sname].filter((x): x is string => x !== null).join(", ");
      return {
        id: r.place,
        label: r.name,
        detail:
          `${r.kind === "pc" ? "Parliamentary" : "Assembly"} constituency` +
          (r.number === null ? "" : ` no. ${r.number}`) +
          (where === "" ? "" : ` · ${where}`) +
          ` · ${r.contests} election${r.contests === 1 ? "" : "s"}`,
        href: seatHref(tied, { versionId: r.version, placeId: r.place, stateId: r.state, kind: r.kind, name: r.name }),
      };
    })
    .filter((h): h is Hit => h !== null);
  return { hits, total: rows[0]?.total ?? 0 };
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

/**
 * Parties, with the reach that makes the row worth reading on its own.
 *
 * There is no party page in this registry, and inventing one is a feature this phase may not add. What a
 * party hit can honestly do is confirm the party exists, say how it is abbreviated — which is the actual
 * question behind searching "Trinamool" — say how far its record reaches, and, for a party the national party
 * landscape lists, point at its line there, where its assemblies, seats, share and trend are.
 *
 * The landscape lists the parties that hold power or seats and no others, so most of a registry's parties have no
 * line. Which have one is asked of the landscape itself, so a link and the row it names cannot part.
 */
function parties(db: DatabaseSync, pattern: string, prefix: string): Counted<PartyHit> {
  const rows = all<{
    id: string;
    name: string;
    short: string | null;
    contests: number;
    first: number | null;
    last: number | null;
    total: number;
  }>(
    db,
    // `short_name` is on `party`, not on `party_version` — the abbreviation is the party's identity, and a
    // version carries the name it was registered under at the time. Both are matched.
    `SELECT p.id AS id, p.name AS name, p.short_name AS short,
            COUNT(DISTINCT ca.contest_id) AS contests,
            MIN(e.year) AS first, MAX(e.year) AS last,
            COUNT(*) OVER () AS total
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
  );
  const listed =
    rows.length === 0 ? new Set<string>() : new Set(partyLandscape(db, spine(db)).rows.map((l) => partyAnchor(l.key)));
  return {
    total: rows[0]?.total ?? 0,
    hits: rows.map((r) => {
      const reach =
        r.contests === 0
          ? "no contest on record"
          : `${inr(r.contests)} contest${r.contests === 1 ? "" : "s"}` +
            (r.first === null || r.last === null
              ? ""
              : r.first === r.last
                ? ` · ${r.first}`
                : ` · ${r.first}–${r.last}`);
      const anchor = partyAnchor(r.id);
      return {
        id: r.id,
        // "RAM · RAM" and "Navataram Party · Navataram Party" — a party whose `short_name` is its full name
        // said it twice. The abbreviation leads only when it is actually shorter than the name.
        label: r.short === null || r.short.toUpperCase() === r.name.toUpperCase() ? r.name : `${r.short} · ${r.name}`,
        detail: listed.has(anchor) ? reach : `${reach} · not in the party landscape`,
        href: listed.has(anchor) ? `/#${anchor}` : null,
      };
    }),
  };
}

/** What a person's latest candidacy came to, in the words the person page uses for it. */
export function outcomeWords(p: Pick<PersonRow, "isWinner" | "latestStatus">): string {
  // brief.ts's `won`: a result row's winner, or the source's own "elected" where no result row was written.
  if (p.isWinner || p.latestStatus === "elected") return "won";
  if (p.latestStatus === "defeated") return "lost";
  // A candidate with no result row, in an election whose page may already name a winner: the record has no outcome
  // for them, and "contesting" said the election was still open.
  if (p.latestStatus === "contesting") return "no result declared";
  // Withdrawn, rejected, filed and disqualified are not defeats, and keep their own word.
  return p.latestStatus ?? "outcome not recorded";
}

/**
 * Everything the query matches, grouped by what it is.
 *
 * One database handle: a read for each group and the person search. An empty query returns empty groups rather than
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
    districts: [],
    constituencies: [],
    people: [],
    alike: [],
    parties: [],
    counts: { states: 0, elections: 0, districts: 0, constituencies: 0, people: 0, alike: 0, parties: 0 },
    capped: false,
    total: 0,
  };
  if (term === "") return empty;

  return read(() => {
    const pattern = like(term);
    // The person tier matches across scripts; the other groups are text matches, so a Bengali or Devanagari
    // query is transliterated before it reaches them. The registry stores no Indic name strings at all
    // today, so this is the only way those groups can answer such a query at all.
    const latin = script === "beng" || script === "deva" ? toLatin(term) : null;
    const textQuery = latin ?? term;
    const textPattern = latin === null ? pattern : like(latin);
    // A second pattern anchored at the start, used only for ORDER BY: a name that BEGINS with the query is
    // what a reader typing three letters almost always means.
    const textPrefix = `${(latin ?? term).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    // Read to as many people as the tier gives, so a count is the registry's and not the page's: the name matches come
    // first, so what is left after them is the sounds-like names.
    const rows = searchPersons(db, term, PERSON_SCAN);
    const names = rows.filter((p) => p.match !== "sounds-like");
    const alike = rows.filter((p) => p.match === "sounds-like");
    const group = {
      states: states(db, textPattern, textPrefix, textQuery),
      elections: elections(db, textQuery, textPrefix),
      districts: districts(db, textQuery),
      constituencies: constituencies(db, textPattern, textPrefix),
      parties: parties(db, textPattern, textPrefix),
    };
    const counts: Record<Group, number> = {
      states: group.states.total,
      elections: group.elections.total,
      districts: group.districts.total,
      constituencies: group.constituencies.total,
      people: names.length,
      alike: alike.length,
      parties: group.parties.total,
    };
    return {
      ...empty,
      transliterated: latin,
      states: group.states.hits,
      elections: group.elections.hits,
      districts: group.districts.hits,
      constituencies: group.constituencies.hits,
      people: names.slice(0, limit),
      alike: alike.slice(0, limit),
      parties: group.parties.hits,
      counts,
      capped: rows.length >= PERSON_SCAN,
      total: counts.states + counts.elections + counts.districts + counts.constituencies + counts.people + counts.parties,
    };
  });
}

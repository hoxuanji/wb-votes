/**
 * §12 stage 1 — BLOCKING.
 *
 * The whole job is to never build the O(n^2) pair set. 7,327 persons is 26,838,801 naive pairs;
 * blocking has to hand scoring a few hundred thousand and keep the true duplicates among them.
 *
 * Blocking optimises RECALL. A pair in two different buckets is never compared and the duplicate
 * survives forever; a pair wrongly in one bucket costs one scorePair() call. That asymmetry is why
 * core/indic's keys deliberately over-collapse (Banerjee and Bandyopadhyay share a bucket) and why
 * this file does not try to be clever about precision — that is score.ts's entire job.
 *
 * Three block families, unioned:
 *   name      core/indic blockingKeys() over every alias, plus the persisted person_alias.norm_key
 *             (001_registry.sql indexes it for exactly this).
 *   district  district + a 4-char prefix of the phonetic key. Catches pairs whose full keys diverge
 *             late ("Sk Md Salim" / "Md Salim Sk") but who contested in the same district.
 *   party     same, keyed on party instead of district.
 * The two co-* families are deliberately CONJUNCTIVE with a name prefix. A bare co-district block
 * is quadratic in the district (~320 persons -> 51k pairs per district, 23 districts) and buys
 * nothing scoring would keep.
 */

import type { DatabaseSync } from "node:sqlite";
import { all } from "../../db/index.ts";
import { UNPARSEABLE_KEY, blockingKeys, normaliseName, phoneticKey, toLatin, tokenKeys } from "../../core/indic/index.ts";

/**
 * A safety valve on the WORK one bucket may cost, not on its size.
 *
 * The old rule capped bucket size at 500 and dropped anything larger, which on the national registry
 * dropped 92 buckets and with them about a billion pairs of recall — silently, in the name of not being
 * quadratic. Expansion is no longer quadratic (see blockPairs), so a large bucket is only expensive when
 * it also contains many UNRESOLVED persons, and that product is what this bounds. On the live registry
 * the worst bucket costs about 5,477 x its unresolved members, so this never fires; it exists so a future
 * corpus cannot make the run unbounded without saying so in the report.
 */
export const MAX_BUCKET_WORK = 1_000_000;

/**
 * Kept for the callers and tests that name it: the largest bucket this will expand at all. Nothing is
 * dropped for being this big any more — the work cap above is what governs.
 */
export const MAX_BUCKET = 500;

/**
 * Identifier schemes under which a value IS identity, within the source that published it.
 *
 * TCPD assigns a `pid` per person per file and never reuses one, so two persons carrying pids from the
 * same file are asserted distinct BY THE PUBLISHER and comparing them cannot do anything but produce a
 * false positive. 440,708 of the registry's 448,035 persons carry one. That is what makes blocking
 * tractable at this scale: the resolver's job is the 7,327 who do not.
 *
 * Note what this does NOT claim: pids are scoped to a file, so the same politician in a state's assembly
 * file and its parliamentary file has two of them and is a genuine merge candidate. Those pairs are
 * withheld today and counted in the report as `pairsWithheldBothPublished`, because linking one house to
 * the other is a different job (§00-model's tenure spine) from de-duplicating the seed.
 */
const PUBLISHED_IDENTITY = ["tcpd_pid"] as const;

export type Candidacy = {
  contestId: string;
  placeId: string;
  districtId: string;
  partyId: string | null;
  age: number | null;
  /** Election year, so an age can be turned into an implied birth year. */
  year: number;
};

export type PersonRec = {
  id: string;
  canonicalName: string;
  /** Raw alias strings, as ingested. */
  aliases: string[];
  /** normaliseName + toLatin of every alias. */
  latin: string[];
  /** phoneticKey of every alias (UNPARSEABLE_KEY excluded). Concatenated — blocking only. */
  keys: Set<string>;
  /**
   * Per-alias TOKEN key lists, sorted, deduplicated by their joined form. What scoring compares:
   * the concatenated `keys` lose token boundaries, so "kbsbs" == "k|bsbs" there and two different
   * names read as phonetically identical.
   */
  tokenKeys: string[][];
  cands: Candidacy[];
  /** Constituency + party a person is asserted to hold WITHOUT a candidacy row: mla_term and
   *  ls_seat_won claims. Office-holder rows (currentMLAs / cabinet / MPs) have no candidacy at all,
   *  so without these both history features are 0 and they can never reach any merge threshold. */
  terms: { placeId: string | null; partyId: string | null }[];
  /** 'myneta_id:wb26_52', 'affidavit_url:https://…' — anything that identifies one human. */
  identifiers: Set<string>;
};

export type Pair = { a: string; b: string; via: "name" | "district" | "party" };

export type BlockReport = {
  persons: number;
  /** Persons carrying a published identifier, and therefore only comparable to the rest. */
  publishedIdentity: number;
  unresolved: number;
  /** Buckets with >=2 members that were actually expanded. */
  buckets: number;
  maxBucket: number;
  /** Buckets skipped for exceeding MAX_BUCKET_WORK. Nothing is skipped for size alone. */
  oversizedBuckets: number;
  /** Pairs a bucket contained but which were not emitted because BOTH sides carry a published id from
   *  the same file. Reported rather than invisible: this is the cross-house linking job, deferred. */
  pairsWithheldBothPublished: number;
  /** Term claims loadPersons could not parse. Those claims are the ONLY history a sitting MLA with
   *  no candidacy row has, so swallowing one silently recreates the bug the terms block was added to
   *  fix: the person can then never reach any merge threshold. */
  unparseableTerms: number;
  pairs: number;
  naivePairs: number;
  reductionPct: number;
};

/** Year out of an election id ('wb-assembly-2026' -> 2026). counting_on is null on every row. */
function electionYear(electionId: string): number {
  const m = /(\d{4})/.exec(electionId);
  return m === null ? 0 : Number(m[1]);
}

/**
 * Pairs inside one bucket where both sides are published AND published by DIFFERENT files — the same
 * politician in a state's assembly file and its parliamentary file. Counted, not emitted. Arithmetic per
 * file rather than enumeration, so a 39,816-member bucket costs a few dozen operations.
 */
function crossFilePairs(members: readonly string[], publishedBy: ReadonlyMap<string, string>): number {
  const perFile = new Map<string, number>();
  let published = 0;
  for (const id of members) {
    const file = publishedBy.get(id);
    if (file === undefined) continue;
    published += 1;
    perFile.set(file, (perFile.get(file) ?? 0) + 1);
  }
  let sameFile = 0;
  for (const n of perFile.values()) sameFile += (n * (n - 1)) / 2;
  return (published * (published - 1)) / 2 - sameFile;
}

/**
 * Load every person with the attributes both blocking and scoring need, in one pass of five
 * queries. 7,327 persons fit in memory comfortably; the alternative is a correlated subquery per
 * pair, which at ~200k pairs is the actual bottleneck.
 */
export function loadPersons(db: DatabaseSync): Map<string, PersonRec> {
  const persons = new Map<string, PersonRec>();
  for (const r of all<{ id: string; canonical_name: string }>(db, "SELECT id, canonical_name FROM person")) {
    persons.set(r.id, {
      id: r.id,
      canonicalName: r.canonical_name,
      aliases: [],
      latin: [],
      keys: new Set(),
      tokenKeys: [],
      cands: [],
      terms: [],
      identifiers: new Set(),
    });
  }

  // Migration 005 writes ONE person_alias ROW PER BLOCKING KEY, so the same name arrives 1-3
  // times: 19,882 rows for 6,201 distinct names on the real corpus (measured 2026-08-08). Deduplicating
  // here is not cosmetic — scorePair's name comparison is a cross product over p.latin, so the
  // inflation was 9x the jaroWinkler calls for provably identical scores (3,589 ms of scoring
  // became 793 ms, 0 of 231,242 scores changed).
  const seenAlias = new Set<string>();
  const addAlias = (p: PersonRec, name: string): void => {
    if (seenAlias.has(`${p.id} ${name}`)) return;
    seenAlias.add(`${p.id} ${name}`);
    p.aliases.push(name);
    p.latin.push(toLatin(normaliseName(name)));
    const k = phoneticKey(name);
    if (k !== UNPARSEABLE_KEY) p.keys.add(k);
    const toks = tokenKeys(name).sort();
    if (toks.length > 0 && !p.tokenKeys.some((t) => t.join("|") === toks.join("|"))) p.tokenKeys.push(toks);
  };

  for (const r of all<{ person_id: string; name: string }>(db, "SELECT person_id, name FROM person_alias")) {
    const p = persons.get(r.person_id);
    if (p !== undefined) addAlias(p, r.name);
  }
  // A person with no alias row still needs its canonical name in the index, or it can never be
  // paired with anything.
  for (const p of persons.values()) {
    if (p.aliases.length === 0) addAlias(p, p.canonicalName);
  }

  for (const r of all<{
    person_id: string;
    contest_id: string;
    place_id: string;
    district_id: string | null;
    party_id: string | null;
    age_declared: number | null;
    election_id: string;
  }>(
    db,
    `SELECT c.person_id, c.contest_id, pl.id AS place_id, pl.parent_id AS district_id,
            pv.party_id AS party_id, c.age_declared, ct.election_id
       FROM candidacy c
       JOIN contest ct        ON ct.id = c.contest_id
       JOIN place_version plv ON plv.id = ct.place_version_id
       JOIN place pl          ON pl.id = plv.place_id
       LEFT JOIN party_version pv ON pv.id = c.party_version_id`,
  )) {
    persons.get(r.person_id)?.cands.push({
      contestId: r.contest_id,
      placeId: r.place_id,
      districtId: r.district_id ?? r.place_id,
      partyId: r.party_id,
      age: r.age_declared,
      year: electionYear(r.election_id),
    });
  }

  // Office-holder rows (currentMLAs, cabinet, MPs) have NO candidacy: §19 has no office table, so
  // the seat and party they hold live in a claim. Without reading them back, both history features
  // are 0 for those 342 persons and their ceiling is 0.6471 — every sitting MLA and MP stays a
  // permanent duplicate of the person who holds their candidacies.
  for (const r of all<{ subject_ref: string; object_value: string }>(
    db,
    `SELECT subject_ref, object_value FROM claim
      WHERE predicate IN ('mla_term', 'ls_seat_won') OR predicate LIKE 'cabinet_portfolio:%'`,
  )) {
    if (!r.subject_ref.startsWith("person:")) continue;
    const p = persons.get(r.subject_ref.slice("person:".length));
    if (p === undefined) continue;
    let v: { placeId?: unknown; partyId?: unknown };
    try {
      v = JSON.parse(r.object_value) as { placeId?: unknown; partyId?: unknown };
    } catch {
      continue;
    }
    const placeId = typeof v.placeId === "string" ? v.placeId : null;
    const partyId = typeof v.partyId === "string" ? v.partyId : null;
    if (placeId !== null || partyId !== null) p.terms.push({ placeId, partyId });
  }

  for (const r of all<{ person_id: string; scheme: string; value: string }>(
    db,
    "SELECT person_id, scheme, value FROM person_identifier",
  )) {
    persons.get(r.person_id)?.identifiers.add(`${r.scheme}:${r.value}`);
  }

  // The affidavit URL is the strongest identifier this corpus carries and it is not in
  // person_identifier: it hangs off affidavit -> source.
  for (const r of all<{ person_id: string; url: string }>(
    db,
    `SELECT c.person_id, s.url
       FROM affidavit a
       JOIN candidacy c ON c.id = a.candidacy_id
       JOIN source s    ON s.id = a.source_id
      WHERE s.url IS NOT NULL`,
  )) {
    persons.get(r.person_id)?.identifiers.add(`affidavit_url:${r.url}`);
  }

  return persons;
}

/** Every bucket key a person should be indexed under, across all three block families. */
function keysFor(p: PersonRec, normKeys: ReadonlySet<string>): Map<string, Pair["via"]> {
  const out = new Map<string, Pair["via"]>();
  for (const name of p.aliases) {
    for (const k of blockingKeys(name)) {
      if (k !== UNPARSEABLE_KEY) out.set(`n:${k}`, "name");
    }
  }
  for (const k of normKeys) if (k !== "") out.set(`n:!${k}`, "name");

  const prefixes = new Set([...p.keys].map((k) => k.slice(0, 4)).filter((k) => k.length >= 2));
  for (const c of p.cands) {
    for (const pre of prefixes) {
      out.set(`d:${c.districtId}:${pre}`, out.get(`d:${c.districtId}:${pre}`) ?? "district");
      if (c.partyId !== null) out.set(`p:${c.partyId}:${pre}`, out.get(`p:${c.partyId}:${pre}`) ?? "party");
    }
  }
  return out;
}

/**
 * Generate candidate pairs. Never materialises the full pair set; a pair is emitted once, tagged
 * with the first block family that produced it, with a < b so downstream keys are canonical.
 */
export function blockPairs(
  db: DatabaseSync,
  persons: Map<string, PersonRec> = loadPersons(db),
): { pairs: Pair[]; report: BlockReport } {
  const normKeys = new Map<string, Set<string>>();
  for (const r of all<{ person_id: string; norm_key: string }>(db, "SELECT person_id, norm_key FROM person_alias")) {
    let s = normKeys.get(r.person_id);
    if (s === undefined) normKeys.set(r.person_id, (s = new Set()));
    s.add(r.norm_key);
  }

  // Which persons the publisher has already identified, and in which file. Same file on both sides means
  // the pair is asserted-distinct; different files means a genuine candidate this pass withholds and
  // counts rather than scores.
  const publishedBy = new Map<string, string>();
  for (const r of all<{ person_id: string; source_id: string }>(
    db,
    `SELECT person_id, source_id FROM person_identifier
      WHERE scheme IN (${PUBLISHED_IDENTITY.map(() => "?").join(",")})`,
    ...PUBLISHED_IDENTITY,
  )) {
    publishedBy.set(r.person_id, r.source_id);
  }

  const buckets = new Map<string, string[]>();
  const via = new Map<string, Pair["via"]>();
  for (const p of persons.values()) {
    for (const [key, family] of keysFor(p, normKeys.get(p.id) ?? new Set())) {
      let members = buckets.get(key);
      if (members === undefined) buckets.set(key, (members = []));
      members.push(p.id);
      via.set(key, family);
    }
  }

  const seen = new Map<string, Pair["via"]>();
  let expanded = 0;
  let oversized = 0;
  let maxBucket = 0;
  let withheld = 0;
  for (const [key, membersRaw] of buckets) {
    // keysFor() returns a Map, so a person is pushed into a given bucket at most once.
    const members = membersRaw.sort();
    if (members.length < 2) continue;
    maxBucket = Math.max(maxBucket, members.length);
    // Every pair this bucket implies between two published persons is either asserted-distinct (same
    // file) or the deferred cross-house case. Counted either way, emitted neither way.
    withheld += crossFilePairs(members, publishedBy);
    const free = members.filter((id) => !publishedBy.has(id));
    if (free.length === 0) continue;
    if (free.length * members.length > MAX_BUCKET_WORK) {
      oversized += 1;
      continue;
    }
    expanded += 1;
    const family = via.get(key) ?? "name";
    for (const a of free) {
      for (const b of members) {
        if (a === b) continue;
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const pk = `${lo} ${hi}`;
        // A name-block pair beats a co-* pair for reporting: it is the stronger provenance.
        if (family === "name" || !seen.has(pk)) seen.set(pk, family);
      }
    }
  }

  const pairs: Pair[] = [];
  for (const [pk, family] of seen) {
    // Two ids joined two lines above, so both halves are always there.
    const [a, b] = pk.split(" ") as [string, string];
    pairs.push({ a, b, via: family });
  }
  pairs.sort((x, y) => (x.a === y.a ? (x.b < y.b ? -1 : 1) : x.a < y.a ? -1 : 1));

  const n = persons.size;
  const naivePairs = (n * (n - 1)) / 2;
  // loadPersons swallows an unparseable term claim with `catch { continue }`. json_valid asks SQLite
  // the same question in one query, so the loss is reported instead of silent.
  const unparseableTerms = Number(
    all<{ n: number }>(
      db,
      `SELECT COUNT(*) AS n FROM claim
        WHERE subject_ref LIKE 'person:%' AND NOT json_valid(object_value)
          AND (predicate IN ('mla_term', 'ls_seat_won') OR predicate LIKE 'cabinet_portfolio:%')`,
    )[0]?.n ?? 0,
  );
  return {
    pairs,
    report: {
      persons: n,
      publishedIdentity: publishedBy.size,
      unresolved: n - publishedBy.size,
      buckets: expanded,
      maxBucket,
      oversizedBuckets: oversized,
      pairsWithheldBothPublished: withheld,
      unparseableTerms,
      pairs: pairs.length,
      naivePairs,
      reductionPct: naivePairs === 0 ? 0 : Number((100 * (1 - pairs.length / naivePairs)).toFixed(4)),
    },
  };
}

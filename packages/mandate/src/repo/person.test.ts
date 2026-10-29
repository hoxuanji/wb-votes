import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { DEV_DB_PATH, openRead } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { RegistryUnavailableError, counted, getPersonBrief, searchPersons } from "./index.ts";
import { seatTies } from "./place-resolve.ts";

// The live registry is gitignored, so CI has no database. The guard probes the SCHEMA, not the
// file: existsSync was defeated by the read path itself, which used to create an empty
// .data/registry.db and so turned run 2 on a fresh clone from 15 skips into 9 failures.
function haveRegistry(): boolean {
  try {
    const d = openRead(DEV_DB_PATH);
    try {
      d.prepare("SELECT 1 FROM person LIMIT 1").get();
      return true;
    } finally {
      d.close();
    }
  } catch {
    return false;
  }
}
const skip = haveRegistry() ? false : `no registry at ${DEV_DB_PATH} — run npm run registry:migrate`;

function db(): DatabaseSync {
  return openRead(DEV_DB_PATH);
}

/** Counts prepared statements, so "ONE call per Brief" is asserted, not asserted-in-a-comment. */
function counting(real: DatabaseSync): { db: DatabaseSync; count: () => number } {
  let n = 0;
  const proxy = new Proxy(real, {
    get(target, prop, recv) {
      if (prop === "prepare") {
        return (sql: string) => {
          n += 1;
          return target.prepare(sql);
        };
      }
      // Bound to the real handle: a native method called on the proxy is an illegal invocation (`location`, which
      // `seatTies` stamps its cache with).
      const v = Reflect.get(target, prop, target) as unknown;
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
  });
  return { db: proxy, count: () => n };
}

test("getPersonBrief: multi-election person, newest first, with sources", { skip }, () => {
  const d = db();
  const slug = d
    .prepare(
      `SELECT ca.person_id AS id FROM candidacy ca JOIN contest c ON c.id = ca.contest_id
        GROUP BY ca.person_id HAVING COUNT(DISTINCT c.election_id) >= 2
        ORDER BY COUNT(DISTINCT c.election_id) DESC, ca.person_id LIMIT 1`,
    )
    .get() as { id: string } | undefined;
  assert.ok(slug, "registry has a person contesting two elections");

  // Which seats share a name is read once per registry file and kept (`seatTies`), so it is not a cost of one Brief: it
  // is read here, before the count, and the Brief must not read it again.
  seatTies(d);
  const { db: counted, count } = counting(d);
  const brief = getPersonBrief(counted, slug.id);
  assert.ok(brief);
  assert.equal(count(), 8, "one Brief costs eight fixed queries, never N+1");

  assert.ok(brief.candidacies.length >= 2);
  const years = brief.candidacies.map((c) => c.year);
  assert.deepEqual(years, [...years].sort((a, b) => b - a), "newest election first");
  assert.ok(brief.person.canonicalName.length > 0);
  assert.ok(brief.aliases.length > 0);

  // P2: an empty sources array on a non-null Brief is a contract violation, not an edge case.
  assert.ok(brief.sources.length > 0, "Brief carries its provenance");
  for (const s of brief.sources) {
    assert.ok(s.id.length > 0);
    assert.ok(["document_bytes", "url_only"].includes(s.hashKind));
    assert.ok(["fetched", "asserted_by_upstream"].includes(s.retrievalKind));
  }
  // Every figure-bearing candidacy traces to a source that is in the union.
  const ids = new Set(brief.sources.map((s) => s.id));
  const rows = d
    .prepare(
      `SELECT r.source_id AS s FROM result r JOIN candidacy ca ON ca.id = r.candidacy_id
        WHERE ca.person_id = ?`,
    )
    .all(slug.id) as { s: string }[];
  for (const r of rows) assert.ok(ids.has(r.s), `result source ${r.s} present in sources`);
  d.close();
});

test("getPersonBrief: affidavit trail is chronological", { skip }, () => {
  const d = db();
  const slug = d
    .prepare(
      `SELECT ca.person_id AS id, COUNT(*) AS n FROM affidavit a
         JOIN candidacy ca ON ca.id = a.candidacy_id
        GROUP BY ca.person_id ORDER BY n DESC, ca.person_id LIMIT 1`,
    )
    .get() as { id: string; n: number } | undefined;
  assert.ok(slug);
  const brief = getPersonBrief(d, slug.id);
  assert.ok(brief);
  assert.equal(brief.affidavitTrail.length, slug.n);
  const years = brief.affidavitTrail.map((a) => a.year);
  assert.deepEqual(years, [...years].sort((a, b) => a - b), "oldest first");
  const first = brief.affidavitTrail[0];
  assert.ok(first);
  assert.ok(first.sourceId.length > 0, "every affidavit row names its source");
  assert.ok(brief.sources.some((s) => s.id === first.sourceId));
  d.close();
});

// Two affidavits for one person do not exist in cycle 1's data (2026 filings only), so the delta
// ordering gets a fixture. This is the test that fails if the trail is ever ordered newest-first.
test("affidavit trail orders a real two-filing series oldest-first", () => {
  const d = new DatabaseSync(":memory:");
  d.exec("PRAGMA foreign_keys = ON");
  migrate(d, "2026-01-01T00:00:00.000Z");
  d.exec(`
    INSERT INTO source (id,kind,retrieved_at,doc_hash) VALUES ('s1','affidavit','2026-01-01T00:00:00Z','h');
    INSERT INTO boundary_epoch (id,name,effective_from) VALUES ('e','Delim 2008','2008-01-01');
    INSERT INTO place (id,kind,canonical_name) VALUES ('wb','state','West Bengal');
    INSERT INTO place (id,kind,parent_id,canonical_name) VALUES ('wb.ac.001','ac','wb','Testpur');
    INSERT INTO place_version (id,place_id,jurisdiction_id,kind,epoch_id,number,canonical_name,reservation)
      VALUES (1,'wb.ac.001','wb','ac','e',1,'Testpur','general');
    INSERT INTO person (id,canonical_name,review_state,created_at) VALUES ('t-p','Test Person','auto','2026-01-01T00:00:00Z');
    INSERT INTO person_alias (person_id,name,script,norm_key,kind) VALUES ('t-p','Test Person','latn','tstprsn','affidavit');
    INSERT INTO election (id,kind,level,jurisdiction_place_id,epoch_id,name,lifecycle,house,year,occurrence)
      VALUES ('wb-assembly-2016','assembly','state','wb','e','WB 2016','declared','ac',2016,1),
             ('wb-assembly-2021','assembly','state','wb','e','WB 2021','declared','ac',2021,1);
    INSERT INTO contest (id,election_id,place_version_id,lifecycle) VALUES
      ('wb-assembly-2016:t','wb-assembly-2016',1,'declared'),
      ('wb-assembly-2021:t','wb-assembly-2021',1,'declared');
    INSERT INTO candidacy (id,contest_id,person_id,status) VALUES
      ('c16','wb-assembly-2016:t','t-p','defeated'),
      ('c21','wb-assembly-2021:t','t-p','elected');
    INSERT INTO affidavit (id,candidacy_id,filed_on,source_id) VALUES
      ('a21','c21','2021-03-01','s1'), ('a16','c16','2016-03-01','s1');
    INSERT INTO affidavit_field (affidavit_id,path,value_numeric,parser_version) VALUES
      ('a16','assets.total',100,'v1'), ('a21','assets.total',500,'v1');
  `);
  const brief = getPersonBrief(d, "t-p");
  assert.ok(brief);
  assert.deepEqual(
    brief.affidavitTrail.map((a) => [a.year, a.assetsTotal]),
    [
      [2016, 100],
      [2021, 500],
    ],
  );
  assert.deepEqual(
    brief.candidacies.map((c) => c.year),
    [2021, 2016],
  );
  assert.ok(brief.sources.length > 0);
  d.close();
});

// A literal registry: a verified election (2021, with vote counts) and a withheld one (2026, winners and margins and no
// votes), a seat declared for someone else, and a person row that holds a seat claim and no contest.
function twoElections(): DatabaseSync {
  const d = new DatabaseSync(":memory:");
  d.exec("PRAGMA foreign_keys = ON");
  migrate(d, "2026-01-01T00:00:00.000Z");
  d.exec(`
    INSERT INTO source (id,kind,retrieved_at,doc_hash) VALUES ('s1','eci_declaration','2026-01-01T00:00:00Z','h');
    INSERT INTO boundary_epoch (id,name,effective_from) VALUES ('e','Delim 2008','2008-01-01');
    INSERT INTO place (id,kind,canonical_name) VALUES ('wb','state','West Bengal');
    INSERT INTO place (id,kind,parent_id,canonical_name) VALUES ('wb.ac.001','ac','wb','Testpur');
    INSERT INTO place_version (id,place_id,jurisdiction_id,kind,epoch_id,number,canonical_name,reservation)
      VALUES (1,'wb.ac.001','wb','ac','e',1,'Testpur','general');
    INSERT INTO party (id,name,short_name) VALUES ('AAA','A Party','AAA'), ('BBB','B Party','BBB');
    INSERT INTO party_version (id,party_id,valid_from,name) VALUES (1,'AAA','1990-01-01','A Party'), (2,'BBB','1990-01-01','B Party');
    INSERT INTO election (id,kind,level,jurisdiction_place_id,epoch_id,name,lifecycle,house,year,occurrence)
      VALUES ('wb-assembly-2021','assembly','state','wb','e','WB 2021','declared','ac',2021,1),
             ('wb-assembly-2026','assembly','state','wb','e','WB 2026','declared','ac',2026,1);
    INSERT INTO contest (id,election_id,place_version_id,lifecycle) VALUES
      ('c21','wb-assembly-2021',1,'declared'), ('c26','wb-assembly-2026',1,'declared');
    INSERT INTO person (id,canonical_name,review_state,created_at) VALUES
      ('veteran','VETERAN','auto','2026-01-01T00:00:00Z'),
      ('champ21','CHAMP TWENTYONE','auto','2026-01-01T00:00:00Z'),
      ('champ26','CHAMP TWENTYSIX','auto','2026-01-01T00:00:00Z'),
      ('orphan','Orphan Member','auto','2026-01-01T00:00:00Z');
    INSERT INTO person_alias (person_id,name,script,norm_key,kind) VALUES
      ('veteran','VETERAN','latn','vtrn','affidavit'), ('orphan','Orphan Member','latn','orfnmmbr','affidavit'),
      ('champ21','CHAMP TWENTYONE','latn','chmptwntn','affidavit'), ('champ26','CHAMP TWENTYSIX','latn','chmptwntsx','affidavit');
    INSERT INTO candidacy (id,contest_id,person_id,party_version_id,status) VALUES
      ('v21','c21','veteran',2,'defeated'), ('w21','c21','champ21',1,'elected'),
      ('v26','c26','veteran',2,'contesting'), ('w26','c26','champ26',1,'elected');
    INSERT INTO result (contest_id,candidacy_id,revision,votes,"rank",is_winner,margin,source_id,ingested_at) VALUES
      ('c21','v21',0,400,2,0,NULL,'s1','2026-01-01'), ('c21','w21',0,600,1,1,200,'s1','2026-01-01'),
      ('c26','w26',0,0,1,1,500,'s1','2026-01-01');
    INSERT INTO turnout (contest_id,scope,electors,voters,source_id) VALUES
      ('c21','contest',2000,1000,'s1'), ('c26','contest',2000,1930,'s1');
    INSERT INTO claim (subject_ref,predicate,object_value,unit,as_of,confidence) VALUES
      ('person:orphan','mla_term','{"term":"2026-2031","constituencyId":"c0001","party":"BBB","placeId":"wb.ac.001","partyId":"BBB"}',NULL,'2026-01-01','provisional'),
      ('person:orphan','mla_margin_votes','500','votes','2026-01-01','provisional');
  `);
  return d;
}

test("getPersonBrief: a withheld election's turnout is a reading that withholds, and a verified one is a figure", () => {
  const d = twoElections();
  const b = getPersonBrief(d, "veteran");
  assert.ok(b);
  const [c26, c21] = b.candidacies;
  assert.equal(c26?.turnout.state, "unverified", "2026 published no candidate votes, so its turnout is withheld");
  assert.deepEqual(c21?.turnout, { state: "reported", pct: 50 });
  assert.ok(!("turnoutPct" in (c26 ?? {})), "no bare percentage is left on the candidacy to print by mistake");
  d.close();
});

test("getPersonBrief: a candidacy knows who its contest was declared for, and the winner does not", () => {
  const d = twoElections();
  const v = getPersonBrief(d, "veteran");
  assert.deepEqual(
    v?.candidacies.map((c) => c.wonBy),
    [
      { personId: "champ26", name: "CHAMP TWENTYSIX", partyShortName: "AAA" },
      { personId: "champ21", name: "CHAMP TWENTYONE", partyShortName: "AAA" },
    ],
  );
  assert.equal(getPersonBrief(d, "champ26")?.candidacies[0]?.wonBy, null, "a winner was not won by someone else");
  d.close();
});

test("getPersonBrief: a seat declared for a winner with no result row still names that winner", () => {
  const d = twoElections();
  d.exec(`DELETE FROM result WHERE candidacy_id = 'w26'`);
  assert.equal(getPersonBrief(d, "veteran")?.candidacies[0]?.wonBy?.personId, "champ26");
  d.close();
});

test("getPersonBrief: a row with no contest but a seat claim says which seat, and a row with a contest says nothing of it", () => {
  const d = twoElections();
  const o = getPersonBrief(d, "orphan");
  assert.ok(o);
  assert.equal(o.candidacies.length, 0);
  assert.deepEqual(o.sitting, {
    term: "2026-2031",
    placeName: "Testpur",
    placeHref: "/constituency/wb/assembly/testpur",
    party: "BBB",
    marginVotes: 500,
    asOf: "2026-01-01",
  });
  d.exec(`INSERT INTO claim (subject_ref,predicate,object_value,as_of,confidence)
          VALUES ('person:veteran','mla_term','{"term":"2026-2031","party":"BBB","placeId":"wb.ac.001"}','2026-01-01','provisional')`);
  assert.equal(getPersonBrief(d, "veteran")?.sitting, null, "the contest on record already says it");
  d.close();
});

test("getPersonBrief: a seat claim that names no seat the registry has says nothing", () => {
  const d = twoElections();
  d.exec(`UPDATE claim SET object_value = '{"term":"2026-2031","placeId":"wb.ac.999"}' WHERE predicate = 'mla_term'`);
  assert.equal(getPersonBrief(d, "orphan")?.sitting, null);
  d.exec(`UPDATE claim SET object_value = 'not json' WHERE predicate = 'mla_term'`);
  assert.equal(getPersonBrief(d, "orphan")?.sitting, null);
  d.close();
});

// searchPersons reads each hit's latest candidacy after it has ranked and cut to the limit, and not for every candidacy in the registry
// before it. These hold what that must not change: the order, the cut, and the latest candidacy of exactly the people returned.
test("searchPersons: the cut is made on the ranking, and each hit carries its own latest candidacy", () => {
  const d = twoElections();
  const all = searchPersons(d, "champ", 20);
  assert.deepEqual(
    all.map((h) => [h.id, h.latestYear, h.latestPlaceName, h.latestPartyShortName, h.latestStatus, h.isWinner]),
    [
      ["champ21", 2021, "Testpur", "AAA", "elected", true],
      ["champ26", 2026, "Testpur", "AAA", "elected", true],
    ],
  );
  assert.deepEqual(
    searchPersons(d, "champ", 1).map((h) => h.id),
    ["champ21"],
    "a limit of one keeps the first of the ranking, not the first row read",
  );
  const [v] = searchPersons(d, "veteran", 20);
  assert.deepEqual(
    [v?.id, v?.latestYear, v?.latestStatus, v?.candidacyCount],
    ["veteran", 2026, "contesting", 2],
    "of two candidacies the newest is the latest",
  );
  assert.equal(v?.latestWonBy, "CHAMP TWENTYSIX", "and its seat was declared for someone else");
  assert.equal(all[1]?.latestWonBy, null, "a winner's seat was not");
  d.close();
});

test("searchPersons: a person with no candidacy is found, with nothing to say of a latest one", () => {
  const d = twoElections();
  const [o] = searchPersons(d, "orphan member", 20);
  assert.deepEqual(
    [o?.id, o?.latestElectionId, o?.latestPlaceName, o?.latestStatus, o?.candidacyCount, o?.match],
    ["orphan", null, null, null, 0, "name"],
  );
  d.close();
});

test("getPersonBrief: unknown slug is null, not a throw", { skip }, () => {
  const d = db();
  assert.equal(getPersonBrief(d, "no-such-person-zzzz"), null);
  d.close();
});

test("searchPersons: unions every blocking key and finds distinct homonyms", { skip }, () => {
  const d = db();
  const hits = searchPersons(d, "Md Salim", 50);
  assert.ok(hits.length >= 2, `expected homonyms, got ${hits.length}`);
  assert.equal(new Set(hits.map((h) => h.id)).size, hits.length, "one row per person");
  assert.ok(hits.some((h) => /salim/i.test(h.canonicalName)));
  // Order-independent key: surname-first form reaches the same people as given-name-first.
  const reversed = searchPersons(d, "Salim Md", 50).map((h) => h.id);
  assert.ok(
    hits.some((h) => reversed.includes(h.id)),
    "surname-first and given-name-first meet",
  );
  // Deterministic, but no longer alphabetical-by-id: this used to assert the order EQUALLED the
  // sorted id list, which was the old `ORDER BY p.id` written down as a requirement. Ranking is now
  // by match tier then prominence, so determinism is what the test should check — the same query
  // twice must give the same order, and the tie-breaker is the id, so it always does.
  assert.deepEqual(
    searchPersons(d, "Md Salim", 50).map((h) => h.id),
    hits.map((h) => h.id),
    "the same query returned two different orders",
  );
  d.close();
});

test("searchPersons: gibberish and empty terms return no rows", { skip }, () => {
  const d = db();
  assert.deepEqual(searchPersons(d, "   ", 5), []); // UNPARSEABLE_KEY bucket excluded
  d.close();
});

// ── the two failures a UI exposed ────────────────────────────────────────────────────────────────
// Both were invisible while search was only consumed by /v1/search, which nobody read the ranking of.

test("searchPersons: a one-word query finds a two-word name", { skip }, () => {
  const d = db();
  // The original bug: a single token emits the bare key `mt`, a two-token record emits `bnrj|mt`,
  // `mtbnrj` and surname-only `bnrj` — never a given-name-only key. So the most obvious query in the
  // dataset returned six phonetic near-misses and not the person.
  for (const q of ["mamata", "\u09AE\u09AE\u09A4\u09BE", "Mamata"]) {
    const hits = searchPersons(d, q, 10);
    const names = hits.map((h) => h.canonicalName);
    assert.ok(
      names.some((n) => /banerjee/i.test(n)),
      `${q} did not surface a Banerjee at all: ${names.join(", ")}`,
    );
    assert.equal(hits[0]?.match, "name", `${q} led with a phonetic guess instead of a real match`);
  }
  d.close();
});

test("searchPersons: a phonetic-only hit is labelled, never presented as a match", { skip }, () => {
  const d = db();
  // "zzzznobody" keys to `jnbd`, and so does "JHUNU BAIDYA" — z->j with vowels dropped. The key is
  // behaving correctly; what was wrong was calling the result a match. It must arrive as a
  // suggestion so a surface can say so.
  const junk = searchPersons(d, "zzzznobody", 10);
  assert.ok(
    junk.every((h) => h.match === "sounds-like"),
    "gibberish produced a name-tier match",
  );

  // Both directions: a real name must NOT be demoted to a suggestion.
  const real = searchPersons(d, "Mamata", 5);
  assert.ok(real.length > 0 && real[0]?.match === "name");

  // A LIKE wildcard is a pattern injection, not a SQL one: unescaped, "%" returned the registry.
  for (const wild of ["%", "_", "%%", "\\"]) {
    assert.equal(searchPersons(d, wild, 50).length, 0, `${wild} matched something`);
  }
  d.close();
});

// ── the ranking contract ─────────────────────────────────────────────────────────────────────────
//
// ONE SENTENCE, and every assertion below is a reading of it:
//
//   An exact canonical identity must not be outranked by a weaker substring or alias match merely
//   because the latter is more prominent.
//
// Ranking is `closeness DESC` (3 exact · 2 prefix · 1 contains · 0 phonetic-only), then prominence
// (ever won, then candidacy count), then a deterministic name-and-id tie-break. Prominence only ever
// decides WITHIN a tier.
//
// THREE DEFECTS THESE TESTS PIN DOWN, all found by measuring the result population for "Md Salim"
// rather than by adjusting weights:
//
//   1. THE TERM WAS MUTILATED. `normaliseName` strips leading honorifics, and `md` is one, so the
//      substring tier received "salim" and searched 280 people. The twelve people named literally
//      SALIM scored exact while MD SALIM only contained. Stripping is right for RESOLUTION — it is
//      what makes MyNeta's "Md. Salim" and Lokdhaba's "SALIM" one human — and wrong for SEARCH,
//      because `canonical_name` keeps the particle.
//   2. TWO MEASURES OF ONE THING. A boolean `name_match` sorted AHEAD of closeness and set the
//      `match` label, and it did not strip dots. So "MD. SALIM" ranked below "MD SALIM MANSURI" and
//      was labelled a phonetic guess while scoring exact.
//   3. EXACT MATCHES WERE UNREACHABLE. The WHERE clause compared un-normalised stored names to a
//      normalised pattern, so five of the seven people canonically named MD. SALIM were filtered out
//      entirely — including the one with six candidacies and a parliamentary win.
//
// A note on what is NOT tested, because it was measured and found vacuous: a canonical-before-alias
// tier. People holding an exactly-matching alias but no exactly-matching canonical name number ZERO
// in this registry, since ingest mirrors the canonical spelling into `person_alias`.

/** The registry's own spelling normalisation, mirrored in JS so a test derives the tier itself. */
const spelling = (s: string): string =>
  s.toLowerCase().replace(/\./g, "").replace(/ {2,}/g, " ").trim();

test("searchPersons: a person is the FIRST answer to their own name", { skip }, () => {
  const d = db();
  for (const [term, expected] of [
    // The name that started it: MD SALIM ranked 68th behind sixty-seven strangers.
    ["Md Salim", "md salim"],
    // The same query with the dot the sources disagree about. Must be indistinguishable.
    ["Md. Salim", "md salim"],
    ["Mamata Banerjee", "mamata banerjee"],
    ["Narendra Modi", "narendra modi"],
    // ALIAS-HEAVY, and the pathological case in this corpus: fifty-four recorded spellings of one
    // person across 194 candidacies — "URF", "ALIAS", "@", and every misspelling of Joginder there
    // is. If a MAX-over-aliases closeness can be confused by volume, it is confused here.
    ["Kaka Joginder Singh Dharti Pakad", "kaka joginder singh dharti pakad"],
    // ALIAS-HEAVY, thirteen spellings, and a long multi-token name where a prefix tier could win by
    // accident rather than by exactness.
    ["Kalvakuntla Chandrashekar Rao", "kalvakuntla chandrashekar rao"],
    // ALIAS-HEAVY, eleven spellings, six words, Bengali transliteration variance in every one.
    ["Abdul Barkat Ataul Ghani Khan Chawdhury", "abdul barkat ataul ghani khan chawdhury"],
  ] as const) {
    const hits = searchPersons(d, term, 50);
    assert.ok(hits.length > 0, `${term} found nobody at all`);
    assert.equal(
      spelling(hits[0]?.canonicalName ?? ""),
      expected,
      `"${term}" led with ${hits[0]?.canonicalName} — a person is not the second-best answer to their own name`,
    );
    assert.equal(hits[0]?.match, "name", `"${term}" led with a phonetic guess`);
  }
  d.close();
});

test("searchPersons: exactness outranks prominence, never the reverse", { skip }, () => {
  const d = db();
  // The contract stated as a comparison the data makes for us. Two people are named exactly
  // "MAMATA" with one candidacy each; MAMATA BANERJEE has nine and is only a PREFIX match. Under
  // the old ranking prominence decided and she led; under the contract she cannot, because she is
  // not who was asked for.
  const hits = searchPersons(d, "mamata", 50);
  const exact = hits.map((h, i) => [i, h] as const).filter(([, h]) => spelling(h.canonicalName) === "mamata");
  const prominent = hits.findIndex((h) => spelling(h.canonicalName) === "mamata banerjee");
  assert.ok(exact.length >= 2, "expected at least two people named exactly MAMATA");
  assert.ok(prominent >= 0, "MAMATA BANERJEE fell out of the results entirely");
  for (const [rank, h] of exact) {
    assert.ok(
      rank < prominent,
      `${h.canonicalName} (exact, ${h.candidacyCount} candidacies) ranked below ` +
        `MAMATA BANERJEE (prefix, ${hits[prominent]?.candidacyCount} candidacies) — prominence beat exactness`,
    );
  }
  // And the low-prominence exact match is still labelled a real match, not a suggestion.
  assert.ok(exact.every(([, h]) => h.match === "name"));
  d.close();
});

test("searchPersons: every exactly-named person is REACHABLE, not merely ranked", { skip }, () => {
  const d = db();
  // Defect 3, and the one a ranking test cannot see. Five of these seven were absent from the
  // result set, filtered out by a WHERE clause that compared "md. salim" to a pattern built from
  // "md salim" — so no amount of reordering could have surfaced them.
  const everyone = d
    .prepare(
      `SELECT id FROM person
        WHERE lower(replace(replace(canonical_name, '.', ''), '  ', ' ')) = 'md salim'`,
    )
    .all() as { id: string }[];
  assert.ok(everyone.length >= 2, "fixture gone: expected several people named MD SALIM");
  const found = new Set(searchPersons(d, "Md Salim", 200).map((h) => h.id));
  for (const p of everyone) {
    assert.ok(found.has(p.id), `${p.id} is named MD SALIM and search could not find them`);
  }
  d.close();
});

test("searchPersons: every row carries a source id, including result-only people", { skip }, () => {  const d = db();
  // A person with NO person-level claim: only the 2026 affidavit filers have those, and /v1/search
  // used to answer 500 for everyone else because it resolved sources from claims alone.
  const name = d
    .prepare(
      `SELECT p.canonical_name AS n FROM person p
        WHERE NOT EXISTS (SELECT 1 FROM claim c WHERE c.subject_ref = 'person:' || p.id)
        ORDER BY p.id LIMIT 1`,
    )
    .get() as { n: string } | undefined;
  assert.ok(name, "registry has a person with no person-level claim");
  const hits = searchPersons(d, name.n, 20);
  assert.ok(hits.length > 0, `search found ${name.n}`);
  for (const h of hits) assert.ok(h.sourceId !== null, `${h.id} carries a source id`);
  d.close();
});

test("a zero vote count is null everywhere: it means not reported, not zero", { skip }, () => {
  assert.equal(counted(0), null);
  assert.equal(counted(null), null);
  assert.equal(counted(7109), 7109);
  const d = db();
  // Every 2026 result row carries votes = 0 (declared seat, no count ingested).
  const id = d
    .prepare(
      `SELECT ca.person_id AS id FROM candidacy ca JOIN contest c ON c.id = ca.contest_id
         JOIN result r ON r.candidacy_id = ca.id
        WHERE c.election_id = 'wb-assembly-2026' AND r.votes = 0 ORDER BY ca.id LIMIT 1`,
    )
    .get() as { id: string } | undefined;
  if (id !== undefined) {
    const brief = getPersonBrief(d, id.id);
    const row = brief?.candidacies.find((c) => c.year === 2026);
    assert.ok(row);
    assert.equal(row.votes, null, "an uncounted 2026 row never publishes 0 votes");
    assert.equal(row.voteShare, null);
  }
  const hits = searchPersons(d, "Mamata Banerjee", 50);
  for (const h of hits) assert.notEqual(h.latestVotes, 0);
  d.close();
});

test("missing/unmigrated database throws RegistryUnavailableError", () => {
  const empty = new DatabaseSync(":memory:");
  assert.throws(() => getPersonBrief(empty, "x"), RegistryUnavailableError);
  assert.throws(() => searchPersons(empty, "Md Salim"), RegistryUnavailableError);
  empty.close();
});

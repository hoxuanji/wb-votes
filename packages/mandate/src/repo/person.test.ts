import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { DEV_DB_PATH, openRead } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { RegistryUnavailableError, counted, getPersonBrief, searchPersons } from "./index.ts";

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
      return Reflect.get(target, prop, recv) as unknown;
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

  const { db: counted, count } = counting(d);
  const brief = getPersonBrief(counted, slug.id);
  assert.ok(brief);
  assert.equal(count(), 7, "one Brief costs seven fixed queries, never N+1");

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

test("searchPersons: every row carries a source id, including result-only people", { skip }, () => {
  const d = db();
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

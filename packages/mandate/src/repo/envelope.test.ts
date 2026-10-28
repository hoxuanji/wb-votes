// §20 contract test. The rule that makes P2 real: EVERY 200 from a /v1 endpoint carries a
// non-empty `sources` array and a complete `meta` block. An endpoint that can answer 200 with
// `sources: []` fails here.
//
// The handler bodies are plain functions in src/app/v1/_envelope.ts, so this runs under
// `node --test` — no dev server, no test framework, no dependency.
//
// It runs against a FIXTURE registry built in a temp directory, so the contract is asserted on CI
// too (.data/ is gitignored). Skipping it there is what let cycle 2 ship a /v1/search that answered
// 500 for 8.5% of real names: 5 of 6 tests skipped and the suite still exited 0. The live registry
// is then checked as an extra, when it exists.

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { blockingKeys } from "../core/index.ts";
import { open, openRead } from "../db/index.ts";
import { ensureEpochs } from "../db/epochs.ts";
import { migrate } from "../db/migrate.ts";
import type { Envelope, Meta, Reply } from "./envelope.ts";
import { personReply, placeReply, searchLimit, searchReply, toResponse, unavailable, unknownEndpointReply } from "./envelope.ts";
import { readRegistry } from "./session.ts";

const AC = "wb.ac.001";
const NOW = "2026-08-01T00:00:00.000Z";
/** A person with a career and NO person-level claim: the case that used to answer 500. */
const CLAIMLESS = "BB TEST RUNNER";

/** Point the read path at a specific registry for the duration of one call. */
async function withDb<T>(path: string | undefined, fn: () => Promise<T>): Promise<T> {
  const prev = process.env["MANDATE_DB_PATH"];
  if (path === undefined) delete process.env["MANDATE_DB_PATH"];
  else process.env["MANDATE_DB_PATH"] = path;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env["MANDATE_DB_PATH"];
    else process.env["MANDATE_DB_PATH"] = prev;
  }
}

/** A reader bound to one file: the registry is chosen by argument, not by the process's environment. */
const at =
  (path: string): typeof readRegistry =>
  (fn) =>
    readRegistry(fn, { path });

function aliasRows(personId: string, name: string): string {
  return blockingKeys(name)
    .map((k) => `('${personId}','${name}','latn','${k}','primary','src-results')`)
    .join(",");
}

/**
 * One of everything: two persons, two elections, a declared contest, an undecided 2026 seat, an
 * affidavit, a district-level census figure and provisional claims with their citations.
 * ponytail: raw SQL, not the ingest pipeline — the pipeline reads this repo's data/seed and would
 * make the contract depend on the corpus. Rebuild it from ingest the day the DDL churns.
 */
function buildFixture(): string {
  const path = join(mkdtempSync(join(tmpdir(), "mandate-fixture-")), "registry.db");
  const d = open(path);
  migrate(d, NOW);
  d.exec(`
    INSERT INTO source (id,kind,publisher,title,url,retrieved_at,doc_hash,hash_kind,retrieval_kind) VALUES
      ('src-results','eci_declaration','ECI, via Lokdhaba (TCPD)','Assembly results','repo:data/seed/historical-results.json','2026-07-01T00:00:00.000Z','h1','document_bytes','fetched'),
      ('src-affidavit','affidavit','myneta.info / ADR','Affidavit','https://myneta.info/x','2026-07-02T00:00:00.000Z','h2','url_only','asserted_by_upstream'),
      ('src-census','census','Census of India','WB constituency demographics (district-level Census 2011 proxy)','repo:data/seed/demographics.json','2026-07-03T00:00:00.000Z','h3','document_bytes','fetched');
    INSERT INTO ingest_run (pipeline,parser_version,started_at,finished_at,status)
      VALUES ('static:fixture','v1','${NOW}','${NOW}','ok');
    INSERT INTO boundary_epoch (id,name,effective_from,source_id)
      VALUES ('delim-2008','Delimitation Order, 2008','2008-02-19','src-results');
    INSERT INTO place (id,kind,canonical_name) VALUES ('wb','state','West Bengal');
    INSERT INTO place (id,kind,parent_id,canonical_name) VALUES
      ('wb.coochbehar','district','wb','Cooch Behar'),
      ('${AC}','ac','wb.coochbehar','Mekliganj');
    INSERT INTO place_version (id,place_id,jurisdiction_id,kind,epoch_id,number,canonical_name,district_place_id,reservation,electors_at_creation)
      VALUES (1,'${AC}','wb','ac','delim-2008',1,'Mekliganj','wb.coochbehar','sc',224413);
    INSERT INTO party (id,name,short_name,kind) VALUES ('tmc','All India Trinamool Congress','TMC','state');
    INSERT INTO party_version (id,party_id,valid_from,name) VALUES (1,'tmc','2011-01-01','All India Trinamool Congress');
    INSERT INTO election (id,kind,level,jurisdiction_place_id,epoch_id,name,lifecycle,house,year,occurrence) VALUES
      ('wb-assembly-2021','assembly','state','wb','delim-2008','West Bengal Assembly 2021','declared','ac',2021,1),
      ('wb-assembly-2026','assembly','state','wb','delim-2008','West Bengal Assembly 2026','declared','ac',2026,1);
    INSERT INTO contest (id,election_id,place_version_id,lifecycle) VALUES
      ('wb-assembly-2021:ac001','wb-assembly-2021',1,'declared'),
      ('wb-assembly-2026:ac001','wb-assembly-2026',1,'declared');
    INSERT INTO person (id,canonical_name,names,review_state,created_at) VALUES
      ('aa-test-winner-000001','AA TEST WINNER','{}','auto','${NOW}'),
      ('bb-test-runner-000002','${CLAIMLESS}','{}','auto','${NOW}');
    INSERT INTO person_alias (person_id,name,script,norm_key,kind,source_id) VALUES
      ${aliasRows("aa-test-winner-000001", "AA TEST WINNER")},
      ${aliasRows("bb-test-runner-000002", CLAIMLESS)};
    INSERT INTO candidacy (id,contest_id,person_id,party_version_id,status) VALUES
      ('wb-assembly-2021:ac001:aa','wb-assembly-2021:ac001','aa-test-winner-000001',1,'elected'),
      ('wb-assembly-2021:ac001:bb','wb-assembly-2021:ac001','bb-test-runner-000002',1,'defeated'),
      ('wb-assembly-2026:ac001:aa','wb-assembly-2026:ac001','aa-test-winner-000001',1,'elected');
    INSERT INTO result (contest_id,candidacy_id,revision,votes,vote_share,rank,is_winner,margin,source_id,ingested_at) VALUES
      ('wb-assembly-2021:ac001','wb-assembly-2021:ac001:aa',0,65520,50.4,1,1,25301,'src-results','${NOW}'),
      ('wb-assembly-2021:ac001','wb-assembly-2021:ac001:bb',0,40219,31.0,2,0,NULL,'src-results','${NOW}'),
      -- the 2026 import declares seats with no counts: votes 0 must never publish as "0 votes"
      ('wb-assembly-2026:ac001','wb-assembly-2026:ac001:aa',0,0,0,1,1,29584,'src-results','${NOW}');
    INSERT INTO turnout (contest_id,scope,electors,voters,source_id) VALUES
      ('wb-assembly-2021:ac001','contest',224413,182900,'src-results'),
      ('wb-assembly-2026:ac001','contest',224413,181000,'src-results');
    INSERT INTO affidavit (id,candidacy_id,filed_on,source_id)
      VALUES ('aff-2026','wb-assembly-2026:ac001:aa','2026-03-01','src-affidavit');
    INSERT INTO affidavit_field (affidavit_id,path,value_numeric,parser_version)
      VALUES ('aff-2026','assets.total',1000000000,'v1');
    INSERT INTO claim (subject_ref,predicate,object_value,unit,as_of,confidence) VALUES
      ('person:aa-test-winner-000001','pending_cases_declared','0',NULL,'2026-03-01','provisional'),
      ('place:${AC}','demographics.population','2819086','persons','2011-01-01','provisional'),
      ('place:${AC}','demographics.literacyPct','74.8','percent','2011-01-01','provisional');
    INSERT INTO citation (claim_id,source_id,page_no,parser_version,extracted_at)
      SELECT id, CASE WHEN predicate LIKE 'demographics.%' THEN 'src-census' ELSE 'src-affidavit' END,
             0, 'v1', '${NOW}'
        FROM claim;
  `);
  d.close();
  return path;
}

/**
 * Two states in one registry with both of their epochs registered: West Bengal on DPACO 2008 and Assam on its
 * 2023 order. `meta.epoch` used to be "the newest epoch with no `effective_to`" — which is every epoch, since
 * nothing writes one — so this registry told a reader of the Bengal seat that Assam's order governs it.
 */
function buildTwoStateFixture(): string {
  const path = join(mkdtempSync(join(tmpdir(), "mandate-fixture-")), "registry.db");
  const d = open(path);
  migrate(d, NOW);
  d.exec(`
    INSERT INTO source (id,kind,publisher,title,url,retrieved_at,doc_hash,hash_kind,retrieval_kind)
      VALUES ('src-results','eci_declaration','ECI','Results','repo:x','2026-07-01T00:00:00.000Z','h1','document_bytes','fetched');
    INSERT INTO ingest_run (pipeline,parser_version,started_at,finished_at,status)
      VALUES ('static:fixture','v1','${NOW}','${NOW}','ok');
    INSERT INTO place (id,kind,canonical_name) VALUES ('in','nation','India');
    INSERT INTO place (id,kind,parent_id,canonical_name) VALUES ('wb','state','in','West Bengal'), ('as','state','in','Assam');
    INSERT INTO place (id,kind,parent_id,canonical_name) VALUES
      ('wb.pc.001','pc','wb','Cooch Behar'), ('as.pc.001','pc','as','Kokrajhar');
  `);
  ensureEpochs(d, ["delim-2008", "delim-2023-as"]);
  d.exec(`
    INSERT INTO place_version (id,place_id,jurisdiction_id,kind,epoch_id,number,canonical_name) VALUES
      (1,'wb.pc.001','wb','pc','delim-2008',1,'Cooch Behar'),
      (2,'as.pc.001','as','pc','delim-2023-as',1,'Kokrajhar');
    INSERT INTO election (id,kind,level,jurisdiction_place_id,epoch_id,name,lifecycle,house,year,occurrence)
      VALUES ('ls-2024','general','union','in','delim-2008','Lok Sabha 2024','declared','pc',2024,1);
    INSERT INTO contest (id,election_id,place_version_id,lifecycle) VALUES
      ('ls-2024:wb1','ls-2024',1,'declared'), ('ls-2024:as1','ls-2024',2,'declared');
    INSERT INTO party (id,name,short_name,kind) VALUES ('p','A Party','AP','state');
    INSERT INTO party_version (id,party_id,valid_from,name) VALUES (1,'p','2011-01-01','A Party');
    INSERT INTO person (id,canonical_name,names,review_state,created_at) VALUES ('one-person-000001','ONE PERSON','{}','auto','${NOW}');
    INSERT INTO person_alias (person_id,name,script,norm_key,kind,source_id) VALUES ${aliasRows("one-person-000001", "ONE PERSON")};
    INSERT INTO candidacy (id,contest_id,person_id,party_version_id,status) VALUES
      ('ls-2024:wb1:a','ls-2024:wb1','one-person-000001',1,'elected'),
      ('ls-2024:as1:a','ls-2024:as1','one-person-000001',1,'elected');
    INSERT INTO result (contest_id,candidacy_id,revision,votes,vote_share,rank,is_winner,margin,source_id,ingested_at) VALUES
      ('ls-2024:wb1','ls-2024:wb1:a',0,100,60,1,1,50,'src-results','${NOW}'),
      ('ls-2024:as1','ls-2024:as1:a',0,100,60,1,1,50,'src-results','${NOW}');
  `);
  d.close();
  return path;
}

const FIXTURE = buildFixture();
const TWO_STATES = buildTwoStateFixture();
const NAMESAKES = buildNamesakeFixture();

/** Two people who share a phonetic key and not their letters, so a search for one finds the other only as a sound. */
function buildSoundsFixture(): string {
  const path = join(mkdtempSync(join(tmpdir(), "mandate-fixture-")), "registry.db");
  const d = open(path);
  migrate(d, NOW);
  d.exec(`
    INSERT INTO source (id,kind,publisher,title,url,retrieved_at,doc_hash,hash_kind,retrieval_kind)
      VALUES ('src-results','eci_declaration','ECI','Results','repo:x','2026-07-01T00:00:00.000Z','h1','document_bytes','fetched');
    INSERT INTO ingest_run (pipeline,parser_version,started_at,finished_at,status)
      VALUES ('static:fixture','v1','${NOW}','${NOW}','ok');
    INSERT INTO person (id,canonical_name,names,review_state,created_at) VALUES
      ('sukanta-roy-000001','Sukanta Roy','{}','auto','${NOW}'), ('sukhanta-roy-000002','Sukhanta Roy','{}','auto','${NOW}');
    INSERT INTO person_alias (person_id,name,script,norm_key,kind,source_id) VALUES
      ${aliasRows("sukanta-roy-000001", "Sukanta Roy")}, ${aliasRows("sukhanta-roy-000002", "Sukhanta Roy")};
  `);
  d.close();
  return path;
}
const SOUNDS = buildSoundsFixture();
/** True when this machine also has the real registry — then the contract is asserted twice. */
const live = await withDb(undefined, async () => {
  try {
    openRead().close();
    return (await placeReply(AC)).status !== 503;
  } catch {
    return false;
  }
});

function ok200<T>(r: Reply<T>): Envelope<T> {
  assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
  if (!("data" in r.body)) assert.fail("a 200 body must have `data`");
  return r.body;
}

/**
 * The complete meta block of §20 — every key, right type, no placeholder. `epoch` is named for a response
 * about one jurisdiction and absent for one that is not, so the caller says which it expects.
 */
function assertMeta(m: Meta, label: string, epoch: string | undefined): void {
  assert.match(m.dataVersion, /^\d{4}-\d{2}-\d{2}T/, `${label}: dataVersion is an ISO timestamp`);
  assert.match(m.freshness.oldestSource, /^\d{4}-\d{2}-\d{2}$/, `${label}: freshness.oldestSource`);
  assert.match(m.freshness.computedAt, /^\d{4}-\d{2}-\d{2}T/, `${label}: freshness.computedAt`);
  assert.equal(m.epoch, epoch, `${label}: epoch`);
  assert.equal("epoch" in m, epoch !== undefined, `${label}: an unscoped response omits the key rather than guessing`);
  assert.equal(typeof m.estimated, "boolean", `${label}: estimated`);
  assert.ok(Array.isArray(m.caveats), `${label}: caveats is an array`);
  assert.deepEqual(m.gated, [], `${label}: gated is empty this cycle`);
}

function assertEnvelope<T>(label: string, r: Reply<T>, epoch?: string): Envelope<T> {
  const e = ok200(r);
  // P2: an empty sources array is a contract violation, not an edge case.
  assert.ok(e.sources.length > 0, `${label}: sources must be non-empty`);
  for (const s of e.sources) {
    assert.ok(s.id.length > 0, `${label}: source id`);
    assert.ok(s.retrievedAt.length > 0, `${label}: source retrievedAt`);
    // The two honesty columns: a consumer must be able to tell an upstream assertion from a
    // document we hold.
    assert.ok(["fetched", "asserted_by_upstream"].includes(s.retrievalKind), `${label}: retrievalKind`);
    assert.ok(["document_bytes", "url_only"].includes(s.hashKind), `${label}: hashKind`);
  }
  assertMeta(e.meta, label, epoch);
  assert.equal(r.headers["X-Data-Version"], e.meta.dataVersion, `${label}: X-Data-Version`);
  assert.ok(r.headers["ETag"]?.includes(e.meta.dataVersion), `${label}: ETag carries the data version`);
  return e;
}

async function personSlug(name: string): Promise<string> {
  const e = ok200(await searchReply(name, 1));
  const first = e.data.results[0];
  if (first === undefined) assert.fail(`search for ${name} returned 200 with no rows`);
  return first.id;
}

/** The whole §20 contract, run against whichever registry MANDATE_DB_PATH points at. */
async function assertContract(where: string, searchTerm: string): Promise<void> {
  const person = assertEnvelope(`${where} person`, await personReply(await personSlug(searchTerm)));
  // A seat in West Bengal is on DPACO 2008; a person and a search are about no one jurisdiction.
  const place = assertEnvelope(`${where} place`, await placeReply(AC), "delim-2008");
  const search = assertEnvelope(`${where} search`, await searchReply(searchTerm, 5));
  assert.ok(search.data.count > 0, `${where}: search count`);

  // Caveats are generated from the rows the response actually cites, so the assertion is the
  // BICONDITIONAL: a response citing unfetched sources says so, and one whose sources were all genuinely
  // fetched does not claim otherwise. Asserting the caveat unconditionally was only ever right while
  // every source in the registry was a publisher assertion; the Lokdhaba import made "all fetched" a
  // reachable state, and a person whose whole record comes from a hashed file must not be told a document
  // was never retrieved.
  const unfetched = person.sources.filter((s) => s.retrievalKind !== "fetched").length;
  const line = person.meta.caveats.find((c) => c.includes("never fetched"));
  if (unfetched > 0) {
    assert.ok(line !== undefined, `${where}: a response citing ${unfetched} unfetched source(s) says so`);
    assert.ok(line.includes(`${unfetched} of ${person.sources.length}`), `${where}: real counts: ${line}`);
  } else {
    assert.equal(line, undefined, `${where}: every source was fetched, so there is nothing to caveat`);
  }
  // The provisional-claims caveat is the same biconditional, for the same reason.
  //
  // This assertion was unconditional, which was right while every person in the registry was a 2026
  // affidavit filer with five person-level claims each. It is no longer: of 448,035 persons, most come from
  // TCPD's result files and have NO person-level claims at all — MAMATA (BALA) ADHIKARY has zero, while
  // Mamata Banerjee has five. §20 requires a response BUILT from provisional claims to say so; a response
  // built from none has nothing to declare, and demanding the caveat anyway would force the envelope to
  // print "0 of 0 claims are provisional", which is noise dressed as rigour. So: provisional claims
  // present → the caveat; none → no caveat. Counted from the registry the reply was built from, so the
  // test cannot pass by reading the caveat it is checking.
  const db = openRead(process.env["MANDATE_DB_PATH"]);
  const provisionalClaims =
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM claim
          WHERE subject_ref = ? AND confidence = 'provisional'`,
      )
      .get(`person:${person.data.person.id}`) as { n: number } | undefined;
  db.close();
  const n = provisionalClaims?.n ?? 0;
  const provisional = person.meta.caveats.find((c) => /\d+ of \d+ claims .*provisional/.test(c));
  if (n > 0) {
    assert.ok(provisional !== undefined, `${where}: a response built from ${n} provisional claim(s) says so`);
  } else {
    assert.equal(provisional, undefined, `${where}: no provisional claims, so nothing to caveat`);
  }

  // §6.5: the census vintage AND the census geography travel in meta
  const years = new Set(place.data.demographics.map((d) => d.value.sourceYear));
  const vintage = place.meta.caveats.find((c) => c.startsWith("Demographic figures are"));
  if (years.size === 0) {
    assert.equal(vintage, undefined, `${where}: no demographics, no vintage caveat`);
  } else {
    assert.ok(vintage !== undefined, `${where}: demographics without a vintage is a lie by omission`);
    for (const y of years) if (y !== null) assert.ok(vintage.includes(String(y)), `vintage ${y}`);
    // The figures are DISTRICT counts applied to a constituency. Both facts are published.
    assert.match(vintage, /district/i, `${where}: the crosswalk is named: ${vintage}`);
    assert.equal(place.meta.estimated, true, `${where}: a crosswalked figure is estimated`);
  }

  // a 2026 winner with no count publishes null, never 0 — the page and the API agree
  for (const c of place.data.contests) {
    if (c.winner !== null) assert.notEqual(c.winner.votes, 0, `${where}: ${c.year} winner votes`);
    if (c.runnerUp !== null) assert.notEqual(c.runnerUp.votes, 0, `${where}: ${c.year} runner-up`);
  }

  // 404s a user can read
  for (const r of [await personReply("no-such-person"), await placeReply("no-such-place")]) {
    assert.equal(r.status, 404, `${where}: unknown slug`);
    if ("data" in r.body) assert.fail("a 404 must not carry data");
    assert.ok(r.body.detail.length > 20, "detail is shown verbatim, so it must be a sentence");
    assert.match(r.body.type, /^https?:\/\//);
    assert.match(r.body.code, /^[a-z0-9-]+$/);
  }

  // search: no 200 without sources, in either direction
  assert.equal((await searchReply("", 5)).status, 400, `${where}: empty term`);
  const none = await searchReply("zzzzqqqqxxxx", 5);
  assert.equal(none.status, 404, `${where}: no match`);
  if ("data" in none.body) assert.fail("a no-match search must not answer with an empty envelope");
}

test("a path under /v1 that no endpoint answers is a 404 problem document that names the endpoints that exist", () => {
  const r = unknownEndpointReply("/v1/entity/election/wb-assembly-2026");
  assert.equal(r.status, 404);
  assert.equal(r.body.code, "unknown-endpoint");
  assert.match(r.body.type, /^https?:\/\//);
  assert.match(r.body.detail, /\/v1\/entity\/election\/wb-assembly-2026/);
  for (const endpoint of ["/v1/search", "/v1/entity/person/", "/v1/entity/place/"]) assert.ok(r.body.detail.includes(endpoint), endpoint);
  assert.equal(r.headers["Cache-Control"], "no-store", "a miss is not something an edge should keep");
  assert.doesNotThrow(() => new Response(null, { status: r.status, headers: r.headers }));
});

test("503 names the command that fixes it", () => {
  const u = unavailable();
  assert.equal(u.status, 503);
  assert.match(u.detail, /npm run registry:migrate && npm run registry:ingest/);
  assert.match(u.type, /^https?:\/\//); // RFC 9457 type URI
  assert.equal(u.code, "registry-unavailable");
  assert.doesNotMatch(u.detail, /sorry|oops|unfortunately/i); // §10: no apology
});

test("a registry that is not there is a 503 problem document, never a throw", async () => {
  const missing = join(mkdtempSync(join(tmpdir(), "mandate-empty-")), "registry.db");
  await withDb(missing, async () => {
    for (const r of [await placeReply(AC), await personReply("x"), await searchReply("Mamata", 5)]) {
      assert.equal(r.status, 503, JSON.stringify(r.body));
      assert.deepEqual(r.body, unavailable());
    }
  });
});

test("a registry that is unmigrated, damaged or never ingested is a 503 problem document", async () => {
  const unmigrated = join(mkdtempSync(join(tmpdir(), "mandate-unmigrated-")), "registry.db");
  open(unmigrated).close();
  const damaged = join(mkdtempSync(join(tmpdir(), "mandate-damaged-")), "registry.db");
  writeFileSync(damaged, "this is not a sqlite database ".repeat(300));
  // A schema and no ingest run: there is no dataVersion to name, so nothing can be served.
  const neverRun = join(mkdtempSync(join(tmpdir(), "mandate-neverrun-")), "registry.db");
  const d = open(neverRun);
  migrate(d, NOW);
  d.close();
  for (const path of [unmigrated, damaged, neverRun]) {
    const read = at(path);
    for (const r of [await placeReply(AC, read), await personReply("x", read), await searchReply("Mamata", 5, read)]) {
      assert.equal(r.status, 503, JSON.stringify(r.body));
      assert.deepEqual(r.body, unavailable());
    }
  }
  // and the injected reader reads the fixture without touching the environment
  assert.equal((await placeReply(AC, at(FIXTURE))).status, 200);
});

test("a bug in a query is thrown, not answered as 'registry not built'", async () => {
  // metaBase's query, over a view that calls a function SQLite does not have: a defect in this process, which
  // used to be one of the failures a reader could be told was "the registry is not built".
  const path = join(mkdtempSync(join(tmpdir(), "mandate-defect-")), "registry.db");
  const d = open(path);
  d.exec(`
    CREATE VIEW ingest_run AS SELECT no_such_function() AS finished_at, NULL AS status;
  `);
  d.close();
  const read = at(path);
  await assert.rejects(placeReply(AC, read), /no such function/);
  await assert.rejects(personReply("x", read), /no such function/);
  await assert.rejects(searchReply("Mamata", 5, read), /no such function/);
});

test("§20 contract holds on a fixture registry (the CI case)", async () => {
  await withDb(FIXTURE, () => assertContract("fixture", "AA TEST WINNER"));
});

/**
 * A name two states share (Aurangabad is a Bihar seat and a Maharashtra seat), a seat number that was Badami
 * under one order and is Nanjangud under the next, and a name of several words with its reservation marker. Each
 * current seat is cited once, which is all a 200 asks of it.
 */
function buildNamesakeFixture(): string {
  const path = join(mkdtempSync(join(tmpdir(), "mandate-fixture-")), "registry.db");
  const d = open(path);
  migrate(d, NOW);
  d.exec(`
    INSERT INTO source (id,kind,publisher,title,url,retrieved_at,doc_hash,hash_kind,retrieval_kind)
      VALUES ('src-census','census','Census of India','Census 2011','repo:x','2026-07-03T00:00:00.000Z','h3','document_bytes','fetched');
    INSERT INTO ingest_run (pipeline,parser_version,started_at,finished_at,status)
      VALUES ('static:fixture','v1','${NOW}','${NOW}','ok');
    INSERT INTO place (id,kind,canonical_name) VALUES ('in','nation','India');
    INSERT INTO place (id,kind,parent_id,canonical_name) VALUES
      ('br','state','in','Bihar'), ('mh','state','in','Maharashtra'), ('ka','state','in','Karnataka');
    INSERT INTO place (id,kind,parent_id,canonical_name) VALUES
      ('br.ac.001','ac','br','Aurangabad'), ('mh.ac.001','ac','mh','Aurangabad'), ('ka.ac.214','ac','ka','NANJANGUD'),
      ('ka.ac.001','ac','ka','Kolar Gold Field(SC)');
  `);
  ensureEpochs(d, ["delim-1976", "delim-2008"]);
  d.exec(`
    INSERT INTO place_version (id,place_id,jurisdiction_id,kind,epoch_id,number,canonical_name) VALUES
      (1,'br.ac.001','br','ac','delim-2008',1,'Aurangabad'),
      (2,'mh.ac.001','mh','ac','delim-2008',1,'Aurangabad'),
      (3,'ka.ac.214','ka','ac','delim-2008',214,'NANJANGUD'),
      (4,'ka.ac.214','ka','ac','delim-1976',214,'BADAMI'),
      (5,'ka.ac.001','ka','ac','delim-2008',1,'Kolar Gold Field(SC)');
    INSERT INTO election (id,kind,level,jurisdiction_place_id,epoch_id,name,lifecycle,house,year,occurrence) VALUES
      ('br-assembly-2020','assembly','state','br','delim-2008','Bihar 2020','declared','ac',2020,1),
      ('mh-assembly-2019','assembly','state','mh','delim-2008','Maharashtra 2019','declared','ac',2019,1),
      ('ka-assembly-2018','assembly','state','ka','delim-2008','Karnataka 2018','declared','ac',2018,1);
    INSERT INTO contest (id,election_id,place_version_id,lifecycle) VALUES
      ('br-assembly-2020:1','br-assembly-2020',1,'declared'),
      ('mh-assembly-2019:1','mh-assembly-2019',2,'declared'),
      ('ka-assembly-2018:214','ka-assembly-2018',3,'declared'),
      ('ka-assembly-2018:1','ka-assembly-2018',5,'declared');
    INSERT INTO claim (subject_ref,predicate,object_value,unit,as_of,confidence) VALUES
      ('place:br.ac.001','demographics.population','100','persons','2011-01-01','provisional'),
      ('place:mh.ac.001','demographics.population','100','persons','2011-01-01','provisional'),
      ('place:ka.ac.214','demographics.population','100','persons','2011-01-01','provisional'),
      ('place:ka.ac.001','demographics.population','100','persons','2011-01-01','provisional');
    INSERT INTO citation (claim_id,source_id,page_no,parser_version,extracted_at)
      SELECT id, 'src-census', 0, 'v1', '${NOW}' FROM claim;
  `);
  d.close();
  return path;
}

test("a place is its registry id or a bare name, the same seat either way and whatever the case", async () => {
  const read = at(FIXTURE);
  const byId = ok200(await placeReply(AC, read));
  assert.equal(byId.data.place.id, AC);
  for (const name of ["Mekliganj", "mekliganj", "MEKLIGANJ"]) {
    const byName = ok200(await placeReply(name, read));
    assert.equal(byName.data.place.id, AC, name);
  }
});

test("a name two seats answer to is a 300 that names each by the id that selects it, never a pick", async () => {
  const read = at(NAMESAKES);
  const r = await placeReply("aurangabad", read);
  assert.equal(r.status, 300, JSON.stringify(r.body));
  if ("data" in r.body) return assert.fail("a tie must not carry data");
  assert.equal(r.body.code, "ambiguous-place");
  assert.match(r.body.detail, /br\.ac\.001, mh\.ac\.001/);
  assert.match(r.body.detail, /\/v1\/entity\/place\/br\.ac\.001/);
  assert.equal(r.headers["Cache-Control"], "no-store");
  // The id is not a name, so it is not ambiguous: it selects its seat.
  for (const id of ["br.ac.001", "mh.ac.001"]) assert.equal(ok200(await placeReply(id, read)).data.place.id, id);
});

test("a bare name is the registry's own spelling, case apart, and no other reading of it", async () => {
  const read = at(NAMESAKES);
  for (const name of ["Kolar Gold Field(SC)", "kolar gold field(sc)", "KOLAR GOLD FIELD(SC)"]) {
    assert.equal(ok200(await placeReply(name, read)).data.place.id, "ka.ac.001", name);
  }
  // A page reads these as the seat (without its marker, joined, hyphenated, padded) and this API never has.
  for (const name of [
    "kolar gold field",
    "kolargoldfield(sc)",
    "kolar-gold-field(sc)",
    "kolar-gold-field-sc",
    "kolar gold field (sc)",
    "kolar  gold field(sc)",
    "kolar_gold_field(sc)",
    " kolar gold field(sc)",
    "kolar gold field(sc) ",
  ]) {
    const r = await placeReply(name, read);
    assert.equal(r.status, 404, `${JSON.stringify(name)}: ${JSON.stringify(r.body).slice(0, 120)}`);
  }
});

test("a retired name is a 404 and the current name is not", async () => {
  const read = at(NAMESAKES);
  // ka.ac.214 was Badami under delim-1976 and is Nanjangud under delim-2008.
  const retired = await placeReply("badami", read);
  assert.equal(retired.status, 404);
  if ("data" in retired.body) return assert.fail("a 404 must not carry data");
  assert.equal(retired.body.code, "unknown-place");
  const current = ok200(await placeReply("nanjangud", read));
  assert.equal(current.data.place.id, "ka.ac.214");
  assert.equal(current.data.place.canonicalName, "NANJANGUD");
});

test("a name that sounds like the query is a suggestion beside the matches, never one of them", async () => {
  const read = at(SOUNDS);
  // Sukanta Roy's name contains the query; Sukhanta Roy shares its phonetic key and no more. `count` and `results` are
  // what the registry holds under that name, so a client that takes the first rows or the count is not handed noise.
  const both = ok200(await searchReply("Sukanta", 20, read));
  assert.deepEqual(both.data.results.map((r) => [r.canonicalName, r.match]), [["Sukanta Roy", "name"]]);
  assert.equal(both.data.count, 1);
  assert.deepEqual(both.data.soundsLike.map((r) => [r.canonicalName, r.match]), [["Sukhanta Roy", "sounds-like"]]);
  assert.ok(both.sources.length > 0, "a suggestion is cited like a match");
  // Where nothing is named like it the answer is 200 with no match and the suggestions, not a 404 that drops them.
  const only = ok200(await searchReply("Sukanth", 20, read));
  assert.equal(only.data.count, 0);
  assert.deepEqual(only.data.results, []);
  assert.deepEqual(only.data.soundsLike.map((r) => r.canonicalName).sort(), ["Sukanta Roy", "Sukhanta Roy"]);
  // And nothing at all is still the 404.
  assert.equal((await searchReply("Zzzzqqq", 20, read)).status, 404);
});

test("an unknown place is not sent to a search that finds people only", async () => {
  const read = at(FIXTURE);
  const place = await placeReply("Nowhere", read);
  assert.equal(place.status, 404);
  if ("data" in place.body) return assert.fail("a 404 must not carry data");
  assert.doesNotMatch(place.body.detail, /\/v1\/search/, "that search cannot find a seat");
  assert.match(place.body.detail, /place id/);
  // A person is what that search finds, so an unknown person is still pointed at it.
  const person = await personReply("no-such-person", read);
  if ("data" in person.body) return assert.fail("a 404 must not carry data");
  assert.match(person.body.detail, /\/v1\/search\?q=no-such-person/);
});

test("a problem is sent as application/problem+json and data as application/json", async () => {
  const replies: [string, Reply<unknown>][] = [
    ["400", await searchReply("", 5, at(FIXTURE))],
    ["404", await searchReply("zzzzqqqqxxxx", 5, at(FIXTURE))],
    ["404 place", await placeReply("Nowhere", at(FIXTURE))],
    ["300", await placeReply("aurangabad", at(NAMESAKES))],
    ["503", await placeReply(AC, at(join(mkdtempSync(join(tmpdir(), "mandate-empty-")), "registry.db")))],
    ["200", await searchReply("AA TEST WINNER", 5, at(FIXTURE))],
  ];
  assert.deepEqual(replies.map(([, r]) => r.status), [400, 404, 404, 300, 503, 200]);
  for (const [label, r] of replies) {
    const res = toResponse(r);
    assert.equal(res.status, r.status, label);
    assert.equal(res.headers.get("content-type"), r.status === 200 ? "application/json" : "application/problem+json", label);
    assert.deepEqual(await res.json(), JSON.parse(JSON.stringify(r.body)), `${label}: the body is the reply's`);
    for (const [k, v] of Object.entries(r.headers)) assert.equal(res.headers.get(k), v, `${label}: ${k}`);
  }
});

test("every /v1 route answers through toResponse, so none can send a problem as plain JSON", () => {
  for (const route of ["search/route.ts", "entity/place/[slug]/route.ts", "entity/person/[slug]/route.ts"]) {
    const source = readFileSync(new URL(`../../../../src/app/v1/${route}`, import.meta.url), "utf8");
    assert.match(source, /return toResponse\(r\)/, `${route} does not answer through toResponse`);
    assert.doesNotMatch(source, /NextResponse\.json/, `${route} sends its reply as plain JSON`);
  }
});

test("a search limit is 1 to 50, and 20 where it is absent, blank or not a number", () => {
  for (const [raw, want] of [
    [null, 20], ["", 20], ["  ", 20], ["abc", 20], ["NaN", 20], ["Infinity", 20],
    ["0", 1], ["-3", 1], ["1000", 50], ["2.7", 2], ["1e1", 10], ["5", 5], [" 7 ", 7],
  ] as const) {
    assert.equal(searchLimit(raw), want, JSON.stringify(raw));
  }
});

test("meta.epoch is the epoch in force for the response's jurisdiction, and absent when there is none", async () => {
  await withDb(TWO_STATES, async () => {
    // Same registry, two states, two answers. The old query named one epoch for both.
    assertEnvelope("wb seat", await placeReply("wb.pc.001"), "delim-2008");
    assertEnvelope("as seat", await placeReply("as.pc.001"), "delim-2023-as");
    // One person stood in both states, so no jurisdiction speaks for the response, and neither does a search.
    assertEnvelope("person", await personReply("one-person-000001"), undefined);
    assertEnvelope("search", await searchReply("ONE PERSON", 5), undefined);
    // …and it is a plain absence on the wire, not a null or an "unknown".
    const wire = JSON.parse(JSON.stringify((await searchReply("ONE PERSON", 5)).body)) as { meta: Record<string, unknown> };
    assert.equal(Object.hasOwn(wire.meta, "epoch"), false);
  });
});

test("§20 contract: a name with no person-level claim still carries provenance", async () => {
  // Only the 2026 affidavit filers have person:<id> claims. 3,188 of 6,167 persons in the live
  // registry have none, and resolving sources from claims alone answered 500 for every one of them.
  await withDb(FIXTURE, async () => {
    const e = assertEnvelope("fixture claimless", await searchReply(CLAIMLESS, 20));
    assert.ok(e.data.results.some((r) => r.canonicalName === CLAIMLESS));
    for (const r of e.data.results) assert.ok(r.sourceId !== null, `${r.id} cites a source`);
  });
});

test("§20 contract holds on the live registry", { skip: !live }, async () => {
  await withDb(undefined, () => assertContract("live", "Mamata"));
});

test("live: a historical-results-only name answers 200 with sources", { skip: !live }, async () => {
  await withDb(undefined, async () => {
    // JYOTISH ROY has three candidacies, three results and zero person-level claims.
    const e = assertEnvelope("live claimless", await searchReply("JYOTISH ROY", 20));
    assert.ok(e.data.count > 0);
  });
});

/**
 * Every header a route hands to NextResponse.json must be a ByteString: undici CONVERTS the value,
 * it does not escape it, so one Bengali character in the ETag threw inside NextResponse.json and
 * /v1/search?q=মমতা answered 500 with an empty body — the transliteration search, 500 for exactly
 * the queries it exists for. Asserted on every status, because the crash is in the shared header
 * builder, not in the 200 path.
 */
test("a reply's headers survive being put on a real Response", async () => {
  await withDb(FIXTURE, async () => {
    const replies = [
      await searchReply("মমতা", 5), // 404 here: the fixture has Latin names only
      await searchReply("AA TEST WINNER", 5),
      await searchReply("", 5),
      await personReply("রাজীব"),
      await placeReply("মেখলিগঞ্জ"),
    ];
    for (const r of replies) {
      assert.doesNotThrow(
        () => new Response(null, { status: r.status, headers: r.headers }),
        `status ${r.status}: ${JSON.stringify(r.headers)}`,
      );
      for (const [k, v] of Object.entries(r.headers)) {
        assert.match(v, /^[\x20-\x7e]*$/, `${k} must be ASCII, got ${JSON.stringify(v)}`);
      }
    }
  });
});

test("live: a Bengali query answers 200, not 500", { skip: !live }, async () => {
  await withDb(undefined, async () => {
    const r = await searchReply("মমতা", 5);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.doesNotThrow(() => new Response(null, { headers: r.headers }));
  });
});

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
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { blockingKeys } from "../core/index.ts";
import { migrate, open, openRead } from "../db/index.ts";
import type { Envelope, Meta, Reply } from "./envelope.ts";
import { personReply, placeReply, searchReply, unavailable } from "./envelope.ts";

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

function aliasRows(personId: string, name: string): string {
  return blockingKeys(name)
    .map((k) => `('${personId}','${name}','latn','${k}','primary','src-results')`)
    .join(",");
}

/**
 * One of everything: two persons, two elections, a declared contest, an undecided 2026 seat, an
 * affidavit, a district-level census figure and provisional claims with their citations.
 * ponytail: raw SQL, not the ingest pipeline — the pipeline reads this repo's src/data and would
 * make the contract depend on the corpus. Rebuild it from ingest the day the DDL churns.
 */
function buildFixture(): string {
  const path = join(mkdtempSync(join(tmpdir(), "mandate-fixture-")), "registry.db");
  const d = open(path);
  migrate(d, NOW);
  d.exec(`
    INSERT INTO source (id,kind,publisher,title,url,retrieved_at,doc_hash,hash_kind,retrieval_kind) VALUES
      ('src-results','eci_declaration','ECI, via Lokdhaba (TCPD)','Assembly results','repo:src/data/historical-results.ts','2026-07-01T00:00:00.000Z','h1','document_bytes','fetched'),
      ('src-affidavit','affidavit','myneta.info / ADR','Affidavit','https://myneta.info/x','2026-07-02T00:00:00.000Z','h2','url_only','asserted_by_upstream'),
      ('src-census','census','Census of India','WB constituency demographics (district-level Census 2011 proxy)','repo:src/data/demographics.ts','2026-07-03T00:00:00.000Z','h3','document_bytes','fetched');
    INSERT INTO ingest_run (pipeline,parser_version,started_at,finished_at,status)
      VALUES ('static:fixture','v1','${NOW}','${NOW}','ok');
    INSERT INTO boundary_epoch (id,name,effective_from,source_id)
      VALUES ('delim-2008','Delimitation Order, 2008','2008-02-19','src-results');
    INSERT INTO place (id,kind,canonical_name) VALUES ('wb','state','West Bengal');
    INSERT INTO place (id,kind,parent_id,canonical_name) VALUES
      ('wb.coochbehar','district','wb','Cooch Behar'),
      ('${AC}','ac','wb.coochbehar','Mekliganj');
    INSERT INTO place_version (id,place_id,epoch_id,number,reservation,electors_at_creation)
      VALUES (1,'${AC}','delim-2008',1,'sc',224413);
    INSERT INTO party (id,name,short_name,kind) VALUES ('tmc','All India Trinamool Congress','TMC','state');
    INSERT INTO party_version (id,party_id,valid_from,name) VALUES (1,'tmc','2011-01-01','All India Trinamool Congress');
    INSERT INTO election (id,kind,level,jurisdiction_place_id,epoch_id,name,lifecycle) VALUES
      ('wb-assembly-2021','assembly','state','wb','delim-2008','West Bengal Assembly 2021','declared'),
      ('wb-assembly-2026','assembly','state','wb','delim-2008','West Bengal Assembly 2026','declared');
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

const FIXTURE = buildFixture();
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

/** The complete meta block of §20 — every key, right type, no placeholder. */
function assertMeta(m: Meta, label: string): void {
  assert.match(m.dataVersion, /^\d{4}-\d{2}-\d{2}T/, `${label}: dataVersion is an ISO timestamp`);
  assert.match(m.freshness.oldestSource, /^\d{4}-\d{2}-\d{2}$/, `${label}: freshness.oldestSource`);
  assert.match(m.freshness.computedAt, /^\d{4}-\d{2}-\d{2}T/, `${label}: freshness.computedAt`);
  assert.ok(m.epoch.length > 0 && m.epoch !== "unknown", `${label}: epoch is named`);
  assert.equal(typeof m.estimated, "boolean", `${label}: estimated`);
  assert.ok(Array.isArray(m.caveats), `${label}: caveats is an array`);
  assert.deepEqual(m.gated, [], `${label}: gated is empty this cycle`);
}

function assertEnvelope<T>(label: string, r: Reply<T>): Envelope<T> {
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
  assertMeta(e.meta, label);
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
  const place = assertEnvelope(`${where} place`, await placeReply(AC));
  const search = assertEnvelope(`${where} search`, await searchReply(searchTerm, 5));
  assert.ok(search.data.count > 0, `${where}: search count`);

  // caveats are generated from the rows the response actually cites
  const unfetched = person.sources.filter((s) => s.retrievalKind !== "fetched").length;
  const line = person.meta.caveats.find((c) => c.includes("never fetched"));
  assert.ok(line !== undefined, `${where}: a response citing unfetched sources says so`);
  assert.ok(line.includes(`${unfetched} of ${person.sources.length}`), `${where}: real counts: ${line}`);
  assert.ok(
    person.meta.caveats.some((c) => /\d+ of \d+ claims .*provisional/.test(c)),
    `${where}: a response built from provisional claims says so`,
  );

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

test("§20 contract holds on a fixture registry (the CI case)", async () => {
  await withDb(FIXTURE, () => assertContract("fixture", "AA TEST WINNER"));
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

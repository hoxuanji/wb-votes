// The person page, rendered: what it says of a contest whose seat was declared for someone else, of a turnout nothing corroborates,
// and of a row that holds a seat claim and no contest; and that its career table links where it says it does.
//
// The registry is built here from literal data and the page rendered in a child process (seat-tiles-page.test.ts does the same):
//
//   2021  Testpur, a verified election (vote counts published, turnout 1000 of 2000): VETERAN lost to CHAMP TWENTYONE
//   2026  Testpur, withheld (winner and margin declared, no votes, turnout 1930 of 2000): VETERAN and ROOKIE stood, CHAMP TWENTYSIX won
//   ORPHAN   a row with no contest and an mla_term claim for Testpur
//   BLANK    a row with no contest and nothing else worth a figure

import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";

const ROOT = new URL("../../../../", import.meta.url).pathname;

function fixture(db: DatabaseSync): DatabaseSync {
  migrate(db, "2026-08-12T00:00:00.000Z");
  db.exec(`
    INSERT INTO ingest_run (pipeline,parser_version,started_at,finished_at,status) VALUES ('static:fixture','v1','2026-08-12','2026-08-12','ok');
    INSERT INTO source (id,kind,publisher,title,retrieved_at,doc_hash) VALUES ('s1','eci_declaration','P','Results','2026-08-12','sha256:0');
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
      ('veteran','VETERAN','auto','2026-08-12'), ('rookie','ROOKIE','auto','2026-08-12'),
      ('champ21','CHAMP TWENTYONE','auto','2026-08-12'), ('champ26','CHAMP TWENTYSIX','auto','2026-08-12'),
      ('orphan','Orphan Member','auto','2026-08-12'), ('blank','Blank Row','auto','2026-08-12');
    INSERT INTO person_alias (person_id,name,script,norm_key,kind,source_id) VALUES
      ('veteran','VETERAN','latn','vtrn','affidavit','s1'), ('rookie','ROOKIE','latn','rk','affidavit','s1'),
      ('champ21','CHAMP TWENTYONE','latn','chmptwntn','affidavit','s1'), ('champ26','CHAMP TWENTYSIX','latn','chmptwntsx','affidavit','s1');
    INSERT INTO candidacy (id,contest_id,person_id,party_version_id,status) VALUES
      ('v21','c21','veteran',2,'defeated'), ('w21','c21','champ21',1,'elected'),
      ('v26','c26','veteran',2,'contesting'), ('r26','c26','rookie',2,'contesting'), ('w26','c26','champ26',1,'elected');
    INSERT INTO result (contest_id,candidacy_id,revision,votes,"rank",is_winner,margin,source_id,ingested_at) VALUES
      ('c21','v21',0,400,2,0,NULL,'s1','2026-08-12'), ('c21','w21',0,600,1,1,200,'s1','2026-08-12'),
      ('c26','w26',0,0,1,1,500,'s1','2026-08-12');
    INSERT INTO turnout (contest_id,scope,electors,voters,source_id) VALUES
      ('c21','contest',2000,1000,'s1'), ('c26','contest',2000,1930,'s1');
    INSERT INTO claim (id,subject_ref,predicate,object_value,unit,as_of,confidence) VALUES
      (1,'person:orphan','mla_term','{"term":"2026-2031","constituencyId":"c0001","party":"BBB","placeId":"wb.ac.001","partyId":"BBB"}',NULL,'2026-01-01','provisional'),
      (2,'person:orphan','mla_margin_votes','500','votes','2026-01-01','provisional'),
      (3,'person:blank','photo_url_declared','"https://example.org/x.jpg"',NULL,'2026-01-01','provisional');
    INSERT INTO citation (claim_id,source_id,parser_version,extracted_at) VALUES
      (1,'s1','v1','2026-08-12'), (2,'s1','v1','2026-08-12'), (3,'s1','v1','2026-08-12');
  `);
  return db;
}

const PATH = join(mkdtempSync(join(tmpdir(), "mandate-person-page-")), "registry.db");
fixture(open(PATH)).close();

function render(person: string, route = "/p", query = ""): string {
  try {
    return execFileSync(
      process.execPath,
      ["--import", "./ops/probe/render/register.mjs", "./ops/probe/render/render.mjs", route, query, person],
      { cwd: ROOT, env: { ...process.env, MANDATE_DB_PATH: PATH }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    throw new Error(`render ${route} ${person} failed:\n${err.stderr ?? err.message}`);
  }
}

const text = (html: string): string => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const unescape = (s: string): string => s.replace(/&amp;/g, "&");
const hrefs = (html: string): string[] => [...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => unescape(m[1] as string));
const table = (html: string, caption: string): string => {
  const at = html.indexOf(caption);
  assert.ok(at >= 0, `no table captioned ${caption}`);
  return html.slice(html.lastIndexOf("<table", at), html.indexOf("</table>", at));
};

const flat = (html: string): string => text(html).replace(/\s+/g, " ");

test("the person page prints no turnout, so a figure nothing corroborates cannot be on it, and no older election's stands in", () => {
  for (const who of ["veteran", "champ21", "rookie"]) {
    const t = text(render(who));
    assert.doesNotMatch(t, /Turnout where they stood|96\.5|\b50(\.0)?%/, `${who}'s page prints a turnout`);
  }
});

test("a counted result is a figure on the record, and a person's win says so by its margin", () => {
  const t = flat(render("champ21"));
  assert.match(t, /Won Testpur \(Assembly\) for AAA in 2021 by 200 votes\./);
  assert.match(t, /Won.*600.*200/);
});

test("a candidate in a seat declared for someone else is not described as awaiting a result", () => {
  const html = render("rookie");
  const t = flat(html);
  assert.match(t, /Stood for BBB at Testpur in 2026\. The seat was won by Champ Twentysix AAA by a declared 500 votes\./);
  assert.doesNotMatch(t, /Standing at|Awaiting a result|no result declared|no declared result|\blost\b/i);
  assert.match(t, /Not the declared winner seat won by Champ Twentysix/);
  assert.ok(hrefs(html).includes("/p/champ26"), "the winner's name is a link to their page");
});

test("a career with an earlier loss and a seat since declared for another says what is on record and characterises nothing", () => {
  const t = flat(render("veteran"));
  assert.match(t, /Stood in 2 contests on record, 2021 to 2026; none is a declared win\./);
  assert.match(t, /Lost rank 2/, "the counted 2021 loss is stated by its rank");
  assert.match(t, /Not the declared winner seat won by Champ Twentysix/);
});

test("the record table links each seat to its page and each year to its election", () => {
  const html = render("veteran");
  const record = table(html, "contests on record.");
  assert.deepEqual(
    hrefs(record).filter((h) => h.startsWith("/constituency") || h.startsWith("/election")),
    ["/election/wb-assembly-2026", "/constituency/wb/assembly/testpur", "/election/wb-assembly-2021", "/constituency/wb/assembly/testpur"],
  );
  assert.match(text(record), /The seat links to its page\./);
});

test("a row with no contest but a seat claim says which seat, links it, and draws no run, no table and no empty frame", () => {
  const html = render("orphan");
  const t = flat(html);
  assert.match(t, /Named as a member of the 2026-2031 assembly in a press report; no contest is on record for Orphan Member\./);
  assert.doesNotMatch(t, /nothing to judge/);
  assert.match(t, /BBB.*Testpur.*press claim/);
  assert.ok(hrefs(html).includes("/constituency/wb/assembly/testpur"), "the crumb reaches the seat");
  assert.doesNotMatch(t, /The run|The record in full|Declared in/);
  assert.doesNotMatch(html, /iei-metrics/);
});

test("a row with nothing to show says so instead of drawing an empty frame", () => {
  const html = render("blank");
  assert.match(flat(html), /No contest is on record for Blank Row\./);
  assert.doesNotMatch(flat(html), /The run|The record in full|Declared in|Against whom/);
});

test("search says who has the seat of a nomination in a declared contest, and not that it is still contesting", () => {
  const t = text(render("", "/search", "q=veteran"));
  assert.match(t, /VETERAN Testpur 2026 · BBB · seat won by CHAMP TWENTYSIX · 2 contests/);
  assert.doesNotMatch(t, /contesting/);
  assert.match(text(render("", "/search", "q=champ")), /CHAMP TWENTYSIX Testpur 2026 · AAA · won · 1 contest/);
});

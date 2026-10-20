// A seat's link, wherever the app builds it, and the page that asks which seat was meant.
//
// Two current seats of one state and body can share a name (West Bengal's two assembly seats called Bishnupur). Such a
// seat is addressed by its registry id, because its name leads to a page that asks. These tests hold the person page
// to that, and hold the page that asks to telling its entries apart, on a registry built here: a tie exists only in a
// registry that carries migration 017, which the seed registry does not until it is migrated, and a test should not
// wait on that or on the seed having a person at such a seat.
//
// The pages are rendered in a child process, as render.test.ts does, because a component is .tsx and node cannot read
// one; the registry is a file because the child reads the one MANDATE_DB_PATH names.

import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { blockingKeys } from "../core/index.ts";
import { open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { getPersonBrief } from "./person.ts";
import type { SeatPlace } from "./place-resolve.ts";
import { tellApart } from "./place-resolve.ts";
import { readRegistry } from "./session.ts";

const NOW = "2026-08-01T00:00:00.000Z";
const ROOT = new URL("../../../../", import.meta.url).pathname;

const TIED = "tied-tester-000001";
const LONE = "lone-tester-000002";
const TWIN = "twin-tester-000003";

function aliasRows(id: string, name: string): string {
  return blockingKeys(name)
    .map((k) => `('${id}','${name}','latn','${k}','primary','src')`)
    .join(",");
}

/**
 * A West Bengal with: two assembly seats called Bishnupur in different districts, and a Lok Sabha seat of that name; two
 * called Twin in ONE district; one Lone; and two whose names differ but read alike once their words are joined. One
 * person contested each of Bishnupur (Bankura), Lone and Twin (no. 7). Every seat is current: each house has a full-house
 * election, which is what `voting_epoch` reads.
 */
function registry(): string {
  const path = join(mkdtempSync(join(tmpdir(), "mandate-seat-links-")), "registry.db");
  const d = open(path);
  migrate(d, NOW);
  d.exec(`
    INSERT INTO source (id,kind,publisher,title,url,retrieved_at,doc_hash,hash_kind,retrieval_kind) VALUES
      ('src','eci_declaration','ECI','Results','repo:data/seed/historical-results.json','2026-07-01T00:00:00.000Z','h1','document_bytes','fetched');
    INSERT INTO ingest_run (pipeline,parser_version,started_at,finished_at,status) VALUES ('static:fixture','v1','${NOW}','${NOW}','ok');
    INSERT INTO boundary_epoch (id,name,effective_from,source_id) VALUES ('delim-2008','Delimitation Order, 2008','2008-02-19','src');
    INSERT INTO place (id,kind,canonical_name) VALUES ('in','nation','India');
    INSERT INTO place (id,kind,parent_id,canonical_name) VALUES ('wb','state','in','West Bengal');
    INSERT INTO place (id,kind,parent_id,canonical_name) VALUES
      ('wb.bankura','district','wb','Bankura'),
      ('wb.south-24-parganas','district','wb','South 24 Parganas');
  `);
  const seats: [v: number, place: string, kind: "ac" | "pc", name: string, number: number, district: string | null][] = [
    [1, "wb.ac.266", "ac", "Bishnupur", 266, "wb.bankura"],
    [2, "wb.ac.154", "ac", "Bishnupur", 154, "wb.south-24-parganas"],
    [3, "wb.pc.37", "pc", "Bishnupur", 37, null],
    [4, "wb.ac.007", "ac", "Twin", 7, "wb.bankura"],
    [5, "wb.ac.008", "ac", "Twin", 8, "wb.bankura"],
    [6, "wb.ac.020", "ac", "Lone", 20, "wb.south-24-parganas"],
    [7, "wb.ac.030", "ac", "Cooch Behar Uttar", 30, "wb.bankura"],
    [8, "wb.ac.031", "ac", "Coochbehar Uttar", 31, "wb.south-24-parganas"],
  ];
  const place = d.prepare("INSERT INTO place (id,kind,parent_id,canonical_name) VALUES (?,?,?,?)");
  const version = d.prepare(
    `INSERT INTO place_version (id,place_id,jurisdiction_id,district_place_id,kind,epoch_id,number,canonical_name,reservation)
     VALUES (?,?,'wb',?,?,'delim-2008',?,?,'general')`,
  );
  for (const [v, p, kind, name, number, district] of seats) {
    place.run(p, kind, district ?? "wb", name);
    version.run(v, p, district, kind, number, name);
  }
  d.exec(`
    INSERT INTO party (id,name,short_name,kind) VALUES ('tmc','All India Trinamool Congress','TMC','state');
    INSERT INTO party_version (id,party_id,valid_from,name) VALUES (1,'tmc','2011-01-01','All India Trinamool Congress');
    INSERT INTO election (id,kind,level,jurisdiction_place_id,epoch_id,name,lifecycle,house,year,occurrence) VALUES
      ('wb-assembly-2021','assembly','state','wb','delim-2008','West Bengal Assembly 2021','declared','ac',2021,1),
      ('ls-2024','general','union','in','delim-2008','Lok Sabha 2024','declared','pc',2024,1);
    INSERT INTO contest (id,election_id,place_version_id,lifecycle) VALUES
      ('wb-assembly-2021:1','wb-assembly-2021',1,'declared'),
      ('wb-assembly-2021:2','wb-assembly-2021',2,'declared'),
      ('ls-2024:3','ls-2024',3,'declared'),
      ('wb-assembly-2021:4','wb-assembly-2021',4,'declared'),
      ('wb-assembly-2021:5','wb-assembly-2021',5,'declared'),
      ('wb-assembly-2021:6','wb-assembly-2021',6,'declared'),
      ('wb-assembly-2021:7','wb-assembly-2021',7,'declared'),
      ('wb-assembly-2021:8','wb-assembly-2021',8,'declared');
    INSERT INTO person (id,canonical_name,names,review_state,created_at) VALUES
      ('${TIED}','TIED TESTER','{}','auto','${NOW}'),
      ('${LONE}','LONE TESTER','{}','auto','${NOW}'),
      ('${TWIN}','TWIN TESTER','{}','auto','${NOW}');
    INSERT INTO person_alias (person_id,name,script,norm_key,kind,source_id) VALUES
      ${aliasRows(TIED, "TIED TESTER")}, ${aliasRows(LONE, "LONE TESTER")}, ${aliasRows(TWIN, "TWIN TESTER")};
    INSERT INTO candidacy (id,contest_id,person_id,party_version_id,status) VALUES
      ('wb-assembly-2021:1:p','wb-assembly-2021:1','${TIED}',1,'elected'),
      ('wb-assembly-2021:6:p','wb-assembly-2021:6','${LONE}',1,'elected'),
      ('wb-assembly-2021:4:p','wb-assembly-2021:4','${TWIN}',1,'elected');
    INSERT INTO result (contest_id,candidacy_id,revision,votes,vote_share,rank,is_winner,margin,source_id,ingested_at) VALUES
      ('wb-assembly-2021:1','wb-assembly-2021:1:p',0,65520,50.4,1,1,25301,'src','${NOW}'),
      ('wb-assembly-2021:6','wb-assembly-2021:6:p',0,65520,50.4,1,1,25301,'src','${NOW}'),
      ('wb-assembly-2021:4','wb-assembly-2021:4:p',0,65520,50.4,1,1,25301,'src','${NOW}');
  `);
  d.close();
  return path;
}

const PATH = registry();

/** Render a route of the app against the registry above and return its HTML. */
function render(route: string, segments: string): string {
  try {
    return execFileSync(
      process.execPath,
      ["--import", "./ops/probe/render/register.mjs", "./ops/probe/render/render.mjs", route, "", segments],
      {
        cwd: ROOT,
        env: { ...process.env, MANDATE_DB_PATH: PATH },
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    throw new Error(`render ${route} ${segments} failed:\n${err.stderr ?? err.message}`);
  }
}

/** Every link to a seat on a page. */
const seatLinks = (html: string): string[] => [...html.matchAll(/href="(\/constituency\/[^"]*)"/g)].map((m) => m[1] as string);

/** The entries of the page that asks which seat was meant: where each goes, and exactly what it says. */
function entries(html: string): { href: string; markup: string; text: string }[] {
  const list = html.split('class="iei-district-list"')[1]?.split("</ul>")[0] ?? "";
  return [...list.matchAll(/<li><a href="([^"]*)">(.*?)<\/a><\/li>/g)].map((m) => ({
    href: m[1] as string,
    markup: m[2] as string,
    text: (m[2] as string).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  }));
}

// ── the person page ──────────────────────────────────────────────────────────────────────────────

test("a person's seat is linked by its registry id when another current seat of its body shares the name", () => {
  const brief = readRegistry((db) => getPersonBrief(db, TIED), { path: PATH });
  assert.ok(brief.ok && brief.value !== null);
  assert.equal(brief.value.candidacies[0]?.placeHref, "/constituency/wb/assembly/wb.ac.266");
  // a seat nobody shares a name with keeps the address of its name, and so does a seat that is not tied for want of a twin
  const lone = readRegistry((db) => getPersonBrief(db, LONE), { path: PATH });
  assert.ok(lone.ok && lone.value !== null);
  assert.equal(lone.value.candidacies[0]?.placeHref, "/constituency/wb/assembly/lone");
});

test("a registry without migration 017 links a tied seat by its registry id too, and still serves the person", () => {
  // the voting_epoch view is migration 017's; without it the newest version of each place is current, so the tie stands.
  const old = registry();
  const d = open(old);
  d.exec("DROP VIEW voting_epoch");
  d.close();
  const brief = readRegistry((db) => getPersonBrief(db, TIED), { path: old });
  assert.ok(brief.ok && brief.value !== null);
  assert.equal(brief.value.candidacies[0]?.placeHref, "/constituency/wb/assembly/wb.ac.266");
});

test("the person page links a tied seat to that seat, and not to the page that asks which was meant", () => {
  const page = render("/p", TIED);
  assert.deepEqual(seatLinks(page), ["/constituency/wb/assembly/wb.ac.266"]);
  // and that address opens the seat: Bankura's Bishnupur, no. 266
  const seat = render("/constituency", "wb/assembly/wb.ac.266");
  assert.doesNotMatch(seat, /Which did you mean/);
  assert.match(seat, /No\. 266/);
  // the control: a seat that is not tied is linked by its name, as before
  assert.deepEqual(seatLinks(render("/p", LONE)), ["/constituency/wb/assembly/lone"]);
});

test("the person page links a seat whose name is shared within its district by its id too", () => {
  assert.deepEqual(seatLinks(render("/p", TWIN)), ["/constituency/wb/assembly/wb.ac.007"]);
});

// ── the page that asks which seat was meant ──────────────────────────────────────────────────────

test("the entries of a tie of one body are told apart by their district, and each opens its own seat", () => {
  const found = entries(render("/constituency", "wb/assembly/bishnupur"));
  assert.equal(found.length, 2);
  assert.notEqual(found[0]?.text, found[1]?.text, "the two entries read alike");
  assert.notEqual(found[0]?.href, found[1]?.href);
  // by seat number, the way the list is ordered: no. 154 is South 24 Parganas and no. 266 is Bankura
  assert.deepEqual(
    found.map((e) => [e.href, e.text]),
    [
      ["/constituency/wb/assembly/wb.ac.154", "Bishnupur Assembly · South 24 Parganas"],
      ["/constituency/wb/assembly/wb.ac.266", "Bishnupur Assembly · Bankura"],
    ],
  );
});

test("a tie in one district adds the seat number, because the district does not tell the entries apart", () => {
  assert.deepEqual(
    entries(render("/constituency", "wb/assembly/twin")).map((e) => e.text),
    ["Twin Assembly · Bankura · no. 7", "Twin Assembly · Bankura · no. 8"],
  );
});

test("entries that names or bodies already tell apart are exactly what they were", () => {
  // the names differ, so the page is the page it was: a name, the body, nothing else
  assert.deepEqual(
    entries(render("/constituency", "wb/assembly/coochbeharuttar")).map((e) => [e.href, e.markup]),
    [
      ["/constituency/wb/assembly/cooch-behar-uttar", "Cooch Behar Uttar<b>Assembly</b>"],
      ["/constituency/wb/assembly/coochbehar-uttar", "Coochbehar Uttar<b>Assembly</b>"],
    ],
  );
  // a name in both bodies: the two Bishnupurs of one body are told apart and the Lok Sabha seat, told apart by its body, is not
  assert.deepEqual(
    entries(render("/constituency/legacy", "wb/bishnupur")).map((e) => e.markup),
    ["Bishnupur<b>Assembly · South 24 Parganas</b>", "Bishnupur<b>Assembly · Bankura</b>", "Bishnupur<b>Lok Sabha</b>"],
  );
});

// ── what tells the entries apart, on seats given as literals ─────────────────────────────────────

function seat(versionId: number, over: Partial<SeatPlace> = {}): SeatPlace {
  return {
    versionId,
    placeId: `wb.ac.${versionId}`,
    stateId: "wb",
    kind: "ac",
    name: "Bishnupur",
    number: versionId,
    reservation: null,
    epochId: "delim-2008",
    districtId: null,
    current: true,
    level: "seat",
    href: `/constituency/wb/assembly/wb.ac.${versionId}`,
    districtName: null,
    ...over,
  };
}

const NONE = { district: null, number: null };

test("tellApart: entries that read alike say their district, and nothing else while that tells them apart", () => {
  assert.deepEqual(tellApart([seat(154, { districtName: "South 24 Parganas" }), seat(266, { districtName: "Bankura" })]), [
    { district: "South 24 Parganas", number: null },
    { district: "Bankura", number: null },
  ]);
});

test("tellApart: a seat number is said by the entries that still share a district, and only by them", () => {
  assert.deepEqual(
    tellApart([seat(7, { districtName: "Bankura" }), seat(8, { districtName: "Bankura" }), seat(266, { districtName: "Purulia" })]),
    [
      { district: "Bankura", number: 7 },
      { district: "Bankura", number: 8 },
      { district: "Purulia", number: null },
    ],
  );
  // Lok Sabha seats have no district, so a tie between two of them is told by number alone
  const pc = { kind: "pc" as const, districtName: null };
  assert.deepEqual(tellApart([seat(36, pc), seat(37, pc)]), [
    { district: null, number: 36 },
    { district: null, number: 37 },
  ]);
});

test("tellApart: entries that a name or a body already tell apart are told nothing", () => {
  // one name in two bodies
  assert.deepEqual(tellApart([seat(154, { districtName: "Bankura" }), seat(37, { kind: "pc" })]), [NONE, NONE]);
  // names that differ in their words, as the loose readings of a name give
  assert.deepEqual(
    tellApart([
      seat(30, { name: "Cooch Behar Uttar", districtName: "Cooch Behar" }),
      seat(31, { name: "Coochbehar Uttar", districtName: "Cooch Behar" }),
    ]),
    [NONE, NONE],
  );
  // a pair that reads alike beside an entry that does not: only the pair is told apart
  assert.deepEqual(
    tellApart([seat(154, { districtName: "South 24 Parganas" }), seat(266, { districtName: "Bankura" }), seat(37, { kind: "pc" })]),
    [{ district: "South 24 Parganas", number: null }, { district: "Bankura", number: null }, NONE],
  );
  assert.deepEqual(tellApart([]), []);
});

test("tellApart: names are compared as words, so a difference of case does not hide a likeness", () => {
  assert.deepEqual(
    tellApart([seat(154, { name: "BISHNUPUR", districtName: "South 24 Parganas" }), seat(266, { districtName: "Bankura" })]).map(
      (a) => a.district,
    ),
    ["South 24 Parganas", "Bankura"],
  );
});

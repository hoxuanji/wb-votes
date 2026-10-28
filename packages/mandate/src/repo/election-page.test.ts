// The election page: what its header, legends, tabs, footer and title say, on a registry built here from literal data and pages
// rendered in a child process (house-arc-page.test.ts does the same).
//
//   ee-assembly-2011   the first election of Ee State's assembly: 11 parties each win a seat, two seats have no declared winner
//   ee-assembly-2016   its second, with votes: one seat held, one with no winner at 2011, one redrawn since
//   ee-assembly-2021   its third, which published winners and declared margins only (no votes, no runner-up)
//   ff-assembly-2021   Ff State's only election
//   gg-assembly-2011   Gg State's first, and gg-assembly-2016 its second, whose one seat sits under a later boundary
//   ls-1999            the Lok Sabha with all 543 seats
//   ls-2024            the Lok Sabha as this registry holds it: 3 seats, all in Ee State
//   ls-2029            the same with 4 seats, in two states
//
// Where the pixels land is measured against saved renders (ops/probe/shot/measure.sh), not here.

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

const PARTIES = ["P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08", "P09", "P10", "P11", "AAA", "BBB"] as const;
type Party = (typeof PARTIES)[number];

function fixture(db: DatabaseSync): DatabaseSync {
  migrate(db, "2026-08-12T00:00:00.000Z");
  db.exec(`
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e1','Delimitation','2008-02-19');
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e2','Later delimitation','2015-02-19');
    INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('ee','state','Ee State','in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('ff','state','Ff State','in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('gg','state','Gg State','in');
    INSERT INTO source (id, kind, publisher, title, retrieved_at, doc_hash) VALUES ('s1','static_module','P','Results','2026-08-12','sha256:0');
  `);
  PARTIES.forEach((p, i) => {
    db.prepare(`INSERT INTO party (id, name, short_name) VALUES (?, ?, ?)`).run(p, `${p} Party`, p);
    db.prepare(`INSERT INTO party_version (id, party_id, valid_from, name) VALUES (?, ?, '1990-01-01', ?)`).run(i + 1, p, `${p} Party`);
  });
  const pv = (p: Party): number => PARTIES.indexOf(p) + 1;

  const place = db.prepare(`INSERT INTO place (id, kind, canonical_name, parent_id) VALUES (?, ?, ?, ?)`);
  const version = db.prepare(
    `INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'general')`,
  );
  db.exec("BEGIN");
  // Ee State's assembly seats: versions 1 to 14 under e1, and a second version of seat 13 under e2, which is the same
  // place redrawn and so is not the seat the 2011 election had.
  for (let n = 1; n <= 14; n++) {
    place.run(`ee.ac.${String(n).padStart(3, "0")}`, "ac", `Seat ${n}`, "ee");
    version.run(n, `ee.ac.${String(n).padStart(3, "0")}`, "ee", "ac", "e1", n, `Seat ${n}`);
  }
  version.run(15, "ee.ac.013", "ee", "ac", "e2", 13, "Seat 13");
  place.run("ff.ac.001", "ac", "Ff Seat", "ff");
  version.run(16, "ff.ac.001", "ff", "ac", "e1", 1, "Ff Seat");
  place.run("gg.ac.001", "ac", "Gg Seat", "gg");
  version.run(17, "gg.ac.001", "gg", "ac", "e1", 1, "Gg Seat");
  version.run(18, "gg.ac.001", "gg", "ac", "e2", 1, "Gg Seat");
  for (let n = 1; n <= 543; n++) {
    place.run(`ee.pc.${String(n).padStart(3, "0")}`, "pc", `Pc ${n}`, "ee");
    version.run(1000 + n, `ee.pc.${String(n).padStart(3, "0")}`, "ee", "pc", "e1", n, `Pc ${n}`);
  }
  place.run("ff.pc.001", "pc", "Ff Pc", "ff");
  version.run(2000, "ff.pc.001", "ff", "pc", "e1", 1, "Ff Pc");

  const election = db.prepare(
    `INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
     VALUES (?, ?, ?, ?, 'e1', ?, 'declared', ?, ?, 1)`,
  );
  for (const [id, year] of [["ee-assembly-2011", 2011], ["ee-assembly-2016", 2016], ["ee-assembly-2021", 2021]] as const) {
    election.run(id, "assembly", "state", "ee", id, "ac", year);
  }
  election.run("ff-assembly-2021", "assembly", "state", "ff", "ff-assembly-2021", "ac", 2021);
  election.run("gg-assembly-2011", "assembly", "state", "gg", "gg-assembly-2011", "ac", 2011);
  election.run("gg-assembly-2016", "assembly", "state", "gg", "gg-assembly-2016", "ac", 2016);
  for (const [id, year] of [["ls-1999", 1999], ["ls-2024", 2024], ["ls-2029", 2029]] as const) {
    election.run(id, "general", "union", "in", id, "pc", year);
  }

  const person = db.prepare(`INSERT INTO person (id, canonical_name, created_at) VALUES (?, ?, '2026-08-12')`);
  const contestRow = db.prepare(`INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES (?, ?, ?, 'declared')`);
  const candidacy = db.prepare(`INSERT INTO candidacy (id, contest_id, person_id, party_version_id, status) VALUES (?, ?, ?, ?, ?)`);
  const turnout = db.prepare(`INSERT INTO turnout (contest_id, scope, voters, electors, source_id) VALUES (?, 'contest', 1000, 2000, 's1')`);
  const result = db.prepare(
    `INSERT INTO result (contest_id, candidacy_id, revision, votes, "rank", is_winner, margin, source_id, ingested_at)
     VALUES (?, ?, 0, ?, ?, ?, ?, 's1', '2026-08-12')`,
  );
  /**
   * A contest. With `other` it has two candidates with votes, and `declared: false` flags nobody the winner. Without it only
   * the winner is on record, with no votes and a declared margin: the shape of an election that published nothing else.
   */
  const contest = (electionId: string, versionId: number, winner: Party, other?: Party, declared = true): void => {
    const id = `${electionId}:${versionId}`;
    contestRow.run(id, electionId, versionId);
    turnout.run(id);
    const rows: [string, Party, number][] = other === undefined ? [["w", winner, 1]] : [["w", winner, 1], ["r", other, 2]];
    for (const [who, party, rank] of rows) {
      person.run(`p-${id}-${who}`, `Person ${id} ${who}`);
      const won = rank === 1 && declared;
      candidacy.run(`${id}-${who}`, id, `p-${id}-${who}`, pv(party), won ? "elected" : "defeated");
      const votes = other === undefined ? null : rank === 1 ? 600 : 400;
      result.run(id, `${id}-${who}`, votes, rank, won ? 1 : 0, won ? (other === undefined ? 150 : 200) : null);
    }
  };

  // 2011: P01 holds seats 1 and 2, P02 to P11 one each, nobody was declared the winner of 13, and 14 has no result at all.
  const first: Party[] = ["P01", "P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08", "P09", "P10", "P11"];
  first.forEach((p, i) => contest("ee-assembly-2011", i + 1, p, "AAA"));
  contest("ee-assembly-2011", 13, "AAA", "BBB", false);
  contestRow.run("ee-assembly-2011:14", "ee-assembly-2011", 14);
  // 2016: seat 1 held, the rest to AAA and BBB; seat 14 had no winner in 2011 and here has no runner-up; seat 13 is the e2 version (id 15).
  contest("ee-assembly-2016", 1, "P01", "AAA");
  for (let n = 2; n <= 8; n++) contest("ee-assembly-2016", n, "AAA", "BBB");
  for (let n = 9; n <= 12; n++) contest("ee-assembly-2016", n, "BBB", "AAA");
  contest("ee-assembly-2016", 14, "AAA");
  contest("ee-assembly-2016", 15, "AAA", "BBB");
  // 2021: winners and declared margins only.
  for (let n = 1; n <= 8; n++) contest("ee-assembly-2021", n, "AAA");
  for (let n = 9; n <= 12; n++) contest("ee-assembly-2021", n, "BBB");
  contest("ee-assembly-2021", 14, "AAA");
  contest("ee-assembly-2021", 15, "AAA");
  contest("ff-assembly-2021", 16, "AAA", "BBB");
  contest("gg-assembly-2011", 17, "AAA", "BBB");
  contest("gg-assembly-2016", 18, "AAA", "BBB");

  // The Lok Sabha of 1999 has all 543 seats, 300 of them AAA's.
  for (let n = 1; n <= 543; n++) contest("ls-1999", 1000 + n, n <= 300 ? "AAA" : "BBB", n <= 300 ? "BBB" : "AAA");
  [1, 2, 3].forEach((n) => {
    contest("ls-2024", 1000 + n, n < 3 ? "AAA" : "BBB", n < 3 ? "BBB" : "AAA");
    contest("ls-2029", 1000 + n, n < 3 ? "AAA" : "BBB", n < 3 ? "BBB" : "AAA");
  });
  contest("ls-2029", 2000, "BBB", "AAA");
  db.exec("COMMIT");
  return db;
}

const PATH = join(mkdtempSync(join(tmpdir(), "mandate-election-page-")), "registry.db");
fixture(open(PATH)).close();

const ENV = { ...process.env, MANDATE_DB_PATH: PATH };

function render(query: string, id: string): string {
  try {
    return execFileSync(
      process.execPath,
      ["--import", "./ops/probe/render/register.mjs", "./ops/probe/render/render.mjs", "/election", query, id],
      { cwd: ROOT, env: ENV, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    throw new Error(`render /election ${query} ${id} failed:\n${err.stderr ?? err.message}`);
  }
}

/** What the page exports as its metadata for this election, as Next would ask for it. */
function metadata(id: string): { title?: string } {
  const script = `const m = await import("./src/app/election/[id]/page.tsx");
    process.stdout.write(JSON.stringify(await m.generateMetadata({ params: { id: ${JSON.stringify(id)} } })));`;
  return JSON.parse(
    execFileSync(process.execPath, ["--import", "./ops/probe/render/register.mjs", "--input-type=module", "-e", script], {
      cwd: ROOT,
      env: ENV,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  ) as { title?: string };
}

const text = (html: string): string => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const unescape = (s: string): string => s.replace(/&amp;/g, "&");

/** The markup of the panel with this id, up to the next section. */
function panel(html: string, id: string): string {
  const open = html.indexOf(`id="${id}"`);
  assert.notEqual(open, -1, `no panel ${id} in the page`);
  const close = html.indexOf('<section class="iei-sec"', open + 1);
  return html.slice(open, close === -1 ? undefined : close);
}

/** The markup between the header's opening and the map section: the answer, its sub-line and the seats-won strip. */
const header = (html: string): string => html.slice(html.indexOf('class="iei-head iei-head-map"'), html.indexOf('id="map"'));
/** The legend beside the map. */
const legend = (html: string): string => {
  const at = html.indexOf('class="iei-atlas-side"');
  const from = html.indexOf('<ul class="iei-legend"', at);
  return from === -1 ? "" : html.slice(from, html.indexOf("</ul>", from));
};
const links = (markup: string): string[] => [...markup.matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => unescape(m[1] as string));

/* ───────────────────────── a Lok Sabha of which the registry holds some seats ───────────────────────── */

test("the Lok Sabha of which the registry holds 3 of 543 seats is those seats, said so, and has no majority", () => {
  const html = render("", "ls-2024");
  const head = text(header(html));
  assert.match(head, /Ee State · Lok Sabha Election · 2024/, "the eyebrow names the state the seats are in, not India");
  assert.match(head, /AAA won 2 of the 3 seats on record/);
  assert.match(head, /3 of 543 seats on record/);
  assert.doesNotMatch(head, /majority|India/);
  const house = text(panel(html, "house"));
  assert.match(house, /Ee State’s seats/);
  assert.match(house, /Every seat in Ee State, one dot each/);
  assert.doesNotMatch(house, /majority|has it|short by|The house|Every seat of the house|Of the house/);
  assert.match(html, /<h2 id="map-h" class="iei-sr">Ee State · Winners<\/h2>/);
});

test("a Lok Sabha whose seats on record are in several states is named for how many", () => {
  const html = render("", "ls-2029");
  assert.match(text(header(html)), /2 states · Lok Sabha Election · 2029/);
  const house = text(panel(html, "house"));
  assert.match(house, /2 states’ seats/);
  assert.doesNotMatch(house, /majority|The house/);
  assert.match(html, /<h2 id="map-h" class="iei-sr">2 states · Winners<\/h2>/);
});

test("the Lok Sabha with all 543 seats is the house, with its majority of 272", () => {
  const html = render("", "ls-1999");
  const head = text(header(html));
  assert.match(head, /India · Lok Sabha Election · 1999/);
  assert.match(head, /AAA won 300 of 543 seats(?! on record)/);
  assert.match(head, /543 seats · majority 272/);
  const house = text(panel(html, "house"));
  assert.match(house, /The house/);
  assert.match(house, /majority 272/);
});

/* ───────────────────────── no earlier election ───────────────────────── */

test("the first election of a house on record says there is no earlier one, and does not blame a redraw", () => {
  for (const id of ["ee-assembly-2011", "ls-1999"]) {
    const t = text(panel(render("", id), "flips"));
    assert.match(t, /What changed since the previous election\?/, id);
    assert.match(t, /No earlier election of this house is on record, so there is nothing to compare this one with\./, id);
    assert.doesNotMatch(t, /redrawn|cannot be compared|did not exist/, id);
  }
});

test("where there is a previous election and no seat of it is the seat now, the redraw is said", () => {
  const t = text(panel(render("", "gg-assembly-2016"), "flips"));
  assert.match(t, /1 seat cannot be compared: the constituencies were redrawn after 2011\./);
  assert.doesNotMatch(t, /No earlier election/);
});

/* ───────────────────────── modes that nothing can fill ───────────────────────── */

/** The opening tag of the mode tab with this label, and the label. */
const tab = (html: string, label: string): string => {
  const m = new RegExp(`<(?:a|span) [^>]*>${label}`).exec(html);
  assert.ok(m !== null, `no ${label} tab`);
  return m[0];
};

test("an election that published winners and declared margins only offers neither Margin nor Runner-up", () => {
  const html = render("", "ee-assembly-2021");
  for (const label of ["Margin", "Runner-up"]) {
    assert.match(tab(html, label), /^<span class="iei-tab iei-tab-off" aria-disabled="true">/, `${label} is a live tab`);
  }
  assert.match(tab(html, "Winners"), /^<a [^>]*class="iei-tab iei-tab-on"/);
});

test("a link into a mode that nothing can fill shows the winners instead, with the Winners tab current", () => {
  for (const mode of ["margin", "runnerup"]) {
    const html = render(`mode=${mode}`, "ee-assembly-2021");
    assert.match(tab(html, "Winners"), /^<a [^>]*class="iei-tab iei-tab-on"/, mode);
    assert.doesNotMatch(html, /came second, and where|have a computable margin|Brightest where/, mode);
    assert.match(legend(html), /AAA<b>10<\/b>/, `${mode}: the winners' legend`);
  }
});

test("an election with votes keeps all four modes, and a link into Margin or Runner-up honours it", () => {
  const html = render("mode=margin", "ee-assembly-2016");
  for (const label of ["Margin", "Runner-up"]) assert.doesNotMatch(tab(html, label), /iei-tab-off/, label);
  assert.match(tab(html, "Margin"), /^<a [^>]*class="iei-tab iei-tab-on"/);
  assert.match(tab(render("mode=runnerup", "ee-assembly-2016"), "Runner-up"), /^<a [^>]*class="iei-tab iei-tab-on"/);
});

/* ───────────────────────── the seats-won strip ───────────────────────── */

test("the strip under the answer is seats won, so on the Runner-up tab its links go to the winners", () => {
  const strip = (q: string): string => {
    const html = render(q, "ee-assembly-2016");
    const at = html.indexOf('<ul class="iei-standing"');
    return html.slice(at, html.indexOf("</ul>", at));
  };
  for (const href of links(strip("mode=runnerup"))) {
    assert.ok(!href.includes("mode=runnerup"), `${href} keeps the runner-up tab, where the party would mean the one that came second`);
    assert.ok(href.includes("party="), href);
  }
  // On the tabs where a party still means its winner, the mode is kept.
  for (const href of links(strip("mode=margin"))) assert.ok(href.includes("mode=margin"), href);
});

test("a strip that stops at eight parties says how many it left out, and what they hold", () => {
  const html = render("", "ee-assembly-2011");
  const at = html.indexOf('<ul class="iei-standing"');
  const strip = html.slice(at, html.indexOf("</ul>", at));
  assert.equal(links(strip).length, 8);
  assert.match(text(strip), /\+ 3 other parties · 3 seats/);
  // The legend beside the map stops at ten.
  const key = legend(html);
  assert.equal(links(key).length, 10);
  assert.match(text(key), /\+ 1 other party · 1 seat\b/);
});

test("a strip with every party in it has no 'other parties' item", () => {
  const html = render("", "ee-assembly-2016");
  assert.doesNotMatch(text(html.slice(html.indexOf('<ul class="iei-standing"'), html.indexOf('id="map"'))), /other part/);
  assert.doesNotMatch(legend(html), /other part/);
});

/* ───────────────────────── the legends, and the seats they leave out ───────────────────────── */

test("a seat with no declared winner is in the winners legend, in the ink the map paints it, and is not a link", () => {
  const html = render("", "ee-assembly-2011");
  const none = /<li><span class="iei-sw iei-sw-none" aria-hidden="true"><\/span>No declared winner<b>2<\/b><\/li>/;
  assert.match(legend(html), none);
  assert.doesNotMatch(legend(render("", "ee-assembly-2016")), /No declared winner/, "every seat of 2016 has a winner");
  // On the runner-up tab a seat with no result at all has no second either, and the cause is that nobody won it.
  const second = legend(render("mode=runnerup", "ee-assembly-2011"));
  assert.match(second, /No declared winner<b>1<\/b>/);
  assert.doesNotMatch(second, /No runner-up recorded/);
  // A seat that has a winner and no runner-up is another thing, and is said so.
  const lone = legend(render("mode=runnerup", "ee-assembly-2016"));
  assert.match(lone, /<li><span class="iei-sw iei-sw-none" aria-hidden="true"><\/span>No runner-up recorded<b>1<\/b><\/li>/);
  assert.doesNotMatch(lone, /No declared winner/);
});

test("the Flips legend counts the seats with no winner at one end, apart from the redrawn ones", () => {
  const key = text(legend(render("mode=flips", "ee-assembly-2016")));
  assert.match(key, /Held 1\b/);
  assert.match(key, /Not comparable 1\b/);
  assert.match(key, /No comparison 1\b/);
});

/* ───────────────────────── links and labels ───────────────────────── */

test("the legend marks the isolated party with aria-current, and nothing on the page is aria-pressed", () => {
  const html = render("party=AAA", "ee-assembly-2016");
  assert.doesNotMatch(html, /aria-pressed/);
  const on = [...legend(html).matchAll(/<a [^>]*aria-current="true"[^>]*>/g)];
  assert.equal(on.length, 1);
  assert.match(on[0]?.[0] as string, /iei-legend-on/);
  assert.doesNotMatch(legend(render("", "ee-assembly-2016")), /aria-current/, "nothing isolated, nothing current");
});

test("the wordmark is not the current page on an election page, though the breadcrumb is", () => {
  const html = render("", "ee-assembly-2016");
  assert.match(html, /<a class="iei-mark" href="\/">/);
  assert.match(html, /<span aria-current="page">Assembly 2016<\/span>/);
});

test("the links to other elections keep the mode and drop the isolation", () => {
  const html = render("mode=margin&party=AAA", "ee-assembly-2016");
  const sub = header(html);
  const previous = links(sub).find((h) => h.startsWith("/election/ee-assembly-2011"));
  assert.ok(previous?.includes("mode=margin") && !previous.includes("party="), `the previous election: ${previous}`);
  const foot = html.slice(html.indexOf('<footer class="iei-foot">'));
  for (const id of ["ee-assembly-2021", "ee-assembly-2011"]) {
    const href = links(foot).find((h) => h.startsWith(`/election/${id}`));
    assert.ok(href?.includes("mode=margin") && !href.includes("party="), `${id}: ${href}`);
  }
  assert.doesNotMatch(text(sub), /compare 2011/, "the page already is the comparison with 2011");
  assert.match(text(sub), /previous: 2011/);
});

test("the years in the footer are a labelled group, and the separator after them stays on their line", () => {
  const foot = render("", "ee-assembly-2016");
  const at = foot.indexOf('<footer class="iei-foot">');
  const strip = foot.slice(at, foot.indexOf("</p>", at));
  assert.match(strip, /<span class="iei-sibs" role="group" aria-label="Elections of this house">/);
  assert.deepEqual([...strip.matchAll(/>(\d{4})<\/a>/g)].map((m) => m[1]), ["2021", "2016", "2011"]);
});

test("an election that is alone in its house has a footer that begins with the coverage link, not a separator", () => {
  const html = render("", "ff-assembly-2021");
  assert.match(html, /<footer class="iei-foot"><p><a href="\/coverage">Data &amp; coverage<\/a>/);
});

/* ───────────────────────── the document title ───────────────────────── */

test("each election's document title names it", () => {
  assert.equal(metadata("ee-assembly-2016").title, "Ee State Assembly Election 2016");
  assert.equal(metadata("ee-assembly-2021").title, "Ee State Assembly Election 2021");
  assert.equal(metadata("ls-1999").title, "India Lok Sabha Election 1999");
});

test("an id that names no election leaves the title to the layout", () => {
  assert.equal(metadata("no-such-election").title, undefined);
});

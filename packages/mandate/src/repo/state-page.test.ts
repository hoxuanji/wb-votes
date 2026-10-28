// What the state page says and offers, held on a registry built from literal data and rendered in a child process
// (seat-tiles-page.test.ts does the same). Each test names a defect of a reader's view of the page, not of its code.
//
//   tt  six assembly seats in two districts, five with an outline and one without; assembly 2011, 2016 and 2021 with vote counts,
//       a by-election; and the Lok Sabha 2019 and 2024, which publish winners and nothing else and no turnout.
//         winner of seat 1..6   2011: A A A A B B   2016: A A B B B C   2021: A B B B C C
//   uu  three assembly seats, assembly 2016 and 2021; in 2021 seat 3 has no declared winner. It has two seats in the Lok Sabha 2024.
//   nv  two assembly seats; assembly 2021 with vote counts, assembly 2026 with winners and a declared margin and nothing else,
//       and a turnout that nothing corroborates.

import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { SHARED_FRAME } from "./election-map.ts";

const ROOT = new URL("../../../../", import.meta.url).pathname;

function fixture(db: DatabaseSync): DatabaseSync {
  migrate(db, "2026-08-12T00:00:00.000Z");
  db.exec(`
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e1','Delimitation','2008-02-19');
    INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India');
    INSERT INTO source (id, kind, publisher, title, retrieved_at, doc_hash) VALUES ('s1','static_module','P','Results','2026-08-12','sha256:0');
    INSERT INTO source (id, kind, publisher, title, retrieved_at, doc_hash) VALUES ('s2','static_module','P','Outlines','2026-08-12','sha256:0');
    INSERT INTO party (id, name, short_name) VALUES ('AAA','A Party','AAA');
    INSERT INTO party (id, name, short_name) VALUES ('BBB','B Party','BBB');
    INSERT INTO party (id, name, short_name) VALUES ('CCC','C Party','CCC');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (1,'AAA','1990-01-01','A Party');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (2,'BBB','1990-01-01','B Party');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (3,'CCC','1990-01-01','C Party');
  `);
  const place = db.prepare(`INSERT INTO place (id, kind, canonical_name, parent_id) VALUES (?, ?, ?, ?)`);
  for (const [id, name] of [["tt", "Tt"], ["uu", "Uu"], ["nv", "Nv"]] as const) place.run(id, "state", `${name} State`, "in");
  place.run("tt.d1", "district", "North", "tt");
  place.run("tt.d2", "district", "South", "tt");
  const version = db.prepare(
    `INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation, district_place_id)
     VALUES (?, ?, ?, ?, 'e1', ?, ?, 'general', ?)`,
  );
  const outline = db.prepare(
    `INSERT INTO place_geometry (place_version_id, path, centroid_x, centroid_y, view_box, source_id) VALUES (?, ?, 1, 1, ?, 's2')`,
  );
  let next = 0;
  /** A seat of `kind`, with an outline unless `drawn` is false. Seats sit in a row, so the tiles have somewhere to go. */
  const seat = (state: string, kind: "ac" | "pc", n: number, drawn: boolean, district: string | null = null): number => {
    const id = ++next;
    place.run(`${state}.${kind}.00${n}`, kind, `Seat ${state}${kind}${n}`, state);
    version.run(id, `${state}.${kind}.00${n}`, state, kind, n, `Seat ${state}${kind}${n}`, district);
    if (drawn) outline.run(id, `M${id * 10} 0L${id * 10 + 8} 0L${id * 10 + 8} 8L${id * 10} 8Z`, SHARED_FRAME);
    return id;
  };
  const tt = [1, 2, 3, 4, 5, 6].map((n) => seat("tt", "ac", n, n !== 6, n <= 3 ? "tt.d1" : "tt.d2"));
  const ttPc = [1, 2, 3].map((n) => seat("tt", "pc", n, true));
  const uu = [1, 2, 3].map((n) => seat("uu", "ac", n, true));
  const uuPc = [1, 2].map((n) => seat("uu", "pc", n, true));
  const nv = [1, 2].map((n) => seat("nv", "ac", n, true));

  const election = db.prepare(
    `INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, polling_month, occurrence)
     VALUES (?, ?, ?, ?, 'e1', ?, 'declared', ?, ?, ?, 1)`,
  );
  for (const [s, year] of [["tt", 2011], ["tt", 2016], ["tt", 2021], ["uu", 2016], ["uu", 2021], ["nv", 2021], ["nv", 2026]] as const) {
    election.run(`${s}-assembly-${year}`, "assembly", "state", s, `${s.toUpperCase()} ${year}`, "ac", year, 5);
  }
  election.run("tt-bypoll-ae-2022", "bypoll", "state", "tt", "TT bypoll 2022", "ac", 2022, null);
  election.run("ls-2019", "general", "union", "in", "LS 2019", "pc", 2019, 4);
  election.run("ls-2024", "general", "union", "in", "LS 2024", "pc", 2024, 4);

  const person = db.prepare(`INSERT INTO person (id, canonical_name, created_at) VALUES (?, ?, '2026-08-12')`);
  const contestRow = db.prepare(`INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES (?, ?, ?, 'declared')`);
  const candidacy = db.prepare(`INSERT INTO candidacy (id, contest_id, person_id, party_version_id, status) VALUES (?, ?, ?, ?, ?)`);
  const result = db.prepare(
    `INSERT INTO result (contest_id, candidacy_id, revision, votes, "rank", is_winner, margin, source_id, ingested_at)
     VALUES (?, ?, 0, ?, ?, ?, ?, 's1', '2026-08-12')`,
  );
  const turnout = db.prepare(`INSERT INTO turnout (contest_id, scope, voters, electors, source_id) VALUES (?, 'contest', 1000, 2000, 's1')`);
  /**
   * One contest of 1000 votes polled: party `winner` (1 to 3) beat the next party round by 100 votes. `how` says what was
   * published: the counts (`counted`), the winner and a declared margin and nothing else (`declared`), or no winner at all
   * (`undeclared`, where the runner-up's row is the only one with a count). Turnout is held where `held` is true.
   */
  const contest = (electionId: string, versionId: number, winner: 1 | 2 | 3, how: "counted" | "declared" | "undeclared", held: boolean): void => {
    const id = `${electionId}:${versionId}`;
    contestRow.run(id, electionId, versionId);
    if (held) turnout.run(id);
    const other = (winner % 3) + 1;
    for (const [who, pv, rank] of [["w", winner, 1], ["r", other, 2]] as const) {
      if (how === "declared" && rank === 2) continue;
      const won = how !== "undeclared" && rank === 1;
      person.run(`p-${id}-${who}`, `Person ${id} ${who}`);
      candidacy.run(`${id}-${who}`, id, `p-${id}-${who}`, pv, won ? "elected" : "defeated");
      result.run(id, `${id}-${who}`, how === "declared" ? null : rank === 1 ? 550 : 450, rank, won ? 1 : 0, won ? 100 : null);
    }
  };
  const run = (electionId: string, seats: readonly number[], winners: readonly (1 | 2 | 3)[], how: "counted" | "declared" | "undeclared", held: boolean): void =>
    seats.forEach((v, i) => contest(electionId, v, winners[i] as 1 | 2 | 3, how, held));
  run("tt-assembly-2011", tt, [1, 1, 1, 1, 2, 2], "counted", true);
  run("tt-assembly-2016", tt, [1, 1, 2, 2, 2, 3], "counted", true);
  run("tt-assembly-2021", tt, [1, 2, 2, 2, 3, 3], "counted", true);
  run("tt-bypoll-ae-2022", [tt[0] as number], [2], "counted", true);
  run("ls-2019", ttPc, [1, 1, 2], "declared", false);
  run("ls-2024", [...ttPc, ...uuPc], [1, 2, 2, 1, 1], "declared", false);
  run("uu-assembly-2016", uu, [1, 2, 2], "counted", true);
  run("uu-assembly-2021", uu.slice(0, 2), [1, 2], "counted", true);
  contest("uu-assembly-2021", uu[2] as number, 1, "undeclared", true);
  run("nv-assembly-2021", nv, [1, 2], "counted", true);
  run("nv-assembly-2026", nv, [2, 2], "declared", true);
  return db;
}

const PATH = join(mkdtempSync(join(tmpdir(), "mandate-state-page-")), "registry.db");
fixture(open(PATH)).close();

function render(route: string, query: string, segments: string): string {
  try {
    return execFileSync(
      process.execPath,
      ["--import", "./ops/probe/render/register.mjs", "./ops/probe/render/render.mjs", route, query, segments],
      { cwd: ROOT, env: { ...process.env, MANDATE_DB_PATH: PATH }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    throw new Error(`render ${route} ${query} ${segments} failed:\n${err.stderr ?? err.message}`);
  }
}

/** A route's own `generateMetadata`, as Next would call it for these params, as plain data. */
function metadata(page: string, params: Record<string, string>): { title?: unknown; alternates?: { canonical?: unknown } } {
  const script = `const m = await import(${JSON.stringify(page)}); console.log(JSON.stringify(await m.generateMetadata({ params: ${JSON.stringify(params)} })));`;
  try {
    return JSON.parse(
      execFileSync(process.execPath, ["--import", "./ops/probe/render/register.mjs", "--input-type=module", "-e", script], {
        cwd: ROOT,
        env: { ...process.env, MANDATE_DB_PATH: PATH },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim().split("\n").at(-1) as string,
    );
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    throw new Error(`generateMetadata of ${page} failed:\n${err.stderr ?? err.message}`);
  }
}

const text = (html: string): string => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** The Party landscape rows as "label seats change", by label: the page orders them by vote share, which is not what is held here. */
function partyRows(html: string): string[] {
  const start = html.indexOf('class="iei-partyrows"');
  assert.notEqual(start, -1, "the page has no party rows");
  const list = html.slice(start, html.indexOf("</ul>", start));
  return [...list.matchAll(/<li>(.*?)<\/li>/gs)]
    .map((m) => text((m[1] as string).replace(/<span class="iei-partyrows-bars".*?<\/span><\/span>/s, "")))
    .sort();
}

/** The labels of the tab strip called `label`, in order, each marked with a leading "~" where it is offered as unavailable. */
function tabs(html: string, label: string): string[] {
  const start = html.indexOf(`aria-label="${label}">`);
  assert.notEqual(start, -1, `no tab strip called ${label}`);
  const strip = html.slice(start, html.indexOf("</div>", start));
  return [...strip.matchAll(/<(a|span) [^>]*class="(iei-tab[^"]*)"[^>]*>([^<]*)/g)].map((m) => `${(m[2] as string).includes("iei-tab-off") ? "~" : ""}${(m[3] as string).trim()}`);
}

/** The legend beside the map, as "label count" items. */
function legend(html: string): string[] {
  const start = html.indexOf('<ul class="iei-legend">');
  if (start === -1) return [];
  return [...html.slice(start, html.indexOf("</ul>", start)).matchAll(/<li[^>]*>(.*?)<\/li>/gs)].map((m) => text(m[1] as string));
}

/* ───────────────────────────── the change beside a party's seats ───────────────────────────── */

test("the change beside a party's seats is since the election before the one shown, on every year", () => {
  // 2021 against 2016: A 2 to 1, B 3 to 3 (no change, none printed), C 1 to 2. It was read against the run's second-newest
  // election, which is right on the newest year only.
  assert.deepEqual(partyRows(render("/state", "election=tt-assembly-2021", "tt")), ["AAA 1 −1", "BBB 3", "CCC 2 +1"]);
  // 2016 against 2011: A 4 to 2, B 2 to 3, C 0 to 1. It printed nothing here, being compared with itself.
  assert.deepEqual(partyRows(render("/state", "election=tt-assembly-2016", "tt")), ["AAA 2 −2", "BBB 3 +1", "CCC 1 +1"]);
});

test("the oldest election of a run, and a by-election, say nothing about change", () => {
  // Nothing precedes 2011 in the run. It printed 2011 against 2016 with the sign reversed.
  assert.deepEqual(partyRows(render("/state", "election=tt-assembly-2011", "tt")), ["AAA 4", "BBB 2", "CCC 0"]);
  // A by-election is not a point of the run, and `at(-2)` of nothing found was somebody else's number.
  for (const row of partyRows(render("/state", "election=tt-bypoll-ae-2022", "tt"))) assert.doesNotMatch(row, /[+−]\d/, row);
});

test("the change says which election it is since, and only when a row has one", () => {
  const since = /change in seats since 2016/i;
  assert.match(text(render("/state", "election=tt-assembly-2021", "tt")), since);
  assert.match(text(render("/state", "election=tt-assembly-2016", "tt")), /change in seats since 2011/i);
  assert.doesNotMatch(text(render("/state", "election=tt-assembly-2011", "tt")), /change in seats since/i);
  assert.doesNotMatch(text(render("/state", "election=tt-bypoll-ae-2022", "tt")), /change in seats since/i);
});

/* ───────────────────────────── the header of a state's Lok Sabha view ───────────────────────────── */

test("a state's share of the Lok Sabha is not given a majority of its own", () => {
  const hero = /<span class="iei-hero-meta">([^<]*)<\/span>/;
  const ls = hero.exec(render("/state", "house=pc", "tt"))?.[1];
  assert.equal(ls, "3 seats in Tt State · Lok Sabha Election 2024");
  // An assembly is a whole house, and keeps its majority.
  assert.match(hero.exec(render("/state", "", "tt"))?.[1] as string, /^6 seats · majority 4 · Assembly Election 2021/);
});

/* ───────────────────────────── a map mode with nothing in it ───────────────────────────── */

test("a mode no seat can fill is offered as unavailable, as Flips is where there is no earlier election", () => {
  const nv26 = render("/state", "", "nv");
  assert.deepEqual(tabs(nv26, "What the map shows"), ["Winners", "Flips", "~Margin", "~Runner-up"]);
  // Elections that published counts keep all four.
  assert.deepEqual(tabs(render("/state", "", "tt"), "What the map shows"), ["Winners", "Flips", "Margin", "Runner-up"]);
  // The Lok Sabha of this registry published winners only.
  assert.deepEqual(tabs(render("/state", "house=pc", "tt"), "What the map shows"), ["Winners", "Flips", "~Margin", "~Runner-up"]);
});

test("a link that still asks for an empty mode is told it is empty, straight under the question", () => {
  const runner = render("/state", "mode=runnerup", "nv");
  const q = /<p class="iei-atlas-q">[^<]*<\/p>/.exec(runner)?.[0] as string;
  assert.ok(q !== undefined);
  assert.ok(
    runner.includes(`${q}<p class="iei-absent">No runner-up is on record for any seat of this election, so there is nothing to colour.</p>`),
    "the sentence is not the first thing after the question",
  );
  assert.deepEqual(legend(runner), [], "and no empty legend follows it");

  const margin = render("/state", "mode=margin", "nv");
  const mq = /<p class="iei-atlas-q">[^<]*<\/p>/.exec(margin)?.[0] as string;
  assert.ok(margin.includes(`${mq}<p class="iei-absent">No seat has a known margin over votes polled, so there is nothing to colour.</p>`));
  assert.equal(text(margin).split("so there are no bands to draw").length - 1, 0, "the same sentence is not said twice");

  // A mode with something in it says nothing of the kind.
  assert.doesNotMatch(text(render("/state", "mode=runnerup", "tt")), /so there is nothing to colour/);
  assert.doesNotMatch(text(render("/state", "mode=margin", "tt")), /so there is nothing to colour/);
});

/* ───────────────────────────── the legend names every fill the map uses ───────────────────────────── */

test("the winners legend names the seats with no declared winner, and the flips legend the seats with no comparison", () => {
  assert.deepEqual(legend(render("/state", "", "uu")).slice(-1), ["No declared winner 1"]);
  const flips = legend(render("/state", "mode=flips", "uu"));
  assert.ok(flips.includes("No comparison 1"), flips.join(" | "));
  // Nothing is printed for a fill no seat has.
  assert.doesNotMatch(legend(render("/state", "", "tt")).join("|"), /No declared winner|No comparison/);
  assert.doesNotMatch(legend(render("/state", "mode=flips", "tt")).join("|"), /No declared winner|No comparison/);
});

test("the sentence under the name says where the seats it did not compare went", () => {
  const sub = (html: string): string | undefined => /<p class="iei-sub">([^<]*)<\/p>/.exec(html)?.[1];
  assert.equal(sub(render("/state", "", "uu")), "0 of 2 seats changed hands. 1 left out because one of the two elections declared no winner there.");
  // With nothing left out it says no more than it did.
  assert.equal(sub(render("/state", "", "tt")), "2 of 6 seats changed hands.");
});

/* ───────────────────────────── the year strips ───────────────────────────── */

test("the year strips say a Lok Sabha year and a by-poll, in the words the glossary gives the chip", () => {
  assert.deepEqual(tabs(render("/state", "", "tt"), "Election"), ["2021", "2016", "2011"]);
  assert.deepEqual(tabs(render("/state", "house=pc", "tt"), "Election"), ["LS 2024", "LS 2019"]);
  assert.deepEqual(tabs(render("/state", "election=tt-bypoll-ae-2022", "tt"), "Election"), ["2022 by-poll"]);
  const sibs = /<ul class="iei-sibs">(.*?)<\/ul>/s.exec(render("/state", "house=pc", "tt"))?.[1] as string;
  assert.deepEqual([...sibs.matchAll(/<a [^>]*>([^<]*)<\/a>/g)].map((m) => m[1]), ["LS 2024", "LS 2019"]);
});

/* ───────────────────────────── what the no-vote-counts caveat says of turnout ───────────────────────────── */

test("the caveat says what is on record from the data: declared margins, and turnout as it stands", () => {
  const caveat = (html: string): string => text(/<p class="iei-caveat">(.*?)<\/p>/s.exec(html)?.[1] as string);
  // No turnout is held for the Lok Sabha: it said turnout was on record.
  const ls = caveat(render("/state", "house=pc", "tt"));
  assert.match(ls, /^No candidate vote counts were published for this election\. Winners and declared margins are on record, and turnout is not reported;/);
  assert.doesNotMatch(ls, /turnout (are|is) on record/);
  // A turnout is held for 2026 and not trusted: the header says verification is pending.
  const nv = caveat(render("/state", "", "nv"));
  assert.match(nv, /Winners and declared margins are on record, and its turnout is awaiting verification;/);
  assert.match(text(render("/state", "", "nv")), /turnout — verification pending/);
  for (const c of [ls, nv]) {
    assert.match(c, /margins over votes polled, competitiveness and vote-to-seat conversion are not on record,/);
    assert.match(c, /a chart that needs them is left out or replaced by a sentence, never drawn as zero\.$/);
  }
});

/* ───────────────────────────── an election the link names that the view cannot open ───────────────────────────── */

test("a link to another house's election is told which house this view is, not that the page cannot show it", () => {
  const notice = (html: string): string | undefined => /<p class="iei-note">(The election in the link[^<]*)<\/p>/.exec(html)?.[1];
  assert.equal(
    notice(render("/state", "election=ls-2024", "tt")),
    "The election in the link is not one of Tt State’s Assembly elections on record, so this is the Assembly Election 2021.",
  );
  assert.equal(
    notice(render("/state", "house=pc&election=tt-assembly-2016", "tt")),
    "The election in the link is not one of Tt State’s Lok Sabha elections on record, so this is the Lok Sabha Election 2024.",
  );
  assert.equal(notice(render("/state", "election=tt-assembly-2016", "tt")), undefined);
});

/* ───────────────────────────── find on map ───────────────────────────── */

test("a seat with no outline is not offered to be found on the map, and says so", () => {
  const html = render("/state", "", "tt");
  assert.equal(html.split("find on map").length - 1, 5, "one for each seat with an outline");
  assert.equal(html.split('<span class="iei-absent">no boundary on record</span>').length - 1, 1, "and the sixth says why it has none");
  const six = html.split('<li><div class="iei-row-h">').find((row) => row.includes(">Seat ttac6<"));
  assert.ok(six !== undefined);
  assert.match(text(six), /no boundary on record/);
  assert.doesNotMatch(six, /find on map|unfocus/);
  // A link that asks for it anyway is not told it is focused on anything.
  const focused = render("/state", "seat=tt.ac.006", "tt");
  assert.doesNotMatch(focused, /unfocus/);
  assert.doesNotMatch(focused, /iei-seat-focus/);
  // Another seat still offers to be released.
  assert.match(render("/state", "seat=tt.ac.005", "tt"), /unfocus/);
});

/* ───────────────────────────── the Lok Sabha view's way to the whole election ───────────────────────────── */

test("a state's Lok Sabha view offers the whole election only where the registry holds seats outside the state", () => {
  // ls-2024 has seats in Tt State and in Uu State.
  const wider = render("/state", "house=pc", "tt");
  assert.match(wider, /<a href="\/election\/ls-2024">See the whole country<\/a>/);
  // ls-2019 has Tt State's three seats and no other: the election's own page would show the same three.
  const same = render("/state", "house=pc&election=ls-2019", "tt");
  assert.doesNotMatch(same, /See the whole country/);
  assert.match(text(same), /narrowed to the seats in Tt State\. The registry holds no seat of it outside Tt State\./);
});

/* ───────────────────────────── the document title ───────────────────────────── */

test("a state and a district name themselves in the document title, and name their one address", () => {
  const state = metadata("./src/app/state/[state]/page.tsx", { state: "TT" });
  assert.equal(state.title, "Tt State");
  assert.equal(state.alternates?.canonical, "/state/tt", "/state/TT is the same page as /state/tt");

  const district = metadata("./src/app/district/[state]/[district]/page.tsx", { state: "tt", district: "North" });
  assert.equal(district.title, "North · District, Tt State");
  assert.equal(district.alternates?.canonical, "/district/tt/d1");

  // A place the registry does not hold keeps the site's own title: the page is a 404 and has nothing to name.
  assert.deepEqual(metadata("./src/app/state/[state]/page.tsx", { state: "nowhere" }), {});
});

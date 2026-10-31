// How power moved, drawn: two columns of parties, who held the seats and who won them, joined by ribbons as thick as the seats.
//
// The registry is built here from literal data and the pages rendered in a child process (house-arc-page.test.ts does the same):
//
//   hh-assembly-2016  a full house of 8, won by BBB 3, AITC (short name TMC) 3, CCC 2
//   hh-assembly-2021  the same 8 seats: AITC 4, BBB 2, CCC 1, and seat 8 with no declared winner
//
// Seven seats can be compared, so seven are drawn; the eighth is left out, and the page has to say so. The flows, which are
// previous holder to winner:  BBB to AITC 2, AITC to AITC 2, BBB to BBB 1, CCC to BBB 1, CCC to CCC 1.

import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { fillFor } from "../viz/party-ink.ts";
import { contrastOf } from "../viz/colour.ts";
import { SURFACE } from "../viz/palette.ts";
import { NEUTRAL_RIBBON_INK, ribbonInk } from "../viz/ribbon-ink.ts";
import { seatFlows } from "./seat-flows.ts";

const ROOT = new URL("../../../../", import.meta.url).pathname;

function fixture(db: DatabaseSync): DatabaseSync {
  migrate(db, "2026-08-12T00:00:00.000Z");
  db.exec(`
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e1','Delimitation','2008-02-19');
    INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('hh','state','Hh State','in');
    INSERT INTO source (id, kind, publisher, title, retrieved_at, doc_hash) VALUES ('s1','static_module','P','Results','2026-08-12','sha256:0');
    INSERT INTO party (id, name, short_name) VALUES ('AITC','All India Trinamool Congress','TMC');
    INSERT INTO party (id, name, short_name) VALUES ('BBB','B Party','BBB');
    INSERT INTO party (id, name, short_name) VALUES ('CCC','C Party','CCC');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (1,'AITC','1998-01-01','All India Trinamool Congress');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (2,'BBB','1990-01-01','B Party');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (3,'CCC','1990-01-01','C Party');
  `);
  const place = db.prepare(`INSERT INTO place (id, kind, canonical_name, parent_id) VALUES (?, 'ac', ?, 'hh')`);
  const version = db.prepare(
    `INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
     VALUES (?, ?, 'hh', 'ac', 'e1', ?, ?, 'general')`,
  );
  for (let n = 1; n <= 8; n++) {
    place.run(`hh.ac.00${n}`, `Seat ${n}`);
    version.run(n, `hh.ac.00${n}`, n, `Seat ${n}`);
  }
  const election = db.prepare(
    `INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
     VALUES (?, 'assembly', 'state', 'hh', 'e1', ?, 'declared', 'ac', ?, 1)`,
  );
  election.run("hh-assembly-2016", "HH 2016", 2016);
  election.run("hh-assembly-2021", "HH 2021", 2021);

  const person = db.prepare(`INSERT INTO person (id, canonical_name, created_at) VALUES (?, ?, '2026-08-12')`);
  const contestRow = db.prepare(`INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES (?, ?, ?, 'declared')`);
  const candidacy = db.prepare(
    `INSERT INTO candidacy (id, contest_id, person_id, party_version_id, status) VALUES (?, ?, ?, ?, ?)`,
  );
  const result = db.prepare(
    `INSERT INTO result (contest_id, candidacy_id, revision, votes, "rank", is_winner, margin, source_id, ingested_at)
     VALUES (?, ?, 0, ?, ?, ?, ?, 's1', '2026-08-12')`,
  );
  const contest = (electionId: string, seat: number, winner: 1 | 2 | 3, declared = true): void => {
    const id = `${electionId}:${seat}`;
    contestRow.run(id, electionId, seat);
    const other = winner === 2 ? 1 : 2;
    for (const [who, pv, rank] of [["w", winner, 1], ["r", other, 2]] as const) {
      person.run(`p-${id}-${who}`, `Person ${id} ${who}`);
      candidacy.run(`${id}-${who}`, id, `p-${id}-${who}`, pv, rank === 1 && declared ? "elected" : "defeated");
      result.run(id, `${id}-${who}`, rank === 1 ? 600 : 400, rank, rank === 1 && declared ? 1 : 0, rank === 1 && declared ? 200 : null);
    }
  };
  [2, 1, 1, 2, 2, 3, 3, 1].forEach((pv, i) => contest("hh-assembly-2016", i + 1, pv as 1 | 2 | 3));
  [1, 1, 1, 1, 2, 2, 3].forEach((pv, i) => contest("hh-assembly-2021", i + 1, pv as 1 | 2 | 3));
  contest("hh-assembly-2021", 8, 1, false);
  return db;
}

const PATH = join(mkdtempSync(join(tmpdir(), "mandate-seat-flows-")), "registry.db");
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

const text = (html: string): string => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** The figure of the flow picture on a page, or fails. */
function flow(html: string): string {
  const open = html.indexOf('<figure class="iei-flow"');
  assert.notEqual(open, -1, "no flow picture in the page");
  return html.slice(open, html.indexOf("</figure>", open));
}

type Box = { party: string; seats: number; top: number; height: number; label: string | null };

/** The boxes of one column, in the order drawn. */
function column(figure: string, side: "from" | "to"): Box[] {
  const ol = new RegExp(`<ol class="iei-flow-col iei-flow-${side}"[^>]*>([\\s\\S]*?)</ol>`).exec(figure);
  assert.ok(ol !== null, `no ${side} column`);
  return [...(ol[1] as string).matchAll(/<li data-party="([^"]*)" data-seats="(\d+)" style="top:([\d.]+)%;height:([\d.]+)%">([\s\S]*?)<\/li>/g)].map((m) => ({
    party: m[1] as string,
    seats: Number(m[2]),
    top: Number(m[3]),
    height: Number(m[4]),
    label: /<span[^>]*>([\s\S]*?)<\/span>/.exec(m[5] as string)?.[1] ? text(/<span[^>]*>([\s\S]*?)<\/span>/.exec(m[5] as string)![1] as string) : null,
  }));
}

const ribbons = (figure: string): { cls: string; fill: string; title: string }[] =>
  [...figure.matchAll(/<path class="(iei-flow-(?:held|moved|mixed))"(?: style="fill:([^";]*)")?[^>]*>(?:<title>([^<]*)<\/title>)?/g)].map((m) => ({
    cls: m[1] as string,
    fill: (m[2] as string | undefined) ?? "",
    title: (m[3] as string | undefined) ?? "",
  }));

const ELECTION = "hh-assembly-2021";

test("the picture has a box per party in each column, as tall as its seats, largest first", () => {
  const f = flow(render("/election", "", ELECTION));
  assert.deepEqual(column(f, "from").map((b) => [b.party, b.seats]), [["BBB", 3], ["AITC", 2], ["CCC", 2]]);
  assert.deepEqual(column(f, "to").map((b) => [b.party, b.seats]), [["AITC", 4], ["BBB", 2], ["CCC", 1]]);
  const [a, b] = column(f, "from");
  assert.ok(Math.abs(a!.height / b!.height - 1.5) < 0.02, `3 seats against 2 are ${a!.height} against ${b!.height}`);
});

test("a box is named when it is tall enough to carry its name, and the name is a party's label and its seats", () => {
  const f = flow(render("/election", "", ELECTION));
  assert.deepEqual(column(f, "to").map((b) => b.label), ["TMC 4", "BBB 2", "CCC 1"]);
});

test("a ribbon is inked by the party that won the seats, and brighter where the seats changed hands", () => {
  const rs = ribbons(flow(render("/election", "", ELECTION)));
  assert.equal(rs.length, 5);
  assert.equal(rs.filter((r) => r.cls === "iei-flow-held").length, 3);
  assert.equal(rs.filter((r) => r.cls === "iei-flow-moved").length, 2);
  const moved = rs.find((r) => r.title.startsWith("BBB → TMC"));
  assert.ok(moved !== undefined, "no ribbon from BBB to TMC");
  assert.equal(moved.cls, "iei-flow-moved");
  // CHANGED 2026-10-31, on purpose: a ribbon's fill was the winner's ink with the opacity in CSS; it is now an opaque tint of that ink at a stated
  // contrast against the card (viz/ribbon-ink.ts), because translucent ink over a card goes grey-brown. What is still held: the ribbon is the
  // winner's hue, and a ribbon that changed hands is brighter than the party's held ribbon.
  assert.equal(moved.fill, ribbonInk(fillFor("AITC"), "bright"));
  const held = rs.find((r) => r.title.startsWith("TMC → TMC"));
  assert.equal(held?.fill, ribbonInk(fillFor("AITC"), "faint"));
  assert.ok(contrastOf(moved.fill, SURFACE) > contrastOf(held?.fill ?? "#000000", SURFACE) + 1, "changed hands is not brighter than held");
  assert.doesNotMatch(moved.fill, /rgba|opacity/, "a ribbon's fill is opaque");
  assert.match(moved.title, /BBB → TMC · 2 seats, changed hands/);
  assert.match(held?.title ?? "", /TMC → TMC · 2 seats, held/);
});

test("where two ribbons cross the brighter one is painted over the fainter, so a crossing is one party's colour and not a blend", () => {
  const order = ribbons(flow(render("/election", "", ELECTION))).map((r) => r.cls);
  const lastHeld = order.lastIndexOf("iei-flow-held");
  const firstMoved = order.indexOf("iei-flow-moved");
  assert.ok(lastHeld < firstMoved, `a held ribbon is painted after a moved one: ${order.join(" ")}`);
});

test("the sentence says how many seats are in the picture and how many were left out and why, and never says all", () => {
  const html = render("/election", "", ELECTION);
  assert.match(text(html), /7 of 8 seats are in the picture, compared with 2016/);
  assert.match(text(html), /1 left out because one of the two elections declared no winner there/);
  assert.doesNotMatch(text(flow(html)), /\ball\b/i, "the picture's own words claim all the seats");
});

test("the table twin lists every flow with its seats, and they add up to the seats compared", () => {
  const html = render("/election", "", ELECTION);
  const open = html.indexOf('<details class="iei-flow-table"');
  assert.notEqual(open, -1, "no table twin");
  const table = html.slice(open, html.indexOf("</details>", open));
  const rows = [...table.matchAll(/<tr><th scope="row">([\s\S]*?)<\/th><td>([\s\S]*?)<\/td><td[^>]*>(\d+)<\/td><td>([\s\S]*?)<\/td><\/tr>/g)].map(
    (m) => [text(m[1] as string), text(m[2] as string), Number(m[3]), text(m[4] as string)] as const,
  );
  assert.equal(rows.length, 5);
  assert.equal(rows.reduce((n, r) => n + r[2], 0), 7);
  assert.deepEqual(rows[0], ["TMC", "TMC", 2, "Held"], "the largest flows first, a tie by previous holder's key");
  assert.deepEqual(rows[1], ["BBB", "TMC", 2, "Changed hands"]);
});

test("an election with nothing to compare it with has no picture", () => {
  const html = render("/election", "", "hh-assembly-2016");
  assert.doesNotMatch(html, /iei-flow/);
});

test("the state page carries the same picture", () => {
  const f = flow(render("/state", "", "hh"));
  assert.deepEqual(column(f, "to").map((b) => [b.party, b.seats]), [["AITC", 4], ["BBB", 2], ["CCC", 1]]);
});

test("the picture sits in the panel that already answers what changed, above its tally", () => {
  const html = render("/election", "", ELECTION);
  const panel = html.indexOf('id="flips"');
  assert.notEqual(panel, -1);
  assert.ok(html.indexOf('<figure class="iei-flow"') > panel, "the picture is outside the panel");
  assert.ok(html.indexOf('<figure class="iei-flow"') < html.indexOf('class="iei-tally"'), "the picture is below the tally");
});

/* ───────────── the component alone, on literal flows: what no page of the fixture can reach ───────────── */

/** Renders the picture for these flows in a child process that can load the component, and returns its markup. */
function renderFlow(flows: ReturnType<typeof seatFlows>, previousYear: number | null = 2016): string {
  const code = `
    import { renderToStaticMarkup } from "react-dom/server";
    import React from "react";
    import { SeatFlow } from "./src/components/iei/SeatFlow.tsx";
    process.stdout.write(renderToStaticMarkup(React.createElement(SeatFlow, ${JSON.stringify({ flows, previousYear, year: 2021 })})));`;
  return execFileSync(process.execPath, ["--import", "./ops/probe/render/register.mjs", "--input-type=module", "-e", code], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

type Seat = Parameters<typeof seatFlows>[0][number];
const won = (from: string, to: string): Seat => ({ partyKey: to, partyLabel: to, comparable: true, flip: { from: { key: from, label: from } } });

test("no flows draws nothing, not an empty frame", () => {
  assert.equal(renderFlow(seatFlows([])), "");
});

test("past seven parties on a side the smaller ones are one hatched box, and the key says so", () => {
  const seats = Array.from({ length: 9 }, (_, i) => Array.from({ length: 20 - i * 2 }, () => won(`P${i + 1}`, "P1"))).flat();
  const html = renderFlow(seatFlows(seats));
  const from = column(flow(html), "from");
  assert.equal(from.length, 7, "six parties and the fold");
  assert.equal(from.at(-1)?.party, "");
  assert.equal(from.at(-1)?.label, "Others (3) 18", "the fold is named, with the seats of the three parties in it");
  assert.match(html, /<i class="iei-res-others"/);
  assert.match(text(html), /smaller parties together/);
  assert.equal(from.reduce((n, b) => n + b.seats, 0), seats.length);
});

test("a box too short to carry a name is drawn without one, and is named in the key", () => {
  const seats = [...Array.from({ length: 200 }, () => won("AAA", "AAA")), won("ZZZ", "ZZZ")];
  const html = renderFlow(seatFlows(seats));
  const from = column(flow(html), "from");
  assert.deepEqual(from.map((b) => [b.party, b.label]), [["AAA", "AAA 200"], ["ZZZ", null]]);
  assert.match(text(html), /ZZZ/);
});

test("seats redrawn and seats with no winner are both counted and both explained", () => {
  const seats: Seat[] = [
    ...Array.from({ length: 5 }, () => won("AAA", "BBB")),
    { partyKey: "BBB", partyLabel: "BBB", comparable: false, flip: null },
    { partyKey: "BBB", partyLabel: "BBB", comparable: false, flip: null },
    { partyKey: null, partyLabel: null, comparable: true, flip: null },
  ];
  const t = text(renderFlow(seatFlows(seats)));
  assert.match(t, /5 of 8 seats are in the picture, compared with 2016/);
  assert.match(t, /3 left out: 2 because the constituency was redrawn since, so it has no predecessor, and 1 because one of the two elections declared no winner there/);
});

test("ribbons into the smaller-parties box are grey, not a party's ink, and the caption says so", () => {
  // Nine winning parties: the winners' side folds, which is what a Lok Sabha comparison does.
  const seats = Array.from({ length: 9 }, (_, i) => Array.from({ length: 20 - i * 2 }, () => won("P1", `P${i + 1}`))).flat();
  const html = renderFlow(seatFlows(seats));
  const ribbons = [...html.matchAll(/<path class="([^"]*)" style="fill:([^"]*)"[^>]*><title>([^<]*)</g)].map((m) => ({ cls: m[1], fill: m[2], title: m[3] as string }));
  const intoFold = ribbons.filter((r) => r.title.includes("→ Others"));
  assert.ok(intoFold.length > 0, "no ribbon goes into the fold");
  // CHANGED 2026-10-31, on purpose: the grey is the neutral ink's opaque tint now (viz/ribbon-ink.ts), not `var(--iei-ink-3)` under an opacity. It is
  // still no party's: it is neither the unattached ink nor a tint of a named party's.
  for (const r of intoFold) assert.ok([ribbonInk(NEUTRAL_RIBBON_INK, "bright"), ribbonInk(NEUTRAL_RIBBON_INK, "mid"), ribbonInk(NEUTRAL_RIBBON_INK, "faint")].includes(r.fill as string), `${r.title}: ${r.fill}`);
  assert.notEqual(fillFor(""), NEUTRAL_RIBBON_INK, "the empty key is the unattached ink, which is what the fold used to be painted in");
  assert.equal(ribbons.find((r) => r.title.startsWith("P1 → P2"))?.fill, ribbonInk(fillFor("P2"), "bright"), "a named party keeps its own hue");
  assert.match(text(html), /Grey ribbons go to the smaller parties together/);
});

test("with nothing folded on the winners' side the caption does not mention grey ribbons", () => {
  assert.doesNotMatch(text(renderFlow(seatFlows([won("AAA", "BBB"), won("BBB", "BBB")]))), /Grey ribbons/);
});

test("a previous election whose year the page does not know is called the previous election", () => {
  const t = text(renderFlow(seatFlows([won("AAA", "BBB")]), null));
  assert.match(t, /Held in the previous election/);
  assert.match(t, /compared with the previous election/);
});

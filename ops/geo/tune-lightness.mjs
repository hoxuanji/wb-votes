// Choose a LIGHTNESS for each newly curated party, keeping its hue.
//
// Not shipped as part of the product: run once, read the result, paste the numbers into
// data/party-ink.json, and check them by eye. Run: node ops/geo/tune-lightness.mjs
//
// WHY LIGHTNESS AND NOT HUE. The config's own source note draws the line: the hue is the editorial
// association — saffron for the BJP, red for the communists, green for the Trinamool — and lightness and
// chroma are not the association, they are chosen so the colour is legible and so parties sharing a hue
// family separate. So a tuner may move lightness and must not move hue.
//
// WHY CO-OCCURRENCE AND NOT GLOBAL SEPARATION. Sixty identities cannot be pairwise separable in the OKLCH
// band this product uses; that was measured, and 38 pairs sat under ΔE 5.5. But two parties only have to be
// distinguishable when they appear in the SAME view, and a view is one jurisdiction's winners — three to
// nine parties — or the national map's legend. So the objective is the minimum ΔE over pairs that actually
// co-occur, which is achievable and is also the thing a reader experiences.
//
// EXISTING PARTIES ARE FIXED. A curated colour that has shipped does not move because a new party arrived.

import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { deltaE } from "../../packages/mandate/src/viz/colour.ts";
import { oklch } from "../../packages/mandate/src/viz/colour.ts";
import { fillFor, partyKey } from "../../packages/mandate/src/viz/party-ink.ts";

const cfg = JSON.parse(readFileSync("data/party-ink.json", "utf8"));

/** The lightnesses a generated colour may use, from the config: 0.54-0.58 clears no ink at 4.5:1. */
const LEGAL = [0.52, 0.6, 0.66, 0.72, 0.78, 0.84];

/** Keys added in Phase 3 — everything the tuner may move. Read from the notes rather than listed twice. */
const NEW = process.argv.slice(2);

const db = new DatabaseSync(".data/registry.db", { readOnly: true });
const rows = db
  .prepare(
    `WITH newest AS (
       SELECT jurisdiction_place_id j, house, MAX(year) y FROM election
        WHERE kind IN ('assembly','general') GROUP BY 1, 2),
     el AS (
       SELECT e.id, e.jurisdiction_place_id j FROM election e
         JOIN newest n ON n.j = e.jurisdiction_place_id AND n.house = e.house AND n.y = e.year
        WHERE e.kind IN ('assembly','general'))
     SELECT el.id AS election,
            COALESCE(pt.id, NULLIF(cd.party_raw,''), 'unattached') AS k, COUNT(*) AS seats
       FROM el JOIN contest c ON c.election_id = el.id
            JOIN result r ON r.contest_id = c.id AND r.is_winner = 1
            JOIN candidacy cd ON cd.id = r.candidacy_id
            LEFT JOIN party_version pvv ON pvv.id = cd.party_version_id
            LEFT JOIN party pt ON pt.id = pvv.party_id
      GROUP BY 1, 2`,
  )
  .all();

/** One view per election: the parties a reader sees together in its legend. */
const views = new Map();
for (const r of rows) {
  if (!views.has(r.election)) views.set(r.election, []);
  views.get(r.election).push(partyKey(r.k));
}
// The national map's legend too: the party leading each jurisdiction's newest assembly.
const leaders = db
  .prepare(
    `WITH newest AS (SELECT jurisdiction_place_id j, MAX(year) y FROM election WHERE kind = 'assembly' GROUP BY 1),
     el AS (SELECT e.id, e.jurisdiction_place_id j FROM election e JOIN newest n ON n.j = e.jurisdiction_place_id AND n.y = e.year WHERE e.kind = 'assembly')
     SELECT el.j, COALESCE(pt.id, NULLIF(cd.party_raw,''), 'unattached') k, COUNT(*) n
       FROM el JOIN contest c ON c.election_id = el.id JOIN result r ON r.contest_id = c.id AND r.is_winner = 1
            JOIN candidacy cd ON cd.id = r.candidacy_id
            LEFT JOIN party_version pvv ON pvv.id = cd.party_version_id
            LEFT JOIN party pt ON pt.id = pvv.party_id
      GROUP BY 1, 2 ORDER BY el.j, n DESC`,
  )
  .all();
const perState = new Map();
for (const r of leaders) if (!perState.has(r.j)) perState.set(r.j, partyKey(r.k));
views.set("national-legend", [...new Set(perState.values())]);

/** Every pair that shares a view. */
const together = new Map();
for (const ks of views.values()) {
  const u = [...new Set(ks)];
  for (const a of u) {
    if (!together.has(a)) together.set(a, new Set());
    for (const b of u) if (a !== b) together.get(a).add(b);
  }
}

const hexOf = (e) => oklch(e.l, e.c, e.h);
const fixed = new Map();
for (const [k, e] of Object.entries(cfg.parties)) if (!NEW.includes(k)) fixed.set(k, hexOf(e));
// THE GENERATED REGISTER IS A PEER TOO. A curated colour has to separate from the hash's output as well as
// from the other curated ones — the first run of this missed that and put NCPSP 4.17 from ADAL, which is a
// one-seat party nobody will curate and whose colour is nonetheless fixed and known.
for (const ks of views.values()) {
  for (const k of ks) if (!fixed.has(k) && !NEW.includes(k)) fixed.set(k, fillFor(k));
}

// Most-constrained first: a party sharing a view with many others has the least room.
const order = [...NEW].filter((k) => cfg.parties[k] !== undefined).sort((a, b) => (together.get(b)?.size ?? 0) - (together.get(a)?.size ?? 0));
for (const k of NEW) if (cfg.parties[k] === undefined) console.log(`${k}  MISSING FROM CONFIG`);
const chosen = new Map(order.map((k) => [k, cfg.parties[k].l]));
for (const k of order) fixed.set(k, hexOf({ ...cfg.parties[k], l: chosen.get(k) }));

// SEVERAL PASSES, not one. A greedy pass places each party against whatever is already fixed, so the first
// party placed never sees the twentieth. Repeating until nothing moves lets every party see every peer.
for (let pass = 0; pass < 8; pass += 1) {
  let moved = 0;
  for (const k of order) {
    const e = cfg.parties[k];
    const peers = [...(together.get(k) ?? [])].filter((p) => p !== k).map((p) => fixed.get(p)).filter((h) => h !== undefined);
    let best = { l: chosen.get(k), score: -1 };
    for (const l of LEGAL) {
      const hex = hexOf({ ...e, l });
      const score = peers.length === 0 ? 99 : Math.min(...peers.map((h) => deltaE(hex, h, "normal")));
      if (score > best.score + 0.001) best = { l, score };
    }
    if (best.l !== chosen.get(k)) moved += 1;
    chosen.set(k, best.l);
    fixed.set(k, hexOf({ ...e, l: best.l }));
  }
  if (moved === 0) {
    console.log(`settled after ${pass} pass${pass === 1 ? "" : "es"}`);
    break;
  }
}
for (const k of order) {
  const peers = [...(together.get(k) ?? [])].filter((p) => p !== k).map((p) => fixed.get(p)).filter((h) => h !== undefined);
  const min = peers.length === 0 ? 99 : Math.min(...peers.map((h) => deltaE(fixed.get(k), h, "normal")));
  console.log(`${k}  ${cfg.parties[k].l} -> ${chosen.get(k)}  minΔE ${min.toFixed(1)}  peers ${peers.length}  ${fixed.get(k)}`);
}

// What the palette now guarantees inside a view.
let worst = { d: Infinity, pair: "", view: "" };
for (const [name, ks] of views) {
  const u = [...new Set(ks)].filter((k) => fixed.has(k));
  for (let i = 0; i < u.length; i += 1) {
    for (let j = i + 1; j < u.length; j += 1) {
      const d = deltaE(fixed.get(u[i]), fixed.get(u[j]), "normal");
      if (d < worst.d) worst = { d, pair: `${u[i]}/${u[j]}`, view: name };
    }
  }
}
console.log(`\nworst co-occurring pair: ${worst.pair} in ${worst.view} — ΔE ${worst.d.toFixed(2)}`);

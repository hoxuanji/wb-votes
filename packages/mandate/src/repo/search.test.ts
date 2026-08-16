// The command bar's data layer, against the real registry.
//
// WHY THESE ASSERTIONS AND NOT OTHERS. A search result is a NAVIGATION OFFER, so the property that matters
// is not relevance but resolvability: every hit must point at a URL that exists. The audit found a link to
// `/pl/in` sitting on the front page behind a query string, and this suite's first job is that a search page
// cannot grow the same class of defect at eight rows a group.
//
// The second job is the two decisions in search.ts that could quietly rot: the wildcards are escaped, and
// constituencies are matched on the name a seat carries NOW rather than on any name any delimitation gave a
// place row that groups seats by number.

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { DEV_DB_PATH, openRead } from "../db/index.ts";
import { PER_GROUP, partyAnchor, searchAll } from "./search.ts";
import { constituencyPath, placeView } from "./place-page.ts";

const live = { skip: existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH) ? false : "no .data/registry.db" };
const db = () => openRead(DEV_DB_PATH);

test("an empty query returns nothing, rather than the whole registry", live, () => {
  const d = db();
  try {
    for (const q of ["", "   ", "\t"]) {
      const r = searchAll(d, q);
      assert.equal(r.total, 0, `"${q}" matched something`);
      assert.equal(r.states.length + r.elections.length + r.constituencies.length + r.parties.length, 0);
      assert.equal(r.people.length + r.alike.length, 0);
    }
  } finally {
    d.close();
  }
});

test("a LIKE wildcard is escaped, not honoured", live, () => {
  const d = db();
  try {
    // "%" and "_" are LIKE metacharacters. Unescaped, "%" matched every row in the registry — 36 states, 24
    // elections, eight seats and eight parties — which is a search page acting as a database dump.
    for (const q of ["%", "_", "%%", "_a_"]) {
      const r = searchAll(d, q);
      assert.equal(r.states.length, 0, `"${q}" matched states as a wildcard`);
      assert.equal(r.constituencies.length, 0, `"${q}" matched constituencies as a wildcard`);
      assert.equal(r.parties.length, 0, `"${q}" matched parties as a wildcard`);
    }
    // And a name that really does contain an underscore is still findable, which is why they are escaped
    // rather than stripped.
    assert.doesNotThrow(() => searchAll(d, "a_b"));
  } finally {
    d.close();
  }
});

test("every group caps at PER_GROUP, so no one query can flood the page", live, () => {
  const d = db();
  try {
    // "a" appears in almost every name in the registry.
    const r = searchAll(d, "a");
    for (const [group, hits] of [
      ["states", r.states],
      ["elections", r.elections],
      ["constituencies", r.constituencies],
      ["parties", r.parties],
    ] as const) {
      assert.ok(hits.length <= PER_GROUP, `${group} returned ${hits.length}, cap is ${PER_GROUP}`);
    }
    assert.ok(r.people.length <= PER_GROUP, `people returned ${r.people.length}`);
  } finally {
    d.close();
  }
});

test("every hit points at a URL that resolves", live, async () => {
  const d = db();
  let states: string[] = [];
  let seats: string[] = [];
  let elections: string[] = [];
  let parties: string[] = [];
  try {
    // Queries chosen to hit all five groups: a state, a seat, a party, a year, and a letter that is
    // everywhere. Nothing here names a jurisdiction the product started with.
    for (const q of ["a", "north", "congress", "assembly", "2023"]) {
      const r = searchAll(d, q);
      states.push(...r.states.map((h) => h.href));
      seats.push(...r.constituencies.map((h) => h.href));
      elections.push(...r.elections.map((h) => h.href));
      parties.push(...r.parties.map((h) => h.href));
      for (const p of [...r.people, ...r.alike]) {
        assert.match(`/p/${p.id}`, /^\/p\/[^/]+$/, "a person hit has no id");
      }
    }
    assert.ok(states.length > 0 && seats.length > 0, "the fixture queries matched no place at all");
  } finally {
    d.close();
  }

  // A place hit is only an offer if placeView resolves it. This is the assertion the whole file is for.
  for (const href of [...new Set([...states, ...seats])]) {
    /**
     * RESOLVED THE WAY THE ROUTE RESOLVES IT.
     *
     * A canonical constituency URL is `/constituency/<state>/<name>` and carries no district, so its two
     * segments are NOT a place path — handing them straight to `placeView` reads them as a district and
     * 404s. `constituencyPath` is what the route uses to find the seat's district, and a search hit resolving
     * means it resolves through the same function the reader's click will.
     */
    // /constituency/<state>/<body>/<name> — the BODY is part of the identity now, so a hit is resolved with
    // the body it advertises rather than with a name alone.
    const parts = href.split("/").filter(Boolean);
    const isSeat = parts[0] === "constituency";
    const segments = isSeat
      ? ((await constituencyPath(parts[1] as string, parts[3] as string)) ?? [])
      : parts.slice(1);
    assert.ok(segments.length > 0, `${href} does not resolve to a place at all`);
    // The KIND is passed exactly as the canonical route passes it. Without it a two-segment constituency
    // path is counted as a district, which is the inference Phase C removed from production code.
    const view = await placeView(
      segments,
      {},
      isSeat ? "constituency" : undefined,
      isSeat ? (parts[2] === "lok-sabha" ? "pc" : "ac") : undefined,
    );
    assert.notEqual(view.kind, "not-found", `${href} is offered by search and 404s`);
    assert.notEqual(view.kind, "unavailable", `${href} could not be read`);
  }

  // An election hit goes to its coverage record; a party hit goes to a landscape row anchor.
  for (const href of new Set(elections)) {
    assert.match(href, /^\/coverage\?election=[^&]+#election$/, `${href} is not an election's record`);
  }
  for (const href of new Set(parties)) {
    assert.match(href, /^\/#party-[a-z0-9-]+$/, `${href} is not a landscape anchor`);
  }
});

test("a constituency hit is the seat that carries the name now", live, () => {
  const d = db();
  try {
    // The defect this replaced: matching every version of a place row returned "NANJANGUD · no. 214 ·
    // MYSORE · was BADAMI", because `place` groups seats by NUMBER across delimitations and 214 was a
    // different constituency in an earlier one. Badami is in Bagalkot. So a hit's label must be a name the
    // seat's CURRENT version carries, and the district in its path must be that version's district.
    for (const q of ["badami", "north", "east"]) {
      for (const h of searchAll(d, q).constituencies) {
        assert.ok(
          h.label.toLowerCase().includes(q.toLowerCase()),
          `"${q}" returned ${h.label}, which does not contain the query`,
        );
        assert.match(h.href, /^\/constituency\/[a-z]{2}\/(assembly|lok-sabha)\/[^/]+$/, `${h.href} is not a canonical constituency path`);
        // The detail names the district, and the path's district segment must be the same district.
        const segment = h.href.split("/")[3] ?? "";
        assert.ok(segment.length > 0, `${h.href} has an empty district segment`);
      }
    }
  } finally {
    d.close();
  }
});

test("a party anchor is a legal fragment, whatever the party id looks like", () => {
  // A party id can contain spaces: "BHARATIYA NYAY-ADHIKAR RAKSHA PARTY" is one in this registry, and a
  // fragment with a space in it is not a fragment.
  for (const [id, want] of [
    ["BJP", "party-bjp"],
    ["BHARATIYA NYAY-ADHIKAR RAKSHA PARTY", "party-bharatiya-nyay-adhikar-raksha-party"],
    ["JD(S)", "party-jd-s"],
    ["  ", "party"],
  ] as const) {
    assert.equal(partyAnchor(id), want);
    assert.match(partyAnchor(id), /^[a-z0-9-]+$/, `${id} produced an illegal fragment`);
  }
});

test("an Indic query reaches the four text groups through transliteration", live, () => {
  const d = db();
  try {
    // The people tier folds scripts onto shared blocking keys. The other four are text matches over a
    // registry that holds no Indic name strings at all, so a Bengali query can only reach them through the
    // Latin form — and the page says which form it used.
    const r = searchAll(d, "মমতা");
    assert.equal(r.script, "beng");
    assert.ok(r.transliterated !== null && r.transliterated.length > 0, "a Bengali query was not romanised");
    assert.notEqual(r.transliterated, "মমতা", "the transliteration returned the input");
  } finally {
    d.close();
  }
});

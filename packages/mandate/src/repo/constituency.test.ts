import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { DEV_DB_PATH, openRead } from "../db/open.ts";
import { all } from "../db/index.ts";
import { constituenciesNamed, constituencyPath, placeView } from "./place-page.ts";
import { constituencyHref } from "./routes.ts";
import { searchAll } from "./search.ts";
import { getPersonBrief } from "./person.ts";

const HAVE = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const live = { skip: HAVE ? false : "no .data/registry.db" };
const db = HAVE ? openRead() : (null as unknown as ReturnType<typeof openRead>);

/**
 * ONE CONSTITUENCY ARCHITECTURE, TWO BODIES.
 *
 * The measure of this phase is not that a parliamentary constituency has a page. It is that an assembly seat
 * and a parliamentary seat travel the SAME resolver, the same view type and the same renderer, and differ
 * only in data. So every assertion below runs over both bodies from one loop: if the two ever needed separate
 * handling, this file could not be written this way.
 *
 * Fixtures are discovered. Nothing here names a state.
 */
type Seat = { j: string; name: string; kind: string; epoch: string; drawn: number };

function seats(kind: "ac" | "pc", sql: string, ...binds: (string | number)[]): Seat[] {
  return all<Seat>(
    db,
    `SELECT pv.jurisdiction_id AS j, pv.canonical_name AS name, pv.kind AS kind, pv.epoch_id AS epoch,
            (SELECT COUNT(*) FROM place_geometry pg WHERE pg.place_version_id = pv.id) AS drawn
       FROM place_version pv
       JOIN boundary_epoch be ON be.id = pv.epoch_id
      WHERE pv.kind = ? AND pv.jurisdiction_id IS NOT NULL
        -- UNAMBIGUOUS NAMES ONLY. 335 of 606 parliamentary seats share a name with an assembly seat in the
        -- same state and delimitation, so a two-segment URL cannot resolve the body for them. See the
        -- collision test below: that is a recorded blocker, not something these fixtures should paper over.
        AND NOT EXISTS (
          SELECT 1 FROM place_version o
           WHERE o.jurisdiction_id = pv.jurisdiction_id AND o.kind <> pv.kind
             AND LOWER(o.canonical_name) = LOWER(pv.canonical_name))
        ${sql}`,
    kind,
    ...binds,
  );
}

/** The newest version of a seat of each body, in a jurisdiction of a given size rank. */
function bySize(kind: "ac" | "pc", pick: "smallest" | "largest"): Seat | undefined {
  const sized = all<{ j: string; n: number }>(
    db,
    `SELECT jurisdiction_id AS j, COUNT(DISTINCT place_id) AS n FROM place_version
      WHERE kind = ? AND jurisdiction_id IS NOT NULL GROUP BY jurisdiction_id ORDER BY n`,
    kind,
  );
  const j = (pick === "smallest" ? sized[0] : sized.at(-1))?.j;
  if (j === undefined) return undefined;
  return seats(kind, "AND pv.jurisdiction_id = ? ORDER BY be.effective_from DESC, pv.number LIMIT 1", j)[0];
}

test("a parliamentary and an assembly seat resolve through the same code path", live, async () => {
  const cases = [
    bySize("ac", "smallest"),
    bySize("ac", "largest"),
    bySize("pc", "smallest"),
    bySize("pc", "largest"),
    // WITH and WITHOUT geometry, since a page must not depend on a map existing.
    seats("pc", "AND EXISTS (SELECT 1 FROM place_geometry g WHERE g.place_version_id = pv.id) LIMIT 1")[0],
    seats("pc", "AND NOT EXISTS (SELECT 1 FROM place_geometry g WHERE g.place_version_id = pv.id) LIMIT 1")[0],
  ].filter((x): x is Seat => x !== undefined);
  assert.ok(cases.length >= 5, `only ${cases.length} discovered fixtures`);
  assert.ok(cases.some((c) => c.kind === "pc"), "no parliamentary fixture discovered");
  assert.ok(cases.some((c) => c.kind === "ac"), "no assembly fixture discovered");

  for (const c of cases) {
    const slug = c.name.trim().toLowerCase().replace(/\s+/g, "-");
    // 1 — THE SAME RESOLVER. `constituencyPath` takes a jurisdiction and a name for either body; a pc has no
    //     district, and the resolver no longer needs one.
    const segments = await constituencyPath(c.j, slug);
    assert.ok(segments !== null, `${c.kind} ${c.j}/${slug} did not resolve`);
    assert.equal(segments.length, 2, `${c.j}/${slug} resolved to ${segments.length} segments`);

    // 2 — THE SAME VIEW TYPE. Not a parent view: a pc used to resolve correctly and then be handed to the
    //     state/district renderer, so 606 Lok Sabha seats rendered as their own state's assembly page.
    const view = await placeView(segments, {}, "constituency");
    assert.equal(view.kind, "ac", `${c.j}/${slug} (${c.kind}) is not served as a constituency`);
    if (view.kind !== "ac") continue;

    // 3 — AND THE BODY IS DATA THE SURFACE CAN READ, which is what keeps it one renderer.
    assert.equal(view.brief.place.kind, c.kind, `${c.j}/${slug} reports the wrong body`);
    assert.ok(view.brief.place.canonicalName.length > 0);
    // A pc has no district; an ac does. Asserted rather than assumed, because it is the difference that
    // forced the district out of the canonical URL.
    if (c.kind === "pc") {
      assert.equal(view.brief.place.districtId, null, `${c.j}/${slug} is a pc with a district`);
    }
    // 4 — MISSING GEOMETRY IS NOT A BROKEN PAGE. Two of the fixtures have none by construction.
    assert.ok(view.brief.contests.length >= 0);
    assert.equal(
      constituencyHref({ jurisdictionId: c.j, kind: c.kind, canonicalName: c.name }),
      `/constituency/${c.j}/${c.kind === "pc" ? "lok-sabha" : "assembly"}/${slug}`,
    );
  }
});

test("a parliamentary seat carries its own election history, epoch by epoch", live, () => {
  // A pc place id spans up to six delimitations, and the registry holds 2,065 pc versions over 606 ids. A
  // page must show the seat's own run without joining two delimitations into one series.
  const multi = all<{ id: string; epochs: number }>(
    db,
    `SELECT place_id AS id, COUNT(DISTINCT epoch_id) AS epochs FROM place_version
      WHERE kind = 'pc' GROUP BY place_id HAVING epochs > 1 ORDER BY epochs DESC LIMIT 1`,
  )[0];
  assert.ok(multi, "no parliamentary seat spans more than one delimitation");
  assert.ok(multi.epochs > 1);

  // Contests attach to a place_VERSION, so a seat's history is already partitioned by epoch in the data. If
  // that ever stops being true, a page could silently present two delimitations as one seat's record.
  const perEpoch = all<{ epoch: string; contests: number }>(
    db,
    `SELECT pv.epoch_id AS epoch, COUNT(c.id) AS contests
       FROM place_version pv LEFT JOIN contest c ON c.place_version_id = pv.id
      WHERE pv.place_id = ? GROUP BY pv.epoch_id`,
    multi.id,
  );
  assert.ok(perEpoch.length > 1, `${multi.id} does not separate its epochs`);
});

test("a constituency name does not identify its body, so the URL cannot either", live, () => {
  /**
   * THE ARCHITECTURAL BLOCKER OF THIS PHASE, measured rather than argued.
   *
   * Phase C chose `/constituency/<state>/<name>` on the reasoning that a name is unique within a state. It is
   * not unique across BODIES: in Uttar Pradesh, Saharanpur is `up.ac.004` AND `up.pc.001` in the same
   * delimitation. 335 of 606 parliamentary seats — 55% — collide this way in the current delimitation, and
   * 1,372 collide across all six.
   *
   * So the route resolves an ambiguous name to whichever version sorts first, which is the silent resolution
   * to a different entity that Phase C existed to remove. The brief permits a body-bearing URL only if the
   * domain proves a single slug cannot resolve the body. This is that proof.
   *
   * This test pins the measurement so the decision is not re-litigated from memory, and fails if the shape of
   * the problem changes.
   */
  const collisions = all<{ n: number }>(
    db,
    `SELECT COUNT(*) AS n FROM (
       SELECT jurisdiction_id AS j, LOWER(canonical_name) AS n FROM place_version
        WHERE kind = 'ac' AND jurisdiction_id IS NOT NULL AND epoch_id = 'delim-2008'
       INTERSECT
       SELECT jurisdiction_id, LOWER(canonical_name) FROM place_version
        WHERE kind = 'pc' AND jurisdiction_id IS NOT NULL AND epoch_id = 'delim-2008')`,
  )[0]?.n;
  assert.ok(
    collisions !== undefined && collisions > 100,
    `only ${collisions} name collisions — if this has dropped, revisit whether the URL still needs a body`,
  );
});

test("the registry cannot express assembly segments of a parliamentary seat", live, () => {
  /**
   * A CAPABILITY GAP, RECORDED RATHER THAN FAKED.
   *
   * "Assembly segments" needs an explicit ac -> pc containment relationship. `place_version_link` holds
   * `derived_from` and `name_match` only, and ZERO links cross between bodies. Nothing else in the schema
   * relates the two.
   *
   * The alternatives are all fabrication: matching on names, on current district membership, or on geometry
   * overlap — none of which any source asserts. So the section is not built, and this test pins the reason.
   * When a cited segment mapping is ingested, this test fails and that is the signal to build it.
   */
  const cross = all<{ n: number }>(
    db,
    `SELECT COUNT(*) AS n FROM place_version_link l
       JOIN place_version a ON a.id = l.from_place_version_id
       JOIN place_version b ON b.id = l.to_place_version_id
      WHERE a.kind <> b.kind`,
  )[0]?.n;
  assert.equal(cross, 0, "a cross-body relationship now exists — build the assembly-segments section");
});

test("same name, same state, different body: two distinct entities, always", live, async () => {
  /**
   * THE CENTRAL CONTRACT OF PHASE D.1, over EVERY collision the registry holds rather than one example.
   *
   * A name identifies a seat within a state only if the body is fixed. It is not: 335 of 606 parliamentary
   * seats share a name with an assembly seat in the same state and current delimitation. The pre-body URL
   * answered with whichever version sorted first, so more than half of India's Lok Sabha seats had a
   * canonical URL that returned a different office.
   *
   * Collisions are DISCOVERED. Saharanpur is not named here.
   */
  const collisions = all<{ j: string; name: string }>(
    db,
    `SELECT a.jurisdiction_id AS j, a.canonical_name AS name
       FROM place_version a
      WHERE a.kind = 'ac' AND a.epoch_id = 'delim-2008' AND a.jurisdiction_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM place_version b
                     WHERE b.kind = 'pc' AND b.epoch_id = 'delim-2008'
                       AND b.jurisdiction_id = a.jurisdiction_id
                       AND LOWER(b.canonical_name) = LOWER(a.canonical_name))
      GROUP BY a.jurisdiction_id, LOWER(a.canonical_name)
      ORDER BY a.jurisdiction_id, a.canonical_name
      LIMIT 12`,
  );
  assert.ok(collisions.length >= 5, `only ${collisions.length} collisions discovered`);

  for (const c of collisions) {
    const slug = c.name.trim().toLowerCase().replace(/\s+/g, "-");
    const ac = await placeView([c.j, slug], {}, "constituency", "ac");
    const pc = await placeView([c.j, slug], {}, "constituency", "pc");
    assert.equal(ac.kind, "ac", `${c.j}/assembly/${slug} did not resolve`);
    assert.equal(pc.kind, "ac", `${c.j}/lok-sabha/${slug} did not resolve`);
    if (ac.kind !== "ac" || pc.kind !== "ac") continue;

    // 1 — DIFFERENT ENTITIES. Not two views of one thing.
    assert.notEqual(ac.brief.place.id, pc.brief.place.id, `${c.j}/${slug} resolved to one place for both bodies`);
    // 2 — AND EACH IS THE BODY THAT WAS ASKED FOR. The failure this replaces was answering with the other.
    assert.equal(ac.brief.place.kind, "ac", `${c.j}/assembly/${slug} answered with a ${ac.brief.place.kind}`);
    assert.equal(pc.brief.place.kind, "pc", `${c.j}/lok-sabha/${slug} answered with a ${pc.brief.place.kind}`);
    // 3 — AND THE URLS ROUND-TRIP: the href each entity builds resolves back to that entity.
    assert.equal(constituencyHref(ac.brief.place).split("/")[3], "assembly");
    assert.equal(constituencyHref(pc.brief.place).split("/")[3], "lok-sabha");
  }
});

test("the pre-body URL asks rather than choosing, and resolves when it is unambiguous", live, async () => {
  // AMBIGUOUS: both bodies exist, so `constituenciesNamed` returns two and the route offers a choice.
  const collide = all<{ j: string; name: string }>(
    db,
    `SELECT a.jurisdiction_id AS j, a.canonical_name AS name FROM place_version a
      WHERE a.kind = 'ac' AND a.jurisdiction_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM place_version b WHERE b.kind = 'pc'
                     AND b.jurisdiction_id = a.jurisdiction_id
                     AND LOWER(b.canonical_name) = LOWER(a.canonical_name))
      LIMIT 1`,
  )[0];
  assert.ok(collide, "no collision to test");
  const both = await constituenciesNamed(collide.j, collide.name.toLowerCase().replace(/\s+/g, "-"));
  assert.equal(both.length, 2, `expected two bodies, got ${both.length}`);
  assert.deepEqual([...both.map((b) => b.kind)].sort(), ["ac", "pc"]);

  // UNAMBIGUOUS: one body only, so the old URL has exactly one correct destination and may redirect.
  const unique = all<{ j: string; name: string }>(
    db,
    `SELECT a.jurisdiction_id AS j, a.canonical_name AS name FROM place_version a
      WHERE a.kind = 'pc' AND a.jurisdiction_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM place_version b WHERE b.kind = 'ac'
                         AND b.jurisdiction_id = a.jurisdiction_id
                         AND LOWER(b.canonical_name) = LOWER(a.canonical_name))
      LIMIT 1`,
  )[0];
  assert.ok(unique, "no unambiguous parliamentary name");
  const one = await constituenciesNamed(unique.j, unique.name.toLowerCase().replace(/\s+/g, "-"));
  assert.equal(one.length, 1, `${unique.j}/${unique.name} is not unambiguous after all`);
  assert.equal(one[0]?.kind, "pc");

  // AND A NAME THAT IS NEITHER resolves to nothing — never to the state.
  assert.deepEqual(await constituenciesNamed(collide.j, "no-such-constituency-zzzz"), []);
});

test("a parliamentary seat is searchable, and its state is its jurisdiction", live, async () => {
  /**
   * TWO DEFECTS, both of which made a Lok Sabha seat unreachable through search.
   *
   *   1. Search required a district and returned null without one. No pc HAS a district —
   *      `district_place_id` is NULL on all 2,065 versions — so every pc hit was silently dropped.
   *   2. And the state was derived from the district's parent, which for a pc resolves to the nation, so the
   *      one URL it did build named the country as the state.
   *
   * Both are the same mistake: treating an assembly seat's ancestry as every seat's ancestry. The authoritative
   * jurisdiction is `place_version.jurisdiction_id`, which both bodies carry.
   */
  const pc = all<{ j: string; name: string }>(
    db,
    `SELECT pv.jurisdiction_id AS j, pv.canonical_name AS name
       FROM place_version pv
      WHERE pv.kind = 'pc' AND pv.district_place_id IS NULL AND pv.jurisdiction_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM contest c WHERE c.place_version_id = pv.id)
      ORDER BY pv.id LIMIT 4`,
  );
  assert.ok(pc.length > 0, "no districtless parliamentary seat with a contest");

  for (const seat of pc) {
    const hits = searchAll(db, seat.name, 20);
    const places = hits.constituencies.filter((h) => h.href.startsWith("/constituency/"));
    const mine = places.find((h) => h.href.includes("/lok-sabha/"));
    assert.ok(mine, `${seat.j}/${seat.name}: search offered no parliamentary constituency`);

    const parts = mine.href.split("/").filter(Boolean);
    // 1 — THE STATE IS THE JURISDICTION, and never the nation.
    assert.equal(parts[1], seat.j, `${mine.href} does not carry its own jurisdiction`);
    assert.notEqual(parts[1], "in", `${mine.href} names the country as a state`);
    // 2 — AND THE BODY IS IN THE URL.
    assert.equal(parts[2], "lok-sabha");

    // 3 — AND IT RESOLVES, to a pc and not to an assembly seat of the same name.
    const segments = await constituencyPath(parts[1] as string, parts[3] as string);
    assert.ok(segments !== null, `${mine.href} does not resolve`);
    const view = await placeView(segments, {}, "constituency", "pc");
    assert.equal(view.kind, "ac");
    if (view.kind === "ac") assert.equal(view.brief.place.kind, "pc", `${mine.href} resolved to an assembly seat`);
  }
});

test("no constituency URL names the country as its state, either body", live, () => {
  // THE INVARIANT, over every seat with a contest rather than a sample. A jurisdiction_id of 'in' would mean
  // a constituency whose state is India, which the model should make impossible.
  const bad = all<{ n: number }>(
    db,
    `SELECT COUNT(*) AS n FROM place_version
      WHERE kind IN ('ac', 'pc')
        AND (jurisdiction_id IS NULL OR jurisdiction_id = 'in')
        AND EXISTS (SELECT 1 FROM contest c WHERE c.place_version_id = place_version.id)`,
  )[0]?.n;
  assert.equal(bad, 0, `${bad} contested constituencies have no state, or claim the country as one`);
});

test("no parliamentary seat has been given a district", live, () => {
  /**
   * A REGRESSION GUARD ON AN ABSENCE. The registry asserts no pc -> district relationship, and the honest
   * consequence is that a Lok Sabha seat has no district in this product. The tempting fixes — a name match, a
   * geometry overlap, the place row's parent — are all fabrication, and one of them was already in the code:
   * `districtId` fell back to `place.parent_id`, so every pc inherited a district no source states.
   */
  const fabricated = all<{ n: number }>(
    db,
    `SELECT COUNT(*) AS n FROM place_version WHERE kind = 'pc' AND district_place_id IS NOT NULL`,
  )[0]?.n;
  assert.equal(fabricated, 0, `${fabricated} parliamentary seats have acquired a district`);
});

test("a person's page reaches the constituency they contested, with the right body", live, () => {
  /**
   * NO MIGRATION WAS NEEDED. The audit proposed adding `candidacy.jurisdiction_id`; the relation already
   * exists through candidacy -> contest -> place_version, which is where a contest's seat is recorded. The
   * jurisdiction and the body both come from there, so the link is authoritative rather than inferred.
   */
  const person = all<{ id: string }>(
    db,
    `SELECT ca.person_id AS id FROM candidacy ca
       JOIN contest c ON c.id = ca.contest_id
       JOIN place_version pv ON pv.id = c.place_version_id
      WHERE pv.kind = 'pc' AND pv.jurisdiction_id IS NOT NULL LIMIT 1`,
  )[0]?.id;
  assert.ok(person, "no person contested a parliamentary seat");
  const brief = getPersonBrief(db, person);
  assert.ok(brief);
  const latest = brief.candidacies.at(0);
  assert.ok(latest, `${person} has no candidacy`);
  assert.ok(latest.jurisdictionId !== null, `${person}'s latest contest has no jurisdiction`);
  assert.ok(latest.placeKind === "ac" || latest.placeKind === "pc", `unexpected body ${latest.placeKind}`);
  const href = constituencyHref({
    jurisdictionId: latest.jurisdictionId,
    kind: latest.placeKind,
    canonicalName: latest.placeName,
  });
  assert.match(href, /^\/constituency\/[a-z]{2}\/(assembly|lok-sabha)\/.+/, `${person} built ${href}`);
  assert.ok(!href.includes("/in/"), `${person} links to a constituency of the country`);
});

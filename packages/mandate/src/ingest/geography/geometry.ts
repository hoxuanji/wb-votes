// Electoral geometry, from a declared source into `place_geometry`, deterministically.
//
// Phase 3 stage 3. The pipeline is discover → fetch → inspect → validate → import, and `inspect` does all
// the deciding: it reads a dataset declared in `data/geo/sources.json`, resolves each polygon to a
// jurisdiction, a boundary epoch and a `place_version`, validates what it resolved, and returns a report.
// `import` writes exactly what the report says and nothing else, so a dry run and a real run cannot differ.
//
// ── THE ONLY THING THAT MATTERS: NEVER THE WRONG GEOMETRY ──
//
// A polygon is written against a `place_version_id`, and a version belongs to exactly one boundary epoch.
// So getting the version right IS getting the epoch right, and there is no separate check to forget. What
// this module has to do is refuse to guess, and it refuses in three ways.
//
// 1. THE EPOCH COMES FROM THE SOURCE'S OWN DECLARATION, confirmed by the data. The dataset carries
//    `STATUS = "Pre delimitation"` per feature for the six states whose boundaries predate DPACO 2008, and
//    the manifest maps that to a side of 2008-02-19. Intersect with the epochs the registry actually holds
//    contests for, and one epoch usually remains. Where several do, they are scored by how many
//    constituencies match on NUMBER AND NAME, and a winner has to be both good enough and clearly ahead —
//    otherwise the whole jurisdiction is left alone.
//
// 2. ONE POLYGON MAY SERVE TWO EPOCHS, BUT ONLY WHERE THE ORDER SAYS SO. DPACO 2008 reproduced Assam's,
//    Arunachal's, Manipur's, Nagaland's and J&K's constituencies from the earlier orders, verbatim, and said
//    so in its own Part notes. Phase 1.5 wrote that into `place_version_link` as 418 `derived_from` rows
//    with the order's words as the basis. So this module follows those links: match a polygon to the 1976
//    version and the 2008 version gets it too, BECAUSE THE ORDER SAYS THEY ARE THE SAME CONSTITUENCY.
//    Jharkhand has no such link — its 2008 boundaries really are different — and so its pre-2008 polygons
//    stay on the pre-2008 epoch and its current map stays unavailable. No state list anywhere: the registry's
//    own citations decide.
//
// 3. FUZZY MATCHING NEVER DECIDES IDENTITY. Five tiers, in order, each one a pair of independent keys
//    agreeing — never a score over a threshold:
//
//      number + name            both keys agree
//      number + truncated name  the source's name is a prefix of the registry's (its field truncates)
//      number + phonetic name   the same seat spelled differently — and the NUMBER already agreed
//      name, unique in epoch    the registry's numbering disagrees with the source's; recorded as such
//      name + number tie-break  the name is ambiguous and exactly one candidate carries the source's number
//
//    Anything else is STAGED: reported with its reason, and not written. West Bengal is why the fourth tier
//    exists and why the third one is anchored on the number: two sources numbered that state's 2008 epoch
//    differently, so a name-only match is sometimes the only true one and a number-only match would attach
//    Kumarganj's boundary to Gangarampur.

import type { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { all, get, insertMany } from "../../db/index.ts";
import { phoneticKey } from "../../core/indic/index.ts";
import { boxOfRings, pathOfRings, project, ringArea, ringsOf, simplifyRing } from "./project.ts";

/** Half the detail of the national basemap: a constituency is drawn at state scale, not country scale. */
const TOLERANCE = 0.03;

/** DPACO 2008's publication date, which is the line the source's `STATUS` field divides. */
const DPACO_2008 = "2008-02-19";

/** How far outside the basemap's state box a polygon may fall before it is refused, in projected units. */
const CONTAINMENT_SLACK = 6;

export type Dataset = {
  id: string;
  house: "ac" | "pc";
  form: string;
  publisher: string;
  title: string;
  url: string;
  file: string;
  sha256: string;
  bytes: number;
  licence: string;
  publishedOn: string | null;
  fields: { state: string; number: string; name: string; district?: string };
  epochField: string | null;
  epochWhen: Record<string, "before-dpaco-2008" | "after-dpaco-2008">;
  jurisdictions: Record<string, string[] | string>;
  caveats: string[];
};

export type Manifest = { projection: Record<string, number | string>; datasets: Dataset[] };

/** One constituency of the source, after its features are merged and projected. */
export type Candidate = {
  sourceKey: string;
  number: number;
  name: string;
  district: string | null;
  /** Features merged into this one constituency. >1 is a legitimate multipart seat. */
  polygons: number;
  path: string;
  box: [number, number, number, number];
  centroid: { x: number; y: number };
  /** Sum of |ring area| in projected units². Used only for outlier reporting. */
  area: number;
  points: number;
  /** Rings that closed onto themselves at a repeated vertex — a pinch. Reported, never fixed silently. */
  pinches: number;
  /**
   * Which side of DPACO 2008 the SOURCE says this constituency is on, read from its own epoch field and
   * carried here so nothing has to go back to the features to ask. Going back was an O(features²) scan:
   * 44 seconds for one state.
   */
  side: "before-dpaco-2008" | "after-dpaco-2008";
};

export type Tier =
  | "number+name"
  | "number+truncated"
  | "number+phonetic"
  | "name-unique"
  | "name+number-tiebreak";

export type Link = {
  candidate: Candidate;
  jurisdictionId: string;
  /** The version the source's own keys resolved to. */
  versionId: number;
  epochId: string;
  tier: Tier;
  /** Versions in OTHER epochs that the registry's `derived_from` links say are this same constituency. */
  restated: { versionId: number; epochId: string; basis: string }[];
};

export type Staged = {
  sourceKey: string;
  number: number;
  name: string;
  jurisdictionId: string | null;
  reason:
    | "no-jurisdiction"
    | "no-epoch"
    | "epoch-ambiguous"
    | "no-version"
    | "ambiguous-jurisdiction"
    | "empty-geometry"
    | "outside-jurisdiction"
    | "duplicate-path";
  detail: string;
};

export type JurisdictionReport = {
  sourceKey: string;
  jurisdictionId: string;
  jurisdictionName: string;
  candidates: number;
  side: "before-dpaco-2008" | "after-dpaco-2008";
  /** Every epoch the registry holds contests for, on the declared side. */
  offered: { epochId: string; seats: number; score: number }[];
  epochId: string | null;
  decision: "RESOLVED" | "RESOLVED_BY_DECLARATION" | "AMBIGUOUS" | "NO_EPOCH";
  why: string;
  seats: number;
  linked: number;
  restated: number;
  staged: number;
  tiers: Partial<Record<Tier, number>>;
};

export type Finding = { kind: string; n: number; examples: string[] };

export type InspectReport = {
  datasetId: string;
  house: "ac" | "pc";
  features: number;
  /** Features with no constituency identity at all. Dropped, and counted here. */
  unusable: number;
  candidates: number;
  multipart: number;
  jurisdictions: JurisdictionReport[];
  links: Link[];
  staged: Staged[];
  findings: Finding[];
  totals: { seats: number; linked: number; restated: number; staged: number; points: number };
};

// ── keys ──────────────────────────────────────────────────────────────────────

/** A constituency name reduced for comparison. Reservation tags go, and so does everything after them. */
export function seatKey(name: string): string {
  return String(name)
    .normalize("NFKD")
    // From the FIRST bracket to the end — balanced or not. The source truncates its own names, so
    // "Kilvaithinankuppam(SC" arrives with an unclosed bracket and a paired-bracket regex leaves the "SC"
    // behind, which then fails a comparison it should have passed.
    .replace(/[([].*$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const norm = (s: string): string => s.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");

// ── reading the source ────────────────────────────────────────────────────────

type Feature = { properties: Record<string, unknown>; geometry: unknown };

/**
 * Features to candidates: group by (state, number, name), project, simplify, merge.
 *
 * MULTIPART CONSTITUENCIES ARE MERGED, NOT REJECTED. Assam ships 133 features for 126 seats and Maharashtra
 * 302 for 288, because an island or an exclave is its own feature. Those are one constituency with several
 * polygons, which is exactly what an SVG path with several subpaths is for.
 */
export function candidatesOf(dataset: Dataset, features: readonly Feature[]): { candidates: Candidate[]; unusable: number } {
  const f = dataset.fields;
  const groups = new Map<string, { c: Omit<Candidate, "path" | "box" | "centroid" | "area" | "points" | "pinches">; rings: [number, number][][]; pinches: number; points: number }>();
  let unusable = 0;

  for (const feat of features) {
    const p = feat.properties;
    const state = String(p[f.state] ?? "");
    const number = Number(p[f.number]);
    const name = String(p[f.name] ?? "");
    // No number, no name: an unassigned sliver. There is no constituency here to attach anything to.
    if (state === "" || !Number.isInteger(number) || number <= 0 || name === "") {
      unusable += 1;
      continue;
    }
    const status = dataset.epochField === null ? "" : String(p[dataset.epochField] ?? "");
    const key = `${state}|${number}|${seatKey(name)}`;
    const at =
      groups.get(key) ??
      {
        c: {
          sourceKey: state,
          number,
          name,
          district: f.district === undefined ? null : (String(p[f.district] ?? "") || null),
          polygons: 0,
          side: dataset.epochWhen[status] ?? "after-dpaco-2008",
        },
        rings: [],
        pinches: 0,
        points: 0,
      };
    for (const ring of ringsOf(feat.geometry as { type?: string; coordinates?: unknown })) {
      at.points += ring.length;
      const simple = simplifyRing(ring.map((pt) => project(pt as [number, number])), TOLERANCE);
      if (simple.length < 3) continue;
      // A vertex repeated inside a ring is a pinch: the polygon touches itself. Counted and reported,
      // never "fixed" — a silent repair to a boundary is a change to a boundary.
      const seen = new Set<string>();
      for (const [x, y] of simple) {
        const k = `${x.toFixed(2)},${y.toFixed(2)}`;
        if (seen.has(k)) {
          at.pinches += 1;
          break;
        }
        seen.add(k);
      }
      at.rings.push(simple);
    }
    at.c.polygons += 1;
    groups.set(key, at);
  }

  const candidates: Candidate[] = [];
  for (const g of groups.values()) {
    const rings = g.rings;
    const box = boxOfRings(rings);
    const areas = rings.map((r) => Math.abs(ringArea(r)));
    const big = areas.indexOf(Math.max(...areas, 0));
    const ring = rings[big];
    candidates.push({
      ...g.c,
      path: pathOfRings(rings),
      box,
      centroid: ring === undefined ? { x: 0, y: 0 } : centroidOf(ring),
      area: areas.reduce((a, b) => a + b, 0),
      points: rings.reduce((n, r) => n + r.length, 0),
      pinches: g.pinches,
    });
  }
  return { candidates, unusable };
}

/** Area-weighted centroid of one ring, which is the point a reader would put a label on. */
function centroidOf(ring: readonly [number, number][]): { x: number; y: number } {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i] as [number, number];
    const [x2, y2] = ring[(i + 1) % ring.length] as [number, number];
    const cross = x1 * y2 - x2 * y1;
    a += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (a === 0) {
    const [x, y] = ring[0] as [number, number];
    return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
  }
  return { x: Number((cx / (3 * a)).toFixed(1)), y: Number((cy / (3 * a)).toFixed(1)) };
}

// ── the basemap, for the containment check ────────────────────────────────────

type Basemap = { viewBox: string; states: Record<string, { box: number[] }> };

let basemap: Basemap | null = null;
function loadBasemap(): Basemap {
  basemap ??= JSON.parse(
    readFileSync(fileURLToPath(new URL("../../../../../data/geo/india-states.json", import.meta.url)), "utf8"),
  ) as Basemap;
  return basemap;
}

/**
 * The shared coordinate space, declared on every row.
 *
 * It is the SPACE, not a clip: the basemap is census district outlines and this is ECI constituency
 * outlines, so a coastal polygon may fall a fraction outside. `view_box` exists so a consumer that overlays
 * two geometry sets can check they agree about the plane before drawing them together.
 */
export function sharedViewBox(): string {
  return loadBasemap().viewBox;
}

/** The basemap's box for a jurisdiction, matched on its registry name. Null where the basemap has none. */
function basemapBox(name: string): [number, number, number, number] | null {
  const want = norm(name);
  for (const [k, v] of Object.entries(loadBasemap().states)) {
    if (norm(k) === want) return v.box as [number, number, number, number];
  }
  return null;
}

// ── inspect ───────────────────────────────────────────────────────────────────

type Version = { id: number; number: number | null; name: string; epochId: string };

/**
 * Everything the import will do, decided and reported, with nothing written.
 *
 * `only` narrows to a set of jurisdiction ids, which is how the phase imported one state, then four, then
 * the rest: the same code path every time, with a smaller argument.
 */
export function inspectGeometry(
  db: DatabaseSync,
  dataset: Dataset,
  features: readonly Feature[],
  opts: { only?: readonly string[] } = {},
): InspectReport {
  const { candidates, unusable } = candidatesOf(dataset, features);
  const byKey = new Map<string, Candidate[]>();
  for (const c of candidates) byKey.set(c.sourceKey, [...(byKey.get(c.sourceKey) ?? []), c]);

  const places = all<{ id: string; name: string }>(
    db,
    `SELECT id, canonical_name AS name FROM place WHERE kind IN ('state','ut')`,
  );
  const epochFrom = new Map(
    all<{ id: string; f: string }>(db, `SELECT id, effective_from AS f FROM boundary_epoch`).map((r) => [r.id, r.f]),
  );

  const wanted = opts.only === undefined ? null : new Set(opts.only);

  const jurisdictions: JurisdictionReport[] = [];
  const links: Link[] = [];
  const staged: Staged[] = [];
  const findings = new Map<string, { n: number; examples: string[] }>();
  const note = (kind: string, example: string): void => {
    const at = findings.get(kind) ?? { n: 0, examples: [] };
    at.n += 1;
    if (at.examples.length < 6) at.examples.push(example);
    findings.set(kind, at);
  };

  for (const [sourceKey, group] of byKey) {
    // ── which jurisdiction, or which few ──
    const declared = dataset.jurisdictions[sourceKey];
    const ids =
      declared === undefined
        ? places.filter((p) => norm(p.name) === norm(sourceKey) || p.id === sourceKey.toLowerCase()).map((p) => p.id)
        : typeof declared === "string"
          ? [declared]
          : declared;
    // `--only` narrows the WORK, not just the report: resolving 4,182 polygons to ask about one state is
    // 40 seconds of nothing.
    if (wanted !== null && !ids.some((id) => wanted.has(id))) continue;
    if (ids.length === 0) {
      for (const c of group) {
        staged.push({ sourceKey, number: c.number, name: c.name, jurisdictionId: null, reason: "no-jurisdiction", detail: `no state or union territory named "${sourceKey}"` });
      }
      continue;
    }

    // ── which side of DPACO 2008 the source says these are ──
    const sides = new Set(group.map((c) => c.side));
    const side = sides.size === 1 ? [...sides][0]! : "after-dpaco-2008";
    if (sides.size > 1) note("mixed-epoch-declaration", `${sourceKey}: the source declares ${[...sides].join(" and ")}`);

    // Candidates are matched per jurisdiction; a source key covering two (Andhra Pradesh, which still holds
    // Telangana's seats) has its constituencies split by which registry it can be found in.
    const claimed = new Set<Candidate>();
    for (const jid of ids) {
      if (wanted !== null && !wanted.has(jid)) continue;
      const place = places.find((p) => p.id === jid);
      const jname = place?.name ?? jid;

      const offeredEpochs = all<{ epochId: string; seats: number }>(
        db,
        `SELECT pv.epoch_id AS epochId, COUNT(DISTINCT pv.id) AS seats
           FROM place_version pv JOIN contest c ON c.place_version_id = pv.id
          WHERE pv.jurisdiction_id = ? AND pv.kind = ?
          GROUP BY pv.epoch_id`,
        jid,
        dataset.house,
      ).filter((e) => {
        const from = epochFrom.get(e.epochId) ?? "";
        return side === "before-dpaco-2008" ? from < DPACO_2008 : from >= DPACO_2008;
      });

      const versionsIn = (epochId: string): Version[] =>
        all<Version>(
          db,
          `SELECT DISTINCT pv.id AS id, pv.number AS number, pv.canonical_name AS name, pv.epoch_id AS epochId
             FROM place_version pv JOIN contest c ON c.place_version_id = pv.id
            WHERE pv.jurisdiction_id = ? AND pv.kind = ? AND pv.epoch_id = ?`,
          jid,
          dataset.house,
          epochId,
        );

      // Score = matches anchored on the NUMBER. A permuted numbering cannot win a scoring round it should
      // lose, which is the whole point of not scoring names alone.
      const scored = offeredEpochs
        .map((e) => {
          const vers = versionsIn(e.epochId);
          const byNo = new Map(vers.map((v) => [v.number, v]));
          let score = 0;
          for (const c of group) {
            const v = byNo.get(c.number);
            if (v !== undefined && strongMatch(c, v)) score += 1;
          }
          return { epochId: e.epochId, seats: e.seats, score };
        })
        .sort((a, b) => b.score - a.score || b.seats - a.seats);

      const best = scored[0];
      let decision: JurisdictionReport["decision"];
      let why: string;
      let epochId: string | null;
      if (best === undefined) {
        decision = "NO_EPOCH";
        why = `the registry holds no ${dataset.house} contest for ${jname} on the ${side.replace("-dpaco-2008", "")} side of DPACO 2008`;
        epochId = null;
      } else if (scored.length === 1) {
        decision = "RESOLVED_BY_DECLARATION";
        why = `the source declares ${side} and ${best.epochId} is the only such epoch the registry contests for ${jname}`;
        epochId = best.epochId;
      } else {
        const runner = scored[1]!;
        const good = best.score >= 0.5 * best.seats;
        const clear = best.score >= 2 * runner.score;
        decision = good && clear ? "RESOLVED" : "AMBIGUOUS";
        why =
          good && clear
            ? `${best.score} of ${best.seats} match on number and name, against ${runner.score} for ${runner.epochId}`
            : `${best.epochId} scores ${best.score} of ${best.seats} and ${runner.epochId} scores ${runner.score} — not clear enough to choose`;
        epochId = decision === "RESOLVED" ? best.epochId : null;
      }

      const report: JurisdictionReport = {
        sourceKey,
        jurisdictionId: jid,
        jurisdictionName: jname,
        candidates: group.length,
        side,
        offered: scored,
        epochId,
        decision,
        why,
        seats: best?.seats ?? 0,
        linked: 0,
        restated: 0,
        staged: 0,
        tiers: {},
      };
      jurisdictions.push(report);
      if (epochId === null) continue;

      const vers = versionsIn(epochId);
      const byNo = new Map(vers.map((v) => [v.number, v]));
      const byName = new Map<string, Version[]>();
      for (const v of vers) {
        const k = seatKey(v.name);
        byName.set(k, [...(byName.get(k) ?? []), v]);
      }
      const stateBox = basemapBox(jname);
      const taken = new Map<number, string>(); // versionId -> path, so a repeat is caught
      const pathSeen = new Map<string, number>();

      for (const c of group) {
        if (claimed.has(c)) continue;
        const found = matchOne(c, byNo, byName);
        if (found === null) continue;

        // ── validation, before anything is called a link ──
        if (c.path === "") {
          staged.push({ sourceKey, number: c.number, name: c.name, jurisdictionId: jid, reason: "empty-geometry", detail: "no ring survived simplification" });
          note("empty-geometry", `${jid} ${c.number} ${c.name}`);
          claimed.add(c);
          continue;
        }
        if (stateBox !== null && !within(c.box, stateBox)) {
          staged.push({ sourceKey, number: c.number, name: c.name, jurisdictionId: jid, reason: "outside-jurisdiction", detail: `box ${c.box.map((n) => n.toFixed(0)).join(" ")} falls outside ${jname}'s ${stateBox.map((n) => n.toFixed(0)).join(" ")}` });
          note("outside-jurisdiction", `${jid} ${c.number} ${c.name}`);
          claimed.add(c);
          continue;
        }
        const already = pathSeen.get(c.path);
        if (already !== undefined) {
          staged.push({ sourceKey, number: c.number, name: c.name, jurisdictionId: jid, reason: "duplicate-path", detail: `identical geometry to place_version ${already}` });
          note("duplicate-path-in-epoch", `${jid} ${c.number} ${c.name}`);
          claimed.add(c);
          continue;
        }
        if (taken.has(found.version.id)) {
          staged.push({ sourceKey, number: c.number, name: c.name, jurisdictionId: jid, reason: "duplicate-path", detail: `place_version ${found.version.id} already claimed by another polygon` });
          note("version-claimed-twice", `${jid} ${c.number} ${c.name}`);
          claimed.add(c);
          continue;
        }

        pathSeen.set(c.path, found.version.id);
        taken.set(found.version.id, c.path);
        claimed.add(c);
        const restated = restatedVersions(db, found.version.id);
        links.push({ candidate: c, jurisdictionId: jid, versionId: found.version.id, epochId, tier: found.tier, restated });
        report.linked += 1;
        report.restated += restated.length;
        report.tiers[found.tier] = (report.tiers[found.tier] ?? 0) + 1;
        if (c.pinches > 0) note("self-touching-ring", `${jid} ${c.number} ${c.name}: ${c.pinches}`);
        if (c.polygons > 1) note("multipart", `${jid} ${c.number} ${c.name}: ${c.polygons} polygons`);
      }

      // AREA SANITY, and the check has to be the one that finds defects rather than the one that finds
      // cities. A ratio against the state median flags all 15 of Chennai's seats, which are genuinely tiny
      // and genuinely correct. What is never correct is a seat with no area, or one polygon covering a
      // quarter of its state — that is a state outline that got a constituency's attributes.
      const mine = links.filter((l) => l.jurisdictionId === jid).map((l) => l.candidate);
      const total = sum(mine.map((c) => c.area));
      for (const c of mine) {
        if (c.area <= 0) note("zero-area", `${jid} ${c.number} ${c.name}`);
        else if (total > 0 && c.area > 0.25 * total) {
          note("area-covers-the-state", `${jid} ${c.number} ${c.name}: ${((100 * c.area) / total).toFixed(0)}% of the jurisdiction`);
        }
      }
    }

    for (const c of group) {
      if (claimed.has(c)) continue;
      const worst = jurisdictions.filter((j) => j.sourceKey === sourceKey);
      const reason: Staged["reason"] =
        worst.every((j) => j.decision === "AMBIGUOUS")
          ? "epoch-ambiguous"
          : worst.every((j) => j.decision === "NO_EPOCH")
            ? "no-epoch"
            : "no-version";
      const where = worst.map((j) => `${j.jurisdictionId}/${j.epochId ?? j.decision}`).join(", ");
      staged.push({ sourceKey, number: c.number, name: c.name, jurisdictionId: ids[0] ?? null, reason, detail: `no place_version matched in ${where}` });
      for (const j of worst) j.staged += 1;
      note(reason, `${sourceKey} ${c.number} ${c.name}`);
    }
  }

  const multipart = candidates.filter((c) => c.polygons > 1).length;
  for (const j of jurisdictions) {
    if (j.epochId !== null && j.linked < j.seats) {
      note("count-short", `${j.jurisdictionId} ${j.epochId}: ${j.linked} of ${j.seats} seats drawn`);
    }
  }

  return {
    datasetId: dataset.id,
    house: dataset.house,
    features: features.length,
    unusable,
    candidates: candidates.length,
    multipart,
    jurisdictions,
    links,
    staged,
    findings: [...findings].map(([kind, v]) => ({ kind, n: v.n, examples: v.examples })).sort((a, b) => b.n - a.n),
    totals: {
      seats: sum(jurisdictions.map((j) => (j.epochId === null ? 0 : j.seats))),
      linked: links.length,
      restated: sum(links.map((l) => l.restated.length)),
      staged: staged.length,
      points: sum(links.map((l) => l.candidate.points)),
    },
  };
}

function sum(ns: readonly number[]): number {
  return ns.reduce((a, b) => a + b, 0);
}

/** Number-anchored agreement, used for scoring an epoch and as the first three match tiers. */
function strongMatch(c: Candidate, v: Version): boolean {
  const s = seatKey(c.name);
  const r = seatKey(v.name);
  return s === r || (s.length >= 6 && r.startsWith(s)) || phoneticKey(stripTags(c.name)) === phoneticKey(stripTags(v.name));
}

function stripTags(s: string): string {
  return s.replace(/[([].*$/, "").trim();
}

/** The five tiers, in order. Returns null when no pair of keys agrees, which is a staged candidate. */
function matchOne(
  c: Candidate,
  byNo: Map<number | null, Version>,
  byName: Map<string, Version[]>,
): { version: Version; tier: Tier } | null {
  const s = seatKey(c.name);
  const v = byNo.get(c.number);
  if (v !== undefined) {
    const r = seatKey(v.name);
    if (s === r) return { version: v, tier: "number+name" };
    if (s.length >= 6 && r.startsWith(s)) return { version: v, tier: "number+truncated" };
    if (phoneticKey(stripTags(c.name)) === phoneticKey(stripTags(v.name))) return { version: v, tier: "number+phonetic" };
  }
  const named = byName.get(s) ?? [];
  if (named.length === 1) return { version: named[0] as Version, tier: "name-unique" };
  if (named.length > 1) {
    const tie = named.filter((x) => x.number === c.number);
    if (tie.length === 1) return { version: tie[0] as Version, tier: "name+number-tiebreak" };
  }
  return null;
}

/**
 * The versions another epoch holds for THIS SAME constituency, per the registry's own cited links.
 *
 * `derived_from` is written in one direction — the later order's version derives from the earlier one — and
 * a polygon matched to either end serves both, so both directions are followed. `basis` comes back with it
 * because the reason this is allowed is the order's own sentence, and it belongs in the report.
 */
function restatedVersions(db: DatabaseSync, versionId: number): { versionId: number; epochId: string; basis: string }[] {
  return all<{ versionId: number; epochId: string; basis: string }>(
    db,
    `SELECT pv.id AS versionId, pv.epoch_id AS epochId, l.basis AS basis
       FROM place_version_link l
       JOIN place_version pv ON pv.id = l.to_place_version_id
      WHERE l.kind = 'derived_from' AND l.from_place_version_id = ?
     UNION
     SELECT pv.id AS versionId, pv.epoch_id AS epochId, l.basis AS basis
       FROM place_version_link l
       JOIN place_version pv ON pv.id = l.from_place_version_id
      WHERE l.kind = 'derived_from' AND l.to_place_version_id = ?`,
    versionId,
    versionId,
  );
}

/** Is a box inside another, with slack? The two datasets have different coastlines and one declares a shift. */
function within(box: readonly number[], outer: readonly number[]): boolean {
  const [x, y, w, h] = box as [number, number, number, number];
  const [ox, oy, ow, oh] = outer as [number, number, number, number];
  return x >= ox - CONTAINMENT_SLACK && y >= oy - CONTAINMENT_SLACK && x + w <= ox + ow + CONTAINMENT_SLACK && y + h <= oy + oh + CONTAINMENT_SLACK;
}

// ── import ────────────────────────────────────────────────────────────────────

export type ImportResult = {
  report: InspectReport;
  sourceId: string;
  written: number;
  restatedWritten: number;
  replaced: number;
  skipped: number;
};

/**
 * Write what the report decided, and only that.
 *
 * One savepoint around the whole dataset: a geometry import that half-succeeded would leave a state with
 * some constituencies drawn and some not, which is indistinguishable from a source that is missing seats.
 */
export function importGeometry(
  db: DatabaseSync,
  dataset: Dataset,
  features: readonly Feature[],
  opts: { only?: readonly string[]; apply: boolean; nowIso: string; replace?: boolean },
): ImportResult {
  const report = inspectGeometry(db, dataset, features, opts.only === undefined ? {} : { only: opts.only });
  const sourceId = `geo:${dataset.id}:${dataset.sha256.slice(0, 12)}`;
  const viewBox = sharedViewBox();

  const rows: (string | number)[][] = [];
  let restatedWritten = 0;
  for (const l of report.links) {
    rows.push([l.versionId, l.candidate.path, l.candidate.centroid.x, l.candidate.centroid.y, viewBox, sourceId]);
    for (const r of l.restated) {
      rows.push([r.versionId, l.candidate.path, l.candidate.centroid.x, l.candidate.centroid.y, viewBox, sourceId]);
      restatedWritten += 1;
    }
  }

  const existing = new Set(
    all<{ id: number }>(db, `SELECT place_version_id AS id FROM place_geometry`).map((r) => r.id),
  );
  const fresh = rows.filter((r) => !existing.has(r[0] as number));
  const clash = rows.filter((r) => existing.has(r[0] as number));

  if (!opts.apply) {
    return { report, sourceId, written: fresh.length, restatedWritten, replaced: opts.replace === true ? clash.length : 0, skipped: opts.replace === true ? 0 : clash.length };
  }

  db.exec("SAVEPOINT geometry_import");
  try {
    db.prepare(
      `INSERT INTO source (id, kind, publisher, title, url, retrieved_at, published_on, doc_hash, hash_kind, retrieval_kind, licence, publisher_note)
         VALUES (?, 'boundary_geometry', ?, ?, ?, ?, ?, ?, 'document_bytes', 'fetched', ?, ?)
       ON CONFLICT(id) DO UPDATE SET retrieved_at = excluded.retrieved_at`,
    ).run(
      sourceId,
      dataset.publisher,
      `${dataset.title} — ${report.candidates} constituencies, ${dataset.bytes} bytes`,
      dataset.url,
      opts.nowIso,
      dataset.publishedOn,
      dataset.sha256,
      dataset.licence,
      dataset.caveats.join(" "),
    );
    const write = opts.replace === true ? rows : fresh;
    if (opts.replace === true && clash.length > 0) {
      const stmt = db.prepare(`DELETE FROM place_geometry WHERE place_version_id = ?`);
      for (const r of clash) stmt.run(r[0] as number);
    }
    insertMany(
      db,
      `INSERT INTO place_geometry (place_version_id, path, centroid_x, centroid_y, view_box, source_id) VALUES (?, ?, ?, ?, ?, ?)`,
      write,
    );
    db.exec("RELEASE geometry_import");
  } catch (cause) {
    db.exec("ROLLBACK TO geometry_import");
    db.exec("RELEASE geometry_import");
    throw cause;
  }

  return {
    report,
    sourceId,
    written: opts.replace === true ? rows.length : fresh.length,
    restatedWritten,
    replaced: opts.replace === true ? clash.length : 0,
    skipped: opts.replace === true ? 0 : clash.length,
  };
}

// ── manifest and file ─────────────────────────────────────────────────────────

const MANIFEST = new URL("../../../../../data/geo/sources.json", import.meta.url);

export function manifest(): Manifest {
  return JSON.parse(readFileSync(fileURLToPath(MANIFEST), "utf8")) as Manifest;
}

export function datasetById(id: string): Dataset {
  const d = manifest().datasets.find((x) => x.id === id);
  if (d === undefined) throw new Error(`no dataset "${id}" in data/geo/sources.json`);
  return d;
}

/**
 * The fetched file, verified against the manifest's hash before anything reads it.
 *
 * NO SILENT DOWNLOADS AND NO UNHASHED BYTES. The manifest declares the sha256; if the file on disk does not
 * have it, this throws rather than importing a boundary set nobody has checked.
 */
export function readDataset(dataset: Dataset): { features: Feature[]; sha256: string; bytes: number } {
  const bytes = readFileSync(dataset.file);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== dataset.sha256) {
    throw new Error(
      `${dataset.file} hashes to ${sha256}, and data/geo/sources.json declares ${dataset.sha256}. ` +
        `Re-fetch it, or update the manifest in the commit that explains why the bytes changed.`,
    );
  }
  const parsed = JSON.parse(bytes.toString("utf8")) as { features?: Feature[] };
  return { features: parsed.features ?? [], sha256, bytes: bytes.length };
}

/** Whether the registry can name this source's kind yet. `geography fetch` checks it before importing. */
export function sourceKindAvailable(db: DatabaseSync): boolean {
  const sql = get<{ sql: string }>(db, `SELECT sql FROM sqlite_master WHERE name = 'source'`)?.sql ?? "";
  return sql.includes("boundary_geometry");
}

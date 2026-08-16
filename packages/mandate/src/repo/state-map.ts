// The state's electoral map: who won each constituency, and what a district's constituencies add up to.
//
// WHAT THIS ANSWERS THAT THE NATIONAL MAP CANNOT. The India map colours a state by its GOVERNMENT — the party
// leading its most recent assembly. That is one figure for a whole state, and it is not a claim about any area
// inside it. This is the other claim: one polygon per constituency, coloured by the party that won THAT
// constituency in a named election. Two different layers, and the product's most load-bearing distinction.
//
// ── THE EPOCH GATE IS THE DATA MODEL, NOT A CHECK ──
//
// The brief forbids drawing a 2004 result on 2023 boundaries. Nothing here has to enforce that, because
// `place_geometry` is keyed by `place_version_id` and a contest names its own `place_version`. So the only
// polygon a result can ever be drawn on is the boundary that result was recorded under. A 2006 West Bengal
// contest resolves to a 1976-epoch version, the registry holds no polygon for it, and the seat comes back
// with `path: null` — undrawable rather than wrongly drawn. The gate cannot be forgotten, because there is no
// code path that could bypass it.
//
// What this module does have to do is SAY SO: `geometry.drawable` against `geometry.total`, and the epochs on
// both sides, so the page can tell a reader "this election's boundaries are not held" instead of showing them
// a map with holes in it.
//
// ── COVERAGE, STATED PLAINLY ──
//
// The registry holds 4,950 constituency polygons in one projection: 4,402 assembly and 548 parliamentary,
// across every jurisdiction that holds elections. Sixteen draw every seat of their newest assembly election
// and sixteen are short — mostly by one to four seats, and each shortfall is a named row in
// docs/geo/import.md rather than a silence.
//
// WHERE THERE IS NOTHING TO DRAW, THE FALLBACK IS STILL THE DISTRICT TALLY — "12 of 18 constituencies won by
// INC" — computed from results and `place_version.district_place_id`, which every jurisdiction has. Jharkhand
// is the case that matters: the registry holds its pre-2008 boundaries and DPACO 2008 redrew them, so its
// 2019 result has no polygon it may legally be drawn on and gets the tally instead. See docs/geo/coverage.md.
//
// ── A DISTRICT NEVER HAS A WINNER ──
//
// `DistrictTally` carries `parties`, plural, and no `winner` field. There is nowhere in this type to record
// "INC won Bengaluru Urban", because a district does not elect anybody: its constituencies do, and the honest
// sentence is "12 of 18 constituencies won by INC". Making that unrepresentable is cheaper than remembering
// not to say it.

import type { DatabaseSync } from "node:sqlite";
import { constituencyHref, districtHref, stateHref } from "./routes.ts";
import { all, get } from "../db/index.ts";
import { loadSources, read } from "./index.ts";
import type { SourceRef } from "./index.ts";
import { CHRONO_DESC, partitionByEpoch, previousElection, seatKey } from "./elections.ts";
import { summariseAll, type Finding, type FlipPair, type PartyRef } from "./findings.ts";

/** One constituency, as the map draws it. */
export type SeatMark = {
  placeId: string;
  /** The version this result was recorded under — and therefore the only geometry it may be drawn on. */
  versionId: string;
  name: string;
  number: number | null;
  reservation: string | null;
  districtId: string | null;
  districtName: string | null;
  /** The winning party's registry key, which is what the colour and the highlight are keyed on. */
  partyKey: string | null;
  partyLabel: string | null;
  winnerName: string | null;
  winnerPersonId: string | null;
  votes: number | null;
  marginVotes: number | null;
  /** Margin over VOTES POLLED, never over the sum of the result rows. */
  marginPct: number | null;
  turnoutPct: number | null;
  /** The seat's own page, where the place path can address it. */
  href: string | null;
  /** The polygon for THIS version, or null where the registry holds none. */
  path: string | null;
};

/**
 * What a district's constituencies came to. Note what is absent: there is no `winner`.
 */
export type DistrictTally = {
  id: string;
  name: string;
  seats: number;
  /** Biggest first. `n` of `seats` went to this party. */
  parties: { key: string; label: string; n: number }[];
};

export type ElectionChoice = {
  id: string;
  name: string;
  year: number;
  house: string;
  kind: string;
  seats: number;
};

export type StateMapView = {
  jurisdictionId: string;
  jurisdictionName: string;
  /** Every election this jurisdiction has held, newest first. The selector's options. */
  elections: ElectionChoice[];
  /** The one being shown, or null when the jurisdiction has none. */
  election: ElectionChoice | null;
  seats: SeatMark[];
  districts: DistrictTally[];
  /** The parties this election's winners actually include, biggest first. The contextual legend. */
  legend: { key: string; label: string; n: number }[];
  /**
   * Where the polygons came from, and where the results came from — for the panel's one `ⓘ`.
   *
   * A BOUNDARY SET IS A SOURCE LIKE ANY OTHER: publisher, URL, licence, retrieval date, sha256 over the
   * bytes. Phase 2.6 established that for the national basemap and this phase acquired 5,000 constituency
   * polygons under a declared licence, so they belong in the same drawer rather than nowhere. The list comes
   * from `place_geometry.source_id` and `result.source_id` for the election on screen, so it names the
   * sources actually behind THIS map instead of a constant.
   */
  sources: SourceRef[];
  geometry: {
    /** The shared projection box the polygons live in, from the registry's own geometry rows. */
    viewBox: string | null;
    /** How many of this election's seats the registry can draw, and how many there are. */
    drawable: number;
    total: number;
    /** The boundary epochs this election's contests were recorded under. */
    epochs: string[];
    /** The epochs the registry holds ANY polygon for, in this jurisdiction. */
    epochsHeld: string[];
    /**
     * Polygons withheld because they are in a DIFFERENT COORDINATE SPACE from the rest.
     *
     * `place_geometry.view_box` is per row on purpose — two geometry sources need not share a projection —
     * and this is the case it exists to catch. West Bengal held 276 constituencies from a published
     * boundary set and 31 left over from a repo module in the old 400x580 frame; drawing them in one SVG
     * puts 31 polygons somewhere they are not. Withheld and counted, rather than drawn wrongly.
     */
    otherFrames: number;
  };
};

type SeatSql = {
  placeId: string;
  versionId: string;
  name: string;
  number: number | null;
  reservation: string | null;
  districtId: string | null;
  districtName: string | null;
  stateId: string | null;
  partyKey: string | null;
  partyLabel: string | null;
  winnerName: string | null;
  winnerPersonId: string | null;
  votes: number | null;
  marginVotes: number | null;
  voters: number | null;
  electors: number | null;
  path: string | null;
  viewBox: string | null;
  epoch: string;
};

const KEY_SQL = `COALESCE(pt.id, NULLIF(cd.party_raw, ''), 'unattached')`;
const LABEL_SQL = `COALESCE(NULLIF(pt.short_name, ''), NULLIF(pt.name, ''), NULLIF(cd.party_raw, ''), 'Unattached')`;

/** The slug a place path uses for a seat name. Same rule as place-page.ts's, and it has to stay the same. */
function slug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

/**
 * Everything a state's map needs, for one election, from one open handle.
 *
 * `election` is validated by MEMBERSHIP against the jurisdiction's own elections — an id from a URL that this
 * state never held falls back to its newest rather than reaching the SQL or drawing an empty country.
 */
export function stateMapView(
  db: DatabaseSync,
  jurisdictionId: string,
  p: { election?: string | undefined; house?: string | undefined } = {},
): StateMapView {
  return read(() => {
    const name =
      get<{ n: string }>(db, `SELECT canonical_name AS n FROM place WHERE id = ?`, jurisdictionId)?.n ??
      jurisdictionId;

    // EVERY ELECTION THAT CONTESTED A SEAT IN THIS JURISDICTION, which is not the same as every election
    // this jurisdiction held. A general election belongs to the union — `ls-2024`'s jurisdiction_place_id is
    // `in` — so filtering on that column offered a state its parliamentary BY-ELECTIONS and never the Lok
    // Sabha itself. A state's Lok Sabha map was unreachable, which is a requirement rather than a nicety.
    //
    // `seats` is counted WITHIN the jurisdiction too: West Bengal's row for ls-2024 says 42, not 543.
    const elections = all<ElectionChoice>(
      db,
      `SELECT e.id AS id, e.name AS name, e.year AS year, e.house AS house, e.kind AS kind,
              COUNT(*) AS seats
         FROM election e
         JOIN contest c ON c.election_id = e.id
         JOIN place_version pv ON pv.id = c.place_version_id
        WHERE pv.jurisdiction_id = ?
        GROUP BY e.id
        ORDER BY ${CHRONO_DESC}`,
      jurisdictionId,
    );

    // A house filter narrows the selector rather than the map: a reader who asked for the Lok Sabha should see
    // the Lok Sabha elections, and if there are none they should be told, not silently shown an assembly.
    const house = p.house === "pc" || p.house === "ac" ? p.house : null;
    const offered = house === null ? elections : elections.filter((e) => e.house === house);
    // THE DEFAULT IS THE LATEST FULL ASSEMBLY ELECTION, in that order of preference.
    //
    //  · Not merely the newest row: Jammu & Kashmir's newest is a single-seat 2017 by-election, and opening
    //    a state's map on one polygon out of 87 answers no question anyone arrived with.
    //  · Not merely the newest full election either, now that the Lok Sabha is offered here: Madhya
    //    Pradesh's newest assembly is 2018 and ls-2024 is newer, so "newest" would open a state page on the
    //    parliamentary map. A state's own house is what a reader came for.
    //
    // Both are still selectable; neither is what the map opens on.
    const election =
      offered.find((e) => e.id === p.election) ??
      offered.find((e) => e.kind !== "bypoll" && e.house === "ac") ??
      offered.find((e) => e.kind !== "bypoll") ??
      offered[0] ??
      null;

    const epochsHeld = all<{ e: string }>(
      db,
      `SELECT DISTINCT pv.epoch_id AS e
         FROM place_geometry g JOIN place_version pv ON pv.id = g.place_version_id
        WHERE pv.jurisdiction_id = ?`,
      jurisdictionId,
    ).map((r) => r.e);

    if (election === null) {
      return {
        jurisdictionId,
        jurisdictionName: name,
        elections,
        election: null,
        seats: [],
        districts: [],
        legend: [],
        sources: [],
        geometry: { viewBox: null, drawable: 0, total: 0, epochs: [], epochsHeld, otherFrames: 0 },
      };
    }

    // ONE JOIN, and the geometry comes along the same path the result does: contest → place_version →
    // place_geometry. There is no way to ask for a polygon that belongs to a different boundary epoch.
    const rows = all<SeatSql>(
      db,
      `SELECT pl.id AS placeId, pv.id AS versionId, pv.canonical_name AS name,
              pv.number AS number, pv.reservation AS reservation, pv.epoch_id AS epoch,
              d.id AS districtId, d.canonical_name AS districtName, s.id AS stateId,
              CASE WHEN r.candidacy_id IS NULL THEN NULL ELSE ${KEY_SQL} END AS partyKey,
              CASE WHEN r.candidacy_id IS NULL THEN NULL ELSE ${LABEL_SQL} END AS partyLabel,
              per.canonical_name AS winnerName, per.id AS winnerPersonId,
              r.votes AS votes, r.margin AS marginVotes,
              t.voters AS voters, t.electors AS electors,
              g.path AS path, g.view_box AS viewBox
         FROM contest c
         JOIN place_version pv ON pv.id = c.place_version_id
         JOIN place pl         ON pl.id = pv.place_id
         LEFT JOIN place d     ON d.id = COALESCE(pv.district_place_id, pl.parent_id) AND d.kind = 'district'
         LEFT JOIN place s     ON s.id = d.parent_id
         LEFT JOIN place_geometry g ON g.place_version_id = pv.id
         LEFT JOIN turnout t   ON t.contest_id = c.id AND t.scope = 'contest'
         LEFT JOIN result r    ON r.contest_id = c.id AND r.revision = 0 AND r.is_winner = 1
         LEFT JOIN candidacy cd ON cd.id = r.candidacy_id
         LEFT JOIN person per  ON per.id = cd.person_id
         LEFT JOIN party_version pvv ON pvv.id = cd.party_version_id
         LEFT JOIN party pt          ON pt.id = pvv.party_id
        WHERE c.election_id = ? AND pv.jurisdiction_id = ?
        ORDER BY pv.number, pv.canonical_name`,
      election.id,
      jurisdictionId,
    );

    // ONE COORDINATE SPACE PER MAP. The frame most of this election's polygons are in wins, and a polygon
    // in any other frame is withheld — a path is only meaningful beside the paths it shares a projection
    // with, and `view_box` is stored per row precisely because nothing guarantees that.
    const frames = new Map<string, number>();
    for (const r of rows) {
      if (r.viewBox === null || r.path === null) continue;
      frames.set(r.viewBox, (frames.get(r.viewBox) ?? 0) + 1);
    }
    const frame = [...frames].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const otherFrames = rows.filter((r) => r.path !== null && r.viewBox !== frame).length;

    const pct = (n: number | null, of: number | null): number | null =>
      n === null || of === null || of <= 0 ? null : Number(((100 * n) / of).toFixed(2));

    const seats: SeatMark[] = rows.map((x) => ({
      placeId: x.placeId,
      versionId: x.versionId,
      name: x.name,
      number: x.number,
      reservation: x.reservation,
      districtId: x.districtId,
      districtName: x.districtName,
      partyKey: x.partyKey,
      partyLabel: x.partyLabel,
      winnerName: x.winnerName,
      winnerPersonId: x.winnerPersonId,
      votes: x.votes,
      marginVotes: x.marginVotes,
      marginPct: pct(x.marginVotes === null ? null : Math.abs(x.marginVotes), x.voters),
      turnoutPct: pct(x.voters, x.electors),
      // Only a seat under a district has a four-segment place path. A parliamentary seat hangs off the state,
      // and addressing it as `/pl/<state>//<name>` resolves to nothing.
      href:
        x.stateId !== null && x.districtId !== null && x.districtId.startsWith(`${x.stateId}.`)
          ? constituencyHref({ jurisdictionId: x.stateId, kind: "ac", canonicalName: x.name })
          : null,
      path: x.viewBox === frame ? x.path : null,
    }));

    // The tally, per district. Parties plural, and no winner — see the type.
    const byDistrict = new Map<string, DistrictTally>();
    for (const s of seats) {
      if (s.districtId === null) continue;
      const at = byDistrict.get(s.districtId) ?? {
        id: s.districtId,
        name: s.districtName ?? s.districtId,
        seats: 0,
        parties: [],
      };
      at.seats += 1;
      if (s.partyKey !== null) {
        const hit = at.parties.find((q) => q.key === s.partyKey);
        if (hit === undefined) at.parties.push({ key: s.partyKey, label: s.partyLabel ?? s.partyKey, n: 1 });
        else hit.n += 1;
      }
      byDistrict.set(s.districtId, at);
    }
    const districts = [...byDistrict.values()]
      .map((d) => ({ ...d, parties: d.parties.sort((a, b) => b.n - a.n || a.key.localeCompare(b.key)) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const won = new Map<string, { label: string; n: number }>();
    for (const s of seats) {
      if (s.partyKey === null) continue;
      const at = won.get(s.partyKey) ?? { label: s.partyLabel ?? s.partyKey, n: 0 };
      at.n += 1;
      won.set(s.partyKey, at);
    }
    const legend = [...won]
      .sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))
      .map(([key, v]) => ({ key, label: v.label, n: v.n }));

    const sourceIds = all<{ id: string }>(
      db,
      `SELECT DISTINCT g.source_id AS id
         FROM contest c JOIN place_geometry g ON g.place_version_id = c.place_version_id
        WHERE c.election_id = ? AND EXISTS (SELECT 1 FROM place_version pv WHERE pv.id = c.place_version_id AND pv.jurisdiction_id = ?)
       UNION
       SELECT DISTINCT r.source_id AS id
         FROM contest c JOIN result r ON r.contest_id = c.id
         JOIN place_version pv ON pv.id = c.place_version_id
        WHERE c.election_id = ? AND pv.jurisdiction_id = ?`,
      election.id,
      jurisdictionId,
      election.id,
      jurisdictionId,
    ).map((r) => r.id);

    return {
      jurisdictionId,
      jurisdictionName: name,
      elections,
      election,
      seats,
      districts,
      legend,
      sources: loadSources(db, sourceIds, []),
      geometry: {
        viewBox: frame,
        drawable: seats.filter((s) => s.path !== null).length,
        total: seats.length,
        epochs: [...new Set(rows.map((r) => r.epoch))].sort(),
        epochsHeld,
        otherFrames,
      },
    };
  });
}

/** The seats of one district, in the order the map and the table both want them. */
export function seatsIn(view: StateMapView, districtId: string | null): SeatMark[] {
  if (districtId === null) return view.seats;
  return view.seats.filter((s) => s.districtId === districtId);
}

/* ────────────────────────────── what changed ────────────────────────────── */

/**
 * Three to five sentences about what moved, against the previous election of the SAME HOUSE.
 *
 * WHY IT IS HERE AND NOT IN A COMPONENT. A state page's five-second job is "who governs, how strongly, and
 * what changed", and the third of those was the one thing the page did not have — it had a 30-row district
 * table and a 17-row election table instead, which is where a reader had to go and compute it themselves.
 *
 * WHY IT IS NOT A NEW QUERY SHAPE. Every fact below comes out of ONE read over two elections' winners and
 * turnout rows, and the pairing rule is `previousElection` — the same tuple `CHRONO_DESC` ranks by, so "the
 * previous election" here and "the newest election" anywhere else cannot disagree about which of two is
 * earlier. Bihar held one election in February 2005 and another in October; that is why the rule is a tuple
 * and not a year.
 *
 * WHAT IT REFUSES TO SAY. Nothing is a prediction, nothing is a cause, and a party missing from one side gets
 * no change at all rather than a ±everything: not contesting is not a collapse, and a first outing is not a
 * gain of every seat it won. A seat with no declared winner on either side is neither a hold nor a flip — it
 * is unknown, and it is excluded from the flip count rather than counted as continuity.
 */
export type StateShifts = {
  /** The election compared against, or null when this is the first of its house on record. */
  previousYear: number | null;
  previousId: string | null;
  /**
   * WHAT MOVED, AS DATA. Biggest first. Empty is a legitimate answer.
   *
   * This replaced `lines: string[]`, which was the reason the state page could print what changed and
   * could not draw it — shading a map by which party gained a seat would have meant parsing "BJP gained 30
   * seats, 79 to 109." A `seat_flips` finding carries `pairs`, so the flip matrix reads a field.
   */
  findings: Finding[];
  /** `summariseAll(findings)` — the accessible equivalent, derived so it cannot disagree with the data. */
  lines: string[];
  /**
   * Seats compared BOTH sides under the same boundary, and seats that could not be.
   *
   * `incomparableSeats > 0` means a delimitation fell between the two elections, so those seats have no
   * counterpart to change from. The UI states that count; it must never let a reader read it as continuity.
   */
  comparableSeats: number;
  incomparableSeats: number;
};

type ShiftRow = {
  electionId: string;
  placeId: string;
  /** The boundary this contest was fought under. Half of the seat's comparison identity — see `seatKey`. */
  epochId: string;
  key: string | null;
  label: string | null;
  voters: number | null;
  electors: number | null;
};

export function stateShifts(db: DatabaseSync, jurisdictionId: string, electionId: string): StateShifts {
  return read(() => {
    const previousId = previousElection(db, electionId);
    const none: StateShifts = {
      previousYear: null,
      previousId: null,
      findings: [],
      lines: [],
      comparableSeats: 0,
      incomparableSeats: 0,
    };
    if (previousId === null) return none;
    const previousYear =
      get<{ y: number }>(db, `SELECT year AS y FROM election WHERE id = ?`, previousId)?.y ?? null;
    // The year on the OTHER side, so a finding can name both ends without the caller re-reading.
    const year = get<{ y: number }>(db, `SELECT year AS y FROM election WHERE id = ?`, electionId)?.y ?? null;

    const rows = all<ShiftRow>(
      db,
      `SELECT c.election_id AS electionId, pv.place_id AS placeId, pv.epoch_id AS epochId,
              CASE WHEN r.candidacy_id IS NULL THEN NULL ELSE ${KEY_SQL} END AS key,
              CASE WHEN r.candidacy_id IS NULL THEN NULL ELSE ${LABEL_SQL} END AS label,
              t.voters AS voters, t.electors AS electors
         FROM contest c
         JOIN place_version pv ON pv.id = c.place_version_id
         LEFT JOIN turnout t   ON t.contest_id = c.id AND t.scope = 'contest'
         LEFT JOIN result r    ON r.contest_id = c.id AND r.revision = 0 AND r.is_winner = 1
         LEFT JOIN candidacy cd ON cd.id = r.candidacy_id
         LEFT JOIN party_version pvv ON pvv.id = cd.party_version_id
         LEFT JOIN party pt          ON pt.id = pvv.party_id
        WHERE c.election_id IN (?, ?) AND pv.jurisdiction_id = ?`,
      electionId,
      previousId,
      jurisdictionId,
    );

    const now = rows.filter((r) => r.electionId === electionId);
    const then = rows.filter((r) => r.electionId === previousId);
    if (now.length === 0 || then.length === 0) return { ...none, previousYear, previousId };

    const seatsBy = (side: readonly ShiftRow[]): Map<string, { label: string; n: number }> => {
      const out = new Map<string, { label: string; n: number }>();
      for (const r of side) {
        if (r.key === null) continue;
        const at = out.get(r.key) ?? { label: r.label ?? r.key, n: 0 };
        at.n += 1;
        out.set(r.key, at);
      }
      return out;
    };
    const a = seatsBy(now);
    const b = seatsBy(then);

    // FINDINGS, NOT SENTENCES. Every conclusion below is a value with named fields; `lines` at the bottom
    // is `summariseAll(findings)`, so the prose is derived from the data rather than being the data. That
    // is what lets a map shade by `FlipPair.to` and a matrix read `pairs` — neither of which could be done
    // when this function's only output was `string[]`.
    const findings: Finding[] = [];
    const ref = (key: string, label: string | null): PartyRef => ({ key, label: label ?? key });

    // 1 and 2. Seat movements, biggest first. A party present on only ONE side is an arrival or a wipeout
    // rather than a change, because those are different findings and different marks: an arrival has no
    // baseline to draw a slope from.
    const moved = [...new Set([...a.keys(), ...b.keys()])]
      .map((k) => {
        const x = a.get(k);
        const y = b.get(k);
        return { key: k, label: x?.label ?? y?.label ?? k, now: x?.n ?? 0, then: y?.n ?? 0 };
      })
      .filter((m) => m.now !== m.then)
      .sort((p, q) => Math.abs(q.now - q.then) - Math.abs(p.now - p.then) || p.key.localeCompare(q.key));
    for (const m of moved.slice(0, 2)) {
      findings.push(
        m.then === 0
          ? { type: "party_arrival", party: ref(m.key, m.label), seats: m.now, previousYear, year }
          : m.now === 0
            ? { type: "party_wipeout", party: ref(m.key, m.label), seats: m.then, previousYear, year }
            : {
                type: "seat_movement",
                party: ref(m.key, m.label),
                then: m.then,
                now: m.now,
                delta: m.now - m.then,
                previousYear,
                year,
              },
      );
    }

    // 3. Seats that changed hands, seat by seat — THROUGH THE EPOCH GATE.
    //
    // Matched on (epoch, place), never on place alone. `place_id` is a seat NUMBER, and a delimitation
    // renumbers from scratch, so Karnataka 2004's ka.ac.001 is AURAD and 2008's is NIPPANI. Pairing them
    // on the number matched 223 seats and called 170 of them flips, about seats that never faced each
    // other. `partitionByEpoch` makes that match unrepresentable rather than merely discouraged, and hands
    // back what it refused so the count can be stated instead of silently dropped — a hidden zero would
    // read as "nothing changed", which is a different claim from "these cannot be compared".
    //
    // NEW HERE: the from→to breakdown. "115 of 223 changed hands" cannot say that 53 went BJP→INC and 22
    // JD(S)→INC, and that is the question a reader actually has — not how many moved, but where the
    // winner's gain came from. It is one extra Map over rows already in memory.
    const split = partitionByEpoch(now, then);
    const before = new Map(
      then.filter((r) => r.key !== null).map((r) => [seatKey(r.placeId, r.epochId), r]),
    );
    let comparable = 0;
    let flipped = 0;
    const pairCounts = new Map<string, FlipPair>();
    for (const r of split.comparable) {
      if (r.key === null) continue;
      const was = before.get(seatKey(r.placeId, r.epochId));
      if (was === undefined || was.key === null) continue;
      comparable += 1;
      if (was.key === r.key) continue;
      flipped += 1;
      const cell = `${was.key}\u0000${r.key}`;
      const at = pairCounts.get(cell);
      if (at === undefined) {
        pairCounts.set(cell, { from: ref(was.key, was.label), to: ref(r.key, r.label), count: 1 });
      } else {
        at.count += 1;
      }
    }
    const incomparable = split.incomparable.length;
    if (comparable > 0) {
      findings.push({
        type: "seat_flips",
        flipped,
        held: comparable - flipped,
        comparable,
        pairs: [...pairCounts.values()].sort(
          (p, q) => q.count - p.count || p.from.key.localeCompare(q.from.key),
        ),
        previousYear,
        year,
      });
    }
    // Stated, not swallowed. Karnataka 2008 against 2004 lands here with all 224 seats incomparable, and
    // says so instead of reporting a flip count about territory that was redrawn between the two.
    if (incomparable > 0) {
      findings.push({
        type: "seats_incomparable",
        count: incomparable,
        previousYear,
        previousEpochId: then.at(0)?.epochId ?? null,
        epochId: now.at(0)?.epochId ?? null,
      });
    }

    // 4. Turnout, where both sides published one. A share of electors, so it is comparable across a roll
    // that grew — which India's has, by about a third over this registry's span. This one is a STATE-LEVEL
    // aggregate, so it survives a delimitation: a state's electorate is a real quantity across a redraw
    // even when no individual seat can be matched.
    const turnout = (side: readonly ShiftRow[]): number | null => {
      const voters = side.reduce((n, r) => n + (r.voters ?? 0), 0);
      const electors = side.reduce((n, r) => n + (r.electors ?? 0), 0);
      return electors > 0 && voters > 0 ? (100 * voters) / electors : null;
    };
    const tNow = turnout(now);
    const tThen = turnout(then);
    if (tNow !== null && tThen !== null) {
      findings.push({
        type: "turnout_change",
        nowPct: tNow,
        thenPct: tThen,
        deltaPp: Number((tNow - tThen).toFixed(1)),
        previousYear,
        year,
      });
    }

    // 5. Whether the leader holds the house outright — the fact a seat count alone does not settle.
    const top = [...a.entries()].sort((x, y) => y[1].n - x[1].n)[0];
    const contested = now.length;
    if (contested > 0) {
      findings.push({
        type: "majority",
        party: top === undefined ? null : ref(top[0], top[1].label),
        seats: top?.[1].n ?? 0,
        contested,
        needed: Math.floor(contested / 2) + 1,
        holds: top !== undefined && top[1].n > contested / 2,
      });
    }

    return {
      previousYear,
      previousId,
      findings,
      // Derived, never stored: one formatter means a chart's label and a screen reader's sentence cannot
      // disagree about a number. See findings.ts.
      lines: summariseAll(findings),
      comparableSeats: comparable,
      incomparableSeats: incomparable,
    };
  });
}

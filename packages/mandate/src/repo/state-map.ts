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
// The registry holds 294 assembly polygons and 19 district outlines, all for West Bengal, and nothing else.
// So a constituency map is a map for one jurisdiction of 36 and a table for the other 35. The other 35 still
// get the district TALLY — "12 of 18 constituencies won by INC" — because that is computed from results and
// `place_version.district_place_id`, which every jurisdiction has. See docs/product/map-validation.md.
//
// ── A DISTRICT NEVER HAS A WINNER ──
//
// `DistrictTally` carries `parties`, plural, and no `winner` field. There is nowhere in this type to record
// "INC won Bengaluru Urban", because a district does not elect anybody: its constituencies do, and the honest
// sentence is "12 of 18 constituencies won by INC". Making that unrepresentable is cheaper than remembering
// not to say it.

import type { DatabaseSync } from "node:sqlite";
import { all, get } from "../db/index.ts";
import { read } from "./index.ts";
import { CHRONO_DESC } from "./elections.ts";

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

    const elections = all<ElectionChoice>(
      db,
      `SELECT e.id AS id, e.name AS name, e.year AS year, e.house AS house, e.kind AS kind,
              (SELECT COUNT(*) FROM contest c WHERE c.election_id = e.id) AS seats
         FROM election e
        WHERE e.jurisdiction_place_id = ?
        ORDER BY ${CHRONO_DESC}`,
      jurisdictionId,
    );

    // A house filter narrows the selector rather than the map: a reader who asked for the Lok Sabha should see
    // the Lok Sabha elections, and if there are none they should be told, not silently shown an assembly.
    const house = p.house === "pc" || p.house === "ac" ? p.house : null;
    const offered = house === null ? elections : elections.filter((e) => e.house === house);
    // A FULL ELECTION IS THE DEFAULT, not merely the newest one. Jammu & Kashmir's newest row is a
    // single-seat 2017 by-election, and opening the state's map on one polygon out of 87 answers no question
    // anyone arrived with. A by-poll is still selectable; it is just not what the map opens on.
    const election =
      offered.find((e) => e.id === p.election) ??
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
        geometry: { viewBox: null, drawable: 0, total: 0, epochs: [], epochsHeld },
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
        WHERE c.election_id = ?
        ORDER BY pv.number, pv.canonical_name`,
      election.id,
    );

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
          ? `/pl/${x.stateId}/${x.districtId.slice(x.stateId.length + 1)}/${slug(x.name)}`
          : null,
      path: x.path,
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

    return {
      jurisdictionId,
      jurisdictionName: name,
      elections,
      election,
      seats,
      districts,
      legend,
      geometry: {
        viewBox: rows.find((r) => r.viewBox !== null)?.viewBox ?? null,
        drawable: seats.filter((s) => s.path !== null).length,
        total: seats.length,
        epochs: [...new Set(rows.map((r) => r.epoch))].sort(),
        epochsHeld,
      },
    };
  });
}

/** The seats of one district, in the order the map and the table both want them. */
export function seatsIn(view: StateMapView, districtId: string | null): SeatMark[] {
  if (districtId === null) return view.seats;
  return view.seats.filter((s) => s.districtId === districtId);
}

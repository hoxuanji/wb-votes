// §6.1 Situation Room — the landing surface's data layer.
//
// The spec's Situation Room has eight sections. Five of them (Today's Record, Most Watched, Media
// Pulse, Institutional Arithmetic, and the live phase ladder) need data this registry does not
// hold: a news feed, attention telemetry, Rajya Sabha composition, and a poll-date calendar.
// Building empty frames for them would be the "coming in M5" placeholder this project has a
// standing rule against, so they are absent rather than stubbed.
//
// What IS here is computed from the 4,357 result rows and 1,135 turnout rows in the registry, and
// changes whenever those change — which is the acceptance test §6.1 sets for itself.
//
// One deliberate deviation from §6.4, stated on the record: the spec asks for a *composite*
// competitiveness score blending last-margin, swing volatility and incumbency retention. A blend
// needs weights, and the ranking it produces is an artifact of weights nobody outside this file
// can defend or audit. Two separately-ranked lists — marginality (last margin, the measure every
// analyst already uses) and volatility (party changes across four elections) — answer the same
// question with no free parameters. Add the composite when someone can justify the weights.

import type { DatabaseSync } from "node:sqlite";
import { all, get } from "../db/index.ts";
import { loadSources, yearOf, type SourceRef } from "./index.ts";

/** A seat, its latest verdict, and how safe it has been. */
export type SeatRow = {
  placeId: string;
  name: string;
  district: string;
  /** URL path for the Place Brief, e.g. "/pl/wb/cooch-behar/mekliganj". */
  href: string;
  year: number;
  winnerParty: string | null;
  winnerName: string | null;
  marginPct: number | null;
  marginVotes: number | null;
  turnoutPct: number | null;
  /** Party changes between consecutive contests, across every election held here. */
  flips: number;
  /** Elections this seat has results for — the denominator behind `flips`. */
  contests: number;
};

export type PartyMomentum = {
  partyId: string;
  short: string;
  seatsContested: number | null;
  seatsWon: number;
  prevSeatsWon: number | null;
  /** Seats won against the previous election. Null when the party won nothing there AND fielded
   *  nobody there — an absence is not a zero. */
  deltaSeats: number | null;
  /** Vote share, and its change, ONLY for elections where the source supplied candidate vote
   *  counts. Null for 2026, where it did not. A page must render the null, not a 0. */
  sharePct: number | null;
  deltaPp: number | null;
};

/** A computed lead, never an accusation (§6.1 item 7, P5). */
export type Flag = {
  rule: string;
  subject: string;
  href: string | null;
  detail: string;
};

export type Corpus = {
  persons: number;
  claims: number;
  sources: number;
  /** Sources whose bytes were actually retrieved. The rest are publisher assertions. */
  fetched: number;
  pendingMerges: number;
};

export type Situation = {
  latestYear: number;
  latestElectionId: string;
  seatsDecided: number;
  /** Whether the latest election supplied candidate vote counts. False for 2026, which is why the
   *  momentum table ranks on seats and prints "not reported" where a share would go. */
  voteCountsPresent: boolean;
  /** The five-second answer (§1), computed rather than written. */
  headline: string;
  marginal: SeatRow[];
  volatile: SeatRow[];
  momentum: PartyMomentum[];
  flags: Flag[];
  corpus: Corpus;
  sources: SourceRef[];
};

/** A seat is "marginal" below this margin. 5pp is the conventional cut in Indian election
 *  reporting and is stated here so the headline's number is reproducible. */
export const MARGINAL_PP = 5;

const TOP_N = 8;

type ContestSql = {
  place_id: string;
  ac_name: string;
  district: string;
  /** The state segment of the place path, from the place tree rather than from a literal. */
  state_id: string;
  /** The jurisdiction the election was held in, for the headline. */
  jurisdiction: string;
  election_id: string;
  votes_cast: number | null;
  margin: number | null;
  winner_party: string | null;
  winner_short: string | null;
  winner_name: string | null;
  electors: number | null;
  voters: number | null;
  source_id: string;
};

/**
 * Every contest with its winner, margin, turnout and party — one query, one pass.
 *
 * The join to `result` is on `is_winner = 1 AND revision = 0`: revision is the supersession
 * column, so omitting it would double-count any seat that ever gets a corrected result.
 *
 * The margin denominator is `turnout.voters`, NOT `sum(result.votes)`, and that is load-bearing in
 * two directions. For 2011-2021 the registry holds only the top contestants (~4.5 rows a seat, not
 * the full field), so a sum of those votes understates votes cast by 1-4% and would inflate every
 * margin percentage. For 2026 the source supplies no candidate vote counts at all — every
 * `result.votes` is 0 — so a sum would be 0 and the whole latest election would silently vanish
 * from every ranking on this page. `turnout.voters` is complete for 2026 (293/293, exact against
 * the source's own totalVotes) and is the correct denominator regardless: a margin is a share of
 * the votes cast, not of the votes we happen to have rows for.
 */
function contestRows(db: DatabaseSync): ContestSql[] {
  return all<ContestSql>(
    db,
    `SELECT pv.place_id                         AS place_id,
            pv.canonical_name                   AS ac_name,
            d.canonical_name                    AS district,
            COALESCE(st.id, d.parent_id, '')     AS state_id,
            COALESCE(j.canonical_name, st.canonical_name, 'this jurisdiction') AS jurisdiction,
            c.election_id                        AS election_id,
            t.voters                             AS votes_cast,
            w.margin                             AS margin,
            p.id                                 AS winner_party,
            p.short_name                         AS winner_short,
            per.canonical_name                   AS winner_name,
            t.electors                           AS electors,
            t.voters                             AS voters,
            w.source_id                          AS source_id
       FROM contest c
       JOIN place_version pv ON pv.id = c.place_version_id
       JOIN place ac         ON ac.id = pv.place_id
       LEFT JOIN place d     ON d.id = ac.parent_id
       LEFT JOIN place st    ON st.id = d.parent_id
       JOIN election el      ON el.id = c.election_id
       LEFT JOIN place j     ON j.id = el.jurisdiction_place_id
       JOIN result w         ON w.contest_id = c.id AND w.is_winner = 1 AND w.revision = 0
       JOIN candidacy cand   ON cand.id = w.candidacy_id
       LEFT JOIN person per  ON per.id = cand.person_id
       LEFT JOIN party_version pvv ON pvv.id = cand.party_version_id
       LEFT JOIN party p     ON p.id = pvv.party_id
       LEFT JOIN turnout t   ON t.contest_id = c.id AND t.scope = 'contest'
      ORDER BY pv.place_id, substr(c.election_id, -4), c.election_id`,
  );
}

function pct(part: number | null, whole: number | null): number | null {
  if (part === null || whole === null || whole <= 0) return null;
  return (part / whole) * 100;
}

/** "Cooch Behar" -> "cooch-behar", matching the slug /pl/[...path] resolves against. */
export function slug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The place path, with the state taken from the place tree. It was `/pl/wb/...` as a literal, which
 *  would have pointed every other state's seats at West Bengal instead of failing. */
function href(stateId: string, district: string | null, ac: string): string | null {
  if (district === null || stateId === "") return null;
  return `/pl/${stateId}/${slug(district)}/${slug(ac)}`;
}

export function getSituation(db: DatabaseSync): Situation | null {
  const rows = contestRows(db);
  if (rows.length === 0) return null;

  const latestYear = Math.max(...rows.map((r) => yearOf(r.election_id)));
  const latestElectionId =
    rows.find((r) => yearOf(r.election_id) === latestYear)?.election_id ?? "";

  // ── per-seat history, so flips and the latest verdict come from one grouping ──────────────
  const bySeat = new Map<string, ContestSql[]>();
  for (const r of rows) {
    const list = bySeat.get(r.place_id);
    if (list === undefined) bySeat.set(r.place_id, [r]);
    else list.push(r);
  }

  const seats: SeatRow[] = [];
  for (const [placeId, history] of bySeat) {
    const ordered = [...history].sort((a, b) => yearOf(a.election_id) - yearOf(b.election_id));
    const latest = ordered.at(-1);
    if (latest === undefined || yearOf(latest.election_id) !== latestYear) continue;

    let flips = 0;
    for (let i = 1; i < ordered.length; i += 1) {
      const prev = ordered[i - 1]?.winner_party;
      const now = ordered[i]?.winner_party;
      // An unknown party on either side is not a flip and not a hold — it is unknown.
      if (prev != null && now != null && prev !== now) flips += 1;
    }

    seats.push({
      placeId,
      name: latest.ac_name,
      district: latest.district ?? "—",
      href: href(latest.state_id, latest.district, latest.ac_name) ?? "/pl",
      year: latestYear,
      winnerParty: latest.winner_party,
      winnerName: latest.winner_name,
      marginPct: pct(latest.margin, latest.votes_cast),
      marginVotes: latest.margin,
      turnoutPct: pct(latest.voters, latest.electors),
      flips,
      contests: ordered.length,
    });
  }

  const withMargin = seats.filter((s) => s.marginPct !== null);
  const marginal = [...withMargin]
    .sort((a, b) => (a.marginPct ?? 0) - (b.marginPct ?? 0))
    .slice(0, TOP_N);
  // Ties on flips break on marginality, so the second list never repeats the first's order.
  const volatile = [...withMargin]
    .filter((s) => s.flips > 0)
    .sort((a, b) => b.flips - a.flips || (a.marginPct ?? 0) - (b.marginPct ?? 0))
    .slice(0, TOP_N);

  const under = withMargin.filter((s) => (s.marginPct ?? 0) < MARGINAL_PP).length;
  // The jurisdiction comes from election.jurisdiction_place_id, not from this file. "West Bengal" was
  // written in here, which is fine while one state is loaded and a lie the moment a second one is.
  const where = rows.find((r) => yearOf(r.election_id) === latestYear)?.jurisdiction ?? "this jurisdiction";
  const headline =
    under === 0
      ? `Every seat in the ${latestYear} ${where} election was decided by more than ${MARGINAL_PP} percentage points.`
      : `${under} of ${withMargin.length} seats were decided by under ${MARGINAL_PP} percentage points in ${latestYear}.`;

  // The kind is read off the latest election, not assumed: whichever election is newest defines what
  // "the previous election" may be compared against.
  const latestKind =
    get<{ kind: string }>(db, `SELECT kind FROM election WHERE id = ?`, latestElectionId)?.kind ??
    "assembly";
  const momentum = partyMomentum(db, latestYear, latestKind);

  return {
    latestYear,
    latestElectionId,
    seatsDecided: withMargin.length,
    voteCountsPresent: momentum.some((m) => m.sharePct !== null),
    headline,
    marginal,
    volatile,
    momentum,
    flags: flags(db, seats, latestKind),
    corpus: corpus(db),
    sources: loadSources(
      db,
      [...new Set(rows.filter((r) => yearOf(r.election_id) === latestYear).map((r) => r.source_id))],
      [],
    ),
  };
}

type MomentumSql = {
  party_id: string;
  short: string | null;
  election_id: string;
  votes: number;
  contested: number;
  won: number;
};

/**
 * Seats won and vote share by party for the latest two elections, and the change between them.
 *
 * Two separate honesty problems live in this function.
 *
 * 1. **2026 has no candidate vote counts.** Every `result.votes` for that election is 0, so a vote
 *    share computed from them is 0.00% for every party — a number that looks like a measurement and
 *    is actually an absence. `sharePct` is therefore null whenever the election's votes sum to 0,
 *    and seats won is the only momentum measure this page can honestly rank on.
 * 2. **Share is of counted votes in the contests that election held**, not of the electorate. That
 *    comparison holds here because the seat set is identical across these four elections (294 every
 *    time). It stops holding the moment a delimitation lands, which is what `boundary_epoch` is for.
 */
export function partyMomentum(
  db: DatabaseSync,
  latestYear: number,
  kind = "assembly",
): PartyMomentum[] {
  // Scoped to ONE election kind, and that is not a refinement — it is a correctness fix. Loading Lok
  // Sabha 2024 made "the previous election" resolve to 2024 instead of the 2021 assembly, so this
  // function reported BJP's previous seats as 12 (its Lok Sabha total in this state) rather than 76,
  // and the Situation Room printed "BJP +180". An assembly result is only comparable to another
  // assembly result: different body, different seat count, different electorate.
  const rows = all<MomentumSql>(
    db,
    `SELECT p.id                             AS party_id,
            p.short_name                     AS short,
            c.election_id                    AS election_id,
            sum(r.votes)                     AS votes,
            count(*)                         AS contested,
            sum(CASE WHEN r.is_winner = 1 THEN 1 ELSE 0 END) AS won
       FROM result r
       JOIN contest c        ON c.id = r.contest_id
       JOIN election e       ON e.id = c.election_id
       JOIN candidacy cand   ON cand.id = r.candidacy_id
       JOIN party_version pv ON pv.id = cand.party_version_id
       JOIN party p          ON p.id = pv.party_id
      WHERE r.revision = 0 AND e.kind = ?
      GROUP BY p.id, c.election_id`,
    kind,
  );
  if (rows.length === 0) return [];

  const years = [...new Set(rows.map((r) => yearOf(r.election_id)))].sort((a, b) => a - b);
  const prevYear = years.filter((y) => y < latestYear).at(-1) ?? null;

  const totalFor = (year: number): number =>
    rows.filter((r) => yearOf(r.election_id) === year).reduce((n, r) => n + r.votes, 0);
  const latestTotal = totalFor(latestYear);
  const prevTotal = prevYear === null ? 0 : totalFor(prevYear);

  const out: PartyMomentum[] = [];
  // 2026 stores winners only — 293 result rows for 293 seats, every one is_winner = 1. In that
  // election `count(*)` per party equals its wins, so reporting it as "seats contested" would render
  // "192 of 192" and read as a party that won every seat it fielded. Contested is unmeasured, not
  // equal to won, so it is null unless the election has at least one losing row.
  const losersInLatest =
    get<{ n: number }>(
      db,
      `SELECT count(*) AS n FROM result r
         JOIN contest c ON c.id = r.contest_id
         JOIN election e ON e.id = c.election_id
        WHERE r.revision = 0 AND r.is_winner = 0 AND e.kind = ? AND c.election_id LIKE ?`,
      kind,
      `%${latestYear}%`,
    )?.n ?? 0;

  for (const r of rows) {
    if (yearOf(r.election_id) !== latestYear) continue;
    const share = pct(r.votes, latestTotal);
    const before = rows.find(
      (x) => x.party_id === r.party_id && prevYear !== null && yearOf(x.election_id) === prevYear,
    );
    const prevShare = before === undefined ? null : pct(before.votes, prevTotal);
    out.push({
      partyId: r.party_id,
      short: r.short ?? r.party_id,
      seatsContested: losersInLatest > 0 ? r.contested : null,
      seatsWon: r.won,
      prevSeatsWon: before?.won ?? null,
      deltaSeats: before === undefined ? null : r.won - before.won,
      sharePct: share,
      deltaPp: share === null || prevShare === null ? null : share - prevShare,
    });
  }
  // Seats first, because share is null for the latest election; share breaks ties where it exists.
  return out.sort((a, b) => b.seatsWon - a.seatsWon || (b.sharePct ?? 0) - (a.sharePct ?? 0));
}

/** Two rules, both computed, both a lead rather than a finding. Each names its own threshold so a
 *  reader can disagree with it. */
const TURNOUT_DEVIATION_PP = 6;

function flags(db: DatabaseSync, seats: readonly SeatRow[], kind: string): Flag[] {
  const out: Flag[] = [];

  // Rule 1 — a seat's turnout departs from its district's mean.
  const byDistrict = new Map<string, SeatRow[]>();
  for (const s of seats) {
    if (s.turnoutPct === null) continue;
    const list = byDistrict.get(s.district);
    if (list === undefined) byDistrict.set(s.district, [s]);
    else list.push(s);
  }
  for (const [district, list] of byDistrict) {
    if (list.length < 3) continue; // a mean of two seats is not a baseline
    const mean = list.reduce((n, s) => n + (s.turnoutPct ?? 0), 0) / list.length;
    for (const s of list) {
      const d = (s.turnoutPct ?? 0) - mean;
      if (Math.abs(d) < TURNOUT_DEVIATION_PP) continue;
      out.push({
        rule: `turnout ≥ ${TURNOUT_DEVIATION_PP}pp from district mean`,
        subject: s.name,
        href: s.href,
        detail: `${(s.turnoutPct ?? 0).toFixed(1)}% against ${district}'s ${mean.toFixed(1)}% mean across ${list.length} seats — ${d > 0 ? "+" : ""}${d.toFixed(1)}pp.`,
      });
    }
  }

  // Rule 2 — a party contests far fewer seats than it did last time. Not misconduct: a seat-sharing
  // deal looks exactly like this, which is why the flag says "review", not "withdrew".
  // Same kind only. Unscoped, this compared 2026 assembly contest counts against Lok Sabha 2024 and
  // every party looked like it had halved its footprint, so all five real flags disappeared.
  const contest = all<{ party_id: string; short: string | null; election_id: string; n: number }>(
    db,
    `SELECT p.id AS party_id, p.short_name AS short, c.election_id AS election_id, count(*) AS n
       FROM result r
       JOIN contest c        ON c.id = r.contest_id
       JOIN election e       ON e.id = c.election_id
       JOIN candidacy cand   ON cand.id = r.candidacy_id
       JOIN party_version pv ON pv.id = cand.party_version_id
       JOIN party p          ON p.id = pv.party_id
      WHERE r.revision = 0 AND e.kind = ?
      GROUP BY p.id, c.election_id`,
    kind,
  );
  const years = [...new Set(contest.map((r) => yearOf(r.election_id)))].sort((a, b) => a - b);
  const latest = years.at(-1);
  const prev = years.at(-2);
  if (latest !== undefined && prev !== undefined) {
    for (const now of contest.filter((r) => yearOf(r.election_id) === latest)) {
      const before = contest.find(
        (r) => r.party_id === now.party_id && yearOf(r.election_id) === prev,
      );
      if (before === undefined || before.n < 20) continue;
      if (now.n > before.n / 2) continue;
      out.push({
        rule: "seats contested fell by more than half",
        subject: before.short ?? before.party_id,
        href: null,
        detail: `${before.n} seats in ${prev}, ${now.n} in ${latest}. Flagged for review — a seat-sharing agreement produces the same shape as a withdrawal.`,
      });
    }
  }

  return out;
}

function corpus(db: DatabaseSync): Corpus {
  const n = (sql: string): number => get<{ n: number }>(db, sql)?.n ?? 0;
  return {
    persons: n("SELECT count(*) AS n FROM person"),
    claims: n("SELECT count(*) AS n FROM claim"),
    sources: n("SELECT count(*) AS n FROM source"),
    fetched: n("SELECT count(*) AS n FROM source WHERE retrieval_kind = 'fetched'"),
    pendingMerges: n("SELECT count(*) AS n FROM person_merge_candidate WHERE state = 'pending'"),
  };
}

// SYNTHETIC DATA. EVERYTHING THIS MODULE WRITES IS MADE UP. IT MUST NEVER BE SHIPPED, NEVER BE COMMITTED AS A DATABASE, NEVER BE LOADED
// INTO A DEPLOYED REGISTRY, AND NEVER BE PRESENTED AS REAL ELECTION RESULTS, TO ANYONE, IN ANY FORM. THE PARTIES, THE SEATS AND THE
// SHAPE OF THE ELECTIONS RESEMBLE REAL ONES SO THAT A PAGE LOOKS RIGHT; THE WINNERS, THE VOTES, THE MARGINS AND THE CANDIDATES ARE
// RANDOM NUMBERS FROM A SEEDED GENERATOR. NO NUMBER HERE IS A FACT ABOUT ANY ELECTION THAT HAS BEEN HELD.
//
// WHAT IT IS FOR. The registry on a developer's machine holds one state, and the situation-room front page is about the country: its
// map, its time machine, its rail of elections to come. A page built and looked at against one state shows one coloured polygon. This
// fills a migrated, empty database with enough of a country to check the page's layout, motion and edge cases in a real browser:
//
//   · 18 jurisdictions with assembly elections between 2006 and 2026 on staggered years (17 states and Delhi), their seat counts those
//     of ingest/india.ts (a state's assembly is the size it really is), and three Lok Sabha elections (2014, 2019 and 2024) over the
//     same 18, each state's share of seats the real one;
//   · 20 parties named by ids the party-ink palette recognises (BJP, INC, AITC, CPI(M), DMK, ...) plus independents, who are in the
//     registry as the real ones are, with no party row and the string 'IND';
//   · terms that fall due in 2026, 2027 and 2028 on the five-year rule, one term already past (Bihar, last elected 2020), one election
//     held this year (West Bengal, whose results carry winners and declared margins and no vote counts, as the real 2026 seed does, so
//     its turnout is unverified), and two TIES for most seats on purpose (Goa 2017 and Manipur 2022, the second of them the state's
//     current house) so that "no leader" is a state the page can be looked at in;
//   · optionally (`announced: true`) one election the Commission has announced, Goa's next, for the announced branch of the rail.
//     OFF BY DEFAULT: an election row with no contests is, to `latestPerJurisdiction`, the newest election of its state, so Goa would
//     lose its colour on every panel that reads `currentStandings`. That is a defect of those readers, left as it is; the flag is for
//     looking at the rail only.
//
// HOW IT IS MARKED. Every election id starts with `demo-`. Every election name starts with "SYNTHETIC demo:". The one source row says
// SYNTHETIC in its publisher and its title, and carries a publisher note that says it again, so the provenance drawer of any figure
// says what it is. Seats are "Demo KA-017" and candidates "Demo Candidate 000123".
//
// DETERMINISTIC. Every election has its own seeded generator, keyed by its id, so a rebuild is byte-for-byte the same registry.
// The builder is meant for a database that has been migrated and is empty.
//
// `shiftFeedTimes` is the other half of this module: it re-dates the demo live feed (ops/probe/demo/demo-live.json) to a moment the
// caller names, because a feed whose timestamp was fixed when the file was written is stale for every reader who opens it later.
//
// Not exported through repo/index.ts or db/index.ts, and not imported by anything that ships: ops/probe/demo/build-demo-registry.mjs and
// the tests are its only callers.

import type { DatabaseSync } from "node:sqlite";
import { atomically } from "../db/write.ts";
import { JURISDICTIONS } from "../ingest/india.ts";
import { ensureJurisdictions } from "../ingest/jurisdictions.ts";

/* ────────────────────────────── what the country is made of ────────────────────────────── */

type PartyDef = { id: string; short: string; name: string; kind: "national" | "state" };

/** Ids the party-ink palette has a curated colour for (data/party-ink.json); the short name is what a table column holds. */
export const SYNTHETIC_PARTIES: readonly PartyDef[] = [
  { id: "BJP", short: "BJP", name: "Bharatiya Janata Party", kind: "national" },
  { id: "INC", short: "INC", name: "Indian National Congress", kind: "national" },
  { id: "AITC", short: "TMC", name: "All India Trinamool Congress", kind: "national" },
  { id: "CPI(M)", short: "CPM", name: "Communist Party of India (Marxist)", kind: "national" },
  { id: "BSP", short: "BSP", name: "Bahujan Samaj Party", kind: "national" },
  { id: "NCP", short: "NCP", name: "Nationalist Congress Party", kind: "national" },
  { id: "AAAP", short: "AAP", name: "Aam Aadmi Party", kind: "national" },
  { id: "DMK", short: "DMK", name: "Dravida Munnetra Kazhagam", kind: "state" },
  { id: "ADMK", short: "AIADMK", name: "All India Anna Dravida Munnetra Kazhagam", kind: "state" },
  { id: "SP", short: "SP", name: "Samajwadi Party", kind: "state" },
  { id: "BJD", short: "BJD", name: "Biju Janata Dal", kind: "state" },
  { id: "SHS", short: "SHS", name: "Shiv Sena", kind: "state" },
  { id: "JD(U)", short: "JD(U)", name: "Janata Dal (United)", kind: "state" },
  { id: "RJD", short: "RJD", name: "Rashtriya Janata Dal", kind: "state" },
  { id: "SAD", short: "SAD", name: "Shiromani Akali Dal", kind: "state" },
  { id: "AIUDF", short: "AIUDF", name: "All India United Democratic Front", kind: "state" },
  { id: "AGP", short: "AGP", name: "Asom Gana Parishad", kind: "state" },
  { id: "JD(S)", short: "JD(S)", name: "Janata Dal (Secular)", kind: "state" },
  { id: "IUML", short: "IUML", name: "Indian Union Muslim League", kind: "state" },
  { id: "NPP", short: "NPP", name: "National People's Party", kind: "state" },
];

/** The independents: not a party row, but the string the source printed, as the real registry holds them. */
const INDEPENDENT = "IND";

/** A state's parties and how much of the vote each starts from; the election's own draw moves them. */
type Plan = {
  id: string;
  /** The years an assembly election was held, the last of them the current house. */
  years: readonly number[];
  /** The month of the poll, or null to leave it unrecorded as the real registry does. */
  month: number | null;
  weights: readonly (readonly [string, number])[];
};

/**
 * 17 states and Delhi. Cycles are the five-year ones of their real states (so the terms fall due when they would) with Delhi's irregular
 * gap kept for the staggered look; the weights are invented.
 */
export const SYNTHETIC_STATES: readonly Plan[] = [
  { id: "wb", years: [2006, 2011, 2016, 2021, 2026], month: 4, weights: [["AITC", 44], ["BJP", 30], ["CPI(M)", 13], ["INC", 10], [INDEPENDENT, 3]] },
  { id: "tn", years: [2006, 2011, 2016, 2021], month: 4, weights: [["DMK", 38], ["ADMK", 36], ["INC", 10], ["BJP", 10], [INDEPENDENT, 3]] },
  { id: "kl", years: [2006, 2011, 2016, 2021], month: null, weights: [["CPI(M)", 40], ["INC", 36], ["IUML", 8], ["BJP", 12], [INDEPENDENT, 4]] },
  { id: "as", years: [2006, 2011, 2016, 2021], month: 4, weights: [["BJP", 38], ["INC", 38], ["AIUDF", 10], ["AGP", 10], [INDEPENDENT, 4]] },
  { id: "br", years: [2010, 2015, 2020], month: 11, weights: [["JD(U)", 32], ["RJD", 30], ["BJP", 26], ["INC", 8], [INDEPENDENT, 4]] },
  { id: "up", years: [2007, 2012, 2017, 2022], month: 2, weights: [["SP", 34], ["BJP", 34], ["BSP", 18], ["INC", 10], [INDEPENDENT, 4]] },
  { id: "pb", years: [2007, 2012, 2017, 2022], month: null, weights: [["SAD", 34], ["INC", 34], ["AAAP", 20], ["BJP", 8], [INDEPENDENT, 4]] },
  { id: "uk", years: [2007, 2012, 2017, 2022], month: 2, weights: [["BJP", 46], ["INC", 46], ["BSP", 4], [INDEPENDENT, 4]] },
  { id: "ga", years: [2007, 2012, 2017, 2022], month: null, weights: [["BJP", 42], ["INC", 42], ["AAAP", 6], [INDEPENDENT, 10]] },
  { id: "gj", years: [2007, 2012, 2017, 2022], month: 12, weights: [["BJP", 60], ["INC", 34], ["AAAP", 4], [INDEPENDENT, 2]] },
  { id: "hp", years: [2007, 2012, 2017, 2022], month: 11, weights: [["BJP", 48], ["INC", 48], [INDEPENDENT, 4]] },
  { id: "mn", years: [2007, 2012, 2017, 2022], month: 3, weights: [["INC", 40], ["BJP", 38], ["NPP", 14], [INDEPENDENT, 8]] },
  { id: "ka", years: [2008, 2013, 2018, 2023], month: 5, weights: [["INC", 38], ["BJP", 36], ["JD(S)", 20], [INDEPENDENT, 6]] },
  { id: "rj", years: [2008, 2013, 2018, 2023], month: null, weights: [["BJP", 46], ["INC", 46], ["BSP", 4], [INDEPENDENT, 4]] },
  { id: "mp", years: [2008, 2013, 2018, 2023], month: 11, weights: [["BJP", 48], ["INC", 48], [INDEPENDENT, 4]] },
  { id: "mh", years: [2009, 2014, 2019, 2024], month: 10, weights: [["BJP", 28], ["SHS", 22], ["NCP", 20], ["INC", 24], [INDEPENDENT, 6]] },
  { id: "od", years: [2009, 2014, 2019, 2024], month: 4, weights: [["BJD", 52], ["BJP", 30], ["INC", 16], [INDEPENDENT, 2]] },
  { id: "dl", years: [2008, 2013, 2015, 2020, 2025], month: 2, weights: [["AAAP", 44], ["BJP", 36], ["INC", 16], [INDEPENDENT, 4]] },
];

/** The Lok Sabha elections, and the national swing each puts on the parties (a multiplier on a party's weight). */
const GENERAL: readonly { year: number; tilt: Readonly<Record<string, number>> }[] = [
  { year: 2014, tilt: { BJP: 1.5, INC: 0.6 } },
  { year: 2019, tilt: { BJP: 1.35, INC: 0.7 } },
  { year: 2024, tilt: { BJP: 1.1, INC: 1.1 } },
];

/** Forced results, for the two ties: seats by party. They sum to the state's assembly (40 and 60). */
const FORCED: Readonly<Record<string, readonly (readonly [string, number])[]>> = {
  "demo-ga-assembly-2017": [["BJP", 14], ["INC", 14], ["AAAP", 6], [INDEPENDENT, 6]],
  "demo-mn-assembly-2022": [["BJP", 24], ["INC", 24], ["NPP", 6], [INDEPENDENT, 6]],
};

/** The election that carries winners and declared margins and no vote counts, as the real West Bengal 2026 does. */
const WITHOUT_COUNTS = "demo-wb-assembly-2026";

const SOURCE = "demo-source-synthetic";
const EPOCH = "delim-demo";
const WHEN = "2026-01-01T00:00:00Z";

/* ────────────────────────────── a seeded generator ────────────────────────────── */

type Rand = () => number;

/** FNV-1a, then mulberry32: the same seed string gives the same stream in every process and every version of Node. */
function seeded(seed: string): Rand {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  let a = h;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (r: Rand, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));

/** A standard normal draw (Box-Muller). */
function normal(r: Rand): number {
  return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
}

/** One of `items`, by weight. */
function pick<T>(r: Rand, items: readonly (readonly [T, number])[]): T {
  const sum = items.reduce((n, [, w]) => n + w, 0);
  let at = r() * sum;
  for (const [item, w] of items) {
    at -= w;
    if (at < 0) return item;
  }
  return (items.at(-1) as readonly [T, number])[0];
}

/**
 * Seats by party for one election: each party's weight moved by the election's own draw (and by a national tilt, and by a fatigue on
 * whoever won last time), turned into a share of seats with the amplification an electoral system gives the front-runner, and rounded
 * so the seats add up to `total`.
 */
function seatCounts(
  r: Rand,
  total: number,
  weights: readonly (readonly [string, number])[],
  fatigued: string | null,
  amplify: number,
  tilt: Readonly<Record<string, number>>,
): [string, number][] {
  const moved = weights.map(([k, w]) => w * (tilt[k] ?? 1) * (k === fatigued ? 0.8 : 1) * Math.exp(0.22 * normal(r)));
  const sum = moved.reduce((n, x) => n + x, 0);
  const powered = moved.map((x) => (x / sum) ** amplify);
  const norm = powered.reduce((n, x) => n + x, 0);
  const quota = powered.map((x) => (total * x) / norm);
  const seats = quota.map(Math.floor);
  let left = total - seats.reduce((n, x) => n + x, 0);
  [...quota.keys()]
    .sort((a, b) => (quota[b] as number) % 1 - ((quota[a] as number) % 1) || a - b)
    .forEach((i) => {
      if (left > 0) {
        seats[i] = (seats[i] as number) + 1;
        left -= 1;
      }
    });
  // No tie that was not asked for: two parties level at the top by rounding alone would be a state without a leader that nobody chose.
  // The ties the registry holds on purpose are FORCED below; any other goes to the party whose unrounded quota was larger.
  const order = [...seats.keys()].sort((a, b) => (seats[b] as number) - (seats[a] as number) || a - b);
  const [a, b] = [order[0] as number, order[1] as number];
  if (b !== undefined && seats[a] === seats[b]) {
    const [more, less] = (quota[a] as number) >= (quota[b] as number) ? [a, b] : [b, a];
    seats[more] = (seats[more] as number) + 1;
    seats[less] = (seats[less] as number) - 1;
  }
  return weights.map(([k], i) => [k, seats[i] as number]);
}

/**
 * Which seat each party wins: seats lean to a party of their own (`affinity`, fixed for the state), so a seat does not change hands at
 * random between two elections. Parties take their seats largest first; each takes the unassigned seats that lean to it, then the ones
 * its noise favours.
 */
function assign(r: Rand, counts: readonly (readonly [string, number])[], affinity: readonly string[]): string[] {
  const winner = new Array<string>(affinity.length);
  const free = new Set(affinity.keys());
  for (const [party, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    [...free]
      .map((seat) => ({ seat, score: (affinity[seat] === party ? 1 : 0) + r() * 0.8 }))
      .sort((a, b) => b.score - a.score || a.seat - b.seat)
      .slice(0, n)
      .forEach(({ seat }) => {
        winner[seat] = party;
        free.delete(seat);
      });
  }
  return winner;
}

/* ────────────────────────────── the builder ────────────────────────────── */

const pad = (n: number, width: number): string => String(n).padStart(width, "0");

export type SyntheticOptions = {
  /** Add one election the Commission has announced (Goa's next, for 2027). Off by default: see the header. */
  announced?: boolean;
};

/**
 * Fill a migrated, empty registry with the synthetic country described above. One transaction: either all of it is there or none is.
 * `db` is a fresh ":memory:" or a new file; running it twice on one database fails on the second ids, which is the right answer.
 */
export function buildSyntheticRegistry(db: DatabaseSync, options: SyntheticOptions = {}): void {
  ensureJurisdictions(db);
  atomically(db, "synthetic_registry", () => {
    db.prepare(
      `INSERT INTO source (id, kind, publisher, title, url, retrieved_at, published_on, doc_hash, licence, publisher_note)
       VALUES (?, 'static_module', ?, ?, NULL, ?, '2026-01-01', 'SYNTHETIC-NOT-A-REAL-HASH', 'none: invented data', ?)`,
    ).run(
      SOURCE,
      "SYNTHETIC: made-up data from wb-votes' synthetic registry builder, not from any publisher",
      "SYNTHETIC demo results: invented for visual checks, not real, never to be shipped or presented as real",
      WHEN,
      "SYNTHETIC. Every result, vote count, margin, seat and candidate in this registry is invented. It exists to look at the product's " +
        "pages with a country's worth of data and must never be shipped or presented as real election results.",
    );
    db.prepare(`INSERT INTO boundary_epoch (id, name, effective_from) VALUES (?, ?, '2000-01-01')`).run(
      EPOCH,
      "SYNTHETIC demo boundary epoch (not a real delimitation)",
    );

    const party = db.prepare(`INSERT INTO party (id, name, short_name, kind) VALUES (?, ?, ?, ?)`);
    const partyVersion = db.prepare(`INSERT INTO party_version (id, party_id, valid_from, name) VALUES (?, ?, '1990-01-01', ?)`);
    const versionOfParty = new Map<string, number>();
    for (const [i, p] of SYNTHETIC_PARTIES.entries()) {
      party.run(p.id, p.name, p.short, p.kind);
      partyVersion.run(i + 1, p.id, p.name);
      versionOfParty.set(p.id, i + 1);
    }

    const place = db.prepare(`INSERT INTO place (id, kind, canonical_name, parent_id) VALUES (?, ?, ?, ?)`);
    const version = db.prepare(
      `INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const election = db.prepare(
      `INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, polling_month, occurrence,
                             source_id, announced_on, counting_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    );
    const contest = db.prepare(`INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES (?, ?, ?, 'declared')`);
    const person = db.prepare(`INSERT INTO person (id, canonical_name, created_at) VALUES (?, ?, ?)`);
    const candidacy = db.prepare(
      `INSERT INTO candidacy (id, contest_id, person_id, party_version_id, status, party_raw) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const result = db.prepare(
      `INSERT INTO result (contest_id, candidacy_id, revision, votes, "rank", is_winner, margin, source_id, ingested_at)
       VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?)`,
    );
    const turnout = db.prepare(
      `INSERT INTO turnout (contest_id, scope, electors, voters, source_id) VALUES (?, 'contest', ?, ?, ?)`,
    );

    let versions = 0;
    let people = 0;

    /**
     * One election's contests, candidates, results and turnout, over `seats` (place_version ids) won as `winners` says. `tag` keeps the
     * contest ids and the draw apart where one election is held in several parts: a general election is one election whose seats are
     * dealt out state by state.
     */
    function hold(
      id: string,
      tag: string,
      seats: readonly number[],
      winners: readonly string[],
      weights: readonly (readonly [string, number])[],
      scale: { electors: [number, number]; turnoutBase: number },
      counted: boolean,
    ): void {
      const r = seeded(`${id}:${tag}contests`);
      const swing = (r() - 0.5) * 0.08;
      seats.forEach((versionId, i) => {
        const cid = `${id}:${tag}${pad(i + 1, 4)}`;
        contest.run(cid, id, versionId);
        const first = winners[i] as string;
        const second = pick(r, weights.filter(([k]) => k !== first));
        const third = pick(r, weights.filter(([k]) => k !== first && k !== second));

        const electors = between(r, scale.electors[0], scale.electors[1]);
        const polled = Math.min(0.9, Math.max(0.45, scale.turnoutBase + swing + normal(r) * 0.05));
        const voters = Math.round(electors * polled);
        // The two leaders together take 68 to 86% of the votes polled; the gap between them is cubed-ish so that most seats are
        // comfortable and a few are decided by a few dozen votes, which the "closest contests" panel needs to have something to show.
        const top = 0.68 + 0.18 * r();
        const gap = 0.4 * r() ** 2.2;
        const votes = [
          Math.round((voters * (top + gap)) / 2),
          Math.round((voters * (top - gap)) / 2),
          Math.round(voters * (1 - top) * (0.25 + 0.4 * r())),
        ];
        votes[1] = Math.min(votes[1] as number, (votes[0] as number) - 1);
        const margin = (votes[0] as number) - (votes[1] as number);

        const field = counted ? [first, second, third] : [first];
        field.forEach((key, rank) => {
          people += 1;
          const pid = `demo-person-${pad(people, 6)}`;
          person.run(pid, `Demo Candidate ${pad(people, 6)}`, WHEN);
          const independent = key === INDEPENDENT;
          candidacy.run(
            `${cid}:${rank + 1}`,
            cid,
            pid,
            independent ? null : (versionOfParty.get(key) as number),
            rank === 0 ? "elected" : "defeated",
            independent ? INDEPENDENT : null,
          );
          result.run(cid, `${cid}:${rank + 1}`, counted ? (votes[rank] as number) : null, rank + 1, rank === 0 ? 1 : 0, rank === 0 ? margin : null, SOURCE, WHEN);
        });
        turnout.run(cid, electors, voters, SOURCE);
      });
    }

    /** Places and place versions for a state's seats, in seat order; returns the version ids and each seat's own leaning. */
    function seatsOf(stateId: string, count: number, house: "ac" | "pc", weights: readonly (readonly [string, number])[]) {
      const r = seeded(`${stateId}:${house}:seats`);
      const ids: number[] = [];
      const affinity: string[] = [];
      for (let n = 1; n <= count; n += 1) {
        const placeId = `${stateId}.${house}.${pad(n, house === "ac" ? 3 : 2)}`;
        const name = `Demo ${stateId.toUpperCase()}${house === "pc" ? " PC" : ""}-${pad(n, 3)}`;
        place.run(placeId, house, name, stateId);
        versions += 1;
        version.run(versions, placeId, stateId, house, EPOCH, n, name, n % 13 === 0 ? "st" : n % 7 === 0 ? "sc" : "general");
        ids.push(versions);
        affinity.push(pick(r, weights));
      }
      return { ids, affinity };
    }

    const stateName = new Map(JURISDICTIONS.map((j) => [j.id, j.name]));
    const parliament = new Map<string, ReturnType<typeof seatsOf>>();

    for (const plan of SYNTHETIC_STATES) {
      const j = JURISDICTIONS.find((x) => x.id === plan.id);
      if (j === undefined || j.assemblySeats === null) throw new Error(`synthetic registry: ${plan.id} has no assembly in the reference data`);
      const seats = seatsOf(plan.id, j.assemblySeats, "ac", plan.weights);
      parliament.set(plan.id, seatsOf(plan.id, j.lokSabhaSeats, "pc", plan.weights));

      let leader: string | null = null;
      for (const year of plan.years) {
        const id = `demo-${plan.id}-assembly-${year}`;
        const r = seeded(`${id}:outcome`);
        const counts: readonly (readonly [string, number])[] = FORCED[id] ?? seatCounts(r, j.assemblySeats, plan.weights, leader, 1.5, {});
        const winners = assign(r, counts, seats.affinity);
        election.run(
          id, "assembly", "state", plan.id, EPOCH, `SYNTHETIC demo: ${stateName.get(plan.id)} Assembly ${year}`, "declared", "ac", year,
          plan.month, SOURCE, null, null,
        );
        hold(id, "", seats.ids, winners, plan.weights, { electors: [140_000, 280_000], turnoutBase: 0.66 }, id !== WITHOUT_COUNTS);
        // The next election's fatigue falls on the party with the most seats here (nobody where two are level).
        const top: (readonly [string, number])[] = [...counts].sort((a, b) => b[1] - a[1]);
        leader = top[0] !== undefined && top[0][1] !== top[1]?.[1] ? top[0][0] : null;
      }
    }

    // The Lok Sabha: one election for the union, whose seats sit in the states.
    let nationalLeader: string | null = null;
    for (const g of GENERAL) {
      const id = `demo-ls-${g.year}`;
      election.run(id, "general", "union", "in", EPOCH, `SYNTHETIC demo: Lok Sabha ${g.year}`, "declared", "pc", g.year, 5, SOURCE, null, null);
      const wins = new Map<string, number>();
      for (const plan of SYNTHETIC_STATES) {
        const seats = parliament.get(plan.id) as ReturnType<typeof seatsOf>;
        const r = seeded(`${id}:${plan.id}:outcome`);
        const counts = seatCounts(r, seats.ids.length, plan.weights, nationalLeader, 2, g.tilt);
        for (const [k, n] of counts) wins.set(k, (wins.get(k) ?? 0) + n);
        hold(
          id,
          `${plan.id}:`,
          seats.ids,
          assign(r, counts, seats.affinity),
          plan.weights,
          { electors: [1_300_000, 2_100_000], turnoutBase: 0.64 },
          true,
        );
      }
      nationalLeader = [...wins].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    }

    if (options.announced === true) {
      election.run(
        "demo-ga-assembly-2027", "assembly", "state", "ga", EPOCH, "SYNTHETIC demo: Goa Assembly 2027", "announced", "ac", 2027, 2,
        SOURCE, "2026-10-20", "2027-03-10",
      );
    }
  });
}

/* ────────────────────────────── the demo live feed ────────────────────────────── */

/**
 * The demo feed's timestamps moved so that its board was last updated at `to`: `asOf` and every event's `at` shift by the same amount,
 * which keeps the order and the gaps between them. Dates a projection was published on do not move, and nothing else does. A value
 * that is not a feed is returned unchanged (the reader's validator is what says it is wrong).
 */
export function shiftFeedTimes(feed: unknown, to: Date): unknown {
  if (typeof feed !== "object" || feed === null || !Array.isArray((feed as { boards?: unknown }).boards)) return feed;
  const copy = JSON.parse(JSON.stringify(feed)) as { boards: Record<string, unknown>[] };
  for (const b of copy.boards) {
    const from = typeof b["asOf"] === "string" ? Date.parse(b["asOf"]) : Number.NaN;
    if (Number.isNaN(from)) continue;
    const by = to.getTime() - from;
    const shift = (iso: unknown): unknown => (typeof iso === "string" && !Number.isNaN(Date.parse(iso)) ? new Date(Date.parse(iso) + by).toISOString() : iso);
    b["asOf"] = shift(b["asOf"]);
    if (Array.isArray(b["events"])) {
      for (const e of b["events"] as Record<string, unknown>[]) e["at"] = shift(e["at"]);
    }
  }
  return copy;
}

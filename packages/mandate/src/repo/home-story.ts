// What the front page says about ONE state, once the reader has the whole country in front of them: one finding about its latest assembly election, the
// pictures that prove it, and the doors into the record.
//
// WHICH STATE. The reader's, when they chose one (`chosen`, looked up among the jurisdictions that have a result and nowhere else). When they have not, the
// most recent election on record: a rule about the data and not about any state, said on the page ("showing the most recent election on record; choose
// another on the map") and never "the biggest" or "the one that moved most". With one state loaded there is nothing to choose, and the page says that.
//
// WITHIN A STATE the lead party is chosen by rule, never by name: the party that gained most seats between its last two elections in the newest epoch (ties by
// the larger latest count, then key), and the partner is the party that lost most seats to it. Loading Kerala's history changes the sentence without a line
// of UI changing; a registry with one election tells a one-election story, and one with none returns null.
//
// WHAT IT NEVER READS: an election's `turnoutPct` (West Bengal 2026's 93.0 is a defect), a count for an election that published none, or a candidacy's status
// (193 elected, one of them in a seat the result table does not declare; the result table's 192 is the count). Seats are counted from declared winners only,
// and every figure about 2026 votes is null because there are none.

import type { DatabaseSync } from "node:sqlite";
import { read } from "./index.ts";
import { stateTrajectory } from "./trajectory.ts";
import type { PartyTrajectory, StateTrajectory } from "./trajectory.ts";
import { electionMapView } from "./election-map.ts";
import type { ElectionMapView, MarginBin } from "./election-map.ts";
import { seatFlows } from "./seat-flows.ts";
import type { SeatFlows } from "./seat-flows.ts";
import { closest, readSeats, tally } from "./seat-results.ts";
import type { PartyRef, SeatMargin, SeatResult } from "./seat-results.ts";
import { seatHref, seatTies } from "./place-resolve.ts";
import { districtHref, electionHref, personHref, stateHref } from "./routes.ts";
import { displayName } from "./display-name.ts";
import { halfHouse, houseSegments } from "../viz/story.ts";
import type { HouseSeg } from "../viz/story.ts";

export type StoryParty = { key: string; label: string };

export type StoryHouse = {
  electionId: string;
  year: number;
  total: number;
  segments: HouseSeg[];
  /** Every party with a seat, none folded, for the table that is the exact form of the picture. */
  tally: { key: string; label: string; seats: number }[];
  undeclared: number;
};

/** A district's comparable seats and how many of them changed hands, and to whom. */
export type StoryDistrict = {
  id: string;
  name: string;
  href: string;
  comparable: number;
  flipped: number;
  gains: { key: string; label: string; n: number }[];
};

/** One party at one election: the share of the seats and of the votes (null where the election published no counts). */
export type StoryVote = { electionId: string; year: number; seats: number; seatPct: number | null; votePct: number | null };

/** A seat decided narrowly, from a counted election: the margin is checkable against the votes. */
export type CountedClose = {
  name: string;
  href: string;
  year: number;
  winner: PartyRef;
  runnerUp: PartyRef | null;
  votes: number;
  share: number;
};

/** A seat's margin from an election that published no counts: declared, with no runner-up or share on record. */
export type DeclaredClose = { name: string; href: string; year: number; winner: PartyRef; votes: number };

export type StreakRow = {
  personId: string;
  name: string;
  placeId: string;
  seat: string;
  seatNumber: number | null;
  href: string;
  personHref: string;
  /** One cell per election of the house, oldest first. */
  cells: { year: number; party: PartyRef; margin: SeatMargin | null }[];
};

export type StoryDoor = { door: "state" | "election" | "seat" | "person"; title: string; line: string; href: string };

export type StoryView = {
  jurisdiction: { id: string; name: string };
  /** The reader chose this state, or it is the most recent election on record because they did not. */
  basis: "asked" | "latest";
  /** How many jurisdictions have a story to choose between; with one, there is nothing to choose. */
  choices: number;
  total: number;
  latest: { id: string; year: number };
  lead: StoryParty;
  partner: StoryParty | null;
  /** The sentence's numbers: the lead's seats at the latest election, and up to three earlier points, newest first. */
  sentence: { seats: number; earlier: { year: number; seats: number }[]; direction: "up from" | "down from" | "level with" | null };
  /** One or two sentences under the headline: what is counted, what is not declared, what was not published. */
  scope: string;
  /** Oldest first. */
  houses: StoryHouse[];
  half: number;
  countsLatest: boolean;
  /** How seats moved to the latest election, or null where there is no earlier election to compare with. */
  changed: { flows: SeatFlows; previousYear: number; leadFromPartner: number | null } | null;
  districts: StoryDistrict[];
  /** Seats of the latest election that are in no district, and so in no row of `districts`. */
  noDistrict: number;
  votes: {
    lead: StoryVote[];
    partner: StoryVote[] | null;
    /** Every party the trajectory holds, for the table twin. */
    all: { party: StoryParty; points: StoryVote[] }[];
  };
  close: {
    bins: { electionId: string; year: number; seats: number; bins: MarginBin[] } | null;
    counted: CountedClose[];
    /** The first and last year of the elections that published counts, for the list's heading. */
    countedSpan: { from: number; to: number } | null;
    declared: DeclaredClose[];
    declaredYear: number | null;
  };
  /** People who won one seat for one party at every election of the house. Null where fewer than three did. */
  streak: { party: StoryParty | null; elections: number; seatsNow: number | null; rows: StreakRow[] } | null;
  doors: StoryDoor[];
  /** Chapters that cannot be drawn from this registry, with the question each would have answered and why it cannot. */
  cannot: { question: string; why: string }[];
};

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const word = (n: number): string => WORDS[n] ?? String(n);
const IN = new Intl.NumberFormat("en-IN");

const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The lead of one jurisdiction's run and the numbers that made it the lead. */
type Pick = { t: StateTrajectory; ladder: StateTrajectory["elections"]; party: PartyTrajectory; gain: number | null; latest: number };

function pickIn(t: StateTrajectory): Pick | null {
  const last = t.elections.at(-1);
  if (last === undefined) return null;
  const ladder = t.elections.filter((e) => e.epochId === last.epochId);
  const seatsAt = (p: PartyTrajectory, id: string): number => p.points.find((x) => x.electionId === id)?.seats ?? 0;
  const scored = t.parties.map((party) => {
    const now = seatsAt(party, last.id);
    const before = ladder.length < 2 ? null : seatsAt(party, ladder[ladder.length - 2]!.id);
    return { t, ladder, party, gain: before === null ? null : now - before, latest: now };
  });
  scored.sort((a, b) => (b.gain ?? 0) - (a.gain ?? 0) || b.latest - a.latest || byKey(a.party.key, b.party.key));
  return scored[0] ?? null;
}

/**
 * The front page's story, or null when no candidate jurisdiction has an assembly election with results. `chosen` is an id the reader asked
 * for, honoured only if it is one of `candidates`: it is looked up, never used in SQL.
 */
export function storyView(
  db: DatabaseSync,
  p: { candidates: readonly { id: string; name: string }[]; chosen?: string | null },
): StoryView | null {
  return read(() => {
    const picks = p.candidates.flatMap((c) => {
      const t = stateTrajectory(db, c.id, "ac", 12);
      const pick = pickIn(t);
      return pick === null ? [] : [{ ...pick, name: c.name }];
    });
    const asked = picks.find((x) => x.t.jurisdictionId === p.chosen);
    // No choice: the most recent election, then the name. A rule about the data, which judges none of the states.
    const recency = (x: (typeof picks)[number]): number => x.t.elections.at(-1)?.year ?? 0;
    const best = asked ?? [...picks].sort((a, b) => recency(b) - recency(a) || byKey(a.name, b.name))[0];
    if (best === undefined) return null;

    const { ladder, party: leadTraj } = best;
    const jid = best.t.jurisdictionId;
    const newest = ladder[ladder.length - 1]!;
    const ids = ladder.map((e) => e.id);
    const results = readSeats(db, { elections: ids });
    const of = (id: string): SeatResult[] => results.filter((s) => s.electionId === id);
    const latestResults = of(newest.id);
    const latestTally = tally(latestResults);
    const countsLatest = latestResults.some((s) => s.winner?.votes != null);
    const lead: StoryParty = { key: leadTraj.key, label: leadTraj.label };

    // How seats moved, from the election map's own seats: it holds each seat's previous holder and district, and the epoch gate.
    const view: ElectionMapView = electionMapView(db, newest.id);
    const flows = seatFlows(view.seats);
    const moved = view.previous === null || flows.compared === 0 ? null : flows;
    const intoLead = (moved?.flows ?? []).filter((f) => f.to === lead.key && f.from !== lead.key);
    const partnerFlow = intoLead[0] ?? null;
    const partnerLabel = partnerFlow === null ? null : (moved?.parties.find((x) => x.key === partnerFlow.from)?.label ?? partnerFlow.from);
    const partner: StoryParty | null = partnerFlow === null ? null : { key: partnerFlow.from, label: partnerLabel ?? partnerFlow.from };
    const partnerTraj = partner === null ? undefined : best.t.parties.find((x) => x.key === partner.key);

    const houses: StoryHouse[] = ladder.map((e) => {
      const seats = of(e.id);
      const t = tally(seats);
      const declared = t.reduce((n, x) => n + x.seats, 0);
      return {
        electionId: e.id,
        year: e.year,
        total: e.seats,
        segments: houseSegments({ tally: t, total: e.seats, undeclared: e.seats - declared, lead: lead.key, partner: partner?.key ?? null }),
        tally: t,
        undeclared: e.seats - declared,
      };
    });

    const seatsIn = (pt: PartyTrajectory | undefined): number[] => ladder.map((e) => pt?.points.find((x) => x.electionId === e.id)?.seats ?? 0);
    const leadSeats = seatsIn(leadTraj);
    const earlier = ladder
      .slice(0, -1)
      .map((e, i) => ({ year: e.year, seats: leadSeats[i]! }))
      .reverse()
      .slice(0, 3);
    const nowSeats = leadSeats[leadSeats.length - 1]!;
    const prior = earlier[0]?.seats ?? null;
    const direction = prior === null ? null : nowSeats > prior ? "up from" : nowSeats < prior ? "down from" : "level with";

    const undeclaredNow = newest.seats - latestTally.reduce((n, x) => n + x.seats, 0);
    const scope = [
      ladder.length === 1
        ? `Seats are counted from declared winners at ${best.name}'s only assembly election on record.`
        : `Seats are counted from declared winners at ${best.name}'s ${word(ladder.length)} assembly elections.`,
      undeclaredNow === 0
        ? null
        : `${word(undeclaredNow).replace(/^./, (c) => c.toUpperCase())} ${undeclaredNow === 1 ? "seat" : "seats"} in ${newest.year} ${undeclaredNow === 1 ? "has" : "have"} no declared winner.`,
      countsLatest
        ? null
        : `That election's vote counts were not published, so for ${newest.year} this page shows seats and declared margins, never votes.`,
    ]
      .filter((s): s is string => s !== null)
      .join(" ");

    // Where it changed: comparable seats by district, and the party each flip went to.
    const rows = new Map<string, StoryDistrict>();
    let noDistrict = 0;
    for (const s of view.seats) {
      if (!s.comparable || s.flip === null) continue;
      if (s.districtId === null) {
        noDistrict += 1;
        continue;
      }
      const d = rows.get(s.districtId) ?? {
        id: s.districtId,
        name: s.districtName ?? s.districtId,
        href: districtHref(s.districtId),
        comparable: 0,
        flipped: 0,
        gains: [],
      };
      d.comparable += 1;
      if (s.flip.changed && s.partyKey !== null) {
        d.flipped += 1;
        const g = d.gains.find((x) => x.key === s.partyKey);
        if (g === undefined) d.gains.push({ key: s.partyKey, label: s.partyLabel ?? s.partyKey, n: 1 });
        else g.n += 1;
      }
      rows.set(s.districtId, d);
    }
    const districts = [...rows.values()]
      .map((d) => ({ ...d, gains: d.gains.sort((a, b) => b.n - a.n || byKey(a.key, b.key)) }))
      .sort((a, b) => b.flipped - a.flipped || b.comparable - a.comparable || byKey(a.name, b.name));

    const share = (pt: PartyTrajectory | undefined): StoryVote[] =>
      ladder.map((e) => {
        const pnt = pt?.points.find((x) => x.electionId === e.id);
        return { electionId: e.id, year: e.year, seats: pnt?.seats ?? 0, seatPct: pnt?.seatPct ?? null, votePct: pnt?.votePct ?? null };
      });

    // How close: counted margins across the run, kept apart from the margins an election declared without counts.
    const ties = seatTies(db);
    const hrefOf = (s: SeatResult): string =>
      seatHref(ties, { versionId: s.versionId, placeId: s.placeId, stateId: s.jurisdictionId, kind: "ac", name: s.name });
    const yearOf = new Map(ladder.map((e) => [e.id, e.year]));
    const counted: CountedClose[] = closest(
      results.filter((s) => s.margin?.basis === "counted" && s.winner !== null),
      5,
    ).map((s) => ({
      name: s.name,
      href: hrefOf(s),
      year: yearOf.get(s.electionId) ?? 0,
      winner: s.winner!.party,
      runnerUp: s.runnerUp?.party ?? null,
      votes: s.margin!.votes,
      share: s.marginShare!,
    }));
    const declared: DeclaredClose[] = countsLatest
      ? []
      : latestResults
          .filter((s) => s.margin?.basis === "declared" && s.winner !== null)
          .sort((a, b) => a.margin!.votes - b.margin!.votes || byKey(a.name, b.name))
          .slice(0, 3)
          .map((s) => ({ name: s.name, href: hrefOf(s), year: newest.year, winner: s.winner!.party, votes: s.margin!.votes }));
    const withCounts = ladder.filter((e) => of(e.id).some((s) => s.margin?.basis === "counted"));
    const countedElection = withCounts[withCounts.length - 1];
    const binsView = countedElection === undefined ? null : countedElection.id === newest.id ? view : electionMapView(db, countedElection.id);
    const bins =
      countedElection === undefined || binsView === null
        ? null
        : { electionId: countedElection.id, year: countedElection.year, seats: countedElection.seats, bins: binsView.marginBins };

    // Who was always there: one person, one seat, one party, a declared win at every election of the house.
    const held = new Map<string, Map<string, SeatResult>>();
    for (const s of results) {
      if (s.winner === null) continue;
      const k = `${s.winner.personId}|${s.placeId}|${s.winner.party.key}`;
      const m = held.get(k) ?? new Map<string, SeatResult>();
      m.set(s.electionId, s);
      held.set(k, m);
    }
    const streakRows: StreakRow[] = [...held.values()]
      .filter((m) => ids.every((id) => m.has(id)))
      .map((m) => {
        const now = m.get(newest.id)!;
        return {
          personId: now.winner!.personId,
          name: displayName(now.winner!.name),
          placeId: now.placeId,
          seat: now.name,
          seatNumber: now.number,
          href: hrefOf(now),
          personHref: personHref(now.winner!.personId),
          cells: ladder.map((e) => {
            const s = m.get(e.id)!;
            return { year: e.year, party: s.winner!.party, margin: s.margin };
          }),
        };
      })
      .sort((a, b) => (b.cells.at(-1)!.margin?.votes ?? 0) - (a.cells.at(-1)!.margin?.votes ?? 0) || byKey(a.name, b.name));
    const parties = [...new Map(streakRows.map((r) => [r.cells[0]!.party.key, r.cells[0]!.party])).values()];
    const streak =
      ladder.length < 2 || streakRows.length < 3
        ? null
        : {
            party: parties.length === 1 ? parties[0]! : null,
            elections: ladder.length,
            seatsNow: parties.length === 1 ? (latestTally.find((t) => t.key === parties[0]!.key)?.seats ?? null) : null,
            rows: streakRows,
          };

    const top = latestTally.slice(0, 2);
    const districtCount = new Set(view.seats.map((s) => s.districtId).filter((d) => d !== null)).size;
    const doorSeat = counted[0];
    const doorPerson = streak === null ? undefined : [...streak.rows].sort((a, b) => (a.seatNumber ?? 1e9) - (b.seatNumber ?? 1e9))[0];
    const doors: StoryDoor[] = [
      {
        door: "state",
        title: best.name,
        line: `${IN.format(newest.seats)} seats${districtCount === 0 ? "" : `, ${districtCount} districts`}, ${word(ladder.length)} assembly ${ladder.length === 1 ? "election" : "elections"}`,
        href: stateHref(jid),
      },
      {
        door: "election",
        title: `The ${newest.year} election`,
        line: `${top.map((t) => `${t.label} ${t.seats}`).join(", ")}. ${countsLatest ? "Winners, margins and votes" : "Winners and margins; no vote counts"}`,
        href: electionHref(newest.id),
      },
      ...(doorSeat === undefined
        ? []
        : [
            {
              door: "seat" as const,
              title: doorSeat.name,
              line: `${doorSeat.winner.label}${doorSeat.runnerUp === null ? "" : ` over ${doorSeat.runnerUp.label}`} by ${IN.format(doorSeat.votes)} votes, ${doorSeat.year}`,
              href: doorSeat.href,
            },
          ]),
      ...(doorPerson === undefined || streak === null
        ? []
        : [
            {
              door: "person" as const,
              title: doorPerson.name,
              line: `${doorPerson.seat}, ${streak.elections} of ${streak.elections} wins`,
              href: doorPerson.personHref,
            },
          ]),
    ];

    const cannot: StoryView["cannot"] = [
      ...(moved === null
        ? [{ question: "Whose seats did the lead party take?", why: view.previous === null ? "There is no earlier election of this house on record." : "No seat can be compared with the earlier election." }]
        : []),
      ...(districts.length === 0 ? [{ question: "Where did seats change hands?", why: "The registry holds no district for these seats." }] : []),
      ...(bins === null && declared.length === 0
        ? [{ question: "How close can a seat be?", why: "No election on record published a margin." }]
        : []),
      ...(streak === null
        ? [{ question: "Who was always there?", why: "Fewer than three people won one seat for one party at every election." }]
        : []),
    ];

    return {
      jurisdiction: { id: jid, name: best.name },
      basis: asked === undefined ? "latest" : "asked",
      choices: picks.length,
      total: newest.seats,
      latest: { id: newest.id, year: newest.year },
      lead,
      partner,
      sentence: { seats: nowSeats, earlier, direction },
      scope,
      houses,
      half: halfHouse(newest.seats),
      countsLatest,
      changed:
        moved === null || view.previous === null
          ? null
          : { flows: moved, previousYear: view.previous.year, leadFromPartner: partnerFlow?.n ?? null },
      districts,
      noDistrict,
      votes: {
        lead: share(leadTraj),
        partner: partnerTraj === undefined ? null : share(partnerTraj),
        all: best.t.parties.map((pt) => ({ party: { key: pt.key, label: pt.label }, points: share(pt) })),
      },
      close: {
        bins,
        counted,
        countedSpan: withCounts.length === 0 ? null : { from: withCounts[0]!.year, to: withCounts[withCounts.length - 1]!.year },
        declared,
        declaredYear: declared.length === 0 ? null : newest.year,
      },
      streak,
      doors,
      cannot,
    };
  });
}

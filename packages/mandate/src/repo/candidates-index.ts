// Who stood in one election, as an index you can narrow: by party, by district, by what their career looks like, by name. A scoped list of ONE
// election's field, not a ranking of people.
//
// WHAT IT WILL NOT DO, and the tests hold it: sort by age, margin, assets or cases (the only orders are name and seat), show a figure per person
// other than a declared winner's result, or accept any parameter by parsing: every value is looked up among what this election holds, and one that
// is not there is ignored and said so.
//
// A person's record is the registry's: a candidate who changed party or seat is two records, and the page says so. Before 2026 the registry holds
// each seat's top five only, so a dotted square in the ladder is "no contest on record", never "did not stand".

import type { DatabaseSync } from "node:sqlite";
import { bodyWord } from "../core/election-kind.ts";
import { all } from "../db/index.ts";
import { displayName } from "./display-name.ts";
import { electionChoices } from "./election-map.ts";
import { read } from "./index.ts";
import { CAREER_SHAPES, careerShape } from "./person-story.ts";
import type { CareerShape } from "./person-story.ts";
import { seatHref, seatTies } from "./place-resolve.ts";
import type { Search } from "./place-filters.ts";
import { CURRENT_REVISION, partyRef } from "./seat-results.ts";
import type { PartyRef } from "./seat-results.ts";

export const PAGE_SIZE = 50;
export const SORTS = ["name", "seat"] as const;
export type Sort = (typeof SORTS)[number];

export type CandidateQuery = {
  election: string;
  party: string | null;
  district: string | null;
  career: CareerShape | null;
  repeat: boolean;
  q: string;
  sort: Sort;
  page: number;
};

export type LadderCell = { id: string; label: string; state: "won" | "stood" | "none"; party: PartyRef | null; title: string };

export type CandidateRow = {
  personId: string;
  name: string;
  display: string;
  seatName: string;
  seatNumber: number | null;
  seatHref: string;
  district: { id: string; name: string } | null;
  party: PartyRef | null;
  /** `result.is_winner` in this election. */
  declaredWinner: boolean;
  /** The candidacy record says elected and no result row declares it. */
  namedAsElected: boolean;
  declaredMargin: { votes: number; basis: "counted" | "declared" } | null;
  contests: number;
  shape: CareerShape | null;
  /** The person had a candidacy in an earlier election. */
  before: boolean;
  ladder: LadderCell[];
};

export type Facet = { key: string; label: string; n: number; won: number; on: boolean; href: string; ink: string | null };

export type CandidatesView = {
  election: { id: string; label: string; year: number; seats: number; candidates: number; winners: number; before: number; counted: boolean };
  elections: { id: string; label: string; href: string }[];
  query: CandidateQuery;
  /** Parameters that were asked and not honoured, in words. */
  notes: string[];
  parties: Facet[];
  districts: Facet[];
  shapes: Facet[];
  /** The active filters, each as a link that drops it. */
  chips: { label: string; href: string }[];
  rows: CandidateRow[];
  total: number;
  pages: number;
  /** The columns of the ladder, oldest first. */
  columns: { id: string; label: string }[];
  /** The URL of this view with one change, for the page's own links. */
  href: (change: Partial<Record<keyof CandidateQuery, string | null>>) => string;
};

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

type Raw = {
  personId: string;
  name: string;
  contestId: string;
  electionId: string;
  year: number;
  status: string;
  isWinner: number | null;
  votes: number | null;
  margin: number | null;
  partyId: string | null;
  shortName: string | null;
  partyName: string | null;
  raw: string | null;
  seatName: string;
  seatNumber: number | null;
  versionId: number;
  placeId: string;
  state: string | null;
  kind: string;
  districtId: string | null;
  districtName: string | null;
};

function readOne(search: Search | undefined, key: string): string | undefined {
  const v = search?.[key];
  return typeof v === "string" ? v : undefined;
}

/** The query as a URL: only what differs from the default, so the default view has none. */
function urlOf(q: CandidateQuery, defaultElection: string): string {
  const p = new URLSearchParams();
  if (q.election !== defaultElection) p.set("election", q.election);
  if (q.party !== null) p.set("party", q.party);
  if (q.district !== null) p.set("district", q.district);
  if (q.career !== null) p.set("career", q.career);
  if (q.repeat) p.set("repeat", "1");
  if (q.q !== "") p.set("q", q.q);
  if (q.sort !== "name") p.set("sort", q.sort);
  if (q.page > 1) p.set("page", String(q.page));
  const s = p.toString();
  return s === "" ? "/candidates" : `/candidates?${s}`;
}

export function candidatesIndex(db: DatabaseSync, search: Search | undefined): CandidatesView | null {
  return read(() => {
    // The elections a reader may choose: full houses, newest first, that have candidacies on record.
    const withRows = new Set(all<{ id: string }>(db, "SELECT DISTINCT c.election_id AS id FROM candidacy ca JOIN contest c ON c.id = ca.contest_id").map((r) => r.id));
    const choices = electionChoices(db, 60).filter((e) => e.fill !== "bypoll" && withRows.has(e.id));
    const first = choices[0];
    if (first === undefined) return null;
    const label = (e: { body: Parameters<typeof bodyWord>[0]; year: number }): string => `${bodyWord(e.body)} ${e.year}`;
    const notes: string[] = [];

    const asked = readOne(search, "election");
    const chosen = choices.find((e) => e.id === asked) ?? first;
    if (asked !== undefined && chosen.id !== asked) notes.push("That election is not on record, so the latest is shown.");

    // Everyone who stood in it, and every contest those people have on record, in two reads.
    const COLS = `ca.person_id AS personId, per.canonical_name AS name, c.id AS contestId, c.election_id AS electionId, e.year AS year, ca.status AS status,
              r.is_winner AS isWinner, r.votes AS votes, r.margin AS margin, pt.id AS partyId, pt.short_name AS shortName, pt.name AS partyName,
              ca.party_raw AS raw, pv.canonical_name AS seatName, pv.number AS seatNumber, pv.id AS versionId, pv.place_id AS placeId,
              pv.jurisdiction_id AS state, pv.kind AS kind, pv.district_place_id AS districtId, d.canonical_name AS districtName`;
    const JOINS = `FROM candidacy ca
         JOIN person per ON per.id = ca.person_id
         JOIN contest c ON c.id = ca.contest_id
         JOIN election e ON e.id = c.election_id
         JOIN place_version pv ON pv.id = c.place_version_id
         LEFT JOIN place d ON d.id = pv.district_place_id
         LEFT JOIN party_version pver ON pver.id = ca.party_version_id
         LEFT JOIN party pt ON pt.id = pver.party_id
         LEFT JOIN result r ON r.candidacy_id = ca.id AND r.revision = ${CURRENT_REVISION}`;
    const here = all<Raw>(db, `SELECT ${COLS} ${JOINS} WHERE c.election_id = ?`, chosen.id);
    const careers = all<Raw>(
      db,
      `SELECT ${COLS} ${JOINS}
        WHERE ca.person_id IN (SELECT ca2.person_id FROM candidacy ca2 JOIN contest c2 ON c2.id = ca2.contest_id WHERE c2.election_id = ?)
        ORDER BY e.year, c.id`,
      chosen.id,
    );

    // The ladder's columns: the full-house elections on record, oldest first, at most five.
    const columns = [...choices].sort((a, b) => Number(a.body === "lok-sabha") - Number(b.body === "lok-sabha") || a.year - b.year || byText(a.id, b.id)).slice(-5).map((e) => ({ id: e.id, label: label(e) }));
    const won = (r: Raw): boolean => r.isWinner === 1 || r.status === "elected";
    const byPerson = new Map<string, Raw[]>();
    for (const r of careers) byPerson.set(r.personId, [...(byPerson.get(r.personId) ?? []), r]);
    const ties = seatTies(db);

    const allRows: CandidateRow[] = here.map((r) => {
      const mine = byPerson.get(r.personId) ?? [r];
      const party = partyRef({ id: r.partyId, shortName: r.shortName, name: r.partyName, raw: r.raw });
      return {
        personId: r.personId,
        name: r.name,
        display: displayName(r.name),
        seatName: r.seatName,
        seatNumber: r.seatNumber,
        seatHref:
          r.state === null ? "/" : seatHref(ties, { versionId: r.versionId, placeId: r.placeId, stateId: r.state, kind: r.kind, name: r.seatName }),
        district: r.districtId === null || r.districtName === null ? null : { id: r.districtId, name: r.districtName },
        party,
        declaredWinner: r.isWinner === 1,
        namedAsElected: r.isWinner !== 1 && r.status === "elected",
        declaredMargin: r.isWinner === 1 && r.margin !== null ? { votes: Math.abs(r.margin), basis: r.votes === null ? "declared" : "counted" } : null,
        contests: mine.length,
        shape: careerShape(mine.map(won)),
        before: mine.some((m) => m.year < chosen.year),
        ladder: columns.map((c): LadderCell => {
          const m = mine.find((x) => x.electionId === c.id);
          if (m === undefined) return { id: c.id, label: c.label, state: "none", party: null, title: `${c.label}: no contest on record` };
          const p = partyRef({ id: m.partyId, shortName: m.shortName, name: m.partyName, raw: m.raw });
          return { id: c.id, label: c.label, state: won(m) ? "won" : "stood", party: p, title: `${c.label}: ${p.label}, ${won(m) ? "won" : "stood, not the declared winner"}` };
        }),
      };
    });

    // The query, read by membership against what this election holds.
    const partyIds = new Set(allRows.map((r) => r.party?.key).filter((k): k is string => k !== undefined));
    const districtIds = new Set(allRows.map((r) => r.district?.id).filter((k): k is string => k !== undefined));
    const askedParty = readOne(search, "party");
    const askedDistrict = readOne(search, "district");
    const askedCareer = readOne(search, "career");
    const askedSort = readOne(search, "sort");
    const query: CandidateQuery = {
      election: chosen.id,
      party: askedParty !== undefined && partyIds.has(askedParty) ? askedParty : null,
      district: askedDistrict !== undefined && districtIds.has(askedDistrict) ? askedDistrict : null,
      career: CAREER_SHAPES.find((s) => s.key === askedCareer)?.key ?? null,
      repeat: readOne(search, "repeat") === "1",
      q: (readOne(search, "q") ?? "").trim().slice(0, 60),
      sort: SORTS.find((s) => s === askedSort) ?? "name",
      page: 1,
    };
    if (askedParty !== undefined && query.party === null) notes.push("That party did not stand in this election, so it is not filtered on.");
    if (askedDistrict !== undefined && query.district === null) notes.push("That district has no seat in this election, so it is not filtered on.");
    if (askedCareer !== undefined && query.career === null) notes.push("That is not a career shape on record, so it is not filtered on.");
    if (askedSort !== undefined && query.sort === "name" && askedSort !== "name") notes.push("Candidates are ordered by name or by seat and by nothing else.");

    const needle = query.q.toLowerCase();
    type Skip = "party" | "district" | "career";
    const keep = (r: CandidateRow, skip?: Skip): boolean =>
      (skip === "party" || query.party === null || r.party?.key === query.party) &&
      (skip === "district" || query.district === null || r.district?.id === query.district) &&
      (skip === "career" || query.career === null || r.shape === query.career) &&
      (!query.repeat || r.contests >= 2) &&
      (needle === "" || r.display.toLowerCase().includes(needle) || r.name.toLowerCase().includes(needle));

    const defaultElection = first.id;
    const href: CandidatesView["href"] = (change) => {
      const next: CandidateQuery = { ...query, page: 1 };
      for (const [k, v] of Object.entries(change)) {
        if (k === "repeat") next.repeat = v === "1";
        else if (k === "page") next.page = Number(v ?? 1) || 1;
        else if (k === "sort") next.sort = SORTS.find((s) => s === v) ?? "name";
        else if (k === "q") next.q = v ?? "";
        else if (k === "election") next.election = v ?? defaultElection;
        else (next as unknown as Record<string, unknown>)[k] = v;
      }
      return urlOf(next, defaultElection);
    };

    const facet = (rows: readonly CandidateRow[], keyOf: (r: CandidateRow) => { key: string; label: string; ink: string | null } | null, param: "party" | "district" | "career", current: string | null): Facet[] => {
      const g = new Map<string, Facet>();
      for (const r of rows) {
        const k = keyOf(r);
        if (k === null) continue;
        const f = g.get(k.key) ?? { key: k.key, label: k.label, n: 0, won: 0, on: current === k.key, href: href({ [param]: current === k.key ? null : k.key }), ink: k.ink };
        f.n += 1;
        if (r.declaredWinner || r.namedAsElected) f.won += 1;
        g.set(k.key, f);
      }
      return [...g.values()].sort((a, b) => b.n - a.n || byText(a.label, b.label));
    };
    const partiesFacet = facet(allRows.filter((r) => keep(r, "party")), (r) => (r.party === null ? null : { key: r.party.key, label: r.party.label, ink: r.party.key }), "party", query.party);
    const districtsFacet = facet(allRows.filter((r) => keep(r, "district")), (r) => (r.district === null ? null : { key: r.district.id, label: r.district.name, ink: null }), "district", query.district);
    const shapeLabel = new Map(CAREER_SHAPES.map((s) => [s.key, s.label]));
    const shapesFacet = CAREER_SHAPES.map((s) => s.key).flatMap((key) => {
      const rows = allRows.filter((r) => keep(r, "career") && r.shape === key);
      return rows.length === 0 && query.career !== key
        ? []
        : [{ key, label: shapeLabel.get(key) ?? key, n: rows.length, won: rows.filter((r) => r.declaredWinner || r.namedAsElected).length, on: query.career === key, href: href({ career: query.career === key ? null : key }), ink: null }];
    });

    const matching = allRows.filter((r) => keep(r));
    const sorted = [...matching].sort(
      query.sort === "seat"
        ? (a, b) => (a.seatNumber ?? 1e9) - (b.seatNumber ?? 1e9) || byText(a.seatName, b.seatName) || byText(a.display.toLowerCase(), b.display.toLowerCase())
        : (a, b) => byText(a.display.toLowerCase(), b.display.toLowerCase()) || byText(a.personId, b.personId),
    );
    const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const askedPage = Number(readOne(search, "page") ?? 1);
    query.page = Number.isInteger(askedPage) && askedPage >= 1 ? Math.min(askedPage, pages) : 1;

    const chips: CandidatesView["chips"] = [
      ...(query.party === null ? [] : [{ label: `Party ${partiesFacet.find((f) => f.key === query.party)?.label ?? allRows.find((r) => r.party?.key === query.party)?.party?.label ?? query.party}`, href: href({ party: null }) }]),
      ...(query.district === null ? [] : [{ label: `District ${allRows.find((r) => r.district?.id === query.district)?.district?.name ?? query.district}`, href: href({ district: null }) }]),
      ...(query.career === null ? [] : [{ label: shapeLabel.get(query.career) ?? query.career, href: href({ career: null }) }]),
      ...(query.repeat ? [{ label: "Repeat contestants", href: href({ repeat: null }) }] : []),
      ...(query.q === "" ? [] : [{ label: `Name contains “${query.q}”`, href: href({ q: null }) }]),
    ];

    return {
      election: {
        id: chosen.id,
        label: label(chosen),
        year: chosen.year,
        seats: chosen.seats,
        candidates: allRows.length,
        winners: allRows.filter((r) => r.declaredWinner || r.namedAsElected).length,
        before: allRows.filter((r) => r.before).length,
        counted: here.some((r) => r.votes !== null),
      },
      elections: choices.map((e) => ({ id: e.id, label: label(e), href: urlOf({ ...query, election: e.id, party: null, district: null, career: null, page: 1 }, defaultElection) })),
      query,
      notes,
      parties: partiesFacet,
      districts: districtsFacet,
      shapes: shapesFacet,
      chips,
      rows: sorted.slice((query.page - 1) * PAGE_SIZE, query.page * PAGE_SIZE),
      total: sorted.length,
      pages,
      columns,
      href,
    };
  });
}


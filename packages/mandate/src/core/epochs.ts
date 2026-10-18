// Delimitation epochs, as a table: which orders exist, whose they are, when they took effect, and the two
// numbers each answers to — TCPD's `DelimID` in the source files, and a block in `versionId`'s key space.
// Pure: it imports only types, so ingest, db and repo all ask the same questions of the same table. The
// registry's `boundary_epoch` rows are seeded FROM this (db/epochs.ts), never the other way round.
//
// Two questions are answered here, and they are different questions:
//
//   inForce(j, asOf)       which order governed jurisdiction j on a date. A legal question.
//   successor(j, epochId)  which order replaced `epochId` in j. An epoch's end date is its successor's start,
//                          derived per jurisdiction: DPACO 2008 ends in Assam and not in Bihar, so no single
//                          `effective_to` could hold it, and the column is never written.
//
// A third, which epoch a house is VOTING under, is a fact about results rather than about law, and lives in
// the `voting_epoch` view (migration 017). The two disagree on purpose: the Lok Sabha seats Assam voted on in
// 2024 are `delim-2023-as`, while an Assam assembly last elected before that order is still on `delim-2008`.

import type { EffectiveDateBasis } from "./entities/index.ts";
import { asOf, type ISODate, type Versioned } from "./temporal/index.ts";

export type EpochSpec = {
  id: string;
  name: string;
  /** NULL for a national order; a jurisdiction id for one that redraws a single state or UT. */
  jurisdictionId: string | null;
  effectiveFrom: ISODate;
  effectiveDateBasis: EffectiveDateBasis;
  orderDate: ISODate | null;
  orderReference: string | null;
  /** The `source` that cites the order, where applyDelimitation registers one. */
  sourceId: string | null;
  /**
   * TCPD's `DelimID` for this order, where the Lokdhaba files have a value for it. The file gives an opaque
   * integer, and the year ranges identify it beyond doubt: in Bihar, DelimID 1 covers 1962-1964, 2 covers
   * 1967-1972, 3 covers 1977-2009 and 4 covers 2010-2021 — India's four delimitations, whose orders were
   * published in 1952, 1963, 1976 and 2008. The two state orders after them have no DelimID.
   */
  tcpdDelimId: number | null;
  /**
   * Which thousand-wide block of a state's `place_version` ids this epoch's seats are allocated from — the
   * `delimId` argument of `versionId`, so a seat's id stays unique across delimitations. 1-4 are TCPD's own
   * DelimIDs and the new epochs take the next free blocks; `versionId` allows 0-19. A block must never move:
   * contests, geometry and crosswalks point at the ids it produced.
   */
  versionBlock: number;
};

/**
 * DelimID 4 is `delim-2008`, which is the epoch the West Bengal seed already created. That reuse is the
 * point: a parallel `delim-4` epoch would put Bihar's and West Bengal's current seats in different boundary
 * regimes and quietly break every cross-state comparison.
 *
 * Only the 2008 order's exact date is on record (19 February 2008). The three before it carry January of the
 * order year and say so in their name, because a fabricated day is worse than an admitted approximation —
 * and their basis is `not_established`, so no importer may infer an epoch from a date before 2008.
 *
 * Oldest first. The two state orders are the delimitations that unblock the 2024 Lok Sabha import's 19
 * quarantined seats; ingest/geography/delimitation.ts registers the documents that cite them.
 */
export const EPOCHS: readonly EpochSpec[] = [
  {
    id: "delim-1952",
    name: "Delimitation Commission Order, 1952 (day precision not recorded)",
    jurisdictionId: null,
    effectiveFrom: "1952-01-01",
    effectiveDateBasis: "not_established",
    orderDate: null,
    orderReference: null,
    sourceId: null,
    tcpdDelimId: 1,
    versionBlock: 1,
  },
  {
    id: "delim-1963",
    name: "Delimitation Commission Order, 1963 (day precision not recorded)",
    jurisdictionId: null,
    effectiveFrom: "1963-01-01",
    effectiveDateBasis: "not_established",
    orderDate: null,
    orderReference: null,
    sourceId: null,
    tcpdDelimId: 2,
    versionBlock: 2,
  },
  {
    id: "delim-1976",
    name: "Delimitation Commission Order, 1976 (day precision not recorded)",
    jurisdictionId: null,
    effectiveFrom: "1976-01-01",
    effectiveDateBasis: "not_established",
    orderDate: null,
    orderReference: null,
    sourceId: null,
    tcpdDelimId: 3,
    versionBlock: 3,
  },
  {
    id: "delim-2008",
    name: "Delimitation of Parliamentary and Assembly Constituencies Order, 2008",
    jurisdictionId: null,
    effectiveFrom: "2008-02-19",
    effectiveDateBasis: "not_established",
    orderDate: null,
    orderReference: null,
    sourceId: null,
    tcpdDelimId: 4,
    versionBlock: 4,
  },
  {
    id: "delim-2022-jk",
    name:
      "Delimitation Commission for the Union Territory of Jammu & Kashmir, Order No. 2 " +
      "(effective 20 May 2022 by S.O. 2223(E))",
    jurisdictionId: "jk",
    // The Central Government appointed this date. Not a publication date, not the order's date.
    effectiveFrom: "2022-05-20",
    effectiveDateBasis: "legal_effective_date",
    orderDate: "2022-05-05",
    orderReference:
      "Delimitation Commission Order No. 2 dated 5 May 2022, Gazette of India Extraordinary II-3(iii) " +
      "O.N. 17(E); with Order No. 1 dated 14 March 2022, O.N. 6(E); given effect by S.O. 2223(E) dated " +
      "20 May 2022 under s.62(2)-(3), Jammu and Kashmir Reorganisation Act, 2019 (34 of 2019)",
    sourceId: "delim:jk-so-2223e-2022",
    tcpdDelimId: null,
    versionBlock: 5,
  },
  {
    id: "delim-2023-as",
    name:
      "Delimitation of Parliamentary and Assembly Constituencies in the State of Assam — ECI final " +
      "notification (order date not established; ECI published it on 2023-08-11)",
    jurisdictionId: "as",
    // The ECI's own publication date for the final notification. The notification is a scan, so its own
    // order date and effective date are not readable, and `effectiveDateBasis` says exactly that.
    effectiveFrom: "2023-08-11",
    effectiveDateBasis: "publication_date",
    orderDate: null,
    orderReference:
      "ECI final notification (document 15220), published 2023-08-11, following the rescindment of the " +
      "2008 deferment by S.O. 903(E) dated 28 February 2020. The notification is a scanned image with no " +
      "text layer, so neither its own order date nor its constituency schedule is machine-readable",
    sourceId: "delim:assam-final-2023",
    tcpdDelimId: null,
    versionBlock: 6,
  },
];

export function epochById(epochId: string): EpochSpec {
  const e = EPOCHS.find((x) => x.id === epochId);
  if (e === undefined) throw new Error(`no epoch '${epochId}' in core/epochs.ts`);
  return e;
}

/** The epoch TCPD's `DelimID` names, or undefined for a value this table does not know. */
export function epochOfDelimId(delimId: number): EpochSpec | undefined {
  return EPOCHS.find((e) => e.tcpdDelimId === delimId);
}

/** The orders that can govern one jurisdiction, oldest first: every national one, and any that names it. */
function chain(jurisdictionId: string): EpochSpec[] {
  return EPOCHS.filter((e) => e.jurisdictionId === null || e.jurisdictionId === jurisdictionId).sort((a, z) =>
    a.effectiveFrom !== z.effectiveFrom ? (a.effectiveFrom < z.effectiveFrom ? -1 : 1) : a.id < z.id ? -1 : 1,
  );
}

/** Each epoch's window in one jurisdiction: from its own start to its successor's. */
function windows(jurisdictionId: string): (Versioned & { epoch: EpochSpec })[] {
  const c = chain(jurisdictionId);
  return c.map((epoch, i) => ({ epoch, validFrom: epoch.effectiveFrom, validTo: c[i + 1]?.effectiveFrom ?? null }));
}

/**
 * The epoch in force for a jurisdiction on a date: the newest order that names it or is national, whose
 * successor had not yet taken effect. On the day two orders share, the later id wins.
 *
 * A LEGAL question, for sources that do not say which delimitation a seat belongs to (the ECI's 2024 reports,
 * a datameet vintage). It is not evidence about a historic import: the 1952, 1963 and 1976 dates are
 * `not_established`, TCPD's own `DelimID` is the authority there, and a date before 1952 has no epoch.
 */
export function inForce(jurisdictionId: string, date: ISODate): EpochSpec {
  const hit = asOf(windows(jurisdictionId), date);
  if (hit === undefined) throw new Error(`no epoch was in force for '${jurisdictionId}' on ${date}`);
  return hit.epoch;
}

/**
 * The epoch that replaced `epochId` in a jurisdiction, or null while it is still the one in force there.
 * Throws for an epoch that does not apply to the jurisdiction: null would read as "still current".
 */
export function successor(jurisdictionId: string, epochId: string): EpochSpec | null {
  const c = chain(jurisdictionId);
  const at = c.findIndex((e) => e.id === epochId);
  if (at < 0) throw new Error(`epoch '${epochId}' does not apply to '${jurisdictionId}'`);
  return c[at + 1] ?? null;
}

export type Superseded = { jurisdictionId: string; epochId: string; currentId: string };

/**
 * Every (jurisdiction, epoch) that has a successor, with the epoch now in force there — the rows SQL needs
 * to ask `successor` of a whole table, because an epoch is superseded in one jurisdiction and not another.
 */
export function superseded(jurisdictionIds: readonly string[]): Superseded[] {
  const out: Superseded[] = [];
  for (const j of jurisdictionIds) {
    const c = chain(j);
    const current = c[c.length - 1];
    if (current === undefined) continue;
    for (const e of c) if (successor(j, e.id) !== null) out.push({ jurisdictionId: j, epochId: e.id, currentId: current.id });
  }
  return out;
}

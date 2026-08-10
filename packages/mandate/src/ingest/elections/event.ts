/**
 * What an election event IS, and what its id is. Pure — no file reading, no database.
 *
 * Split out of identity.ts on purpose: the importer needs the id scheme, identity.ts needs the importer's
 * CSV reader, and a cycle between them is a real hazard rather than a stylistic one. Everything here works
 * on rows already parsed, so both callers share one implementation of the scheme. Two implementations of an
 * id scheme are two id schemes.
 *
 * docs/model/election-identity.md.
 */

export type House = "ac" | "pc";

/** One real electoral event, as the source describes it. */
export type SourceElection = {
  jurisdictionId: string;
  house: House;
  year: number;
  /** TCPD's Assembly_No — the ordinal of the house this election constituted. */
  houseOrdinal: number | null;
  /** 0 for a general election, 1..n for a by-election round. */
  pollNo: number;
  /** Earliest polling month the source gives, or null (by-election rows carry none). */
  month: number | null;
  seats: number;
  rows: number;
  sourceId: string;
};

/** An integer, or null. Blank is NULL, not zero: `Number("")` is 0, so a missing `month` came back as
 *  month 0 and failed the CHECK that says a month is 1-12 — which is the constraint doing its job. */
export const int = (v: string | undefined): number | null => {
  const t = (v ?? "").trim();
  if (t === "" || t === "NA" || t === "NULL") return null;
  const n = Number(t);
  return Number.isInteger(n) ? n : null;
};

/** Which house a row's `Election_Type` names, or null when it names neither. Never defaulted. */
export function houseOf(electionType: string | undefined): House | null {
  const t = (electionType ?? "").toUpperCase();
  return t.includes("(GE)") ? "pc" : t.includes("(AE)") ? "ac" : null;
}

/** Group key: everything the OLD id encoded. Events sharing this are the ones that used to collapse. */
export const groupKey = (e: {
  jurisdictionId: string;
  house: House;
  year: number;
  pollNo: number;
}): string => `${e.jurisdictionId} ${e.house} ${e.year} ${e.pollNo > 0 ? "by" : "gen"}`;

/** Full event key: what makes two rows the same election. */
export const eventKey = (e: {
  jurisdictionId: string;
  house: House;
  year: number;
  houseOrdinal: number | null;
  pollNo: number;
}): string => `${e.jurisdictionId} ${e.house} ${e.year} A${e.houseOrdinal ?? "?"} p${e.pollNo}`;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * The id for an event, given every event in its group.
 *
 * Existing ids are preserved wherever a group holds one event — 1,186 of 1,188 — because a rename with
 * nothing behind it is churn. A group with several events suffixes EVERY member, not just the later ones:
 * neither of Bihar's 2005 elections is more "the" 2005 election than the other.
 *
 * The suffix is the polling month where that separates the group (`-02`, `-11`, which reads as a date) and
 * the house ordinal where it does not (`-a13`). By-election rounds use the round number (`-p1`).
 */
export function electionIdOf(e: SourceElection, group: readonly SourceElection[]): string {
  const base =
    e.pollNo > 0
      ? `${e.jurisdictionId}-bypoll-${e.house === "ac" ? "ae" : "ge"}-${e.year}`
      : e.house === "ac"
        ? `${e.jurisdictionId}-assembly-${e.year}`
        : `ls-${e.year}`;
  if (group.length <= 1) return base;
  if (e.pollNo > 0) return `${base}-p${e.pollNo}`;
  const months = new Set(group.map((g) => g.month));
  return months.size === group.length && e.month !== null
    ? `${base}-${String(e.month).padStart(2, "0")}`
    : `${base}-a${e.houseOrdinal ?? 0}`;
}

/** How a split event distinguishes itself in its NAME, so a reader is never shown two identical titles. */
export function suffixNote(e: SourceElection, group: readonly SourceElection[]): string {
  if (group.length <= 1) return "";
  if (e.pollNo > 0) return ` (round ${e.pollNo})`;
  const month = e.month === null ? null : MONTHS[e.month - 1];
  return month === undefined || month === null
    ? ` (${ordinal(e.houseOrdinal)} house)`
    : ` (${month})`;
}

function ordinal(n: number | null): string {
  if (n === null) return "unknown";
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** Chronological order within a group: month where known, then the house ordinal, then the round. */
export function chronological(a: SourceElection, b: SourceElection): number {
  return (
    (a.month ?? 0) - (b.month ?? 0) ||
    (a.houseOrdinal ?? 0) - (b.houseOrdinal ?? 0) ||
    a.pollNo - b.pollNo
  );
}

export type Row = Record<string, string>;

/**
 * Fold parsed rows into events, grouped and ordered.
 *
 * `month` for an event is the EARLIEST the source reports for it, because polling is phased and a single
 * election legitimately carries several months across its seats.
 */
export function eventsFromRows(
  jurisdictionId: string,
  rows: readonly Row[],
  sourceId: string,
): { events: SourceElection[]; groups: Map<string, SourceElection[]> } {
  const acc = new Map<string, SourceElection>();
  const seatsOf = new Map<string, Set<string>>();
  for (const r of rows) {
    const house = houseOf(r["Election_Type"]);
    const year = int(r["Year"]);
    if (house === null || year === null) continue;
    const pollNo = int(r["Poll_No"]) ?? 0;
    // A GENERAL parliamentary election is ONE NATIONAL EVENT. Every state file describes its own slice of
    // the 2019 Lok Sabha election, so keying it by the file's state made one event per state — 1,571
    // "events" against 1,188 elections, and whichever state was imported last would have owned the row's
    // occurrence and source. A parliamentary BY-election is not national: 'up-bypoll-ge-1970' is Uttar
    // Pradesh's, and the existing ids say so.
    const jid = house === "pc" && pollNo === 0 ? "in" : jurisdictionId;
    const draft = {
      jurisdictionId: jid,
      house,
      year,
      houseOrdinal: int(r["Assembly_No"]),
      pollNo,
    };
    const k = eventKey(draft);
    const seat = (r["Constituency_No"] ?? "").trim();
    const cur = acc.get(k);
    if (cur === undefined) {
      acc.set(k, { ...draft, month: int(r["month"]), seats: 1, rows: 1, sourceId });
      seatsOf.set(k, new Set([seat]));
    } else {
      cur.rows += 1;
      const s = seatsOf.get(k) ?? new Set<string>();
      s.add(seat);
      seatsOf.set(k, s);
      cur.seats = s.size;
      const mo = int(r["month"]);
      if (mo !== null && (cur.month === null || mo < cur.month)) cur.month = mo;
    }
  }
  const events = [...acc.values()];
  const groups = new Map<string, SourceElection[]>();
  for (const e of events) {
    const g = groups.get(groupKey(e)) ?? [];
    g.push(e);
    groups.set(groupKey(e), g);
  }
  for (const g of groups.values()) g.sort(chronological);
  return { events, groups };
}

export type PlannedEvent = {
  id: string;
  occurrence: number;
  month: number | null;
  suffixNote: string;
};

/** Every event of a parsed file, keyed by `eventKey`, with its id and occurrence resolved. */
export function planFromRows(
  jurisdictionId: string,
  rows: readonly Row[],
  sourceId: string,
): Map<string, PlannedEvent> {
  const { groups } = eventsFromRows(jurisdictionId, rows, sourceId);
  const out = new Map<string, PlannedEvent>();
  for (const g of groups.values()) {
    g.forEach((e, i) => {
      out.set(eventKey(e), {
        id: electionIdOf(e, g),
        occurrence: i + 1,
        month: e.month,
        suffixNote: suffixNote(e, g),
      });
    });
  }
  return out;
}

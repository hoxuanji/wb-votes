// The coverage page's ledger of subject areas, grouped by what is true of them and saying what a group lacks once.
//
// WHY THIS EXISTS. The ledger was eighteen rows in the order the spec lists them, with a Status column and a Rows column on every one. Eleven of the
// eighteen said the same thing in the same words: "Not modelled", "none" for rows, nothing measured for reach, and a caveat of the shape "no <x>
// model exists yet". Three more said "Table, no rows" and "none". The four with data were scattered among them (rows 1 to 3 and 5). It was 1,849px
// tall at a desktop's width and 2,841px at a phone's, where three of its five columns were behind a sideways scroll, and a reader looking for what
// the platform holds had to read all eighteen to find the four.
//
// WHAT IT DOES. It groups the rows by status, in the order a reader wants them (what holds data, then tables that hold nothing, then subjects with no
// model), and says once, above a group, what every row of it lacks: the same pattern as `sharedGaps` in seat-list.ts. A gap that only some rows have
// stays on those rows: a subject that waits on a model several others wait on is named with them once, and a subject whose caveat says more than
// "the model does not exist" keeps that caveat. NOTHING IS REMOVED: each entry carries the vertical's own words (`scope` is verbatim), and the page
// keeps the exact table of all eighteen rows behind a disclosure, so a grouping that dropped a fact would show against the table.
//
// Pure: verticals in, groups out; no React, no database (ADR 0002).

import type { Status, VerticalState } from "./coverage.ts";

/** What a no-model subject's caveat begins with: the model it lacks. Every one of the eleven does; a scope that does not is kept whole. */
const LACKS = /^no (.+?) (model|pipeline) exists yet/;

/** What a caveat says after the missing-model clause ("— and note that Indian legislatures rarely hold division votes…"), or null where it ends there. */
function beyondModel(scope: string): { waitsOn: string; beyond: string | null } | null {
  const m = LACKS.exec(scope);
  if (m === null) return null;
  const rest = scope.slice(m[0].length).replace(/^[\s,;—–-]+/, "").trim();
  return { waitsOn: `${m[1]} ${m[2]}`, beyond: rest === "" ? null : rest };
}

export type LedgerEntry = {
  key: string;
  label: string;
  question: string;
  source: string;
  /** The vertical's caveat, verbatim. */
  scope: string;
  /** What the count counts and the count, for a subject that holds rows; null for one that holds none (which its group says once). */
  rows: { count: number; unit: string } | null;
  /** The measured reach; null where none was measured. */
  reach: string | null;
  /** For a subject with no model: the model it waits for ("fiscal model"), read from the caveat's first clause; null when the caveat does not begin that way. */
  waitsOn: string | null;
  /** For a subject with no model: what its caveat says beyond the missing model; null where it says nothing more, and the whole caveat where the first clause is not the usual one. */
  beyond: string | null;
  /**
   * What the page prints beside the subject. A subject that holds rows or a table prints its whole caveat. A subject with no model prints nothing where its
   * caveat is only the missing model (its group says that once), only what it says beyond a model several others wait on (the group names that model
   * once), and its whole caveat otherwise.
   */
  caveat: string | null;
};

export type LedgerGroup = {
  status: Status;
  /** One sentence for what the status means, so that the rows need not repeat it. */
  meaning: string;
  entries: LedgerEntry[];
  /** What every entry of the group lacks, as `sharedGaps` reports it: a flag for each gap every entry has, and the sentence. */
  shared: { rows: boolean; reach: boolean; sentence: string | null };
  /** Subjects that wait on one model, named once. Only a model two or more of the group wait on is listed. */
  waiting: { model: string; labels: string[]; sentence: string }[];
};

const MEANING: Record<Status, string> = {
  present: "A query found rows. The reach is counted; the line under it is what it leaves out.",
  empty: "A table in the schema models each.",
  "no-model": "Nothing in the schema can hold these.",
};

/** The order a reader wants the groups in. */
export const GROUP_ORDER: readonly Status[] = ["present", "empty", "no-model"];

const entryOf = (v: VerticalState): LedgerEntry => {
  const lack = v.status === "no-model" ? beyondModel(v.scope) : null;
  return {
    key: v.key,
    label: v.label,
    question: v.question,
    source: v.source,
    scope: v.scope,
    rows: v.status === "present" ? { count: v.count, unit: v.unit } : null,
    reach: v.reach,
    waitsOn: lack === null ? null : lack.waitsOn,
    // A scope that does not begin with the usual clause is not parsed away: it is all "beyond".
    beyond: v.status !== "no-model" ? null : lack === null ? v.scope : lack.beyond,
    caveat: v.scope,
  };
};

/**
 * WHAT EVERY ROW OF A GROUP LACKS, said once. Rows and reach are the only two columns a group can lack in common: a subject with no rows has no
 * reach measured either, so a group of those says so in one sentence, and a group with rows says nothing, and a row of it with no measured reach keeps
 * saying so itself. One row is not a group: with fewer than two, nothing is shared.
 */
function sharedOf(entries: readonly LedgerEntry[]): LedgerGroup["shared"] {
  const every = (f: (e: LedgerEntry) => boolean): boolean => entries.length >= 2 && entries.every(f);
  const rows = every((e) => e.rows === null);
  const reach = every((e) => e.reach === null);
  const parts = [rows ? "no rows" : null, reach ? "no reach measured" : null].filter((p): p is string => p !== null);
  return { rows, reach, sentence: parts.length === 0 ? null : `On every subject in this group: ${parts.join(" · ")}.` };
}

/** "A", "A and B", "A, B and C". */
const listed = (items: readonly string[]): string => (items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

function waitingOf(entries: readonly LedgerEntry[]): LedgerGroup["waiting"] {
  const by = new Map<string, string[]>();
  for (const e of entries) {
    if (e.waitsOn === null) continue;
    by.set(e.waitsOn, [...(by.get(e.waitsOn) ?? []), e.label]);
  }
  return [...by]
    .filter(([, labels]) => labels.length >= 2)
    .map(([model, labels]) => ({ model, labels, sentence: `${listed(labels)} wait on one ${model}.` }));
}

/** A no-model subject's caveat once its group has said the missing model (see `LedgerEntry.caveat`). */
function caveatOf(e: LedgerEntry, waiting: LedgerGroup["waiting"]): string | null {
  if (e.beyond === null) return null;
  return e.waitsOn !== null && waiting.some((w) => w.model === e.waitsOn) ? e.beyond : e.scope;
}

/** The ledger as groups: by status in `GROUP_ORDER`, each in the spec's own order; a status no subject has makes no group. */
export function ledgerGroups(verticals: readonly VerticalState[]): LedgerGroup[] {
  return GROUP_ORDER.flatMap((status) => {
    const entries = verticals.filter((v) => v.status === status).map(entryOf);
    if (entries.length === 0) return [];
    const waiting = waitingOf(entries);
    const shown = status === "no-model" ? entries.map((e) => ({ ...e, caveat: caveatOf(e, waiting) })) : entries;
    return [{ status, meaning: MEANING[status], entries: shown, shared: sharedOf(entries), waiting }];
  });
}

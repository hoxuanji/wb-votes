// Floor 1 (Brief) presentation logic for a person: the computed headline, the stat tiles, the
// affidavit delta and the freshness stamp. Pure functions over PersonBrief — no DB, no React —
// so brief.test.ts can run them under node:test.
//
// It lives in the package, not beside the route, for one reason: a file under src/ that this
// package's tsconfig pulls in has its errors printed as "src/..." , and registry:typecheck greps
// for "^packages/mandate" — so the strict gate (noUncheckedIndexedAccess et al) silently skipped
// it. Here it is checked. src/app/p/[person]/page.tsx imports it; nothing else may.

import type { PersonBrief, SourceRef } from "./index.ts";

type Candidacy = PersonBrief["candidacies"][number];
type Filing = PersonBrief["affidavitTrail"][number];

/** Indian digit grouping. Intl does the 3-then-2s split, so we do not. */
export function inr(n: number): string {
  return new Intl.NumberFormat("en-IN").format(n);
}

/** Indian money units. Below a lakh the plain grouped rupee figure is the honest one. */
export function rupees(n: number): string {
  if (n >= 1e7) return `Rs ${trim(n / 1e7)} cr`;
  if (n >= 1e5) return `Rs ${trim(n / 1e5)} lakh`;
  return `Rs ${inr(Math.round(n))}`;
}

/** Two decimals below 100, whole grouped numerals above it. Only zeros AFTER a decimal point may be
 *  stripped: "100".replace(/\.?0+$/,"") is "1", which under-reported every figure at or above
 *  Rs 100 cr by 10x or 100x. */
function trim(v: number): string {
  return v >= 100 ? inr(Math.round(v)) : v.toFixed(2).replace(/\.?0+$/, "");
}

export function years(cands: readonly Candidacy[]): number[] {
  return [...new Set(cands.map((c) => c.year))].sort((a, b) => a - b);
}

function placePhrase(cands: readonly Candidacy[]): string {
  const places = [...new Set(cands.map((c) => c.placeName))];
  if (places.length === 1) return places[0] ?? "";
  if (places.length === 2) return `${places[0]} and ${places[1]}`;
  return `${places.length} seats`;
}

function spanPhrase(cands: readonly Candidacy[]): string {
  const ys = years(cands);
  const first = ys[0];
  const last = ys[ys.length - 1];
  if (first === undefined || last === undefined) return "";
  return first === last ? `in ${first}` : `from ${first} to ${last}`;
}

function seatPhrase(c: Candidacy): string {
  return `${c.placeName} ${c.year}`;
}

/**
 * The headline verdict (§2 P1): a declarative sentence computed from the rows, never a label.
 * Three clauses at most — record, best margin, declared assets — and each one is dropped rather
 * than filled with a placeholder when the data for it is absent.
 */
export function headline(b: PersonBrief): string {
  const cands = b.candidacies;
  const name = b.person.canonicalName;
  if (cands.length === 0) {
    return `No contest is on record for ${name}, so there is nothing to judge yet.`;
  }
  const decided = cands.filter(isDecided);
  const pending = cands.filter((c) => !isDecided(c));
  const wins = decided.filter(won);
  const clauses: string[] = [record(decided, wins, pending)];

  const best = wins.reduce<Candidacy | null>(
    (a, c) => (c.margin !== null && (a === null || a.margin === null || c.margin > a.margin) ? c : a),
    null,
  );
  if (wins.length > 1 && best?.margin != null) {
    clauses.push(`widest win by ${inr(best.margin)} votes at ${seatPhrase(best)}`);
  }
  if (pending.length > 0 && decided.length > 0) clauses.push(pendingPhrase(pending));
  clauses.push(money(b.affidavitTrail));
  return `${clauses.join(", ")}.`;
}

/**
 * An outcome, or the absence of one. 2,627 candidacies in this registry are status='contesting' and
 * NOT ONE has a row in `result`, so partitioning a career on `isWinner` publishes "lost" and "never
 * elected" for people whose contest was never decided. Only these two statuses are a result;
 * 'contesting', 'filed', 'withdrawn', 'rejected' and 'disqualified' are not, and a withdrawal is
 * not a defeat.
 */
export function isDecided(c: Candidacy): boolean {
  return c.status === "elected" || c.status === "defeated";
}

/** `is_winner` comes from the result row; `status='elected'` comes from the source's own
 *  declaration. One 2026 seat has the second and no result row at all, and it is still a win. */
export function won(c: Candidacy): boolean {
  return c.isWinner || c.status === "elected";
}

function pendingPhrase(open: readonly Candidacy[]): string {
  const n = open.length;
  const where = n === 1 && open[0] !== undefined ? ` at ${seatPhrase(open[0])}` : "";
  return `${inr(n)} contest${n === 1 ? "" : "s"} on record${where} ${n === 1 ? "has" : "have"} no declared result`;
}

function record(
  decided: readonly Candidacy[],
  wins: readonly Candidacy[],
  open: readonly Candidacy[],
): string {
  if (decided.length === 0) {
    // Nothing has been decided: state the standing as a fact, and characterise nothing.
    const one = open[0];
    return open.length === 1 && one !== undefined
      ? `Standing at ${seatPhrase(one)}, with no result declared`
      : `Standing in ${inr(open.length)} contests, none of them with a declared result`;
  }
  // "decided" only earns its place in the sentence when some contest is NOT decided; on a settled
  // career it is noise.
  const q = open.length > 0 ? "decided " : "";
  const n = decided.length;
  const only = decided[0];
  if (n === 1 && only !== undefined) {
    const v = only.votes;
    const tail =
      v === null
        ? " (no vote count reported)"
        : `, ${inr(v)} votes${only.voteShare !== null && only.voteShare > 0 ? ` and ${only.voteShare}% of the vote` : ""}`;
    return won(only)
      ? `Won the only ${q}contest on record, ${seatPhrase(only)}${tail}`
      : `Lost the only ${q}contest on record, ${seatPhrase(only)}${tail}`;
  }
  const where = placePhrase(decided);
  const span = spanPhrase(decided);
  if (wins.length === n) return `Won all ${n} ${q}contests in ${where} ${span}`;
  if (wins.length === 0) {
    return q === ""
      ? `Contested ${n} times in ${where} ${span} and has never been elected`
      : `Contested ${n} decided elections in ${where} ${span} and was elected in none of them`;
  }
  return `Won ${wins.length} of ${n} ${q}contests in ${where} ${span}`;
}

function money(trail: readonly Filing[]): string {
  const withAssets = trail.filter((f) => f.assetsTotal !== null);
  const first = withAssets[0];
  const last = withAssets[withAssets.length - 1];
  if (first === undefined || last === undefined) return "no affidavit filing is in the registry";
  if (withAssets.length === 1 || first === last) {
    return `declared assets of ${rupees(last.assetsTotal ?? 0)} in ${last.year}`;
  }
  return `declared assets of ${rupees(first.assetsTotal ?? 0)} in ${first.year} and ${rupees(last.assetsTotal ?? 0)} in ${last.year}`;
}

export type Tile = {
  label: string;
  /** Already formatted, tabular-safe. */
  value: string;
  unit: string | null;
  /** What vintage / seat the value belongs to. */
  note: string | null;
  source: SourceRef | null;
};

/** The one source behind every result and turnout row in this registry. Candidacies in PersonBrief
 *  carry no source id (see the gap note in the return), so result-derived tiles resolve to the
 *  election-results source by kind, and render sourceless if it is absent. */
function resultSource(sources: readonly SourceRef[]): SourceRef | null {
  return sources.find((s) => s.kind === "eci_declaration" || s.kind === "eci_form20") ?? null;
}

function byId(sources: readonly SourceRef[], id: string): SourceRef | null {
  return sources.find((s) => s.id === id) ?? null;
}

/** 4-6 tiles, in this order, each dropped when its figure does not exist. */
export function tiles(b: PersonBrief): Tile[] {
  const cands = b.candidacies;
  const rs = resultSource(b.sources);
  const decided = cands.filter(isDecided);
  const open = cands.filter((c) => !isDecided(c));
  const wins = decided.filter(won);
  const ys = years(cands);
  const out: Tile[] = [];
  if (cands.length > 0) {
    out.push({
      label: "Contests fought",
      value: inr(cands.length),
      unit: cands.length === 1 ? "election" : "elections",
      note: ys.length > 1 ? `${ys[0]}–${ys[ys.length - 1]}` : `${ys[0]}`,
      source: rs,
    });
  }
  // Only a decided contest can be won or lost, so the record tile counts those and the undecided
  // rows get their own tile rather than being folded in as losses.
  if (decided.length > 0) {
    out.push({
      label: "Contests won",
      value: `${inr(wins.length)} of ${inr(decided.length)}`,
      unit: decided.length === cands.length ? null : "contests with a declared result",
      note: wins.length === 0 ? "elected in none of them" : `latest ${wins[0]?.year}`,
      source: rs,
    });
  }
  if (open.length > 0) {
    const one = open[0];
    out.push({
      label: "Awaiting a result",
      value: inr(open.length),
      unit: open.length === 1 ? "contest" : "contests",
      note: open.length === 1 && one !== undefined ? seatPhrase(one) : "no result declared",
      source: rs,
    });
  }
  const best = wins.reduce<Candidacy | null>(
    (a, c) => (c.margin !== null && (a === null || a.margin === null || c.margin > a.margin) ? c : a),
    null,
  );
  if (best?.margin != null) {
    out.push({
      label: "Widest winning margin",
      value: inr(best.margin),
      unit: "votes",
      note: seatPhrase(best),
      source: rs,
    });
  }
  const latestVotes = cands.find((c) => c.votes !== null);
  if (latestVotes !== undefined) {
    out.push({
      label: "Votes, latest counted contest",
      value: inr(latestVotes.votes ?? 0),
      unit: latestVotes.voteShare === null ? "votes" : `votes · ${latestVotes.voteShare}%`,
      note: seatPhrase(latestVotes),
      source: rs,
    });
  }
  const assets = [...b.affidavitTrail].reverse().find((f) => f.assetsTotal !== null);
  if (assets !== undefined) {
    out.push({
      label: "Declared assets",
      value: rupees(assets.assetsTotal ?? 0),
      unit: "self-declared",
      note: `affidavit ${assets.year}`,
      source: byId(b.sources, assets.sourceId),
    });
  }
  // P5: a bare count with no stage. The label says declared, and nothing here implies a charge.
  const cases = [...b.affidavitTrail].reverse().find((f) => f.pendingCasesDeclared !== null);
  if (cases !== undefined) {
    out.push({
      label: "Cases pending (declared)",
      value: inr(cases.pendingCasesDeclared ?? 0),
      unit: cases.pendingCasesDeclared === 1 ? "case" : "cases",
      note: `affidavit ${cases.year}`,
      source: byId(b.sources, cases.sourceId),
    });
  }
  const parties = [...new Set(cands.map((c) => c.partyShortName).filter((p) => p !== null))];
  if (parties.length > 1) {
    out.push({
      label: "Parties stood for",
      value: inr(parties.length),
      unit: parties.join(", "),
      note: "across all contests",
      source: rs,
    });
  }
  // The two below only ever surface on a thin record — a long career fills six tiles before them.
  const ranked = decided.find((c) => c.rank !== null && !won(c));
  if (ranked?.rank != null) {
    out.push({
      label: "Finishing position",
      value: ordinal(ranked.rank),
      unit: "in the field",
      note: seatPhrase(ranked),
      source: rs,
    });
  }
  const turnout = cands.find((c) => c.turnoutPct !== null);
  if (turnout?.turnoutPct != null) {
    out.push({
      label: "Turnout where they stood",
      value: `${turnout.turnoutPct}%`,
      unit: "of electors",
      note: seatPhrase(turnout),
      source: rs,
    });
  }
  return out.slice(0, 6);
}

function ordinal(n: number): string {
  const rest = n % 100;
  const suffix = rest >= 11 && rest <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${inr(n)}${suffix}`;
}

export type DeltaRow = {
  field: string;
  /** Formatted values, oldest first — a series read backwards is a wrong delta. */
  cells: { year: number; text: string; sourceId: string }[];
  /** Bare arithmetic, no characterisation (§6.3). */
  change: string | null;
};

const FIELDS: { field: string; pick: (f: Filing) => number | null; money: boolean }[] = [
  { field: "Total assets", pick: (f) => f.assetsTotal, money: true },
  { field: "Movable assets", pick: (f) => f.movable, money: true },
  { field: "Immovable assets", pick: (f) => f.immovable, money: true },
  { field: "Total liabilities", pick: (f) => f.liabilitiesTotal, money: true },
  { field: "Cases pending (declared)", pick: (f) => f.pendingCasesDeclared, money: false },
];

/** One row per field that any filing reports. `change` is only computable with two filings. */
export function deltas(trail: readonly Filing[]): DeltaRow[] {
  return FIELDS.flatMap(({ field, pick, money: isMoney }) => {
    const cells = trail
      .filter((f) => pick(f) !== null)
      .map((f) => {
        const v = pick(f) ?? 0;
        return { year: f.year, text: isMoney ? rupees(v) : inr(v), sourceId: f.sourceId };
      });
    if (cells.length === 0) return [];
    const a = trail.filter((f) => pick(f) !== null)[0];
    const z = trail.filter((f) => pick(f) !== null).slice(-1)[0];
    let change: string | null = null;
    if (a !== undefined && z !== undefined && a !== z) {
      const from = pick(a) ?? 0;
      const to = pick(z) ?? 0;
      const diff = to - from;
      const times = from === 0 ? null : to / from;
      change =
        `${diff >= 0 ? "+" : "−"}${isMoney ? rupees(Math.abs(diff)) : inr(Math.abs(diff))}` +
        (times === null ? "" : ` (×${trim(times)})`);
    }
    return [{ field, cells, change }];
  });
}

export type Freshness = {
  total: number;
  fetched: number;
  /** Of the fetched ones, how many are a file in THIS repository rather than a publisher document.
   *  Every 'fetched' row in this registry is one, so the page may not say "from the original
   *  document". */
  repoFiles: number;
  /** Newest retrieved_at across the sources behind this page. */
  retrievedAt: string | null;
};

export function fromRepo(s: SourceRef): boolean {
  return s.url !== null && s.url.startsWith("repo:");
}

export function freshness(b: PersonBrief): Freshness {
  const stamps = b.sources.map((s) => s.retrievedAt).sort();
  const fetched = b.sources.filter((s) => s.retrievalKind === "fetched");
  return {
    total: b.sources.length,
    fetched: fetched.length,
    repoFiles: fetched.filter(fromRepo).length,
    retrievedAt: stamps[stamps.length - 1] ?? null,
  };
}

/** How the bytes behind a source were obtained, in the reader's words rather than the column's. */
export function retrievalText(s: SourceRef): string {
  if (s.retrievalKind !== "fetched") return "not fetched — asserted by upstream";
  const hash = `hashed ${s.hashKind.replace(/_/g, " ")}`;
  return fromRepo(s)
    ? `read from a file in this repository, ${hash}`
    : `fetched from the publisher, ${hash}`;
}

/** Only an http(s) source is linkable. `repo:data/seed/...` and a null url are not, and must not
 *  render as if they were (P2). */
export function href(s: SourceRef | null): string | null {
  return s?.url != null && /^https?:\/\//.test(s.url) ? s.url : null;
}

export function sourceLabel(s: SourceRef): string {
  return [s.publisher, s.title].filter((x) => x !== null && x !== "").join(" — ") || s.id;
}

/** The citation under a figure, where the full publisher+title line is noise repeated six times.
 *  The Sources section carries the full label. */
export function shortSource(s: SourceRef): string {
  return s.publisher ?? s.title ?? s.id;
}

/** Margin as the row's own story: a winner's lead, a loser's deficit — stated, not characterised. */
export function marginText(margin: number | null, isWinner: boolean): string | null {
  if (margin === null) return null;
  return isWinner ? inr(Math.abs(margin)) : `${inr(Math.abs(margin))} behind`;
}

/** A date a human reads, from an ISO stamp, without pulling in a formatter. */
export function isoDay(stamp: string | null): string | null {
  return stamp === null ? null : (stamp.slice(0, 10) || null);
}

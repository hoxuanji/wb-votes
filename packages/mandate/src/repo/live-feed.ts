// The live feed: a JSON file that says an election is running, read and checked before any page shows a number from it.
//
// WHAT THIS IS NOT. The registry does not forecast. A projection is on a board only as something another party PUBLISHED, with the
// publisher's name, the day it was published and (when the publisher gave one) its own description of the method, and a board never
// carries a number the registry computed about the future. The validator therefore refuses a projection with no publisher, and the one
// sentence a board produces (`liveSentence`) is built from the board's own counts and says what is counted, never what will happen.
// The feed's PRODUCER is not here (phase 3 of the design): this reads a file, wherever it came from, and the caller names the path.
//
// WHAT READING IT GIVES THE PAGE (`LiveRead`):
//  · null            no path, or no file at it: no live election, and the page shows no live element at all. Not an error: a file
//                    that is not there is how "nothing is running" is said.
//  · { error }       a file that is there and is not a valid feed. The page shows the error where the board would have been; it never
//                    shows a half-validated board, because a count that is subtly wrong looks exactly like one that is right.
//  · { boards }      every board, validated, with `stale` decided against the moment of the read.
// Nothing here throws: a missing directory, a directory where a file should be, a file that is not UTF-8 JSON and a board that is
// short of a field are all answers. The message names the field and never the path of the file on the server.
//
// THE FILE (version 1), every key checked and an unknown one refused, because a misspelt `leading` would otherwise be a board that
// silently counts none:
//
//   { "version": 1,
//     "boards": [ {
//       "election":    { "id": string|null, "name", "jurisdictionId": string|null, "jurisdictionName", "kind": "assembly"|"lok_sabha", "year": int },
//       "status":      "polling" | "counting" | "declared",
//       "asOf":        ISO timestamp with a zone, the producer's own clock,
//       "seats":       { "total": int > 0, "declared": int <= total, "majority": the integer above half of total },
//       "parties":     [ { "party": { "key", "label" }, "won": int, "leading": int } ],
//       "projections": [ { "publisher", "kind": "exit_poll"|"opinion_poll"|"agency_projection", "publishedOn": ISO date,
//                          "url": http(s) URL|null, "method": string|null, "ranges": [ { "party": { "key", "label" }, "low", "high" } ] } ],
//       "events":      [ { "at": ISO timestamp, "text", "url": http(s) URL|null } ] } ] }
//
// `id`, `jurisdictionId`, `url`, `method`, `projections` and `events` may be left out and are then null or empty. `stale` is not a field of
// the file: it is the reader's decision, and a file that carries one is refused.
//
// THE MEANING OF `declared`, which the sentence depends on. It is the number of seats whose STATUS is known: a result declared, or a party
// leading in a count still running (the Commission's own trends page calls it "status known"). So every party's `won + leading` is a share
// of it, and the validator refuses a board where the parties together hold more than `declared`, or more than `total`. A feed that uses
// `declared` for won seats alone and lists leads besides would make "N of M declared seats" say N of fewer than N; it is refused here,
// loudly, and not printed.
//
// A RANGE is a count of SEATS (an integer from 0 to the total), not a vote share: the page draws it against the majority line.
//
// A URL must be http or https. A feed is a file somebody writes, and the page puts its links in `href`: `javascript:` is refused here and
// is not left for the page to remember to escape.

import { readFileSync, statSync } from "node:fs";
import type { LiveBoard, LiveEvent, LiveRead, Projection } from "./situation-types.ts";
import type { PartyRef } from "./seat-results.ts";

/** A feed larger than this is not a feed: the page polls it every twenty seconds and reads the whole file each time. */
const MAX_BYTES = 1_000_000;

/** A text field longer than this is refused: it would be printed in a panel, and a paragraph there is not what the field is for. */
const MAX_TEXT = 2_000;

const STATUSES = ["polling", "counting", "declared"] as const;
const ELECTION_KINDS = ["assembly", "lok_sabha"] as const;
const PROJECTION_KINDS = ["exit_poll", "opinion_poll", "agency_projection"] as const;

/** A feed read as a value: the pure half of `readLiveFeed`, for a caller that already holds the text. */
export type Parsed = { boards: LiveBoard[] } | { error: string };

type Fields = { required: readonly string[]; optional?: readonly string[] };
type Obj = Record<string, unknown>;

const isObject = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** The object at `at`, or null (with the reason recorded) when it is not one, or has a key it should not or lacks one it must. */
function shape(v: unknown, at: string, fields: Fields, errs: string[]): Obj | null {
  if (!isObject(v)) {
    errs.push(`${at}: must be an object`);
    return null;
  }
  const known = new Set([...fields.required, ...(fields.optional ?? [])]);
  let ok = true;
  for (const k of Object.keys(v)) {
    if (!known.has(k)) {
      errs.push(`${at}: unknown key "${k}"`);
      ok = false;
    }
  }
  for (const k of fields.required) {
    if (!(k in v)) {
      errs.push(`${at}: missing "${k}"`);
      ok = false;
    }
  }
  return ok ? v : null;
}

function text(v: unknown, at: string, errs: string[]): string | null {
  if (typeof v !== "string" || v.trim() === "") {
    errs.push(`${at}: must be a non-empty string`);
    return null;
  }
  if (v.length > MAX_TEXT) {
    errs.push(`${at}: longer than ${MAX_TEXT} characters`);
    return null;
  }
  return v;
}

/** Absent and null are both "none"; anything else must be a good string. */
function maybeText(v: unknown, at: string, errs: string[]): string | null {
  return v === undefined || v === null ? null : text(v, at, errs);
}

function link(v: unknown, at: string, errs: string[]): string | null {
  if (v === undefined || v === null) return null;
  const s = text(v, at, errs);
  if (s === null) return null;
  try {
    const u = new URL(s);
    if (u.protocol === "http:" || u.protocol === "https:") return s;
  } catch {
    // falls through to the error: a string that is not a URL is refused like one that is not http(s)
  }
  errs.push(`${at}: must be an http or https URL`);
  return null;
}

function whole(v: unknown, at: string, errs: string[], min: number, max = Number.MAX_SAFE_INTEGER): number | null {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    errs.push(`${at}: must be a whole number from ${min}${max === Number.MAX_SAFE_INTEGER ? " up" : ` to ${max}`}`);
    return null;
  }
  return v;
}

function oneOf<T extends string>(v: unknown, at: string, allowed: readonly T[], errs: string[]): T | null {
  if (typeof v === "string" && (allowed as readonly string[]).includes(v)) return v as T;
  errs.push(`${at}: must be one of ${allowed.join(", ")}`);
  return null;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const STAMP = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

/** A real calendar day: V8 reads 30 February as 2 March, and a date that is quietly moved is not one that was checked. */
function realDay(y: string, m: string, d: string): boolean {
  const t = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return t.getUTCFullYear() === Number(y) && t.getUTCMonth() === Number(m) - 1 && t.getUTCDate() === Number(d);
}

function isoDate(v: unknown, at: string, errs: string[]): string | null {
  const m = typeof v === "string" ? DATE.exec(v) : null;
  if (m === null || !realDay(m[1] as string, m[2] as string, m[3] as string)) {
    errs.push(`${at}: must be an ISO date (YYYY-MM-DD)`);
    return null;
  }
  return v as string;
}

/** An instant with a zone designator: without one the same string is two different moments on two servers. */
function isoStamp(v: unknown, at: string, errs: string[]): string | null {
  const m = typeof v === "string" ? STAMP.exec(v) : null;
  if (m === null || !realDay(m[1] as string, m[2] as string, m[3] as string)) {
    errs.push(`${at}: must be an ISO timestamp with a zone (YYYY-MM-DDTHH:MM:SSZ)`);
    return null;
  }
  return v as string;
}

function party(v: unknown, at: string, errs: string[]): PartyRef | null {
  const o = shape(v, at, { required: ["key", "label"] }, errs);
  if (o === null) return null;
  const key = text(o["key"], `${at}.key`, errs);
  const label = text(o["label"], `${at}.label`, errs);
  return key === null || label === null ? null : { key, label };
}

function list(v: unknown, at: string, errs: string[]): unknown[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    errs.push(`${at}: must be a list`);
    return [];
  }
  return v;
}

function projection(v: unknown, at: string, total: number | null, errs: string[]): Projection | null {
  const o = shape(v, at, { required: ["publisher", "kind", "publishedOn", "ranges"], optional: ["url", "method"] }, errs);
  if (o === null) return null;
  const before = errs.length;
  // No publisher, no number: the registry shows what others published, and never a figure that is nobody's.
  const publisher = text(o["publisher"], `${at}.publisher`, errs);
  const kind = oneOf(o["kind"], `${at}.kind`, PROJECTION_KINDS, errs);
  const publishedOn = isoDate(o["publishedOn"], `${at}.publishedOn`, errs);
  const url = link(o["url"], `${at}.url`, errs);
  const method = maybeText(o["method"], `${at}.method`, errs);
  const raw = list(o["ranges"], `${at}.ranges`, errs);
  if (raw.length === 0) errs.push(`${at}.ranges: needs at least one range`);
  const seen = new Set<string>();
  const ranges: Projection["ranges"] = [];
  raw.forEach((r, i) => {
    const here = `${at}.ranges[${i}]`;
    const ro = shape(r, here, { required: ["party", "low", "high"] }, errs);
    if (ro === null) return;
    const p = party(ro["party"], `${here}.party`, errs);
    const top = total ?? Number.MAX_SAFE_INTEGER;
    const low = whole(ro["low"], `${here}.low`, errs, 0, top);
    const high = whole(ro["high"], `${here}.high`, errs, 0, top);
    if (low !== null && high !== null && low > high) errs.push(`${here}: low ${low} is above high ${high}`);
    if (p !== null && seen.has(p.key)) errs.push(`${here}.party: "${p.key}" is listed twice in one projection`);
    if (p !== null) seen.add(p.key);
    if (p !== null && low !== null && high !== null && low <= high) ranges.push({ party: p, low, high });
  });
  if (errs.length > before || publisher === null || kind === null || publishedOn === null) return null;
  return { publisher, kind, publishedOn, url, method, ranges };
}

function event(v: unknown, at: string, errs: string[]): LiveEvent | null {
  const o = shape(v, at, { required: ["at", "text"], optional: ["url"] }, errs);
  if (o === null) return null;
  const when = isoStamp(o["at"], `${at}.at`, errs);
  const said = text(o["text"], `${at}.text`, errs);
  const url = link(o["url"], `${at}.url`, errs);
  return when === null || said === null ? null : { at: when, text: said, url };
}

function board(v: unknown, at: string, now: Date, freshMinutes: number, errs: string[]): LiveBoard | null {
  const o = shape(
    v,
    at,
    { required: ["election", "status", "asOf", "seats", "parties"], optional: ["projections", "events"] },
    errs,
  );
  if (o === null) return null;
  const before = errs.length;

  const eo = shape(
    o["election"],
    `${at}.election`,
    { required: ["name", "jurisdictionName", "kind", "year"], optional: ["id", "jurisdictionId"] },
    errs,
  );
  const election =
    eo === null
      ? null
      : {
          id: maybeText(eo["id"], `${at}.election.id`, errs),
          name: text(eo["name"], `${at}.election.name`, errs),
          jurisdictionId: maybeText(eo["jurisdictionId"], `${at}.election.jurisdictionId`, errs),
          jurisdictionName: text(eo["jurisdictionName"], `${at}.election.jurisdictionName`, errs),
          kind: oneOf(eo["kind"], `${at}.election.kind`, ELECTION_KINDS, errs),
          year: whole(eo["year"], `${at}.election.year`, errs, 1900, 2200),
        };

  const status = oneOf(o["status"], `${at}.status`, STATUSES, errs);
  const asOf = isoStamp(o["asOf"], `${at}.asOf`, errs);

  const so = shape(o["seats"], `${at}.seats`, { required: ["total", "declared", "majority"] }, errs);
  let seats: LiveBoard["seats"] | null = null;
  if (so !== null) {
    const total = whole(so["total"], `${at}.seats.total`, errs, 1);
    const declared = total === null ? null : whole(so["declared"], `${at}.seats.declared`, errs, 0, total);
    const majority = whole(so["majority"], `${at}.seats.majority`, errs, 1);
    if (total !== null && majority !== null && majority !== Math.floor(total / 2) + 1) {
      errs.push(`${at}.seats.majority: ${majority} is not the integer above half of ${total} (${Math.floor(total / 2) + 1})`);
    }
    if (total !== null && declared !== null && majority !== null) seats = { total, declared, majority };
  }

  const parties: LiveBoard["parties"] = [];
  const keys = new Set<string>();
  const rawParties = list(o["parties"], `${at}.parties`, errs);
  rawParties.forEach((p, i) => {
    const here = `${at}.parties[${i}]`;
    const po = shape(p, here, { required: ["party", "won", "leading"] }, errs);
    if (po === null) return;
    const ref = party(po["party"], `${here}.party`, errs);
    const won = whole(po["won"], `${here}.won`, errs, 0);
    const leading = whole(po["leading"], `${here}.leading`, errs, 0);
    if (ref !== null && keys.has(ref.key)) errs.push(`${here}.party: "${ref.key}" is listed twice`);
    if (ref !== null) keys.add(ref.key);
    if (ref !== null && won !== null && leading !== null) parties.push({ party: ref, won, leading });
  });
  if (seats !== null) {
    const held = parties.reduce((n, p) => n + p.won + p.leading, 0);
    if (held > seats.total) {
      errs.push(`${at}.parties: won and leading add up to ${held}, which is more than the ${seats.total} seats there are`);
    } else if (held > seats.declared) {
      errs.push(`${at}.parties: won and leading add up to ${held}, which is more than the ${seats.declared} seats with a known status`);
    }
  }

  const projections = list(o["projections"], `${at}.projections`, errs)
    .map((p, i) => projection(p, `${at}.projections[${i}]`, seats?.total ?? null, errs))
    .filter((p): p is Projection => p !== null);
  const events = list(o["events"], `${at}.events`, errs)
    .map((e, i) => event(e, `${at}.events[${i}]`, errs))
    .filter((e): e is LiveEvent => e !== null);

  if (
    errs.length > before ||
    election === null ||
    election.name === null ||
    election.jurisdictionName === null ||
    election.kind === null ||
    election.year === null ||
    status === null ||
    asOf === null ||
    seats === null
  ) {
    return null;
  }
  return {
    election: {
      id: election.id,
      name: election.name,
      jurisdictionId: election.jurisdictionId,
      jurisdictionName: election.jurisdictionName,
      kind: election.kind,
      year: election.year,
    },
    status,
    asOf,
    stale: now.getTime() - Date.parse(asOf) > freshMinutes * 60_000,
    seats,
    parties,
    projections,
    events,
  };
}

/**
 * The text of a feed, checked and read. `now` and `freshMinutes` decide `stale`: a board whose `asOf` is more than `freshMinutes` before
 * `now`. A board dated in the future is not stale (a producer's clock a little ahead of the server's is not a stale count). A final
 * board (`declared`) also goes stale by this rule, because the rule is about the age of the count and not about whether it is final; a
 * page that wants a finished count shown without the warning decides that itself from `status`.
 */
export function parseLiveFeed(source: string, now: Date, freshMinutes = 30): Parsed {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (cause) {
    return { error: `The live feed is not valid JSON (${(cause as Error).message}).` };
  }
  const errs: string[] = [];
  const top = shape(value, "feed", { required: ["version", "boards"] }, errs);
  const out: LiveBoard[] = [];
  if (top !== null) {
    if (top["version"] !== 1) errs.push(`feed.version: must be 1 (this reader knows only version 1)`);
    if (!Array.isArray(top["boards"])) errs.push("feed.boards: must be a list");
    else {
      top["boards"].forEach((b, i) => {
        const read = board(b, `boards[${i}]`, now, freshMinutes, errs);
        if (read !== null) out.push(read);
      });
    }
  }
  if (errs.length === 0) return { boards: out };
  return { error: `The live feed is not valid: ${errs[0]}${errs.length > 1 ? ` (and ${errs.length - 1} more)` : ""}.` };
}

/**
 * The feed at `path`, or null. See the header for the three answers. Synchronous, as every registry read is: the file is small
 * (`MAX_BYTES`) and the page reads it once per request.
 */
export function readLiveFeed(path: string | undefined, now: Date, freshMinutes = 30): LiveRead {
  if (path === undefined || path === "") return null;
  let source: string;
  try {
    const at = statSync(path);
    if (!at.isFile()) return { error: "The live feed path is not a file." };
    if (at.size > MAX_BYTES) return { error: `The live feed is larger than ${MAX_BYTES} bytes.` };
    source = readFileSync(path, "utf8");
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    // A path with nothing at it, or whose directory is missing, is "no feed" and not a fault.
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    return { error: `The live feed could not be read (${code ?? "unknown error"}).` };
  }
  return parseLiveFeed(source, now, freshMinutes);
}

/**
 * The one sentence a board says about itself, from the board's own numbers and no others: the party that leads or holds the most seats
 * (a party's won and leading together), of the seats declared, and the majority line.
 *
 *   "TMC leads or holds 98 of 180 declared seats; majority is 148."
 *
 * It states a count and never a prospect: no "will", no "set to", no "on course", no pronoun, and no claim about firsts or exclusivity
 * that the feed does not carry. Parties level for most are said to be level, and none is named the leader (the rule the landscape keeps
 * for a tie in an assembly). Where no party holds a seat the sentence says so and still gives the counts. Every number in it is one of the
 * board's own, or a party's won plus its leading; the property test in live-feed.test.ts holds that to generated boards.
 */
export function liveSentence(board: LiveBoard): string {
  const { declared, total, majority } = board.seats;
  const held = board.parties.map((p) => ({ label: p.party.label, n: p.won + p.leading })).filter((p) => p.n > 0);
  const top = held.reduce((m, p) => Math.max(m, p.n), 0);
  const level = held.filter((p) => p.n === top);
  if (top === 0) {
    return `No party leads or holds a seat; ${declared} of ${total} seats declared; majority is ${majority}.`;
  }
  if (level.length === 1) {
    return `${(level[0] as { label: string }).label} leads or holds ${top} of ${declared} declared seats; majority is ${majority}.`;
  }
  const names = level.map((p) => p.label);
  const said = `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `${said} are level on ${top} of ${declared} declared seats; majority is ${majority}.`;
}

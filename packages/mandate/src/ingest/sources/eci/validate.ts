/**
 * Pre-import validation of the staged 2024 Lok Sabha.
 *
 * Sixteen checks over the staged document plus the registry identities it will attach to. A `hard` failure
 * PREVENTS the import; a `warning` is imported but recorded on the run, so it is in the report rather than
 * in nobody's head. Nothing here is advisory-only: every warning names its rows.
 *
 * The thresholds are not guesses. Each arithmetic identity below was measured against the real reports
 * first, and the ones asserted as exact are exact on all 542 published constituencies:
 *   EVM + postal = total                     8,359 of 8,359 candidates
 *   sum(candidate totals) = total valid      542 of 542 constituencies (ECI excludes NOTA from "valid")
 *   share of valid, within 0.05pp            8,359 of 8,359
 * An identity that held for 541 of 542 would be a warning, not a check. These hold for all of them, so a
 * single failure is a real defect and the import stops.
 */

import type { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { all, get } from "../../../db/index.ts";
import { LS2024_ELECTION_ID, LS2024_EXPECTED_PCS, LS2024_REPORTED_PCS, type Staged } from "./stage.ts";

export type Severity = "hard" | "warning";

export type Check = {
  n: number;
  name: string;
  severity: Severity;
  violations: number;
  examples: string[];
  /** Set when the check could not run at all, which is never treated as a pass. */
  skipped: string | null;
};

export type Validation = {
  checks: Check[];
  hardFailures: number;
  warnings: number;
  metrics: Record<string, number | string>;
};

const EXAMPLES = 5;

/** Validate the staged dataset. `db` is read only, and only for the identities the import will attach to. */
export function validateStaged(s: Staged, db: DatabaseSync | null): Validation {
  const checks: Check[] = [];
  const add = (n: number, name: string, severity: Severity, bad: readonly string[], skipped: string | null = null): void => {
    checks.push({ n, name, severity, violations: bad.length, examples: bad.slice(0, EXAMPLES), skipped });
  };

  const importable = s.contests.filter((c) => c.resolution !== "UNRESOLVED");
  const contested = s.contests.filter((c) => !c.unopposed);
  const candidates = s.contests.flatMap((c) => c.candidates.map((x) => ({ c, x })));

  // 1. every constituency accounted for, and ECI's own 542 + Surat reconciled
  add(1, "543 constituencies are staged, and 542 + Surat reconcile", "hard", [
    ...(s.contests.length === LS2024_EXPECTED_PCS ? [] : [`${s.contests.length} contests staged, expected ${LS2024_EXPECTED_PCS}`]),
    ...(s.counts.report13Rows === LS2024_REPORTED_PCS ? [] : [`report 13 has ${s.counts.report13Rows} rows, expected ${LS2024_REPORTED_PCS}`]),
    ...(s.contests.filter((c) => c.unopposed).length === 1 ? [] : [`${s.contests.filter((c) => c.unopposed).length} unopposed contests, expected exactly 1 (Surat)`]),
  ]);

  // 2. no constituency twice
  const seenSeat = new Map<string, number>();
  for (const c of s.contests) seenSeat.set(`${c.jurisdictionId} pc${c.number}`, (seenSeat.get(`${c.jurisdictionId} pc${c.number}`) ?? 0) + 1);
  add(2, "no constituency appears twice", "hard", [...seenSeat].filter(([, n]) => n > 1).map(([k, n]) => `${k} × ${n}`));

  // 3. no candidate twice within a constituency
  const dupCand: string[] = [];
  for (const c of s.contests) {
    const ids = new Map<string, number>();
    for (const x of c.candidates) ids.set(x.eciCandidateId, (ids.get(x.eciCandidateId) ?? 0) + 1);
    for (const [id, n] of ids) if (n > 1) dupCand.push(`${id} × ${n}`);
  }
  add(3, "no candidate id repeats inside a constituency", "hard", dupCand);

  // 4. as many winners as constituencies
  const winners = candidates.filter(({ x }) => x.isWinner).length;
  add(4, "one winner per constituency, counted across the election", "hard",
    winners === s.contests.length ? [] : [`${winners} winners for ${s.contests.length} contests`]);

  // 5. exactly one winner in each
  add(5, "every constituency declares exactly one winner", "hard",
    s.contests.filter((c) => c.candidates.filter((x) => x.isWinner).length !== 1)
      .map((c) => `${c.jurisdictionId} pc${c.number} ${c.rawName}: ${c.candidates.filter((x) => x.isWinner).length}`));

  // 6. the candidate totals reconstruct ECI's own valid-vote total (which excludes NOTA)
  add(6, "sum of candidate votes equals the reported total valid votes", "hard",
    contested.filter((c) => c.totalValidVotes !== null)
      .map((c) => ({ c, sum: c.candidates.reduce((a, x) => a + (x.totalVotes ?? 0), 0) }))
      .filter(({ c, sum }) => sum !== c.totalValidVotes)
      .map(({ c, sum }) => `${c.jurisdictionId} pc${c.number}: candidates sum ${sum}, report says ${c.totalValidVotes}`));

  // 7. EVM + postal = total, per candidate
  add(7, "EVM votes plus postal votes equal the total, per candidate", "hard",
    candidates.filter(({ x }) => x.evmVotes !== null && x.postalVotes !== null && x.totalVotes !== null
        && x.evmVotes + x.postalVotes !== x.totalVotes)
      .map(({ c, x }) => `${c.jurisdictionId} pc${c.number} ${x.rawName}: ${x.evmVotes}+${x.postalVotes} != ${x.totalVotes}`));

  // 8. the published percentage matches the published votes
  add(8, "vote share agrees with the votes, within a rounding step", "hard",
    candidates.filter(({ c, x }) =>
        x.shareOfValid !== null && x.totalVotes !== null && c.totalValidVotes !== null && c.totalValidVotes > 0 &&
        Math.abs((x.totalVotes / c.totalValidVotes) * 100 - x.shareOfValid) > 0.05)
      .map(({ c, x }) => `${c.jurisdictionId} pc${c.number} ${x.rawName}: says ${x.shareOfValid}%, votes give ${((x.totalVotes ?? 0) / (c.totalValidVotes ?? 1) * 100).toFixed(3)}%`));

  // 9. the candidate count ECI published
  add(9, "8,360 candidates: 8,359 contested plus Surat's unopposed winner", "hard",
    candidates.length === 8360 ? [] : [`${candidates.length} candidates staged`]);

  // 10. provenance: every artefact carries a hash and a retrieval time
  add(10, "every source artefact carries url, hash, retrieval time and status", "hard",
    s.sources.filter((a) => a.sha256.length !== 64 || a.url === "" || a.retrievedAt === "" || a.httpStatus !== 200)
      .map((a) => `report ${a.reportNo}: hash=${a.sha256.slice(0, 8)} status=${a.httpStatus} url=${a.url.slice(0, 40)}`));

  // 11. the report 33 ↔ report 13 join is total
  add(11, "the report 33 to report 13 join resolves every constituency", "hard",
    s.counts.joinResolved === s.counts.joinAttempted && s.counts.joinResolved === LS2024_REPORTED_PCS
      ? [] : [`${s.counts.joinResolved} of ${s.counts.joinAttempted} joined, expected ${LS2024_REPORTED_PCS} of ${LS2024_REPORTED_PCS}`]);

  // 12. constituency identity is coherent: resolved means resolved
  add(12, "constituency identity is internally consistent", "hard", [
    ...s.contests.filter((c) => c.resolution === "ADOPTED" && c.placeVersionId === null)
      .map((c) => `${c.jurisdictionId} pc${c.number} is ADOPTED with no place_version`),
    ...s.contests.filter((c) => c.resolution !== "ADOPTED" && c.placeVersionId !== null)
      .map((c) => `${c.jurisdictionId} pc${c.number} is ${c.resolution} but carries place_version ${c.placeVersionId}`),
  ]);

  // 13. election identity: exactly one 2024 Lok Sabha event, and it is a parliamentary general election
  if (db === null) {
    add(13, "the 2024 Lok Sabha is exactly one election event", "hard", [], "no registry");
  } else {
    const rows = get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM election WHERE id = ?", s.electionId);
    const e = get<{ kind: string; house: string; year: number; level: string; j: string }>(
      db,
      "SELECT kind, house, year, level, jurisdiction_place_id AS j FROM election WHERE id = ?",
      s.electionId,
    );
    const others = get<{ n: number }>(
      db,
      "SELECT COUNT(*) AS n FROM election WHERE kind = 'general' AND house = 'pc' AND year = 2024",
    );
    add(13, "the 2024 Lok Sabha is exactly one election event", "hard", [
      ...(rows?.n === 1 ? [] : [`${rows?.n ?? 0} rows for ${s.electionId}`]),
      ...(e === undefined || (e.kind === "general" && e.house === "pc" && e.year === 2024 && e.level === "union" && e.j === "in")
        ? [] : [`${s.electionId} is ${e.kind}/${e.house}/${e.year}/${e.level}/${e.j}`]),
      ...(others?.n === 1 ? [] : [`${others?.n ?? 0} parliamentary general elections in 2024 — identity is not unique`]),
    ]);
  }

  // 14. fields that must be present
  add(14, "no candidate is missing a name, and no contested candidate is missing votes", "hard", [
    ...candidates.filter(({ x }) => x.rawName.trim() === "").map(({ c }) => `${c.jurisdictionId} pc${c.number}: a candidate has no name`),
    ...candidates.filter(({ c, x }) => !c.unopposed && x.totalVotes === null)
      .map(({ c, x }) => `${c.jurisdictionId} pc${c.number} ${x.rawName}: no vote total`),
  ]);
  // The unopposed winner has no votes, no age and no gender, because ECI publishes none. Asserted as a
  // warning so the absence is stated rather than discovered.
  add(15, "declared age and gender are present wherever ECI publishes them", "warning",
    candidates.filter(({ c, x }) => !c.unopposed && (x.age === null || x.sex === null))
      .map(({ c, x }) => `${c.jurisdictionId} pc${c.number} ${x.rawName}: age=${x.age} sex=${x.sex}`));

  // 16. the raw bytes still hash to what the manifest recorded
  const missing = s.sources.filter((a) => !existsSync(a.path));
  if (missing.length > 0) {
    add(16, "the raw store still holds the exact bytes that were parsed", "hard",
      missing.map((a) => `${a.path} is gone`));
  } else {
    add(16, "the raw store still holds the exact bytes that were parsed", "hard",
      s.sources.filter((a) => createHash("sha256").update(readFileSync(a.path)).digest("hex") !== a.sha256)
        .map((a) => `${a.path} no longer hashes to ${a.sha256.slice(0, 12)}`));
  }

  // 17. every constituency has a defensible geography — jurisdiction, house, epoch, version, provenance
  const geo = geographyAudit(s, db);
  add(17, "every constituency has defensible geography provenance", "hard",
    [...geo.unresolved, ...geo.ambiguous, ...geo.conflict], db === null ? "no registry" : null);

  const hardFailures = checks.filter((c) => c.severity === "hard" && (c.violations > 0 || c.skipped !== null)).length;
  const warnings = checks.filter((c) => c.severity === "warning" && c.violations > 0).length;

  return {
    checks,
    hardFailures,
    warnings,
    metrics: {
      contestsStaged: s.contests.length,
      contestsImportable: importable.length,
      contestsUnresolved: s.contests.length - importable.length,
      adopted: s.contests.filter((c) => c.resolution === "ADOPTED").length,
      toCreate: s.contests.filter((c) => c.resolution === "CREATE").length,
      candidates: candidates.length,
      winners,
      nameMismatches: s.contests.filter((c) => c.nameMismatch !== null).length,
      reservationConflicts: s.contests.filter((c) => c.reservationConflict !== null).length,
      withAge: candidates.filter(({ x }) => x.age !== null).length,
      sources: s.sources.length,
      election: s.electionId,
      geographyValid: geo.valid,
      geographyUnresolved: geo.unresolved.length,
      geographyAmbiguous: geo.ambiguous.length,
      geographyConflict: geo.conflict.length,
    },
  };
}

/**
 * Classify every staged constituency's geography as VALID, UNRESOLVED, AMBIGUOUS or CONFLICT.
 *
 * The four states are kept apart on purpose. "Unresolved" means no mapping was found; "ambiguous" means one
 * was found but the evidence behind it does not settle it; "conflict" means two claims cannot both be true.
 * Collapsing them into one count would let the second and third pass as the first — and every one of them is
 * a HARD failure, because a constituency with no defensible geography is a result filed under the wrong seat,
 * which is worse than a missing result.
 */
export function geographyAudit(
  s: Staged,
  db: DatabaseSync | null,
): { valid: number; unresolved: string[]; ambiguous: string[]; conflict: string[] } {
  const unresolved: string[] = [];
  const ambiguous: string[] = [];
  const conflict: string[] = [];

  // The epochs the registry can defend: one that names the order that drew it.
  const cited = new Map<string, { source: string | null; basis: string; jurisdiction: string | null }>();
  if (db !== null) {
    for (const e of all<{ id: string; source_id: string | null; effective_date_basis: string; jurisdiction_id: string | null }>(
      db,
      "SELECT id, source_id, effective_date_basis, jurisdiction_id FROM boundary_epoch",
    )) {
      cited.set(e.id, { source: e.source_id, basis: e.effective_date_basis, jurisdiction: e.jurisdiction_id });
    }
  }

  const slotSeen = new Map<string, string>();
  let valid = 0;
  for (const c of s.contests) {
    const at = `${c.jurisdictionId} pc${String(c.number).padStart(3, "0")} ${c.rawName}`;
    if (c.resolution === "UNRESOLVED") {
      unresolved.push(`${at}: ${c.resolutionNote}`);
      continue;
    }
    // CONFLICT: two constituencies cannot occupy one slot in one epoch.
    const slot = `${c.jurisdictionId}|${c.epochId}|${c.number}`;
    const prior = slotSeen.get(slot);
    if (prior !== undefined) {
      conflict.push(`${at}: shares (jurisdiction, epoch, number) with ${prior}`);
      continue;
    }
    slotSeen.set(slot, at);

    // The four things every constituency must have.
    const holes: string[] = [];
    if (c.jurisdictionId === "") holes.push("no jurisdiction");
    if (c.number < 1) holes.push("no house-seat number");
    if (c.epochId === "") holes.push("no boundary_epoch");
    if (c.resolution === "ADOPTED" && c.placeVersionId === null) holes.push("adopted with no place_version");
    if (holes.length > 0) {
      unresolved.push(`${at}: ${holes.join(", ")}`);
      continue;
    }

    // AMBIGUOUS: the epoch exists but nothing cites the order that drew it, so the mapping cannot be
    // defended even though it resolved. This is what would have fired had the 19 been forced through
    // against `delim-2008` before the delimitation orders were acquired.
    if (db !== null) {
      const e = cited.get(c.epochId);
      if (e === undefined) {
        unresolved.push(`${at}: epoch ${c.epochId} is not in boundary_epoch`);
        continue;
      }
      if (e.source === null) {
        ambiguous.push(`${at}: epoch ${c.epochId} cites no order, so its geography cannot be defended`);
        continue;
      }
      if (e.jurisdiction !== null && e.jurisdiction !== c.jurisdictionId) {
        conflict.push(`${at}: epoch ${c.epochId} belongs to ${e.jurisdiction}, not ${c.jurisdictionId}`);
        continue;
      }
    }
    if (c.reservationConflict !== null) {
      ambiguous.push(`${at}: ${c.reservationConflict}`);
      continue;
    }
    valid += 1;
  }
  return { valid, unresolved, ambiguous, conflict };
}

/** The one-line-per-check report, and whether the import may proceed. */
export function formatValidation(v: Validation): string {
  const lines = v.checks.map((c) => {
    const state = c.skipped !== null ? `SKIPPED (${c.skipped})` : c.violations === 0 ? "pass" : `${c.violations} ${c.severity === "hard" ? "FAIL" : "warn"}`;
    return `  ${String(c.n).padStart(2)}. ${c.name.padEnd(62)} ${state}` +
      (c.examples.length > 0 ? `\n      ${c.examples.join("\n      ")}` : "");
  });
  return lines.join("\n");
}

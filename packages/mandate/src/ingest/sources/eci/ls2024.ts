/**
 * The 2024 Lok Sabha pipeline, end to end:
 *
 *   DISCOVER -> DOWNLOAD -> HASH -> STORE RAW -> PARSE -> NORMALIZE -> STAGE -> VALIDATE -> IMPORT -> REPORT
 *
 * Each step is separately runnable and resumable, because each writes its result to disk before the next
 * reads it: artefacts and their provenance to `.data/cache/eci/`, the normalized dataset to
 * `.data/cache/eci/staging/ls-2024.json`. Re-running a completed step reads the cache instead of the
 * network; `--refresh` forces re-acquisition.
 *
 * IMPORT REQUIRES VALIDATION TO PASS. `--apply` runs the sixteen checks first and refuses on any hard
 * failure, so "the code ran" and "the data is right" cannot be confused.
 */

import type { DatabaseSync } from "node:sqlite";
import { LS2024_ARTEFACT_COUNT, LS2024_REPORTS, apiAccess, discoverLs2024, report, type ApiAccess } from "./discover.ts";
import { acquire, manifestPath, type RawArtefact } from "./acquire.ts";
import { LS2024_ELECTION_ID, readReports, stageLs2024, stagingPath, writeStaged, type Staged } from "./stage.ts";
import { formatValidation, validateStaged, type Validation } from "./validate.ts";
import { importStaged, type ImportReport } from "./import.ts";

export type PipelineResult = {
  access: ApiAccess;
  raw: RawArtefact[];
  staged: Staged;
  validation: Validation;
  imported: ImportReport | null;
  stagedPath: string;
  manifest: string;
};

export async function runLs2024(
  db: DatabaseSync,
  opts: { apply: boolean; refresh?: boolean; nowIso: string; log?: (s: string) => void },
): Promise<PipelineResult> {
  const log = opts.log ?? ((s: string) => console.log(s));

  log("DISCOVER");
  const access = await apiAccess();
  log(`  bundle  ${access.bundle}`);
  log(`  base    ${access.base}`);
  const category = await discoverLs2024(access);
  log(`  category ${category.categoryId}: ${category.name} — ${category.artefacts.length} of ${LS2024_ARTEFACT_COUNT} artefacts`);
  const wanted = Object.values(LS2024_REPORTS).map((n) => report(category, n));
  for (const a of wanted) log(`  report ${a.reportNo.padEnd(5)} ${a.title}`);

  log("DOWNLOAD + HASH + STORE RAW");
  const { raw, manifest } = await acquire(access, category, wanted, LS2024_ELECTION_ID, {
    ...(opts.refresh === true ? { refresh: true } : {}),
  });
  for (const m of manifest) {
    log(`  ${m.status.padEnd(7)} report ${m.reportNo.padEnd(5)} ${String(m.bytes).padStart(9)} B  ${m.sha256.slice(0, 16)}…  ${m.lastModified ?? "no Last-Modified"}`);
  }

  log("PARSE + NORMALIZE + STAGE");
  const staged = stageLs2024(db, raw, readReports(raw), { categoryName: category.name, now: () => opts.nowIso });
  const stagedPath = writeStaged(staged);
  log(`  report 33 rows      ${staged.counts.report33Rows}`);
  log(`  report 13 rows      ${staged.counts.report13Rows}`);
  log(`  report 4 rows       ${staged.counts.report4Rows}`);
  log(`  join                ${staged.counts.joinResolved}/${staged.counts.joinAttempted}`);
  log(`  contests staged     ${staged.counts.contests}`);
  log(`  candidates          ${staged.counts.candidates}`);
  log(`  staged to           ${stagedPath}`);

  log("VALIDATE");
  const validation = validateStaged(staged, db);
  log(formatValidation(validation));
  log(`  ${validation.hardFailures} hard failure(s), ${validation.warnings} warning(s)`);

  let imported: ImportReport | null = null;
  if (opts.apply) {
    if (validation.hardFailures > 0) {
      throw new Error(`refusing to import: ${validation.hardFailures} hard validation failure(s)`);
    }
    log("IMPORT");
    imported = importStaged(db, staged, { nowIso: opts.nowIso });
  } else {
    log("IMPORT  skipped (pass --apply)");
  }

  return { access, raw, staged, validation, imported, stagedPath: stagingPath(), manifest: manifestPath() };
}

/** The import report the phase is judged on. Every number is counted, none is assumed. */
export function formatReport(r: PipelineResult, db: DatabaseSync): string {
  const s = r.staged;
  const v = r.validation;
  const i = r.imported;
  const rows = (sql: string, ...p: (string | number)[]): number =>
    Number((db.prepare(sql).get(...p) as { n: number } | undefined)?.n ?? 0);

  const lines: string[] = [];
  const put = (k: string, val: unknown): void => {
    lines.push(`  ${k.padEnd(34)}${String(val)}`);
  };

  lines.push(`ECI IMPORT REPORT — ${s.eciCategoryName}`);
  lines.push("");
  put("Election", s.electionId);
  put("Expected constituencies", 543);
  put("Constituencies staged", s.contests.length);
  put("Imported constituencies", i === null ? "(not applied)" : i.contests);
  put("Unresolved", v.metrics["contestsUnresolved"]);
  put("Candidates (staged)", s.counts.candidates);
  put("Candidacies", i === null ? "(not applied)" : i.candidacies);
  put("Results", i === null ? "(not applied)" : i.results);
  put("Winners", i === null ? v.metrics["winners"] : i.winners);
  put("Rejected rows", v.checks.filter((c) => c.severity === "hard").reduce((n, c) => n + c.violations, 0));
  put("Warnings", v.warnings);
  put("Sources", s.sources.length);
  put("Source hashes", s.sources.filter((a) => a.sha256.length === 64).length);
  put("Report 33 rows", s.counts.report33Rows);
  put("Report 13 rows", s.counts.report13Rows);
  put("Report 4 rows", s.counts.report4Rows);
  put("Join success", `${s.counts.joinResolved}/${s.counts.joinAttempted}`);
  put("All validation checks", v.hardFailures === 0 ? "PASS" : `FAIL (${v.hardFailures} hard)`);
  lines.push("");

  lines.push("  Constituency identity");
  put("  adopted place_version", v.metrics["adopted"]);
  put("  created place_version", v.metrics["toCreate"]);
  put("  name spelling variants", v.metrics["nameMismatches"]);
  put("  reservation conflicts", v.metrics["reservationConflicts"]);
  lines.push("");

  if (i !== null) {
    lines.push("  Person resolution (never blocks a result)");
    for (const [k, n] of Object.entries(i.persons)) put(`  ${k}`, n);
    put("  parties matched", i.partiesMatched);
    put("  parties unresolved (party_raw)", i.partiesUnresolved);
    put("  claims written", i.claims);
    lines.push("");
    lines.push("  In the registry now");
    put("  contests on this election", rows("SELECT COUNT(*) AS n FROM contest WHERE election_id = ?", s.electionId));
    put("  results", rows("SELECT COUNT(*) AS n FROM result r JOIN contest c ON c.id = r.contest_id WHERE c.election_id = ?", s.electionId));
    put("  declared winners", rows("SELECT COUNT(*) AS n FROM result r JOIN contest c ON c.id = r.contest_id WHERE c.election_id = ? AND r.is_winner = 1", s.electionId));
    put("  candidacies with a declared age", rows("SELECT COUNT(*) AS n FROM candidacy ca JOIN contest c ON c.id = ca.contest_id WHERE c.election_id = ? AND ca.age_declared IS NOT NULL", s.electionId));
    put("  turnout rows", rows("SELECT COUNT(*) AS n FROM turnout t JOIN contest c ON c.id = t.contest_id WHERE c.election_id = ?", s.electionId));
    put("  sources carrying ECI's caveat", rows("SELECT COUNT(*) AS n FROM source WHERE publisher_note IS NOT NULL AND id LIKE 'eci:%'"));
    lines.push("");
  }

  const unresolved = s.contests.filter((c) => c.resolution === "UNRESOLVED");
  lines.push(`  Every unresolved constituency (${unresolved.length})`);
  for (const c of unresolved) lines.push(`    ${c.jurisdictionId} pc${String(c.number).padStart(3, "0")}  ${c.rawName}`);
  const quarantined = s.unresolved.filter((u) => u.what === "jurisdiction quarantined");
  if (quarantined.length > 0) {
    lines.push("");
    lines.push("  Why");
    for (const u of quarantined) lines.push(`    ${u.detail}`);
  }
  lines.push("");
  lines.push("  The 543rd constituency");
  lines.push(`    ${s.eciSuratNote}`);
  return lines.join("\n");
}

// The geometry import's report, as text and as markdown.
//
// Separate from `geometry.ts` because the decision and the presentation of the decision are separate
// concerns, and because the same report has to serve three readers: an operator watching a run, a
// committed document (`docs/geo/import.md`), and a test asserting on the numbers rather than the prose.

import type { InspectReport, JurisdictionReport } from "./geometry.ts";

/** What an operator sees. Every jurisdiction on one line, then what was staged and why. */
export function formatGeometryReport(r: InspectReport): string {
  const out: string[] = [];
  out.push(
    `${r.datasetId} (${r.house})  ${r.features} features → ${r.candidates} constituencies` +
      `  ${r.multipart} multipart  ${r.unusable} unusable`,
  );
  out.push("");
  out.push("  jurisdiction          epoch            seats  drawn  also  staged  decision              tiers");
  for (const j of [...r.jurisdictions].sort((a, b) => a.jurisdictionId.localeCompare(b.jurisdictionId))) {
    out.push(
      `  ${j.jurisdictionId.padEnd(4)} ${j.jurisdictionName.slice(0, 16).padEnd(16)} ` +
        `${(j.epochId ?? "—").padEnd(15)} ${String(j.seats).padStart(5)} ${String(j.linked).padStart(6)} ` +
        `${String(j.restated).padStart(5)} ${String(j.staged).padStart(7)}  ${j.decision.padEnd(22)}${tiers(j)}`,
    );
  }
  out.push("");
  out.push(
    `  ${r.totals.linked} of ${r.totals.seats} seats linked, ${r.totals.restated} more on epochs the order restated, ` +
      `${r.totals.staged} staged, ${r.totals.points.toLocaleString("en-IN")} source points`,
  );
  const undecided = r.jurisdictions.filter((j) => j.epochId === null);
  if (undecided.length > 0) {
    out.push("");
    out.push("  no epoch chosen:");
    for (const j of undecided) out.push(`    ${j.jurisdictionId} ${j.decision} — ${j.why}`);
  }
  if (r.findings.length > 0) {
    out.push("");
    out.push("  findings:");
    for (const f of r.findings) {
      out.push(`    ${String(f.n).padStart(5)}  ${f.kind}`);
      for (const e of f.examples.slice(0, 3)) out.push(`           ${e}`);
    }
  }
  const byReason = new Map<string, number>();
  for (const s of r.staged) byReason.set(s.reason, (byReason.get(s.reason) ?? 0) + 1);
  if (byReason.size > 0) {
    out.push("");
    out.push("  staged, by reason:");
    for (const [k, n] of [...byReason].sort((a, b) => b[1] - a[1])) out.push(`    ${String(n).padStart(5)}  ${k}`);
  }
  return out.join("\n");
}

function tiers(j: JurisdictionReport): string {
  const parts = Object.entries(j.tiers)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k.replace("number+", "no+").replace("name-unique", "name!").replace("name+number-tiebreak", "tie")} ${n}`);
  return parts.length === 0 ? "" : `  ${parts.join(", ")}`;
}

/** The committed record. One table per dataset, plus the staged list in full — it is the review queue. */
export function markdownGeometryReport(reports: readonly InspectReport[]): string {
  const out: string[] = [];
  out.push("# Electoral geometry import");
  out.push("");
  out.push(
    "**Generated — do not edit.** `npm run registry -- geography inspect --write`. " +
      "The sources and their classification are [sources.md](sources.md); what the product can draw as a " +
      "result is [coverage.md](coverage.md).",
  );
  out.push("");
  out.push(
    "A polygon is written against a `place_version_id`, and a version belongs to exactly one boundary " +
      "epoch — so choosing the version IS choosing the epoch, and there is no separate check to forget. " +
      "The columns below are that choice, per jurisdiction, with the evidence for it.",
  );
  for (const r of reports) {
    out.push("");
    out.push(`## \`${r.datasetId}\` — ${r.house === "ac" ? "assembly" : "parliamentary"} constituencies`);
    out.push("");
    out.push(
      `${r.features} features → ${r.candidates} constituencies (${r.multipart} multipart, ` +
        `${r.unusable} unusable and dropped). ${r.totals.linked} of ${r.totals.seats} seats linked; ` +
        `${r.totals.restated} further versions written because the registry's own \`derived_from\` links say ` +
        `a later order restated the same constituency; ${r.totals.staged} staged for review and not written.`,
    );
    out.push("");
    out.push("| Jurisdiction | Epoch | Seats | Drawn | Restated | Staged | How the epoch was chosen |");
    out.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const j of [...r.jurisdictions].sort((a, b) => a.jurisdictionName.localeCompare(b.jurisdictionName))) {
      out.push(
        `| ${j.jurisdictionName} | ${j.epochId === null ? "**none**" : `\`${j.epochId}\``} | ${j.seats} | ` +
          `${j.linked} | ${j.restated} | ${j.staged} | ${j.decision} — ${j.why} |`,
      );
    }
    if (r.findings.length > 0) {
      out.push("");
      out.push("### Validation findings");
      out.push("");
      out.push("| n | finding | examples |");
      out.push("| --- | --- | --- |");
      for (const f of r.findings) {
        out.push(`| ${f.n} | \`${f.kind}\` | ${f.examples.slice(0, 3).map((e) => e.replace(/\|/g, "\\|")).join("; ")} |`);
      }
    }
    const staged = [...r.staged].sort((a, b) => (a.jurisdictionId ?? "").localeCompare(b.jurisdictionId ?? "") || a.number - b.number);
    if (staged.length > 0) {
      out.push("");
      out.push(`### Staged — ${staged.length} constituencies the pipeline refused to attach`);
      out.push("");
      out.push("These have geometry and no link. Each one is a decision somebody has to make with a document.");
      out.push("");
      out.push("| Jurisdiction | Source no. | Source name | Reason | Detail |");
      out.push("| --- | --- | --- | --- | --- |");
      for (const s of staged) {
        out.push(
          `| ${s.jurisdictionId ?? "—"} | ${s.number} | ${s.name} | \`${s.reason}\` | ${s.detail.replace(/\|/g, "\\|")} |`,
        );
      }
    }
  }
  out.push("");
  return out.join("\n");
}

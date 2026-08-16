// The semantic layer's public surface (§13): the six measures, the formatters every page shares, and
// the §18 model-card check. It declares meaning — there is no query compiler here.

export type { Measure, Unit } from "./measures.ts";
export {
  ABSENT,
  MEASURES,
  enp,
  incumbency_retention,
  margin_pct,
  percent,
  percentagePoints,
  swing_pp,
  turnout_pct,
  vote_share_pct,
} from "./measures.ts";

// Indian digit grouping (7,10,930) and Indian money units (Rs 9.8 cr) already existed in cycle 2's
// repo/brief.ts, which /p/[person] imports directly. They are re-exported, not rewritten: two copies
// of `rupees` is the exact failure this file exists to prevent, and moving them would mean editing a
// cycle-2 file this task does not own.
export { inr, rupees } from "../repo/brief.ts";

import { readdirSync, readFileSync } from "node:fs";
import { MEASURES } from "./measures.ts";

/**
 * §18: a measure without a model card must break the build. Enforced as a check rather than a
 * package.json script — both directions, so a card for a deleted measure is caught too.
 * Returns the problems; empty means clean.
 *
 * `dir` is resolved against the process cwd, which is the repo root for `npm test` and `next build`.
 * ponytail: cwd-relative — take an absolute path when something outside those two calls it.
 */
export function modelCardProblems(dir = "docs/methodology"): string[] {
  const problems: string[] = [];
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "index.md");
  } catch {
    return [`${dir} does not exist: no measure has a model card`];
  }
  for (const m of MEASURES) {
    const path = `${dir}/${m.id}.md`;
    let body = "";
    try {
      body = readFileSync(path, "utf8");
    } catch {
      problems.push(`${m.id}: no model card at ${path}`);
      continue;
    }
    // A card that says nothing is the same failure as no card. The one required heading is the one
    // §18 exists for: what would make the number wrong.
    if (!/what would make (this|the) number wrong/i.test(body)) {
      problems.push(`${m.id}: model card has no "What would make this number wrong" section`);
    }
    if (m.modelCard !== `docs/methodology/${m.id}.md`) {
      problems.push(`${m.id}: modelCard says ${m.modelCard}, expected docs/methodology/${m.id}.md`);
    }
  }
  const ids = new Set(MEASURES.map((m) => m.id));
  for (const f of files) {
    if (!ids.has(f.replace(/\.md$/, ""))) problems.push(`${f}: model card for no exported measure`);
  }
  return problems;
}

// Who an id stands for once `mandate resolve` has merged people.
//
// Every person id an importer derives comes from a source row, so a later run regenerates the id of a person the
// resolver has absorbed. Writing that id back resurrects the person: its row, its identifier and its candidacies
// move off the survivor while person_merge still says the merge holds, and a second resolve then merges the same
// pair into a second ledger row that cannot be reverted. An importer routes the ids it derives through here and
// writes onto the person this returns.
//
// Not exported through db/index.ts, which the Next bundle imports. The app's one write, the merge decision, goes
// through repo/review.ts and does not use this.

import type { DatabaseSync } from "node:sqlite";
import { all } from "../db/index.ts";

/**
 * The un-reverted merges, read once. `size` is how many ids they absorbed; `livePerson(id)` is `id` itself unless
 * a merge absorbed it, and then the person that holds it now.
 *
 * What stays the raw id is the caller's to know: a candidacy's id and a claim's content key are cited from other
 * rows and the merge moved only the row's person, so the upsert lands on the row the merge already moved only if
 * the id is not routed.
 */
export function mergeRoutes(db: DatabaseSync): { size: number; livePerson: (id: string) => string } {
  const survivorOf = new Map<string, string>();
  for (const r of all<{ merged_id: string; surviving_id: string }>(
    db,
    "SELECT merged_id, surviving_id FROM person_merge WHERE reverted_at IS NULL",
  )) {
    survivorOf.set(r.merged_id, r.surviving_id);
  }
  /** Chains: a survivor can itself be absorbed on a later pass. */
  const livePerson = (id: string): string => {
    let cur = id;
    for (let hops = 0; hops < 64; hops += 1) {
      const next = survivorOf.get(cur);
      if (next === undefined || next === cur) break;
      cur = next;
    }
    return cur;
  };
  return { size: survivorOf.size, livePerson };
}

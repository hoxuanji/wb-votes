// What a test that reads the dev registry asks of it beyond its being there. Imported by tests and by nothing that
// ships.
//
// A page, the place endpoint and the place resolver tell the seats of a house that votes under one delimitation from
// the seats of another through the `voting_epoch` view (migration 017). A registry built before that migration reads
// fine for everything else, so a test that resolves a place skips on it, naming the command that fixes it, instead of
// failing on an outage that is a state of the machine and not a defect in the code.

import { openRead } from "../db/index.ts";

/** Why a test that resolves a place cannot run against the registry the app would read, or false when it can. */
export function skipUnlessVotingEpoch(): string | false {
  try {
    // No path: the same registry a page reads, which is MANDATE_DB_PATH or .data/registry.db.
    const d = openRead();
    try {
      d.prepare("SELECT 1 FROM voting_epoch LIMIT 1").get();
      return false;
    } finally {
      d.close();
    }
  } catch {
    return "no registry, or one built before migration 017 — run npm run registry:migrate";
  }
}

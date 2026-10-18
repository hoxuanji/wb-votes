import type { DatabaseSync } from "node:sqlite";
import { epochById } from "../core/epochs.ts";
import { all } from "./index.ts";

/**
 * Make sure the registry holds a `boundary_epoch` row for each of these epochs, from the table in
 * core/epochs.ts.
 *
 * Every importer calls this with the epochs it is about to point rows at, so none of them depends on another
 * command having registered an epoch first. The 2024 Lok Sabha import used to fail unless
 * `geography delimitation` had run: `currentEpochFor` read rows only that command wrote.
 *
 * An existing row is left alone. Whoever created it may have attached what this cannot: `source_id` is not
 * written here at all, because the `delim:*` sources are registered only after their documents' bytes are
 * hashed (applyDelimitation), and a foreign key to a source nobody has verified would be a claim. `effective_to`
 * is never written either: an epoch ends where its successor begins, per jurisdiction (core/epochs.ts).
 */
export function ensureEpochs(db: DatabaseSync, epochIds: Iterable<string>): void {
  // Every id is resolved before the first write, so an epoch the table does not know writes nothing.
  const epochs = [...new Set(epochIds)].map(epochById);
  const insert = db.prepare(
    `INSERT INTO boundary_epoch (id, name, effective_from, jurisdiction_id, order_date, order_reference,
                                 effective_date_basis)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO NOTHING`,
  );
  for (const e of epochs) {
    insert.run(e.id, e.name, e.effectiveFrom, e.jurisdictionId, e.orderDate, e.orderReference, e.effectiveDateBasis);
  }
}

/**
 * The epoch each (jurisdiction, house) votes under, keyed `"<jurisdiction> <ac|pc>"`: the epoch its newest
 * full-house election's seats sit in. Read from the `voting_epoch` view (migration 017), which holds the rule.
 *
 * Not `inForce`. That asks what the law was on a date; this asks what the results say, and the two differ
 * whenever an order has taken effect that no election has yet been held under.
 */
export function votingEpochs(db: DatabaseSync): Map<string, string> {
  const rows = all<{ jurisdiction_id: string; house: string; epoch_id: string }>(
    db,
    "SELECT jurisdiction_id, house, epoch_id FROM voting_epoch",
  );
  return new Map(rows.map((r) => [`${r.jurisdiction_id} ${r.house}`, r.epoch_id]));
}

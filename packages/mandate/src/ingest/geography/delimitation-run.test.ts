// The delimitation import's run. Applying it needs the eight ECI documents it re-hashes (a fetch, then the files in
// .data/cache/eci/delimitation), so this skips where they are not on disk and the run is checked on a machine that has them.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { all, open } from "../../db/index.ts";
import { ensureEpochs } from "../../db/epochs.ts";
import { migrate } from "../../db/migrate.ts";
import { DELIMITATION_DIR, DELIM_DOCS, applyDelimitation } from "./delimitation.ts";

const NOW = "2026-08-12T00:00:00.000Z";
const haveDocuments = DELIM_DOCS.every((d) => existsSync(join(DELIMITATION_DIR, d.file)));
const skip = haveDocuments ? false : "the delimitation documents are not in .data/cache/eci/delimitation";

test("applying the delimitation orders is one finished run, and a dry run is none", { skip }, () => {
  const d = open(":memory:");
  migrate(d, NOW);
  d.exec("INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India'), ('as','state','Assam'), ('jk','state','Jammu & Kashmir')");
  ensureEpochs(d, ["delim-2008"]);
  const runs = () => all<Record<string, unknown>>(d, "SELECT pipeline, status, rows_in, finished_at FROM ingest_run").map((r) => ({ ...r }));

  applyDelimitation(d, { nowIso: NOW, dryRun: true });
  assert.deepEqual(runs(), []);

  const report = applyDelimitation(d, { nowIso: NOW });
  assert.equal(report.sources, DELIM_DOCS.length);
  assert.deepEqual(runs(), [{ pipeline: "delimitation", status: "ok", rows_in: DELIM_DOCS.length, finished_at: NOW }]);
  d.close();
});

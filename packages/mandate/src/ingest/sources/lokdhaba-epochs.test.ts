// The Lokdhaba importer's use of the epoch table: which epochs it registers, and which ids it mints in them.
//
// The importer had no test of its own. This one reads a four-row file through the real migrations, because the
// ids it mints are the numbers every contest, geometry row and crosswalk points at: Karnataka's seat 1 under
// DPACO 2008 must be 1,224,001 on every rebuild, and the reconstruction must name the same delimitations the
// importer filed the rows under.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { EPOCHS } from "../../core/epochs.ts";
import { all, open } from "../../db/index.ts";
import { migrate } from "../../db/migrate.ts";
import { reconstruct } from "../geography/reconstruct.ts";
import { REQUIRED_COLUMNS, importLokdhaba } from "./lokdhaba.ts";

const NOW = "2026-08-12T00:00:00.000Z";
const HEADER = [...REQUIRED_COLUMNS, "Assembly_No", "Poll_No"];

function line(year: number, seat: number, name: string, delim: string, assembly: number, n: number): string {
  const f: Record<string, string> = {
    State_Name: "Karnataka", Year: String(year), Constituency_No: String(seat), Constituency_Name: name,
    Constituency_Type: "GEN", DelimID: delim, Position: "1", Candidate: `CANDIDATE ${n}`, Sex: "M", Party: "INC",
    Party_ID: "1", Votes: "900", Valid_Votes: "2000", Electors: "4000", Turnout_Percentage: "50",
    Vote_Share_Percentage: "45", Margin: "100", pid: `P${n}`, Election_Type: "State Assembly Election (AE)",
    Assembly_No: String(assembly), Poll_No: "0",
  };
  return HEADER.map((h) => f[h] ?? "").join(",");
}

const CSV = [
  HEADER.join(","),
  line(1978, 1, "AURAD", "3", 7, 1),
  line(2013, 1, "NIPPANI", "4", 14, 2),
  line(2018, 2, "CHIKKODI-SADALGA", "4", 15, 3),
  line(1985, 3, "NOWHERE", "9", 8, 4), // a DelimID the table does not know
].join("\n");

function imported() {
  const d = open(":memory:");
  migrate(d, NOW);
  const bytes = gzipSync(Buffer.from(CSV, "utf8"));
  const report = importLokdhaba(d, {
    jurisdictionId: "ka",
    type: "AE",
    file: { url: "test:ka-ae", bytes, sha256: createHash("sha256").update(bytes).digest("hex"), retrievedAt: NOW, cached: false },
    nowIso: NOW,
  });
  return { d, report, bytes };
}

test("the importer registers the epochs it filed rows under, from the table, and no others", () => {
  const { d, report } = imported();
  const rows = all<{ id: string; name: string; effective_from: string; effective_to: string | null }>(
    d,
    "SELECT id, name, effective_from, effective_to FROM boundary_epoch ORDER BY effective_from",
  );
  assert.deepEqual(
    rows.map((r) => ({ ...r })),
    ["delim-1976", "delim-2008"].map((id) => {
      const e = EPOCHS.find((x) => x.id === id)!;
      return { id, name: e.name, effective_from: e.effectiveFrom, effective_to: null };
    }),
  );
  assert.equal(report.epochs, 2);
  // An unknown DelimID is skipped and said so, in words that name where to add it.
  const why = report.skipped.map((s) => s.reason).join("\n");
  assert.match(why, /unknown TCPD DelimID 9 — add it to EPOCHS in core\/epochs\.ts/);
  assert.equal(all(d, "SELECT 1 FROM place_version WHERE canonical_name = 'NOWHERE'").length, 0);
  d.close();
});

test("a seat's id is minted in its epoch's block, and never moves: Karnataka seat 1 is 1,223,001 and 1,224,001", () => {
  const { d } = imported();
  const ids = all<{ id: number; epoch_id: string; number: number }>(
    d,
    "SELECT id, epoch_id, number FROM place_version WHERE kind = 'ac' ORDER BY id",
  );
  // 1,000,000 + state 11 * 20,000 + block * 1,000 + seat. Literal, so a table that moved a block fails here.
  assert.deepEqual(ids.map((r) => ({ ...r })), [
    { id: 1223001, epoch_id: "delim-1976", number: 1 },
    { id: 1224001, epoch_id: "delim-2008", number: 1 },
    { id: 1224002, epoch_id: "delim-2008", number: 2 },
  ]);
  d.close();
});

test("the reconstruction names the delimitations the importer filed the rows under", () => {
  const { d, bytes } = imported();
  const path = join(mkdtempSync(join(tmpdir(), "geo-")), "Karnataka_AE.csv.gz");
  writeFileSync(path, bytes);
  const { seats, report } = reconstruct([{ sourceId: "lokdhaba:ka:AE:x", path, status: "MATCH", sha256: "x" }]);
  assert.equal(report.unknownDelim, 1, "the same unknown DelimID is refused here too");
  const filed = all<{ epoch_id: string; number: number }>(d, "SELECT epoch_id, number FROM place_version WHERE kind = 'ac'");
  assert.deepEqual(
    seats.map((s) => `${s.epochId} ${s.number}`).sort(),
    filed.map((r) => `${r.epoch_id} ${r.number}`).sort(),
  );
  d.close();
});

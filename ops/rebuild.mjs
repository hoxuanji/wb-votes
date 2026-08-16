// Rebuild the whole registry from cached, hashed sources — and prove it comes out the same.
//
//   node ops/rebuild.mjs [db-path]        # default .data/rebuild.db
//
// WHY THIS EXISTS. Phase 3's closure has to answer "is the registry reproducible", and until now the answer
// was a story: four phases of `mandate import`, `eci ls-2024` and `geography import` run by hand, in an order
// nobody had written down. A foundation nobody can rebuild is not frozen, it is stuck.
//
// WHY IT WRITES TO ANOTHER FILE. `ingest --fresh` deletes .data/registry.db, which holds 570,000 results this
// machine took hours to import. A verification that destroys the thing it verifies gets run once and never
// again. This builds a second registry beside the first so the two can be compared — `ops/rebuild-compare.mjs`
// is what reads the result.
//
// WHY NODE AND NOT SHELL. The first version parsed `mandate import --state=list`'s human-readable output to
// get each state's id, which is a text format changing under a script that depends on it. The mapping from a
// jurisdiction to its Lokdhaba filename already exists, exported, and is the one the importer itself uses —
// so this asks that rather than guessing from columns.
//
// WHAT IT ASSUMES: the source caches are present — .data/cache/lokdhaba (62 files), .data/cache/eci and
// .data/cache/geo. Every one is content-addressed: the Lokdhaba manifest records a sha256 per file,
// `geography fetch` refuses bytes that do not match data/geo/sources.json, and the ECI pipeline hashes every
// artefact before parsing it. So this reads bytes rather than the network, and the same bytes give the same
// registry.

import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { JURISDICTIONS } from "../packages/mandate/src/ingest/india.ts";
import { lokdhabaState } from "../packages/mandate/src/ingest/sources/lokdhaba.ts";

const db = process.argv[2] ?? ".data/rebuild.db";
const env = { ...process.env, MANDATE_DB_PATH: db };

/** Every step prints its own name, so a failure names the step rather than a stack. */
function mandate(args, { quiet = true } = {}) {
  process.stdout.write(`  mandate ${args.join(" ")}\n`);
  try {
    const out = execFileSync(process.execPath, ["packages/mandate/bin/mandate.ts", ...args], {
      env,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (!quiet) process.stdout.write(out);
    return out;
  } catch (e) {
    process.stderr.write(`\nFAILED: mandate ${args.join(" ")}\n${e.stdout ?? ""}${e.stderr ?? ""}\n`);
    process.exit(1);
  }
}

console.log(`rebuilding into ${db}`);
for (const suffix of ["", "-wal", "-shm"]) rmSync(`${db}${suffix}`, { force: true });

console.log("== migrate");
mandate(["migrate"], { quiet: false });

console.log("== seed");
mandate(["ingest"]);

console.log("== Lokdhaba: every cached state file, assembly and general");
let imported = 0;
let absent = 0;
for (const j of JURISDICTIONS) {
  const base = lokdhabaState(j.id);
  if (base === null) continue;
  for (const type of ["AE", "GE"]) {
    const file = `.data/cache/lokdhaba/${base}_${type}.csv.gz`;
    if (!existsSync(file)) {
      absent += 1;
      continue;
    }
    mandate(["import", `--state=${j.id}`, `--type=${type}`, `--file=${file}`]);
    imported += 1;
  }
}
console.log(`  ${imported} files imported, ${absent} not cached`);

// IDENTITY BEFORE THE ECI, and the order is not cosmetic — the first run of this script had it the other way
// and the 2024 Lok Sabha import refused, with one hard validation failure and nineteen quarantined seats:
//
//   as pc001 Kokrajhar: ECI calls it "Kokrajhar", the registry calls PC 5 that and calls PC 1 "KARIMGANJ"
//   — as's delim-2008 numbering disagrees with the source
//
// Which is the validator working. Assam's 2023 order renumbered its parliamentary constituencies, so until
// `geography delimitation` has registered `delim-2023-as` there is no epoch for those fourteen seats to
// belong to and the importer will not guess. Same for Jammu & Kashmir's five under `delim-2022-jk`.
// docs/model/delimitation-assam-jk.md is the evidence; this is the step that puts it in the registry.
console.log("== election and geography identity");
mandate(["elections", "backfill", "--apply"]);
mandate(["geography", "backfill", "--apply"]);
mandate(["geography", "delimitation", "--apply"]);

console.log("== ECI 2024 Lok Sabha");
mandate(["eci", "ls-2024", "--apply"]);

console.log("== electoral geometry");
mandate(["geography", "fetch"], { quiet: false });
mandate(["geography", "import", "--dataset=datameet-ac", "--apply", "--replace"]);
mandate(["geography", "import", "--dataset=datameet-pc", "--apply", "--replace"]);

console.log("== entity resolution");
mandate(["resolve"]);

console.log(`done: ${db}`);

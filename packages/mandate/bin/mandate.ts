#!/usr/bin/env node
// The registry CLI. Hand-rolled argv parsing on purpose: seven subcommands and four flags do not
// need a dependency. Every path prints and exits — one try/catch around the switch turns any throw
// into `mandate: <message>` and exit 1, so an operator never sees a stack trace.
//
//   mandate migrate                      apply pending ops/migrations/*.sql
//   mandate ingest [--fresh]             load data/seed/*.json into the registry
//   mandate resolve [--dry-run]          entity resolution (resolve/ owns it)
//   mandate audit [--n=200] [--seed=1]   sample merges for the published error rate
//   mandate unmerge --id=<n>             reverse one person_merge, restoring the absorbed person
//   mandate query person <term>          search the alias blocking index
//   mandate coverage                     row counts + citation coverage
//   mandate export [--diff] [--out=<dir>]  rebuild data/seed/*.json FROM the registry and report
//                                        what does not come back (a measurement, never a migration)

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { blockingKeys } from "../src/core/indic/index.ts";
import { DEV_DB_PATH, all, get, migrate, open, openRead } from "../src/db/index.ts";
import { countUncited, runIngest } from "../src/ingest/index.ts";
import {
  THRESHOLD_PCT,
  diffAgainstSeed,
  formatReport,
  reconstruct,
} from "../src/ingest/export.ts";
import { auditSample, resolvePersons, unmerge } from "../src/ingest/resolve/index.ts";

const argv = process.argv.slice(2);
const cmd = argv[0] ?? "";
const args = argv.slice(1).filter((a) => !a.startsWith("--"));
const has = (name: string): boolean => argv.includes(`--${name}`);
const num = (name: string, fallback: number): number => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  const n = hit === undefined ? NaN : Number(hit.slice(name.length + 3));
  return Number.isFinite(n) ? n : fallback;
};
/** A count or a row id, validated at the trust boundary: `--n=` is Number("") === 0, and a negative
 *  n made auditSample publish an error rate over a set that was not the set it reported. */
const posInt = (name: string, fallback: number): number => {
  const n = num(name, fallback);
  if (!Number.isInteger(n) || n < 1) fail(`--${name} must be a positive integer`);
  return n;
};

const USAGE = `mandate <command>

  migrate                      apply pending migrations
  ingest [--fresh]             ingest data/seed/*.json (--fresh: drop the db first)
  resolve [--dry-run]          resolve person duplicates
  audit [--n=200] [--seed=1]   audit a reproducible sample of merges
  unmerge --id=<n>             reverse person_merge <n> and restore the absorbed person
  query person <term>          find people by name / blocking key
  coverage                     per-table row counts and citation coverage
  export [--diff] [--out=<dir>]  rebuild the seed from the registry and report what differs`;

/** Two columns, right-aligned values. Every subcommand prints through this so output is one shape. */
function table(rows: readonly [string, unknown][]): void {
  const w = Math.max(...rows.map(([k]) => k.length));
  for (const [k, v] of rows) console.log(`  ${k.padEnd(w)}  ${String(v)}`);
}

function fail(message: string): never {
  console.error(`mandate: ${message}`);
  process.exit(1);
}

const nowIso = new Date().toISOString();

try {
  switch (cmd) {
    case "migrate": {
      const db = open();
      const applied = migrate(db, nowIso);
      console.log(applied.length === 0 ? "no pending migrations" : `applied ${applied.length}:`);
      for (const f of applied) console.log(`  ${f}`);
      db.close();
      break;
    }

    case "ingest": {
      if (has("fresh")) {
        for (const suffix of ["", "-wal", "-shm"]) rmSync(`${DEV_DB_PATH}${suffix}`, { force: true });
        console.log(`dropped ${DEV_DB_PATH}`);
      }
      const db = open();
      migrate(db, nowIso);
      const r = await runIngest(db, { nowIso });
      table([
        ["sources", r.sources],
        ["places", r.places],
        ["persons", r.persons],
        ["parties", r.parties],
        ["elections", r.elections],
        ["contests", r.contests],
        ["candidacies", r.candidacies],
        ["results", r.results],
        ["claims", r.claims],
        ["citations", r.citations],
        ["uncited values", r.uncitedValues],
        ["duration ms", r.durationMs],
      ]);
      if (r.unmatchedPartyStrings.length > 0) {
        console.log(`\nunmatched party strings (${r.unmatchedPartyStrings.length}), kept as party_raw:`);
        for (const s of r.unmatchedPartyStrings) console.log(`  ${s}`);
      }
      if (r.anomalies.length > 0) {
        console.log(`\nanomalies (${r.anomalies.length}):`);
        for (const a of r.anomalies.slice(0, 20)) console.log(`  [${a.kind}] ${a.ref} — ${a.detail}`);
        if (r.anomalies.length > 20) console.log(`  … ${r.anomalies.length - 20} more in ingest_run`);
      }
      db.close();
      // P2 is the one property the product cannot ship without: make CI notice.
      if (r.uncitedValues > 0) fail(`${r.uncitedValues} uncited values — P2 violation`);
      break;
    }

    case "resolve": {
      const db = open();
      const dry = has("dry-run");
      const out = resolvePersons(db, { nowIso, dryRun: dry });
      console.log(dry ? "resolve --dry-run (rolled back):" : "resolve:");
      table(Object.entries(out));
      db.close();
      break;
    }

    case "audit": {
      const n = posInt("n", 200);
      const seed = num("seed", 1);
      const db = open();
      const out = auditSample(db, n, seed);
      console.log(`audit n=${n} seed=${seed}:`);
      console.log(JSON.stringify(out, null, 2));
      db.close();
      // ADR 0001: registry:audit fails the run when an invariant returns rows. A red invariant
      // reported under a green exit code is not a gate.
      if (out.invariantsFailed > 0) fail(`${out.invariantsFailed} invariant(s) violated`);
      break;
    }

    case "unmerge": {
      // §12 stage 4's reversibility, reachable: the ingest's merged_person_rerouted anomaly tells the
      // operator to revert a wrong merge, and this is the command it names.
      const id = posInt("id", 0);
      const db = open();
      unmerge(db, id, nowIso);
      console.log(`unmerged person_merge ${id}`);
      db.close();
      break;
    }

    case "query": {
      if (args[0] !== "person" || args[1] === undefined) fail("usage: mandate query person <term>");
      const term = args.slice(1).join(" ");
      // Every key the ingest indexed this name under, unioned — blockingKeys() returns 1-3 and
      // matching only the first would miss exactly the surname-first / given-name-first pairs.
      const keys = blockingKeys(term);
      const db = open();
      console.log(`blocking keys: ${keys.join(" ")}`);
      const people = all<{ id: string; canonical_name: string; matched: string }>(
        db,
        `SELECT DISTINCT p.id AS id, p.canonical_name AS canonical_name, a.name AS matched
           FROM person_alias a JOIN person p ON p.id = a.person_id
          WHERE a.norm_key IN (${keys.map(() => "?").join(",")}) OR a.name LIKE ? COLLATE NOCASE
          -- blocking optimises recall, so a bucket holds every plausible pair: "bnrj" is every
          -- Banerjee. Name matches first so the person asked for is not on page two.
          ORDER BY CASE WHEN a.name LIKE ? COLLATE NOCASE THEN 0 ELSE 1 END, p.canonical_name
          LIMIT 25`,
        ...keys,
        `%${term}%`,
        `%${term}%`,
      );
      if (people.length === 0) {
        console.log(`no person matches "${term}" (blocking keys ${keys.join(" ")})`);
        db.close();
        break;
      }
      for (const p of people) {
        const cites = get<{ n: number }>(
          db,
          `SELECT COUNT(*) AS n FROM citation ci JOIN claim c ON c.id = ci.claim_id
            WHERE c.subject_ref = 'person:' || ?
               OR c.subject_ref IN (SELECT 'candidacy:' || id FROM candidacy WHERE person_id = ?)`,
          p.id,
          p.id,
        );
        console.log(`\n${p.canonical_name}  (${p.id})  citations=${cites?.n ?? 0}`);
        if (p.matched !== p.canonical_name) console.log(`  matched alias: ${p.matched}`);
        const cands = all<{ contest_id: string; status: string; party: string | null; raw: string | null }>(
          db,
          `SELECT c.contest_id AS contest_id, c.status AS status, pt.short_name AS party, c.party_raw AS raw
             FROM candidacy c
             LEFT JOIN party_version pv ON pv.id = c.party_version_id
             LEFT JOIN party pt ON pt.id = pv.party_id
            WHERE c.person_id = ? ORDER BY c.contest_id`,
          p.id,
        );
        for (const c of cands) {
          console.log(`  ${c.contest_id}  ${c.status}  ${c.raw ?? c.party ?? "—"}`);
        }
      }
      db.close();
      break;
    }

    case "export": {
      // A MEASUREMENT, not a migration: nothing in the repo reads the rebuilt modules. The number
      // it prints is how much of data/seed/*.json the registry can give back, which is the gate on
      // ever deleting the seed and the old app (§29 Phase C/E). See ADR 0004.
      const db = openRead();
      const out = argv.find((a) => a.startsWith("--out="))?.slice("--out=".length);
      if (out !== undefined) {
        const rebuilt = reconstruct(db);
        mkdirSync(out, { recursive: true });
        for (const [file, rows] of Object.entries(rebuilt)) {
          writeFileSync(`${out.replace(/\/$/, "")}/${file}`, JSON.stringify(rows));
          console.log(`  ${file}  ${rows.length} rows`);
        }
        // These files are evidence, not an input: a value entity resolution cannot attribute to one
        // row is written with an " ambiguous:<guess>" prefix rather than the guess.
        console.log(`wrote ${out} — a measurement artefact; nothing in the repo reads it`);
      }
      if (out !== undefined && !has("diff")) {
        db.close();
        break;
      }
      const report = diffAgainstSeed(db);
      db.close();
      console.log(formatReport(report));
      if (report.pct < THRESHOLD_PCT) {
        fail(
          `reconstructability ${report.pct.toFixed(1)}% is below the ${THRESHOLD_PCT}% floor — ` +
            `the registry gives back less of data/seed/ than it did. The floor is a ratchet: raise ` +
            `it in the commit that raises the number, never lower it to make this pass.`,
        );
      }
      break;
    }

    case "coverage": {      const db = open();
      const tables = all<{ name: string }>(
        db,
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      );
      table(
        tables.map((t): [string, unknown] => [
          t.name,
          get<{ n: number }>(db, `SELECT COUNT(*) AS n FROM "${t.name}"`)?.n ?? 0,
        ]),
      );
      const pct = (part: number, whole: number): string =>
        whole === 0 ? "n/a" : `${((100 * part) / whole).toFixed(1)}%`;
      const claims = get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM claim")?.n ?? 0;
      const citedClaims =
        get<{ n: number }>(
          db,
          "SELECT COUNT(*) AS n FROM claim c WHERE EXISTS (SELECT 1 FROM citation ci WHERE ci.claim_id = c.id)",
        )?.n ?? 0;
      const results = get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM result")?.n ?? 0;
      const sourced =
        get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM result WHERE source_id IS NOT NULL")?.n ?? 0;
      const fields = get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM affidavit_field")?.n ?? 0;
      const sources = get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM source")?.n ?? 0;
      // The archive backlog, visible rather than encoded in a doc_hash prefix: these are documents
      // we cite by locator and have never held the bytes of.
      const locatorOnly =
        get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM source WHERE hash_kind = 'url_only'")?.n ?? 0;
      console.log("\ncitation coverage");
      table([
        ["claims cited", `${citedClaims}/${claims}  ${pct(citedClaims, claims)}`],
        ["results sourced", `${sourced}/${results}  ${pct(sourced, results)}`],
        ["affidavit fields", fields],
        ["locator-only sources", `${locatorOnly}/${sources}  ${pct(locatorOnly, sources)} never fetched`],
        ["uncited values", countUncited(db)],
      ]);
      db.close();
      break;
    }

    default:
      console.log(USAGE);
      if (cmd !== "" && cmd !== "help" && cmd !== "--help") process.exit(1);
  }
} catch (cause) {
  fail((cause as Error).message);
}

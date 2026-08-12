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
//   mandate export                       rebuild data/seed/*.json FROM the registry and report
//                                        what does not come back (a measurement, never a migration)

import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { blockingKeys } from "../src/core/indic/index.ts";
import { DEV_DB_PATH, all, get, open, openRead } from "../src/db/index.ts";
import { migrate } from "../src/db/migrate.ts";
import { JURISDICTIONS } from "../src/ingest/india.ts";
import { downloadUrl, fetchState, importLokdhaba, localFile, lokdhabaState } from "../src/ingest/sources/lokdhaba.ts";
import { countUncited, runIngest } from "../src/ingest/index.ts";
import { THRESHOLD_PCT, diffAgainstSeed, formatReport } from "../src/ingest/export.ts";
import { auditSample, resolvePersons, unmerge } from "../src/ingest/resolve/index.ts";
import { backfillGeography } from "../src/ingest/geography/backfill.ts";
import { applyDelimitation } from "../src/ingest/geography/delimitation.ts";
import { validateGeography } from "../src/ingest/geography/validate.ts";
import { COVERAGE_PREFACE, formatCoverage, geometryCoverage } from "../src/ingest/geography/geometry-coverage.ts";
import type { InspectReport } from "../src/ingest/geography/geometry.ts";
import {
  importGeometry,
  inspectGeometry,
  manifest,
  readDataset,
  sourceKindAvailable,
} from "../src/ingest/geography/geometry.ts";
import { formatGeometryReport, markdownGeometryReport } from "../src/ingest/geography/geometry-report.ts";
import { httpGet } from "../src/ingest/sources/eci/transport.ts";
import { backfillElections, repairElections, repairPlan } from "../src/ingest/elections/identity.ts";
import { perEvent, validateElections } from "../src/ingest/elections/validate.ts";
import { formatReport as formatEciReport, runLs2024 } from "../src/ingest/sources/eci/ls2024.ts";

const argv = process.argv.slice(2);
const cmd = argv[0] ?? "";
const args = argv.slice(1).filter((a) => !a.startsWith("--"));
const has = (name: string): boolean => argv.includes(`--${name}`);
/** `--name=value`, or undefined. There was only a numeric reader; `import` needs string flags. */
const arg = (name: string): string | undefined => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? undefined : hit.slice(name.length + 3);
};
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
  import --state=<id> [--type=AE|GE] [--file=<path>] [--refresh]
                               fetch and load a state's election history from Lokdhaba/TCPD
                               e.g. mandate import --state=br   (br = Bihar, see --state=list)
  resolve [--dry-run]          resolve person duplicates
  audit [--n=200] [--seed=1]   audit a reproducible sample of merges
  unmerge --id=<n>             reverse person_merge <n> and restore the absorbed person
  query person <term>          find people by name / blocking key
  coverage                     per-table row counts and citation coverage
  geography validate           ten checks on constituency identity, with before/after metrics
  geography coverage [--all] [--write]
                               what the map can draw, per jurisdiction/house/boundary epoch
  geography fetch [--dataset=<id>]
                               acquire the declared boundary datasets and verify their sha256
  geography inspect [--dataset=<id>] [--only=ka,up] [--write]
                               resolve every polygon to a jurisdiction, epoch and place_version, and
                               report what would be written and what is staged for review
                               (--write regenerates docs/geo/import.md, the review queue)
  geography import [--dataset=<id>] [--only=ka,up] [--apply] [--replace]
                               write what inspect decided (dry run without --apply)
  geography backfill [--apply] restore each constituency's own name per delimitation, from source
  geography delimitation [--apply]
                               register the delimitation orders, their dates and their derivations
  elections validate           checks on election-event identity
  elections backfill [--apply] write year / month / house / occurrence onto every election, from source
  elections repair [--apply]   split elections that collapsed two events into one id
  eci ls-2024 [--apply] [--refresh]
                               discover, hash, parse, stage, validate and import the 2024 Lok Sabha
                               from the ECI's own statistical reports (dry run without --apply)
  export                       rebuild the seed from the registry and report what differs`;

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

    case "import": {
      const wanted = arg("state");
      if (wanted === "list" || wanted === undefined) {
        console.log(
          wanted === undefined ? "import: --state is required. Available:\n" : "jurisdictions:\n",
        );
        table(JURISDICTIONS.map((j) => [`${j.id}  ${j.name}`, j.assemblySeats ?? "no assembly"]));
        break;
      }
      const j = JURISDICTIONS.find((x) => x.id === wanted);
      if (j === undefined) {
        console.error(`import: unknown jurisdiction '${wanted}'. Try: mandate import --state=list`);
        process.exitCode = 1;
        break;
      }
      const type = (arg("type") ?? "AE").toUpperCase() === "GE" ? "GE" : "AE";
      const stateFile = lokdhabaState(j.id) ?? j.name.replace(/\s+/g, "_");
      console.log(`import: ${j.name} ${type} from lokdhaba.ashoka.edu.in`);
      const url = downloadUrl(stateFile, type);
      const given = arg("file");
      let file;
      try {
        file = given === undefined ? await fetchState(stateFile, type, { refresh: has("refresh") }) : localFile(given, url);
      } catch (cause) {
        // Node's fetch does not use proxy environment variables, so on a proxied machine curl reaches
        // Lokdhaba and this does not. Rather than fail with a bare message, print the command that works.
        console.error(
          `import: could not read ${stateFile}_${type}.csv.gz — ${(cause as Error).message}\n\n` +
            "If that was a connection failure, download it with a tool that honours your proxy and\n" +
            "pass the file in:\n\n" +
            `  curl -o /tmp/${stateFile}_${type}.csv.gz "${url}"\n` +
            `  mandate import --state=${wanted} --type=${type} --file=/tmp/${stateFile}_${type}.csv.gz\n`,
        );
        process.exitCode = 1;
        break;
      }
      console.log(
        `  ${file.cached ? "cached" : "fetched"} ${file.bytes.length.toLocaleString("en-IN")} bytes  sha256 ${file.sha256.slice(0, 16)}…`,
      );
      const db = open();
      const rep = importLokdhaba(db, { jurisdictionId: j.id, type, file, nowIso });
      db.close();
      table([
        ["rows read", rep.rowsRead],
        ["elections", rep.elections],
        ["contests", rep.contests],
        ["candidacies", rep.candidacies],
        ["results", rep.results],
        ["persons", rep.persons],
        ["with a TCPD id", rep.tcpdIds],
        ["parties", rep.parties],
        ["delimitations", rep.epochs],
      ]);
      // Non-zero only where another source built this state's places first: those rows are attached to,
      // never duplicated, so the seat page the app already renders is the one that gains the history.
      if (rep.adoptedVersions > 0 || rep.adoptedContests > 0) {
        table([
          ["adopted seats", rep.adoptedVersions],
          ["adopted contests", rep.adoptedContests],
        ]);
      }
      for (const s of rep.skipped) console.log(`  skipped ${s.count}: ${s.reason}`);
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
      // `--diff` used to be optional because `--out=<dir>` wrote the rebuild to disk; no script,
      // test or doc ever passed --out, so the flag and the writes are gone and the report is the
      // whole subcommand.
      const db = openRead();
      const report = diffAgainstSeed(db);
      db.close();
      console.log(formatReport(report));
      // The ratchet gates the INGESTED figure. The whole-seed figure includes two modules
      // nothing ingests, so it can never reach the floor and gating on it would make the
      // gate permanently red — which is how a gate gets ignored.
      if (report.ingestedPct < THRESHOLD_PCT) {
        fail(
          `reconstructability ${report.ingestedPct.toFixed(1)}% is below the ${THRESHOLD_PCT}% floor — ` +
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

    case "eci": {
      // Phase 1: one complete, authoritative election from the ECI's own statistical reports.
      // docs/ingestion/eci-2023-2026.md establishes the sources; the pipeline never writes from an
      // HTTP response, only from the hashed raw store via a validated staging document.
      const sub = argv[1] ?? "";
      if (sub !== "ls-2024") fail(`unknown eci target '${sub}' (only ls-2024 in this phase)`);
      const db = open();
      const result = await runLs2024(db, {
        apply: has("apply"),
        refresh: has("refresh"),
        nowIso: new Date().toISOString(),
      });
      console.log("");
      console.log(formatEciReport(result, db));
      db.close();
      if (result.validation.hardFailures > 0) process.exit(1);
      break;
    }

    case "elections": {
      // An election is an EVENT, not a year: Bihar held two assembly elections in 2005 and both collapsed
      // into one id. docs/model/election-identity.md.
      const sub = argv[1] ?? "";
      const apply = argv.includes("--apply");
      if (sub === "validate") {
        const db = open();
        const v = validateElections(db);
        for (const c of v.checks) {
          console.log(
            `${String(c.n).padStart(2)}. ${c.name.padEnd(56)} ` +
              (c.skipped ? "SKIPPED" : c.violations === 0 ? "pass" : `${c.violations} VIOLATIONS`),
          );
          if (c.skipped) console.log(`      not asked: ${c.why ?? ""}`);
          for (const ex of c.examples) console.log(`      ${ex}`);
        }
        console.log("\nmetrics");
        table([
          ["election events", v.metrics.events],
          ["years holding several events", v.metrics.multiEventYears],
          ["events with no year", v.metrics.withoutYear],
          ["events with no source", v.metrics.withoutSource],
          ["contests", v.metrics.contests],
          ["results", v.metrics.results],
          ["in the source, missing here", v.metrics.missingFromRegistry],
          ["here, not in any source file", v.metrics.notInSource],
          ["contests with too many winners", v.metrics.duplicateWinnerContests],
        ]);
        console.log("\nmost recent events");
        table(perEvent(db).map((e): [string, unknown] => [e.id, `${e.contests} contests, ${e.results} results`]));
        console.log(v.ok ? "\nall checks pass" : "\nCHECKS FAILED");
        db.close();
        if (!v.ok) process.exit(1);
        break;
      }
      if (sub === "delimitation") {
        // The delimitation orders themselves: which order drew each epoch, what its dates mean, and what
        // DPACO 2008 carried forward. docs/model/delimitation-assam-jk.md.
        const db = open();
        const r = applyDelimitation(db, { nowIso: new Date().toISOString(), dryRun: !has("apply") });
        table([
          ["documents registered", r.sources],
          ["epochs created", r.epochsCreated],
          ["epochs updated", r.epochsUpdated],
          ["derivation links", r.derivationLinks],
          ["chain claims", r.chainClaims],
        ]);
        console.log("\nderivations");
        table(r.perDerivation.map((d): [string, unknown] => [`${d.jurisdiction} ${d.kind}`, `${d.links} links from ${d.note}`]));
        console.log(has("apply") ? "\napplied" : "\ndry run — pass --apply to write");
        db.close();
        break;
      }
      if (sub === "backfill") {
        const db = open();
        const r = backfillElections(db, { apply });
        table([
          ["mode", apply ? "applied" : "dry run — pass --apply to write"],
          ["events in the source", r.events],
          ["elections updated in place", r.updated],
          ["events the registry lacks", r.missing.length],
          ["registry elections no source describes", r.unmatched.length],
          ["years holding several events", r.collisions.length],
        ]);
        for (const c of r.collisions) console.log(`  collision  ${c.group} -> ${c.ids.join(", ")}`);
        for (const m of r.missing) console.log(`  missing    ${m.id} (was ${m.from ?? "?"}) ${m.seats} seats, ${m.rows} rows`);
        db.close();
        break;
      }
      if (sub === "repair") {
        const db = open();
        if (!apply) {
          const plans = repairPlan(db);
          table([["mode", "dry run — pass --apply to write"], ["collapsed elections", plans.length]]);
          for (const p2 of plans) {
            console.log(
              `  ${p2.collapsedId} -> ${p2.replacements.join(" + ")}  ` +
                `(holds ${p2.contests} contests, ${p2.candidacies} candidacies, ${p2.results} results; ` +
                `the source has ${p2.sourceRows} rows for the group)`,
            );
          }
          db.close();
          break;
        }
        const results = repairElections(db, {
          apply: true,
          nowIso,
          reimport: (jurisdictionId, _sourceId, path) => {
            const url = downloadUrl(lokdhabaState(jurisdictionId) ?? jurisdictionId, path.includes("_GE.") ? "GE" : "AE");
            const rep = importLokdhaba(db, {
              jurisdictionId,
              type: path.includes("_GE.") ? "GE" : "AE",
              file: localFile(path, url),
              nowIso,
            });
            return { contests: rep.contests, candidacies: rep.candidacies, results: rep.results };
          },
        });
        for (const r of results) {
          console.log(`${r.collapsedId} -> ${r.replacements.join(" + ")}`);
          table([
            ["deleted", Object.entries(r.deleted).map(([k, v]) => `${k} ${v}`).join(", ") || "nothing"],
            ["re-imported", r.imported === null ? "NOT DONE" : `${r.imported.contests} contests, ${r.imported.candidacies} candidacies, ${r.imported.results} results`],
          ]);
        }
        db.close();
        break;
      }
      fail("elections <validate|backfill|repair>");
      break;
    }

    case "geography": {
      // Constituency identity: a seat number means nothing across delimitations, so the name lives on
      // place_version and is reconstructed from the source files. docs/model/electoral-geography.md.
      const sub = argv[1] ?? "";
      if (sub === "validate") {
        const db = open();
        const v = validateGeography(db);
        for (const c of v.checks) {
          const verdict = c.skipped ? "SKIPPED" : c.violations === 0 ? "pass" : `${c.violations} VIOLATIONS`;
          console.log(`${String(c.n).padStart(2)}. ${c.name.padEnd(52)} ${verdict}`);
          if (c.skipped) console.log(`      not asked: ${c.why ?? "no reason given"}`);
          for (const ex of c.examples) console.log(`      ${ex}`);
        }
        console.log("\nmetrics");
        table([
          ["contests", v.metrics.contests],
          [
            "contests misnamed, before → after",
            v.metrics.misnamedBefore === null
              ? "not measurable without the source cache"
              : `${v.metrics.misnamedBefore} → ${v.metrics.misnamedAfter}`,
          ],
          ["versions with >1 source spelling", v.metrics.ambiguous],
          ["versions with two sources disagreeing", v.metrics.conflicts],
          ["versions not in any source file", v.metrics.unreconstructed],
          ["name_match links", v.metrics.nameMatchLinks],
          ["crosswalk rows (quantitative succession)", v.metrics.crosswalkRows],
          ["asserted succession links", v.metrics.succession],
        ]);
        console.log(v.ok ? "\nall checks pass" : "\nCHECKS FAILED");
        db.close();
        if (!v.ok) process.exit(1);
        break;
      }
      if (sub === "delimitation") {
        // The delimitation orders themselves: which order drew each epoch, what its dates mean, and what
        // DPACO 2008 carried forward. docs/model/delimitation-assam-jk.md.
        const db = open();
        const r = applyDelimitation(db, { nowIso: new Date().toISOString(), dryRun: !has("apply") });
        table([
          ["documents registered", r.sources],
          ["epochs created", r.epochsCreated],
          ["epochs updated", r.epochsUpdated],
          ["derivation links", r.derivationLinks],
          ["chain claims", r.chainClaims],
        ]);
        console.log("\nderivations");
        table(r.perDerivation.map((d): [string, unknown] => [`${d.jurisdiction} ${d.kind}`, `${d.links} links from ${d.note}`]));
        console.log(has("apply") ? "\napplied" : "\ndry run — pass --apply to write");
        db.close();
        break;
      }
      if (sub === "backfill") {
        const apply = argv.includes("--apply");
        const db = open();
        const r = backfillGeography(db, { apply });
        table([
          ["mode", apply ? "applied" : "dry run — pass --apply to write"],
          ["versions considered", r.versions],
          ["corrected", r.buckets.corrected],
          ["already correct", r.buckets.already_correct],
          ["conflict, owning source kept", r.buckets.conflict_kept_owner],
          ["no source row, existing name kept", r.buckets.unreconstructed],
          ["not a constituency", r.buckets.not_a_constituency],
          ["source carries >1 spelling", r.ambiguousNames],
          ["left unnamed", r.unnamed],
          ["name_match links written", r.nameMatchLinks],
          ["audit", r.reportPath ?? "none"],
        ]);
        const notable = Object.entries(r.byJurisdiction).filter(([, v]) => v.conflict > 0 || v.unreconstructed > 0);
        if (notable.length > 0) {
          console.log("\nunresolved, by jurisdiction");
          table(notable.map(([k, v]): [string, unknown] => [k, `${v.conflict} conflicts, ${v.unreconstructed} not in source`]));
        }
        db.close();
        break;
      }
      if (sub === "coverage") {
        // Stage 1 of Phase 3: what the product can draw, measured. `--write` regenerates
        // docs/geo/coverage.md, because the brief forbids typing the final table by hand.
        const db = openRead();
        const c = geometryCoverage(db);
        db.close();
        const md = formatCoverage(c, has("all") ? {} : { only: "current" });
        console.log(md);
        if (has("write")) {
          mkdirSync("docs/geo", { recursive: true });
          writeFileSync(
            "docs/geo/coverage.md",
            `${COVERAGE_PREFACE}\n\n## Current epoch of each house\n\n${formatCoverage(c, { only: "current" })}\n\n` +
              `## Every epoch\n\n${formatCoverage(c)}\n`,
          );
          console.log("\nwrote docs/geo/coverage.md");
        }
        break;
      }
      if (sub === "fetch") {
        // Acquire a declared dataset and verify its hash. NO SILENT DOWNLOADS: the URL, the byte count and
        // the sha256 come from data/geo/sources.json, and a mismatch is a failure rather than a warning.
        const only = arg("dataset");
        for (const d of manifest().datasets) {
          if (only !== undefined && d.id !== only) continue;
          console.log(`${d.id}  ${d.publisher} — ${d.title}`);
          console.log(`  ${d.url}`);
          let onDisk = false;
          try {
            const held = readDataset(d);
            console.log(`  cached  ${held.bytes.toLocaleString("en-IN")} bytes  sha256 ${d.sha256.slice(0, 16)}…  MATCH`);
            onDisk = true;
          } catch (cause) {
            console.log(`  ${(cause as Error).message.split("\n")[0]}`);
          }
          if (onDisk) continue;
          const res = await httpGet(d.url);
          if (!res.ok) fail(`${d.url} returned ${res.status}`);
          mkdirSync(dirname(d.file), { recursive: true });
          writeFileSync(d.file, res.bytes);
          const got = createHash("sha256").update(res.bytes).digest("hex");
          console.log(`  fetched ${res.bytes.length.toLocaleString("en-IN")} bytes  sha256 ${got.slice(0, 16)}…`);
          if (got !== d.sha256) fail(`sha256 mismatch: the manifest declares ${d.sha256}`);
        }
        break;
      }
      if (sub === "inspect" || sub === "import") {
        // The whole decision is `inspect`; `import` writes exactly what it decided. A dry run and a real
        // run therefore cannot disagree, which is the only way a dry run means anything.
        const db = sub === "import" && has("apply") ? open() : openRead();
        if (sub === "import" && has("apply") && !sourceKindAvailable(db)) {
          fail("run `mandate migrate` first — source.kind has no 'boundary_geometry' value yet");
        }
        const wanted = arg("dataset");
        const only = arg("only")?.split(",").filter((s) => s !== "");
        const written: InspectReport[] = [];
        for (const d of manifest().datasets) {
          if (wanted !== undefined && d.id !== wanted) continue;
          const held = readDataset(d);
          const r =
            sub === "inspect"
              ? { report: inspectGeometry(db, d, held.features, only === undefined ? {} : { only }), written: 0, restatedWritten: 0, replaced: 0, skipped: 0, sourceId: "" }
              : importGeometry(db, d, held.features, {
                  ...(only === undefined ? {} : { only }),
                  apply: has("apply"),
                  nowIso,
                  replace: has("replace"),
                });
          console.log(formatGeometryReport(r.report));
          written.push(r.report);
          if (sub === "import") {
            console.log("");
            table([
              ["mode", has("apply") ? "applied" : "dry run — pass --apply to write"],
              ["source id", r.sourceId],
              ["rows written", r.written],
              ["of those, a restated epoch", r.restatedWritten],
              ["replaced", r.replaced],
              ["skipped, already drawn", r.skipped],
            ]);
          }
        }
        db.close();
        // The staged list IS the review queue, so it belongs in the repository rather than in a terminal
        // that scrolled away. `--only` would write a partial record, so it refuses.
        if (has("write")) {
          if (only !== undefined || wanted !== undefined) fail("--write needs the whole run: drop --only and --dataset");
          mkdirSync("docs/geo", { recursive: true });
          writeFileSync("docs/geo/import.md", markdownGeometryReport(written));
          console.log("\nwrote docs/geo/import.md");
        }
        break;
      }
      fail("geography <validate|backfill|coverage|fetch|inspect|import>");
      break;
    }
    default:
      console.log(USAGE);
      if (cmd !== "" && cmd !== "help" && cmd !== "--help") process.exit(1);
  }
} catch (cause) {
  fail((cause as Error).message);
}

// Builds .data/demo-registry.db, a SYNTHETIC registry of a whole country for looking at the front page, and .data/demo-live.json, a
// demo live feed dated a few minutes ago. EVERYTHING THEY HOLD IS MADE UP: never ship them, never commit them (.data is gitignored),
// never present them as real. packages/mandate/src/repo/synthetic-registry.ts says what is in the registry and how it is marked.
//
//   node --no-warnings --import ./ops/probe/render/register.mjs ops/probe/demo/build-demo-registry.mjs [--announced]
//
//   --announced   also write one election the Commission has announced (Goa 2027), for the announced branch of the next-up rail. It
//                 leaves Goa uncoloured on any panel that reads `currentStandings` (see the module's header), so it is not the default.
//
// Then point the app at them (the live path is optional: with none, the page shows no live element):
//
//   MANDATE_DB_PATH=.data/demo-registry.db MANDATE_LIVE_PATH=.data/demo-live.json npm run dev
//
// The feed in this directory (demo-live.json) is dated when it was written, so a page reading it later shows it as stale: that is the
// file to point MANDATE_LIVE_PATH at to look at the stale state. The copy written to .data is the same board re-dated to three minutes
// ago, and is stale again after thirty (run this again to freshen it).

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { open } from "../../../packages/mandate/src/db/index.ts";
import { migrate } from "../../../packages/mandate/src/db/migrate.ts";
import { SYNTHETIC_PARTIES, SYNTHETIC_STATES, buildSyntheticRegistry, shiftFeedTimes } from "../../../packages/mandate/src/repo/synthetic-registry.ts";

const data = fileURLToPath(new URL("../../../.data/", import.meta.url));
const dbPath = `${data}demo-registry.db`;
const feedPath = `${data}demo-live.json`;
const announced = process.argv.includes("--announced");

mkdirSync(data, { recursive: true });
// A rebuild starts from nothing: the builder fills an empty database, and a stale -wal beside a new file is its own kind of trouble.
for (const suffix of ["", "-wal", "-shm"]) rmSync(`${dbPath}${suffix}`, { force: true });

const db = open(dbPath);
try {
  migrate(db, "2026-01-01T00:00:00.000Z");
  const started = performance.now();
  buildSyntheticRegistry(db, { announced });
  const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  console.log(`SYNTHETIC registry written to .data/demo-registry.db in ${Math.round(performance.now() - started)} ms`);
  console.log(
    `  ${SYNTHETIC_STATES.length} states and territories, ${count("election")} elections, ${count("contest")} contests, ` +
      `${count("result")} results, ${SYNTHETIC_PARTIES.length} parties` +
      (announced ? ", one election announced (Goa 2027)" : ""),
  );
} finally {
  db.close();
}

const feed = JSON.parse(readFileSync(new URL("./demo-live.json", import.meta.url), "utf8"));
writeFileSync(feedPath, `${JSON.stringify(shiftFeedTimes(feed, new Date(Date.now() - 3 * 60_000)), null, 2)}\n`);
console.log(`SYNTHETIC live feed written to .data/demo-live.json, dated three minutes ago`);
console.log("");
console.log(`  MANDATE_DB_PATH=.data/demo-registry.db MANDATE_LIVE_PATH=.data/demo-live.json npm run dev`);

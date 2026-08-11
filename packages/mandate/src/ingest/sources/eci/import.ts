/**
 * Import the staged 2024 Lok Sabha into the registry. Transactional, idempotent, and never from HTTP.
 *
 * The input is the staged JSON document, which has already been parsed, normalized, resolved and
 * validated. This file's only job is to write it, once, atomically.
 *
 * IDEMPOTENCY IS BY KEY, NOT BY GUARD. Every row this writes has a deterministic id derived from content:
 *   source        eci:<category>:r<report>:<sha256[0..12]>   — same bytes, same id
 *   place_version versionId(stateIdx, delimId, seat, 'pc')   — the same scheme the Lokdhaba importer uses
 *   contest       ls-2024:<jurisdiction>-pc<number>
 *   person        found through person_identifier(eci_candidate_id) — see personFor
 *   candidacy     <contest>:<person>
 *   result        (contest, candidacy, revision 0)
 * So a second run UPSERTs the identical values over themselves. There is no "have I run before?" check to
 * get wrong, and a half-finished run is completed rather than duplicated by re-running it.
 *
 * ATOMICITY. One BEGIN, one COMMIT, ROLLBACK on any throw. A failure leaves the registry exactly as it
 * was — asserted by a test that injects a failure mid-import and then counts rows.
 *
 * PERSON RESOLUTION NEVER BLOCKS A RESULT. Every candidate gets a person immediately. Resolution against
 * the registry's existing 448,035 people is attempted, and where it is not certain a NEW person is created
 * and the pair is queued for review. Nothing is merged aggressively here: this election is the FIRST
 * ECI-sourced corpus in the registry, so a wrong merge would be a wrong biography, and the queue exists
 * precisely so that decision can be made with evidence later.
 */

import type { DatabaseSync } from "node:sqlite";
import type { Param } from "../../../db/index.ts";
import { all, get } from "../../../db/index.ts";
import { candidacyId, contestId, slug } from "../../../core/ids.ts";
import { blockingKeys, detectScript } from "../../../core/indic/index.ts";
import { JURISDICTIONS } from "../../india.ts";
import { versionId } from "../lokdhaba.ts";
import { ECI_STATISTICAL_DISCLAIMER, type RawArtefact } from "./acquire.ts";
import { LS2024_EPOCH_ID, type Staged, type StagedCandidate, type StagedContest } from "./stage.ts";

export const PARSER_VERSION = "eci-ls2024-v1";
/** TCPD's DelimID for the 2008 order, so place_version ids land in the same space as the Lokdhaba import. */
const DELIM_2008 = 4;

export type PersonOutcome = "AUTO_MATCH" | "REVIEW" | "NEW_PERSON" | "REUSED";

export type ImportReport = {
  electionId: string;
  ingestRunId: number;
  sources: number;
  sourceHashes: number;
  placeVersionsCreated: number;
  placeVersionsAdopted: number;
  placesCreated: number;
  contests: number;
  candidacies: number;
  results: number;
  winners: number;
  turnout: number;
  persons: Record<PersonOutcome, number>;
  partiesMatched: number;
  partiesUnresolved: number;
  symbols: number;
  claims: number;
  /** Placeholder results from an earlier source, replaced and written to the correction ledger. */
  superseded: number;
  /** Person pairs sent to the review queue rather than merged. */
  queuedForReview: number;
  unresolvedContests: { seat: string; why: string }[];
  warnings: string[];
};

const upsert = (table: string, cols: readonly string[], key: readonly string[]): string => {
  const set = cols.filter((c) => !key.includes(c)).map((c) => `${c}=excluded.${c}`);
  return (
    `INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})` +
    ` ON CONFLICT (${key.join(",")}) DO ${set.length > 0 ? `UPDATE SET ${set.join(",")}` : "NOTHING"}`
  );
};

/**
 * Write the staged election.
 *
 * `hook` exists for one test: it is called once, mid-import, so a thrown error can prove the rollback
 * leaves the registry untouched. Nothing in production passes it.
 */
export function importStaged(
  db: DatabaseSync,
  s: Staged,
  opts: { nowIso: string; hook?: () => void } = { nowIso: new Date().toISOString() },
): ImportReport {
  const now = opts.nowIso;
  const warnings: string[] = [];
  const persons: Record<PersonOutcome, number> = { AUTO_MATCH: 0, REVIEW: 0, NEW_PERSON: 0, REUSED: 0 };

  const importable = s.contests.filter((c) => c.resolution !== "UNRESOLVED");
  const unresolvedContests = s.contests
    .filter((c) => c.resolution === "UNRESOLVED")
    .map((c) => ({ seat: `${c.jurisdictionId} pc${c.number} ${c.rawName}`, why: c.resolutionNote }));

  db.exec("BEGIN");
  try {
    // ── ingest_run, opened first so anything that follows can be attributed ──────────────────────
    db.prepare(
      "INSERT INTO ingest_run (pipeline, parser_version, started_at, status, rows_in) VALUES (?, ?, ?, 'running', ?)",
    ).run(`eci:${s.electionId}`, PARSER_VERSION, now, s.counts.report33Rows);
    const runId = Number(get<{ id: number }>(db, "SELECT MAX(id) AS id FROM ingest_run")?.id ?? 0);

    // ── sources: one row per artefact, with ECI's own caveat attached ────────────────────────────
    const sourceSql = upsert(
      "source",
      ["id", "kind", "publisher", "title", "url", "retrieved_at", "doc_hash", "hash_kind", "retrieval_kind", "publisher_note"],
      ["id"],
    );
    for (const a of s.sources) {
      db.prepare(sourceSql).run(
        a.sourceId,
        // No 'statistical_report' kind exists and widening source.kind's CHECK needs a table rebuild that
        // SQLite refuses while children hold foreign keys into it (see 005). The CONTENT is declared
        // results, which is what 'eci_declaration' means; the compilation chain is in publisher/title and
        // the Commission's own caveat is in publisher_note.
        "eci_declaration",
        a.publisher,
        `${s.eciCategoryName} — report ${a.reportNo}: ${a.title.replace(/^\s*[\d(A-Za-z)]+\s*[.\-–]\s*/, "")}`,
        a.url,
        a.retrievedAt,
        a.sha256,
        "document_bytes",
        "fetched",
        ECI_STATISTICAL_DISCLAIMER,
      );
    }
    const primary = sourceOf(s.sources, "33");
    const turnoutSource = sourceOf(s.sources, "13");
    const winnerSource = sourceOf(s.sources, "4");
    const suratSource = sourceOf(s.sources, "2(A)");

    // ── place_version for the seats the registry has never held ─────────────────────────────────
    let placesCreated = 0;
    let versionsCreated = 0;
    const placeSql = upsert("place", ["id", "kind", "parent_id", "canonical_name", "eci_code"], ["id"]);
    const versionSql = upsert(
      "place_version",
      ["id", "place_id", "jurisdiction_id", "kind", "epoch_id", "number", "canonical_name", "reservation",
       "source_constituency_key", "name_source_id"],
      ["id"],
    );
    const existingPlaces = new Set(all<{ id: string }>(db, "SELECT id FROM place").map((r) => r.id));
    const versionFor = new Map<string, number>();

    for (const c of importable) {
      if (c.resolution === "ADOPTED") {
        versionFor.set(seatKey(c), c.placeVersionId as number);
        continue;
      }
      const idx = JURISDICTIONS.findIndex((j) => j.id === c.jurisdictionId);
      if (idx < 0) throw new Error(`no jurisdiction '${c.jurisdictionId}' in india.ts — cannot number its seats`);
      const placeId = `${c.jurisdictionId}.pc.${String(c.number).padStart(3, "0")}`;
      const vid = versionId(idx + 1, DELIM_2008, c.number, "pc");
      if (!existingPlaces.has(placeId)) {
        db.prepare(placeSql).run(placeId, "pc", c.jurisdictionId, c.rawName, String(c.number));
        existingPlaces.add(placeId);
        placesCreated += 1;
      }
      db.prepare(versionSql).run(
        vid, placeId, c.jurisdictionId, "pc", LS2024_EPOCH_ID, c.number,
        // The source's own spelling, marker and all. This is the only place the name is written, and it is
        // written from the document that named it.
        c.rawName, c.reservation, `${c.jurisdictionId}|${c.number}|${c.rawName}`, winnerSource,
      );
      versionFor.set(seatKey(c), vid);
      versionsCreated += 1;
    }

    // ── the election event: exactly one, already present, now carrying its source ────────────────
    const election = get<{ house: string; year: number }>(db, "SELECT house, year FROM election WHERE id = ?", s.electionId);
    if (election === undefined) throw new Error(`election ${s.electionId} is not in the registry — run mandate migrate && ingest`);
    if (election.house !== "pc" || election.year !== 2024) {
      throw new Error(`${s.electionId} is house=${election.house} year=${election.year}, not the 2024 Lok Sabha`);
    }
    db.prepare(
      "UPDATE election SET source_id = ?, lifecycle = 'declared', house_ordinal = 18, poll_no = 0 WHERE id = ?",
    ).run(primary, s.electionId);

    // ── parties and symbols ─────────────────────────────────────────────────────────────────────
    /**
     * ECI's party abbreviation → a party row, tried against three keys the registry already holds.
     *
     * `party.id` first, because the registry's ids ARE the ECI abbreviations — 'AITC', 'CPI(M)' — while
     * `short_name` carries TCPD's ('TMC', 'CPM'). Matching only on short_name left all 29 Trinamool seats
     * and 4 CPI(M) seats with no party link. No abbreviation is invented here: every key is a string the
     * registry already stores, so a party ECI names and the register does not hold keeps its raw label
     * instead of being guessed at.
     */
    const partyByShort = new Map<string, string>();
    const norm = (v: string): string => v.trim().toUpperCase().replace(/\s+/g, " ");
    for (const p of all<{ id: string; short_name: string; name: string }>(
      db,
      "SELECT id, short_name, name FROM party",
    )) {
      for (const key of [norm(p.id), norm(p.short_name), norm(p.name)]) {
        if (key !== "" && !partyByShort.has(key)) partyByShort.set(key, p.id);
      }
    }
    const versionOfParty = new Map<string, number>();
    for (const v of all<{ id: number; party_id: string }>(
      db,
      "SELECT id, party_id FROM party_version WHERE valid_to IS NULL",
    )) {
      if (!versionOfParty.has(v.party_id)) versionOfParty.set(v.party_id, v.id);
    }
    let partiesMatched = 0;
    let partiesUnresolved = 0;

    const symbolSql = upsert("symbol", ["id", "name"], ["id"]);
    const symbols = new Set(all<{ id: string }>(db, "SELECT id FROM symbol").map((r) => r.id));

    // ── contests, candidacies, results, turnout ─────────────────────────────────────────────────
    const contestSql = upsert("contest", ["id", "election_id", "place_version_id", "seats_available", "lifecycle"], ["id"]);
    const candidacySql = upsert(
      "candidacy",
      ["id", "contest_id", "person_id", "party_version_id", "symbol_id", "status", "age_declared", "party_raw"],
      ["id"],
    );
    const resultSql = upsert(
      "result",
      ["contest_id", "candidacy_id", "revision", "votes", "postal_votes", "evm_votes", "vote_share", "rank",
       "is_winner", "margin", "source_id", "ingested_at"],
      ["contest_id", "candidacy_id", "revision"],
    );
    const turnoutSql = upsert(
      "turnout",
      ["contest_id", "scope", "electors", "voters", "male", "female", "third_gender", "postal", "nota", "source_id"],
      ["contest_id", "scope"],
    );

    /**
     * Contests this election already has, by the slot they occupy.
     *
     * `contest` is UNIQUE (election_id, place_version_id), so writing a new id for a seat the seed already
     * created is refused by the schema rather than silently duplicated — which is how this was found. West
     * Bengal's 42 seats came from the seed under ids of its own shape, and the point of importing ECI is
     * that those seats gain real counts, not that a second set of contests appears beside them.
     */
    const adoptedContest = new Map<number, string>();
    for (const r of all<{ id: string; place_version_id: number }>(
      db,
      "SELECT id, place_version_id FROM contest WHERE election_id = ?",
      s.electionId,
    )) {
      adoptedContest.set(r.place_version_id, r.id);
    }

    // Prepared once, run 8,360 times. Re-preparing inside the loop made the import take minutes.
    const stContest = db.prepare(contestSql);
    const stCandidacy = db.prepare(candidacySql);
    const stResult = db.prepare(resultSql);
    const stTurnout = db.prepare(turnoutSql);
    const stSymbol = db.prepare(symbolSql);
    const stDeleteResult = db.prepare("DELETE FROM result WHERE contest_id = ? AND candidacy_id = ? AND revision = 0");
    const stCorrection = db.prepare(
      `INSERT INTO correction (entity_ref, field, old_value, new_value, reason, source_id, corrected_at, public_slug)
         VALUES (?, 'result', ?, NULL, ?, ?, ?, ?) ON CONFLICT (public_slug) DO NOTHING`,
    );
    const stQueue = db.prepare(
      `INSERT INTO person_merge_candidate (person_a_id, person_b_id, score, evidence, blocked_by, state, queued_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?) ON CONFLICT (person_a_id, person_b_id) DO NOTHING`,
    );
    const stOldResults = db.prepare(
      `SELECT candidacy_id, votes, margin, source_id, is_winner FROM result
        WHERE contest_id = ? AND revision = 0 AND votes IS NULL AND source_id NOT LIKE 'eci:%'`,
    );
    const stPriorNames = db.prepare(
      `SELECT ca.id, ca.person_id, p.canonical_name FROM candidacy ca JOIN person p ON p.id = ca.person_id
        WHERE ca.contest_id = ?`,
    );

    const resolver = personResolver(db, now, winnerSource);
    let contests = 0;
    let candidacies = 0;
    let results = 0;
    let winners = 0;
    let turnoutRows = 0;
    let claims = 0;
    let superseded = 0;
    let queued = 0;
    let hooked = false;

    for (const c of importable) {
      const pvId = versionFor.get(seatKey(c));
      if (pvId === undefined) throw new Error(`no place_version resolved for ${seatKey(c)}`);
      const cid = adoptedContest.get(pvId) ?? contestId(s.electionId, `${c.jurisdictionId}-pc${String(c.number).padStart(3, "0")}`);
      stContest.run(cid, s.electionId, pvId, 1, "declared");
      contests += 1;

      /**
       * Supersede a placeholder result from an earlier source.
       *
       * The seed already asserted 42 West Bengal winners for this election with a margin and NO vote
       * counts. Leaving them beside ECI's counted results would give those contests two `is_winner` rows —
       * the duplicate-winner defect the election-identity repair spent a migration removing. So a prior
       * result with no vote count, from a non-ECI source, for a contest ECI now reports in full, is
       * superseded: deleted, and written to the public correction ledger with what it said and why it went.
       *
       * A prior result that DOES carry votes is left alone. Two sources reporting different counts for one
       * seat is a genuine conflict, and validation check 5 will fail on it rather than have this importer
       * pick a winner.
       */
      for (const old of stOldResults.all(cid) as unknown as { candidacy_id: string; votes: number | null; margin: number | null; source_id: string; is_winner: number }[]) {
        stDeleteResult.run(cid, old.candidacy_id);
        stCorrection.run(
          `result:${cid}:${old.candidacy_id}`,
          JSON.stringify({ votes: old.votes, margin: old.margin, isWinner: old.is_winner, sourceId: old.source_id }),
          "superseded by the ECI statistical report for the 2024 Lok Sabha, which reports the vote counts " +
            "this row asserted a winner without",
          primary,
          now,
          `eci-ls2024-supersede-${slug(cid)}-${slug(old.candidacy_id)}`,
        );
        superseded += 1;
      }
      /** Who the earlier source said stood here, so the same human is not silently counted twice. */
      const priorNames = new Map<string, string>();
      /**
       * Candidacy ids an earlier source already gave this contest.
       *
       * `candidacy` is UNIQUE (contest_id, person_id) as well as keyed on its id, so when resolution lands
       * an ECI candidate on a person the seed already recorded here, writing this file's own id shape is
       * refused by the schema. The existing id is adopted, exactly as the contest above is.
       */
      const priorCandidacy = new Map<string, string>();
      for (const r of stPriorNames.all(cid) as unknown as { id: string; person_id: string; canonical_name: string }[]) {
        priorNames.set(r.canonical_name.toUpperCase().replace(/[^A-Z0-9]/g, ""), r.person_id);
        priorCandidacy.set(r.person_id, r.id);
      }

      const usedHere = new Set<string>();
      for (const x of c.candidates) {
        const outcome = resolver.personFor(x, c, usedHere);
        usedHere.add(outcome.personId);
        persons[outcome.outcome] += 1;

        const partyId = partyByShort.get(norm(x.rawParty));
        const pvid = partyId === undefined ? null : (versionOfParty.get(partyId) ?? null);
        if (pvid === null) partiesUnresolved += 1;
        else partiesMatched += 1;

        let symbolId: string | null = null;
        if (x.rawSymbol.trim() !== "") {
          symbolId = `eci:${slug(x.rawSymbol)}`;
          if (!symbols.has(symbolId)) {
            stSymbol.run(symbolId, x.rawSymbol);
            symbols.add(symbolId);
          }
        }

        const caId = priorCandidacy.get(outcome.personId) ?? candidacyId(cid, outcome.personId);
        stCandidacy.run(
          caId, cid, outcome.personId, pvid, symbolId,
          x.isWinner ? "elected" : "defeated",
          x.age,
          // The source's party string survives whenever it did not resolve, so a candidacy is never
          // dropped for an unresolvable party and the label can be reconciled later.
          pvid === null ? x.rawParty : null,
        );
        candidacies += 1;

        // The same human, asserted by two sources, must not become two people silently. The pair goes to
        // the review queue that already holds 52,330 seed-versus-source pairs; nothing is merged here.
        const prior = priorNames.get(x.normName);
        if (prior !== undefined && prior !== outcome.personId) {
          const [a, b] = prior < outcome.personId ? [prior, outcome.personId] : [outcome.personId, prior];
          stQueue.run(a, b, 0.9, JSON.stringify({ sameContest: cid, sameNormalizedName: x.normName, sources: ["seed", "eci:ls-2024"] }), x.normName, now);
          queued += 1;
        }

        // Surat's winner has no votes, no margin and no share, because no poll was held. `result` requires
        // one of the three, so NO result row is written and the unopposed election is recorded as a cited
        // claim instead. A fabricated 0 here is exactly what migration 007 existed to undo.
        if (x.totalVotes === null && x.margin === null && x.shareOfValid === null) {
          if (!c.unopposed) {
            warnings.push(`${seatKey(c)} ${x.rawName}: no votes, margin or share, and the seat is not marked unopposed`);
          }
          continue;
        }
        stResult.run(
          cid, caId, 0, x.totalVotes, x.postalVotes, x.evmVotes, x.shareOfValid, x.rank,
          x.isWinner ? 1 : 0, x.margin, x.totalVotes === null ? suratSource : primary, now,
        );
        results += 1;
        if (x.isWinner) winners += 1;
      }

      const t = c.turnout;
      if (t.electors !== null || t.voters !== null) {
        stTurnout.run(
          cid, "contest", t.electors, t.voters, t.male, t.female, t.thirdGender, t.postal, t.nota,
          c.unopposed ? suratSource : turnoutSource,
        );
        turnoutRows += 1;
      }

      if (c.unopposed) {
        claims += claim(db, `contest:${cid}`, "elected_unopposed", "true", now, suratSource, s.eciSuratNote);
      }
      if (c.nameMismatch !== null) {
        // Recorded, never reconciled: two cited sources spelling one seat differently is a fact.
        claims += claim(db, `place_version:${pvId}`, "name_variant_eci_2024", JSON.stringify(c.rawName), now, winnerSource, c.nameMismatch);
      }

      if (!hooked && opts.hook !== undefined) {
        hooked = true;
        opts.hook();
      }
    }

    /**
     * Count what is actually in the registry, before COMMIT, and refuse to commit if it disagrees.
     *
     * The importer counted 8,116 results and the registry held 8,110: three constituencies had lost their
     * winner to a UNIQUE constraint that overwrites rather than errors. An upsert cannot fail loudly by
     * itself, so this is the check that makes it. Inside the transaction, so a mismatch rolls the whole
     * import back instead of leaving a registry that looks finished.
     */
    const inDb = (sql: string): number =>
      Number((db.prepare(sql).get(s.electionId) as { n: number } | undefined)?.n ?? 0);
    const actual = {
      contests: inDb("SELECT COUNT(*) AS n FROM contest WHERE election_id = ?"),
      results: inDb("SELECT COUNT(*) AS n FROM result r JOIN contest c ON c.id = r.contest_id WHERE c.election_id = ? AND r.revision = 0"),
      winners: inDb("SELECT COUNT(*) AS n FROM result r JOIN contest c ON c.id = r.contest_id WHERE c.election_id = ? AND r.is_winner = 1 AND r.revision = 0"),
    };
    const expected = { contests, results, winners };
    const drift = Object.entries(expected).filter(([k, v]) => actual[k as keyof typeof actual] !== v);
    if (drift.length > 0) {
      throw new Error(
        `import wrote rows the registry does not hold — refusing to commit: ` +
          drift.map(([k, v]) => `${k} written ${v}, present ${actual[k as keyof typeof actual]}`).join("; "),
      );
    }

    db.prepare(
      "UPDATE ingest_run SET finished_at = ?, status = ?, rows_out = ?, anomalies = ? WHERE id = ?",
    ).run(
      now,
      unresolvedContests.length === 0 && warnings.length === 0 ? "ok" : "partial",
      results,
      JSON.stringify([...unresolvedContests.map((u) => `${u.seat}: ${u.why}`), ...warnings]),
      runId,
    );
    db.exec("COMMIT");

    return {
      electionId: s.electionId,
      ingestRunId: runId,
      sources: s.sources.length,
      sourceHashes: s.sources.filter((a) => a.sha256.length === 64).length,
      placeVersionsCreated: versionsCreated,
      placeVersionsAdopted: importable.length - versionsCreated,
      placesCreated,
      contests,
      candidacies,
      results,
      winners,
      turnout: turnoutRows,
      persons,
      partiesMatched,
      partiesUnresolved,
      symbols: symbols.size,
      claims,
      superseded,
      queuedForReview: queued,
      unresolvedContests,
      warnings,
    };
  } catch (cause) {
    db.exec("ROLLBACK");
    throw cause instanceof Error ? cause : new Error(String(cause));
  }
}

const seatKey = (c: StagedContest): string => `${c.jurisdictionId}|${c.number}`;

function sourceOf(sources: readonly RawArtefact[], reportNo: string): string {
  const a = sources.find((x) => x.reportNo === reportNo);
  if (a === undefined) throw new Error(`the staged document cites no report ${reportNo}`);
  return a.sourceId;
}

/** A claim with its citation, keyed on content so a re-run rebinds nothing. Returns 1 if written. */
function claim(
  db: DatabaseSync,
  subject: string,
  predicate: string,
  value: string,
  now: string,
  sourceId: string,
  note: string,
): number {
  const contentKey = `${subject}|${predicate}|${value}`;
  db.prepare(
    `INSERT INTO claim (subject_ref, predicate, object_value, unit, as_of, confidence, content_key)
       VALUES (?, ?, ?, ?, ?, 'verified', ?) ON CONFLICT (content_key) DO NOTHING`,
  ).run(subject, predicate, value, note.slice(0, 300), "2024-06-04", contentKey);
  const id = get<{ id: number }>(db, "SELECT id FROM claim WHERE content_key = ?", contentKey)?.id;
  if (id === undefined) return 0;
  db.prepare(
    // page_no is NOT NULL and a spreadsheet has no pages; 0 is what the rest of the registry uses for
    // "the whole document" rather than a page within it.
    `INSERT INTO citation (claim_id, source_id, page_no, parser_version, extracted_at)
       VALUES (?, ?, 0, ?, ?) ON CONFLICT DO NOTHING`,
  ).run(id, sourceId, PARSER_VERSION, now);
  return 1;
}

// ── person resolution ─────────────────────────────────────────────────────────────────────────────

type Resolved = { personId: string; outcome: PersonOutcome };

/**
 * Give every ECI candidate a person, without ever blocking the result.
 *
 * `person_identifier` is PRIMARY KEY (scheme, value), and its `eci_candidate_id` scheme is what makes this
 * idempotent: the second run finds the row the first run wrote and REUSES the person, so no candidate is
 * ever duplicated and no id drifts.
 *
 * On a first sighting, resolution is attempted conservatively. AUTO_MATCH requires BOTH an exact
 * normalized-name match AND that the candidate has stood in this same constituency before — the strongest
 * evidence available without an affidavit — and requires it to be unambiguous. Anything weaker creates a
 * new person and queues the pair, because this is the registry's first ECI corpus and a wrong merge is a
 * wrong biography. `mandate resolve` owns merging; this owns not guessing.
 */
function personResolver(
  db: DatabaseSync,
  now: string,
  sourceId: string,
): { personFor: (x: StagedCandidate, c: StagedContest, usedHere: ReadonlySet<string>) => Resolved } {
  const known = new Map<string, string>();
  for (const r of all<{ value: string; person_id: string }>(
    db,
    "SELECT value, person_id FROM person_identifier WHERE scheme = 'eci_candidate_id'",
  )) {
    known.set(r.value, r.person_id);
  }
  const taken = new Set(all<{ id: string }>(db, "SELECT id FROM person").map((r) => r.id));

  const personSql = upsert("person", ["id", "canonical_name", "canonical_name_script", "names", "sex", "review_state", "created_at"], ["id"]);
  // Repoints on conflict rather than doing nothing: the identifier is this pipeline's own key, so when a
  // re-run resolves an ECI candidate to a different person the mapping must follow, not stick.
  const identifierSql =
    "INSERT INTO person_identifier (person_id, scheme, value, source_id) VALUES (?, 'eci_candidate_id', ?, ?)" +
    " ON CONFLICT (scheme, value) DO UPDATE SET person_id = excluded.person_id, source_id = excluded.source_id";
  const aliasSql = upsert("person_alias", ["person_id", "name", "script", "norm_key", "kind", "first_seen", "source_id"],
    ["person_id", "name", "script", "norm_key"]);

  /**
   * Everyone who has ever stood in a parliamentary constituency, indexed by (that seat, normalized name).
   *
   * One query for the whole election rather than one per contest: the per-contest form ran a correlated
   * subquery across 565,714 candidacies 524 times and dominated the import's runtime. Keyed on the seat's
   * `place_id` — the cross-epoch grouping — because "has stood here before" spans delimitations, which is
   * exactly the evidence that makes a name match worth acting on.
   */
  const priorByPlace = new Map<string, string[]>();
  for (const r of all<{ place_id: string; id: string; canonical_name: string }>(
    db,
    `SELECT DISTINCT v.place_id, p.id, p.canonical_name
       FROM person p
       JOIN candidacy ca    ON ca.person_id = p.id
       JOIN contest ct      ON ct.id = ca.contest_id
       JOIN place_version v ON v.id = ct.place_version_id
      WHERE v.kind = 'pc'`,
  )) {
    const key = `${r.place_id}|${r.canonical_name.toUpperCase().replace(/[^A-Z0-9]/g, "")}`;
    priorByPlace.set(key, [...(priorByPlace.get(key) ?? []), r.id]);
  }
  const placeOfVersion = new Map<number, string>();
  for (const r of all<{ id: number; place_id: string }>(db, "SELECT id, place_id FROM place_version WHERE kind = 'pc'")) {
    placeOfVersion.set(r.id, r.place_id);
  }

  return {
    personFor(x, c, usedHere): Resolved {
      // A remembered mapping is reused — unless it points at a person already used in this contest, which
      // means an earlier run recorded the collapse described below. Then it is repointed, so re-running
      // repairs the registry instead of merely refusing to commit again.
      const seen = known.get(x.eciCandidateId);
      if (seen !== undefined && !usedHere.has(seen)) return { personId: seen, outcome: "REUSED" };

      let personId: string | null = null;
      let outcome: PersonOutcome = "NEW_PERSON";
      const pv = c.placeVersionId;
      if (pv !== null) {
        const placeId = placeOfVersion.get(pv);
        const hits = placeId === undefined ? [] : (priorByPlace.get(`${placeId}|${x.normName}`) ?? []);
        if (hits.length === 1) {
          personId = hits[0] as string;
          outcome = "AUTO_MATCH";
        } else if (hits.length > 1) {
          outcome = "REVIEW";
        }
      }

      /**
       * Two candidates on one ballot are two humans, whatever they are called.
       *
       * Seven 2024 seats fielded an independent with the SAME name as the eventual winner. Both rows have
       * the same normalized name, so both matched the one prior person of that name in that seat, and
       * `candidacy` — UNIQUE (contest_id, person_id) — silently collapsed them: three constituencies lost
       * their winner to a 780-vote namesake. So a person already used in this contest disqualifies the
       * match, and the second candidate becomes a new person marked for review.
       */
      if (personId !== null && usedHere.has(personId)) {
        personId = null;
        outcome = "REVIEW";
      }

      if (personId === null) {
        personId = freshId(x.rawName, taken);
        taken.add(personId);
        db.prepare(personSql).run(
          personId, x.rawName, detectScript(x.rawName), "{}", x.sex,
          // 'auto' would claim a decision nobody made. These come straight from a source and have not been
          // compared with anything.
          "unreviewed", now,
        );
      }
      db.prepare(identifierSql).run(personId, x.eciCandidateId, sourceId);
      for (const key of blockingKeys(x.rawName)) {
        db.prepare(aliasSql).run(personId, x.rawName, detectScript(x.rawName), key, "eci_nomination", now, sourceId);
      }
      known.set(x.eciCandidateId, personId);
      return { personId, outcome };
    },
  };
}

/** A slug that is not already a person id, disambiguated by a counter rather than by chance. */
function freshId(name: string, taken: ReadonlySet<string>): string {
  const base = slug(name) || "unnamed";
  if (!taken.has(base)) return base;
  for (let n = 2; n < 10_000; n += 1) {
    const candidate = `${base}-${String(n).padStart(6, "0")}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`cannot allocate a person id for "${name}"`);
}

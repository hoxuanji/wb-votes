import type { DatabaseSync } from "node:sqlite";
import type {
  BirthYearConfidence,
  CandidacyStatus,
  Names,
  Reservation,
  ReviewState,
  Script,
  Sex,
} from "../core/index.ts";
import { UNPARSEABLE_KEY, blockingKeys } from "../core/index.ts";
import { cleanText, toLatin } from "../core/indic/index.ts";
import { all, get } from "../db/index.ts";
import { chronoAsc, chronoDesc } from "../core/election-kind.ts";
import type { SourceRef } from "./index.ts";
import { loadSources, marks, read, yearOf } from "./index.ts";
import { seatHref, seatTies } from "./place-resolve.ts";
import { turnoutReading, unverifiedTurnout } from "./turnout-trust.ts";
import type { Turnout } from "./turnout-trust.ts";

export type PersonBrief = {
  person: {
    id: string;
    canonicalName: string;
    names: Names;
    sex: Sex | null;
    birthYear: number | null;
    birthYearConfidence: BirthYearConfidence | null;
    reviewState: ReviewState;
  };
  aliases: { name: string; script: Script; kind: string }[];
  /** Newest election first. */
  candidacies: {
    contestId: string;
    electionId: string;
    electionName: string;
    year: number;
    placeName: string;
    /** The seat's jurisdiction and body, from `place_version`. */
    jurisdictionId: string | null;
    placeKind: string | null;
    /**
     * The seat's canonical address (`seatHref`): its name's, or its registry id's where another current seat of its state and
     * body shares the name, so the link opens this seat and not the page that asks which was meant. Null where the
     * jurisdiction or the body is not recorded, because a link is never guessed from the name.
     */
    placeHref: string | null;
    placeNumber: number | null;
    reservation: Reservation | null;
    partyShortName: string | null;
    /** The party's id (the key every map, strip and bar inks it by), or null where the register names none. */
    partyId: string | null;
    partySymbolRef: string | null;
    /** The seat's version and its place id, so a page can read the seat's own history and field. */
    versionId: number;
    placeId: string;
    status: CandidacyStatus;
    ageDeclared: number | null;
    educationDeclared: string | null;
    votes: number | null;
    voteShare: number | null;
    rank: number | null;
    isWinner: boolean;
    margin: number | null;
    /**
     * Who the contest was declared for, when it was someone else: null for the winner themself and for a contest with
     * no declared winner. Read from the winner's `elected` status and not from a result row, because one 2026 seat has
     * the first and not the second. For a candidacy with no result of its own it is the one thing the registry says
     * about how the contest came out.
     */
    wonBy: { personId: string; name: string; partyShortName: string | null } | null;
    /** A reading, never a bare percentage: West Bengal 2026's turnout is withheld (turnout-trust.ts). */
    turnout: Turnout;
  }[];
  /** The occupation they declared (a claim), and the portfolios the press says they hold (claims): both are provisional and printed as claims. */
  declared: { occupation: string | null; cabinet: string[] };
  /** Oldest first — this is a series, and a series read backwards is a wrong delta. */
  affidavitTrail: {
    year: number;
    filedOn: string | null;
    assetsTotal: number | null;
    liabilitiesTotal: number | null;
    movable: number | null;
    immovable: number | null;
    pendingCasesDeclared: number | null;
    sourceId: string;
  }[];
  mergeProvenance: {
    mergeId: number;
    absorbedId: string;
    score: number | null;
    decidedBy: string;
    decidedAt: string;
  }[];
  /**
   * The seat this row is recorded as sitting for (its `mla_term` claim), read only for a row with no candidacy of its
   * own, where that claim is all there is to say. `placeHref` is null where the seat's state or body is not recorded.
   */
  sitting: {
    term: string;
    placeName: string;
    placeHref: string | null;
    party: string | null;
    marginVotes: number | null;
    asOf: string | null;
  } | null;
  sources: SourceRef[];
};

export type PersonRow = {
  id: string;
  canonicalName: string;
  sex: Sex | null;
  reviewState: ReviewState;
  /** Most recent candidacy, which is what a list row renders. null only for a person with none. */
  latestElectionId: string | null;
  latestYear: number | null;
  latestPlaceName: string | null;
  latestPartyShortName: string | null;
  latestStatus: CandidacyStatus | null;
  /** Who that contest was declared for, when it was someone else: the winner's name. Null otherwise (see the brief's `wonBy`). */
  latestWonBy: string | null;
  latestVotes: number | null;
  latestVoteShare: number | null;
  isWinner: boolean;
  candidacyCount: number;
  /** P2 for a list row: the result row's source, or the source that first recorded the name.
   *  Never null in a migrated registry — every alias carries a source. */
  sourceId: string | null;
  /** Which tier matched. "name" means one of this person's recorded names contains the term;
   *  "sounds-like" means only the phonetic index matched, which over-collides by design and must be
   *  presented as a suggestion rather than a result. Absent outside search. */
  match?: "name" | "sounds-like";
};

type PersonRowSql = {
  id: string;
  canonical_name: string;
  names: string;
  sex: Sex | null;
  birth_year: number | null;
  birth_year_confidence: BirthYearConfidence | null;
  review_state: ReviewState;
};

/**
 * Everything the Brief lens renders, in one call. EIGHT fixed queries — person, aliases,
 * candidacies, which of their elections' turnout is unverified, affidavits, person-level claims, merges, sources —
 * never N+1 in the number of candidacies, affidavits or sources. Asserted by person.test.ts's statement counter. A row
 * with no candidacy but a recorded seat reads that seat's name as a ninth. Which seats share a name (`seatTies`, for
 * each candidacy's `placeHref`) is read once per registry file and kept, so it is not one of them.
 */
export function getPersonBrief(db: DatabaseSync, slug: string): PersonBrief | null {
  return read(() => {
    const p = get<PersonRowSql>(
      db,
      `SELECT id, canonical_name, names, sex, birth_year, birth_year_confidence, review_state
         FROM person WHERE id = ?`,
      slug,
    );
    if (p === undefined) return null;

    const aliases = all<{ name: string; script: Script; kind: string }>(
      db,
      `SELECT DISTINCT name, script, kind FROM person_alias
        WHERE person_id = ? ORDER BY name, script, kind`,
      slug,
    );

    const cand = all<{
      candidacy_id: string;
      contest_id: string;
      election_id: string;
      election_name: string;
      version_id: number;
      place_id: string;
      place_name: string;
      jurisdiction_id: string | null;
      place_kind: string | null;
      number: number | null;
      reservation: Reservation | null;
      party_short_name: string | null;
      party_id: string | null;
      symbol_id: string | null;
      status: CandidacyStatus;
      age_declared: number | null;
      education_declared: string | null;
      votes: number | null;
      vote_share: number | null;
      rank: number | null;
      is_winner: number | null;
      margin: number | null;
      result_source_id: string | null;
      electors: number | null;
      voters: number | null;
      turnout_source_id: string | null;
      winner_id: string | null;
      winner_name: string | null;
      winner_party: string | null;
    }>(
      db,
      `SELECT ca.id AS candidacy_id, c.id AS contest_id, c.election_id, e.name AS election_name,
              -- THE VERSION NAME, not the place row name. place.canonical_name is a seat-NUMBER grouping
              -- whose name comes from whichever delimitation created the row, so it can differ from the seat
              -- the contest was actually held in, and a canonical URL built from it would not resolve.
              pv.canonical_name AS place_name,
              -- The version and its place: what tells a seat whose name another seat shares from one whose name is its own.
              pv.id AS version_id, pv.place_id AS place_id,
              -- THE AUTHORITATIVE JURISDICTION AND BODY, and no migration was needed for either. The audit
              -- proposed adding candidacy.jurisdiction_id; the relation already exists through
              -- candidacy -> contest -> place_version, which is where a contest's seat is recorded.
              pv.jurisdiction_id AS jurisdiction_id, pv.kind AS place_kind,
              pv.number, pv.reservation,
              pt.short_name AS party_short_name, pt.id AS party_id,
              COALESCE(ca.symbol_id, pver.symbol_id) AS symbol_id,
              ca.status, ca.age_declared, ca.education_declared,
              r.votes, r.vote_share, r.rank, r.is_winner, r.margin,
              r.source_id AS result_source_id,
              t.electors, t.voters, t.source_id AS turnout_source_id,
              wp.id AS winner_id, wp.canonical_name AS winner_name, wpt.short_name AS winner_party
         FROM candidacy ca
         JOIN contest c ON c.id = ca.contest_id
         JOIN election e ON e.id = c.election_id
         JOIN place_version pv ON pv.id = c.place_version_id
         JOIN place pl ON pl.id = pv.place_id
         LEFT JOIN party_version pver ON pver.id = ca.party_version_id
         LEFT JOIN party pt ON pt.id = pver.party_id
         LEFT JOIN result r ON r.candidacy_id = ca.id
              AND r.revision = (SELECT MAX(r2.revision) FROM result r2 WHERE r2.candidacy_id = ca.id)
         LEFT JOIN turnout t ON t.contest_id = c.id AND t.scope = 'contest'
         -- WHO THE CONTEST WENT TO, when not to this person. By status, not by result row: 2026 has no vote counts, and
         -- one of its seats has an elected candidacy and no result row at all.
         LEFT JOIN candidacy wc ON wc.id = (SELECT MIN(w.id) FROM candidacy w
                                             WHERE w.contest_id = c.id AND w.status = 'elected' AND w.id <> ca.id)
         LEFT JOIN person wp ON wp.id = wc.person_id
         LEFT JOIN party_version wpv ON wpv.id = wc.party_version_id
         LEFT JOIN party wpt ON wpt.id = wpv.party_id
        WHERE ca.person_id = ?
        -- newest first is by YEAR, not by id (see repo/index.ts yearOf): a career spanning
        -- 'ls-2019' and 'up-assembly-2017' came back as two separately-descending runs.
        ORDER BY ${chronoDesc()}, c.id`,
      slug,
    );

    // Decided once per election, like every other surface that prints a turnout, so this page cannot give the figure a
    // seat page withholds.
    const unverified = unverifiedTurnout(db, [...new Set(cand.map((c) => c.election_id))]);

    const aff = all<{
      id: string;
      election_id: string;
      filed_on: string | null;
      source_id: string;
      assets_total: number | null;
      liabilities_total: number | null;
      movable: number | null;
      immovable: number | null;
    }>(
      db,
      `SELECT a.id, c.election_id, a.filed_on, a.source_id,
              MAX(CASE WHEN f.path = 'assets.total'           THEN f.value_numeric END) AS assets_total,
              MAX(CASE WHEN f.path = 'liabilities.total'      THEN f.value_numeric END) AS liabilities_total,
              MAX(CASE WHEN f.path = 'assets.movable.total'   THEN f.value_numeric END) AS movable,
              MAX(CASE WHEN f.path = 'assets.immovable.total' THEN f.value_numeric END) AS immovable
         FROM affidavit a
         JOIN candidacy ca ON ca.id = a.candidacy_id
         JOIN contest c ON c.id = ca.contest_id
         JOIN election e ON e.id = c.election_id
         LEFT JOIN affidavit_field f ON f.affidavit_id = a.id
        WHERE ca.person_id = ?
        GROUP BY a.id
        -- oldest first, by real chronology: election.year / polling_month / occurrence (migration 013)
        ORDER BY ${chronoAsc()}, a.filed_on, a.id`,
      slug,
    );

    // Declared pending cases are person-level claims carrying the filing vintage in as_of, not
    // affidavit_field rows — so the trail row picks up the claim with its own year. The seat a row sits for is a
    // claim too, and the same read gets it.
    const casesByYear = new Map<number, number>();
    let term: { object_value: string; as_of: string | null } | undefined;
    let termMargin: number | null = null;
    let occupation: string | null = null;
    const cabinet: string[] = [];
    for (const cl of all<{ predicate: string; object_value: string; as_of: string | null }>(
      db,
      `SELECT predicate, object_value, as_of FROM claim
        WHERE subject_ref = ?
          AND (predicate IN ('pending_cases_declared', 'mla_term', 'mla_margin_votes', 'occupation_declared')
               OR predicate LIKE 'cabinet_portfolio:%')
        ORDER BY as_of`,
      `person:${slug}`,
    )) {
      const n = Number(cl.object_value);
      if (cl.predicate === "occupation_declared") {
        try {
          const v: unknown = JSON.parse(cl.object_value);
          if (typeof v === "string" && v !== "") occupation = v;
        } catch {
          /* a claim that is not JSON is not an occupation */
        }
        continue;
      }
      if (cl.predicate.startsWith("cabinet_portfolio:")) {
        cabinet.push(cl.predicate.slice("cabinet_portfolio:".length).replace(/-/g, " "));
        continue;
      }
      if (cl.predicate === "mla_term") term = cl;
      else if (cl.predicate === "mla_margin_votes") termMargin = Number.isFinite(n) ? n : null;
      else if (Number.isFinite(n)) casesByYear.set(cl.as_of === null ? 0 : yearOf(cl.as_of), n);
    }

    const merges = all<{
      id: number;
      merged_id: string;
      score: number | null;
      decided_by: string;
      decided_at: string;
    }>(
      db,
      `SELECT id, merged_id, score, decided_by, decided_at FROM person_merge
        WHERE surviving_id = ? AND reverted_at IS NULL ORDER BY id`,
      slug,
    );

    const directIds = [
      ...cand.flatMap((c) => [c.result_source_id, c.turnout_source_id]),
      ...aff.map((a) => a.source_id),
    ].filter((id): id is string => id !== null);
    const subjectRefs = [`person:${slug}`, ...cand.map((c) => `candidacy:${c.candidacy_id}`)];
    const tied = seatTies(db);

    return {
      person: {
        id: p.id,
        canonicalName: p.canonical_name,
        names: parseNames(p.names),
        sex: p.sex,
        birthYear: p.birth_year,
        birthYearConfidence: p.birth_year_confidence,
        reviewState: p.review_state,
      },
      aliases,
      candidacies: cand.map((c) => ({
        contestId: c.contest_id,
        electionId: c.election_id,
        electionName: c.election_name,
        year: yearOf(c.election_id),
        placeName: c.place_name,
        jurisdictionId: c.jurisdiction_id,
        placeKind: c.place_kind,
        placeHref:
          c.jurisdiction_id === null || c.place_kind === null
            ? null
            : seatHref(tied, {
                versionId: c.version_id,
                placeId: c.place_id,
                stateId: c.jurisdiction_id,
                kind: c.place_kind,
                name: c.place_name,
              }),
        placeNumber: c.number,
        reservation: c.reservation,
        partyShortName: c.party_short_name,
        partyId: c.party_id,
        partySymbolRef: c.symbol_id,
        versionId: c.version_id,
        placeId: c.place_id,
        status: c.status,
        ageDeclared: c.age_declared,
        educationDeclared: c.education_declared,
        votes: counted(c.votes),
        voteShare: counted(c.vote_share),
        rank: c.rank,
        isWinner: c.is_winner === 1,
        margin: c.margin,
        wonBy:
          c.winner_id === null || c.winner_name === null
            ? null
            : { personId: c.winner_id, name: c.winner_name, partyShortName: c.winner_party },
        turnout: turnoutReading(c.voters, c.electors, unverified.has(c.election_id)),
      })),
      declared: { occupation, cabinet: [...new Set(cabinet)].sort() },
      affidavitTrail: aff.map((a) => {
        const year = yearOf(a.election_id);
        return {
          year,
          filedOn: a.filed_on,
          assetsTotal: a.assets_total,
          liabilitiesTotal: a.liabilities_total,
          movable: a.movable,
          immovable: a.immovable,
          pendingCasesDeclared: casesByYear.get(year) ?? null,
          sourceId: a.source_id,
        };
      }),
      mergeProvenance: merges.map((m) => ({
        mergeId: m.id,
        absorbedId: m.merged_id,
        score: m.score,
        decidedBy: m.decided_by,
        decidedAt: m.decided_at,
      })),
      sitting: cand.length > 0 || term === undefined ? null : sittingOf(db, tied, term, termMargin),
      sources: loadSources(db, directIds, subjectRefs),
    };
  });
}

/**
 * The seat an `mla_term` claim names, said in words, or null where the claim does not name a seat the registry has.
 * The claim's own seat id is a registry id, so its name and its address come from the newest version of that seat.
 */
function sittingOf(
  db: DatabaseSync,
  tied: ReadonlySet<number>,
  claim: { object_value: string; as_of: string | null },
  margin: number | null,
): PersonBrief["sitting"] {
  const v = ((): unknown => {
    try {
      return JSON.parse(claim.object_value);
    } catch {
      return null;
    }
  })() as { term?: unknown; placeId?: unknown; party?: unknown } | null;
  if (v === null || typeof v.term !== "string" || typeof v.placeId !== "string") return null;
  const seat = get<{ id: number; name: string; state: string | null; kind: string }>(
    db,
    `SELECT pv.id, pv.canonical_name AS name, pv.jurisdiction_id AS state, pv.kind
       FROM place_version pv JOIN boundary_epoch be ON be.id = pv.epoch_id
      WHERE pv.place_id = ? ORDER BY be.effective_from DESC, pv.id DESC LIMIT 1`,
    v.placeId,
  );
  if (seat === undefined) return null;
  return {
    term: v.term,
    placeName: seat.name,
    placeHref:
      seat.state === null
        ? null
        : seatHref(tied, { versionId: seat.id, placeId: v.placeId, stateId: seat.state, kind: seat.kind, name: seat.name }),
    party: typeof v.party === "string" && v.party !== "" ? v.party : null,
    marginVotes: margin,
    asOf: claim.as_of,
  };
}

/**
 * Name search, in two tiers, ranked.
 *
 * Tier 1 — **the name contains what you typed.** The term is transliterated to Latin first, so a
 * Bengali query substring-matches Latin records: মমতা becomes "mamata" and finds "Mamata Banerjee".
 * Tier 2 — **the name sounds like what you typed**, through the entity-resolution blocking index.
 * That is what catches Momota, Bishwas for Biswas, and Md Salim for Mohammed Salim.
 *
 * The tiers exist because the first version of this function was tier 2 alone, and using the
 * resolution blocking index as a search index is a category error that produced two visible failures
 * the moment a UI was pointed at it:
 *
 *   · `মমতা` did not find Mamata Banerjee. A one-word query emits the bare token key `mt`, while a
 *     two-word record emits `bnrj|mt`, `mtbnrj` and a surname-only `bnrj` — never a given-name-only
 *     key. There was no overlap to find, so the single most obvious query in the dataset missed.
 *   · `zzzznobody` returned a person. Under our own phonetic rules z→j and vowels drop, so
 *     "zzzznobody" and "JHUNU BAIDYA" both key to `jnbd`. A real collision, correctly produced.
 *
 * Neither is a bug in `blockingKeys`. Blocking deliberately over-collides because it buys recall and
 * a *scorer* pays for precision afterwards — and search had no scorer. `match` is that missing
 * signal, carried out to the caller so a surface can rank a sounds-like hit below a real one and say
 * which it is, rather than presenting a phonetic collision as a result.
 */
export function searchPersons(db: DatabaseSync, term: string, limit = 20): PersonRow[] {
  const keys = blockingKeys(term).filter((k) => k !== UNPARSEABLE_KEY);
  /**
   * THE TERM, WITH ITS HONORIFICS INTACT — and this is the whole defect.
   *
   * This line used to read `toLatin(normaliseName(term))`, and `normaliseName` strips leading
   * honorifics, of which `md` is one. So the term "Md Salim" arrived at the substring tier as
   * **"salim"**. Not ranked badly — MUTILATED. The tier then searched `%salim%` (280 people), and the
   * exactness tier compared against "salim", which the twelve people named literally `SALIM` satisfy
   * exactly while `MD SALIM` merely contains. The member of parliament could not out-rank a hundred
   * strangers for their own name because the name being searched for was no longer their name.
   *
   * Stripping is RIGHT for resolution and WRONG here, and the distinction is not subtle: MyNeta writes
   * "Md. Salim" where Lokdhaba writes "SALIM", so `blockingKeys` must drop the particle to make those
   * two rows one human. But `person.canonical_name` KEEPS it. The substring tier compares the query to
   * the stored display name, so it has to compare like with like.
   *
   * Recall does not suffer: a record spelled bare "SALIM" is still reached through the phonetic keys
   * (`slm`, `md|slm`, `s:slm`) above, which are built from the stripped form because that is their job.
   * The two tiers now normalise DIFFERENTLY, on purpose, because they are answering different questions.
   */
  const latin = toLatin(cleanText(term)).toLowerCase();
  // LIKE wildcards in a user term are an injection into the *pattern*, not the SQL: without this a
  // search for "%" returns the whole registry.
  const escaped = latin.replace(/[\\%_]/g, (c) => `\\${c}`);
  const like = latin.length >= 3 ? `%${escaped}%` : null;
  const prefix = `${escaped}%`;
  // `cleanText` already dropped the dots and collapsed the spaces on the QUERY side, so the equality
  // test needs no further work on the term itself. `SPELLING` below does the same to the STORED name.
  const exact = latin;
  /**
   * THE STORED NAME, PUNCTUATION AND ALL, reduced to the same shape as the query.
   *
   * ONE normalisation, used by every tier and by the WHERE clause, and having three different ones was a
   * defect that hid a person entirely rather than merely misranking them. The exact tier stripped dots
   * from the stored name; the prefix and contains tiers did not; the WHERE clause did not. So a person
   * recorded as "MD. SALIM" could score 3 on exactness and still never be SELECTED, because the row was
   * filtered out by a clause comparing "md. salim" to a pattern built from "md salim".
   *
   * Five of the seven people canonically named MD. SALIM were unreachable this way, including the one
   * with six candidacies and a parliamentary win — the most prominent exact match in the registry for
   * that name, absent from a search for it.
   *
   * SEPARATELY, and not fixable here: 497,330 of this registry's 539,020 alias rows carry a `norm_key`
   * that is not a phonetic key at all but a literal name skeleton ("0satyanarayanpaswan"), so the
   * blocking clause cannot reach them either. That is an ingest defect of its own; what it means for
   * THIS function is that the substring tier does nearly all the real work and had better be exact.
   */
  const SPELLING = (col: string) => `lower(replace(replace(${col}, '.', ''), '  ', ' '))`;
  /**
   * HOW CLOSELY a name matches, which the ranking did not measure at all.
   *
   * THE DEFECT THIS FIXES: `name_match` was a boolean, so every substring hit tied on it and prominence
   * alone decided the order. A person is not the sixty-eighth best answer to their own name, and no
   * amount of prominence weighting fixes a ranking with no notion of exactness in it.
   *
   * 3 exact · 2 starts with · 1 contains · 0 phonetic only.
   *
   * ── WHY THERE IS NO SEPARATE CANONICAL-vs-ALIAS TIER ──
   *
   * A finer hierarchy suggests itself: canonical exact, then canonical prefix, then alias exact, and so
   * on, so a person's real identity beats an alias collision. Measured against this registry, that
   * hierarchy is DEAD SQL. For every term tried — "md salim", "mamata banerjee", "narendra modi",
   * "mohammed salim" — the number of people holding an exactly-matching ALIAS but no exactly-matching
   * CANONICAL name is ZERO, because ingest writes the canonical spelling into `person_alias` as well.
   * The two sets are identical, so a tier separating them can never reorder anything. It would be four
   * more CASE branches that look like precision and buy none, so the tiers read both name sources
   * together and prominence breaks ties inside a tier.
   */
  const closenessSql =
    `(SELECT MAX(CASE
                   WHEN a5.n = ? THEN 3
                   WHEN a5.n LIKE ? ESCAPE '\\' THEN 2` +
    (like === null ? "" : `
                   WHEN a5.n LIKE ? ESCAPE '\\' THEN 1`) +
    `
                   ELSE 0 END)
        FROM (SELECT ${SPELLING("name")} AS n FROM person_alias WHERE person_id = p.id
              UNION ALL
              -- THE PERSON'S OWN DISPLAY NAME, which neither tier consulted. A name a surface will
              -- actually print is a name a search has to match.
              SELECT ${SPELLING("p.canonical_name")} AS n) a5)`;

  if (keys.length === 0 && like === null) return [];
  // A term with no phonetic key still gets its substring tier, and vice versa, so neither branch may
  // assume the other produced anything.
  //
  // Aliases only. A person whose CANONICAL name matches while no alias does would be missed — measured
  // across "md salim", "mamata banerjee", "salim" and "banerjee", that set is empty, because ingest
  // mirrors the canonical spelling into the alias table. Scanning `person` as well would be a second
  // full pass to find nobody.
  //
  // BOTH TIERS IN ONE SUBQUERY, because two IN-lists OR'd in the WHERE were each computed twice, and the contains
  // test cannot use an index, so each computation is a scan of the whole alias table (539,020 rows in the full registry).
  const aliasClause = [
    keys.length > 0 ? `norm_key IN (${marks(keys.length)})` : null,
    like === null ? null : `${SPELLING("name")} LIKE ? ESCAPE '\\'`,
  ]
    .filter((c) => c !== null)
    .join(" OR ");

  return read(() =>
    all<PersonListSql>(
      db,
      // TWO PHASES. `hits` ranks and cuts to the limit on columns that are cheap for one person; only then is the
      // latest candidacy read, and for those few. It used to be a window over every candidacy in the registry,
      // computed before the LIMIT, whatever the term. MATERIALIZED, or sqlite inlines `hits` into the IN below and
      // runs the whole match a second time.
      `WITH hits AS MATERIALIZED (
         SELECT p.id, p.canonical_name, p.sex, p.review_state,
                (SELECT COUNT(*) FROM candidacy x WHERE x.person_id = p.id) AS candidacy_count,
                (SELECT a.source_id FROM person_alias a
                   WHERE a.person_id = p.id AND a.source_id IS NOT NULL
                   ORDER BY a.source_id LIMIT 1) AS name_source_id,
                (SELECT MAX(r4.is_winner) FROM candidacy c4
                   JOIN result r4 ON r4.candidacy_id = c4.id AND r4.revision = 0
                  WHERE c4.person_id = p.id) AS ever_won,
                ${closenessSql} AS closeness
           FROM person p
          WHERE p.id IN (SELECT person_id FROM person_alias WHERE ${aliasClause})
          ORDER BY closeness DESC,
                   -- Prominence, as far as this registry can honestly measure it. "Has ever won a
                   -- seat" is stable; "won the most recent one" is not — Mamata Banerjee did not win
                   -- her latest recorded contest, so ranking on that pushed a winning namesake above
                   -- the Chief Minister. There is no attention or news signal here, so no better
                   -- proxy exists, and ties fall to a deterministic case-insensitive name order
                   -- rather than to whatever order sqlite happened to scan.
                   ever_won DESC,
                   candidacy_count DESC,
                   lower(p.canonical_name),
                   p.id
          LIMIT ?)
       SELECT h.id, h.canonical_name, h.sex, h.review_state, h.candidacy_count, h.name_source_id, h.ever_won,
              h.closeness,
              latest.election_id, latest.place_name, latest.party_short_name,
              latest.status, latest.winner_name, latest.votes, latest.vote_share, latest.is_winner,
              latest.result_source_id
         FROM hits h
         LEFT JOIN (
           SELECT ca.person_id, c.election_id, pl.canonical_name AS place_name,
                  pt.short_name AS party_short_name, ca.status, wp.canonical_name AS winner_name,
                  r.votes, r.vote_share, r.is_winner, r.source_id AS result_source_id,
                  ROW_NUMBER() OVER (PARTITION BY ca.person_id
                                     ORDER BY ${chronoDesc()}, c.id) AS rn
             FROM candidacy ca
             JOIN contest c ON c.id = ca.contest_id
             JOIN election e ON e.id = c.election_id
             JOIN place_version pv ON pv.id = c.place_version_id
             JOIN place pl ON pl.id = pv.place_id
             LEFT JOIN party_version pver ON pver.id = ca.party_version_id
             LEFT JOIN party pt ON pt.id = pver.party_id
             LEFT JOIN result r ON r.candidacy_id = ca.id AND r.revision = 0
             -- Who the contest went to, when not to this person (getPersonBrief reads it the same way).
             LEFT JOIN candidacy wc ON wc.id = (SELECT MIN(w.id) FROM candidacy w
                                                 WHERE w.contest_id = c.id AND w.status = 'elected' AND w.id <> ca.id)
             LEFT JOIN person wp ON wp.id = wc.person_id
            WHERE ca.person_id IN (SELECT id FROM hits)
         ) latest ON latest.person_id = h.id AND latest.rn = 1
        ORDER BY h.closeness DESC, h.ever_won DESC, h.candidacy_count DESC, lower(h.canonical_name), h.id`,
      // Bind order follows the SELECT, then the WHERE, then the LIMIT.
      // closeness: exact form, prefix pattern, and the contains pattern (only when there is one).
      exact,
      prefix,
      ...(like === null ? [] : [like]),
      ...keys,
      ...(like === null ? [] : [like]),
      Math.min(Math.max(limit, 1), 200),
    ).map(toPersonRow),
  );
}

type PersonListSql = {
  id: string;
  canonical_name: string;
  sex: Sex | null;
  review_state: ReviewState;
  candidacy_count: number;
  election_id: string | null;
  place_name: string | null;
  jurisdiction_id: string | null;
  place_kind: string | null;
  party_short_name: string | null;
  status: CandidacyStatus | null;
  winner_name: string | null;
  votes: number | null;
  vote_share: number | null;
  is_winner: number | null;
  result_source_id: string | null;
  name_source_id: string | null;
  /**
   * How closely a recorded name matches the search term: 3 exact · 2 prefix · 1 contains · 0 phonetic
   * only. Absent for non-search callers, who have no term to be close to.
   *
   * THE SINGLE SIGNAL, and it used to be two. There was also a boolean `name_match`, which decided the
   * `match` LABEL and sorted AHEAD of closeness — computed by a separate subquery that did not strip
   * dots. So "MD. SALIM" scored closeness 3 and name_match 0, and the row was both ranked below
   * "MD SALIM MANSURI" (closeness 1, name_match 1) and labelled a phonetic guess. Two measures of the
   * same thing will disagree eventually; deriving the label from the ranking key makes it impossible.
   */
  closeness?: number | null;
};

function toPersonRow(r: PersonListSql): PersonRow {
  return {
    id: r.id,
    canonicalName: r.canonical_name,
    sex: r.sex,
    reviewState: r.review_state,
    latestElectionId: r.election_id,
    latestYear: r.election_id === null ? null : yearOf(r.election_id),
    latestPlaceName: r.place_name,
    latestPartyShortName: r.party_short_name,
    latestStatus: r.status,
    latestWonBy: r.winner_name,
    latestVotes: counted(r.votes),
    latestVoteShare: counted(r.vote_share),
    isWinner: r.is_winner === 1,
    candidacyCount: r.candidacy_count,
    sourceId: r.result_source_id ?? r.name_source_id,
    // Only search measures closeness; a brief row leaves `match` undefined rather than claiming a tier.
    // Any closeness above zero means a real name matched. Zero means ONLY the phonetic index fired,
    // which is a suggestion and must arrive labelled as one.
    ...(r.closeness === undefined || r.closeness === null
      ? {}
      : { match: r.closeness > 0 ? ("name" as const) : ("sounds-like" as const) }),
  };
}

/**
 * A counted figure, or null when nothing was counted. The 2026 import writes votes = 0 and
 * vote_share = 0 for all 293 declared seats it never got counts for, so a 0 here means "not
 * reported", and publishing "0 votes" for a sitting winner would be a lie. Mapped once, in the
 * repo, so the API and the page cannot disagree about the same row.
 * ponytail: registry-wide rule keyed on the value, not on the election — revisit the day a real
 * zero-vote result is ingested (no candidate in this corpus has ever polled 0).
 */
export function counted(n: number | null): number | null {
  return n === null || n === 0 ? null : n;
}

export function parseNames(json: string): Names {
  try {
    const v: unknown = JSON.parse(json);
    return typeof v === "object" && v !== null ? (v as Names) : {};
  } catch {
    return {};
  }
}

export function pct(part: number | null, whole: number | null): number | null {
  if (part === null || whole === null || whole === 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

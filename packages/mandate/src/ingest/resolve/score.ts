/**
 * §12 stage 2 — SCORING.
 *
 * PRECISION LIVES HERE. block.ts deliberately over-collapses, so every rejection this product
 * needs has to be made by this file. The score is a weighted sum of six features, five of which
 * are normalised weights summing to 1.0 and one (shared identifiers) which is a bonus only —
 * because in this corpus every candidate has a *different* myneta_id per election, so a
 * non-match on identifiers is the normal case and must never be evidence against.
 *
 * Age is the only feature that can be NEGATIVE. Two candidacies five years apart should show
 * about five years of ageing; twenty years of divergence is affirmative evidence that these are
 * two humans (a father and a son with one name, which this corpus contains), not merely weak
 * evidence for one.
 *
 * The feature vector is returned with the score and stored verbatim in person_merge.evidence.
 * An unexplainable merge is worthless the day a politician disputes their profile (§21 F8).
 */

import type { DatabaseSync } from "node:sqlite";
import { all } from "../../db/index.ts";
import type { PersonRec } from "./block.ts";

export type Features = {
  /** The hard negative. True => score is 0, whatever every other feature says. */
  sameContest: boolean;
  /** The contest that collided, for the audit trail. */
  sameContestId: string | null;
  /** Some alias pair has an IDENTICAL phoneticKey. The strongest name evidence there is. */
  phoneticEqual: boolean;
  /** Weaker: one phoneticKey properly contains the other — a dropped token, not the same name. */
  keyContained: boolean;
  /** Best Jaro-Winkler over the alias cross product, on the Latin form and on the phonetic key. */
  nameSim: number;
  /** Smallest unexplained divergence in implied birth year (election year - declared age). */
  ageResidual: number | null;
  /** Age feature value in [-1, 1]. Negative when the residual is large. */
  ageScore: number;
  /** Jaccard over contested constituencies. */
  constituencyOverlap: number;
  /** Jaccard over parties, after collapsing party_lineage split/merge/rename edges. */
  partyOverlap: number;
  /** How many identifiers (myneta id, affidavit url) the two share. */
  sharedIds: number;
};

export type Scored = { score: number; features: Features };

/** Weights over the five always-applicable features. They sum to exactly 1.0 by construction. */
export const WEIGHTS = {
  name: 0.45,
  phonetic: 0.10,
  constituency: 0.18,
  party: 0.12,
  age: 0.15,
} as const;

/** Shared-identifier bonus, added outside the normalised sum. See the header. */
export const ID_BONUS = 0.12;

/**
 * Years of unexplained ageing past which no pair may auto-merge, whatever else agrees. A declared
 * age drifts by a year or two between sources routinely; fifteen is not drift.
 */
export const AGE_HARD_LIMIT = 15;

/** The score ceiling imposed when ageResidual > AGE_HARD_LIMIT: below any sane autoMergeAt. */
export const AGE_CAPPED_SCORE = 0.60;

/**
 * The score ceiling imposed when age is UNOBSERVABLE for the pair. Above autoMergeAt on purpose —
 * this is not a refusal, it is a refusal to publish 1.0 on evidence that has a hole in it.
 */
export const AGE_UNOBSERVED_CEILING = 0.95;

/**
 * Jaro-Winkler, on characters. ~25 lines and no dependency. Chosen over plain Levenshtein because
 * the prefix bonus is exactly right for Indic transliteration variance, which concentrates in the
 * tail ("Bandyopadhyay" / "Banerjee" share "ban").
 */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return a === "" ? 0 : 1;
  if (a.length === 0 || b.length === 0) return 0;
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const matchedA = new Array<boolean>(a.length).fill(false);
  const matchedB = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i += 1) {
    const lo = Math.max(0, i - window);
    const hi = Math.min(b.length - 1, i + window);
    for (let j = lo; j <= hi; j += 1) {
      if (matchedB[j] === true || a[i] !== b[j]) continue;
      matchedA[i] = true;
      matchedB[j] = true;
      matches += 1;
      break;
    }
  }
  if (matches === 0) return 0;
  let k = 0;
  let transpositions = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (matchedA[i] !== true) continue;
    while (matchedB[k] !== true) k += 1;
    if (a[i] !== b[k]) transpositions += 1;
    k += 1;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix += 1;
  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Union-find over string keys, shared by loadPartyClasses and resolve/index.ts's components().
 * Roots are chosen by sort order, which is what makes the class representative deterministic.
 */
export function unionFind(): { find: (x: string) => string; union: (x: string, y: string) => void; keys: () => IterableIterator<string> } {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = parent.get(x) ?? x;
    while (root !== (parent.get(root) ?? root)) root = parent.get(root) ?? root;
    parent.set(x, root);
    return root;
  };
  return {
    find,
    union: (x: string, y: string): void => {
      const [a, b] = [find(x), find(y)].sort() as [string, string];
      if (a !== b) parent.set(b, a);
    },
    keys: () => parent.keys(),
  };
}

/**
 * Party equivalence classes from party_lineage. A split, merge or rename EXPLAINS a party change
 * and must not penalise: the same human in the Shiv Sena of 2019 and one of the two Shiv Senas of
 * 2024 has not switched sides. derecognition and symbol_transfer are not identity edges and are
 * excluded — a party losing recognition does not make it a different party's member.
 *
 * Independents map to NO_PARTY, not to a class of their own. Every independent candidacy in this
 * corpus points at the single 'IND' party row, so a Jaccard over classes returned 1.0 for two
 * unrelated independents and manufactured 0.12 of their score. "No affiliation" is an UNOBSERVED
 * feature, not a shared one — the same treatment this module already gives an unobserved age.
 * ponytail: one union-find pass, no transitive closure table — party_lineage has tens of rows.
 */
export const NO_PARTY = "";

export function loadPartyClasses(db: DatabaseSync): Map<string, string> {
  const { find, union, keys } = unionFind();
  for (const r of all<{ from_party_id: string; to_party_id: string }>(
    db,
    "SELECT from_party_id, to_party_id FROM party_lineage WHERE kind IN ('split','merge','rename')",
  )) {
    union(r.from_party_id, r.to_party_id);
  }
  const classes = new Map<string, string>();
  for (const k of keys()) classes.set(k, find(k));
  for (const r of all<{ id: string }>(db, "SELECT id FROM party WHERE kind = 'independent'")) {
    classes.set(r.id, NO_PARTY);
  }
  return classes;
}

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const x of a) if (b.has(x)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * Proper containment, anchored at TOKEN boundaries: every token of the shorter name's key list is
 * also a token of the longer one's. "NARMADA CHANDRA" [nrmd, kndr] inside "NARMADA CHANDRA ROY"
 * [nrmd, kndr, r] — one record dropped a token the other kept.
 *
 * Held apart from key EQUALITY on purpose: "Abdul Karim" and "Abdul Karim Chowdhary" are a
 * containment match, and treating that as equality auto-merged them on the real corpus.
 *
 * Anchored, because an unanchored substring test on the CONCATENATED key crosses token boundaries:
 * phoneticKey("Keya Biswas") = "kbsbs" is a raw substring of phoneticKey("ANCHHARUL HAQUE BISWAS")
 * = "ankhrlhkbsbs", which forced nameSim to 0.85 for two unrelated people who happened to contest
 * the same seat. 556 such pairs were in the review queue.
 */
function containsKey(a: readonly string[][], b: readonly string[][]): boolean {
  const sub = (x: readonly string[], y: readonly string[]): boolean => {
    if (x.length >= y.length) return false;
    if (x.join("").length < 3) return false;   // "Roy" -> ["r"] must not be "contained" in everything
    const pool = [...y];
    for (const t of x) {
      const at = pool.indexOf(t);
      if (at === -1) return false;
      pool.splice(at, 1);
    }
    return true;
  };
  for (const x of a) for (const y of b) if (sub(x, y) || sub(y, x)) return true;
  return false;
}

/**
 * Some alias pair reduces to the same MULTISET of token keys. "Md. Salim" and "Mohammed Salim"
 * both do, and so do "SK IBRAHIM ALI" and "Ibrahim Ali Sk" — the token lists are sorted, because
 * Lokdhaba writes surname-first and MyNeta given-name-first.
 *
 * Compared per token, never on the concatenated key: over the 6,307 distinct names in this corpus
 * 1,046 pairs share a concatenated phoneticKey and 14 of them are different people, because the
 * concatenation loses the boundaries — "Abai Dullah" [ab|dlh] and "Abdul Hai" [abdl|h] both
 * flatten to "abdlh" and reached the queue with a PERFECT name score.
 */
function equalKey(a: readonly string[][], b: readonly string[][]): boolean {
  const bs = new Set(b.map((t) => t.join("|")));
  for (const x of a) if (bs.has(x.join("|"))) return true;
  return false;
}

/** nameSim floor per name-evidence tier, and the weight the phonetic term gets. */
export const KEY_EQUAL_SIM = 1;
export const KEY_CONTAINED_SIM = 0.85;

function ageScoreOf(residual: number | null): number {
  if (residual === null) return 0;
  if (residual <= 2) return 1;
  if (residual <= 5) return 0.5;
  if (residual <= 10) return 0;
  return -Math.min(1, (residual - 10) / 10);
}

/**
 * Score one pair. `partyClasses` comes from loadPartyClasses(db) once per run, not per pair.
 * Deterministic: a pure function of the two records and the lineage map.
 */
export function scorePair(a: PersonRec, b: PersonRec, partyClasses: ReadonlyMap<string, string>): Scored {
  // ── the hard negative, before anything else runs ──────────────────────────
  // Two DISTINCT candidacies in one contest are two humans. candidacy's UNIQUE (contest_id,
  // person_id) exists partly to make this checkable. No name score can outvote it because no
  // name score is ever computed.
  const bContests = new Set(b.cands.map((c) => c.contestId));
  const collision = a.cands.find((c) => bContests.has(c.contestId));
  if (collision !== undefined) {
    return {
      score: 0,
      features: {
        sameContest: true,
        sameContestId: collision.contestId,
        phoneticEqual: false,
        keyContained: false,
        nameSim: 0,
        ageResidual: null,
        ageScore: 0,
        constituencyOverlap: 0,
        partyOverlap: 0,
        sharedIds: 0,
      },
    };
  }

  // ── name ─────────────────────────────────────────────────────────────────
  let nameSim = 0;
  for (const la of a.latin) {
    for (const lb of b.latin) {
      nameSim = Math.max(nameSim, jaroWinkler(la, lb));
      // Token-sorted, because Lokdhaba writes surname-first and MyNeta given-name-first.
      const sa = la.split(/[\s-]+/u).sort().join(" ");
      const sb = lb.split(/[\s-]+/u).sort().join(" ");
      nameSim = Math.max(nameSim, jaroWinkler(sa, sb));
    }
  }
  // On the SEPARATED key, for the same reason equalKey is: jaroWinkler("abdlh", "abdlh") is 1, and
  // "Abai Dullah" and "Abdul Hai" both concatenate to "abdlh". Comparing "ab|dlh" with "abdl|h"
  // keeps the perfect score for names that really are the same.
  for (const ka of a.tokenKeys) {
    for (const kb of b.tokenKeys) nameSim = Math.max(nameSim, jaroWinkler(ka.join("|"), kb.join("|")));
  }
  const phoneticEqual = equalKey(a.tokenKeys, b.tokenKeys);
  const keyContained = !phoneticEqual && containsKey(a.tokenKeys, b.tokenKeys);
  // ASSIGNED, not Math.max'd: the containment tier is one evidence class and has to be decided
  // uniformly. Letting jaroWinkler win inside it made the decision a function of SURNAME LENGTH —
  // "NARMADA CHANDRA"/"NARMADA CHANDRA ROY" merged at 0.9294 while "ABDUL KHALEQUE"/"ABDUL KHALEQUE
  // MOLLA", same seat, same party, identical feature vector, was queued at 0.9176.
  if (phoneticEqual) nameSim = Math.max(nameSim, KEY_EQUAL_SIM);
  else if (keyContained) nameSim = KEY_CONTAINED_SIM;
  // Half credit for containment: something really is missing from one of the two records.
  const phoneticTerm = phoneticEqual ? 1 : keyContained ? 0.5 : 0;

  // ── age: implied birth year = election year - declared age ────────────────
  let ageResidual: number | null = null;
  for (const ca of a.cands) {
    if (ca.age === null || ca.year === 0) continue;
    for (const cb of b.cands) {
      if (cb.age === null || cb.year === 0) continue;
      const r = Math.abs(ca.year - ca.age - (cb.year - cb.age));
      ageResidual = ageResidual === null ? r : Math.min(ageResidual, r);
    }
  }
  const ageScore = ageScoreOf(ageResidual);

  // ── history overlap ──────────────────────────────────────────────────────
  // Candidacies AND claimed terms: a sitting MLA row asserts a seat and a party without holding a
  // candidacy, and that assertion is exactly as good a corroboration of a name match.
  const places = (p: PersonRec): Set<string> =>
    new Set([...p.cands.map((c) => c.placeId), ...p.terms.flatMap((t) => (t.placeId === null ? [] : [t.placeId]))]);
  const cls = (p: string): string => partyClasses.get(p) ?? p;
  const parties = (p: PersonRec): Set<string> =>
    new Set(
      [...p.cands.map((c) => c.partyId), ...p.terms.map((t) => t.partyId)].flatMap((id) =>
        id === null || cls(id) === NO_PARTY ? [] : [cls(id)],
      ),
    );
  const constituencyOverlap = jaccard(places(a), places(b));
  const partyOverlap = jaccard(parties(a), parties(b));

  // ── shared identifiers ───────────────────────────────────────────────────
  let sharedIds = 0;
  for (const id of a.identifiers) if (b.identifiers.has(id)) sharedIds += 1;

  const raw =
    WEIGHTS.name * nameSim +
    WEIGHTS.phonetic * phoneticTerm +
    WEIGHTS.constituency * constituencyOverlap +
    WEIGHTS.party * partyOverlap +
    WEIGHTS.age * ageScore;
  // Age is the one feature that can be UNOBSERVABLE: this corpus only carries age_declared on
  // affidavit-sourced candidacies, so a duplicate whose other half came from a results file has no
  // age at all. An unobserved feature is not evidence against, so its weight is redistributed over
  // the features that were observed rather than counted as a zero. (Same reasoning as ID_BONUS
  // living outside the sum: a non-matching myneta id is the normal case here, not a signal.)
  const observedWeight = ageResidual === null ? 1 - WEIGHTS.age : 1;
  let score = Math.min(1, Math.max(0, raw / observedWeight + ID_BONUS * Math.min(1, sharedIds)));
  // Redistributing the age weight must not be able to publish 1.0. On this corpus age_declared
  // exists only on 2026 affidavit candidacies and two 2026 candidacies for one person are a
  // same-contest hard negative, so ageResidual is null for EVERY pair that can merge — which made
  // (phoneticEqual + constituency 1 + party 1) / 0.85 come out at exactly 1.0 and published 927
  // merges as "certain" on three agreeing features with the only negative one unobservable.
  // "Nothing contradicts this" is not "these are the same human"; the ceiling says so, and
  // ageResidual null in the stored evidence vector is what an audit counts it by.
  if (ageResidual === null) score = Math.min(score, AGE_UNOBSERVED_CEILING);
  if (ageResidual !== null && ageResidual > AGE_HARD_LIMIT) score = Math.min(score, AGE_CAPPED_SCORE);

  return {
    score: Number(score.toFixed(4)),
    features: {
      sameContest: false,
      sameContestId: null,
      phoneticEqual,
      keyContained,
      nameSim: Number(nameSim.toFixed(4)),
      ageResidual,
      ageScore,
      constituencyOverlap: Number(constituencyOverlap.toFixed(4)),
      partyOverlap: Number(partyOverlap.toFixed(4)),
      sharedIds,
    },
  };
}

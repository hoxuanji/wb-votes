export type Reservation = 'General' | 'SC' | 'ST';
export type Gender = 'Male' | 'Female' | 'Other';
export type Language = 'en' | 'bn';

export interface Constituency {
  id: string;
  name: string;
  nameBn: string;
  district: string;
  districtBn: string;
  reservation: Reservation;
  totalVoters?: number;
  assemblyNumber: number;
}

export interface Party {
  id: string;
  name: string;
  nameBn: string;
  abbreviation: string;
  color: string;
  isNational: boolean;
  symbolUrl?: string;
}

export interface Candidate {
  id: string;
  name: string;
  nameBn?: string;
  partyId: string;
  constituencyId: string;
  photoUrl?: string;
  age: number;
  gender?: Gender;
  education: string;
  educationBn?: string;
  criminalCases: number;
  criminalCasesDetail?: string;
  totalAssets: number;       // in INR
  totalLiabilities: number;  // in INR
  movableAssets?: number;
  immovableAssets?: number;
  affidavitUrl?: string;
  occupation?: string;
  occupationBn?: string;
  spouseProfession?: string;
  incumbentYears?: number;
  isIncumbent: boolean;
}

export interface CandidateWithRelations extends Candidate {
  party: Party;
  constituency: Constituency;
}

export interface QuizQuestion {
  id: string;
  question: string;
  questionBn: string;
  category: string;
  categoryBn: string;
  options: QuizOption[];
}

export interface QuizOption {
  id: string;
  text: string;
  textBn: string;
  partyWeights: Record<string, number>; // partyId -> weight 0-10
}

export interface QuizAnswer {
  questionId: string;
  optionId: string;
}

export interface PartyAlignmentResult {
  partyId: string;
  partyName: string;
  partyAbbr: string;
  score: number; // 0-100
  color: string;
  symbolUrl?: string;
}

export interface QuizSession {
  id: string;
  constituencyId?: string;
  answers: QuizAnswer[];
  results?: PartyAlignmentResult[];
  createdAt: string;
}

export interface CompareSelection {
  candidateIds: string[];
}

export interface PageProps {
  params: { id: string };
  searchParams?: Record<string, string | string[]>;
}

export interface ScoreBreakdown {
  finalScore: number;
  partyScore: number;
  integrityScore: number;
  penaltyReasons: string[];
  bonusReasons: string[];
}

export interface FunFact {
  id: string;
  icon: string;
  headline: string;
  detail: string;
  category: string;
  shareText: string;
}

export interface ConstituencyInsightStats {
  totalCandidates: number;
  withCriminalCases: number;
  avgAssets: number;
  medianAssets: number;
  educationBreakdown: Record<string, number>;
  genderBreakdown: { Male: number; Female: number; Other: number };
  dataQualityScore: number;
}

export type ElectionYear = 2011 | 2016 | 2021 | 2026;

export interface HistoricalContestant {
  name: string;
  partyId: string;
  partyAbbr: string;
  votes: number;
  voteShare: number;
}

export interface HistoricalACResult {
  constituencyId: string;
  year: ElectionYear;
  winner: HistoricalContestant;
  runnerUp?: HistoricalContestant;
  topContestants?: HistoricalContestant[];
  turnoutPct: number;
  marginVotes: number;
  marginPct: number;
  totalVotes: number;
  totalElectors?: number;
}

export interface ACDemographics {
  constituencyId: string;
  population?: number;
  literacyRate?: number;
  sexRatio?: number;
  scPct?: number;
  stPct?: number;
  urbanPct?: number;
  sourceYear: number;
  sourceNote?: string;
}

export interface MLARecord {
  candidateId: string;
  constituencyId: string;
  term: '2021-2026' | '2026-2031';
  attendancePct?: number;
  questionsAsked?: number;
  billsIntroduced?: number;
  debatesParticipated?: number;
  mpladsSpending?: number;
  /** Ministerial portfolios held during this term, if any. Cabinet ministers only. */
  ministryPortfolios?: MinistryPortfolio[];
  lastUpdated: string;
  sourceUrl?: string;
}

export type MinistryRank = 'CM' | 'Cabinet' | 'MoS-Independent' | 'MoS';

export interface MinistryPortfolio {
  /** Human-readable ministry name, e.g. "Finance", "Health & Family Welfare". */
  ministry: string;
  rank: MinistryRank;
  /** ISO date the portfolio began. */
  from: string;
  /** ISO date the portfolio ended. Undefined = currently held. */
  to?: string;
  sourceUrl?: string;
}

export interface CabinetMember {
  /** Slug, e.g. "mamata-banerjee". */
  id: string;
  name: string;
  nameBn?: string;
  /** Party id matching `parties.ts`. */
  partyId: string;
  /** Optional — some ministers are MLCs or non-MLAs. */
  constituencyId?: string;
  /** Constituency centroid for map markers. Optional. */
  lat?: number;
  lng?: number;
  photoUrl?: string;
  portfolios: MinistryPortfolio[];
  /** ISO date of cabinet induction (latest swearing-in). */
  inducted: string;
  /** 1-2 sentence summary. Optional. */
  bio?: string;
  /** Authoritative source for this entry — wb.gov.in / news article. Required. */
  sourceUrl: string;
}

/**
 * Sitting MLA for the current term — read from `src/data/current-mla.ts`.
 * Distinct from `MLARecord` (which holds performance stats per term).
 *
 * Use this instead of historical results when displaying "the current MLA"
 * on a constituency, since 2026 winners may not be backfilled into
 * `historical-results.ts` yet.
 */
export interface CurrentMLA {
  constituencyId: string;
  name: string;
  partyId: string;
  term: '2021-2026' | '2026-2031';
  /** Margin in votes, when known. */
  marginVotes: number | null;
  /** Vote share %, when known. */
  voteShare: number | null;
  /** Candidate id from `candidates.ts`, when matched. Null until linked. */
  candidateId: string | null;
  sourceUrl: string;
}



export interface WBMP {
  /** Slug, e.g. "abhishek-banerjee". */
  id: string;
  name: string;
  partyId: string;
  /** Official LS constituency name, matching the key in the AC→LS map. */
  lsConstituency: string;
  /** LS constituency number (1-42 within WB). */
  lsNumber: number;
  /** Majority / margin of victory in votes. */
  margin: number;
  /** ISO date of election (2024-06-04 for general). */
  electedOn: string;
  photoUrl?: string;
  sourceUrl: string;
}

/** Lok Sabha performance stats per MP per term — from PRS India. */
export interface WBMPRecord {
  mpId: string;
  term: '2024-2029';
  attendancePct: number | null;
  questionsAsked: number | null;
  debatesParticipated: number | null;
  billsIntroduced: number | null;
  lastUpdated: string;
  sourceUrl: string;
}

export type CivicReportCategory =
  | 'road'
  | 'water'
  | 'electricity'
  | 'health'
  | 'education'
  | 'corruption'
  | 'safety'
  | 'environment'
  | 'other';

export interface CivicReport {
  id?: string;
  constituencyId: string;
  category: CivicReportCategory;
  description: string;
  /** Optional — address or landmark. Never store personal info. */
  location?: string;
  /** ISO date of submission. */
  submittedAt: string;
}

export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IssueSource   = 'citizen' | 'news' | 'ngo';

/**
 * A seeded or citizen-reported civic issue per constituency.
 * Returned by GET /api/reports — only real citizen submissions from Supabase.
 */
export interface SeedCivicIssue {
  id: string;
  constituencyId: string;
  category: CivicReportCategory;
  severity: IssueSeverity;
  title: string;
  description: string;
  /** Ward, area, or landmark — no personal info. */
  location?: string;
  /** ISO date. */
  reportedOn: string;
  status: 'pending' | 'reviewed' | 'resolved';
  source: IssueSource;
  sourceUrl?: string;
}

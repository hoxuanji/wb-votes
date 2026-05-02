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
  lastUpdated: string;
  sourceUrl?: string;
}

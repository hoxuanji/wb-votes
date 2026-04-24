// Historical context per major party — documented public record sources
// All figures from ECI, ADR (Association for Democratic Reforms), CBI/ED press releases, NHRC reports

export interface PartyContextEntry {
  partyId: string;
  fullName: string;
  wbPresence: string;
  distinctiveFact: string;
  distinctiveFactType: 'positive' | 'negative' | 'neutral';
  notableIssues: Array<{
    year: number;
    title: string;
    summary: string;
    leaders?: string[]; // named leaders implicated/involved (public record)
  }>;
}

export const partyContext: PartyContextEntry[] = [
  {
    partyId: 'AITC',
    fullName: 'All India Trinamool Congress',
    wbPresence: 'Ruling party since 2011',
    distinctiveFact: "WB's ruling party received \u20b91,610 Cr in anonymous electoral bonds — 2nd highest among Bengal-based parties.",
    distinctiveFactType: 'negative',
    notableIssues: [
      {
        year: 2013,
        title: 'Saradha Chit Fund Collapse',
        summary: "CBI investigated alleged links between Saradha Group's \u20b92,500+ Cr fraud and TMC leaders. Several party figures questioned.",
        leaders: ['Mukul Roy', 'Madan Mitra', 'Sudip Bandyopadhyay'],
      },
      {
        year: 2016,
        title: 'Narada Sting Operation',
        summary: 'Video footage showed senior TMC ministers and MPs allegedly accepting cash. CBI filed charge sheet.',
        leaders: ['Firhad Hakim', 'Madan Mitra', 'Subrata Mukherjee', 'Sovan Chatterjee'],
      },
      {
        year: 2022,
        title: 'School Jobs Scam',
        summary: "\u20b950 Cr+ in cash and assets seized from ED-arrested minister's associate. WB SSC implicated.",
        leaders: ['Partha Chatterjee', 'Manik Bhattacharya'],
      },
    ],
  },
  {
    partyId: 'BJP',
    fullName: 'Bharatiya Janata Party',
    wbPresence: 'Main opposition since 2019',
    distinctiveFact: 'Received \u20b96,061 Cr in electoral bonds nationally (2018\u20132024) \u2014 the highest share of any party, ~56% of disclosed total.',
    distinctiveFactType: 'negative',
    notableIssues: [
      {
        year: 2024,
        title: 'Electoral Bond Dominance',
        summary: 'Supreme Court-ordered disclosure showed BJP received \u20b96,061 Cr \u2014 more than all other parties combined \u2014 in anonymous corporate bonds.',
        leaders: ['National leadership'],
      },
      {
        year: 2021,
        title: 'Post-election Violence Allegations',
        summary: 'NHRC reported allegations of post-poll violence after the 2021 WB election implicating both BJP and TMC cadres.',
        leaders: ['Dilip Ghosh', 'Suvendu Adhikari'],
      },
      {
        year: 2023,
        title: 'WB Leader Defections',
        summary: "Multiple high-profile BJP MLAs returned to TMC, raising questions about the party's organisational stability in Bengal.",
        leaders: ['Mukul Roy', 'Babul Supriyo', 'Sisir Adhikari'],
      },
    ],
  },
  {
    partyId: 'CPI(M)',
    fullName: 'Communist Party of India (Marxist)',
    wbPresence: 'Ruled WB 1977\u20132011 (34 years); now opposition',
    distinctiveFact: 'Only major party to officially refuse electoral bonds on principle. Received \u20b90 in anonymous corporate funding.',
    distinctiveFactType: 'positive',
    notableIssues: [
      {
        year: 2007,
        title: 'Nandigram Land Acquisition',
        summary: 'NHRC and SC took cognisance of police firing on protesters opposing SEZ land acquisition.',
        leaders: ['Buddhadeb Bhattacharya', 'Lakshman Seth'],
      },
      {
        year: 2011,
        title: 'Singur & Tata Nano Fallout',
        summary: "Forced land acquisition for Tata Motors plant became a flashpoint that contributed to TMC's 2011 landslide.",
        leaders: ['Buddhadeb Bhattacharya', 'Nirupam Sen'],
      },
      {
        year: 2024,
        title: 'Electoral Bond Refusal',
        summary: 'CPI(M) publicly opposed the electoral bond scheme and accepted zero bonds \u2014 a consistent anti-corruption stance.',
        leaders: [],
      },
    ],
  },
  {
    partyId: 'INC',
    fullName: 'Indian National Congress',
    wbPresence: 'Minor player; INDIA bloc ally with Left Front',
    distinctiveFact: 'Received \u20b91,123 Cr in electoral bonds nationally. WB presence limited; contesting select seats with Left Front.',
    distinctiveFactType: 'neutral',
    notableIssues: [
      {
        year: 2008,
        title: '2G Spectrum Scam',
        summary: 'CAG estimated \u20b91.76 lakh Cr in "presumptive loss" under UPA. Several ministers chargesheeted by CBI.',
        leaders: ['A. Raja', 'Kanimozhi', 'Dayanidhi Maran'],
      },
      {
        year: 2012,
        title: 'Coal Scam',
        summary: 'Arbitrary coal block allotment during UPA era led to multiple CBI FIRs. PM Office under scrutiny.',
        leaders: ['Manmohan Singh govt.', 'Naveen Jindal'],
      },
      {
        year: 2023,
        title: 'INDIA Bloc Formation',
        summary: 'INC joined Left Front as part of the INDIA alliance for 2024 Lok Sabha and WB 2026 state elections.',
        leaders: [],
      },
    ],
  },
];

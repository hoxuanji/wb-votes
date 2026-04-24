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
      },
      {
        year: 2016,
        title: 'Narada Sting Operation',
        summary: 'Video footage showed senior TMC ministers and MPs allegedly accepting cash from a fictitious company. CBI filed charge sheet.',
      },
      {
        year: 2022,
        title: 'School Jobs Scam',
        summary: 'State Education Minister Partha Chatterjee arrested by ED. ₹50 Cr+ in cash and assets seized from his associate.',
      },
    ],
  },
  {
    partyId: 'BJP',
    fullName: 'Bharatiya Janata Party',
    wbPresence: 'Main opposition since 2019',
    distinctiveFact: 'Received ₹6,061 Cr in electoral bonds nationally (2018–2024) — the highest share of any party, ~56% of disclosed total.',
    distinctiveFactType: 'negative',
    notableIssues: [
      {
        year: 2024,
        title: 'Electoral Bond Dominance',
        summary: 'Supreme Court-ordered disclosure showed BJP received ₹6,061 Cr — more than all other parties combined — in anonymous corporate bonds.',
      },
      {
        year: 2021,
        title: 'Post-election Violence Allegations',
        summary: 'Both BJP and TMC faced NHRC-reported allegations of post-poll violence after the 2021 WB election.',
      },
      {
        year: 2023,
        title: 'WB Leader Defections',
        summary: "Multiple high-profile BJP MLAs returned to TMC, raising questions about the party's organisational stability in Bengal.",
      },
    ],
  },
  {
    partyId: 'CPI(M)',
    fullName: 'Communist Party of India (Marxist)',
    wbPresence: 'Ruled WB 1977–2011 (34 years); now opposition',
    distinctiveFact: 'Only major party to officially refuse electoral bonds on principle. Received ₹0 in anonymous corporate funding.',
    distinctiveFactType: 'positive',
    notableIssues: [
      {
        year: 2007,
        title: 'Nandigram Land Acquisition',
        summary: 'NHRC and SC took cognisance of police firing on protesters opposing SEZ land acquisition. Triggered widespread criticism of the Left Front.',
      },
      {
        year: 2011,
        title: 'Singur & Tata Nano Fallout',
        summary: "Forced land acquisition for Tata Motors plant in Singur became a flashpoint that contributed to TMC's 2011 landslide victory.",
      },
      {
        year: 2024,
        title: 'Electoral Bond Refusal',
        summary: 'CPI(M) publicly opposed the electoral bond scheme and accepted zero bonds — taking a consistent anti-corruption stance.',
      },
    ],
  },
  {
    partyId: 'INC',
    fullName: 'Indian National Congress',
    wbPresence: 'Minor player; INDIA bloc ally with Left Front',
    distinctiveFact: 'Received ₹1,123 Cr in electoral bonds nationally. WB presence is limited; contesting select seats with Left Front.',
    distinctiveFactType: 'neutral',
    notableIssues: [
      {
        year: 2008,
        title: '2G Spectrum Scam',
        summary: 'CAG estimated ₹1.76 lakh Cr in "presumptive loss" under UPA government. Several ministers chargesheeted.',
      },
      {
        year: 2012,
        title: 'Coal Scam',
        summary: 'CAG report on arbitrary coal block allotment during UPA era led to multiple CBI FIRs involving party-linked beneficiaries.',
      },
      {
        year: 2023,
        title: 'INDIA Bloc Formation',
        summary: 'INC joined Left Front as part of the opposition INDIA alliance for 2024 Lok Sabha and WB 2026 state elections.',
      },
    ],
  },
];

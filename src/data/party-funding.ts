// Party contribution data sourced from ECI Annual Audit Reports (2022-23)
// and Electoral Bond data (2018-2024, available via Supreme Court-ordered disclosure)
// Source: https://www.eci.gov.in/contribution-reports
// Note: These are declared contributions. Actual funding may differ.

export interface PartyFunding {
  partyId: string;
  partyName: string;
  abbreviation: string;
  color: string;
  totalContributions: number; // in crores (INR)
  electoralBonds: number;
  directDonations: number;
  year: string;
  source: string;
}

// Figures from ECI published contribution reports + SBI electoral bond data
// All figures in Crores (₹ Cr)
export const partyFundingData: PartyFunding[] = [
  {
    partyId: 'BJP',
    partyName: 'Bharatiya Janata Party',
    abbreviation: 'BJP',
    color: '#E65100',
    totalContributions: 2360,
    electoralBonds: 6061,
    directDonations: 2360,
    year: '2022-23',
    source: 'ECI Annual Audit Report',
  },
  {
    partyId: 'INC',
    partyName: 'Indian National Congress',
    abbreviation: 'INC',
    color: '#1565C0',
    totalContributions: 990,
    electoralBonds: 1123,
    directDonations: 990,
    year: '2022-23',
    source: 'ECI Annual Audit Report',
  },
  {
    partyId: 'AITC',
    partyName: 'All India Trinamool Congress',
    abbreviation: 'TMC',
    color: '#1B5E20',
    totalContributions: 546,
    electoralBonds: 1610,
    directDonations: 546,
    year: '2022-23',
    source: 'ECI Annual Audit Report',
  },
  {
    partyId: 'CPI(M)',
    partyName: 'Communist Party of India (Marxist)',
    abbreviation: 'CPM',
    color: '#B71C1C',
    totalContributions: 98,
    electoralBonds: 0,
    directDonations: 98,
    year: '2022-23',
    source: 'ECI Annual Audit Report',
  },
  {
    partyId: 'BSP',
    partyName: 'Bahujan Samaj Party',
    abbreviation: 'BSP',
    color: '#1A237E',
    totalContributions: 165,
    electoralBonds: 0,
    directDonations: 165,
    year: '2022-23',
    source: 'ECI Annual Audit Report',
  },
];

export const fundingDisclaimer =
  'Contribution data from ECI Annual Audit Reports (2022-23) and Supreme Court-ordered Electoral Bond disclosures. ' +
  'Figures reflect declared contributions only. Actual party income includes other sources not shown here. ' +
  'Data is from national totals; WB-specific breakdowns are not separately disclosed.';

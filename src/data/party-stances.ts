export interface Dimension {
  key: string;
  label: string;
  leftLabel: string;
  rightLabel: string;
}

export interface Stance {
  score: number; // -2 (left) to +2 (right)
  note: string;
}

export interface PartyManifesto {
  partyId: string;
  summary: string;
  stances: Record<string, Stance>;
}

export const policyDimensions: Dimension[] = [
  { key: 'economy',    label: 'Economy',         leftLabel: 'Welfare State',   rightLabel: 'Free Market'      },
  { key: 'industry',   label: 'Industry',         leftLabel: 'Worker Rights',   rightLabel: 'Pro-Business'     },
  { key: 'agriculture',label: 'Agriculture',      leftLabel: 'Land Reform',     rightLabel: 'Agri-Business'    },
  { key: 'governance', label: 'Governance',       leftLabel: 'State Autonomy',  rightLabel: 'Central Power'    },
  { key: 'social',     label: 'Social',           leftLabel: 'Secular/Plural',  rightLabel: 'Traditional'      },
];

export const partyManifestos: PartyManifesto[] = [
  {
    partyId: 'AITC',
    summary: 'Welfare-led governance rooted in Bengali identity. Flagship schemes like Lakshmir Bhandar, Kanyashree, and Duare Sarkar define TMC\'s outreach-heavy model.',
    stances: {
      economy:     { score: -1, note: 'Extensive cash-transfer & subsidy schemes targeting women and rural poor' },
      industry:    { score:  0, note: 'Pragmatic — invites investment while managing union pressures' },
      agriculture: { score: -1, note: 'Farmer loan waivers, crop insurance, and input subsidies under Krishak Bandhu' },
      governance:  { score: -1, note: 'Strong advocate for state autonomy and fiscal federalism against Centre' },
      social:      { score:  0, note: 'Nominally secular; pragmatic with both Hindu and minority voter blocs' },
    },
  },
  {
    partyId: 'BJP',
    summary: 'Hindu nationalist platform combined with development rhetoric. BJP campaigns on double-engine government, anti-infiltration, and cultural nationalism in West Bengal.',
    stances: {
      economy:     { score:  1, note: 'Privatization, FDI-friendly policies, Make in India' },
      industry:    { score:  2, note: 'Labour code reforms to reduce compliance burden, ease of doing business' },
      agriculture: { score:  0, note: 'PM-KISAN direct transfers; opposed to legal MSP guarantee' },
      governance:  { score:  2, note: 'Strong central authority; leverages Governor office and CBI in Bengal' },
      social:      { score:  2, note: 'Hindu cultural nationalism, cow protection, anti-conversion stance' },
    },
  },
  {
    partyId: 'CPI(M)',
    summary: 'Marxist-Leninist party with 34 years in power (1977–2011). Focuses on class struggle, land redistribution, and strong secularism. Leading the Left Front alliance.',
    stances: {
      economy:     { score: -2, note: 'Public sector expansion, redistribution, anti-privatization' },
      industry:    { score: -2, note: 'Strong union rights, living wage, workers\' control in management' },
      agriculture: { score: -2, note: 'Operation Barga legacy — land to tiller, tenancy rights' },
      governance:  { score: -1, note: 'State autonomy but strong party-led governance tradition' },
      social:      { score: -2, note: 'Militant secularism, scientific temper, class over identity politics' },
    },
  },
  {
    partyId: 'INC',
    summary: 'Congress supports inclusive welfare, MGNREGA, and minority rights. Running as part of the INDIA bloc alongside Left Front in several seats.',
    stances: {
      economy:     { score: -1, note: 'Mixed economy with emphasis on welfare — MGNREGA, food security' },
      industry:    { score:  0, note: 'Liberal on FDI but supports organized labour protections' },
      agriculture: { score: -1, note: 'Pro-farmer subsidies, crop insurance; legal MSP guarantee pledged' },
      governance:  { score:  0, note: 'Cooperative federalism; balanced Centre-state relations' },
      social:      { score: -1, note: 'Constitutional secularism, pluralism, minority rights protection' },
    },
  },
  {
    partyId: 'ALL INDIA FORWARD BLOC',
    summary: 'Left-wing nationalist party, part of the Left Front. Founded by Subhas Chandra Bose\'s legacy, combines socialist economics with strong anti-imperialist stance.',
    stances: {
      economy:     { score: -2, note: 'State ownership, anti-corporate, pro-public sector' },
      industry:    { score: -2, note: 'Worker-led management, strong union rights' },
      agriculture: { score: -2, note: 'Land redistribution, cooperative farming' },
      governance:  { score: -1, note: 'Federalism with social justice framework' },
      social:      { score: -2, note: 'Secular, anti-communal, left-nationalist' },
    },
  },
];

export function getPartyManifesto(partyId: string): PartyManifesto | undefined {
  return partyManifestos.find(m => m.partyId === partyId);
}

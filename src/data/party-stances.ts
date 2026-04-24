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
  placeholder?: boolean;
  stances: Record<string, Stance>;
}

export const policyDimensions: Dimension[] = [
  { key: 'economy',    label: 'Economy',     leftLabel: 'Welfare State',  rightLabel: 'Free Market'   },
  { key: 'industry',   label: 'Industry',    leftLabel: 'Worker Rights',  rightLabel: 'Pro-Business'  },
  { key: 'agriculture',label: 'Agriculture', leftLabel: 'Land Reform',    rightLabel: 'Agri-Business' },
  { key: 'governance', label: 'Governance',  leftLabel: 'State Autonomy', rightLabel: 'Central Power' },
  { key: 'social',     label: 'Social',      leftLabel: 'Secular/Plural', rightLabel: 'Traditional'   },
];

const NEUTRAL_STANCES: Record<string, Stance> = {
  economy:     { score: 0, note: 'No official position data available' },
  industry:    { score: 0, note: 'No official position data available' },
  agriculture: { score: 0, note: 'No official position data available' },
  governance:  { score: 0, note: 'No official position data available' },
  social:      { score: 0, note: 'No official position data available' },
};

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
      industry:    { score:  0, note: 'Liberal on FDI but supports organised labour protections' },
      agriculture: { score: -1, note: 'Pro-farmer subsidies, crop insurance; legal MSP guarantee pledged' },
      governance:  { score:  0, note: 'Cooperative federalism; balanced Centre-state relations' },
      social:      { score: -1, note: 'Constitutional secularism, pluralism, minority rights protection' },
    },
  },
  {
    partyId: 'ALL INDIA FORWARD BLOC',
    summary: 'Left-wing nationalist party, part of the Left Front. Founded on Subhas Chandra Bose\'s legacy — combines socialist economics with strong anti-imperialist stance.',
    stances: {
      economy:     { score: -2, note: 'State ownership, anti-corporate, pro-public sector' },
      industry:    { score: -2, note: 'Worker-led management, strong union rights' },
      agriculture: { score: -2, note: 'Land redistribution, cooperative farming' },
      governance:  { score: -1, note: 'Federalism with social justice framework' },
      social:      { score: -2, note: 'Secular, anti-communal, left-nationalist' },
    },
  },
  {
    partyId: 'RSP',
    summary: 'Revolutionary Socialist Party is a Left Front constituent rooted in trade union and peasant movements. Closely aligned with CPI(M) on most policy positions.',
    stances: {
      economy:     { score: -2, note: 'State-directed economy, nationalisation of key industries' },
      industry:    { score: -2, note: 'Pro-labour, strong union movement' },
      agriculture: { score: -2, note: 'Peasant rights, land reform, cooperative agriculture' },
      governance:  { score: -1, note: 'State rights, anti-centralisation' },
      social:      { score: -2, note: 'Strongly secular, class-based politics' },
    },
  },
  {
    partyId: 'REVOLUTIONARY SOCIALIST PARTY',
    summary: 'Revolutionary Socialist Party — Left Front constituent with strong labour and peasant movement roots.',
    stances: {
      economy:     { score: -2, note: 'State-directed economy, nationalisation' },
      industry:    { score: -2, note: 'Strong union rights, pro-labour legislation' },
      agriculture: { score: -2, note: 'Land reform, tenant rights' },
      governance:  { score: -1, note: 'Federalism, state autonomy' },
      social:      { score: -2, note: 'Secular, class-based politics' },
    },
  },
  {
    partyId: 'SUCI',
    summary: 'Socialist Unity Centre of India (Communist) — far-left Marxist party with strong presence in industrial areas. More radical than CPI(M) on economic policy.',
    stances: {
      economy:     { score: -2, note: 'Revolutionary socialist economics, workers\' state' },
      industry:    { score: -2, note: 'Workers\' control of production, abolish exploitation' },
      agriculture: { score: -2, note: 'Collectivisation, end to landlordism' },
      governance:  { score: -1, note: 'People\'s democratic governance' },
      social:      { score: -2, note: 'Scientific socialism, anti-religion in politics' },
    },
  },
  {
    partyId: 'ALL INDIA SECULAR FRONT',
    summary: 'All India Secular Front (Furfura Sharif) — minority community party led by Abbas Siddiqui. Combines welfare politics with minority rights advocacy.',
    stances: {
      economy:     { score: -1, note: 'Welfare for marginalised communities, minority economic empowerment' },
      industry:    { score:  0, note: 'No distinct industrial policy declared' },
      agriculture: { score: -1, note: 'Land rights for sharecroppers and minority farmers' },
      governance:  { score: -1, note: 'Anti-BJP federalism stance' },
      social:      { score:  1, note: 'Muslim community welfare; minority cultural rights focus' },
    },
  },
  {
    partyId: 'ALL INDIA MAJLIS-E-ITTEHADUL MUSLIMEEN',
    summary: 'AIMIM — Muslim political party with focus on minority rights, welfare, and community development. Hyderabad-based party expanding into Bengal.',
    stances: {
      economy:     { score: -1, note: 'Welfare spending for minority communities' },
      industry:    { score:  0, note: 'No distinct industrial policy' },
      agriculture: { score:  0, note: 'No distinct agricultural policy' },
      governance:  { score:  0, note: 'Cooperative federalism, minority representation in government' },
      social:      { score:  1, note: 'Muslim community rights, personal law protection' },
    },
  },
  {
    partyId: 'WELFARE PARTY OF INDIA',
    summary: 'Welfare Party of India — focuses on minority welfare and social justice. Aligned with Islamic democratic values.',
    stances: {
      economy:     { score: -1, note: 'Welfare-oriented economics, equity focus' },
      industry:    { score:  0, note: 'No distinct industrial position' },
      agriculture: { score: -1, note: 'Pro-small farmer, rural development' },
      governance:  { score:  0, note: 'Pluralist governance, minority representation' },
      social:      { score:  1, note: 'Muslim community welfare, cultural rights' },
    },
  },
  {
    partyId: 'AKHIL BHARATIYA GORKHA LEAGUE',
    summary: 'ABGL — Gorkhaland autonomy party from the Darjeeling hills. Primary focus is political and cultural rights for Gorkha community; seeks separate state status.',
    stances: {
      economy:     { score:  0, note: 'Hill development focus, tourism and tea industry support' },
      industry:    { score:  0, note: 'Tea garden worker rights and hill industries' },
      agriculture: { score:  0, note: 'Hill agriculture, organic farming promotion' },
      governance:  { score: -2, note: 'Gorkhaland statehood demand — maximum decentralisation' },
      social:      { score:  0, note: 'Gorkha cultural identity, secular stance' },
    },
  },
  {
    partyId: 'BHARATIYA GORKHA PRAJATANTRIK MORCHA',
    summary: 'BGPM — Gorkha political party from Darjeeling hills focused on cultural rights and political autonomy for the Gorkha community.',
    stances: {
      economy:     { score:  0, note: 'Hill region development, infrastructure' },
      industry:    { score:  0, note: 'Tea garden workers, hill enterprises' },
      agriculture: { score:  0, note: 'Hill agricultural development' },
      governance:  { score: -2, note: 'Gorkhaland autonomy as primary demand' },
      social:      { score:  0, note: 'Gorkha cultural identity' },
    },
  },
  {
    partyId: 'BSP',
    summary: 'Bahujan Samaj Party — Dalit-centric party founded by Kanshi Ram and led by Mayawati. Focuses on Dalit empowerment, social justice, and constitutional rights.',
    stances: {
      economy:     { score: -1, note: 'Dalit economic empowerment, reservation in private sector' },
      industry:    { score:  0, note: 'Employment rights for Scheduled Castes and minorities' },
      agriculture: { score: -1, note: 'Land rights for SC/ST farmers' },
      governance:  { score:  0, note: 'Constitutional governance, strict law enforcement' },
      social:      { score: -1, note: 'Anti-caste discrimination, Ambedkarite social justice' },
    },
  },
];

export function getPartyManifesto(partyId: string): PartyManifesto | undefined {
  return partyManifestos.find(m => m.partyId === partyId);
}

export function getPartyManifestoOrDefault(partyId: string): PartyManifesto | null {
  if (partyId === 'IND') return null;
  const real = partyManifestos.find(m => m.partyId === partyId);
  if (real) return real;
  return {
    partyId,
    summary: 'Detailed policy position data is not available for this party. Positions shown are indicative only.',
    placeholder: true,
    stances: { ...NEUTRAL_STANCES },
  };
}

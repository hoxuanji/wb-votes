// AUTO-GENERATED — WB Cabinet (2026 term) — 2026-05-21
// Built by: node scripts/build-cabinet.js
// Source: scripts/data/cabinet.json — keep in sync with wb.gov.in cabinet listings.
import type { CabinetMember } from '@/types';

export const wbCabinet2026: CabinetMember[] = [
  {
    "id": "suvendu-adhikari",
    "name": "Suvendu Adhikari",
    "partyId": "BJP",
    "constituencyId": "c0166",
    "lat": 22.5195,
    "lng": 88.3373,
    "portfolios": [
      {
        "ministry": "Chief Minister",
        "rank": "CM",
        "from": "2026-05-09"
      },
      {
        "ministry": "Home & Hill Affairs",
        "rank": "Cabinet",
        "from": "2026-05-11"
      },
      {
        "ministry": "Health",
        "rank": "Cabinet",
        "from": "2026-05-11"
      },
      {
        "ministry": "Law",
        "rank": "Cabinet",
        "from": "2026-05-11"
      },
      {
        "ministry": "Finance",
        "rank": "Cabinet",
        "from": "2026-05-11"
      }
    ],
    "inducted": "2026-05-09",
    "bio": "First Bharatiya Janata Party Chief Minister of West Bengal, sworn in at the Brigade Parade Ground, Kolkata.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Suvendu_Adhikari_ministry"
  },
  {
    "id": "dilip-ghosh",
    "name": "Dilip Ghosh",
    "partyId": "BJP",
    "constituencyId": "c0233",
    "lat": 22.3296,
    "lng": 87.3232,
    "portfolios": [
      {
        "ministry": "Panchayat & Rural Development",
        "rank": "Cabinet",
        "from": "2026-05-11"
      },
      {
        "ministry": "Animal Resources",
        "rank": "Cabinet",
        "from": "2026-05-11"
      },
      {
        "ministry": "Agricultural Marketing",
        "rank": "Cabinet",
        "from": "2026-05-11"
      }
    ],
    "inducted": "2026-05-09",
    "sourceUrl": "https://en.wikipedia.org/wiki/Suvendu_Adhikari_ministry"
  },
  {
    "id": "agnimitra-paul",
    "name": "Agnimitra Paul",
    "partyId": "BJP",
    "constituencyId": "c0293",
    "lat": 23.6835,
    "lng": 86.968,
    "portfolios": [
      {
        "ministry": "Women & Child Welfare",
        "rank": "Cabinet",
        "from": "2026-05-11"
      },
      {
        "ministry": "Urban Development",
        "rank": "Cabinet",
        "from": "2026-05-11"
      },
      {
        "ministry": "Municipal Affairs",
        "rank": "Cabinet",
        "from": "2026-05-11"
      }
    ],
    "inducted": "2026-05-09",
    "sourceUrl": "https://en.wikipedia.org/wiki/Suvendu_Adhikari_ministry"
  },
  {
    "id": "ashok-kirtania",
    "name": "Ashok Kirtania",
    "partyId": "BJP",
    "constituencyId": "c0098",
    "lat": 23.05,
    "lng": 88.88,
    "portfolios": [
      {
        "ministry": "Food & Supplies",
        "rank": "Cabinet",
        "from": "2026-05-11"
      }
    ],
    "inducted": "2026-05-09",
    "sourceUrl": "https://en.wikipedia.org/wiki/Suvendu_Adhikari_ministry"
  },
  {
    "id": "kshudiram-tudu",
    "name": "Kshudiram Tudu",
    "partyId": "BJP",
    "constituencyId": "c0262",
    "lat": 23.6463,
    "lng": 86.8942,
    "portfolios": [
      {
        "ministry": "Tribal Development",
        "rank": "Cabinet",
        "from": "2026-05-11"
      },
      {
        "ministry": "Backward Classes Welfare",
        "rank": "Cabinet",
        "from": "2026-05-11"
      },
      {
        "ministry": "Minority & Madrasa Education",
        "rank": "Cabinet",
        "from": "2026-05-11"
      }
    ],
    "inducted": "2026-05-09",
    "sourceUrl": "https://en.wikipedia.org/wiki/Suvendu_Adhikari_ministry"
  },
  {
    "id": "nisith-pramanik",
    "name": "Nisith Pramanik",
    "partyId": "BJP",
    "constituencyId": "c0002",
    "lat": 26.35,
    "lng": 89.2,
    "portfolios": [
      {
        "ministry": "Sports",
        "rank": "Cabinet",
        "from": "2026-05-11"
      },
      {
        "ministry": "Youth Affairs",
        "rank": "Cabinet",
        "from": "2026-05-11"
      },
      {
        "ministry": "North Bengal Development",
        "rank": "Cabinet",
        "from": "2026-05-11"
      }
    ],
    "inducted": "2026-05-09",
    "sourceUrl": "https://en.wikipedia.org/wiki/Suvendu_Adhikari_ministry"
  }
];

export function getCabinetMemberById(id: string): CabinetMember | undefined {
  return wbCabinet2026.find((m) => m.id === id);
}

export function getCabinetMemberByConstituency(
  constituencyId: string,
): CabinetMember | undefined {
  return wbCabinet2026.find((m) => m.constituencyId === constituencyId);
}

export function getChiefMinister(): CabinetMember | undefined {
  return wbCabinet2026.find((m) =>
    m.portfolios.some((p) => p.rank === 'CM' && !p.to),
  );
}

export function getCurrentPortfolios(member: CabinetMember) {
  return member.portfolios.filter((p) => !p.to);
}

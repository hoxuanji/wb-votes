# Electoral geometry import

**Generated — do not edit.** `npm run registry -- geography inspect --write`. The sources and their classification are [sources.md](sources.md); what the product can draw as a result is [coverage.md](coverage.md).

A polygon is written against a `place_version_id`, and a version belongs to exactly one boundary epoch — so choosing the version IS choosing the epoch, and there is no separate check to forget. The columns below are that choice, per jurisdiction, with the evidence for it.

## `datameet-ac` — assembly constituencies

4182 features → 4095 constituencies (45 multipart, 34 unusable and dropped). 4017 of 4252 seats linked; 385 further versions written because the registry's own `derived_from` links say a later order restated the same constituency; 78 staged for review and not written.

| Jurisdiction | Epoch | Seats | Drawn | Restated | Staged | How the epoch was chosen |
| --- | --- | --- | --- | --- | --- | --- |
| Andhra Pradesh | `delim-2008` | 294 | 166 | 0 | 9 | WEAK — in force at 2014-11-24 (effective 2008-02-19, ahead of delim-1976 and delim-1963 and delim-1952); 119 of 294 constituencies confirm it by number and name |
| Arunachal Pradesh | `delim-1976` | 60 | 59 | 59 | 1 | RESOLVED — in force at 2008-02-18 (effective 1976-01-01); 59 of 60 constituencies confirm it by number and name |
| Assam | `delim-1976` | 126 | 126 | 126 | 0 | RESOLVED — in force at 2008-02-18 (effective 1976-01-01, ahead of delim-1963 and delim-1952); 126 of 126 constituencies confirm it by number and name |
| Bihar | `delim-2008` | 243 | 242 | 0 | 1 | RESOLVED — in force at 2014-11-24 (effective 2008-02-19, ahead of delim-1976 and delim-1963 and delim-1952); 242 of 243 constituencies confirm it by number and name |
| Chhattisgarh | `delim-2008` | 90 | 87 | 0 | 3 | RESOLVED — in force at 2014-11-24 (effective 2008-02-19, ahead of delim-1976); 87 of 90 constituencies confirm it by number and name |
| Delhi | `delim-2008` | 70 | 70 | 0 | 0 | RESOLVED — in force at 2014-11-24 (effective 2008-02-19, ahead of delim-1976 and delim-1963); 70 of 70 constituencies confirm it by number and name |
| Goa | `delim-2008` | 40 | 40 | 0 | 0 | RESOLVED — in force at 2014-11-24 (effective 2008-02-19, ahead of delim-1976); 40 of 40 constituencies confirm it by number and name |
| Gujarat | `delim-2008` | 182 | 162 | 0 | 0 | RESOLVED — in force at 2014-11-24 (effective 2008-02-19, ahead of delim-1976 and delim-1963 and delim-1952); 162 of 182 constituencies confirm it by number and name |
| Haryana | `delim-2008` | 90 | 90 | 0 | 0 | RESOLVED — in force at 2014-11-24 (effective 2008-02-19, ahead of delim-1976 and delim-1963); 90 of 90 constituencies confirm it by number and name |
| Himachal Pradesh | `delim-2008` | 68 | 68 | 0 | 0 | RESOLVED — in force at 2014-11-24 (effective 2008-02-19, ahead of delim-1976 and delim-1963); 68 of 68 constituencies confirm it by number and name |
| Jammu and Kashmir | `delim-1976` | 87 | 80 | 80 | 7 | RESOLVED — in force at 2008-02-18 (effective 1976-01-01, ahead of delim-1963 and delim-1952); 81 of 87 constituencies confirm it by number and name |
| Jharkhand | `delim-1976` | 81 | 81 | 0 | 0 | RESOLVED — in force at 2008-02-18 (effective 1976-01-01); 81 of 81 constituencies confirm it by number and name |
| Karnataka | `delim-2008` | 224 | 224 | 0 | 0 | RESOLVED — in force at 2014-11-24 (effective 2008-02-19, ahead of delim-1976); 224 of 224 constituencies confirm it by number and name |
| Kerala | `delim-2008` | 140 | 140 | 0 | 0 | RESOLVED — in force at 2014-11-24 (effective 2008-02-19, ahead of delim-1976 and delim-1963); 140 of 140 constituencies confirm it by number and name |
| Madhya Pradesh | `delim-2008` | 230 | 212 | 0 | 14 | RESOLVED — in force at 2014-11-24 (effective 2008-02-19, ahead of delim-1976 and delim-1963 and delim-1952); 212 of 230 constituencies confirm it by number and name |
| Maharashtra | `delim-2008` | 288 | 285 | 0 | 3 | RESOLVED — in force at 2014-11-24 (effective 2008-02-19, ahead of delim-1976 and delim-1963 and delim-1952); 285 of 288 constituencies confirm it by number and name |
| Manipur | `delim-1976` | 60 | 60 | 60 | 0 | RESOLVED — in force at 2008-02-18 (effective 1976-01-01, ahead of delim-1963); 60 of 60 constituencies confirm it by number and name |
| Meghalaya | `delim-2008` | 60 | 60 | 0 | 0 | RESOLVED — in force at 2014-11-24 (effective 2008-02-19, ahead of delim-1976 and delim-1963); 60 of 60 constituencies confirm it by number and name |
| Mizoram | `delim-2008` | 40 | 40 | 0 | 0 | RESOLVED — in force at 2014-11-24 (effective 2008-02-19, ahead of delim-1976 and delim-1963); 40 of 40 constituencies confirm it by number and name |
| Nagaland | `delim-1976` | 60 | 60 | 60 | 0 | RESOLVED — in force at 2008-02-18 (effective 1976-01-01, ahead of delim-1963); 60 of 60 constituencies confirm it by number and name |
| Odisha | `delim-2008` | 147 | 143 | 0 | 4 | RESOLVED — in force at 2014-11-24 (effective 2008-02-19, ahead of delim-1976 and delim-1963 and delim-1952); 143 of 147 constituencies confirm it by number and name |
| Puducherry | `delim-2008` | 30 | 30 | 0 | 0 | RESOLVED — in force at 2014-11-24 (effective 2008-02-19, ahead of delim-1976 and delim-1963); 30 of 30 constituencies confirm it by number and name |
| Punjab | `delim-2008` | 117 | 117 | 0 | 0 | RESOLVED — in force at 2014-11-24 (effective 2008-02-19, ahead of delim-1976 and delim-1963 and delim-1952); 117 of 117 constituencies confirm it by number and name |
| Rajasthan | `delim-2008` | 200 | 199 | 0 | 1 | RESOLVED — in force at 2014-11-24 (effective 2008-02-19, ahead of delim-1976 and delim-1963 and delim-1952); 199 of 200 constituencies confirm it by number and name |
| Sikkim | `delim-2008` | 32 | 29 | 0 | 2 | RESOLVED — in force at 2014-11-24 (effective 2008-02-19, ahead of delim-1976); 29 of 32 constituencies confirm it by number and name |
| Tamil Nadu | `delim-2008` | 234 | 231 | 0 | 3 | RESOLVED — in force at 2014-11-24 (effective 2008-02-19, ahead of delim-1976 and delim-1963); 231 of 234 constituencies confirm it by number and name |
| Telangana | `delim-2008` | 119 | 119 | 0 | 0 | RESOLVED — in force at 2014-11-24 (effective 2008-02-19); 119 of 119 constituencies confirm it by number and name |
| Tripura | `delim-2008` | 60 | 60 | 0 | 0 | RESOLVED — in force at 2014-11-24 (effective 2008-02-19, ahead of delim-1976 and delim-1963); 60 of 60 constituencies confirm it by number and name |
| Uttar Pradesh | `delim-2008` | 403 | 391 | 0 | 12 | RESOLVED — in force at 2014-11-24 (effective 2008-02-19, ahead of delim-1976 and delim-1963 and delim-1952); 391 of 403 constituencies confirm it by number and name |
| Uttarakhand | `delim-2008` | 70 | 70 | 0 | 0 | RESOLVED — in force at 2014-11-24 (effective 2008-02-19, ahead of delim-1976); 70 of 70 constituencies confirm it by number and name |
| West Bengal | `delim-2008` | 307 | 276 | 0 | 18 | WEAK — in force at 2014-11-24 (effective 2008-02-19, ahead of delim-1976 and delim-1963 and delim-1952); 76 of 307 constituencies confirm it by number and name |

### Validation findings

| n | finding | examples |
| --- | --- | --- |
| 76 | `no-version` | JAMMU & KASHMIR 47 NURBRA; JAMMU & KASHMIR 20 EIDGAH; JAMMU & KASHMIR 30 CHRAR SHAR |
| 43 | `multipart` | as 121 Chabua: 2 polygons; as 31 Sidli: 3 polygons; as 63 Chapaguri: 2 polygons |
| 14 | `self-touching-ring` | jk 44 SHANGUS: 1; tn 163 Nagapattinam: 1; tn 213 Vilathikulam: 1 |
| 14 | `count-short` | jk delim-1976: 80 of 87 seats drawn; tn delim-2008: 231 of 234 seats drawn; wb delim-2008: 276 of 307 seats drawn |
| 2 | `epoch-weakly-confirmed` | wb delim-2008: 76 of 307 names confirm it; ap delim-2008: 119 of 294 names confirm it |
| 1 | `outside-jurisdiction` | jk 48 LEH |
| 1 | `version-claimed-twice` | tn 70 Vandavasi (SC) |
| 1 | `area-covers-the-state` | hp 21 Lahaul & Spiti (ST): 25% of the jurisdiction |

### Staged — 78 constituencies the pipeline refused to attach

These have geometry and no link. Each one is a decision somebody has to make with a document.

| Jurisdiction | Source no. | Source name | Reason | Detail |
| --- | --- | --- | --- | --- |
| ap | 134 | Cheepurupalle | `no-version` | no place_version matched in ap/delim-2008, tg/delim-2008 |
| ap | 139 | Bhimili | `no-version` | no place_version matched in ap/delim-2008, tg/delim-2008 |
| ap | 146 | Madugula | `no-version` | no place_version matched in ap/delim-2008, tg/delim-2008 |
| ap | 149 | Anakapalle | `no-version` | no place_version matched in ap/delim-2008, tg/delim-2008 |
| ap | 151 | Yelamanchili | `no-version` | no place_version matched in ap/delim-2008, tg/delim-2008 |
| ap | 152 | Payakaraopet (SC) | `no-version` | no place_version matched in ap/delim-2008, tg/delim-2008 |
| ap | 155 | Prathipadu | `no-version` | no place_version matched in ap/delim-2008, tg/delim-2008 |
| ap | 165 | Gannavaram (SC) | `no-version` | no place_version matched in ap/delim-2008, tg/delim-2008 |
| ap | 170 | Rajahmundry Rural | `no-version` | no place_version matched in ap/delim-2008, tg/delim-2008 |
| ar | 34 | Tuting-Yinkgkiong | `no-version` | no place_version matched in ar/delim-1976 |
| br | 185 | Fatuha | `no-version` | no place_version matched in br/delim-2008 |
| cg | 48 | Raipur Rural | `no-version` | no place_version matched in cg/delim-2008 |
| cg | 63 | Durg-Rural | `no-version` | no place_version matched in cg/delim-2008 |
| cg | 88 | Dantewada (ST) | `no-version` | no place_version matched in cg/delim-2008 |
| jk | 20 | EIDGAH | `no-version` | no place_version matched in jk/delim-1976 |
| jk | 30 | CHRAR SHAR | `no-version` | no place_version matched in jk/delim-1976 |
| jk | 39 | HOM SHALI | `no-version` | no place_version matched in jk/delim-1976 |
| jk | 47 | NURBRA | `no-version` | no place_version matched in jk/delim-1976 |
| jk | 48 | LEH | `outside-jurisdiction` | box 174 58 63 49 falls outside Jammu and Kashmir's 110 46 69 62 |
| jk | 75 | RANBIR SINGH PURA | `no-version` | no place_version matched in jk/delim-1976 |
| jk | 81 | NAUSHEHRA | `no-version` | no place_version matched in jk/delim-1976 |
| mh | 36 | Dhamangaon Railway | `no-version` | no place_version matched in mh/delim-2008 |
| mh | 126 | Deolali (SC) | `no-version` | no place_version matched in mh/delim-2008 |
| mh | 208 | Vadgaon Sheri | `no-version` | no place_version matched in mh/delim-2008 |
| mp | 3 | Sabalgarh | `no-version` | no place_version matched in mp/delim-2008 |
| mp | 5 | Sumawali | `no-version` | no place_version matched in mp/delim-2008 |
| mp | 30 | Chachoura | `no-version` | no place_version matched in mp/delim-2008 |
| mp | 40 | Naryoli (SC) | `no-version` | no place_version matched in mp/delim-2008 |
| mp | 91 | Barwara (ST) | `no-version` | no place_version matched in mp/delim-2008 |
| mp | 93 | Murwara | `no-version` | no place_version matched in mp/delim-2008 |
| mp | 97 | Jabalpur Purba(SC) | `no-version` | no place_version matched in mp/delim-2008 |
| mp | 98 | Jabalpur Uttar | `no-version` | no place_version matched in mp/delim-2008 |
| mp | 100 | Jabalpur Paschim | `no-version` | no place_version matched in mp/delim-2008 |
| mp | 125 | Saunsar | `no-version` | no place_version matched in mp/delim-2008 |
| mp | 132 | Ghoradongri (ST) | `no-version` | no place_version matched in mp/delim-2008 |
| mp | 190 | Badwani (ST) | `no-version` | no place_version matched in mp/delim-2008 |
| mp | 216 | Ujjain Uttar | `no-version` | no place_version matched in mp/delim-2008 |
| mp | 217 | Ujjain Dakshin | `no-version` | no place_version matched in mp/delim-2008 |
| od | 108 | BRAHMAGIRI | `no-version` | no place_version matched in od/delim-2008 |
| od | 112 | BHUBANESWAR(MADHYA) | `no-version` | no place_version matched in od/delim-2008 |
| od | 113 | BHUBANESWAR(UTTAR) | `no-version` | no place_version matched in od/delim-2008 |
| od | 141 | LAKSHMIPUR (ST) | `no-version` | no place_version matched in od/delim-2008 |
| rj | 179 | Sahara | `no-version` | no place_version matched in rj/delim-2008 |
| sk | 8 | Salghari-Zoom (SC) | `no-version` | no place_version matched in sk/delim-2008 |
| sk | 18 | West Pendam(SC) | `no-version` | no place_version matched in sk/delim-2008 |
| tn | 70 | Vandavasi (SC) | `duplicate-path` | place_version 1464069 already claimed by another polygon |
| tn | 93 | Senthamangalam(ST) | `no-version` | no place_version matched in tn/delim-2008 |
| tn | 160 | Sirkazhi (SC) | `no-version` | no place_version matched in tn/delim-2008 |
| up | 28 | Moradabad Nagar | `no-version` | no place_version matched in up/delim-2008 |
| up | 34 | Suar | `no-version` | no place_version matched in up/delim-2008 |
| up | 47 | Meerut Cantt. | `no-version` | no place_version matched in up/delim-2008 |
| up | 50 | Chhaprauli | `no-version` | no place_version matched in up/delim-2008 |
| up | 60 | Garhmukteshwar | `no-version` | no place_version matched in up/delim-2008 |
| up | 87 | Agra Cantt. (SC) | `no-version` | no place_version matched in up/delim-2008 |
| up | 125 | Bareilly Cantt. | `no-version` | no place_version matched in up/delim-2008 |
| up | 175 | Lucknow Cantt. | `no-version` | no place_version matched in up/delim-2008 |
| up | 209 | Bilhaur (SC) | `no-version` | no place_version matched in up/delim-2008 |
| up | 216 | Kanpur Cantt. | `no-version` | no place_version matched in up/delim-2008 |
| up | 312 | Menhdawal | `no-version` | no place_version matched in up/delim-2008 |
| up | 390 | Varanasi Cantt. | `no-version` | no place_version matched in up/delim-2008 |
| wb | 49 | MANIKCHAK | `no-version` | no place_version matched in wb/delim-2008 |
| wb | 62 | BHAGABANGOLA | `no-version` | no place_version matched in wb/delim-2008 |
| wb | 74 | NAODA | `no-version` | no place_version matched in wb/delim-2008 |
| wb | 94 | BAGDA (SC) | `no-version` | no place_version matched in wb/delim-2008 |
| wb | 95 | BANGAON UTTAR (SC) | `no-version` | no place_version matched in wb/delim-2008 |
| wb | 96 | BANGAON DAKSHIN (SC) | `no-version` | no place_version matched in wb/delim-2008 |
| wb | 136 | JAYNAGAR (SC) | `no-version` | no place_version matched in wb/delim-2008 |
| wb | 145 | SATGACHHIA | `no-version` | no place_version matched in wb/delim-2008 |
| wb | 149 | KASBA | `no-version` | no place_version matched in wb/delim-2008 |
| wb | 152 | TOLLYGANJ | `no-version` | no place_version matched in wb/delim-2008 |
| wb | 158 | KOLKATA PORT | `no-version` | no place_version matched in wb/delim-2008 |
| wb | 168 | KASHIPURBELGACHHIA | `no-version` | no place_version matched in wb/delim-2008 |
| wb | 189 | CHANDANNAGAR | `no-version` | no place_version matched in wb/delim-2008 |
| wb | 208 | MAHISADAL | `no-version` | no place_version matched in wb/delim-2008 |
| wb | 255 | BISHNUPUR | `no-version` | no place_version matched in wb/delim-2008 |
| wb | 257 | INDUS (SC) | `no-version` | no place_version matched in wb/delim-2008 |
| wb | 272 | MANGALKOT | `no-version` | no place_version matched in wb/delim-2008 |
| wb | 288 | LABPUR | `no-version` | no place_version matched in wb/delim-2008 |

## `datameet-pc` — parliamentary constituencies

544 features → 543 constituencies (0 multipart, 1 unusable and dropped). 526 of 561 seats linked; 22 further versions written because the registry's own `derived_from` links say a later order restated the same constituency; 17 staged for review and not written.

| Jurisdiction | Epoch | Seats | Drawn | Restated | Staged | How the epoch was chosen |
| --- | --- | --- | --- | --- | --- | --- |
| Andaman and Nicobar Islands | `delim-2008` | 1 | 1 | 0 | 0 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19); 1 of 1 constituencies confirm it by number and name |
| Andhra Pradesh | `delim-2008` | 42 | 23 | 0 | 2 | WEAK — in force at 2014-05-12 (effective 2008-02-19, ahead of delim-1976 and delim-1963 and delim-1952); 17 of 42 constituencies confirm it by number and name |
| Arunachal Pradesh | `delim-2008` | 2 | 2 | 2 | 0 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19, ahead of delim-1976); 2 of 2 constituencies confirm it by number and name |
| Assam | `delim-2008` | 14 | 12 | 12 | 2 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19, ahead of delim-1976 and delim-1963 and delim-1952); 12 of 14 constituencies confirm it by number and name |
| Bihar | `delim-2008` | 40 | 39 | 0 | 1 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19, ahead of delim-1976 and delim-1963 and delim-1952); 39 of 40 constituencies confirm it by number and name |
| Chandigarh | `delim-2008` | 1 | 1 | 0 | 0 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19); 1 of 1 constituencies confirm it by number and name |
| Chhattisgarh | `delim-2008` | 11 | 11 | 0 | 0 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19, ahead of delim-1976); 11 of 11 constituencies confirm it by number and name |
| Dadra and Nagar Haveli and Daman and Diu | `delim-2008` | 2 | 1 | 0 | 0 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19); 1 of 2 constituencies confirm it by number and name |
| Dadra and Nagar Haveli and Daman and Diu | `delim-2008` | 2 | 0 | 0 | 1 | WEAK — in force at 2014-05-12 (effective 2008-02-19); 0 of 2 constituencies confirm it by number and name |
| Delhi | `delim-2008` | 7 | 7 | 0 | 0 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19, ahead of delim-1976 and delim-1963 and delim-1952); 7 of 7 constituencies confirm it by number and name |
| Goa | `delim-2008` | 2 | 2 | 0 | 0 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19, ahead of delim-1976); 2 of 2 constituencies confirm it by number and name |
| Gujarat | `delim-2008` | 26 | 23 | 0 | 3 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19, ahead of delim-1976 and delim-1963 and delim-1952); 23 of 26 constituencies confirm it by number and name |
| Haryana | `delim-2008` | 10 | 10 | 0 | 0 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19, ahead of delim-1976 and delim-1963); 10 of 10 constituencies confirm it by number and name |
| Himachal Pradesh | `delim-2008` | 4 | 4 | 0 | 0 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19, ahead of delim-1976 and delim-1963 and delim-1952); 4 of 4 constituencies confirm it by number and name |
| Jammu and Kashmir | `delim-2008` | 6 | 5 | 5 | 1 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19, ahead of delim-1976 and delim-1963); 5 of 6 constituencies confirm it by number and name |
| Jharkhand | `delim-2008` | 14 | 14 | 0 | 0 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19, ahead of delim-1976); 14 of 14 constituencies confirm it by number and name |
| Karnataka | `delim-2008` | 28 | 28 | 0 | 0 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19, ahead of delim-1976); 28 of 28 constituencies confirm it by number and name |
| Kerala | `delim-2008` | 20 | 20 | 0 | 0 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19, ahead of delim-1976 and delim-1963 and delim-1952); 20 of 20 constituencies confirm it by number and name |
| Ladakh | `delim-2008` | 1 | 0 | 0 | 0 | WEAK — in force at 2014-05-12 (effective 2008-02-19); 0 of 1 constituencies confirm it by number and name |
| Lakshadweep | `delim-2008` | 1 | 0 | 0 | 1 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19); 1 of 1 constituencies confirm it by number and name |
| Madhya Pradesh | `delim-2008` | 29 | 29 | 0 | 0 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19, ahead of delim-1976 and delim-1963 and delim-1952); 29 of 29 constituencies confirm it by number and name |
| Maharashtra | `delim-2008` | 48 | 46 | 0 | 2 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19, ahead of delim-1976 and delim-1963 and delim-1952); 46 of 48 constituencies confirm it by number and name |
| Manipur | `delim-2008` | 2 | 2 | 2 | 0 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19, ahead of delim-1976 and delim-1963 and delim-1952); 2 of 2 constituencies confirm it by number and name |
| Meghalaya | `delim-2008` | 2 | 2 | 0 | 0 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19, ahead of delim-1976 and delim-1963); 2 of 2 constituencies confirm it by number and name |
| Mizoram | `delim-2008` | 1 | 1 | 0 | 0 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19, ahead of delim-1976 and delim-1963); 1 of 1 constituencies confirm it by number and name |
| Nagaland | `delim-2008` | 1 | 1 | 1 | 0 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19, ahead of delim-1976 and delim-1963); 1 of 1 constituencies confirm it by number and name |
| Odisha | `delim-2008` | 21 | 19 | 0 | 2 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19, ahead of delim-1976 and delim-1963 and delim-1952); 19 of 21 constituencies confirm it by number and name |
| Puducherry | `delim-2008` | 1 | 1 | 0 | 0 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19, ahead of delim-1976 and delim-1963); 1 of 1 constituencies confirm it by number and name |
| Punjab | `delim-2008` | 13 | 13 | 0 | 0 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19, ahead of delim-1976 and delim-1963 and delim-1952); 13 of 13 constituencies confirm it by number and name |
| Rajasthan | `delim-2008` | 25 | 25 | 0 | 0 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19, ahead of delim-1976 and delim-1963 and delim-1952); 25 of 25 constituencies confirm it by number and name |
| Sikkim | `delim-2008` | 1 | 1 | 0 | 0 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19, ahead of delim-1976); 1 of 1 constituencies confirm it by number and name |
| Tamil Nadu | `delim-2008` | 39 | 39 | 0 | 0 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19, ahead of delim-1976 and delim-1963); 39 of 39 constituencies confirm it by number and name |
| Telangana | `delim-2008` | 17 | 17 | 0 | 0 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19); 17 of 17 constituencies confirm it by number and name |
| Tripura | `delim-2008` | 2 | 2 | 0 | 0 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19, ahead of delim-1976 and delim-1963 and delim-1952); 2 of 2 constituencies confirm it by number and name |
| Uttar Pradesh | `delim-2008` | 80 | 79 | 0 | 1 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19, ahead of delim-1976 and delim-1963 and delim-1952); 79 of 80 constituencies confirm it by number and name |
| Uttarakhand | `delim-2008` | 5 | 5 | 0 | 0 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19, ahead of delim-1976); 5 of 5 constituencies confirm it by number and name |
| West Bengal | `delim-2008` | 42 | 41 | 0 | 1 | RESOLVED — in force at 2014-05-12 (effective 2008-02-19, ahead of delim-1976 and delim-1963 and delim-1952); 41 of 42 constituencies confirm it by number and name |

### Validation findings

| n | finding | examples |
| --- | --- | --- |
| 16 | `no-version` | AP 18 Araku; AP 24 Amlapuram; AS 10 Nagaon |
| 13 | `count-short` | ap delim-2008: 23 of 42 seats drawn; as delim-2008: 12 of 14 seats drawn; br delim-2008: 39 of 40 seats drawn |
| 6 | `self-touching-ring` | gj 24 Surat: 1; gj 22 Bharuch: 26; gj 15 Bhavnagar: 5 |
| 3 | `epoch-weakly-confirmed` | ap delim-2008: 17 of 42 names confirm it; dh delim-2008: 0 of 2 names confirm it; la delim-2008: 0 of 1 names confirm it |
| 1 | `outside-jurisdiction` | ld 1 Lakshadweep |

### Staged — 17 constituencies the pipeline refused to attach

These have geometry and no link. Each one is a decision somebody has to make with a document.

| Jurisdiction | Source no. | Source name | Reason | Detail |
| --- | --- | --- | --- | --- |
| ap | 18 | Araku | `no-version` | no place_version matched in ap/delim-2008, tg/delim-2008 |
| ap | 24 | Amlapuram | `no-version` | no place_version matched in ap/delim-2008, tg/delim-2008 |
| as | 7 | Guwahati | `no-version` | no place_version matched in as/delim-2008 |
| as | 10 | Nagaon | `no-version` | no place_version matched in as/delim-2008 |
| br | 22 | Ujiapur | `no-version` | no place_version matched in br/delim-2008 |
| dh | 1 | Dadra & Nagar Haveli | `no-version` | no place_version matched in dh/delim-2008 |
| gj | 7 | Ahmadabad (East) | `no-version` | no place_version matched in gj/delim-2008 |
| gj | 8 | Ahmadabad (West) | `no-version` | no place_version matched in gj/delim-2008 |
| gj | 18 | Panch Mahals | `no-version` | no place_version matched in gj/delim-2008 |
| jk | 4 | Leh (Ladakh) | `no-version` | no place_version matched in jk/delim-2008, la/delim-2008 |
| ld | 1 | Lakshadweep | `outside-jurisdiction` | box 82 561 43 76 falls outside Lakshadweep's 102 636 1 0 |
| mh | 12 | Garhchiroli - Chimur | `no-version` | no place_version matched in mh/delim-2008 |
| mh | 32 | Raigarh | `no-version` | no place_version matched in mh/delim-2008 |
| od | 4 | Kendujhar | `no-version` | no place_version matched in od/delim-2008 |
| od | 6 | Baleshwar | `no-version` | no place_version matched in od/delim-2008 |
| up | 78 | Sant Ravi Das Nagar (Bhadohi) | `no-version` | no place_version matched in up/delim-2008 |
| wb | 25 | Haora | `no-version` | no place_version matched in wb/delim-2008 |

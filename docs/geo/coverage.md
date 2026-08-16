# Electoral geometry coverage

**Generated — do not edit.** `npm run registry -- geography coverage --write`.

A row is one boundary epoch of one house of one jurisdiction, because that is the unit a polygon belongs
to: the same constituency name means a different shape under `delim-1976` and `delim-2008`. `Seats` counts
the place_versions that actually carry a contest, so it is what the map would have to draw and not every
version the registry has ever recorded.

| status | meaning |
| --- | --- |
| COMPLETE | every seat this epoch contests has a polygon |
| PARTIAL | some do |
| UNRESOLVED | the registry holds geometry for this jurisdiction and house in another epoch, and none for this one — the geometry exists and the LINK to this epoch is what could not be made |
| UNAVAILABLE | the registry holds no geometry for this jurisdiction and house at all |

Nothing is ever silently absent. UNRESOLVED and UNAVAILABLE are different admissions and only the first is
work waiting for someone.

## Current epoch of each house

| Jurisdiction | House | Epoch | Elections | Latest | Seats | Drawn | Source | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Andaman and Nicobar Islands | PC | `delim-2008` | 1 | 2024 | 1 | 1 | DataMeet India community | COMPLETE |
| Andhra Pradesh | AC | `delim-2008` | 11 | 2021 | 294 | 166 | DataMeet India community | PARTIAL |
| Andhra Pradesh | PC | `delim-2008` | 9 | 2024 | 42 | 23 | DataMeet India community | PARTIAL |
| Arunachal Pradesh | AC | `delim-2008` | 9 | 2019 | 60 | 59 | DataMeet India community | PARTIAL |
| Arunachal Pradesh | PC | `delim-2008` | 4 | 2024 | 2 | 2 | DataMeet India community | COMPLETE |
| Assam | AC | `delim-2008` | 9 | 2021 | 126 | 126 | DataMeet India community | COMPLETE |
| Assam | PC | `delim-2023-as` | 1 | 2024 | 14 | 0 | — | UNRESOLVED |
| Bihar | AC | `delim-2008` | 11 | 2021 | 243 | 242 | DataMeet India community | PARTIAL |
| Bihar | PC | `delim-2008` | 8 | 2024 | 40 | 39 | DataMeet India community | PARTIAL |
| Chandigarh | PC | `delim-2008` | 1 | 2024 | 1 | 1 | DataMeet India community | COMPLETE |
| Chhattisgarh | AC | `delim-2008` | 10 | 2020 | 90 | 87 | DataMeet India community | PARTIAL |
| Chhattisgarh | PC | `delim-2008` | 5 | 2024 | 11 | 11 | DataMeet India community | COMPLETE |
| Dadra and Nagar Haveli and Daman and Diu | PC | `delim-2008` | 1 | 2024 | 2 | 1 | DataMeet India community | PARTIAL |
| Delhi | AC | `delim-2008` | 6 | 2020 | 70 | 70 | DataMeet India community | COMPLETE |
| Delhi | PC | `delim-2008` | 4 | 2024 | 7 | 7 | DataMeet India community | COMPLETE |
| Goa | AC | `delim-2008` | 5 | 2022 | 40 | 40 | DataMeet India community | COMPLETE |
| Goa | PC | `delim-2008` | 4 | 2024 | 2 | 2 | DataMeet India community | COMPLETE |
| Gujarat | AC | `delim-2008` | 11 | 2022 | 182 | 162 | DataMeet India community | PARTIAL |
| Gujarat | PC | `delim-2008` | 6 | 2024 | 26 | 23 | DataMeet India community | PARTIAL |
| Haryana | AC | `delim-2008` | 8 | 2021 | 90 | 90 | DataMeet India community | COMPLETE |
| Haryana | PC | `delim-2008` | 5 | 2024 | 10 | 10 | DataMeet India community | COMPLETE |
| Himachal Pradesh | AC | `delim-2008` | 7 | 2022 | 68 | 68 | DataMeet India community | COMPLETE |
| Himachal Pradesh | PC | `delim-2008` | 6 | 2024 | 4 | 4 | DataMeet India community | COMPLETE |
| Jammu and Kashmir | AC | `delim-2008` | 4 | 2016 | 87 | 80 | DataMeet India community | PARTIAL |
| Jammu and Kashmir | PC | `delim-2022-jk` | 1 | 2024 | 5 | 0 | — | UNRESOLVED |
| Jharkhand | AC | `delim-2008` | 12 | 2021 | 81 | 0 | — | UNRESOLVED |
| Jharkhand | PC | `delim-2008` | 5 | 2024 | 14 | 14 | DataMeet India community | COMPLETE |
| Karnataka | AC | `delim-2008` | 15 | 2023 | 224 | 224 | DataMeet India community | COMPLETE |
| Karnataka | PC | `delim-2008` | 8 | 2024 | 28 | 28 | DataMeet India community | COMPLETE |
| Kerala | AC | `delim-2008` | 7 | 2021 | 140 | 140 | DataMeet India community | COMPLETE |
| Kerala | PC | `delim-2008` | 6 | 2024 | 20 | 20 | DataMeet India community | COMPLETE |
| Ladakh | PC | `delim-2008` | 1 | 2024 | 1 | 0 | — | UNAVAILABLE |
| Lakshadweep | PC | `delim-2008` | 1 | 2024 | 1 | 0 | — | UNAVAILABLE |
| Madhya Pradesh | AC | `delim-2008` | 14 | 2021 | 230 | 212 | DataMeet India community | PARTIAL |
| Madhya Pradesh | PC | `delim-2008` | 7 | 2024 | 29 | 29 | DataMeet India community | COMPLETE |
| Maharashtra | AC | `delim-2008` | 12 | 2021 | 288 | 285 | DataMeet India community | PARTIAL |
| Maharashtra | PC | `delim-2008` | 7 | 2024 | 48 | 46 | DataMeet India community | PARTIAL |
| Manipur | AC | `delim-2008` | 6 | 2022 | 60 | 60 | DataMeet India community | COMPLETE |
| Manipur | PC | `delim-2008` | 4 | 2024 | 2 | 2 | DataMeet India community | COMPLETE |
| Meghalaya | AC | `delim-2008` | 7 | 2023 | 60 | 60 | DataMeet India community | COMPLETE |
| Meghalaya | PC | `delim-2008` | 5 | 2024 | 2 | 2 | DataMeet India community | COMPLETE |
| Mizoram | AC | `delim-2008` | 9 | 2021 | 40 | 40 | DataMeet India community | COMPLETE |
| Mizoram | PC | `delim-2008` | 4 | 2024 | 1 | 1 | DataMeet India community | COMPLETE |
| Nagaland | AC | `delim-2008` | 12 | 2023 | 60 | 60 | DataMeet India community | COMPLETE |
| Nagaland | PC | `delim-2008` | 5 | 2024 | 1 | 1 | DataMeet India community | COMPLETE |
| Odisha | AC | `delim-2008` | 8 | 2020 | 147 | 143 | DataMeet India community | PARTIAL |
| Odisha | PC | `delim-2008` | 5 | 2024 | 21 | 19 | DataMeet India community | PARTIAL |
| Puducherry | AC | `delim-2008` | 6 | 2021 | 30 | 30 | DataMeet India community | COMPLETE |
| Puducherry | PC | `delim-2008` | 4 | 2024 | 1 | 1 | DataMeet India community | COMPLETE |
| Punjab | AC | `delim-2008` | 9 | 2022 | 117 | 117 | DataMeet India community | COMPLETE |
| Punjab | PC | `delim-2008` | 5 | 2024 | 13 | 13 | DataMeet India community | COMPLETE |
| Rajasthan | AC | `delim-2008` | 9 | 2021 | 200 | 199 | DataMeet India community | PARTIAL |
| Rajasthan | PC | `delim-2008` | 5 | 2024 | 25 | 25 | DataMeet India community | COMPLETE |
| Sikkim | AC | `delim-2008` | 7 | 2019 | 32 | 29 | DataMeet India community | PARTIAL |
| Sikkim | PC | `delim-2008` | 4 | 2024 | 1 | 1 | DataMeet India community | COMPLETE |
| Tamil Nadu | AC | `delim-2008` | 11 | 2021 | 234 | 231 | DataMeet India community | PARTIAL |
| Tamil Nadu | PC | `delim-2008` | 5 | 2024 | 39 | 39 | DataMeet India community | COMPLETE |
| Telangana | AC | `delim-2008` | 6 | 2021 | 119 | 119 | DataMeet India community | COMPLETE |
| Telangana | PC | `delim-2008` | 2 | 2024 | 17 | 17 | DataMeet India community | COMPLETE |
| Tripura | AC | `delim-2008` | 8 | 2023 | 60 | 60 | DataMeet India community | COMPLETE |
| Tripura | PC | `delim-2008` | 4 | 2024 | 2 | 2 | DataMeet India community | COMPLETE |
| Uttar Pradesh | AC | `delim-2008` | 12 | 2022 | 403 | 391 | DataMeet India community | PARTIAL |
| Uttar Pradesh | PC | `delim-2008` | 8 | 2024 | 80 | 79 | DataMeet India community | PARTIAL |
| Uttarakhand | AC | `delim-2008` | 9 | 2022 | 70 | 70 | DataMeet India community | COMPLETE |
| Uttarakhand | PC | `delim-2008` | 5 | 2024 | 5 | 5 | DataMeet India community | COMPLETE |
| West Bengal | AC | `delim-2008` | 14 | 2026 | 307 | 276 | DataMeet India community, WB assembly constituency outlines, projected SVG (repo module) | PARTIAL |
| West Bengal | PC | `delim-2008` | 10 | 2024 | 42 | 41 | DataMeet India community | PARTIAL |

203 groups over 36 jurisdictions — 47 COMPLETE, 28 PARTIAL, 126 UNRESOLVED, 2 UNAVAILABLE.
4950 of 16810 contested seats drawable across every epoch; 4445 of 4812 in the epoch each jurisdiction currently votes under.

## Every epoch

| Jurisdiction | House | Epoch | Elections | Latest | Seats | Drawn | Source | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Andaman and Nicobar Islands | PC | `delim-2008` | 1 | 2024 | 1 | 1 | DataMeet India community | COMPLETE |
| Andhra Pradesh | AC | `delim-1952` | 3 | 1965 | 300 | 0 | — | UNRESOLVED |
| Andhra Pradesh | AC | `delim-1963` | 4 | 1972 | 287 | 0 | — | UNRESOLVED |
| Andhra Pradesh | AC | `delim-1976` | 30 | 2008 | 294 | 0 | — | UNRESOLVED |
| Andhra Pradesh | AC | `delim-2008` | 11 | 2021 | 294 | 166 | DataMeet India community | PARTIAL |
| Andhra Pradesh | PC | `delim-1952` | 2 | 1965 | 43 | 0 | — | UNRESOLVED |
| Andhra Pradesh | PC | `delim-1963` | 3 | 1971 | 41 | 0 | — | UNRESOLVED |
| Andhra Pradesh | PC | `delim-1976` | 19 | 2008 | 42 | 0 | — | UNRESOLVED |
| Andhra Pradesh | PC | `delim-2008` | 9 | 2024 | 42 | 23 | DataMeet India community | PARTIAL |
| Arunachal Pradesh | AC | `delim-1976` | 11 | 2006 | 60 | 59 | DataMeet India community | PARTIAL |
| Arunachal Pradesh | AC | `delim-2008` | 9 | 2019 | 60 | 59 | DataMeet India community | PARTIAL |
| Arunachal Pradesh | PC | `delim-1976` | 9 | 2004 | 2 | 2 | DataMeet India community | COMPLETE |
| Arunachal Pradesh | PC | `delim-2008` | 4 | 2024 | 2 | 2 | DataMeet India community | COMPLETE |
| Assam | AC | `delim-1952` | 4 | 1965 | 105 | 0 | — | UNRESOLVED |
| Assam | AC | `delim-1963` | 3 | 1972 | 125 | 0 | — | UNRESOLVED |
| Assam | AC | `delim-1976` | 19 | 2009 | 126 | 126 | DataMeet India community | COMPLETE |
| Assam | AC | `delim-2008` | 9 | 2021 | 126 | 126 | DataMeet India community | COMPLETE |
| Assam | PC | `delim-1952` | 1 | 1962 | 12 | 0 | — | UNRESOLVED |
| Assam | PC | `delim-1963` | 5 | 1972 | 14 | 0 | — | UNRESOLVED |
| Assam | PC | `delim-1976` | 9 | 2004 | 14 | 12 | DataMeet India community | PARTIAL |
| Assam | PC | `delim-2008` | 4 | 2019 | 14 | 12 | DataMeet India community | PARTIAL |
| Assam | PC | `delim-2023-as` | 1 | 2024 | 14 | 0 | — | UNRESOLVED |
| Bihar | AC | `delim-1952` | 3 | 1964 | 318 | 0 | — | UNRESOLVED |
| Bihar | AC | `delim-1963` | 5 | 1972 | 318 | 0 | — | UNRESOLVED |
| Bihar | AC | `delim-1976` | 27 | 2009 | 324 | 0 | — | UNRESOLVED |
| Bihar | AC | `delim-2008` | 11 | 2021 | 243 | 242 | DataMeet India community | PARTIAL |
| Bihar | PC | `delim-1952` | 2 | 1964 | 53 | 0 | — | UNRESOLVED |
| Bihar | PC | `delim-1963` | 5 | 1972 | 53 | 0 | — | UNRESOLVED |
| Bihar | PC | `delim-1976` | 20 | 2006 | 54 | 0 | — | UNRESOLVED |
| Bihar | PC | `delim-2008` | 8 | 2024 | 40 | 39 | DataMeet India community | PARTIAL |
| Chandigarh | PC | `delim-2008` | 1 | 2024 | 1 | 1 | DataMeet India community | COMPLETE |
| Chhattisgarh | AC | `delim-1976` | 4 | 2007 | 90 | 0 | — | UNRESOLVED |
| Chhattisgarh | AC | `delim-2008` | 10 | 2020 | 90 | 87 | DataMeet India community | PARTIAL |
| Chhattisgarh | PC | `delim-1976` | 2 | 2007 | 11 | 0 | — | UNRESOLVED |
| Chhattisgarh | PC | `delim-2008` | 5 | 2024 | 11 | 11 | DataMeet India community | COMPLETE |
| Dadra and Nagar Haveli and Daman and Diu | PC | `delim-2008` | 1 | 2024 | 2 | 1 | DataMeet India community | PARTIAL |
| Delhi | AC | `delim-1963` | 1 | 1972 | 56 | 0 | — | UNRESOLVED |
| Delhi | AC | `delim-1976` | 8 | 2004 | 70 | 0 | — | UNRESOLVED |
| Delhi | AC | `delim-2008` | 6 | 2020 | 70 | 70 | DataMeet India community | COMPLETE |
| Delhi | PC | `delim-1952` | 1 | 1962 | 5 | 0 | — | UNRESOLVED |
| Delhi | PC | `delim-1963` | 2 | 1971 | 7 | 0 | — | UNRESOLVED |
| Delhi | PC | `delim-1976` | 12 | 2004 | 7 | 0 | — | UNRESOLVED |
| Delhi | PC | `delim-2008` | 4 | 2024 | 7 | 7 | DataMeet India community | COMPLETE |
| Goa | AC | `delim-1976` | 10 | 2010 | 40 | 0 | — | UNRESOLVED |
| Goa | AC | `delim-2008` | 5 | 2022 | 40 | 40 | DataMeet India community | COMPLETE |
| Goa | PC | `delim-1976` | 7 | 2007 | 2 | 0 | — | UNRESOLVED |
| Goa | PC | `delim-2008` | 4 | 2024 | 2 | 2 | DataMeet India community | COMPLETE |
| Gujarat | AC | `delim-1952` | 2 | 1964 | 154 | 0 | — | UNRESOLVED |
| Gujarat | AC | `delim-1963` | 3 | 1972 | 168 | 0 | — | UNRESOLVED |
| Gujarat | AC | `delim-1976` | 28 | 2011 | 182 | 0 | — | UNRESOLVED |
| Gujarat | AC | `delim-2008` | 11 | 2022 | 182 | 162 | DataMeet India community | PARTIAL |
| Gujarat | PC | `delim-1952` | 1 | 1962 | 22 | 0 | — | UNRESOLVED |
| Gujarat | PC | `delim-1963` | 5 | 1972 | 24 | 0 | — | UNRESOLVED |
| Gujarat | PC | `delim-1976` | 14 | 2004 | 26 | 0 | — | UNRESOLVED |
| Gujarat | PC | `delim-2008` | 6 | 2024 | 26 | 23 | DataMeet India community | PARTIAL |
| Haryana | AC | `delim-1963` | 5 | 1972 | 81 | 0 | — | UNRESOLVED |
| Haryana | AC | `delim-1976` | 24 | 2008 | 90 | 0 | — | UNRESOLVED |
| Haryana | AC | `delim-2008` | 8 | 2021 | 90 | 90 | DataMeet India community | COMPLETE |
| Haryana | PC | `delim-1963` | 2 | 1971 | 9 | 0 | — | UNRESOLVED |
| Haryana | PC | `delim-1976` | 13 | 2005 | 10 | 0 | — | UNRESOLVED |
| Haryana | PC | `delim-2008` | 5 | 2024 | 10 | 10 | DataMeet India community | COMPLETE |
| Himachal Pradesh | AC | `delim-1963` | 2 | 1972 | 68 | 0 | — | UNRESOLVED |
| Himachal Pradesh | AC | `delim-1976` | 17 | 2011 | 68 | 0 | — | UNRESOLVED |
| Himachal Pradesh | AC | `delim-2008` | 7 | 2022 | 68 | 68 | DataMeet India community | COMPLETE |
| Himachal Pradesh | PC | `delim-1952` | 1 | 1962 | 4 | 0 | — | UNRESOLVED |
| Himachal Pradesh | PC | `delim-1963` | 2 | 1971 | 6 | 0 | — | UNRESOLVED |
| Himachal Pradesh | PC | `delim-1976` | 11 | 2008 | 4 | 0 | — | UNRESOLVED |
| Himachal Pradesh | PC | `delim-2008` | 6 | 2024 | 4 | 4 | DataMeet India community | COMPLETE |
| Jammu and Kashmir | AC | `delim-1952` | 1 | 1962 | 75 | 0 | — | UNRESOLVED |
| Jammu and Kashmir | AC | `delim-1963` | 2 | 1972 | 75 | 0 | — | UNRESOLVED |
| Jammu and Kashmir | AC | `delim-1976` | 14 | 2006 | 87 | 80 | DataMeet India community | PARTIAL |
| Jammu and Kashmir | AC | `delim-2008` | 4 | 2016 | 87 | 80 | DataMeet India community | PARTIAL |
| Jammu and Kashmir | PC | `delim-1963` | 3 | 1971 | 6 | 0 | — | UNRESOLVED |
| Jammu and Kashmir | PC | `delim-1976` | 10 | 2004 | 6 | 5 | DataMeet India community | PARTIAL |
| Jammu and Kashmir | PC | `delim-2008` | 4 | 2019 | 6 | 5 | DataMeet India community | PARTIAL |
| Jammu and Kashmir | PC | `delim-2022-jk` | 1 | 2024 | 5 | 0 | — | UNRESOLVED |
| Jharkhand | AC | `delim-1976` | 3 | 2008 | 81 | 81 | DataMeet India community | COMPLETE |
| Jharkhand | AC | `delim-2008` | 12 | 2021 | 81 | 0 | — | UNRESOLVED |
| Jharkhand | PC | `delim-1976` | 3 | 2007 | 14 | 0 | — | UNRESOLVED |
| Jharkhand | PC | `delim-2008` | 5 | 2024 | 14 | 14 | DataMeet India community | COMPLETE |
| Karnataka | AC | `delim-1976` | 28 | 2007 | 224 | 0 | — | UNRESOLVED |
| Karnataka | AC | `delim-2008` | 15 | 2023 | 224 | 224 | DataMeet India community | COMPLETE |
| Karnataka | PC | `delim-1976` | 16 | 2005 | 28 | 0 | — | UNRESOLVED |
| Karnataka | PC | `delim-2008` | 8 | 2024 | 28 | 28 | DataMeet India community | COMPLETE |
| Kerala | AC | `delim-1963` | 5 | 1972 | 133 | 0 | — | UNRESOLVED |
| Kerala | AC | `delim-1976` | 24 | 2009 | 140 | 0 | — | UNRESOLVED |
| Kerala | AC | `delim-2008` | 7 | 2021 | 140 | 140 | DataMeet India community | COMPLETE |
| Kerala | PC | `delim-1952` | 1 | 1962 | 18 | 0 | — | UNRESOLVED |
| Kerala | PC | `delim-1963` | 3 | 1971 | 19 | 0 | — | UNRESOLVED |
| Kerala | PC | `delim-1976` | 13 | 2005 | 20 | 0 | — | UNRESOLVED |
| Kerala | PC | `delim-2008` | 6 | 2024 | 20 | 20 | DataMeet India community | COMPLETE |
| Ladakh | PC | `delim-2008` | 1 | 2024 | 1 | 0 | — | UNAVAILABLE |
| Lakshadweep | PC | `delim-2008` | 1 | 2024 | 1 | 0 | — | UNAVAILABLE |
| Madhya Pradesh | AC | `delim-1952` | 4 | 1965 | 288 | 0 | — | UNRESOLVED |
| Madhya Pradesh | AC | `delim-1963` | 6 | 1972 | 296 | 0 | — | UNRESOLVED |
| Madhya Pradesh | AC | `delim-1976` | 28 | 2007 | 320 | 0 | — | UNRESOLVED |
| Madhya Pradesh | AC | `delim-2008` | 14 | 2021 | 230 | 212 | DataMeet India community | PARTIAL |
| Madhya Pradesh | PC | `delim-1952` | 3 | 1964 | 36 | 0 | — | UNRESOLVED |
| Madhya Pradesh | PC | `delim-1963` | 5 | 1972 | 37 | 0 | — | UNRESOLVED |
| Madhya Pradesh | PC | `delim-1976` | 19 | 2008 | 40 | 0 | — | UNRESOLVED |
| Madhya Pradesh | PC | `delim-2008` | 7 | 2024 | 29 | 29 | DataMeet India community | COMPLETE |
| Maharashtra | AC | `delim-1952` | 4 | 1965 | 264 | 0 | — | UNRESOLVED |
| Maharashtra | AC | `delim-1963` | 5 | 1972 | 270 | 0 | — | UNRESOLVED |
| Maharashtra | AC | `delim-1976` | 24 | 2006 | 288 | 0 | — | UNRESOLVED |
| Maharashtra | AC | `delim-2008` | 12 | 2021 | 288 | 285 | DataMeet India community | PARTIAL |
| Maharashtra | PC | `delim-1952` | 4 | 1965 | 44 | 0 | — | UNRESOLVED |
| Maharashtra | PC | `delim-1963` | 5 | 1972 | 45 | 0 | — | UNRESOLVED |
| Maharashtra | PC | `delim-1976` | 20 | 2008 | 49 | 0 | — | UNRESOLVED |
| Maharashtra | PC | `delim-2008` | 7 | 2024 | 48 | 46 | DataMeet India community | PARTIAL |
| Manipur | AC | `delim-1963` | 2 | 1972 | 60 | 0 | — | UNRESOLVED |
| Manipur | AC | `delim-1976` | 18 | 2009 | 60 | 60 | DataMeet India community | COMPLETE |
| Manipur | AC | `delim-2008` | 6 | 2022 | 60 | 60 | DataMeet India community | COMPLETE |
| Manipur | PC | `delim-1952` | 1 | 1962 | 2 | 0 | — | UNRESOLVED |
| Manipur | PC | `delim-1963` | 2 | 1971 | 2 | 0 | — | UNRESOLVED |
| Manipur | PC | `delim-1976` | 10 | 2004 | 2 | 2 | DataMeet India community | COMPLETE |
| Manipur | PC | `delim-2008` | 4 | 2024 | 2 | 2 | DataMeet India community | COMPLETE |
| Meghalaya | AC | `delim-1963` | 1 | 1972 | 60 | 0 | — | UNRESOLVED |
| Meghalaya | AC | `delim-1976` | 16 | 2009 | 60 | 0 | — | UNRESOLVED |
| Meghalaya | AC | `delim-2008` | 7 | 2023 | 60 | 60 | DataMeet India community | COMPLETE |
| Meghalaya | PC | `delim-1963` | 1 | 1972 | 1 | 0 | — | UNRESOLVED |
| Meghalaya | PC | `delim-1976` | 11 | 2006 | 2 | 0 | — | UNRESOLVED |
| Meghalaya | PC | `delim-2008` | 5 | 2024 | 2 | 2 | DataMeet India community | COMPLETE |
| Mizoram | AC | `delim-1963` | 1 | 1972 | 30 | 0 | — | UNRESOLVED |
| Mizoram | AC | `delim-1976` | 13 | 2006 | 40 | 0 | — | UNRESOLVED |
| Mizoram | AC | `delim-2008` | 9 | 2021 | 40 | 40 | DataMeet India community | COMPLETE |
| Mizoram | PC | `delim-1963` | 1 | 1972 | 1 | 0 | — | UNRESOLVED |
| Mizoram | PC | `delim-1976` | 8 | 2004 | 1 | 0 | — | UNRESOLVED |
| Mizoram | PC | `delim-2008` | 4 | 2024 | 1 | 1 | DataMeet India community | COMPLETE |
| Nagaland | AC | `delim-1963` | 4 | 1971 | 40 | 0 | — | UNRESOLVED |
| Nagaland | AC | `delim-1976` | 19 | 2007 | 60 | 60 | DataMeet India community | COMPLETE |
| Nagaland | AC | `delim-2008` | 12 | 2023 | 60 | 60 | DataMeet India community | COMPLETE |
| Nagaland | PC | `delim-1963` | 2 | 1971 | 1 | 0 | — | UNRESOLVED |
| Nagaland | PC | `delim-1976` | 9 | 2004 | 1 | 1 | DataMeet India community | COMPLETE |
| Nagaland | PC | `delim-2008` | 5 | 2024 | 1 | 1 | DataMeet India community | COMPLETE |
| Odisha | AC | `delim-1952` | 1 | 1961 | 140 | 0 | — | UNRESOLVED |
| Odisha | AC | `delim-1963` | 5 | 1972 | 140 | 0 | — | UNRESOLVED |
| Odisha | AC | `delim-1976` | 23 | 2008 | 147 | 0 | — | UNRESOLVED |
| Odisha | AC | `delim-2008` | 8 | 2020 | 147 | 143 | DataMeet India community | PARTIAL |
| Odisha | PC | `delim-1952` | 1 | 1962 | 20 | 0 | — | UNRESOLVED |
| Odisha | PC | `delim-1963` | 3 | 1972 | 20 | 0 | — | UNRESOLVED |
| Odisha | PC | `delim-1976` | 15 | 2004 | 21 | 0 | — | UNRESOLVED |
| Odisha | PC | `delim-2008` | 5 | 2024 | 21 | 19 | DataMeet India community | PARTIAL |
| Puducherry | AC | `delim-1963` | 2 | 1969 | 30 | 0 | — | UNRESOLVED |
| Puducherry | AC | `delim-1976` | 12 | 2006 | 30 | 0 | — | UNRESOLVED |
| Puducherry | AC | `delim-2008` | 6 | 2021 | 30 | 30 | DataMeet India community | COMPLETE |
| Puducherry | PC | `delim-1963` | 2 | 1971 | 1 | 0 | — | UNRESOLVED |
| Puducherry | PC | `delim-1976` | 9 | 2004 | 1 | 0 | — | UNRESOLVED |
| Puducherry | PC | `delim-2008` | 4 | 2024 | 1 | 1 | DataMeet India community | COMPLETE |
| Punjab | AC | `delim-1952` | 3 | 1965 | 154 | 0 | — | UNRESOLVED |
| Punjab | AC | `delim-1963` | 5 | 1972 | 104 | 0 | — | UNRESOLVED |
| Punjab | AC | `delim-1976` | 20 | 2009 | 117 | 0 | — | UNRESOLVED |
| Punjab | AC | `delim-2008` | 9 | 2022 | 117 | 117 | DataMeet India community | COMPLETE |
| Punjab | PC | `delim-1952` | 1 | 1962 | 22 | 0 | — | UNRESOLVED |
| Punjab | PC | `delim-1963` | 5 | 1972 | 13 | 0 | — | UNRESOLVED |
| Punjab | PC | `delim-1976` | 13 | 2007 | 13 | 0 | — | UNRESOLVED |
| Punjab | PC | `delim-2008` | 5 | 2024 | 13 | 13 | DataMeet India community | COMPLETE |
| Rajasthan | AC | `delim-1952` | 3 | 1965 | 176 | 0 | — | UNRESOLVED |
| Rajasthan | AC | `delim-1963` | 4 | 1972 | 184 | 0 | — | UNRESOLVED |
| Rajasthan | AC | `delim-1976` | 24 | 2006 | 200 | 0 | — | UNRESOLVED |
| Rajasthan | AC | `delim-2008` | 9 | 2021 | 200 | 199 | DataMeet India community | PARTIAL |
| Rajasthan | PC | `delim-1952` | 2 | 1964 | 22 | 0 | — | UNRESOLVED |
| Rajasthan | PC | `delim-1963` | 3 | 1971 | 23 | 0 | — | UNRESOLVED |
| Rajasthan | PC | `delim-1976` | 15 | 2004 | 25 | 0 | — | UNRESOLVED |
| Rajasthan | PC | `delim-2008` | 5 | 2024 | 25 | 25 | DataMeet India community | COMPLETE |
| Sikkim | AC | `delim-1976` | 7 | 2004 | 32 | 0 | — | UNRESOLVED |
| Sikkim | AC | `delim-2008` | 7 | 2019 | 32 | 29 | DataMeet India community | PARTIAL |
| Sikkim | PC | `delim-1976` | 10 | 2004 | 1 | 0 | — | UNRESOLVED |
| Sikkim | PC | `delim-2008` | 4 | 2024 | 1 | 1 | DataMeet India community | COMPLETE |
| Tamil Nadu | AC | `delim-1963` | 2 | 1971 | 234 | 0 | — | UNRESOLVED |
| Tamil Nadu | AC | `delim-1976` | 27 | 2010 | 234 | 0 | — | UNRESOLVED |
| Tamil Nadu | AC | `delim-2008` | 11 | 2021 | 234 | 231 | DataMeet India community | PARTIAL |
| Tamil Nadu | PC | `delim-1963` | 4 | 1971 | 39 | 0 | — | UNRESOLVED |
| Tamil Nadu | PC | `delim-1976` | 14 | 2004 | 39 | 0 | — | UNRESOLVED |
| Tamil Nadu | PC | `delim-2008` | 5 | 2024 | 39 | 39 | DataMeet India community | COMPLETE |
| Telangana | AC | `delim-2008` | 6 | 2021 | 119 | 119 | DataMeet India community | COMPLETE |
| Telangana | PC | `delim-2008` | 2 | 2024 | 17 | 17 | DataMeet India community | COMPLETE |
| Tripura | AC | `delim-1963` | 2 | 1972 | 60 | 0 | — | UNRESOLVED |
| Tripura | AC | `delim-1976` | 15 | 2012 | 60 | 0 | — | UNRESOLVED |
| Tripura | AC | `delim-2008` | 8 | 2023 | 60 | 60 | DataMeet India community | COMPLETE |
| Tripura | PC | `delim-1952` | 1 | 1962 | 2 | 0 | — | UNRESOLVED |
| Tripura | PC | `delim-1963` | 2 | 1971 | 2 | 0 | — | UNRESOLVED |
| Tripura | PC | `delim-1976` | 10 | 2004 | 2 | 0 | — | UNRESOLVED |
| Tripura | PC | `delim-2008` | 4 | 2024 | 2 | 2 | DataMeet India community | COMPLETE |
| Uttar Pradesh | AC | `delim-1952` | 3 | 1965 | 430 | 0 | — | UNRESOLVED |
| Uttar Pradesh | AC | `delim-1963` | 7 | 1972 | 425 | 0 | — | UNRESOLVED |
| Uttar Pradesh | AC | `delim-1976` | 36 | 2011 | 425 | 0 | — | UNRESOLVED |
| Uttar Pradesh | AC | `delim-2008` | 12 | 2022 | 403 | 391 | DataMeet India community | PARTIAL |
| Uttar Pradesh | PC | `delim-1952` | 3 | 1965 | 86 | 0 | — | UNRESOLVED |
| Uttar Pradesh | PC | `delim-1963` | 6 | 1971 | 85 | 0 | — | UNRESOLVED |
| Uttar Pradesh | PC | `delim-1976` | 25 | 2008 | 85 | 0 | — | UNRESOLVED |
| Uttar Pradesh | PC | `delim-2008` | 8 | 2024 | 80 | 79 | DataMeet India community | PARTIAL |
| Uttarakhand | AC | `delim-1976` | 7 | 2009 | 70 | 0 | — | UNRESOLVED |
| Uttarakhand | AC | `delim-2008` | 9 | 2022 | 70 | 70 | DataMeet India community | COMPLETE |
| Uttarakhand | PC | `delim-1976` | 2 | 2007 | 5 | 0 | — | UNRESOLVED |
| Uttarakhand | PC | `delim-2008` | 5 | 2024 | 5 | 5 | DataMeet India community | COMPLETE |
| West Bengal | AC | `delim-1952` | 3 | 1964 | 252 | 0 | — | UNRESOLVED |
| West Bengal | AC | `delim-1963` | 6 | 1972 | 280 | 0 | — | UNRESOLVED |
| West Bengal | AC | `delim-1976` | 27 | 2010 | 294 | 0 | — | UNRESOLVED |
| West Bengal | AC | `delim-2008` | 14 | 2026 | 307 | 276 | DataMeet India community, WB assembly constituency outlines, projected SVG (repo module) | PARTIAL |
| West Bengal | PC | `delim-1952` | 2 | 1963 | 36 | 0 | — | UNRESOLVED |
| West Bengal | PC | `delim-1963` | 6 | 1972 | 40 | 0 | — | UNRESOLVED |
| West Bengal | PC | `delim-1976` | 19 | 2006 | 42 | 0 | — | UNRESOLVED |
| West Bengal | PC | `delim-2008` | 10 | 2024 | 42 | 41 | DataMeet India community | PARTIAL |

203 groups over 36 jurisdictions — 47 COMPLETE, 28 PARTIAL, 126 UNRESOLVED, 2 UNAVAILABLE.
4950 of 16810 contested seats drawable across every epoch; 4445 of 4812 in the epoch each jurisdiction currently votes under.

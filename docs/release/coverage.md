# National coverage

## What the registry holds

**Generated — do not edit.** `npm run release:report`. Every figure is a query; none is typed.

### Registry

| | |
| --- | --- |
| jurisdictions with results | **32** |
| election events | **1202** |
| &nbsp;&nbsp;of those, assembly | **355** |
| &nbsp;&nbsp;of those, general (Lok Sabha) | **18** |
| &nbsp;&nbsp;of those, by-elections | **829** |
| contests | **64033** |
| candidacies | **569269** |
| result rows | **566580** |
| declared winners | **63944** |
| persons | **454322** |
| parties | **3330** |
| places | **5813** |
| place versions | **16829** |
| boundary epochs | **6** |
| turnout rows | **64028** |
| affidavits | **2920** |

### Sources

| | |
| --- | --- |
| sources | **3010** |
| &nbsp;&nbsp;bytes fetched and hashed | **86** — the rest are cited by locator and have never been held |
| &nbsp;&nbsp;never fetched (url_only) | **2924** |
| &nbsp;&nbsp;a repo module rather than a publication | **7** |
| &nbsp;&nbsp;boundary datasets | **2** |
| results carrying a source | **566580** — of 566580 |
| claims with a citation | **25517** — of 25517 |

### Entity resolution

| | |
| --- | --- |
| candidacies with an unresolved party string | **554962** |
| person merges applied | **1202** |
| merge candidates awaiting review | **52187** |
| place versions two sources disagree about | **220** — the name at a seat number differs between sources |
| party ids differing from another only in case | **4** |

### Electoral geography

| | |
| --- | --- |
| constituency polygons | **5000** |
| &nbsp;&nbsp;coordinate spaces they are in | **2** — more than one cannot be drawn together |
| seats contested in the current epoch | **4812** |
| &nbsp;&nbsp;of those, drawable | **4445** |
| seats contested in any epoch | **16810** |
| &nbsp;&nbsp;of those, drawable | **4950** |
| groups COMPLETE | **47** |
| groups PARTIAL | **28** |
| groups UNRESOLVED | **126** — geometry held for another epoch of the same house |
| groups UNAVAILABLE | **2** |

### The newest full election of each house of each jurisdiction

| Jurisdiction | House | Year | Epoch | Seats | Decided | Drawn | Results | Geometry |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Andhra Pradesh | AC | 2019 | `delim-2008` | 175 | 174 | 47 | PARTIAL | PARTIAL |
| Arunachal Pradesh | AC | 2019 | `delim-2008` | 60 | 60 | 59 | COMPLETE | PARTIAL |
| Assam | AC | 2021 | `delim-2008` | 126 | 126 | 126 | COMPLETE | COMPLETE |
| Bihar | AC | 2020 | `delim-2008` | 243 | 243 | 242 | COMPLETE | PARTIAL |
| Chhattisgarh | AC | 2018 | `delim-2008` | 90 | 90 | 87 | COMPLETE | PARTIAL |
| Delhi | AC | 2020 | `delim-2008` | 70 | 70 | 70 | COMPLETE | COMPLETE |
| Goa | AC | 2022 | `delim-2008` | 40 | 40 | 40 | COMPLETE | COMPLETE |
| Gujarat | AC | 2022 | `delim-2008` | 182 | 182 | 162 | COMPLETE | PARTIAL |
| Haryana | AC | 2019 | `delim-2008` | 90 | 90 | 90 | COMPLETE | COMPLETE |
| Himachal Pradesh | AC | 2022 | `delim-2008` | 68 | 68 | 68 | COMPLETE | COMPLETE |
| India | PC | 2024 | `delim-2008` | 543 | 542 | 492 | PARTIAL | PARTIAL |
| Jammu and Kashmir | AC | 2014 | `delim-2008` | 87 | 87 | 80 | COMPLETE | PARTIAL |
| Jharkhand | AC | 2019 | `delim-2008` | 81 | 81 | 0 | COMPLETE | UNAVAILABLE |
| Karnataka | AC | 2023 | `delim-2008` | 224 | 223 | 224 | PARTIAL | COMPLETE |
| Kerala | AC | 2021 | `delim-2008` | 140 | 140 | 140 | COMPLETE | COMPLETE |
| Madhya Pradesh | AC | 2018 | `delim-2008` | 230 | 230 | 212 | COMPLETE | PARTIAL |
| Maharashtra | AC | 2019 | `delim-2008` | 288 | 288 | 285 | COMPLETE | PARTIAL |
| Manipur | AC | 2022 | `delim-2008` | 60 | 60 | 60 | COMPLETE | COMPLETE |
| Meghalaya | AC | 2023 | `delim-2008` | 59 | 59 | 59 | COMPLETE | COMPLETE |
| Mizoram | AC | 2018 | `delim-2008` | 40 | 40 | 40 | COMPLETE | COMPLETE |
| Nagaland | AC | 2023 | `delim-2008` | 60 | 60 | 60 | COMPLETE | COMPLETE |
| Odisha | AC | 2019 | `delim-2008` | 146 | 146 | 142 | COMPLETE | PARTIAL |
| Puducherry | AC | 2021 | `delim-2008` | 30 | 30 | 30 | COMPLETE | COMPLETE |
| Punjab | AC | 2022 | `delim-2008` | 117 | 117 | 117 | COMPLETE | COMPLETE |
| Rajasthan | AC | 2018 | `delim-2008` | 199 | 199 | 198 | COMPLETE | PARTIAL |
| Sikkim | AC | 2019 | `delim-2008` | 32 | 32 | 29 | COMPLETE | PARTIAL |
| Tamil Nadu | AC | 2021 | `delim-2008` | 234 | 234 | 231 | COMPLETE | PARTIAL |
| Telangana | AC | 2018 | `delim-2008` | 119 | 118 | 119 | PARTIAL | COMPLETE |
| Tripura | AC | 2023 | `delim-2008` | 60 | 60 | 60 | COMPLETE | COMPLETE |
| Uttar Pradesh | AC | 2022 | `delim-2008` | 403 | 403 | 391 | COMPLETE | PARTIAL |
| Uttarakhand | AC | 2022 | `delim-2008` | 70 | 70 | 70 | COMPLETE | COMPLETE |
| West Bengal | AC | 2026 | `delim-2008` | 294 | 293 | 263 | PARTIAL | PARTIAL |

### Caveats the registry can see in itself

| n | what | detail |
| --- | --- | --- |
| 20 | one constituency held by two place_versions | wb ac delim-2008, e.g. BADURIA — same name, same district, two versions |
| 1 | one constituency held by two place_versions | mh ac delim-1963, e.g. AURANGABADWEST — same name, same district, two versions |

# Stage 2 — where electoral geometry can honestly come from

The brief's hierarchy is Election Commission first, then the Delimitation Commission's orders, then Survey of
India for administrative geography, then other government sources, and only then a reputable secondary one.
This is that search, the classification it produced, and the evidence for each verdict.

**The finding in one line: the Election Commission publishes no vector electoral geometry.** Its delimitation
output is a 639-page order in prose and two scanned notifications. The highest tier actually available is a
secondary dataset whose upstream is an ECI system.

## Reachability, stated first

| host | result today (2026-08-12) |
| --- | --- |
| `www.eci.gov.in` | **HTTP 403** at the edge — `Access Denied`, with a reference id, for the site root, `/api/delimitation-orders-publication` and `/delimitation-website` alike, with a browser user-agent |
| `psleci.nic.in` | HTTP 403 over http, no TLS handshake over https |
| `surveyofindia.gov.in`, `onlinemaps.surveyofindia.gov.in` | no connection |
| `raw.githubusercontent.com` | reachable |

Phase 1.5 reached the ECI on 2026-08-11 and Phase 1 reached it on the same day, so this is an upstream
change rather than a permanent property. **The consequence for this phase is stated rather than worked
around: no new ECI document was acquired.** The classification below rests on the eight documents Phase 1.5
already fetched and hashed, which are the relevant ones, and on the secondary source's own declaration of
its upstream.

## What the ECI actually publishes, measured from the bytes

`ops/probe/eci/pdf-text-layer.mjs` over `.data/cache/eci/delimitation/`, which inflates every FlateDecode
stream and counts font objects, image objects and text-showing operators:

| document | bytes | sha256 | fonts | images | text ops | verdict |
| --- | --- | --- | --- | --- | --- | --- |
| DPACO 2008 (`dpaco-2008.pdf`) | 1,340,728 | `9e1ac49a…` | 23 | **2** | 45,693 | **TEXT_DESCRIPTION** |
| Assam final notification 2023 | 6,925,403 | `dce6860c…` | **0** | **210** | **0** | **MAP_ONLY** (raster scan) |
| J&K final notification 2022 | 13,281,500 | `d5153ac5…` | 20 | 20 | **0** | **MAP_ONLY** (raster scan) |
| ECI notification 06.03.2020 | 802,065 | `6dacd914…` | 0 | 2 | 0 | MAP_ONLY / scan |
| S.O. 903(E) 2020 | 901,897 | `41e30756…` | 0 | 0 | 1,715 | TEXT (statutory, no geometry) |
| S.O. 2223(E) 2022 | 985,857 | `5f16baf3…` | 0 | 0 | 503 | TEXT (statutory, no geometry) |
| S.O. 1023(E) 2021 | 1,423,758 | `dec5e9f6…` | 0 | 0 | 540 | TEXT (statutory, no geometry) |
| J&K Reorganisation Act 2019 | 1,324,210 | `11d23202…` | 0 | 1 | 4,553 | TEXT (statutory, no geometry) |

Read that table against the brief's warning — *"Do not claim a constituency polygon exists merely because a
PDF contains a map."*

**DPACO 2008 has two image objects in 639 pages.** It is not a map document at all: it defines each
constituency by naming the administrative units it contains — tehsils, revenue circles, municipal wards.
Turning that into polygons means holding the boundaries of every one of those units for 2008 and dissolving
them per constituency. Those boundaries are not in the order and the ECI does not publish them. So DPACO
2008 is DERIVABLE_VECTOR only in the presence of a second, complete, dated administrative geometry that
nobody in this search could reach — which makes it TEXT_DESCRIPTION for our purposes, and a project rather
than a phase.

**The two documents that matter most are scans.** Assam 2023 and J&K 2022 are the two epochs a current map
most needs and the two whose only published form is 210 and 20 raster images with no text layer at all.
Extracting polygons means georeferencing a scan by eye. The brief names that as a stop condition —
*"a PDF is the only source and polygon extraction would be unreliable"* — and it is the correct call:
`delim-2023-as` and `delim-2022-jk` get **no geometry in this release**, and the product says so.

## Survey of India

Unreachable, and — the more important point — **the wrong kind of data**. Survey of India publishes
administrative boundaries: states, districts, villages. A constituency is not an administrative unit. It is
drawn by the Delimitation Commission over administrative units and is not derivable from them without the
order's extent lists (above). The product already uses an administrative dataset for its national basemap,
and the distinction the brief draws — administrative geometry is not electoral geometry — is exactly why
that basemap cannot be the electoral map.

## The source this phase uses

**DataMeet India community, `github.com/datameet/maps`.** Not chosen because it exists. Chosen because it is
the only vector electoral geometry for India that (a) declares its upstream, (b) declares its own defects,
(c) carries a licence, and (d) can be hashed and re-fetched deterministically.

### Assembly constituencies

| | |
| --- | --- |
| File | `docs/data/geojson/ac.geojson` |
| Bytes / sha256 | 18,068,883 / `768522fdbd7d736144b2d0c5ac87bb6680735f222244851fdd10b36ce74d9a20` |
| Features | 4,182 — 4,098 `Polygon`, 84 `MultiPolygon` |
| CRS | `GEOGCS["GCS_WGS_1984"…]` from `India_AC.prj`, i.e. EPSG:4326 |
| Licence | Creative Commons Attribution 2.5 India, declared in the dataset's README |
| Fields | `ST_NAME`, `ST_CODE`, `DIST_NAME`, `AC_NO`, `AC_NAME`, `PC_NO`, `PC_NAME`, `STATUS` |
| Classification | **DIRECT_VECTOR** |

**Upstream, in the publisher's own words:** *"The Assembly Constituencies of India, Scraped from ECI's
Polling Station Locations (psleci.nic.in) Website."* Corroborated by the shapefile's ESRI metadata
(`India_AC.shp.xml`, sha256 `c77d6749…`): created **2014-11-24** in ArcGIS from a layer named `AS_Poly` at
`file://\\EGPDDA\D$\Dev_Documents\ArcGIS\Default.gdb`, in `GCS_WGS_1984`. An internal government workstation
path, consistent with an NIC-built ECI system, not with a hand digitisation.

**Its declared defects, which the pipeline acts on rather than notes:**

1. *"The Assembly Constituencies for the states of Jammu And Kashmir, Jharkhand, Assam, Manipur, Nagaland &
   Arunachal Pradesh, appear to be pre-delimitation boundaries."* — and the dataset carries this per feature
   in `STATUS = "Pre delimitation"`, which is what the epoch resolver reads. It is a declared field, not an
   inference.
2. *"There is some shift in the data."* — the reason a containment check is run against an independent
   administrative dataset rather than assumed.
3. *"Some Assemblies Constituency Names seem to be incorrect or Missing."* — the reason a name is never the
   only key.
4. *"The Assembly Constituencies in the State of Telengana are still marked as belonging to Andhra
   Pradesh."* — handled by declaring `ANDHRA PRADESH → [ap, tg]` and letting the match decide per seat.
5. 34 features carry `AC_NO = 0` and no name: unassigned slivers, Kachchh salt flats, Mumbai islets, two
   large J&K areas outside the 87 seats, and Sikkim's four districts. **UNUSABLE** — dropped and counted.

### Parliamentary constituencies

| | |
| --- | --- |
| File | `docs/data/geojson/pc_14.geojson` |
| Bytes / sha256 | 39,297,000 / `14dba998f047db384961e578dc64cac6d7907f278fedc6f93cd518c8ca9ba6cf` |
| Features | 544 — 485 `Polygon`, 59 `MultiPolygon` |
| Fields | `ST_NAME` (2-letter code), `ST_CODE`, `PC_CODE`, `PC_NAME`, `Res` |
| Classification | **DIRECT_VECTOR** |

543 parliamentary constituencies plus one. Telangana is absent for the same reason: its 17 seats are inside
`AP`'s 42. `JK` holds 7, which is J&K's 6 plus Ladakh, a separate jurisdiction here. Both are declared in the
manifest as candidate jurisdiction lists.

**A parliamentary constituency is not an assembly constituency and is not derived from one here.** The AC
file carries a `PC_NO` per seat and it would have been possible to dissolve assembly polygons into
parliamentary ones — the ECI does describe a PC as composed of ACs. This pipeline does not do that, because
a separate published PC geometry exists and using it keeps the two electoral geographies separately
sourced, separately hashed and separately validated, which is what the brief asks for.

## Everything considered, and why not

| candidate | classification | why not |
| --- | --- | --- |
| ECI delimitation orders | TEXT_DESCRIPTION | extents in prose; needs 2008 tehsil/ward geometry nobody publishes |
| ECI Assam 2023 / J&K 2022 notifications | MAP_ONLY | raster scans, 0 text operators; georeferencing by eye is not deterministic |
| ECI GE-2024 statistical reports | n/a | results, not geometry — already ingested for exactly that |
| Survey of India | administrative only | a constituency is not an administrative unit |
| Census 2011 district boundaries | administrative only | already the basemap; cannot be the electoral map |
| DataMeet `assembly-constituencies` | **DIRECT_VECTOR** | **used** |
| DataMeet `pc_14` | **DIRECT_VECTOR** | **used** |
| Anonymous constituency GeoJSON repositories | UNUSABLE | no declared upstream, no licence, no defect list — the brief's *"never an anonymous scraped GeoJSON simply because it exists"* |

## What this means for the coverage target

The AC file's 4,182 features cover 30 of the 31 jurisdictions that hold assembly elections — every one
except Telangana, whose seats are inside Andhra Pradesh's. The PC file covers all 36. So the ceiling for
this release is **every jurisdiction with usable election data, for the epoch the source belongs to**, and
the floor is set by three things the source cannot fix: Assam's 2023 order, J&K's 2022 order, and every
epoch before DPACO 2008 except the six states whose pre-2008 boundaries this file happens to be.

The manifest that declares all of the above is [`data/geo/sources.json`](../../data/geo/sources.json). Every
field in it is either a declaration about the source or a hash over its bytes; nothing measured from the
data is written there.

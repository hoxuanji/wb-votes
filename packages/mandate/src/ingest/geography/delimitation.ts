/**
 * The delimitation authority model: which order drew a boundary epoch, and what its dates mean.
 *
 * WHAT THIS EXISTS TO FIX. The 2024 Lok Sabha import held back 19 constituencies because ECI's Assam seat 1
 * is Kokrajhar while the registry's Kokrajhar is seat 5, and its J&K seat 4 is Udhampur while the registry's
 * Udhampur is seat 5. Both states were re-delimited after 2008, so their 2024 seats are not `delim-2008`
 * slots and mapping by number would file one constituency's votes under another's name — the BIDAR/CHIKKODI
 * defect docs/model/electoral-geography.md was written to undo. Unblocking them needs the delimitations
 * themselves, as cited orders.
 *
 * THE CORRECTION THIS MODULE ENCODES. A first reading of S.O. 903(E) — "the Delimitation Order, 2008 in
 * respect of all States except Assam, Arunachal Pradesh, Manipur and Nagaland" — suggested the registry's
 * `delim-2008` rows for those states were an importer artefact to be deleted. Acquiring DPACO 2008 itself
 * disproved it: the order CONTAINS a Part for each of them, and each Part says its content is an earlier
 * order carried forward unchanged. Both documents are right — the 2008 *exercise* did not redraw those
 * states, and the 2008 *order* reproduces their existing constituencies and says so. So those seats really
 * were in force under DPACO 2008, the epochs are kept, and what was missing is the derivation. Nothing
 * historical is deleted here.
 *
 * DATES ARE NOT INTERCHANGEABLE. `effective_from` now travels with `effective_date_basis`:
 *   J&K   legal_effective_date — 20 May 2022, appointed by S.O. 2223(E) under s.62(2)-(3) of the J&K
 *         Reorganisation Act 2019, with the order's own date (5 May 2022) in `order_date`.
 *   Assam publication_date — 2023-08-11, the date the ECI published the final notification. Its own order
 *         date is NOT recorded, because the notification is a scanned image with no text layer, and a date
 *         inferred from a publication timestamp would be an invention.
 */

import type { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { all, get } from "../../db/index.ts";
import { ECI_CACHE_DIR } from "../sources/eci/acquire.ts";

export const DELIMITATION_DIR = join(ECI_CACHE_DIR, "delimitation");

/**
 * The authoritative documents, acquired 2026-08-11 from the ECI's own
 * `/api/delimitation-orders-publication` index and hashed over the bytes as received.
 *
 * The sha256 is declared here, not computed at import time, so a substituted or truncated file fails the
 * run instead of being silently adopted. Both large orders arrived truncated on the first attempt (curl
 * closed early on Assam, timed out on J&K at 4 MB of 13) and were re-fetched with resume; a partial PDF is
 * not a source. `publishedOn` is the document's own publication date where the document or ECI's index
 * establishes it.
 */
export type DelimDoc = {
  id: string;
  file: string;
  /** ECI's document id — the only stable handle; the download URL carries an opaque blob. */
  eciDoc: number;
  title: string;
  publisher: string;
  bytes: number;
  sha256: string;
  publishedOn: string | null;
  /** Whether the document's text can be read, which decides what it can be used to establish. */
  textLayer: boolean;
  note: string;
};

export const DELIM_DOCS: readonly DelimDoc[] = [
  {
    id: "delim:dpaco-2008",
    file: "dpaco-2008.pdf",
    eciDoc: 3931,
    title: "Delimitation of Parliamentary and Assembly Constituencies Order, 2008",
    publisher: "Delimitation Commission of India / Election Commission of India",
    bytes: 1_340_728,
    sha256: "9e1ac49aa952febc8e4f57ed23abd28218a21887f355f8dad1502ab5c0d65e69",
    publishedOn: null,
    textLayer: true,
    note:
      "639 pages. Contains a Part for Assam (V), Arunachal Pradesh (IV), Manipur (XVIII), Nagaland (XXI) " +
      "and Jammu & Kashmir (XII, parliamentary only; Annexure, assembly only), each stating that its " +
      "content is an earlier order carried forward unchanged.",
  },
  {
    id: "delim:so-903e-2020",
    file: "so-903e-2020.pdf",
    eciDoc: 13191,
    title:
      "Gazette of India, Extraordinary, Part II Section 3(ii) — Ministry of Law and Justice Order " +
      "S.O. 903(E), 28 February 2020, rescinding the deferment of delimitation in Assam (S.O. 283(E))",
    publisher: "Ministry of Law and Justice (Legislative Department), Government of India",
    bytes: 901_897,
    sha256: "41e30756927de45c3ad7d0cc543978b076f83afefedb069b05cb52d8f8c85479",
    publishedOn: "2020-02-28",
    textLayer: true,
    note:
      "Records that DPACO 2008 was published on 26 November 2008 'in respect of all States except Assam, " +
      "Arunachal Pradesh, Manipur and Nagaland', and rescinds the deferment so the Assam exercise could " +
      "be carried out.",
  },
  {
    id: "delim:assam-final-2023",
    file: "assam-final-notification-2023.pdf",
    eciDoc: 15220,
    title:
      "Delimitation of Parliamentary and Assembly Constituencies in State of Assam — Final Notification",
    publisher: "Election Commission of India (Delimitation Division)",
    bytes: 6_925_403,
    sha256: "dce6860c5e2a8706ce446194b99289e923ebc2c2d046838a10456e6e19f7c6d9",
    publishedOn: "2023-08-11",
    textLayer: false,
    note:
      "83 pages, 210 image objects, 128 CCITTFaxDecode and 82 DCTDecode streams, ZERO font objects — a " +
      "scan. Establishes that Assam was re-delimited and by whom; its own order date and its constituency " +
      "schedule cannot be read from it.",
  },
  {
    id: "delim:eci-notification-2020",
    file: "eci-notification-2020.pdf",
    eciDoc: 12211,
    title:
      "Delimitation of Constituencies in Jammu-Kashmir, Assam, Arunachal Pradesh, Manipur and Nagaland — " +
      "Notification dated 06.03.2020",
    publisher: "Election Commission of India (Delimitation Division)",
    bytes: 802_065,
    sha256: "6dacd914061f5a5b40a76aa3d5d8a9e4758b3a33f2fe4d64aa1b8a6518e7c824",
    publishedOn: "2020-03-06",
    textLayer: false,
    note: "Constitutes the exercise for the five jurisdictions. Scanned.",
  },
  {
    id: "delim:jk-act-2019",
    file: "jk-reorganisation-act-2019.pdf",
    eciDoc: 13189,
    title: "The Jammu and Kashmir Reorganisation Act, 2019 (34 of 2019)",
    publisher: "Government of India",
    bytes: 1_324_210,
    sha256: "11d23202ab3fd02a70fe5aefb830938d4325f539d43916d431acf18ccfd1ec51",
    publishedOn: null,
    textLayer: true,
    note:
      "s.60-63: constituencies to be delimited under the Delimitation Act, 2002 as amended by this Act, " +
      "'and shall take effect from such date as the Central Government may, by order, published in the " +
      "Official Gazette, specify'. The statutory power S.O. 2223(E) exercises.",
  },
  {
    id: "delim:jk-so-1023e-2021",
    file: "jk-so-1023e-2021.pdf",
    eciDoc: 13193,
    title:
      "Gazette of India, Extraordinary — Ministry of Law and Justice Notification S.O. 1023(E), " +
      "3 March 2021, amending the Delimitation Commission notification of 2020",
    publisher: "Ministry of Law and Justice (Legislative Department), Government of India",
    bytes: 1_423_758,
    sha256: "dec5e9f6be97e300d0f6babb3c5dcf0fbeefe3f2dc4fb606e339fa96f1e76e2e",
    publishedOn: "2021-03-03",
    textLayer: true,
    note: "Made under s.3 of the Delimitation Act, 2002.",
  },
  {
    id: "delim:jk-final-2022",
    file: "jk-final-notification-2022.pdf",
    eciDoc: 14157,
    title:
      "Delimitation of Constituencies in Union Territory of Jammu & Kashmir — Final Notification " +
      "(Delimitation Commission Order No. 2, 5 May 2022)",
    publisher: "Delimitation Commission for the Union Territory of Jammu & Kashmir",
    bytes: 13_281_500,
    sha256: "d5153ac51717bd08a68ef5d964591bec4553a79d0d685fe47b10029bcf76a73f",
    publishedOn: "2022-05-05",
    textLayer: false,
    note: "21 pages, 20 images, no extractable text. Order No. 2; gazetted as O.N. 17(E) of 5 May 2022.",
  },
  {
    id: "delim:jk-so-2223e-2022",
    file: "jk-so-2223e-2022.pdf",
    eciDoc: 15233,
    title:
      "Gazette of India, Extraordinary, Part II Section 3(ii) — Ministry of Law and Justice Order " +
      "S.O. 2223(E), 20 May 2022, appointing the date on which the J&K Delimitation Commission's orders " +
      "take effect",
    publisher: "Ministry of Law and Justice (Legislative Department), Government of India",
    bytes: 985_857,
    sha256: "5f16baf35ddfe7ddf41eb0d773aa7e860856b7e879b222b4be5943d088ba636c",
    publishedOn: "2022-05-20",
    textLayer: true,
    note:
      "Appoints 20 May 2022 as the date on which Order No. 1 of 14 March 2022 (O.N. 6(E)) and Order No. 2 " +
      "of 5 May 2022 (O.N. 17(E)) take effect, under s.62(2)-(3) of the J&K Reorganisation Act, 2019. " +
      "F. No. H.11019/03/2019-Leg.",
  },
];

// ── the epochs ────────────────────────────────────────────────────────────────────────────────────

export type EpochSpec = {
  id: string;
  name: string;
  jurisdictionId: string | null;
  effectiveFrom: string;
  effectiveDateBasis: "legal_effective_date" | "order_date" | "publication_date" | "not_established";
  orderDate: string | null;
  orderReference: string | null;
  sourceId: string;
};

/** The two delimitations that unblock the 19, and the provenance DPACO 2008 gains. */
export const EPOCHS: readonly EpochSpec[] = [
  {
    id: "delim-2022-jk",
    name:
      "Delimitation Commission for the Union Territory of Jammu & Kashmir, Order No. 2 " +
      "(effective 20 May 2022 by S.O. 2223(E))",
    jurisdictionId: "jk",
    // The Central Government appointed this date. Not a publication date, not the order's date.
    effectiveFrom: "2022-05-20",
    effectiveDateBasis: "legal_effective_date",
    orderDate: "2022-05-05",
    orderReference:
      "Delimitation Commission Order No. 2 dated 5 May 2022, Gazette of India Extraordinary II-3(iii) " +
      "O.N. 17(E); with Order No. 1 dated 14 March 2022, O.N. 6(E); given effect by S.O. 2223(E) dated " +
      "20 May 2022 under s.62(2)-(3), Jammu and Kashmir Reorganisation Act, 2019 (34 of 2019)",
    sourceId: "delim:jk-so-2223e-2022",
  },
  {
    id: "delim-2023-as",
    name:
      "Delimitation of Parliamentary and Assembly Constituencies in the State of Assam — ECI final " +
      "notification (order date not established; ECI published it on 2023-08-11)",
    jurisdictionId: "as",
    // The ECI's own publication date for the final notification. The notification is a scan, so its own
    // order date and effective date are not readable, and `effectiveDateBasis` says exactly that.
    effectiveFrom: "2023-08-11",
    effectiveDateBasis: "publication_date",
    orderDate: null,
    orderReference:
      "ECI final notification (document 15220), published 2023-08-11, following the rescindment of the " +
      "2008 deferment by S.O. 903(E) dated 28 February 2020. The notification is a scanned image with no " +
      "text layer, so neither its own order date nor its constituency schedule is machine-readable",
    sourceId: "delim:assam-final-2023",
  },
];

/** DPACO 2008 keeps its date and gains the order it is. Its basis stays honest: nothing established it. */
const DPACO_2008_REFERENCE =
  "Delimitation of Parliamentary and Assembly Constituencies Order, 2008 (ECI document 3931); published " +
  "26 November 2008 per S.O. 903(E) dated 28 February 2020";

// ── the derivations DPACO 2008 states about itself ────────────────────────────────────────────────

export type Derivation = {
  jurisdictionId: string;
  kinds: readonly ("ac" | "pc")[];
  /** The epoch in the registry holding the constituencies DPACO 2008 carried forward. */
  fromEpoch: string;
  /** The order's own words. Quoted, not paraphrased. */
  basis: string;
};

/**
 * One entry per Part of DPACO 2008 that carries an earlier order forward, quoting the order.
 *
 * `fromEpoch` is the epoch in THIS registry that holds those constituencies. For Arunachal and for J&K's
 * assembly seats the order names a different instrument than the epoch's label — the ECI's 1989 order and
 * the 1995 J&K Commission order respectively, both of which the Lokdhaba import filed under `delim-1976`
 * because TCPD's `DelimID` has no value for them. The link records what the order says; `basis` names the
 * discrepancy rather than hiding it behind a tidier epoch id.
 */
export const DERIVATIONS: readonly Derivation[] = [
  {
    jurisdictionId: "as",
    kinds: ["ac", "pc"],
    fromEpoch: "delim-1976",
    basis:
      'DPACO 2008, Part V: "The above Order for the State of Assam is as per the details included in the ' +
      'Delimitation of Parliamentary and Assembly Constituencies Order, 1976 for the State of Assam."',
  },
  {
    jurisdictionId: "mn",
    kinds: ["ac", "pc"],
    fromEpoch: "delim-1976",
    basis:
      'DPACO 2008, Part XVIII: "The above Order for the State of Manipur is as per the details included in ' +
      'Delimitation of Parliamentary and Assembly Constituencies Order, 1976 for the State of Manipur."',
  },
  {
    jurisdictionId: "nl",
    kinds: ["ac", "pc"],
    fromEpoch: "delim-1976",
    basis:
      'DPACO 2008, Part XXI: "The above Order for the State of Nagaland is as per the details included in ' +
      'Delimitation of Parliamentary and Assembly Constituencies Order, 1976 for the State of Nagaland."',
  },
  {
    jurisdictionId: "ar",
    kinds: ["ac", "pc"],
    fromEpoch: "delim-1976",
    basis:
      'DPACO 2008, Part IV: "The above Order for the State of Arunachal Pradesh is as per the details ' +
      "given in Order of the Election Commission of India in pursuance of clause (c) of sub-section (4) of " +
      'Section 14 of the State of Arunachal Pradesh Act, 1986 (69 of 1986), notified in the Central and ' +
      'the State Gazettes on 17th July, 1989." The instrument is that 1989 ECI order, not the 1976 order; ' +
      "this registry holds those constituencies under delim-1976 because TCPD's DelimID has no value for it",
  },
  {
    jurisdictionId: "jk",
    kinds: ["pc"],
    fromEpoch: "delim-1976",
    basis:
      'DPACO 2008, Part XII (Jammu and Kashmir, Parliamentary Constituencies only): "As per details ' +
      "included in Delimitation of Parliamentary and Assembly Constituencies Order, 1976 under Articles 81 " +
      '& 82 of the Constitution of India as applied to the State of Jammu and Kashmir by the Constitution ' +
      '(Application to J & K) Order, 1954."',
  },
  {
    jurisdictionId: "jk",
    kinds: ["ac"],
    fromEpoch: "delim-1976",
    basis:
      'DPACO 2008, Annexure (Jammu and Kashmir, Assembly Constituencies only): "The above Order for the ' +
      "State of Jammu and Kashmir is as per the details given in Order No. 1 of the Delimitation " +
      'Commission, Jammu and Kashmir notified in the Central and the State Gazettes on 27th April, 1995." ' +
      "The instrument is that 1995 order, not the 1976 order; this registry holds its 87 assembly seats " +
      "under delim-1976 because TCPD's DelimID has no value for it",
  },
];

/**
 * The statutory chain, as cited claims on the epoch.
 *
 * Recorded as claims rather than folded into the epoch's name, so each step keeps the document that
 * establishes it and the chain is queryable instead of being a sentence.
 */
export const CHAIN: readonly { subject: string; predicate: string; value: string; sourceId: string }[] = [
  {
    subject: "boundary_epoch:delim-2008",
    predicate: "delimitation.published_on",
    value: "1976 order carried forward for Assam, Manipur, Nagaland; 1989 ECI order for Arunachal Pradesh; " +
      "1976 (parliamentary) and 1995 Commission Order No. 1 (assembly) for Jammu & Kashmir",
    sourceId: "delim:dpaco-2008",
  },
  {
    subject: "boundary_epoch:delim-2023-as",
    predicate: "delimitation.deferment_rescinded",
    value: "S.O. 903(E) dated 28 February 2020 rescinded S.O. 283(E) of February 2008, which had deferred " +
      "the delimitation exercise in Assam",
    sourceId: "delim:so-903e-2020",
  },
  {
    subject: "boundary_epoch:delim-2023-as",
    predicate: "delimitation.exercise_constituted",
    value: "ECI notification dated 06.03.2020 for Jammu & Kashmir, Assam, Arunachal Pradesh, Manipur and " +
      "Nagaland",
    sourceId: "delim:eci-notification-2020",
  },
  {
    subject: "boundary_epoch:delim-2023-as",
    predicate: "delimitation.effective_date_not_established",
    value: "The ECI final notification (document 15220) is a scanned image with no text layer: 83 pages, " +
      "210 image objects, zero font objects. Its order date and legal effective date are not readable, so " +
      "the epoch carries the ECI's publication date of 2023-08-11 with basis publication_date",
    sourceId: "delim:assam-final-2023",
  },
  {
    subject: "boundary_epoch:delim-2022-jk",
    predicate: "delimitation.statutory_power",
    value: "Sections 60 to 63, Jammu and Kashmir Reorganisation Act, 2019 (34 of 2019): constituencies to " +
      "be delimited under the Delimitation Act, 2002 as amended, taking effect from a date the Central " +
      "Government specifies by order in the Official Gazette",
    sourceId: "delim:jk-act-2019",
  },
  {
    subject: "boundary_epoch:delim-2022-jk",
    predicate: "delimitation.commission_constituted",
    value: "S.O. 1023(E) dated 3 March 2021, amending the 2020 notification, under s.3 of the Delimitation " +
      "Act, 2002",
    sourceId: "delim:jk-so-1023e-2021",
  },
  {
    subject: "boundary_epoch:delim-2022-jk",
    predicate: "delimitation.took_effect",
    value: "20 May 2022, appointed by S.O. 2223(E) dated 20 May 2022, for Order No. 1 of 14 March 2022 " +
      "(O.N. 6(E)) and Order No. 2 of 5 May 2022 (O.N. 17(E))",
    sourceId: "delim:jk-so-2223e-2022",
  },
];

// ── applying it ───────────────────────────────────────────────────────────────────────────────────

export type DelimitationReport = {
  sources: number;
  epochsCreated: number;
  epochsUpdated: number;
  derivationLinks: number;
  chainClaims: number;
  missingFiles: string[];
  hashMismatches: string[];
  perDerivation: { jurisdiction: string; kind: string; links: number; note: string }[];
};

const sha256 = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

/**
 * Register the documents, the epochs, the derivations and the chain. One transaction, idempotent.
 *
 * Every document is re-hashed against its declared sha256 and a mismatch aborts the run: the whole point of
 * declaring the hash in code is that a substituted or truncated file cannot be adopted quietly.
 */
export function applyDelimitation(
  db: DatabaseSync,
  opts: { nowIso: string; dir?: string; dryRun?: boolean },
): DelimitationReport {
  const dir = opts.dir ?? DELIMITATION_DIR;
  const report: DelimitationReport = {
    sources: 0, epochsCreated: 0, epochsUpdated: 0, derivationLinks: 0, chainClaims: 0,
    missingFiles: [], hashMismatches: [], perDerivation: [],
  };

  // ── verify the bytes before writing anything ────────────────────────────────────────────────────
  for (const doc of DELIM_DOCS) {
    const path = join(dir, doc.file);
    if (!existsSync(path)) {
      report.missingFiles.push(path);
      continue;
    }
    const bytes = readFileSync(path);
    const got = sha256(bytes);
    if (got !== doc.sha256 || bytes.length !== doc.bytes) {
      report.hashMismatches.push(`${doc.file}: ${bytes.length} B / ${got.slice(0, 16)} != ${doc.bytes} B / ${doc.sha256.slice(0, 16)}`);
    }
  }
  if (report.missingFiles.length > 0 || report.hashMismatches.length > 0) {
    throw new Error(
      "delimitation sources are not the documents this model was built from — refusing to write:\n" +
        [...report.missingFiles.map((f) => `  missing ${f}`), ...report.hashMismatches.map((m) => `  ${m}`)].join("\n"),
    );
  }
  if (opts.dryRun === true) {
    report.sources = DELIM_DOCS.length;
    for (const d of DERIVATIONS) {
      for (const kind of d.kinds) {
        report.perDerivation.push({ jurisdiction: d.jurisdictionId, kind, links: countPairs(db, d, kind), note: d.basis.slice(0, 60) });
      }
    }
    return report;
  }

  db.exec("BEGIN");
  try {
    const srcSql =
      `INSERT INTO source (id, kind, publisher, title, url, retrieved_at, published_on, doc_hash,
         hash_kind, retrieval_kind, publisher_note)
       VALUES (?, 'eci_notification', ?, ?, ?, ?, ?, ?, 'document_bytes', 'fetched', ?)
       ON CONFLICT (id) DO UPDATE SET publisher=excluded.publisher, title=excluded.title,
         published_on=excluded.published_on, doc_hash=excluded.doc_hash, publisher_note=excluded.publisher_note`;
    for (const doc of DELIM_DOCS) {
      db.prepare(srcSql).run(
        doc.id, doc.publisher, doc.title,
        `https://www.eci.gov.in/eci-backend/public/api/download (ECI document ${doc.eciDoc})`,
        opts.nowIso, doc.publishedOn, doc.sha256,
        `${doc.note}${doc.textLayer ? "" : " NO TEXT LAYER: this document is a scan, so nothing has been read from its text."}`,
      );
      report.sources += 1;
    }

    // ── DPACO 2008 gains its order reference; its date basis stays 'not_established' ───────────────
    db.prepare("UPDATE boundary_epoch SET order_reference = ?, source_id = COALESCE(source_id, ?) WHERE id = 'delim-2008'")
      .run(DPACO_2008_REFERENCE, "delim:dpaco-2008");
    report.epochsUpdated += 1;

    // ── the two new epochs ────────────────────────────────────────────────────────────────────────
    const epochSql =
      `INSERT INTO boundary_epoch (id, name, effective_from, jurisdiction_id, order_date, order_reference,
         effective_date_basis, source_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET name=excluded.name, effective_from=excluded.effective_from,
         jurisdiction_id=excluded.jurisdiction_id, order_date=excluded.order_date,
         order_reference=excluded.order_reference, effective_date_basis=excluded.effective_date_basis,
         source_id=excluded.source_id`;
    for (const e of EPOCHS) {
      const existed = get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM boundary_epoch WHERE id = ?", e.id)?.n ?? 0;
      db.prepare(epochSql).run(
        e.id, e.name, e.effectiveFrom, e.jurisdictionId, e.orderDate, e.orderReference,
        e.effectiveDateBasis, e.sourceId,
      );
      if (existed === 0) report.epochsCreated += 1;
      else report.epochsUpdated += 1;
    }

    // ── the derivations, per seat, by SLOT NUMBER — which is what the order carries forward ────────
    const linkSql =
      `INSERT INTO place_version_link (from_place_version_id, to_place_version_id, kind, basis, source_id)
       VALUES (?, ?, 'derived_from', ?, ?)
       ON CONFLICT (from_place_version_id, to_place_version_id, kind)
         DO UPDATE SET basis=excluded.basis, source_id=excluded.source_id`;
    for (const d of DERIVATIONS) {
      for (const kind of d.kinds) {
        const pairs = all<{ later: number; earlier: number }>(
          db,
          `SELECT later.id AS later, earlier.id AS earlier
             FROM place_version later
             JOIN place_version earlier
               ON earlier.jurisdiction_id = later.jurisdiction_id AND earlier.kind = later.kind
              AND earlier.number = later.number AND earlier.epoch_id = ?
            WHERE later.epoch_id = 'delim-2008' AND later.kind = ? AND later.jurisdiction_id = ?`,
          d.fromEpoch, kind, d.jurisdictionId,
        );
        for (const p of pairs) db.prepare(linkSql).run(p.later, p.earlier, d.basis, "delim:dpaco-2008");
        report.derivationLinks += pairs.length;
        report.perDerivation.push({
          jurisdiction: d.jurisdictionId, kind, links: pairs.length,
          note: d.fromEpoch,
        });
      }
    }

    // ── the statutory chain ───────────────────────────────────────────────────────────────────────
    for (const c of CHAIN) {
      const contentKey = `${c.subject}|${c.predicate}`;
      db.prepare(
        `INSERT INTO claim (subject_ref, predicate, object_value, as_of, confidence, content_key)
           VALUES (?, ?, ?, NULL, 'verified', ?) ON CONFLICT (content_key) DO UPDATE SET object_value=excluded.object_value`,
      ).run(c.subject, c.predicate, c.value, contentKey);
      const id = get<{ id: number }>(db, "SELECT id FROM claim WHERE content_key = ?", contentKey)?.id;
      if (id !== undefined) {
        db.prepare(
          `INSERT INTO citation (claim_id, source_id, page_no, parser_version, extracted_at)
             VALUES (?, ?, 0, 'delimitation-v1', ?) ON CONFLICT DO NOTHING`,
        ).run(id, c.sourceId, opts.nowIso);
        report.chainClaims += 1;
      }
    }

    db.exec("COMMIT");
    return report;
  } catch (cause) {
    db.exec("ROLLBACK");
    throw cause instanceof Error ? cause : new Error(String(cause));
  }
}

function countPairs(db: DatabaseSync, d: Derivation, kind: "ac" | "pc"): number {
  return (
    get<{ n: number }>(
      db,
      `SELECT COUNT(*) AS n FROM place_version later
         JOIN place_version earlier
           ON earlier.jurisdiction_id = later.jurisdiction_id AND earlier.kind = later.kind
          AND earlier.number = later.number AND earlier.epoch_id = ?
        WHERE later.epoch_id = 'delim-2008' AND later.kind = ? AND later.jurisdiction_id = ?`,
      d.fromEpoch, kind, d.jurisdictionId,
    )?.n ?? 0
  );
}

/**
 * The epoch in force for one jurisdiction and house — the newest one that either names this jurisdiction or
 * is national.
 *
 * This is what replaces the 2024 importer's hardcoded `delim-2008`. Assam resolves to `delim-2023-as`
 * (2023-08-11) and J&K to `delim-2022-jk` (2022-05-20) because those beat DPACO 2008's 2008-02-19; every
 * other jurisdiction still resolves to `delim-2008` because it has nothing newer. So the mapping is a
 * property of the registry's own cited geography, not a list of state exceptions in the importer.
 */
/**
 * The integer each epoch occupies in `versionId`'s key space, so a seat's place_version id stays unique
 * across delimitations. 1-4 are the Lokdhaba importer's DelimID values and must not move; the new epochs
 * take the next free slots. `versionId` allows 0-19.
 */
export const EPOCH_DELIM_ID: Record<string, number> = {
  "delim-1952": 1,
  "delim-1963": 2,
  "delim-1976": 3,
  "delim-2008": 4,
  "delim-2022-jk": 5,
  "delim-2023-as": 6,
};

export function delimIdOf(epochId: string): number {
  const n = EPOCH_DELIM_ID[epochId];
  if (n === undefined) throw new Error(`no versionId slot allocated for epoch '${epochId}' — add it to EPOCH_DELIM_ID`);
  return n;
}

export function currentEpochFor(db: DatabaseSync, jurisdictionId: string): string {
  const row = get<{ id: string }>(
    db,
    `SELECT id FROM boundary_epoch
      WHERE jurisdiction_id = ? OR jurisdiction_id IS NULL
      ORDER BY effective_from DESC, id DESC LIMIT 1`,
    jurisdictionId,
  );
  if (row === undefined) throw new Error(`no boundary_epoch applies to '${jurisdictionId}'`);
  return row.id;
}

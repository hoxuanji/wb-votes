/**
 * Spreadsheet readers for ECI statistical reports. Zero dependencies, Node built-ins only.
 *
 * ECI publishes the same report in two formats and does not label them reliably — one 2023 Rajasthan
 * report is titled "…-pdf" and is an .xlsx — so the format is decided by MAGIC BYTES, never by the
 * extension or the API's `xls_extension` field. `readSheet` is the only seam callers need.
 *
 *   .xls   OLE2/CFB container holding a BIFF8 record stream. No compression at all.
 *   .xlsx  ZIP of SpreadsheetML. Needs inflate, which node:zlib provides.
 *
 * WHY NOT A LIBRARY. The whole surface used here is: find a stream in a CFB, walk fixed-layout records,
 * unzip, and read `<c>` elements. That is what this file does in ~200 lines, against a corpus whose exact
 * shape is documented in docs/ingestion/eci-2023-2026.md. A spreadsheet library is 1-5 MB, parses styles,
 * charts, pivot tables and formulas we never read, and would be the only third-party runtime dependency
 * in this package. The tests pin the behaviour on real ECI bytes.
 *
 * Every cell is returned as a STRING, deliberately. These readers do not know which column is a vote and
 * which is a name; typing happens in stage.ts where the column meanings live, and a number that arrives
 * as `477005` must not become `477005.0000001` on the way through.
 */

import { inflateRawSync } from "node:zlib";

export type Sheet = string[][];

/** What the bytes actually are, per their magic number. */
export function sniff(bytes: Uint8Array): "xls" | "xlsx" | "unknown" {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, Math.min(8, bytes.length));
  if (b.length >= 8 && b.readUInt32LE(0) === 0xe011cfd0 && b.readUInt32LE(4) === 0xe11ab1a1) return "xls";
  if (b.length >= 4 && b.readUInt32LE(0) === 0x04034b50) return "xlsx";
  return "unknown";
}

/**
 * Read the first worksheet of an ECI report as rows of strings.
 *
 * Rows are dense and 0-indexed from the top of the sheet, with gaps filled by empty strings, so a
 * caller can address `rows[3][2]` against what it sees in Excel. Trailing empty rows are dropped;
 * interior ones are kept, because ECI's reports use a blank row as a section break and losing one
 * shifts every row after it.
 */
export function readSheet(bytes: Uint8Array): Sheet {
  const kind = sniff(bytes);
  if (kind === "xls") return readXls(bytes);
  if (kind === "xlsx") return readXlsx(bytes);
  // An HTML error page cached as a spreadsheet is the failure this catches. 8 bytes of context, because
  // a 3 MB body in an exception message is unreadable.
  const head = Buffer.from(bytes.buffer, bytes.byteOffset, Math.min(8, bytes.length)).toString("hex");
  throw new Error(`not a spreadsheet: ${bytes.length} bytes beginning ${head}`);
}

/** Dense rows from a sparse (row, col) → value map. */
function densify(cells: Map<number, Map<number, string>>): Sheet {
  const maxRow = cells.size === 0 ? -1 : Math.max(...cells.keys());
  const out: Sheet = [];
  for (let r = 0; r <= maxRow; r += 1) {
    const row = cells.get(r);
    if (row === undefined || row.size === 0) {
      out.push([]);
      continue;
    }
    const maxCol = Math.max(...row.keys());
    const line: string[] = [];
    for (let c = 0; c <= maxCol; c += 1) line.push(row.get(c) ?? "");
    out.push(line);
  }
  while (out.length > 0 && (out[out.length - 1] as string[]).every((v) => v === "")) out.pop();
  return out;
}

// ── .xlsx: ZIP + SpreadsheetML ────────────────────────────────────────────────────────────────────

function readXlsx(bytes: Uint8Array): Sheet {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length);
  const files = zipEntries(b);
  const sharedXml = readEntry(b, files, "xl/sharedStrings.xml")?.toString("utf8") ?? "";
  // <si> may hold several <t> runs (rich text); concatenating them is what Excel displays.
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    unescapeXml([...(m[1] ?? "").matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1] ?? "").join("")),
  );

  const sheetPath = [...files.keys()]
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, z) => sheetNo(a) - sheetNo(z))[0];
  if (sheetPath === undefined) throw new Error("xlsx has no worksheet");
  const xml = (readEntry(b, files, sheetPath) as Buffer).toString("utf8");

  const cells = new Map<number, Map<number, string>>();
  for (const rm of xml.matchAll(/<row[^>]*\sr="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const r = Number(rm[1]) - 1; // sheet rows are 1-based
    const row = new Map<number, string>();
    for (const cm of (rm[2] ?? "").matchAll(/<c\s+r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const col = colIndex(cm[1] ?? "");
      const attrs = cm[3] ?? "";
      const body = cm[4] ?? "";
      const t = /\st="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      const inline = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1] ?? "").join("");
      const value =
        t === "s" ? (shared[Number(v)] ?? "")
        : t === "inlineStr" ? unescapeXml(inline)
        : t === "str" ? unescapeXml(v ?? "")
        : (v ?? "");
      if (value !== "") row.set(col, value);
    }
    if (row.size > 0) cells.set(r, row);
  }
  return densify(cells);
}

const sheetNo = (p: string): number => Number(/sheet(\d+)\.xml$/.exec(p)?.[1] ?? 0);

/** 'A' → 0, 'AA' → 26. */
function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** The five XML entities, `&amp;` last so an escaped `&amp;lt;` does not become `<`. */
function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

type ZipEntry = { method: number; csize: number; offset: number };

/** Central directory, read back-to-front from the EOCD record. */
function zipEntries(b: Buffer): Map<string, ZipEntry> {
  let eocd = -1;
  const floor = Math.max(0, b.length - 66_000); // 22-byte EOCD + max 64K comment
  for (let i = b.length - 22; i >= floor; i -= 1) {
    if (b.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("xlsx: no end-of-central-directory record");
  const count = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);
  const out = new Map<string, ZipEntry>();
  for (let i = 0; i < count; i += 1) {
    if (p + 46 > b.length || b.readUInt32LE(p) !== 0x02014b50) break;
    const nameLen = b.readUInt16LE(p + 28);
    const entry: ZipEntry = {
      method: b.readUInt16LE(p + 10),
      csize: b.readUInt32LE(p + 20),
      offset: b.readUInt32LE(p + 42),
    };
    out.set(b.subarray(p + 46, p + 46 + nameLen).toString("utf8"), entry);
    p += 46 + nameLen + b.readUInt16LE(p + 30) + b.readUInt16LE(p + 32);
  }
  return out;
}

function readEntry(b: Buffer, files: Map<string, ZipEntry>, name: string): Buffer | null {
  const f = files.get(name);
  if (f === undefined) return null;
  // The local header repeats the name and extra-field lengths, which may differ from the central
  // directory's; the data begins after the LOCAL ones.
  const start = f.offset + 30 + b.readUInt16LE(f.offset + 26) + b.readUInt16LE(f.offset + 28);
  const raw = b.subarray(start, start + f.csize);
  if (f.method === 0) return raw;
  if (f.method === 8) return inflateRawSync(raw);
  throw new Error(`xlsx: ${name} uses unsupported compression method ${f.method}`);
}

// ── .xls: OLE2/CFB + BIFF8 ───────────────────────────────────────────────────────────────────────

const REC = {
  BOF: 0x0809,
  EOF: 0x000a,
  SST: 0x00fc,
  CONTINUE: 0x003c,
  LABELSST: 0x00fd,
  LABEL: 0x0204,
  RSTRING: 0x00d6,
  NUMBER: 0x0203,
  RK: 0x027e,
  MULRK: 0x00bd,
  FORMULA: 0x0006,
  STRING: 0x0207,
  BOOLERR: 0x0205,
} as const;

const END = [0xfffffffe, 0xffffffff];

function readXls(bytes: Uint8Array): Sheet {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length);
  const wb = workbookStream(b);
  const recs = biffRecords(wb);

  // ── shared string table, which may continue across CONTINUE records ────────────────────────────
  const sstAt = recs.findIndex((r) => r.type === REC.SST);
  const shared: string[] = sstAt < 0 ? [] : readSst(wb, recs, sstAt);

  // ── cells of the first worksheet ──────────────────────────────────────────────────────────────
  // A BIFF8 file opens with a BOF for the workbook globals and then one per sheet, so the first
  // worksheet's records are those after the SECOND BOF. Counting from the first put every cell in
  // "sheet 0" and returned nothing.
  const cells = new Map<number, Map<number, string>>();
  const put = (row: number, col: number, value: string): void => {
    if (value === "") return;
    const r = cells.get(row) ?? new Map<number, string>();
    r.set(col, value);
    cells.set(row, r);
  };
  let bof = 0;
  for (let i = 0; i < recs.length; i += 1) {
    const r = recs[i] as BiffRecord;
    if (r.type === REC.BOF) {
      bof += 1;
      continue;
    }
    if (bof < 2) continue;
    if (bof > 2 && r.type === REC.EOF) break;
    const row = (): number => wb.readUInt16LE(r.at);
    const col = (): number => wb.readUInt16LE(r.at + 2);
    switch (r.type) {
      case REC.LABELSST:
        put(row(), col(), shared[wb.readUInt32LE(r.at + 6)] ?? "");
        break;
      case REC.NUMBER:
        put(row(), col(), num(wb.readDoubleLE(r.at + 6)));
        break;
      case REC.RK:
        put(row(), col(), num(rkValue(wb.readUInt32LE(r.at + 6))));
        break;
      case REC.MULRK: {
        // row, colFirst, [xf(2) rk(4)]*, colLast(2)
        const n = Math.floor((r.len - 6) / 6);
        for (let k = 0; k < n; k += 1) {
          put(row(), col() + k, num(rkValue(wb.readUInt32LE(r.at + 4 + k * 6 + 2))));
        }
        break;
      }
      case REC.LABEL:
      case REC.RSTRING:
        put(row(), col(), xlUnicodeString(wb, r.at + 6).text);
        break;
      case REC.FORMULA: {
        // A formula's CACHED result. Bytes 6..13 are an IEEE double unless the last two are 0xFFFF,
        // in which case byte 6 selects a variant and a string result arrives in the next STRING record.
        const isSpecial = wb.readUInt16LE(r.at + 12) === 0xffff;
        if (!isSpecial) {
          put(row(), col(), num(wb.readDoubleLE(r.at + 6)));
          break;
        }
        if (wb.readUInt8(r.at + 6) === 0x00) {
          const next = recs[i + 1];
          if (next !== undefined && next.type === REC.STRING) {
            put(row(), col(), xlUnicodeString(wb, next.at).text);
          }
        } else if (wb.readUInt8(r.at + 6) === 0x01) {
          put(row(), col(), wb.readUInt8(r.at + 8) === 0 ? "FALSE" : "TRUE");
        }
        // 0x02 error and 0x03 blank are left absent on purpose: an ECI report has neither, and
        // inventing "#N/A" as a cell value would be data this file made up.
        break;
      }
      default:
        break;
    }
  }
  return densify(cells);
}

/** JS number → the shortest string that round-trips, so 477005 does not become '477005.0'. */
const num = (n: number): string => (Number.isFinite(n) ? String(n) : "");

/** BIFF RK: 30 significant bits, optionally an integer and/or divided by 100. */
function rkValue(v: number): number {
  const isInt = (v & 1) === 1;
  const div100 = (v & 2) === 2;
  let n: number;
  if (isInt) {
    // Sign-extend the top 30 bits: (v|0) >> 2 keeps negatives negative.
    n = (v | 0) >> 2;
  } else {
    const t = Buffer.alloc(8);
    t.writeUInt32LE(v & 0xfffffffc, 4);
    n = t.readDoubleLE(0);
  }
  return div100 ? n / 100 : n;
}

type BiffRecord = { type: number; at: number; len: number };

function biffRecords(wb: Buffer): BiffRecord[] {
  const out: BiffRecord[] = [];
  for (let o = 0; o + 4 <= wb.length; ) {
    const type = wb.readUInt16LE(o);
    const len = wb.readUInt16LE(o + 2);
    if (o + 4 + len > wb.length) break;
    out.push({ type, at: o + 4, len });
    o += 4 + len;
  }
  return out;
}

/** A BIFF8 XLUnicodeString at `at`: cch(2) grbit(1) then 8- or 16-bit characters. */
function xlUnicodeString(wb: Buffer, at: number): { text: string; end: number } {
  const cch = wb.readUInt16LE(at);
  const grbit = wb.readUInt8(at + 2);
  let p = at + 3;
  let runs = 0;
  let ext = 0;
  if ((grbit & 0x08) !== 0) {
    runs = wb.readUInt16LE(p);
    p += 2;
  }
  if ((grbit & 0x04) !== 0) {
    ext = wb.readInt32LE(p);
    p += 4;
  }
  const wide = (grbit & 0x01) !== 0;
  const text = wide
    ? wb.subarray(p, p + cch * 2).toString("utf16le")
    : latin1(wb, p, cch);
  return { text, end: p + (wide ? cch * 2 : cch) + runs * 4 + Math.max(0, ext) };
}

const latin1 = (b: Buffer, at: number, n: number): string => b.subarray(at, at + n).toString("latin1");

/**
 * The shared string table, streamed across CONTINUE records.
 *
 * This is the only genuinely awkward part of BIFF8: a string's characters may be cut by a record
 * boundary, and the continuation record then begins with a FRESH grbit byte describing the encoding of
 * the remaining characters — the same string can be 8-bit on one side of the split and 16-bit on the
 * other. Concatenating the record payloads and parsing the result gets 9,675 strings almost right and
 * silently corrupts the ones that straddle a boundary, which is why this walks the chunks explicitly.
 */
function readSst(wb: Buffer, recs: readonly BiffRecord[], sstAt: number): string[] {
  const chunks: BiffRecord[] = [recs[sstAt] as BiffRecord];
  for (let i = sstAt + 1; i < recs.length && (recs[i] as BiffRecord).type === REC.CONTINUE; i += 1) {
    chunks.push(recs[i] as BiffRecord);
  }
  let ci = 0;
  let p = (chunks[0] as BiffRecord).at;
  const end = (): number => {
    const c = chunks[ci] as BiffRecord;
    return c.at + c.len;
  };
  /** Move to the next chunk. Returns false at the end of the table. */
  const advance = (): boolean => {
    if (ci + 1 >= chunks.length) return false;
    ci += 1;
    p = (chunks[ci] as BiffRecord).at;
    return true;
  };
  const need = (n: number): boolean => {
    while (p >= end()) if (!advance()) return false;
    return p + n <= end();
  };
  const u8 = (): number => {
    need(1);
    const v = wb.readUInt8(p);
    p += 1;
    return v;
  };
  const u16 = (): number => {
    need(2);
    const v = wb.readUInt16LE(p);
    p += 2;
    return v;
  };
  const u32 = (): number => {
    need(4);
    const v = wb.readUInt32LE(p);
    p += 4;
    return v;
  };

  u32(); // total references, unused
  const unique = u32();
  const out: string[] = [];
  for (let i = 0; i < unique; i += 1) {
    let cch = u16();
    let grbit = u8();
    let runs = 0;
    let ext = 0;
    if ((grbit & 0x08) !== 0) runs = u16();
    if ((grbit & 0x04) !== 0) ext = u32() | 0;
    let text = "";
    while (cch > 0) {
      if (!need(1)) break;
      const wide = (grbit & 0x01) !== 0;
      const avail = end() - p;
      const take = Math.min(cch, wide ? Math.floor(avail / 2) : avail);
      if (take <= 0) {
        if (!advance()) break;
        grbit = u8();
        continue;
      }
      text += wide ? wb.subarray(p, p + take * 2).toString("utf16le") : latin1(wb, p, take);
      p += wide ? take * 2 : take;
      cch -= take;
      if (cch > 0) {
        if (!advance()) break;
        grbit = u8(); // the continuation restates the encoding
      }
    }
    for (let k = 0; k < runs; k += 1) {
      if (!need(4)) break;
      p += 4;
    }
    let remaining = Math.max(0, ext);
    while (remaining > 0) {
      if (!need(1)) break;
      const take = Math.min(remaining, end() - p);
      if (take <= 0) {
        if (!advance()) break;
        continue;
      }
      p += take;
      remaining -= take;
    }
    out.push(text);
  }
  return out;
}

/** Pull the `Workbook` stream out of the OLE2 container. */
function workbookStream(b: Buffer): Buffer {
  const sectorSize = 1 << b.readUInt16LE(0x1e);
  const miniSize = 1 << b.readUInt16LE(0x20);
  const fatCount = b.readUInt32LE(0x2c);
  const dirStart = b.readUInt32LE(0x30);
  const miniCutoff = b.readUInt32LE(0x38);
  const miniFatStart = b.readUInt32LE(0x3c);
  const difatStart = b.readUInt32LE(0x44);
  const difatCount = b.readUInt32LE(0x48);
  const sector = (n: number): Buffer => b.subarray(512 + n * sectorSize, 512 + (n + 1) * sectorSize);

  // FAT sector list: 109 entries in the header, the rest chained through DIFAT sectors.
  const fatSectors: number[] = [];
  for (let i = 0; i < 109 && fatSectors.length < fatCount; i += 1) {
    const v = b.readUInt32LE(0x4c + i * 4);
    if (!END.includes(v)) fatSectors.push(v);
  }
  let d = difatStart;
  for (let k = 0; k < difatCount && !END.includes(d); k += 1) {
    const s = sector(d);
    const per = sectorSize / 4 - 1;
    for (let i = 0; i < per; i += 1) {
      const v = s.readUInt32LE(i * 4);
      if (!END.includes(v)) fatSectors.push(v);
    }
    d = s.readUInt32LE(per * 4);
  }
  const fat: number[] = [];
  for (const fs of fatSectors) {
    const s = sector(fs);
    for (let i = 0; i < sectorSize / 4; i += 1) fat.push(s.readUInt32LE(i * 4));
  }

  const chain = (start: number, table: readonly number[]): number[] => {
    const out: number[] = [];
    let c = start;
    // The guard is a corrupt-file backstop, not a size limit: a FAT loop would otherwise hang.
    while (!END.includes(c) && out.length <= table.length) {
      out.push(c);
      c = table[c] ?? 0xfffffffe;
    }
    return out;
  };
  const readChain = (start: number): Buffer => Buffer.concat(chain(start, fat).map(sector));

  const dir = readChain(dirStart);
  type Entry = { name: string; type: number; start: number; size: number };
  const entries: Entry[] = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const nameLen = dir.readUInt16LE(o + 0x40);
    if (nameLen < 2) continue;
    entries.push({
      name: dir.subarray(o, o + nameLen - 2).toString("utf16le"),
      type: dir.readUInt8(o + 0x42),
      start: dir.readUInt32LE(o + 0x74),
      size: Number(dir.readBigUInt64LE(o + 0x78)),
    });
  }
  const wb = entries.find((e) => e.type === 2 && /^(Workbook|Book)$/i.test(e.name));
  if (wb === undefined) {
    throw new Error(`xls: no Workbook stream (found ${entries.map((e) => e.name).join(", ")})`);
  }
  if (wb.size >= miniCutoff) return readChain(wb.start).subarray(0, wb.size);

  // Small streams live packed inside the root entry's mini stream, addressed by the mini FAT.
  const root = entries.find((e) => e.type === 5);
  if (root === undefined) throw new Error("xls: no root directory entry");
  const miniFatRaw = readChain(miniFatStart);
  const miniFat: number[] = [];
  for (let i = 0; i + 4 <= miniFatRaw.length; i += 4) miniFat.push(miniFatRaw.readUInt32LE(i));
  const miniStream = readChain(root.start);
  return Buffer.concat(
    chain(wb.start, miniFat).map((n) => miniStream.subarray(n * miniSize, (n + 1) * miniSize)),
  ).subarray(0, wb.size);
}

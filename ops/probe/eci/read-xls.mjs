// RECONNAISSANCE PROBE — not the importer. Kept as the evidence behind
// docs/ingestion/eci-2023-2026.md sections 18-19: ECI spreadsheets are readable with Node built-ins
// alone, zero dependencies. Promote to packages/mandate/src/ingest/sources/spreadsheet/ when Phase 1
// builds the real pipeline; until then this is a probe and makes no correctness guarantees.
//   node ops/probe/eci/read-xls.mjs <file> [rows]

// Disposable probe: can Node built-ins alone read an ECI BIFF8 .xls? OLE2 (CFB) + BIFF records.
// No zlib, no deps -- BIFF8 records are uncompressed. Answers "is a parser feasible" and prints rows.
import { readFileSync } from "node:fs";

const b = readFileSync(process.argv[2]);
const WANT = Number(process.argv[3] ?? 6);

// ---- OLE2 / CFB ----
if (b.readUInt32LE(0) !== 0xe011cfd0 || b.readUInt32LE(4) !== 0xe11ab1a1) throw new Error("not OLE2");
const ssz = 1 << b.readUInt16LE(0x1e), msz = 1 << b.readUInt16LE(0x20);
const nFat = b.readUInt32LE(0x2c), dirStart = b.readUInt32LE(0x30);
const miniCut = b.readUInt32LE(0x38), miniFatStart = b.readUInt32LE(0x3c);
const difStart = b.readUInt32LE(0x44), nDif = b.readUInt32LE(0x48);
const sec = (n) => b.subarray(512 + n * ssz, 512 + (n + 1) * ssz);

const fatSectors = [];
for (let i = 0; i < 109 && fatSectors.length < nFat; i++) {
  const v = b.readUInt32LE(0x4c + i * 4);
  if (v !== 0xffffffff) fatSectors.push(v);
}
let d = difStart;
for (let k = 0; k < nDif && d !== 0xffffffff && d !== 0xfffffffe; k++) {
  const s = sec(d);
  const per = ssz / 4 - 1;
  for (let i = 0; i < per; i++) { const v = s.readUInt32LE(i * 4); if (v !== 0xffffffff) fatSectors.push(v); }
  d = s.readUInt32LE(per * 4);
}
const fat = [];
for (const fs of fatSectors) { const s = sec(fs); for (let i = 0; i < ssz / 4; i++) fat.push(s.readUInt32LE(i * 4)); }
const chain = (start, table) => { const out = []; let c = start, g = 0; while (c !== 0xfffffffe && c !== 0xffffffff && g++ < 1e7) { out.push(c); c = table[c] ?? 0xfffffffe; } return out; };
const readSectors = (start) => Buffer.concat(chain(start, fat).map(sec));

const dirBuf = readSectors(dirStart);
const entries = [];
for (let o = 0; o + 128 <= dirBuf.length; o += 128) {
  const nl = dirBuf.readUInt16LE(o + 0x40);
  if (nl < 2) continue;
  entries.push({
    name: dirBuf.subarray(o, o + nl - 2).toString("utf16le"),
    type: dirBuf.readUInt8(o + 0x42),
    start: dirBuf.readUInt32LE(o + 0x74),
    size: Number(dirBuf.readBigUInt64LE(o + 0x78)),
  });
}
const root = entries.find((e) => e.type === 5);
const miniFatRaw = readSectors(miniFatStart);
const miniFat = []; for (let i = 0; i + 4 <= miniFatRaw.length; i += 4) miniFat.push(miniFatRaw.readUInt32LE(i));
const miniStream = root ? readSectors(root.start) : Buffer.alloc(0);
const readStream = (e) => e.size < miniCut && e.size > 0
  ? Buffer.concat(chain(e.start, miniFat).map((n) => miniStream.subarray(n * msz, (n + 1) * msz))).subarray(0, e.size)
  : readSectors(e.start).subarray(0, e.size);

console.log("streams:", entries.filter((e) => e.type === 2).map((e) => `${e.name}(${e.size})`).join(" "));
const wbEntry = entries.find((e) => e.type === 2 && /^(Workbook|Book)$/i.test(e.name));
if (!wbEntry) throw new Error("no Workbook stream");
const wb = readStream(wbEntry);

// ---- BIFF records ----
const recs = [];
for (let o = 0; o + 4 <= wb.length;) {
  const t = wb.readUInt16LE(o), len = wb.readUInt16LE(o + 2);
  if (o + 4 + len > wb.length) break;
  recs.push({ t, o: o + 4, len });
  o += 4 + len;
}
const counts = {};
for (const r of recs) counts[r.t] = (counts[r.t] ?? 0) + 1;
const NAMES = { 0x0009: "BOF", 0x0209: "BOF3", 0x0809: "BOF8", 0x000a: "EOF", 0x0085: "BOUNDSHEET", 0x00fc: "SST", 0x003c: "CONTINUE", 0x00fd: "LABELSST", 0x0203: "NUMBER", 0x027e: "RK", 0x00bd: "MULRK", 0x0204: "LABEL", 0x00d6: "RSTRING", 0x0006: "FORMULA", 0x0207: "STRING", 0x0208: "ROW", 0x0002: "INTEGER" };
console.log("records:", recs.length, "|", Object.entries(counts).sort((a, c) => c[1] - a[1]).slice(0, 10)
  .map(([t, n]) => `${NAMES[t] ?? "0x" + Number(t).toString(16)}=${n}`).join(" "));
console.log("sheets:", recs.filter((r) => r.t === 0x0085).map((r) => {
  const cch = wb.readUInt8(r.o + 6), grbit = wb.readUInt8(r.o + 7);
  return grbit & 1 ? wb.subarray(r.o + 8, r.o + 8 + cch * 2).toString("utf16le") : wb.subarray(r.o + 8, r.o + 8 + cch).latin1Slice(0, cch);
}).join(" | "));

// ---- SST, streaming across CONTINUE ----
const sstIdx = recs.findIndex((r) => r.t === 0x00fc);
const sst = [];
if (sstIdx >= 0) {
  const chunks = [recs[sstIdx]];
  for (let i = sstIdx + 1; i < recs.length && recs[i].t === 0x003c; i++) chunks.push(recs[i]);
  let ci = 0, p = chunks[0].o;
  const end = () => chunks[ci].o + chunks[ci].len;
  const need = (n) => { while (p >= end()) { if (ci + 1 >= chunks.length) return false; ci++; p = chunks[ci].o; } return p + n <= end(); };
  const u8 = () => { need(1); return wb.readUInt8(p++); };
  const u16 = () => { need(2); const v = wb.readUInt16LE(p); p += 2; return v; };
  const u32 = () => { need(4); const v = wb.readUInt32LE(p); p += 4; return v; };
  u32(); const uniq = u32();
  for (let i = 0; i < uniq; i++) {
    let cch = u16(), grbit = u8();
    let rich = 0, ext = 0;
    if (grbit & 0x08) rich = u16();
    if (grbit & 0x04) ext = u32() | 0;
    let s = "";
    while (cch > 0) {
      need(1);
      const avail = end() - p;
      const high = grbit & 0x01;
      const take = Math.min(cch, high ? Math.floor(avail / 2) : avail);
      if (take <= 0) { if (ci + 1 >= chunks.length) break; ci++; p = chunks[ci].o; grbit = u8(); continue; }
      s += high ? wb.subarray(p, p + take * 2).toString("utf16le") : wb.subarray(p, p + take).latin1Slice(0, take);
      p += high ? take * 2 : take; cch -= take;
      if (cch > 0) { if (ci + 1 >= chunks.length) break; ci++; p = chunks[ci].o; grbit = u8(); }
    }
    for (let k = 0; k < rich; k++) { need(4); p += 4; }
    if (ext > 0) { let r = ext; while (r > 0) { need(1); const a = Math.min(r, end() - p); if (a <= 0) { if (ci + 1 >= chunks.length) break; ci++; p = chunks[ci].o; continue; } p += a; r -= a; } }
    sst.push(s);
  }
}
console.log("SST unique strings:", sst.length, "| sample:", JSON.stringify(sst.slice(0, 6)));

// ---- cells of the first sheet, first WANT rows ----
const rk = (v) => { const cents = v & 2, int = v & 1; let n; if (int) n = (v | 0) >> 2; else { const t = Buffer.alloc(8); t.writeUInt32LE(v & 0xfffffffc, 4); n = t.readDoubleLE(0); } return cents ? n / 100 : n; };
const rows = new Map();
let sheet = -1;
for (const r of recs) {
  if (r.t === 0x0809) { sheet++; continue; }
  if (sheet !== 1) continue;
  const put = (row, col, v) => { if (row >= WANT) return; if (!rows.has(row)) rows.set(row, new Map()); rows.get(row).set(col, v); };
  if (r.t === 0x00fd) put(wb.readUInt16LE(r.o), wb.readUInt16LE(r.o + 2), sst[wb.readUInt32LE(r.o + 6)] ?? "");
  else if (r.t === 0x0203) put(wb.readUInt16LE(r.o), wb.readUInt16LE(r.o + 2), wb.readDoubleLE(r.o + 6));
  else if (r.t === 0x027e) put(wb.readUInt16LE(r.o), wb.readUInt16LE(r.o + 2), rk(wb.readUInt32LE(r.o + 6)));
  else if (r.t === 0x00bd) { const row = wb.readUInt16LE(r.o), c0 = wb.readUInt16LE(r.o + 2); const n = (r.len - 6) / 6; for (let i = 0; i < n; i++) put(row, c0 + i, rk(wb.readUInt32LE(r.o + 4 + i * 6 + 2))); }
  else if (r.t === 0x0204) { const row = wb.readUInt16LE(r.o), col = wb.readUInt16LE(r.o + 2), cch = wb.readUInt16LE(r.o + 6), g = wb.readUInt8(r.o + 8); put(row, col, g & 1 ? wb.subarray(r.o + 9, r.o + 9 + cch * 2).toString("utf16le") : wb.subarray(r.o + 9, r.o + 9 + cch).latin1Slice(0, cch)); }
}
console.log("\n--- first " + WANT + " rows of sheet 1 ---");
for (const [ri, cells] of [...rows].sort((a, c) => a[0] - c[0])) {
  const max = Math.max(...cells.keys());
  const out = []; for (let c = 0; c <= max; c++) out.push(String(cells.get(c) ?? ""));
  console.log(String(ri).padStart(3) + ": " + out.join(" | "));
}

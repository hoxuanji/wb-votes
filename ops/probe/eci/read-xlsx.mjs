// RECONNAISSANCE PROBE — not the importer. Kept as the evidence behind
// docs/ingestion/eci-2023-2026.md sections 18-19: ECI spreadsheets are readable with Node built-ins
// alone, zero dependencies. Promote to packages/mandate/src/ingest/sources/spreadsheet/ when Phase 1
// builds the real pipeline; until then this is a probe and makes no correctness guarantees.
//   node ops/probe/eci/read-xlsx.mjs <file> [rows]

// Disposable probe: read .xlsx with Node built-ins only. ZIP (stored/deflate) + SpreadsheetML.
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

const b = readFileSync(process.argv[2]);
const WANT = Number(process.argv[3] ?? 8);

// ---- central directory ----
let eocd = -1;
for (let i = b.length - 22; i >= 0 && i > b.length - 70000; i--) if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
if (eocd < 0) throw new Error("no EOCD");
let p = b.readUInt32LE(eocd + 16);
const n = b.readUInt16LE(eocd + 10);
const files = new Map();
for (let i = 0; i < n; i++) {
  if (b.readUInt32LE(p) !== 0x02014b50) break;
  const method = b.readUInt16LE(p + 10), csize = b.readUInt32LE(p + 20), usize = b.readUInt32LE(p + 24);
  const nl = b.readUInt16LE(p + 28), el = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32);
  const off = b.readUInt32LE(p + 42);
  const name = b.subarray(p + 46, p + 46 + nl).toString("utf8");
  files.set(name, { method, csize, usize, off });
  p += 46 + nl + el + cl;
}
const read = (name) => {
  const f = files.get(name); if (!f) return null;
  const lnl = b.readUInt16LE(f.off + 26), lel = b.readUInt16LE(f.off + 28);
  const start = f.off + 30 + lnl + lel;
  const raw = b.subarray(start, start + f.csize);
  return f.method === 0 ? raw : inflateRawSync(raw);
};
console.log("zip entries:", [...files.keys()].filter((k) => /sheet|shared|workbook/i.test(k)).join(" "));

// ---- shared strings ----
const un = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&amp;/g, "&");
const ssXml = read("xl/sharedStrings.xml")?.toString("utf8") ?? "";
const shared = [...ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
  un([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
console.log("sharedStrings:", shared.length, "| sample:", JSON.stringify(shared.slice(0, 5)));

// ---- first worksheet ----
const sheetName = [...files.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
const xml = read(sheetName).toString("utf8");
const colOf = (ref) => { let c = 0; for (const ch of ref.replace(/\d+/g, "")) c = c * 26 + (ch.charCodeAt(0) - 64); return c - 1; };
const rows = [];
for (const rm of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
  const cells = new Map();
  for (const cm of rm[2].matchAll(/<c r="([A-Z]+\d+)"([^>]*)\/?>(?:([\s\S]*?)<\/c>)?/g)) {
    const attrs = cm[2] ?? "", body = cm[3] ?? "";
    const t = /t="([^"]+)"/.exec(attrs)?.[1];
    const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
    const inline = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("");
    cells.set(colOf(cm[1]), t === "s" ? (shared[+v] ?? "") : t === "inlineStr" ? un(inline) : t === "str" ? un(v ?? "") : (v ?? ""));
  }
  rows.push([Number(rm[1]), cells]);
  if (rows.length >= WANT) break;
}
console.log("\n--- first " + rows.length + " rows of " + sheetName + " ---");
for (const [ri, cells] of rows) {
  const max = cells.size ? Math.max(...cells.keys()) : -1;
  const out = []; for (let c = 0; c <= max; c++) out.push(String(cells.get(c) ?? ""));
  console.log(String(ri).padStart(3) + ": " + out.join(" | "));
}
console.log("\ntotal <row> in sheet:", (xml.match(/<row[ >]/g) ?? []).length);

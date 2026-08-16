// RECONNAISSANCE PROBE — not the importer. Kept as the evidence behind
// docs/ingestion/eci-2023-2026.md sections 18-19: ECI spreadsheets are readable with Node built-ins
// alone, zero dependencies. Promote to packages/mandate/src/ingest/sources/spreadsheet/ when Phase 1
// builds the real pipeline; until then this is a probe and makes no correctness guarantees.
//   node ops/probe/eci/pdf-text-layer.mjs <file> [rows]

// Disposable probe: is there a text layer in this PDF, using node built-ins only?
// Inflates every FlateDecode stream and counts PDF text-showing operators.
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const buf = readFileSync(process.argv[2]);
let streams = 0, inflated = 0, tj = 0, chars = 0, fonts = 0, images = 0;
const s = buf.latin1Slice(0, buf.length);
fonts = (s.match(/\/Type\s*\/Font/g) ?? []).length;
images = (s.match(/\/Subtype\s*\/Image/g) ?? []).length;
let i = 0;
const sample = [];
while ((i = s.indexOf("stream", i)) !== -1) {
  let start = i + 6;
  if (s[start] === "\r") start++;
  if (s[start] === "\n") start++;
  const end = s.indexOf("endstream", start);
  if (end === -1) break;
  streams++;
  try {
    const out = inflateSync(buf.subarray(start, end));
    inflated++;
    const t = out.latin1Slice(0, out.length);
    const ops = (t.match(/\)\s*Tj|\]\s*TJ/g) ?? []).length;
    tj += ops;
    for (const m of t.matchAll(/\(((?:[^()\\]|\\.){2,})\)\s*Tj/g)) {
      chars += m[1].length;
      if (sample.length < 12) sample.push(m[1]);
    }
  } catch { /* not flate, or an image */ }
  i = end + 9;
}
console.log(JSON.stringify({ bytes: buf.length, streams, inflated, fontObjects: fonts, imageObjects: images, textOps: tj, textChars: chars }, null, 2));
console.log("sample text runs:", sample.slice(0, 12));

/**
 * A Node module-customisation hook that compiles .tsx through the Babel that Next already ships.
 *
 * WHY IT EXISTS. This sandbox refuses `listen()`, so `next dev` and `next start` cannot run and there is no
 * browser to point at the page. Node executes .ts natively but not JSX, so the homepage's component tree
 * was verifiable only by `tsc` — which cannot see that a section throws, renders nothing, or prints a
 * fabricated value.
 *
 * ZERO NEW DEPENDENCIES: preset-typescript and preset-react are inside next/dist/compiled/babel, and the
 * classic runtime keeps the output to plain React.createElement calls with no jsx-runtime resolution.
 *
 * This is test scaffolding. It is never imported by the application.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const babel = require("next/dist/compiled/babel/core");

/** Node decides the format BEFORE calling load(), and has no format for .tsx — so resolve must say. */
export async function resolve(specifier, context, nextResolve) {
  // next/link and next/navigation are CJS with no ESM export-map entry for the bare specifier. The bundler
  // rewrites them; outside it they have to be pointed at the file. `next/link` renders a real <a> in the
  // server output, which is exactly what this harness is checking.
  const shim = { "next/link": "next/link.js", "next/navigation": "next/navigation.js" }[specifier];
  const r = await nextResolve(shim ?? specifier, context);
  return r.url.endsWith(".tsx") || r.url.endsWith(".css") ? { ...r, format: "module" } : r;
}

export async function load(url, context, nextLoad) {
  // A CSS import is a bundler instruction, not a module. It contributes nothing to the rendered markup.
  if (url.endsWith(".css")) return { format: "module", source: "export default undefined;", shortCircuit: true };
  if (!url.endsWith(".tsx")) return nextLoad(url, context);
  const file = fileURLToPath(url);
  const { code } = babel.transformSync(readFileSync(file, "utf8"), {
    filename: file,
    babelrc: false,
    configFile: false,
    sourceMaps: "inline",
    // The JSON import in IndiaMap.tsx carries `with { type: "json" }`, which Babel needs a plugin to
    // parse. Next ships it; webpack enables it implicitly.
    plugins: [require("next/dist/compiled/babel/plugin-syntax-import-assertions")],
    presets: [
      [require("next/dist/compiled/babel/preset-typescript"), { isTSX: true, allExtensions: true }],
      // automatic runtime: the app files do not import React, because Next injects it. Classic would need
      // every one of them to.
      [require("next/dist/compiled/babel/preset-react"), { runtime: "automatic" }],
    ],
  });
  // 'use client' components render as plain components here: this harness checks the server output, and the
  // one client island on the page returns null by design.
  return { format: "module", source: code.replace(/^['"]use client['"];?/m, ""), shortCircuit: true };
}

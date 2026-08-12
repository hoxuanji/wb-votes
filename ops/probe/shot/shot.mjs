/**
 * Screenshot a real route in a real browser, at real viewports.
 *
 *   node ops/probe/shot/shot.mjs <label> <route> [query] [pathSegments]
 *   node ops/probe/shot/shot.mjs home / "layer=turnout"
 *   node ops/probe/shot/shot.mjs ka /pl "" ka
 *
 * WHY THIS EXISTS, AND WHAT IT IS NOT. Phase 2.5 requires visual QA that is actually visual — "unit tests,
 * markup assertions, text inspection and accessibility assertions do not prove visual quality". This
 * sandbox refuses `listen()`, sandboxed or not, so there is no `next dev` and no `next start` and nothing
 * to point a browser at over HTTP. What it does permit is a browser reading a file.
 *
 * So: render the route through ops/probe/render, wrap the fragment in the same document the root layout
 * produces, inline the one stylesheet the product now has, write it to disk, and screenshot it with
 * Chromium at five viewports. The layout, the type, the spacing, the contrast, the wrapping and the
 * overflow are all genuinely computed by a browser engine.
 *
 * WHAT IT DOES NOT COVER, stated so no one reads more into the images than is in them:
 *   · No HTTP. Anything that depends on a request — caching headers, streaming, `next/image` — is absent.
 *   · No hydration. The product ships one client component (CommandKey, which binds ⌘K and paints nothing),
 *     so this costs the screenshots nothing, and it would cost them a great deal in an app with client UI.
 *   · No webfont. The design system asks for the system UI font and the system mono font, which is what a
 *     reader gets; there is no @font-face to fail to load.
 *   · `position: sticky` on the header has nothing to stick to in a full-page capture.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const OUT = path.join(ROOT, ".data/shots");

/** The five the brief asks for: laptop, small laptop, tablet landscape, tablet portrait, phone. */
export const VIEWPORTS = [
  [1440, 900],
  [1280, 800],
  [1024, 768],
  [768, 1024],
  [390, 844],
];

/** Chromium, in order of preference. chrome-headless-shell has no ProcessSingleton to bind. */
function browser() {
  const candidates = [
    path.join(
      homedir(),
      "Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell",
    ),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  for (const c of candidates) {
    try {
      readFileSync(c, { encoding: null, flag: "r" });
      return c;
    } catch {
      /* next */
    }
  }
  throw new Error("no Chromium found — visual QA cannot run, and must not be claimed");
}

/** The route's markup, from the same harness the render tests use. */
function markup(route, query = "", segments = "") {
  return execFileSync(
    process.execPath,
    ["--import", "./ops/probe/render/register.mjs", "./ops/probe/render/render.mjs", route, query, segments],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
  );
}

/** The document the root layout produces, with the stylesheet inline so file:// needs no network. */
function document(body) {
  const css = readFileSync(path.join(ROOT, "src/app/iei.css"), "utf8");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${css}</style></head>
<body style="background:#07070b;color:#f2f2f7;margin:0">${body}</body></html>`;
}

/**
 * TWO CAPTURES PER WIDTH, because one cannot serve both purposes.
 *
 * `chrome-headless-shell` ignores `--screenshot-full-page`; the only lever it has is the window, so a whole
 * document needs a tall window. But a tall window changes what `vh` means, and the phone layout uses it —
 * the map is `max-height: 52vh` there, deliberately, so that something after it is visible without
 * scrolling. Capturing the phone at 390×3600 would show a 1,872px map and prove nothing.
 *
 * So: `-fold` is the real viewport, which is where hierarchy and vh-dependent sizing are judged, and `-doc`
 * is the same WIDTH in a 3,600px window, which is where clutter, rhythm and alignment down the page are
 * judged. Media queries key on width, so the layout in `-doc` is the layout.
 */
const DOC_HEIGHT = 3600;

export function shoot(label, route, query = "", segments = "") {
  mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${label}.html`);
  writeFileSync(file, document(markup(route, query, segments)), "utf8");
  const bin = browser();
  const made = [];
  const capture = (png, w, h) => {
    execFileSync(
      bin,
      [
        "--no-sandbox",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        `--window-size=${w},${h}`,
        `--screenshot=${png}`,
        "--virtual-time-budget=3000",
        `file://${file}`,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    made.push(png);
  };
  for (const [w, h] of VIEWPORTS) {
    capture(path.join(OUT, `${label}-${w}x${h}-fold.png`), w, h);
    capture(path.join(OUT, `${label}-${w}-doc.png`), w, DOC_HEIGHT);
  }
  return made;
}

if (process.argv[1] === import.meta.filename) {
  const [label, route, query, segments] = process.argv.slice(2);
  if (label === undefined || route === undefined) {
    process.stderr.write("usage: shot.mjs <label> <route> [query] [segments]\n");
    process.exit(2);
  }
  for (const p of shoot(label, route, query ?? "", segments ?? "")) process.stdout.write(`${p}\n`);
}

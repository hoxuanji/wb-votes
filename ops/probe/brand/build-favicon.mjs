// Draws the product's mark and writes the three files Next.js serves as its icons from src/app:
//   icon.svg        the favicon in every browser that takes an SVG (rounded, transparent corners)
//   favicon.ico     the one every other client asks /favicon.ico for (16, 32 and 48 px PNGs in one container)
//   apple-icon.png  the home-screen icon (180 px, square and opaque: iOS rounds it itself)
//
// THE MARK is the product's own picture of an election: a grid of seats, one of them lit. It is monochrome because
// chrome here is monochrome and only data is coloured (iei.css); the lit tile is --iei-ink, the rest are --iei-line-2
// raised a step so they still read at 16 px, on --iei-panel. Rasterised with the headless Chromium the screenshot tool
// uses, so no image library is added to the repo.
//
// icon.svg ADAPTS: it carries a `prefers-color-scheme: light` rule, so a browser that takes an SVG favicon and follows the system theme shows a light
// tile (the light page's --iei-bg, with --iei-ink for the lit seat) on a light tab strip. favicon.ico and apple-icon.png are rasters of the dark tile, which
// is what a client that cannot read the rule gets. `--svg-only` writes icon.svg and nothing else (no browser needed).
//
//   node ops/probe/brand/build-favicon.mjs [--svg-only]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const BG = '#0d0d13'; // --iei-panel
const LIT = '#f2f2f7'; // --iei-ink
const BG_LIGHT = '#eef0f6'; // --iei-bg, light
const LIT_LIGHT = '#12131c'; // --iei-ink, light
const DIM_LIGHT = '#b4b8cb'; // between --iei-line-2 and --iei-ink-3, light: recedes, still shows at 16 px
const DIM = '#3a3a4d'; // between --iei-line-2 and --iei-ink-3: three tiles that recede but still show at 16 px

/** `inset` is the margin around the grid in a 32-unit square; `round` the tile background's corner. */
const mark = ({ round, inset, adaptive = false }) => {
  const gap = 3;
  const t = (32 - 2 * inset - gap) / 2;
  const at = [inset, inset + t + gap];
  const tiles = [];
  for (const [r, y] of at.entries()) {
    for (const [c, x] of at.entries()) {
      const lit = r === 0 && c === 1;
      tiles.push(
        adaptive
          ? `<rect class="${lit ? 'lit' : 'dim'}" x="${x}" y="${y}" width="${t}" height="${t}" rx="1.5"/>`
          : `<rect x="${x}" y="${y}" width="${t}" height="${t}" rx="1.5" fill="${lit ? LIT : DIM}"/>`,
      );
    }
  }
  if (adaptive) {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">` +
      `<style>.bg{fill:${BG}}.lit{fill:${LIT}}.dim{fill:${DIM}}` +
      `@media (prefers-color-scheme:light){.bg{fill:${BG_LIGHT}}.lit{fill:${LIT_LIGHT}}.dim{fill:${DIM_LIGHT}}}</style>` +
      `<rect class="bg" width="32" height="32" rx="${round}"/>${tiles.join('')}</svg>\n`
    );
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">` +
    `<rect width="32" height="32" rx="${round}" fill="${BG}"/>${tiles.join('')}</svg>\n`
  );
};

const rounded = mark({ round: 7, inset: 5 });
writeFileSync('src/app/icon.svg', mark({ round: 7, inset: 5, adaptive: true }));
if (process.argv.includes('--svg-only')) {
  console.log('wrote src/app/icon.svg');
  process.exit(0);
}

const shells = join(homedir(), 'Library/Caches/ms-playwright');
const chrome = readdirSync(shells)
  .filter((d) => d.startsWith('chromium_headless_shell-'))
  .sort()
  .at(-1);
const bin = join(shells, chrome, 'chrome-headless-shell-mac-arm64/chrome-headless-shell');
const work = mkdtempSync(join(tmpdir(), 'favicon-'));

function png(svg, px, transparent) {
  const html = join(work, `m${px}.html`);
  const out = join(work, `m${px}.png`);
  writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block;width:${px}px;height:${px}px}</style>${svg}`);
  execFileSync(bin, ['--no-sandbox', '--hide-scrollbars', `--window-size=${px},${px}`, '--force-device-scale-factor=1', '--default-background-color=00000000', `--screenshot=${out}`, `file://${html}`], { stdio: 'ignore' });
  return readFileSync(out);
}

/** An ICO is a header, one 16-byte entry per image, then the images; a PNG may be the image since Vista. */
function ico(images) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ px, data }) => {
    const e = Buffer.alloc(16);
    e[0] = px; e[1] = px; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([head, ...entries, ...images.map((i) => i.data)]);
}

const square = mark({ round: 0, inset: 6 });
writeFileSync('src/app/apple-icon.png', png(square, 180));
writeFileSync('src/app/favicon.ico', ico([16, 32, 48].map((px) => ({ px, data: png(rounded, px) }))));
console.log('wrote src/app/icon.svg, favicon.ico, apple-icon.png');

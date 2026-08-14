/** Render a page component to static HTML on stdout.
 *
 *  Usage: node --import ./register.mjs render.mjs <route> [query] [pathSegments]
 *    node --import ./register.mjs render.mjs "/" "layer=turnout"
 *    node --import ./register.mjs render.mjs "/pl" "" "ka"
 *
 *  Test scaffolding only — never imported by the application. It exists because this sandbox refuses
 *  listen(), so `next dev` cannot run and there is no browser to point at a page; without it, a section
 *  that throws or prints a fabricated value is invisible to `tsc` and to the production build alike.
 */
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

const routes = {
  "/": { load: () => import("../../../src/app/page.tsx"), params: null },
  // THE CANONICAL ENTITY ROUTES. `/pl` stays because it is still a real route — a compatibility redirect —
  // and the redirect tests render it deliberately.
  "/state": {
    load: () => import("../../../src/app/state/[state]/page.tsx"),
    params: (segs) => ({ state: segs[0] ?? "" }),
  },
  "/district": {
    load: () => import("../../../src/app/district/[state]/[district]/page.tsx"),
    params: (segs) => ({ state: segs[0] ?? "", district: segs[1] ?? "" }),
  },
  "/constituency": {
    load: () => import("../../../src/app/constituency/[state]/[constituency]/page.tsx"),
    params: (segs) => ({ state: segs[0] ?? "", constituency: segs[1] ?? "" }),
  },
  "/constituency/analysis": {
    load: () => import("../../../src/app/constituency/[state]/[constituency]/analysis/page.tsx"),
    params: (segs) => ({ state: segs[0] ?? "", constituency: segs[1] ?? "" }),
  },
  "/pl": {
    load: () => import("../../../src/app/pl/[...path]/page.tsx"),
    params: (segs) => ({ path: segs }),
  },
  "/coverage": { load: () => import("../../../src/app/coverage/page.tsx"), params: null },
  "/p": {
    load: () => import("../../../src/app/p/[person]/page.tsx"),
    params: (segs) => ({ person: segs.join("/") }),
  },
  "/search": { load: () => import("../../../src/app/search/page.tsx"), params: null },
  "/election": {
    load: () => import("../../../src/app/election/[id]/page.tsx"),
    params: (segs) => ({ id: segs.join("/") }),
  },
};

const which = process.argv[2] ?? "/";
const route = routes[which];
if (route === undefined) {
  process.stderr.write(`unknown route: ${which}\nknown: ${Object.keys(routes).join(", ")}\n`);
  process.exit(2);
}

const searchParams = Object.fromEntries(
  (process.argv[3] ?? "")
    .split("&")
    .filter(Boolean)
    .map((kv) => kv.split("=").map(decodeURIComponent)),
);
const segments = (process.argv[4] ?? "").split("/").filter(Boolean);

const mod = await route.load();
const props = { searchParams };
if (route.params !== null) props.params = route.params(segments);

// An async server component returns a Promise, and renderToStaticMarkup cannot render one — that is the
// bundler's job in a real Next render. Calling it and awaiting the element first is enough here, because
// every page in this app is one component deep on the server.
const called = mod.default(props);
const element = typeof called?.then === "function" ? await called : called;
process.stdout.write(renderToStaticMarkup(element));

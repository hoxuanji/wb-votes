/** Render a page component to static HTML and print it. Usage: node --import ./loader.mjs render.mjs <route> */
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

const routes = {
  "/": () => import("../../../src/app/page.tsx"),
};
const which = process.argv[2] ?? "/";
const mod = await routes[which]();
const params = Object.fromEntries(
  (process.argv[3] ?? "").split("&").filter(Boolean).map((kv) => kv.split("=")),
);
process.stdout.write(renderToStaticMarkup(React.createElement(mod.default, { searchParams: params })));

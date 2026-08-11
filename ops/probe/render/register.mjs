/** Registers the .tsx hooks. Run as: node --import ./register.mjs render.mjs "/" "layer=turnout" */
import { register } from "node:module";
register("./hooks.mjs", import.meta.url);

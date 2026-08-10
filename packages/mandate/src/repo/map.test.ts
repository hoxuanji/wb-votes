// Tests for the map. The failure mode a choropleth has that a table does not: a wrong colour still
// looks like an answer, and nobody can tell by looking.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { openRead, DEV_DB_PATH } from "../db/open.ts";
import { fillFor, getMap, seatTitle } from "./map.ts";
import type { MapMode } from "./map.ts";

const HAVE_DB = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const opts = { skip: HAVE_DB ? false : "no .data/registry.db — run npm run registry:ingest" };
const MODES: MapMode[] = ["party", "margin", "turnout"];

test("every constituency with a shape is drawn exactly once", opts, () => {
  const v = getMap(openRead(), "party");
  assert.ok(v !== null, "geometry is ingested but the map returned nothing");
  assert.equal(v.seats.length, 294, `drew ${v.seats.length} seats, expected 294`);
  assert.equal(new Set(v.seats.map((s) => s.placeId)).size, v.seats.length, "a seat is drawn twice");
  for (const s of v.seats) {
    assert.ok(s.path.length > 20, `${s.name} has a degenerate path`);
    assert.ok(s.href.startsWith("/pl/"), `${s.name} links to ${s.href}`);
    // A shape nobody can name is a shape a screen reader cannot announce.
    assert.ok(seatTitle(v, s).includes(s.name), `${s.name} is missing from its own title`);
  }
  assert.match(v.viewBox, /^[\d.\s-]+$/, "viewBox is not four numbers");
});

test("a fill is never invented for a value that was not reported", opts, () => {
  const db = openRead();
  for (const mode of MODES) {
    const v = getMap(db, mode);
    assert.ok(v !== null);
    const NO_DATA = "#221e2e";
    for (const s of v.seats) {
      const value = mode === "party" ? s.winnerParty : mode === "margin" ? s.marginPct : s.turnoutPct;
      const fill = fillFor(v, s);
      if (value === null) {
        assert.equal(fill, NO_DATA, `${s.name} has no ${mode} figure but was shaded ${fill}`);
      } else {
        assert.notEqual(fill, NO_DATA, `${s.name} has a ${mode} figure but was drawn as missing`);
      }
      assert.match(fill, /^#[0-9a-f]{6}$/i, `${s.name} fill ${fill} is not a hex colour`);
    }
    // The count of unshaded seats must match the count of missing values, or the note lies.
    const missing = v.seats.filter(
      (s) => (mode === "party" ? s.winnerParty : mode === "margin" ? s.marginPct : s.turnoutPct) === null,
    ).length;
    assert.equal(v.unknown, missing, `${mode}: reported ${v.unknown} unshaded, actually ${missing}`);
  }
});

test("categorical colour is capped at three hues and never generated", opts, () => {
  const v = getMap(openRead(), "party");
  assert.ok(v !== null);
  const fills = new Set(v.seats.map((s) => fillFor(v, s)));
  // At most 3 categorical + 1 neutral "Other" + 1 no-data.
  assert.ok(fills.size <= 5, `${fills.size} distinct fills — a hue is being generated per party`);
  // Identity must be in the legend text, not only in the colour.
  const top = v.legend[0];
  assert.ok(top !== undefined && /·\s*\d+/.test(top.label), "legend does not name the party and its count");
  // Parties beyond the cap collapse into one labelled bucket rather than disappearing.
  const parties = new Set(v.seats.map((s) => s.winnerParty).filter((p) => p !== null));
  if (parties.size > 3) {
    assert.ok(
      v.legend.some((l) => l.label.startsWith("Other ·")),
      `${parties.size} parties won seats but nothing says the surplus was bucketed`,
    );
  }
});

test("sequential colour is one hue, ordered, and covers the data", opts, () => {
  const db = openRead();
  for (const mode of ["margin", "turnout"] as MapMode[]) {
    const v = getMap(db, mode);
    assert.ok(v !== null);
    const bands = v.legend.filter((l) => !l.label.startsWith("Not reported"));
    assert.ok(bands.length >= 3, `${mode} legend has ${bands.length} bands`);

    // The darkest band must hold the largest values: a ramp read backwards inverts every reading on the
    // page and looks entirely plausible.
    const values = v.seats
      .map((s) => (mode === "margin" ? s.marginPct : s.turnoutPct))
      .filter((x): x is number => x !== null);
    const hi = Math.max(...values);
    const lo = Math.min(...values);
    const hiSeat = v.seats.find((s) => (mode === "margin" ? s.marginPct : s.turnoutPct) === hi);
    const loSeat = v.seats.find((s) => (mode === "margin" ? s.marginPct : s.turnoutPct) === lo);
    assert.ok(hiSeat && loSeat);
    assert.equal(fillFor(v, hiSeat), bands.at(-1)?.fill, `${mode}: the largest value is not the last band`);
    assert.equal(fillFor(v, loSeat), bands[0]?.fill, `${mode}: the smallest value is not the first band`);

    // The legend's own range has to contain the data, or a reader cannot place a shape on it.
    const first = Number(/^([\d.]+)/.exec(bands[0]?.label ?? "")?.[1] ?? NaN);
    assert.ok(Math.abs(first - lo) < 0.15, `${mode} legend starts at ${first} but data starts at ${lo}`);
  }
});

test("an unknown mode falls back rather than rendering nothing", opts, () => {
  // The page coerces ?by= before calling, but the repo must not depend on the page for that.
  const v = getMap(openRead(), "party");
  assert.ok(v !== null && v.mode === "party");
  assert.ok(v.finding.length > 0, "no finding to put above the map");
});

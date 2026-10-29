// A name for display: ALL CAPS becomes Title Case, nothing else about it changes.

import assert from "node:assert/strict";
import test from "node:test";
import { displayName } from "./display-name.ts";

test("an ALL CAPS name is Title Case", () => {
  assert.equal(displayName("ADHIKARY PARESH CHANDRA"), "Adhikary Paresh Chandra");
});

test("an honorific's full stop stays and the next word starts a new capital", () => {
  assert.equal(displayName("DR. MD. FAZLE HAQUE"), "Dr. Md. Fazle Haque");
  assert.equal(displayName("MD.NASIRUDDIN"), "Md.Nasiruddin");
});

test("parentage the source appended is cut", () => {
  assert.equal(displayName("RAM KUMAR S/O SHYAM KUMAR"), "Ram Kumar");
  assert.equal(displayName("Sita Devi W/O Hari"), "Sita Devi");
});

test("a mixed-case name is the source's own and is unchanged", () => {
  assert.equal(displayName("Mamata Banerjee"), "Mamata Banerjee");
  assert.equal(displayName("Suvendu ADHIKARI"), "Suvendu ADHIKARI");
});

test("a name is never reordered and never empty", () => {
  assert.equal(displayName("ROY, SAMIR KUMAR"), "Roy, Samir Kumar");
  assert.equal(displayName(""), "");
  assert.equal(displayName("S/O ONLY"), "S/O Only");
});

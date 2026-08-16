import test from "node:test";
import assert from "node:assert/strict";
import { slug, contestId, candidacyId, contentId } from "./ids.ts";

test("slug folds latin to ascii", () => {
  assert.equal(slug("Mamata Banerjee"), "mamata-banerjee");
  assert.equal(slug("  Md. Salim  "), "md-salim");
  assert.equal(slug("Krishnanagar Uttar (SC)"), "krishnanagar-uttar-sc");
  assert.equal(slug("Mamatá  Banerjee"), "mamata-banerjee");
});

test("slug keeps indic scripts intact", () => {
  assert.equal(slug("মমতা ব্যানার্জী"), "মমতা-ব্যানার্জী");
  assert.equal(slug("অভিষেক  বন্দ্যোপাধ্যায়!"), "অভিষেক-বন্দ্যোপাধ্যায়");
  assert.equal(slug("नरेन्द्र मोदी"), "नरेन्द्र-मोदी");
  // the composition-exclusion trap: ড়/য় must survive a normalise round trip
  assert.equal(slug("সুকান্ত রায়"), "সুকান্ত-রায়");
  assert.match(slug("বড়ঞা"), /^বড়ঞা$/u);
});

test("slug is idempotent and deterministic", () => {
  for (const s of ["Mamata Banerjee", "মমতা ব্যানার্জী", "wb-assembly-2026", "084"]) {
    assert.equal(slug(slug(s)), slug(s), s);
    assert.equal(slug(s), slug(s), s);
  }
});

test("contest and candidacy ids are composed, stable, and unique per pair", () => {
  const c = contestId("wb-assembly-2026", "Krishnanagar Uttar");
  assert.equal(c, "wb-assembly-2026:krishnanagar-uttar");
  assert.equal(candidacyId(c, "mamata-banerjee"), "wb-assembly-2026:krishnanagar-uttar:mamata-banerjee");
  assert.notEqual(candidacyId(c, "a-b"), candidacyId(c, "a-c"));
});

test("contentId is 16 hex chars, deterministic, and framed against boundary collisions", () => {
  const id = contentId(["myneta", "wb2026", "https://x/y"]);
  assert.match(id, /^[0-9a-f]{16}$/);
  assert.equal(id, contentId(["myneta", "wb2026", "https://x/y"]));
  assert.notEqual(contentId(["ab", "c"]), contentId(["a", "bc"]));
  assert.notEqual(contentId(["a", "b"]), contentId(["ab"]));
  assert.notEqual(contentId(["a"]), contentId(["a", ""]));
});

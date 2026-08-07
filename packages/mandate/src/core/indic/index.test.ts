import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectScript, stripHonorifics, normaliseName, toLatin,
  phoneticKey, blockingKeys, UNPARSEABLE_KEY,
} from './index.ts';

const shares = (a: string, b: string): boolean =>
  blockingKeys(a).some((k) => blockingKeys(b).includes(k));

// ── the point of the module ───────────────────────────────────────────────────
// Each pair is a real variant pattern in this dataset (MyNeta vs Lokdhaba vs PRS
// transliterate the same politician differently). A miss here means the resolver never
// compares the two records and the duplicate survives forever, so these are the
// assertions to fix the algorithm for — never to weaken.
test('records for one person share a blocking key across transliterations', () => {
  const pairs: ReadonlyArray<readonly [string, string]> = [
    ['Md. Salim', 'Mohammed Salim'],        // honorific present vs spelled out
    ['Mohammad Salim', 'Md Salim'],
    ['Biswas', 'Bishwas'],                  // s/sh
    ['Sukanta Majumdar', 'Sukanta Mazumdar'], // z/j
    ['Abhishek Banerjee', 'Avishek Banerjee'], // v/b, aspirate collapse
    ['Suvendu Adhikari', 'Shubhendu Adhikari'],
    ['Zaman', 'Jaman'],
    ['মমতা ব্যানার্জী', 'Mamata Banerjee'],   // Bengali vs Latin (ya-phala glide)
    ['ममता बनर्जी', 'Mamata Banerjee'],       // Devanagari vs Latin
    ['Salim Mohammed', 'Mohammed Salim'],     // token order reversed
    ['Banerjee Abhishek', 'Abhishek Banerjee'], // Lokdhaba writes surname first
  ];
  for (const [a, b] of pairs) {
    assert.ok(shares(a, b), `${a} and ${b} must share a key — got ${JSON.stringify(blockingKeys(a))} vs ${JSON.stringify(blockingKeys(b))}`);
  }
});

test('unrelated politicians do not share a key', () => {
  for (const [a, b] of [
    ['Mamata Banerjee', 'Mukul Roy'],
    ['Suvendu Adhikari', 'Sukanta Majumdar'],
  ] as const) {
    assert.ok(!shares(a, b), `${a} and ${b} must not share a key`);
  }
});

// Over-collision is the INTENDED trade (see the module header): blocking buys recall and
// scoring pays for precision. These pairs land together on purpose. If a future change
// separates them that is fine — but it must not be done by making the key stricter, which
// would cost the recall the test above depends on.
test('surname variants over-collide on purpose, and that is scoring\'s problem', () => {
  assert.ok(shares('Abhishek Banerjee', 'Abhijit Banerjee'));
});

// ── stability, because this value is persisted in an indexed column ────────────
test('phoneticKey is stable and pure', () => {
  for (const n of ['Mamata Banerjee', 'মমতা ব্যানার্জী', 'A. K. Roy']) {
    assert.equal(phoneticKey(n), phoneticKey(n));
    assert.equal(phoneticKey(n), phoneticKey(`  ${n}  `));
  }
  // Frozen expectations: changing these silently invalidates every stored norm_key.
  assert.equal(phoneticKey('Mamata Banerjee'), 'mtbnrj');
  assert.equal(phoneticKey('Md. Salim'), 'slm');
});

// ── degenerate input: an empty key would become one giant bucket ───────────────
test('degenerate input yields an excludable sentinel, never an empty key', () => {
  for (const n of ['', '   ', '123', '!!!', '​']) {
    assert.deepEqual(blockingKeys(n), [UNPARSEABLE_KEY]);
  }
  for (const n of ['Shri', 'A. K. Roy', 'X', 'Md.', 'মমতা', 'a'.repeat(1000)]) {
    const keys = blockingKeys(n);
    assert.ok(keys.length > 0, `${n} produced no keys`);
    assert.ok(!keys.includes(''), `${n} produced an empty key`);
    assert.ok(!keys.includes(UNPARSEABLE_KEY), `${n} is parseable but was marked unparseable`);
  }
});

test('a name of only honorifics keeps its last token rather than vanishing', () => {
  assert.equal(stripHonorifics('shri'), 'shri');
  assert.equal(stripHonorifics('shri mamata banerjee'), 'mamata banerjee');
  assert.equal(stripHonorifics('md. salim'), 'salim');
  // trailing honorific-shaped token is a real name part, not a title
  assert.equal(stripHonorifics('salim mohammed'), 'salim mohammed');
});

test('normaliseName keeps script and intra-word hyphens, drops zero-width marks', () => {
  assert.equal(normaliseName('  Dr.  Mamata   Banerjee '), 'mamata banerjee');
  assert.equal(normaliseName('Abul-Kalam Azad'), 'abul-kalam azad');
  assert.equal(normaliseName('মমতা ব্যানার্জী'), 'মমতা ব্যানার্জী');
  assert.equal(normaliseName('Mamata​Banerjee'), 'mamatabanerjee');
});

test('detectScript identifies scripts and flags mixing', () => {
  assert.equal(detectScript('Mamata'), 'latn');
  assert.equal(detectScript('মমতা'), 'beng');
  assert.equal(detectScript('ममता'), 'deva');
  assert.equal(detectScript('மமதா'), 'taml');
  assert.equal(detectScript('Mamata মমতা'), 'mixed');
  assert.equal(detectScript('123 !!'), 'zyyy');
});

test('toLatin handles matras, conjuncts, nukta and ya-phala', () => {
  assert.equal(toLatin('মমতা'), 'mamata');
  assert.equal(toLatin('ব্যানার্জী'), 'byanarji'); // ya-phala is a glide, not /j/
  assert.equal(toLatin('বনর্জী'), 'banarji');
  assert.equal(toLatin('অধিকারী'), 'adhikari');
  assert.equal(toLatin('ড়'), 'ra');               // nukta form
  assert.equal(toLatin('Mamata'), 'Mamata');       // Latin passes through
});

// ── the constraint that actually matters: bucket size ─────────────────────────
// Scoring inside a bucket is O(n^2), so a coarser key is not free. Measured over every
// candidate, historical contestant and sitting MLA name in the repo. Bounds are set just
// above the current measurement so a change that makes the key materially coarser fails
// here instead of quietly making resolution quadratic.
test('blocking stays selective on the real corpus', async () => {
  const [{ candidates }, { historicalResults }, { currentMLAs }] = await Promise.all([
    import('../../../../../src/data/candidates.ts'),
    import('../../../../../src/data/historical-results.ts'),
    import('../../../../../src/data/current-mla.ts'),
  ]);

  const names: string[] = [];
  for (const c of candidates) { names.push(c.name); if (c.nameBn) names.push(c.nameBn); }
  for (const r of historicalResults) {
    names.push(r.winner.name);
    if (r.runnerUp) names.push(r.runnerUp.name);
    for (const t of r.topContestants ?? []) names.push(t.name);
  }
  for (const m of currentMLAs) names.push(m.name);

  const buckets = new Map<string, Set<string>>();
  let unparseable = 0;
  for (const n of names) {
    for (const k of blockingKeys(n)) {
      if (k === UNPARSEABLE_KEY) { unparseable += 1; continue; }
      let s = buckets.get(k);
      if (!s) { s = new Set(); buckets.set(k, s); }
      s.add(n);
    }
  }

  const sizes = [...buckets.values()].map((s) => s.size);
  const maxBucket = Math.max(...sizes);
  const pairs = sizes.reduce((acc, n) => acc + (n * (n - 1)) / 2, 0);
  const distinct = new Set(names).size;
  const naive = (distinct * (distinct - 1)) / 2;
  const reduction = 1 - pairs / naive;

  // Measured 2026-08-07: 9,530 names / 6,307 distinct, 0 unparseable, max bucket 342
  // ("mndl" — Mandal is the commonest surname in this corpus), 163,809 pairs, 99.18%.
  assert.equal(unparseable, 0, 'every real name in the corpus must produce a usable key');
  assert.ok(maxBucket <= 400, `max bucket ${maxBucket} exceeds 400 — key has become too coarse`);
  assert.ok(reduction > 0.985, `pair reduction ${(reduction * 100).toFixed(2)}% fell below 98.5%`);
  assert.ok(pairs < 250_000, `${pairs} candidate pairs exceeds the 250k budget`);
});

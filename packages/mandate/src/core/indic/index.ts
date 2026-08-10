/**
 * Indic name normalisation and phonetic blocking keys.
 *
 * Used in two places (§17): search normalisation, and entity-resolution blocking
 * (`person_alias.norm_key`, indexed by ops/migrations/001_registry.sql).
 *
 * DESIGN RULE, and the thing to hold on to when tempted to "improve" this:
 * blocking optimises RECALL, not precision. A pair that lands in different buckets is
 * never compared and the duplicate survives forever; a pair wrongly placed in the same
 * bucket costs one scoring call and gets rejected in resolve/score.ts. So these keys
 * deliberately over-collapse. Banerjee/Bandyopadhyay and Abhishek/Abhijit landing
 * together is not a defect — it is the intended trade. The only precision constraint
 * that matters here is BUCKET SIZE, because scoring inside a bucket is O(n^2).
 *
 * Every function is a pure function of its input string. `phoneticKey` is persisted in an
 * indexed column, so its output must be stable across processes and releases forever.
 */

export type Script =
  | 'latn' | 'beng' | 'deva' | 'taml' | 'telu' | 'knda'
  | 'mlym' | 'gujr' | 'orya' | 'guru' | 'arab' | 'mixed' | 'zyyy';

/** Returned instead of an unusable empty key. The resolver MUST exclude this bucket. */
export const UNPARSEABLE_KEY = '!unparseable';

const BLOCKS: ReadonlyArray<readonly [Script, number, number]> = [
  ['latn', 0x0041, 0x024f],
  ['arab', 0x0600, 0x06ff],
  ['deva', 0x0900, 0x097f],
  ['beng', 0x0980, 0x09ff],
  ['guru', 0x0a00, 0x0a7f],
  ['gujr', 0x0a80, 0x0aff],
  ['orya', 0x0b00, 0x0b7f],
  ['taml', 0x0b80, 0x0bff],
  ['telu', 0x0c00, 0x0c7f],
  ['knda', 0x0c80, 0x0cff],
  ['mlym', 0x0d00, 0x0d7f],
];

/** Script of a string by Unicode block. 'mixed' if two or more, 'zyyy' if no letters. */
export function detectScript(s: string): Script {
  const seen = new Set<Script>();
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    for (const [name, lo, hi] of BLOCKS) {
      if (cp >= lo && cp <= hi) { seen.add(name); break; }
    }
  }
  if (seen.size === 0) return 'zyyy';
  if (seen.size === 1) return [...seen][0] as Script;
  return 'mixed';
}

// ── honorifics ────────────────────────────────────────────────────────────────
// Leading position only. This dataset carries them inconsistently across sources
// (MyNeta keeps "Md.", Lokdhaba drops it) and they wreck matching.
const HONORIFICS = new Set([
  'shri', 'sri', 'shree', 'sree', 'smt', 'smti', 'srimati', 'shrimati',
  'dr', 'doctor', 'adv', 'advocate', 'prof', 'professor', 'er', 'engineer',
  'md', 'mohd', 'mohammad', 'mohammed', 'muhammad', 'sk', 'sheikh', 'shaikh',
  'late', 'mr', 'mrs', 'ms', 'miss', 'kumari', 'km', 'capt', 'col', 'maj', 'shrimaan',
  'শ্রী', 'শ্রীমতী', 'শ্রীমতি', 'ডঃ', 'ডাঃ', 'মোঃ', 'মোহাম্মদ', 'অ্যাডভোকেট',
  'श्री', 'श्रीमती', 'डॉ', 'डा', 'मो', 'मोहम्मद', 'स्वर्गीय',
]);

/**
 * Strip leading honorifics. Never returns empty: a string that is *only* honorifics
 * keeps its last token, because "Shri" as an actual given name is rarer than a bug here.
 */
export function stripHonorifics(s: string): string {
  const tokens = s.split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < tokens.length - 1) {
    const t = (tokens[i] ?? '').replace(/[.।]+$/u, '').toLowerCase();
    if (!HONORIFICS.has(t)) break;
    i += 1;
  }
  return tokens.slice(i).join(' ');
}

/**
 * NFC, casefold, strip honorifics and punctuation, collapse whitespace.
 * Keeps intra-word hyphens. Returns the name in its ORIGINAL script — it does not
 * transliterate; that is `toLatin`.
 */
function cleanText(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[\u200B-\u200F\u2060\uFEFF]/gu, '') // ZWSP, ZWNJ, ZWJ, LRM/RLM, WJ, BOM
    .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}

export function normaliseName(s: string): string {
  return stripHonorifics(cleanText(s)).trim();
}

// ── transliteration ───────────────────────────────────────────────────────────
// ITRANS-flavoured, deliberately lossy: this feeds a matching key, not a display name.
// Retroflex and dental series both emit the same Latin letter — the collapse §2 P3 wants
// happens here rather than in a later pass.

const CONSONANTS: Record<string, string> = {
  // Bengali
  'ক': 'k', 'খ': 'kh', 'গ': 'g', 'ঘ': 'gh', 'ঙ': 'ng',
  'চ': 'c', 'ছ': 'ch', 'জ': 'j', 'ঝ': 'jh', 'ঞ': 'n',
  'ট': 't', 'ঠ': 'th', 'ড': 'd', 'ঢ': 'dh', 'ণ': 'n',
  'ত': 't', 'থ': 'th', 'দ': 'd', 'ধ': 'dh', 'ন': 'n',
  'প': 'p', 'ফ': 'ph', 'ব': 'b', 'ভ': 'bh', 'ম': 'm',
  'য': 'j', 'র': 'r', 'ল': 'l', 'শ': 'sh', 'ষ': 'sh', 'স': 's', 'হ': 'h',
  'ড়': 'r', 'ঢ়': 'rh', 'য়': 'y', 'ৎ': 't',
  // Devanagari
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
  'च': 'c', 'छ': 'ch', 'ज': 'j', 'झ': 'jh', 'ञ': 'n',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v',
  'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h', 'ळ': 'l',
  'ड़': 'r', 'ढ़': 'rh',
};

const INDEPENDENT_VOWELS: Record<string, string> = {
  'অ': 'a', 'আ': 'a', 'ই': 'i', 'ঈ': 'i', 'উ': 'u', 'ঊ': 'u', 'ঋ': 'ri',
  'এ': 'e', 'ঐ': 'ai', 'ও': 'o', 'ঔ': 'au',
  'अ': 'a', 'आ': 'a', 'इ': 'i', 'ई': 'i', 'उ': 'u', 'ऊ': 'u', 'ऋ': 'ri',
  'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au',
};

const MATRAS: Record<string, string> = {
  'া': 'a', 'ি': 'i', 'ী': 'i', 'ু': 'u', 'ূ': 'u', 'ৃ': 'ri',
  'ে': 'e', 'ৈ': 'ai', 'ো': 'o', 'ৌ': 'au',
  'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'ृ': 'ri',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au',
};

const VIRAMA = new Set(['্', '्']);
const ANUSVARA = new Set(['ং', 'ं']);
const NUKTA = new Set(['়', '़']);
const DROPPED = new Set(['ঁ', 'ँ', 'ঃ', 'ः']); // chandrabindu, visarga

// Bengali RRA/RHA/YYA (U+09DC/DD/DF) and the Devanagari nukta letters are on Unicode's
// COMPOSITION EXCLUSION list, so NFC leaves them DECOMPOSED as base + nukta — a map keyed
// on the precomposed character can never match. য় is the last letter of বন্দ্যোপাধ্যায়,
// so getting this wrong silently mistransliterates a very common Bengali surname.
const NUKTA_FORMS: Record<string, string> = {
  'ড': 'r', 'ঢ': 'rh', 'য': 'y',
  'ड': 'r', 'ढ': 'rh', 'ज': 'j', 'क': 'k', 'ख': 'kh', 'ग': 'g', 'फ': 'p',
};

/**
 * Bengali/Devanagari → Latin, sufficient for matching, not for display.
 * Handles matras, inherent-a, virama conjuncts and nukta forms (ড়/ঢ়/য়).
 * Characters from other scripts pass through unchanged.
 */
export function toLatin(s: string): string {
  const chars = [...s.normalize('NFC')];
  let out = '';
  let afterVirama = false;
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i] ?? '';
    const cons = CONSONANTS[ch];
    if (cons !== undefined) {
      // ya-phala: য/य directly after a virama is a glide, not /j/ — ব্যানার্জী is
      // "banarji", not "bjanarji". Emitting 'y' lets the vowel filter drop it, which is
      // what makes the Bengali and Latin spellings of a name share a blocking key.
      const isYaPhala = afterVirama && (ch === 'য' || ch === 'य');
      const nuktaNext = NUKTA.has(chars[i + 1] ?? '');
      const nuktaForm = nuktaNext ? NUKTA_FORMS[ch] : undefined;
      if (nuktaForm !== undefined) { out += nuktaForm; i += 1; }
      else out += isYaPhala ? 'y' : cons;
      afterVirama = false;
      // Inherent 'a' unless a matra, a virama or another combining mark follows.
      const next = chars[i + 1] ?? '';
      const suppressed =
        MATRAS[next] !== undefined || VIRAMA.has(next) || ANUSVARA.has(next)
        || NUKTA.has(next) || DROPPED.has(next);
      if (!suppressed) out += 'a';
      continue;
    }
    const vowel = INDEPENDENT_VOWELS[ch];
    if (vowel !== undefined) { out += vowel; afterVirama = false; continue; }
    const matra = MATRAS[ch];
    if (matra !== undefined) { out += matra; afterVirama = false; continue; }
    if (ANUSVARA.has(ch)) { out += 'ng'; afterVirama = false; continue; }
    if (VIRAMA.has(ch)) { afterVirama = true; continue; }
    if (DROPPED.has(ch) || NUKTA.has(ch)) continue;
    out += ch;
    afterVirama = false;
  }
  return out;
}

// ── the phonetic key ──────────────────────────────────────────────────────────
// Ordered longest-first: two-character digraphs must be collapsed before the
// single-character equivalences run, or "sh" becomes "s"+"h".
const DIGRAPHS: ReadonlyArray<readonly [string, string]> = [
  ['kh', 'k'], ['gh', 'g'], ['ch', 'c'], ['jh', 'j'], ['th', 't'], ['dh', 'd'],
  ['ph', 'p'], ['bh', 'b'], ['sh', 's'], ['ss', 's'], ['zh', 'j'], ['ck', 'k'],
  ['gy', 'j'], ['dg', 'j'],
];

// Single-character equivalences that matter for Indian names:
// Bengali has no /v/, so v/w/b interchange freely (Banerjee/Vanerjee, Bishwas/Vishwas).
// z/j (Zaman/Jaman), q/k, c/k, and y treated as a vowel-glide so Banerjee ≡ byanarji.
const SINGLES: Record<string, string> = {
  v: 'b', w: 'b', z: 'j', q: 'k', c: 'k', f: 'p', x: 'k',
};

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y']);

/** The consonant skeleton of one token. '' if the token has no usable letters. */
function tokenKey(token: string): string {
  let t = normaliseName(token);
  if (detectScript(t) !== 'latn' && detectScript(t) !== 'zyyy') t = toLatin(t);
  t = t.toLowerCase().replace(/[^a-z]/gu, '');
  if (t === '') return '';

  for (const [from, to] of DIGRAPHS) t = t.split(from).join(to);
  t = [...t].map((ch) => SINGLES[ch] ?? ch).join('');

  // Keep the first letter whatever it is (vowel-initial names must stay distinct from
  // consonant-initial ones), then keep only consonants.
  const head = t[0] ?? '';
  let body = '';
  for (const ch of t.slice(1)) if (!VOWELS.has(ch)) body += ch;
  let key = head + body;

  // Collapse doubled consonants: Chattopadhyay's "tt" must equal Chatopadhyay's "t".
  key = key.replace(/(.)\1+/gu, '$1');
  return key;
}

function tokensOf(s: string): string[] {
  return normaliseName(s).split(/[\s-]+/u).filter(Boolean);
}

/** Tokens WITHOUT honorific stripping — see the note in blockingKeys. */
function tokensOfRaw(s: string): string[] {
  return cleanText(s).split(/[\s-]+/u).filter(Boolean);
}

/**
 * Per-token skeletons, in token order. `[]` when the name has no usable letters.
 *
 * This is the form anything that needs to REASON about a name must use. phoneticKey() concatenates
 * these, which loses the token boundaries — deliberate for blocking (recall), wrong as an equality
 * signal, because "Keya Biswas" -> k|bsbs and "…Haque Biswas" -> …|hk|bsbs both contain "kbsbs".
 */
export function tokenKeys(s: string): string[] {
  return tokensOf(s).map(tokenKey).filter((k) => k !== '');
}

/**
 * Stable phonetic key for a whole name, in token order.
 * Persisted and indexed — the output must never change for a given input.
 */
export function phoneticKey(s: string): string {
  const keys = tokenKeys(s);
  return keys.length === 0 ? UNPARSEABLE_KEY : keys.join('');
}

/**
 * The 1–3 keys a name should be INDEXED under. Union the buckets when querying.
 *
 * The token-order-independent key is the important one: this dataset's dominant
 * duplicate pattern is that Lokdhaba writes surname-first while MyNeta writes
 * given-name-first, so an order-sensitive key never compares the two records for
 * one human. The surname key catches the other pattern — an honorific-stripped
 * "Md. Salim" reduces to one token and must still meet "Mohammed Salim".
 */
export function blockingKeys(s: string): string[] {
  const keys = tokensOf(s).map(tokenKey).filter((k) => k !== '');
  if (keys.length === 0) return [UNPARSEABLE_KEY];

  const out = new Set<string>();
  out.add([...keys].sort().join('|'));   // order-independent
  out.add(keys.join(''));                // in-order

  // Also key the UNSTRIPPED form. Honorific stripping is position-sensitive, so
  // "Mohammed Salim" reduces to one token while "Salim Mohammed" keeps two — which
  // breaks order-independence for exactly the name where it matters most in this
  // dataset. Keying both forms costs one extra bucket and restores the collision.
  const raw = tokensOfRaw(s).map(tokenKey).filter((k) => k !== '');
  if (raw.length > keys.length) out.add([...raw].sort().join('|'));

  // The surname key, for the dropped-honorific and initialled cases: "Md. Salim" reduces to one token
  // and must still meet "Mohammed Salim"; "A Banerjee" must still meet "Abhishek Banerjee".
  //
  // ALWAYS qualified by the leading token's initial, never emitted bare. A bare surname key is not a
  // blocking key in an Indian corpus — measured on the national registry, bare "sng" (Singh) held 39,816
  // aliases and that one bucket implied a billion pairs, so it was dropped for exceeding the bucket cap
  // and every Singh silently became unmatchable to every other Singh. Qualifying takes the worst bucket
  // to 5,477. The guard for short skeletons ("Roy" → "r") was already doing exactly this; the only change
  // is that long surnames stop being the exception.
  //
  // The initial comes from the PHONETIC key, not the raw name, so it inherits the folding this module
  // already does: "Vikash Singh" and "Bikash Singh" both key under 'b', as do "Suvendu" / "Shubhendu".
  const significant = keys.filter((k) => k.length > 1);
  const surname = significant[significant.length - 1] ?? keys[keys.length - 1] ?? '';
  if (surname !== '') out.add((keys[0] ?? '').slice(0, 1) + ':' + surname);

  return [...out];
}

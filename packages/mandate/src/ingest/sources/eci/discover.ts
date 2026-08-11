/**
 * ECI artefact discovery. Deterministic, three requests deep, no search engine.
 *
 *   /asset-manifest.json          -> the current JS bundle's hashed filename
 *   /static/js/main.<hash>.js     -> the API base and the public `secret` header value
 *   <base>/api/election-result?category_id=N   -> every artefact of one election, with its URL
 *
 * Artefact URLs are DISCOVERED, never constructed: outside GE-2024 they carry an upload epoch
 * (`10-Detailed_Results_1778165388.xlsx`) that cannot be derived from anything. See
 * docs/ingestion/eci-2023-2026.md §2-3.
 *
 * THE SECRET. The discovery API requires a `secret` header whose value is a literal in ECI's own
 * public JS bundle. It is a public rotating client token, not a credential: it guards nothing, it is
 * served to every browser that loads eci.gov.in, and it protects published election results. It is
 * therefore READ FROM THE BUNDLE at run time rather than committed here — a hardcoded copy would
 * silently rot the day ECI rotates it, and the failure would look like "ECI has no data" rather than
 * "our token is stale".
 *
 * FAIL LOUDLY is the rule this module exists to enforce. An empty `results` array, a `success: false`,
 * a 200 carrying the SPA's HTML shell instead of JSON, or a missing secret are all THROWS. None of them
 * may be read as "this election has no artefacts", because every one of them has the same shape as a
 * real answer of zero and the consequence of confusing them is an import that quietly does nothing.
 */

import { httpGet, type Fetcher } from "./transport.ts";

export const ECI_ORIGIN = "https://www.eci.gov.in";

export type { Fetcher };

export type ApiAccess = {
  /** e.g. https://www.eci.gov.in/eci-backend/public */
  base: string;
  secret: string;
  /** Which bundle the values came from, recorded so a rotation is visible in the report. */
  bundle: string;
};

/** One publishable file for one election, exactly as ECI describes it. */
export type Artefact = {
  categoryId: number;
  /** ECI's row id within the category. Positional; not the report number. */
  rowId: number;
  /** ECI's own report number, parsed from the title prefix: '33', '13', '2(A)'. */
  reportNo: string;
  title: string;
  spreadsheetUrl: string | null;
  pdfUrl: string | null;
};

export type Category = {
  categoryId: number;
  /** ECI's name for the election, verbatim — the only election-type/house/year signal it publishes. */
  name: string;
  headline: string;
  artefacts: Artefact[];
};

const defaultFetch = httpGet;

/**
 * Read the API base and the public secret out of ECI's live bundle.
 *
 * Both are located by USE rather than by value: the bundle is searched for identifiers passed as the
 * `secret` header, and then for those identifiers' string assignments. Matching the literal
 * `ECI@...` instead would break on the first rotation, which is the exact failure this avoids.
 */
export async function apiAccess(fetcher: Fetcher = defaultFetch, origin = ECI_ORIGIN): Promise<ApiAccess> {
  const manifestUrl = `${origin}/asset-manifest.json`;
  const mres = await fetcher(manifestUrl);
  if (!mres.ok) throw new Error(`ECI asset manifest ${manifestUrl} returned ${mres.status}`);
  const manifest = JSON.parse(mres.text()) as { files?: Record<string, string> };
  const mainJs = manifest.files?.["main.js"];
  if (typeof mainJs !== "string") {
    throw new Error(`ECI asset manifest has no files["main.js"]: ${JSON.stringify(manifest).slice(0, 200)}`);
  }

  const bundleUrl = mainJs.startsWith("http") ? mainJs : `${origin}${mainJs}`;
  const bres = await fetcher(bundleUrl);
  if (!bres.ok) throw new Error(`ECI bundle ${bundleUrl} returned ${bres.status}`);
  const { base, secret } = extractAccess(bres.text());
  return { base, secret, bundle: bundleUrl };
}

/**
 * The pure half of `apiAccess`, so a test can pin it on a bundle fixture with no network.
 *
 * HOW THE SECRET IS LOCATED, and why not by value. ECI's bundle declares both constants in ONE minified
 * `var` statement:
 *
 *   var wl="ECI@MAIN825",kl="https://www.eci.gov.in/eci-backend/public",Cl="https://www.eci.gov.in";
 *
 * So the anchor is that statement. Two simpler ideas were tried and are wrong: matching the literal
 * `ECI@…` breaks on the first rotation, which is the failure this whole function exists to avoid; and
 * following `headers:{secret:s}` back to `s` fails because a minifier reuses one-letter names — the
 * bundle holds hundreds of `s="…"` assignments and the first one resolved the secret to the string
 * "function". The declaration site is unambiguous where the use sites are not.
 */
export function extractAccess(js: string): { base: string; secret: string } {
  const assign = /([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*["'](https:\/\/[A-Za-z0-9.-]*eci\.gov\.in\/eci-backend\/public)["']/.exec(js);
  if (assign === null) throw new Error("ECI bundle: no assignment of the eci-backend/public API base found");
  const base = assign[2] as string;
  if (!/\bsecret\s*:/.test(js)) {
    throw new Error("ECI bundle: found the API base but the bundle never sends a `secret` header — the API changed");
  }

  // The enclosing var statement: from the `var` before the assignment to the `;` after it.
  const at = assign.index;
  const from = Math.max(0, js.lastIndexOf("var ", at));
  const semi = js.indexOf(";", at + (assign[0] as string).length);
  const statement = js.slice(from, semi === -1 ? at + 400 : semi);

  // A token, not a URL and not a minifier artefact: printable ASCII, no spaces, no scheme.
  const plausible = (v: string): boolean =>
    /^[\x21-\x7e]{6,64}$/.test(v) && !/^https?:/i.test(v) && !/^(function|return|object|string|undefined|production)$/.test(v);

  for (const m of statement.matchAll(/([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*["']([^"']{1,120})["']/g)) {
    const value = m[2] as string;
    if (value !== base && plausible(value)) return { base, secret: value };
  }
  throw new Error(
    `ECI bundle: found the API base but no \`secret\` value beside it. Declaration read: ${statement.slice(0, 200)}`,
  );
}

/**
 * Every artefact ECI publishes for one election category.
 *
 * `expect` is the artefact count the caller believes the category holds. Passing it turns a silent
 * upstream change — a report withdrawn, a report added — into a failed run rather than a short import,
 * which is the only way a fixed-size expectation is worth having.
 */
export async function discoverCategory(
  access: ApiAccess,
  categoryId: number,
  opts: { fetcher?: Fetcher; expect?: number } = {},
): Promise<Category> {
  const fetcher = opts.fetcher ?? defaultFetch;
  const url = `${access.base}/api/election-result?category_id=${categoryId}`;
  const res = await fetcher(url, { secret: access.secret });
  if (!res.ok) throw new Error(`ECI discovery ${url} returned ${res.status}`);

  // A rejected secret, or any route ECI has moved, answers 200 with the SPA's HTML shell. Parsing that
  // as JSON throws something unreadable, so the content type is checked first and named in the error.
  const type = res.contentType ?? "";
  const body = res.text();
  if (!type.includes("json")) {
    throw new Error(
      `ECI discovery ${url} answered ${res.status} with ${type || "no content-type"}, not JSON — ` +
        `the \`secret\` header is probably stale (bundle ${access.bundle}). Body: ${body.slice(0, 120)}`,
    );
  }
  return parseCategory(categoryId, body, opts.expect);
}

/** The pure half of `discoverCategory`: validate the shape, or throw saying exactly what was wrong. */
export function parseCategory(categoryId: number, body: string, expect?: number): Category {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch (cause) {
    throw new Error(`ECI discovery category ${categoryId}: body is not JSON: ${body.slice(0, 120)}`, { cause });
  }
  const o = json as {
    code?: unknown;
    success?: unknown;
    cat_name?: unknown;
    title_headline?: unknown;
    totalResults?: unknown;
    results?: unknown;
  };
  if (o.success !== true || o.code !== 200) {
    throw new Error(
      `ECI discovery category ${categoryId}: success=${String(o.success)} code=${String(o.code)} — refusing to continue`,
    );
  }
  if (!Array.isArray(o.results)) {
    throw new Error(`ECI discovery category ${categoryId}: \`results\` is ${typeof o.results}, not an array`);
  }
  const rows = o.results as Record<string, unknown>[];
  // The two facts that must agree. An empty array is never "zero artefacts" — it is a broken response.
  if (rows.length === 0) {
    throw new Error(`ECI discovery category ${categoryId}: zero artefacts. An empty result is a failure, not an answer`);
  }
  if (typeof o.totalResults === "number" && o.totalResults !== rows.length) {
    throw new Error(
      `ECI discovery category ${categoryId}: totalResults=${o.totalResults} but ${rows.length} rows arrived`,
    );
  }
  if (expect !== undefined && rows.length !== expect) {
    throw new Error(
      `ECI discovery category ${categoryId}: expected ${expect} artefacts, found ${rows.length}. ` +
        `Upstream changed — re-run reconnaissance rather than importing a different corpus`,
    );
  }

  const artefacts = rows.map((r, i): Artefact => {
    const title = String(r["title"] ?? "").trim();
    if (title === "") throw new Error(`ECI discovery category ${categoryId}: artefact ${i} has no title`);
    const sheet = url(r["xlsx_url"]);
    const pdf = url(r["pdf_zip_url"]);
    if (sheet === null && pdf === null) {
      throw new Error(`ECI discovery category ${categoryId}: artefact "${title}" carries no URL`);
    }
    return {
      categoryId,
      rowId: Number(r["id"] ?? i),
      reportNo: reportNumber(title),
      title,
      spreadsheetUrl: sheet,
      pdfUrl: pdf,
    };
  });
  return {
    categoryId,
    name: String(o.cat_name ?? "").trim(),
    headline: String(o.title_headline ?? "").trim(),
    artefacts,
  };
}

const url = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/**
 * ECI's own report number, from the title prefix: '33.Constituency Wise Detailed Result' -> '33',
 * '2(A).Constituency Data Summary For PC-SURAT' -> '2(A)', '1 - Other Abbreviations' -> '1'.
 *
 * This is the stable identity of a report within an election. The API's `id` is positional — GE-2024
 * row 36 holds report 33 — and the URL carries an upload epoch, so neither can key an artefact across
 * runs. A title with no leading number yields '', and the caller selects by title instead.
 */
export function reportNumber(title: string): string {
  return /^\s*(\d+\s*(?:\([A-Za-z]\))?)\s*[.\-–]/.exec(title)?.[1]?.replace(/\s+/g, "") ?? "";
}

/** Find one artefact by ECI report number, or throw naming what the category does hold. */
export function report(category: Category, reportNo: string): Artefact {
  const hit = category.artefacts.find((a) => a.reportNo === reportNo);
  if (hit === undefined) {
    throw new Error(
      `ECI category ${category.categoryId} has no report ${reportNo}. Present: ` +
        category.artefacts.map((a) => a.reportNo || `"${a.title}"`).join(", "),
    );
  }
  return hit;
}

// ── 2024 Lok Sabha ────────────────────────────────────────────────────────────────────────────────

/** The GE-2024 statistical report set. 42 artefacts, verified 2026-08-11. */
export const LS2024_CATEGORY = 1;
export const LS2024_ARTEFACT_COUNT = 42;

/**
 * The four reports this phase reads, and why each one rather than another.
 *
 * Report 33 is the only file with every candidate of every constituency, and report 13 the only one
 * that numbers the constituencies. Report 4 states the winner and the margin outright, so neither has
 * to be inferred from row order. Report 2(A) exists because Surat was won unopposed and is therefore
 * absent from report 33 — without it the import is 542 of 543. §7 of the reconnaissance.
 */
export const LS2024_REPORTS = {
  detailedResult: "33",
  turnout: "13",
  successfulCandidates: "4",
  surat: "2(A)",
} as const;

export async function discoverLs2024(access: ApiAccess, fetcher?: Fetcher): Promise<Category> {
  return discoverCategory(access, LS2024_CATEGORY, {
    ...(fetcher === undefined ? {} : { fetcher }),
    expect: LS2024_ARTEFACT_COUNT,
  });
}

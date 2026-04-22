#!/usr/bin/env ts-node
/**
 * MyNeta.info / ECI Data Ingestion Script
 *
 * Fetches candidate affidavit data for West Bengal Assembly Election.
 * Source: https://myneta.info/westbengal2021/
 *
 * Usage:
 *   npx ts-node scripts/scraper/myneta.ts --election=2021 --output=./src/data/candidates_real.ts
 *
 * NOTE: Always verify you comply with the source site's Terms of Service.
 * Data from ECI affidavits is publicly available. MyNeta/ADR republish it.
 */

import https from 'https';
import * as fs from 'fs';
import * as path from 'path';

// ────────────────────────────────────────────────────────────
// CONFIG
// ────────────────────────────────────────────────────────────

const BASE_URL = 'https://myneta.info/westbengal2021';
const OUTPUT_PATH = path.resolve(__dirname, '../../src/data/candidates_real.json');

// Constituency IDs from MyNeta for WB 2021 — extend as needed
const CONSTITUENCY_SLUGS = [
  'chowringhee',
  'entally',
  'beleghata',
  'jadavpur',
  'kasba',
  'barasat',
  'siliguri',
];

// ────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────

interface RawCandidate {
  name: string;
  party: string;
  constituency: string;
  age?: number;
  gender?: string;
  education?: string;
  criminalCases?: number;
  totalAssets?: number;
  totalLiabilities?: number;
  affidavitUrl?: string;
}

// ────────────────────────────────────────────────────────────
// FETCH HELPER
// ────────────────────────────────────────────────────────────

function fetchHtml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'WBVotes-DataBot/1.0 (educational, non-commercial)' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ────────────────────────────────────────────────────────────
// PARSERS (regex-based, avoid external DOM deps)
// ────────────────────────────────────────────────────────────

function extractTableRows(html: string): string[][] {
  const tableMatch = html.match(/<table[^>]*class="[^"]*w3-table[^"]*"[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return [];

  const rowMatches = tableMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  const rows: string[][] = [];

  for (const row of rowMatches) {
    const cellMatches = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)];
    const cells = cellMatches.map((m) => m[1].replace(/<[^>]+>/g, '').trim());
    if (cells.length > 3) rows.push(cells);
  }

  return rows;
}

function parseAssets(text: string): number {
  const clean = text.replace(/[₹,\s]/g, '');
  if (clean.includes('Cr')) return Math.round(parseFloat(clean) * 10_000_000);
  if (clean.includes('L'))  return Math.round(parseFloat(clean) * 100_000);
  return parseInt(clean, 10) || 0;
}

function parseRows(rows: string[][], constituency: string): RawCandidate[] {
  return rows
    .slice(1) // skip header
    .map((row) => ({
      name:            row[1] ?? 'Unknown',
      party:           row[2] ?? 'IND',
      constituency,
      age:             parseInt(row[3], 10) || undefined,
      gender:          row[4]?.trim() || undefined,
      education:       row[5]?.trim() || undefined,
      criminalCases:   parseInt(row[6], 10) || 0,
      totalAssets:     parseAssets(row[7] ?? '0'),
      totalLiabilities: parseAssets(row[8] ?? '0'),
    }))
    .filter((c) => c.name && c.name !== 'Unknown');
}

// ────────────────────────────────────────────────────────────
// MAIN
// ────────────────────────────────────────────────────────────

async function scrape(): Promise<void> {
  console.log('📥 Starting MyNeta scrape for West Bengal...\n');
  const allCandidates: RawCandidate[] = [];

  for (const slug of CONSTITUENCY_SLUGS) {
    const url = `${BASE_URL}/constituency_wise.php?constituency_id=${slug}`;
    console.log(`  Fetching: ${slug}`);

    try {
      const html = await fetchHtml(url);
      const rows = extractTableRows(html);
      const parsed = parseRows(rows, slug);
      console.log(`  ✓ Found ${parsed.length} candidates`);
      allCandidates.push(...parsed);
    } catch (err) {
      console.warn(`  ✗ Failed: ${slug} — ${(err as Error).message}`);
    }

    // Polite delay to avoid hammering the server
    await new Promise((r) => setTimeout(r, 1200));
  }

  // Write output
  const output = JSON.stringify(allCandidates, null, 2);
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, output, 'utf-8');

  console.log(`\n✅ Scraped ${allCandidates.length} candidates → ${OUTPUT_PATH}`);
  console.log('\nNext step: Run the DB seed script to load this data into Supabase.');
  console.log('  npm run db:seed\n');
}

scrape().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

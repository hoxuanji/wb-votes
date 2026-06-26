#!/usr/bin/env node
/**
 * seed-civic-reports.js — push first-week civic-issue seeds into Supabase.
 *
 * Idempotent: skips rows where (constituency_id, submitted_at) already exists.
 * Safe no-op if Supabase env is unconfigured (so CI / local without secrets
 * doesn't fail).
 *
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/seed-civic-reports.js
 */
const fs = require('fs');
const path = require('path');

const seedPath = path.join(__dirname, 'data', 'civic-reports-seed.json');
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_URL.includes('[PROJECT]')) {
  console.log('[seed-civic-reports] Supabase not configured — skipping. Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to ingest.');
  process.exit(0);
}

async function existing(constituencyId, submittedAt) {
  const qs = `?constituency_id=eq.${encodeURIComponent(constituencyId)}&submitted_at=eq.${encodeURIComponent(submittedAt)}&select=id`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/civic_reports${qs}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`existing-check failed: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  return rows.length > 0;
}

async function insert(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/civic_reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`insert failed: ${res.status} ${await res.text()}`);
}

(async () => {
  let inserted = 0, skipped = 0;
  for (const r of seed.reports) {
    if (await existing(r.constituency_id, r.submitted_at)) {
      console.log(`  skip   ${r.constituency_id} @ ${r.submitted_at} (already present)`);
      skipped++;
      continue;
    }
    await insert(r);
    console.log(`  insert ${r.constituency_id} @ ${r.submitted_at}`);
    inserted++;
  }
  console.log(`\n[seed-civic-reports] done — inserted ${inserted}, skipped ${skipped}`);
})().catch((err) => {
  console.error('[seed-civic-reports] failed:', err.message);
  process.exit(1);
});

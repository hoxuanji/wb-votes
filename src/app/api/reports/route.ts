import { NextResponse } from 'next/server';
import type { SeedCivicIssue } from '@/types';

export const runtime = 'nodejs';

// GET — return real citizen reports from Supabase. Empty array if Supabase is
// not configured. There is no seed fallback — we only show what's actually been
// submitted.

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const acId     = searchParams.get('acId');
  const category = searchParams.get('category');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('[PROJECT]')) {
    return NextResponse.json({ issues: [], total: 0 });
  }

  try {
    const filters: string[] = [];
    if (acId)     filters.push(`constituency_id=eq.${acId}`);
    if (category) filters.push(`category=eq.${category}`);
    const qs = filters.length
      ? `?${filters.join('&')}&order=submitted_at.desc&limit=50`
      : '?order=submitted_at.desc&limit=50';

    const res = await fetch(`${supabaseUrl}/rest/v1/civic_reports${qs}`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Accept: 'application/json',
      },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return NextResponse.json({ issues: [], total: 0 });
    }

    const rows: Array<{
      id: string; constituency_id: string; category: string;
      description: string; location?: string; submitted_at: string; status: string;
    }> = await res.json();

    const issues: SeedCivicIssue[] = rows.map(r => ({
      id:             r.id,
      constituencyId: r.constituency_id,
      category:       r.category as SeedCivicIssue['category'],
      severity:       'medium',
      title:          r.description.slice(0, 80),
      description:    r.description,
      location:       r.location,
      reportedOn:     r.submitted_at.slice(0, 10),
      status:         r.status as SeedCivicIssue['status'],
      source:         'citizen',
    }));

    return NextResponse.json({ issues, total: issues.length });
  } catch {
    return NextResponse.json({ issues: [], total: 0 });
  }
}

// POST — submit a citizen report. Stored to Supabase if configured, otherwise
// logged server-side (development fallback).

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { constituencyId, category, description, location, submittedAt } = body;

    if (!constituencyId || !category || !description) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseKey && !supabaseUrl.includes('[PROJECT]')) {
      const res = await fetch(`${supabaseUrl}/rest/v1/civic_reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          constituency_id: constituencyId,
          category,
          description,
          location: location ?? null,
          submitted_at: submittedAt ?? new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        console.error('Supabase insert failed:', err);
        return NextResponse.json({ error: 'DB insert failed' }, { status: 500 });
      }
      return NextResponse.json({ ok: true, stored: 'supabase' });
    }

    console.log('[CivicReport]', { constituencyId, category, description: description.slice(0, 80), location, submittedAt });
    return NextResponse.json({ ok: true, stored: 'logged' });
  } catch (err) {
    console.error('Report API error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

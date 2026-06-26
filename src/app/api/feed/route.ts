import { NextResponse } from 'next/server';
import { getConstituencyById } from '@/data/constituencies';

export const runtime = 'nodejs';

// ponytail: duplicates ~20 lines of parseXml + supabase fetch from /api/news
// and /api/reports rather than lifting them into a shared lib. Two callers,
// different cache TTLs — not worth the shared module yet.

type FeedKind = 'news' | 'report';
interface FeedItem {
  kind: FeedKind;
  id: string;
  title: string;
  body?: string;
  source: string;
  link?: string;
  acId?: string;
  timestamp: string;
  category?: string;
}

function parseXml(xml: string) {
  const items: { title: string; link: string; source: string; pubDate: string }[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const raw = (tag: string) =>
      block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1]
        ?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .trim() ?? '';

    const title = raw('title');
    const linkMatch = block.match(/<link>(https?[^<]+)<\/link>/)
      || block.match(/href="(https?[^"]+)"/);
    const link = linkMatch?.[1]?.trim() ?? '';
    const source = raw('source');
    const pubDate = raw('pubDate');

    if (title && link) items.push({ title, link, source, pubDate });
  }
  return items;
}

async function fetchNews(acId: string | null): Promise<FeedItem[]> {
  let query = 'West Bengal government 2026';
  if (acId) {
    const c = getConstituencyById(acId);
    if (c) query = `"${c.name}" ${c.district} West Bengal`;
  }
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;

  try {
    const res = await fetch(url, {
      next: { revalidate: 300 },
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WBVotes/1.0)' },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseXml(xml).map(a => {
      const ts = a.pubDate ? new Date(a.pubDate) : null;
      const iso = ts && !isNaN(ts.getTime())
        ? ts.toISOString()
        : '1970-01-01T00:00:00.000Z';
      return {
        kind: 'news' as const,
        id: a.link,
        title: a.title,
        source: a.source || 'Google News',
        link: a.link,
        acId: acId ?? undefined,
        timestamp: iso,
      };
    });
  } catch {
    return [];
  }
}

async function fetchReports(acId: string | null): Promise<FeedItem[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('[PROJECT]')) {
    return [];
  }

  try {
    const filters: string[] = [];
    if (acId) filters.push(`constituency_id=eq.${acId}`);
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
    if (!res.ok) return [];

    const rows: Array<{
      id: string; constituency_id: string; category: string;
      description: string; location?: string; submitted_at: string; status: string;
    }> = await res.json();

    return rows.map(r => ({
      kind: 'report' as const,
      id: r.id,
      title: r.description.slice(0, 80),
      body: r.description,
      source: 'Citizen report',
      link: `/find-rep?ac=${r.constituency_id}`,
      acId: r.constituency_id,
      timestamp: r.submitted_at,
      category: r.category,
    }));
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const acId  = searchParams.get('acId');
  const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit')) || 20));

  const [news, reports] = await Promise.all([fetchNews(acId), fetchReports(acId)]);

  const items = [...news, ...reports]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);

  return NextResponse.json({ items });
}

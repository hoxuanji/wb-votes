import { NextResponse } from 'next/server';
import { getConstituencyById } from '@/data/constituencies';

export const runtime = 'nodejs';

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

function buildQuery(params: {
  acId?: string | null;
  q?: string | null;
  type?: string | null;
  lang: 'en' | 'bn';
}): { query: string; limit: number } {
  // Per-constituency query
  if (params.acId) {
    const c = getConstituencyById(params.acId);
    if (c) {
      const name = params.lang === 'bn' ? c.nameBn : c.name;
      const district = params.lang === 'bn' ? c.districtBn : c.district;
      return { query: `"${name}" ${district} West Bengal`, limit: 10 };
    }
  }
  // Explicit query string
  if (params.q) return { query: params.q, limit: 6 };
  // Type-based defaults for governance phase
  if (params.type === 'governance') {
    return { query: 'West Bengal government cabinet 2026', limit: 8 };
  }
  if (params.type === 'projects') {
    return { query: 'West Bengal development projects schemes 2026', limit: 8 };
  }
  if (params.type === 'assembly') {
    return { query: 'West Bengal assembly session 2026', limit: 6 };
  }
  // Legacy default
  return { query: 'West Bengal government 2026', limit: 6 };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const acId = searchParams.get('acId');
  const q    = searchParams.get('q');
  const type = searchParams.get('type');
  const lang = (searchParams.get('lang') === 'bn' ? 'bn' : 'en') as 'en' | 'bn';

  const { query, limit } = buildQuery({ acId, q, type, lang });

  const hl   = lang === 'bn' ? 'bn'  : 'en-IN';
  const ceid = lang === 'bn' ? 'IN:bn' : 'IN:en';
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${hl}&gl=IN&ceid=${ceid}`;

  try {
    const res = await fetch(url, {
      next: { revalidate: 1800 },
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WBVotes/1.0)' },
    });
    if (!res.ok) return NextResponse.json({ articles: [], query });
    const xml = await res.text();
    const articles = parseXml(xml).slice(0, limit);
    return NextResponse.json({ articles, query });
  } catch {
    return NextResponse.json({ articles: [], query });
  }
}

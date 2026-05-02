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
  lang: 'en' | 'bn';
}): { query: string; limit: number } {
  if (params.acId) {
    const c = getConstituencyById(params.acId);
    if (c) {
      const name = params.lang === 'bn' ? c.nameBn : c.name;
      const district = params.lang === 'bn' ? c.districtBn : c.district;
      return {
        query: `"${name}" ${district} West Bengal`,
        limit: 10,
      };
    }
  }
  return {
    query: params.q || 'West Bengal election 2026',
    limit: 6,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const acId = searchParams.get('acId');
  const q    = searchParams.get('q');
  const lang = (searchParams.get('lang') === 'bn' ? 'bn' : 'en') as 'en' | 'bn';

  const { query, limit } = buildQuery({ acId, q, lang });

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

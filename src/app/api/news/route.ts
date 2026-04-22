import { NextResponse } from 'next/server';

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
    // Google News RSS wraps actual link in <link> as CDATA or after </title>
    const linkMatch = block.match(/<link>(https?[^<]+)<\/link>/)
      || block.match(/href="(https?[^"]+)"/);
    const link = linkMatch?.[1]?.trim() ?? '';
    const source = raw('source');
    const pubDate = raw('pubDate');

    if (title && link) items.push({ title, link, source, pubDate });
  }
  return items;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') ?? 'West Bengal election 2026';
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-IN&gl=IN&ceid=IN:en`;

  try {
    const res = await fetch(url, {
      next: { revalidate: 900 },
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WBVotes/1.0)' },
    });
    if (!res.ok) return NextResponse.json({ articles: [] });
    const xml = await res.text();
    const articles = parseXml(xml).slice(0, 6);
    return NextResponse.json({ articles });
  } catch {
    return NextResponse.json({ articles: [] });
  }
}

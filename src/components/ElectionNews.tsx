'use client';

import { useState, useEffect } from 'react';
import { ExternalLink, Clock, Newspaper } from 'lucide-react';

interface Article {
  title: string;
  link: string;
  source: string;
  pubDate: string;
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function ElectionNews() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/news?q=West+Bengal+election+2026')
      .then(r => r.json())
      .then(data => setArticles(data.articles ?? []))
      .catch(() => setArticles([]))
      .finally(() => setLoaded(true));
  }, []);

  // Skeleton while loading
  if (!loaded) {
    return (
      <section className="border-t border-gray-100 bg-white px-4 py-10">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-gray-300" />
            <div className="h-6 w-40 rounded-lg bg-gray-100 animate-pulse" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="rounded-xl border border-gray-100 bg-white p-4 animate-pulse">
                <div className="space-y-2 mb-3">
                  <div className="h-4 bg-gray-100 rounded w-full" />
                  <div className="h-4 bg-gray-100 rounded w-5/6" />
                  <div className="h-4 bg-gray-100 rounded w-2/3" />
                </div>
                <div className="flex justify-between">
                  <div className="h-3 bg-gray-100 rounded w-1/3" />
                  <div className="h-3 bg-gray-100 rounded w-1/5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (articles.length === 0) return null;

  return (
    <section className="border-t border-gray-100 bg-white px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center gap-2">
          <Newspaper className="h-5 w-5 text-blue-500" />
          <h2 className="text-xl font-bold text-gray-900">Latest Election News</h2>
          <span className="ml-auto text-xs text-gray-400">via Google News</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((a, i) => (
            <a
              key={i}
              href={a.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-blue-200 hover:shadow-md"
            >
              <p className="flex-1 text-sm font-semibold text-gray-800 group-hover:text-blue-700 leading-snug line-clamp-3">
                {a.title}
              </p>
              <div className="mt-3 flex items-center justify-between text-[11px] text-gray-400">
                <span className="font-medium text-gray-500 truncate max-w-[60%]">{a.source}</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" />
                  {timeAgo(a.pubDate)}
                  <ExternalLink className="ml-1 h-2.5 w-2.5 text-blue-300 group-hover:text-blue-500" />
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

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
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
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
      <section className="border-t border-white/10 px-4 py-10">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-gray-600" />
            <div className="h-6 w-40 rounded-lg bg-white/10 animate-pulse" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-4 animate-pulse">
                <div className="space-y-2 mb-3">
                  <div className="h-4 bg-white/10 rounded w-full" />
                  <div className="h-4 bg-white/10 rounded w-5/6" />
                  <div className="h-4 bg-white/10 rounded w-2/3" />
                </div>
                <div className="flex justify-between">
                  <div className="h-3 bg-white/10 rounded w-1/3" />
                  <div className="h-3 bg-white/10 rounded w-1/5" />
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
    <section className="border-t border-white/10 px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center gap-2">
          <Newspaper className="h-5 w-5 text-blue-400" />
          <h2 className="text-xl font-bold text-white">Latest Election News</h2>
          <span className="ml-auto text-xs text-gray-500">via Google News</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((a, i) => (
            <a
              key={i}
              href={a.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition-all hover:border-blue-500/40 hover:bg-white/10 hover:shadow-lg hover:shadow-black/30"
            >
              <p className="flex-1 text-sm font-semibold text-gray-200 group-hover:text-blue-300 leading-snug line-clamp-3">
                {a.title}
              </p>
              <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-gray-500">
                <span className="font-medium text-gray-400 truncate">{a.source}</span>
                <span className="flex shrink-0 items-center gap-1">
                  <Clock className="h-2.5 w-2.5" />
                  <span>{timeAgo(a.pubDate)}</span>
                  {formatDate(a.pubDate) && (
                    <span className="text-gray-600">· {formatDate(a.pubDate)}</span>
                  )}
                  <ExternalLink className="ml-0.5 h-2.5 w-2.5 text-blue-500 group-hover:text-blue-400" />
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

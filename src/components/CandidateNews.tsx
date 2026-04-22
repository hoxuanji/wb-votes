'use client';

import { useState, useEffect } from 'react';
import { Newspaper, ExternalLink, Clock } from 'lucide-react';

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

export function CandidateNews({ name }: { name: string }) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = `${name} West Bengal election 2026`;
    fetch(`/api/news?q=${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then(data => setArticles(data.articles ?? []))
      .catch(() => setArticles([]))
      .finally(() => setLoading(false));
  }, [name]);

  if (loading) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3 flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700">Latest News</h2>
        </div>
        <div className="p-4 space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-gray-100 rounded w-3/4 mb-1" />
              <div className="h-3 bg-gray-100 rounded w-1/3" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (articles.length === 0) return null;

  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-3 flex items-center gap-2">
        <Newspaper className="h-4 w-4 text-blue-500" />
        <h2 className="text-sm font-semibold text-gray-700">Latest News</h2>
        <span className="ml-auto text-[10px] text-gray-400">via Google News</span>
      </div>
      <div className="divide-y divide-gray-50">
        {articles.map((a, i) => (
          <a
            key={i}
            href={a.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-blue-50 group"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-800 group-hover:text-blue-700 line-clamp-2 leading-snug">
                {a.title}
              </p>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400">
                {a.source && <span className="font-medium text-gray-500">{a.source}</span>}
                {a.pubDate && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-0.5">
                      <Clock className="h-2.5 w-2.5" />
                      {timeAgo(a.pubDate)}
                    </span>
                  </>
                )}
              </div>
            </div>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-gray-300 group-hover:text-blue-400 mt-0.5" />
          </a>
        ))}
      </div>
    </section>
  );
}

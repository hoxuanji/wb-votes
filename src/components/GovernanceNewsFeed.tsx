'use client';

import { useState, useEffect } from 'react';
import { ExternalLink, Clock } from 'lucide-react';
import { timeAgo } from '@/lib/utils';

interface Article {
  title: string;
  link: string;
  source: string;
  pubDate: string;
}

interface Props {
  /** Override the query type. Defaults to 'projects'. */
  type?: 'projects' | 'governance' | 'assembly';
  /** Custom query string — overrides type. */
  q?: string;
  title?: string;
  limit?: number;
}

export function GovernanceNewsFeed({ type = 'projects', q, title = 'Latest from West Bengal', limit = 6 }: Props) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    else params.set('type', type);
    params.set('limit', String(limit));

    fetch(`/api/news?${params.toString()}`)
      .then(r => r.json())
      .then(data => setArticles(data.articles ?? []))
      .catch(() => setArticles([]))
      .finally(() => setLoaded(true));
  }, [type, q, limit]);

  if (!loaded) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="space-y-2 mb-3">
              <div className="h-4 rounded bg-white/10 w-full" />
              <div className="h-4 rounded bg-white/10 w-5/6" />
              <div className="h-4 rounded bg-white/10 w-2/3" />
            </div>
            <div className="flex justify-between">
              <div className="h-3 rounded bg-white/10 w-1/3" />
              <div className="h-3 rounded bg-white/10 w-1/5" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (articles.length === 0) return null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-white">{title}</h3>
        <span className="text-xs text-gray-500">via Google News · refreshes every 30 min</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {articles.map((a, i) => (
          <a
            key={i}
            href={a.link}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col rounded-xl border border-white/10 bg-white/5 p-4 transition-all hover:border-blue-500/40 hover:bg-white/10"
          >
            <p className="flex-1 text-sm font-medium leading-snug line-clamp-3 text-gray-200 group-hover:text-blue-300">
              {a.title}
            </p>
            <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-gray-500">
              <span className="truncate font-medium text-gray-400">{a.source}</span>
              <span className="flex shrink-0 items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {timeAgo(a.pubDate)}
                <ExternalLink className="ml-0.5 h-2.5 w-2.5 text-blue-500 group-hover:text-blue-400" />
              </span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

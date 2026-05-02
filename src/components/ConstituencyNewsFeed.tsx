'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Clock, Newspaper, Info } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';

interface Article {
  title: string;
  link: string;
  source: string;
  pubDate: string;
}

interface ConstituencyNewsFeedProps {
  constituencyId: string;
  className?: string;
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

export function ConstituencyNewsFeed({ constituencyId, className = '' }: ConstituencyNewsFeedProps) {
  const { lang } = useLanguage();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    fetch(`/api/news?acId=${encodeURIComponent(constituencyId)}&lang=${lang}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        setArticles(data.articles ?? []);
        setQuery(data.query ?? '');
      })
      .catch(() => { if (!cancelled) setArticles([]); })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [constituencyId, lang]);

  return (
    <div className={`rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Newspaper className="h-4 w-4 text-blue-400" />
          Constituency News
        </h3>
        <span className="text-xs text-gray-500">
          via Google News · {lang === 'bn' ? 'Bangla' : 'English'}
        </span>
      </div>

      {!loaded && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      )}

      {loaded && articles.length === 0 && (
        <div className="rounded-lg border border-dashed border-white/10 py-8 text-center">
          <Info className="mx-auto mb-2 h-6 w-6 text-gray-500" />
          <p className="text-sm text-gray-400">No recent news found for this constituency.</p>
          {query && <p className="mt-1 text-xs text-gray-600">Search: {query}</p>}
        </div>
      )}

      {loaded && articles.length > 0 && (
        <ul className="divide-y divide-white/5">
          {articles.map((a, i) => (
            <li key={i}>
              <a
                href={a.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col gap-1 rounded-md px-2 py-3 -mx-2 transition-colors hover:bg-white/5"
              >
                <p className="text-sm font-medium text-gray-200 group-hover:text-blue-300 leading-snug line-clamp-2">
                  {a.title}
                </p>
                <div className="flex items-center gap-2 text-[11px] text-gray-500">
                  <span className="truncate font-medium text-gray-400">{a.source || 'Unknown source'}</span>
                  {a.pubDate && (
                    <>
                      <span>·</span>
                      <span className="flex shrink-0 items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        {timeAgo(a.pubDate)}
                      </span>
                    </>
                  )}
                  <ExternalLink className="ml-auto h-3 w-3 text-blue-500/60 group-hover:text-blue-400" />
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

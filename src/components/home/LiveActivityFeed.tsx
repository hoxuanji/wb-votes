'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Newspaper, MessageSquareWarning, Clock, ExternalLink, ArrowRight } from 'lucide-react';
import { timeAgo } from '@/lib/utils';

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

interface Props {
  acId?: string;
  limit?: number;
  title?: string;
  className?: string;
}

export function LiveActivityFeed({ acId, limit = 20, title = 'Today in West Bengal', className = '' }: Props) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (acId) params.set('acId', acId);
    params.set('limit', String(limit));

    fetch(`/api/feed?${params.toString()}`)
      .then(r => r.json())
      .then(data => setItems(data.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoaded(true));
  }, [acId, limit]);

  return (
    <div className={`mx-auto w-full max-w-2xl ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <span className="text-xs text-gray-500">Refreshes every 5 min</span>
      </div>

      {!loaded ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="space-y-2 mb-3">
                <div className="h-4 rounded bg-white/10 w-full" />
                <div className="h-4 rounded bg-white/10 w-4/5" />
              </div>
              <div className="flex justify-between">
                <div className="h-3 rounded bg-white/10 w-1/3" />
                <div className="h-3 rounded bg-white/10 w-1/5" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center">
          <p className="mb-1 text-sm font-semibold text-white">
            Nothing new yet today — be the first to flag something.
          </p>
          <p className="mb-4 text-xs text-gray-400">
            Civic reports and verified news will appear here as they come in.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/find-rep"
              className="inline-flex min-h-12 items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
            >
              <MessageSquareWarning className="h-4 w-4" />
              File a civic report
            </Link>
            <Link
              href="/#news"
              className="inline-flex min-h-12 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-gray-200 transition hover:border-blue-500/40 hover:bg-white/10"
            >
              Read all news
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map(item => (
            <li key={`${item.kind}-${item.id}`}>
              {item.kind === 'news' ? (
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex min-h-12 flex-col rounded-xl border border-white/10 bg-white/5 p-4 transition-all hover:border-blue-500/40 hover:bg-white/10"
                >
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-blue-400">
                    <Newspaper className="h-3 w-3" />
                    News
                  </div>
                  <p className="flex-1 text-sm font-medium leading-snug text-gray-100 line-clamp-3 group-hover:text-blue-300">
                    {item.title}
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-gray-500">
                    <span className="truncate font-medium text-gray-400">{item.source}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      {timeAgo(item.timestamp)}
                      <ExternalLink className="ml-0.5 h-2.5 w-2.5 text-blue-500 group-hover:text-blue-400" />
                    </span>
                  </div>
                </a>
              ) : (
                <Link
                  href={item.link ?? '/find-rep'}
                  className="group flex min-h-12 flex-col rounded-xl border border-white/10 bg-white/5 p-4 transition-all hover:border-amber-500/40 hover:bg-white/10"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                      <MessageSquareWarning className="h-3 w-3" />
                      Citizen report
                    </span>
                    {item.category && (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-gray-300">
                        {item.category}
                      </span>
                    )}
                  </div>
                  <p className="flex-1 text-sm font-medium leading-snug text-gray-100 line-clamp-3 group-hover:text-amber-200">
                    {item.title}
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-gray-500">
                    <span className="truncate font-medium text-gray-400">{item.source}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      {timeAgo(item.timestamp)}
                      <ArrowRight className="ml-0.5 h-2.5 w-2.5 text-amber-400 group-hover:text-amber-300" />
                    </span>
                  </div>
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

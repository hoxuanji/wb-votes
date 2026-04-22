'use client';

import { useState, useEffect, useCallback } from 'react';

export interface RecentConstituency {
  id: string;
  name: string;
  district: string;
}

const STORAGE_KEY = 'wb_recent_constituencies';
const MAX_RECENT = 3;

export function useRecentSearch() {
  const [recent, setRecent] = useState<RecentConstituency[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setRecent(JSON.parse(stored) as RecentConstituency[]);
    } catch {}
  }, []);

  const addRecent = useCallback((entry: RecentConstituency) => {
    setRecent(prev => {
      const deduped = prev.filter(r => r.id !== entry.id);
      const next = [entry, ...deduped].slice(0, MAX_RECENT);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const clearRecent = useCallback(() => {
    setRecent([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }, []);

  return { recent, addRecent, clearRecent };
}
